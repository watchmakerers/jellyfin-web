import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import React, { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApi } from 'hooks/useApi';
import { ServerConnections } from 'lib/jellyfin-apiclient';

import { imageUrl, isSquare, type StartData, useStartData, viewFor } from '../api';
import { Placeholder, Screen } from '../components/Chrome';
import { clamp, useRemote } from '../hooks/useRemote';
import { galleryPath } from './gallery';

type Action =
    | { kind: 'item', item: BaseItemDto }
    | { kind: 'library', view: BaseItemDto }
    | { kind: 'route', to: string }
    | { kind: 'signout' };

interface Tile {
    caption: string
    action: Action
    /** Covers shown along the bottom of the focused glass tile. */
    covers: BaseItemDto[]
}

interface Row {
    label: string
    tiles: Tile[]
}

const tileKey = (tile: Tile) => {
    const a = tile.action;
    if (a.kind === 'item') return `item-${a.item.Id}`;
    if (a.kind === 'library') return `library-${a.view.Id}`;
    return `${a.kind}-${tile.caption}`;
};

/**
 * Recently added TV: the server may hand back a single new episode or season. The tile stands for
 * the show, so it opens the series page (which lands on the next unwatched episode) rather than
 * the newest episode (jellyfin-web#8496).
 */
const showTile = (item: BaseItemDto): Tile => {
    if ((item.Type === BaseItemKind.Episode || item.Type === BaseItemKind.Season) && item.SeriesId) {
        const series: BaseItemDto = { ...item, Id: item.SeriesId, Type: BaseItemKind.Series, Name: item.SeriesName };
        return { caption: item.SeriesName ?? item.Name ?? '', action: { kind: 'item', item: series }, covers: [ item ] };
    }
    return itemTile(item);
};

const itemTile = (item: BaseItemDto): Tile => ({
    caption: (item.Type === BaseItemKind.Episode ? item.SeriesName : null) ?? item.Name ?? '',
    action: { kind: 'item', item },
    covers: [ item ]
});

