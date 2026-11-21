import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { useQuery } from '@tanstack/react-query';
import React, { type FC, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { imageUrl, ticksToMinutes, useEpisodes, useItem, useSeasons, useUserDataToggle } from '../api';
import { Placeholder, Screen } from '../components/Chrome';
import { clamp, useRemote } from '../hooks/useRemote';
import { canResume, playItem } from '../playback';
import { metaLine } from './gallery';

const clock = (ticks?: number | null) => {
    const s = Math.floor((ticks ?? 0) / 10000000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};

interface Button { label: string, run: () => void }

/** Movie / episode / video: art, overview and the stacked Media Center buttons. */
const ItemDetails: FC<{ item: BaseItemDto }> = ({ item }) => {
    const { api } = useApi();
    const navigate = useNavigate();
    const toggle = useUserDataToggle();
    const [ focus, setFocus ] = useState(0);
    const episode = item.Type === BaseItemKind.Episode;

    const buttons: Button[] = [
        ...(canResume(item) ? [ { label: `resume (${clock(item.UserData?.PlaybackPositionTicks)})`, run: () => playItem(item, { resume: true }) } ] : []),
        { label: canResume(item) ? 'play from beginning' : 'play', run: () => playItem(item) },
        { label: item.UserData?.Played ? 'mark unwatched' : 'mark watched', run: () => toggle.mutate({ item, what: 'played' }) },
        { label: item.UserData?.IsFavorite ? 'remove favorite' : 'add favorite', run: () => toggle.mutate({ item, what: 'favorite' }) },
        ...(episode && item.SeriesId ? [ { label: 'all episodes', run: () => navigate(`/details?id=${item.SeriesId}&season=${item.SeasonId ?? ''}`) } ] : [])
    ];
    const f = clamp(focus, buttons.length);

    useRemote(key => {
        switch (key) {
            case 'up':
                setFocus(clamp(f - 1, buttons.length));
                break;
            case 'down':
                setFocus(clamp(f + 1, buttons.length));
                break;
            case 'ok':
                buttons[f]?.run();
                break;
            case 'play':
                playItem(item, { resume: canResume(item) });
                break;
            case 'back':
                navigate(-1);
                break;
            default:
                return false;
        }
    });

    const art = imageUrl(api, item, episode ? 'thumb' : 'poster', 700);
    return (
        <Screen art={imageUrl(api, item, 'backdrop', 1080)}>
            <div className={`halcyon-details ${episode ? 'is-wide' : ''}`}>
                <div className='halcyon-details-art'>{art ? <img src={art} alt='' /> : <Placeholder />}</div>
                <div className='halcyon-details-body'>
                    {episode && (
                        <div className='halcyon-sup'>
                            {item.SeriesName} · season {item.ParentIndexNumber ?? '?'}, episode {item.IndexNumber ?? '?'}
                        </div>
                    )}
                    <h1 className='halcyon-title halcyon-glow'>{item.Name}</h1>
                    <div className='halcyon-meta'>{metaLine(item)}</div>
                    <p className='halcyon-overview'>{item.Overview}</p>
                    <div className='halcyon-buttons'>
                        {buttons.map((b, i) => (
                            <button
                                key={b.label}
                                type='button'
                                tabIndex={-1}
                                className={`halcyon-button ${i === f ? 'is-focused' : ''}`}
                                onClick={() => {
                                    setFocus(i);
                                    b.run();
                                }}
                            >{b.label}</button>
                        ))}
                    </div>
                </div>
            </div>
        </Screen>
    );
};

/** A series: seasons across the top (pivot), episodes listed underneath. */
const SeriesDetails: FC<{ series: BaseItemDto, initialSeason?: string | null }> = ({ series, initialSeason }) => {
    const { api } = useApi();
    const navigate = useNavigate();
    const { data: seasons } = useSeasons(series.Id);
    const [ season, setSeason ] = useState<number | null>(null);
    const s = season ?? Math.max(0, seasons?.findIndex(x => x.Id === initialSeason) ?? 0);
    const seasonItem = seasons?.[clamp(s, seasons.length)];
    const { data: episodes, isPending } = useEpisodes(series.Id, seasonItem?.Id);
    const [ ep, setEp ] = useState<number | null>(null);

    // Start on the first unwatched episode of the season.
    const firstUnwatched = useMemo(() => Math.max(0, episodes?.findIndex(e => !e.UserData?.Played) ?? 0), [ episodes ]);
    const e = clamp(ep ?? firstUnwatched, episodes?.length ?? 0);
    useEffect(() => setEp(null), [ seasonItem?.Id ]);

    const VISIBLE = 8;
    const scroll = Math.max(0, Math.min(e - Math.floor(VISIBLE / 2), (episodes?.length ?? 0) - VISIBLE));

    useRemote(key => {
        const n = episodes?.length ?? 0;
        switch (key) {
            case 'left':
                setSeason(clamp(s - 1, seasons?.length ?? 0));
                break;
            case 'right':
                setSeason(clamp(s + 1, seasons?.length ?? 0));
                break;
            case 'up':
                setEp(clamp(e - 1, n));
                break;
            case 'down':
                setEp(clamp(e + 1, n));
                break;
            case 'pageUp':
                setEp(clamp(e - VISIBLE, n));
                break;
            case 'pageDown':
                setEp(clamp(e + VISIBLE, n));
                break;
            case 'ok':
                if (episodes?.[e]) navigate(`/details?id=${episodes[e].Id}`);
                break;
            case 'play':
                if (episodes?.[e]) playItem(episodes[e], { resume: canResume(episodes[e]) });
                break;
            case 'back':
                navigate(-1);
                break;
            default:
                return false;
        }
    });

    const poster = imageUrl(api, series, 'poster', 700);
    const current = episodes?.[e];
    return (
        <Screen art={imageUrl(api, series, 'backdrop', 1080)}>
            <div className='halcyon-series'>
                <h1 className='halcyon-title halcyon-glow'>{series.Name}</h1>
                <div className='halcyon-series-poster'>{poster ? <img src={poster} alt='' /> : <Placeholder />}</div>
                <div className='halcyon-series-body'>
                    <nav className='halcyon-pivots is-large'>
                        {(seasons ?? []).map((se, i) => (
                            <button
                                key={se.Id}
                                type='button'
                                tabIndex={-1}
                                className={i === s ? 'is-on' : ''}
                                onClick={() => setSeason(i)}
                            >{(se.Name ?? '').toLowerCase()}</button>
                        ))}
                    </nav>
                    {!episodes?.length ? <p className='halcyon-empty'>{isPending ? 'Loading…' : 'No episodes.'}</p> : (
                        <>
                            <ol className='halcyon-list' style={{ '--scroll': scroll } as React.CSSProperties}>
                                {episodes.map((x, i) => (
                                    <li key={x.Id}>
                                        <button
                                            type='button'
                                            tabIndex={-1}
                                            className={i === e ? 'is-focused' : ''}
                                            onClick={() => (i === e ? navigate(`/details?id=${x.Id}`) : setEp(i))}
                                        >
                                            <span className='halcyon-dim'>{x.IndexNumber != null ? `${x.IndexNumber}.` : ''}</span>
                                            <span className='halcyon-list-title'>{x.Name}</span>
                                            <span className='halcyon-dim'>
                                                {x.UserData?.Played ? '✓  ' : ''}
                                                {ticksToMinutes(x.RunTimeTicks) ? `${ticksToMinutes(x.RunTimeTicks)} min` : ''}
                                            </span>
                                            {canResume(x) && !!x.UserData?.PlayedPercentage && (
                                                <span className='halcyon-progress' style={{ width: `${x.UserData.PlayedPercentage}%` }} />
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ol>
                            {current?.Overview && <p className='halcyon-overview is-small'>{current.Overview}</p>}
                        </>
                    )}
                </div>
            </div>
        </Screen>
    );
};

/** An album: cover, track list; Enter plays from the focused track. */
const AlbumDetails: FC<{ album: BaseItemDto }> = ({ album }) => {
    const { api, user } = useApi();
    const navigate = useNavigate();
    const { data: tracks } = useQuery({
        queryKey: [ 'halcyon', 'tracks', album.Id ],
        queryFn: async () => (await getLibraryApi(api!).getItems({
            userId: user!.Id!, parentId: album.Id!, sortBy: [ 'ParentIndexNumber', 'IndexNumber', 'SortName' ] as never
        })).data.Items ?? [],
        enabled: !!api && !!user?.Id
    });
    const [ t, setT ] = useState(0);
    const n = tracks?.length ?? 0;
    const VISIBLE = 9;
    const scroll = Math.max(0, Math.min(t - Math.floor(VISIBLE / 2), n - VISIBLE));

    useRemote(key => {
        switch (key) {
            case 'up':
                setT(clamp(t - 1, n));
                break;
            case 'down':
                setT(clamp(t + 1, n));
                break;
            case 'ok':
                if (tracks?.length) playItem(tracks[t], { items: tracks, startIndex: t });
                break;
            case 'play':
                if (tracks?.length) playItem(tracks[0], { items: tracks });
                break;
            case 'back':
                navigate(-1);
                break;
            default:
                return false;
        }
    });

    const cover = imageUrl(api, album, 'poster', 700);
    return (
        <Screen>
            <div className='halcyon-series is-album'>
                <h1 className='halcyon-title halcyon-glow'>{album.Name}</h1>
                <div className='halcyon-meta'>{[ album.AlbumArtist, album.ProductionYear ].filter(Boolean).join(' · ')}</div>
                <div className='halcyon-series-poster is-square'>{cover ? <img src={cover} alt='' /> : <Placeholder />}</div>
                <div className='halcyon-series-body'>
                    <ol className='halcyon-list' style={{ '--scroll': scroll } as React.CSSProperties}>
                        {(tracks ?? []).map((x, i) => (
                            <li key={x.Id}>
                                <button
                                    type='button'
                                    tabIndex={-1}
                                    className={i === t ? 'is-focused' : ''}
                                    onClick={() => (i === t ? playItem(x, { items: tracks, startIndex: i }) : setT(i))}
                                >
                                    <span className='halcyon-dim'>{x.IndexNumber != null ? `${x.IndexNumber}.` : ''}</span>
                                    <span className='halcyon-list-title'>{x.Name}</span>
                                    <span className='halcyon-dim'>{clock(x.RunTimeTicks)}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                </div>
            </div>
        </Screen>
    );
};

const Details: FC = () => {
    const [ params ] = useSearchParams();
    const { data: item, error } = useItem(params.get('id'));
    const navigate = useNavigate();

    useRemote(key => {
        if (item) return false;
        if (key === 'back') navigate(-1);
    });

    if (!item) {
        return <Screen status={error ? `Couldn't load this item: ${(error as Error).message}` : 'Loading…'} />;
    }
    switch (item.Type) {
        case BaseItemKind.Series:
            return <SeriesDetails series={item} initialSeason={params.get('season')} />;
        case BaseItemKind.Season:
            return <SeriesDetails series={{ ...item, Id: item.SeriesId ?? undefined, Name: item.SeriesName }} initialSeason={item.Id} />;
        case BaseItemKind.MusicAlbum:
            return <AlbumDetails album={item} />;
        default:
            return <ItemDetails item={item} />;
    }
};

export default Details;