const unique = (items: BaseItemDto[]) => {
    const seen = new Set<string>();
    return items.filter(i => {
        const key = (i.Type === BaseItemKind.Episode ? i.SeriesId : null) ?? i.Id ?? '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

function buildRows(data: StartData | undefined, isAdmin: boolean): Row[] {
    const views = data?.views ?? [];
    const rows: Row[] = [];
    const libraryTile = (view: BaseItemDto | undefined, caption: string, covers: BaseItemDto[] = []): Tile[] =>
        view ? [ { caption, action: { kind: 'library', view }, covers } ] : [];

    rows.push({
        label: 'library',
        tiles: views.map(v => ({ caption: (v.Name ?? '').toLowerCase(), action: { kind: 'library', view: v }, covers: [ v ] }))
    });

    const shows = viewFor(views, CollectionType.Tvshows);
    if (shows) {
        const episodes = unique([
            ...(data?.resume ?? []).filter(i => i.Type === BaseItemKind.Episode),
            ...(data?.nextUp ?? [])
        ]);
        rows.push({
            label: 'tv',
            tiles: [
                ...libraryTile(shows, 'tv library', data?.latestShows),
                ...episodes.map(itemTile),
                ...(data?.latestShows ?? []).slice(0, 8).map(showTile)
            ]
        });
    }

    const movies = viewFor(views, CollectionType.Movies);
    if (movies) {
        rows.push({
            label: 'movies',
            tiles: [
                ...libraryTile(movies, 'movie library', data?.latestMovies),
                ...(data?.resume ?? []).filter(i => i.Type === BaseItemKind.Movie).map(itemTile),
                ...(data?.latestMovies ?? []).slice(0, 8).map(itemTile)
            ]
        });
    }

    const music = viewFor(views, CollectionType.Music);
    if (music) {
        rows.push({
            label: 'music',
            tiles: [
                ...libraryTile(music, 'music library', data?.latestMusic),
                ...(data?.latestMusic ?? []).slice(0, 10).map(itemTile)
            ]
        });
    }

    const pictures = viewFor(views, CollectionType.Homevideos);
    if (pictures) {
        rows.push({ label: 'pictures', tiles: libraryTile(pictures, 'picture library') });
    }

    rows.push({
        label: 'tasks',
        tiles: [
            { caption: 'search', action: { kind: 'route', to: '/search' }, covers: [] },
            { caption: 'settings', action: { kind: 'route', to: '/mypreferencesmenu' }, covers: [] },
            ...(isAdmin ? [ { caption: 'dashboard', action: { kind: 'route' as const, to: '/dashboard' }, covers: [] } ] : []),
            { caption: 'sign out', action: { kind: 'signout' }, covers: [] }
        ]
    });

    // The same item can be both "resume" and "recently added": show it once.
    return rows
        .map(r => ({ ...r, tiles: r.tiles.filter((t, i, all) => all.findIndex(o => tileKey(o) === tileKey(t)) === i) }))
        .filter(r => r.tiles.length);
}

// Layout, in % of screen height (vh) / width (vw), measured from the desktop app.
const FOCUS_Y = 42.6;
const STEP = 9.3;
const TILE_H = 21.7;
const X0 = 34.5;
const TILE_W = 24.6;
const SLOT = 14;

/** Covers fade out to the right: the last two are dimmed. */
function coverOpacity(k: number, n: number) {
    if (n < 3 || k < n - 2) return 1;
    return k === n - 2 ? 0.55 : 0.25;
}

function rowFade(off: number) {
    if (off === 0) return 1;
    return Math.abs(off) < 2 ? 0.9 : 0.45;
}

const GlassTile: FC<{ tile: Tile, focused: boolean, onClick: () => void }> = ({ tile, focused, onClick }) => {
    const { api } = useApi();
    const covers = tile.covers.slice(0, 5);
    return (
        <button type='button' className={`halcyon-tile ${focused ? 'is-focused' : ''}`} onClick={onClick} tabIndex={-1}>
            <span className='halcyon-tile-caption'>{tile.caption}</span>
            <span className='halcyon-tile-covers'>
                {covers.length ? covers.map((c, k) => {
                    const src = imageUrl(api, c, 'poster', 240);
                    return src ? (
                        <img
                            key={c.Id}
                            src={src}
                            alt=''
                            loading='lazy'
                            className={isSquare(c) ? 'is-square' : ''}
                            style={{ opacity: coverOpacity(k, covers.length) }}
                        />
                    ) : <span key={c.Id} className='halcyon-cover-blank' />;
                }) : <Placeholder />}
            </span>
        </button>
    );
};

function loadPosition(): { menu: number, tiles: number[] } {
    try {
        const saved = JSON.parse(sessionStorage.getItem('halcyon-start') ?? 'null') as { menu: number, tiles: number[] } | null;
        if (saved) return saved;
    } catch {
        // private mode or junk: start fresh
    }
    return { menu: 1, tiles: [] };
}

const Home: FC = () => {
    const navigate = useNavigate();
    const { user } = useApi();
    const { data, isPending, error } = useStartData();
    const rows = useMemo(() => buildRows(data, !!user?.Policy?.IsAdministrator), [ data, user ]);

    // Remember where the user was when coming back from a details page.
    const saved = useRef<{ menu: number, tiles: number[] }>(loadPosition());
    const [ menu, setMenu ] = useState(saved.current.menu);
    const [ tiles, setTiles ] = useState<number[]>(saved.current.tiles);
    const [ intro, setIntro ] = useState(false);

    useEffect(() => {
        const t = requestAnimationFrame(() => setIntro(true));
        return () => cancelAnimationFrame(t);
    }, []);

    const m = clamp(menu, rows.length);
    const tileOf = useCallback((i: number) => clamp(tiles[i] ?? 0, rows[i]?.tiles.length ?? 0), [ rows, tiles ]);

    useEffect(() => {
        try {
            sessionStorage.setItem('halcyon-start', JSON.stringify({ menu: m, tiles }));
        } catch {
            // private mode: just forget the position
        }
    }, [ m, tiles ]);

    const activate = useCallback((tile: Tile) => {
        const a = tile.action;
        switch (a.kind) {
            case 'item':
                navigate(`/details?id=${a.item.Id}`);
                break;
            case 'library':
                navigate(galleryPath(a.view));
                break;
            case 'route':
                navigate(a.to);
                break;
            case 'signout':
                ServerConnections.logout().then(() => navigate('/login')).catch(console.error);
                break;
        }
    }, [ navigate ]);

    const setTile = (row: number, value: number) =>
        setTiles(t => {
            const next = [ ...t ];
            next[row] = clamp(value, rows[row]?.tiles.length ?? 0);
            return next;
        });

    useRemote(key => {
        if (!rows.length) return false;
        switch (key) {
            case 'up':
                setMenu(clamp(m - 1, rows.length));
                break;
            case 'down':
                setMenu(clamp(m + 1, rows.length));
                break;
            case 'left':
                setTile(m, tileOf(m) - 1);
                break;
            case 'right':
                setTile(m, tileOf(m) + 1);
                break;
            case 'ok': {
                const tile = rows[m].tiles[tileOf(m)];
                if (tile) activate(tile);
                break;
            }
            case 'back': return true; // already home; swallow so the browser doesn't leave the app
            default:
                return false;
        }
    });

    const wheel = useRef(0);
    const onWheel = (e: React.WheelEvent) => {
        const now = Date.now();
        if (now - wheel.current < 120) return;
        wheel.current = now;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) setTile(m, tileOf(m) + Math.sign(e.deltaX));
        else setMenu(clamp(m + Math.sign(e.deltaY), rows.length));
    };

    let status: string | undefined;
    if (error) status = `Couldn't load your library: ${(error as Error).message}`;
    else if (isPending) status = 'Loading your library…';

    return (
        <Screen canGoBack={false} status={status}>
            <div className={`halcyon-start ${intro ? 'is-in' : ''}`} onWheel={onWheel}>
                <div className='halcyon-start-word'>start</div>
                {rows.map((row, i) => {
                    const off = i - m;
                    const y = FOCUS_Y + off * STEP + Math.max(0, Math.min(1, off)) * (TILE_H + 2.5);
                    const fade = rowFade(off);
                    return (
                        <React.Fragment key={row.label}>
                            <button
                                type='button'
                                tabIndex={-1}
                                className={`halcyon-menu-label ${off === 0 ? 'is-focused' : ''}`}
                                style={{
                                    top: `${y}vh`,
                                    left: `${X0}vw`,
                                    opacity: Math.abs(off) > 4 ? 0 : fade,
                                    transitionDelay: intro ? undefined : `${Math.abs(off) * 60}ms`
                                }}
                                onClick={() => (off === 0 ? undefined : setMenu(i))}
                            >
                                {row.label === 'tv' ? 'TV' : row.label.replace(/^\w/, c => c.toUpperCase())}
                            </button>
                            {off === 0 && (
                                <div className='halcyon-strip' style={{ top: `${y + 3.5}vh`, height: `${TILE_H}vh` }}>
                                    {row.tiles.map((tile, j) => {
                                        const rel = j - tileOf(i);
                                        let x: number;
                                        if (rel < 0) x = X0 + rel * SLOT - 2;
                                        else if (rel === 0) x = X0;
                                        else x = X0 + TILE_W + 10 + (rel - 1) * SLOT;
                                        if (x > 110 || x < -SLOT - 5) return null;
                                        const focused = rel === 0;
                                        return (
                                            <div
                                                key={tileKey(tile)}
                                                className='halcyon-strip-slot'
                                                style={{ left: `${x}vw`, width: `${focused ? TILE_W : SLOT - 1.5}vw` }}
                                            >
                                                {focused ? (
                                                    <GlassTile tile={tile} focused onClick={() => activate(tile)} />
                                                ) : (
                                                    <SideTile tile={tile} onClick={() => setTile(i, j)} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </Screen>
    );
};

const SideTile: FC<{ tile: Tile, onClick: () => void }> = ({ tile, onClick }) => {
    const { api } = useApi();
    const item = tile.action.kind === 'item' ? tile.action.item : undefined;
    const src = item && imageUrl(api, item, 'poster', 240);
    return (
        <button type='button' tabIndex={-1} className='halcyon-side-tile' onClick={onClick}>
            <span className='halcyon-side-caption'>{tile.caption.toLowerCase()}</span>
            <span className='halcyon-side-art'>
                {src ? <img src={src} alt='' loading='lazy' className={isSquare(item) ? 'is-square' : ''} /> : <Placeholder />}
            </span>
        </button>
    );
};

export default Home;
