import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import React, { type FC, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useApi } from 'hooks/useApi';

import { imageUrl, isSquare, ticksToMinutes, useGallery } from '../api';
import { Placeholder, Screen } from '../components/Chrome';
import { clamp, type RemoteKey, useRemote } from '../hooks/useRemote';
import { playItem } from '../playback';

export const galleryPath = (view: BaseItemDto) =>
    `/gallery?parentId=${view.Id}&type=${view.CollectionType ?? ''}&title=${encodeURIComponent(view.Name ?? '')}`;

type Pivot = { label: string, sort: (a: BaseItemDto, b: BaseItemDto) => number, group?: (i: BaseItemDto) => string };

const byName = (a: BaseItemDto, b: BaseItemDto) =>
    (a.SortName ?? a.Name ?? '').localeCompare(b.SortName ?? b.Name ?? '');
const genre = (i: BaseItemDto) => (i.Genres?.[0] ?? 'other').toLowerCase();

const PIVOTS: Pivot[] = [
    { label: 'title', sort: byName },
    { label: 'genre', sort: (a, b) => genre(a).localeCompare(genre(b)) || byName(a, b), group: genre },
    { label: 'year', sort: (a, b) => (b.ProductionYear ?? 0) - (a.ProductionYear ?? 0) || byName(a, b), group: i => String(i.ProductionYear ?? '—') },
    { label: 'date added', sort: (a, b) => (b.DateCreated ?? '').localeCompare(a.DateCreated ?? '') }
];

// Grid metrics (vh), from the desktop app: 19vh covers with a 1.8vh gap, two or three rows.
const COVER_H = 19;
const GAP = 1.8;
/** Top of the grid inside the gallery, leaving room for group labels (genre/year) under the pivots. */
const GRID_TOP = 18;

function useRowsThatFit() {
    const calc = () => Math.max(2, Math.floor((window.innerHeight * 0.6) / (window.innerHeight * (COVER_H + GAP) / 100)));
    const [ rows, setRows ] = useState(calc);
    useEffect(() => {
        const onResize = () => setRows(calc());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    return rows;
}

export function metaLine(it: BaseItemDto) {
    return [
        it.ProductionYear,
        it.OfficialRating,
        ticksToMinutes(it.RunTimeTicks) ? `${ticksToMinutes(it.RunTimeTicks)} min` : '',
        (it.Genres ?? []).slice(0, 2).join(', '),
        it.CommunityRating ? `★ ${it.CommunityRating.toFixed(1)}` : ''
    ].filter(Boolean).join(' · ');
}

const TO_PIVOTS = -1;
const NO_MOVE = -2;

/** Where focus goes in a column-major grid; TO_PIVOTS means up off the top row. */
function gridMove(key: RemoteKey, focus: number, rows: number, length: number, pageCols: number): number {
    const r = focus % rows;
    switch (key) {
        case 'up':
            return r === 0 ? TO_PIVOTS : focus - 1;
        case 'down':
            return clamp(r === rows - 1 ? focus : focus + 1, length);
        case 'left':
            return focus >= rows ? focus - rows : focus;
        case 'right':
            return clamp(focus + rows, length);
        case 'pageUp':
            return clamp(focus - rows * pageCols, length);
        case 'pageDown':
            return clamp(focus + rows * pageCols, length);
        default:
            return NO_MOVE;
    }
}

const Gallery: FC = () => {
    const navigate = useNavigate();
    const { api } = useApi();
    const [ params ] = useSearchParams();
    const parentId = params.get('parentId');
    const title = params.get('title') ?? '';
    const { data: raw, isPending } = useGallery(parentId, params.get('type'));

    const storageKey = `halcyon-gallery-${parentId}`;
    const [ state, setState ] = useState<{ pivot: number, focus: number, onPivots: boolean }>(() => {
        try {
            return JSON.parse(sessionStorage.getItem(storageKey) ?? '') as { pivot: number, focus: number, onPivots: boolean };
        } catch {
            return { pivot: 0, focus: 0, onPivots: false };
        }
    });
    useEffect(() => {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify(state));
        } catch {
            // ignore
        }
    }, [ storageKey, state ]);

    const pivot = PIVOTS[state.pivot] ?? PIVOTS[0];
    const items = useMemo(() => [ ...(raw ?? []) ].sort(pivot.sort), [ raw, pivot ]);
    const rows = useRowsThatFit();
    const focus = clamp(state.focus, items.length);
    const square = isSquare(items[0]) || items[0]?.Type === BaseItemKind.Photo || items[0]?.Type === BaseItemKind.Folder;
    const coverW = COVER_H * (square ? 1 : 2 / 3);

    // Keep the focused column roughly a third of the way in, like the desktop app.
    const col = Math.floor(focus / rows);
    const visibleCols = Math.max(1, Math.floor((window.innerWidth * 0.88) / (window.innerHeight * (coverW + GAP) / 100)));
    const totalCols = Math.ceil(items.length / rows);
    const scroll = Math.max(0, Math.min(col - Math.floor(visibleCols / 3), totalCols - visibleCols));

    const open = (it: BaseItemDto) => {
        if (it.IsFolder && it.Type !== BaseItemKind.Series && it.Type !== BaseItemKind.MusicAlbum && it.Type !== BaseItemKind.BoxSet) {
            navigate(`/gallery?parentId=${it.Id}&title=${encodeURIComponent(it.Name ?? '')}`);
        } else if (it.Type === BaseItemKind.Photo) {
            playItem(it);
        } else {
            navigate(`/details?id=${it.Id}`);
        }
    };

    const set = (patch: Partial<typeof state>) => setState(s => ({ ...s, ...patch }));
    const setPivot = (n: number) => {
        // Keep the same item focused across sorts.
        const keep = items[focus];
        const next = [ ...(raw ?? []) ].sort(PIVOTS[n].sort);
        set({ pivot: n, focus: Math.max(0, next.indexOf(keep)) });
    };

    useRemote(remoteKey => {
        if (remoteKey === 'back') {
            navigate(-1);
            return;
        }
        if (state.onPivots) return pivotKey(remoteKey);
        const it = items[focus];
        if (remoteKey === 'ok' || remoteKey === 'play') {
            if (it && remoteKey === 'ok') open(it);
            else if (it) playItem(it);
            return;
        }
        const next = gridMove(remoteKey, focus, rows, items.length, visibleCols);
        if (next === NO_MOVE) return false;
        if (next === TO_PIVOTS) set({ onPivots: true });
        else set({ focus: next });
    });

    function pivotKey(remoteKey: RemoteKey) {
        if (remoteKey === 'left') setPivot(clamp(state.pivot - 1, PIVOTS.length));
        else if (remoteKey === 'right') setPivot(clamp(state.pivot + 1, PIVOTS.length));
        else if (remoteKey === 'down' || remoteKey === 'ok') set({ onPivots: false });
        else return false;
    }

    const current = items[focus];
    let lastGroup: string | undefined;

    return (
        <Screen>
            <div className='halcyon-gallery'>
                <h1 className='halcyon-title halcyon-glow'>{title}</h1>
                <nav className='halcyon-pivots'>
                    {PIVOTS.map((p, i) => (
                        <button
                            key={p.label}
                            type='button'
                            tabIndex={-1}
                            className={`${i === state.pivot ? 'is-on' : ''} ${i === state.pivot && state.onPivots ? 'is-focused' : ''}`}
                            onClick={() => setPivot(i)}
                        >{p.label}</button>
                    ))}
                </nav>
                {!items.length ? (
                    <p className='halcyon-empty'>{isPending ? 'Loading…' : 'Nothing here yet.'}</p>
                ) : (
                    <>
                        <div
                            className='halcyon-grid'
                            style={{
                                top: `${GRID_TOP}vh`,
                                gridTemplateRows: `repeat(${rows}, ${COVER_H}vh)`,
                                gridAutoColumns: `${coverW}vh`,
                                transform: `translateX(-${scroll * (coverW + GAP)}vh)`
                            }}
                        >
                            {items.map((it, i) => {
                                const group = pivot.group && i % rows === 0 ? pivot.group(it) : undefined;
                                const showGroup = group !== undefined && group !== lastGroup;
                                if (pivot.group) lastGroup = pivot.group(it);
                                const c = Math.floor(i / rows);
                                if (c < scroll - 2 || c > scroll + visibleCols + 2) return <span key={it.Id} />;
                                const src = imageUrl(api, it, 'poster', 400);
                                const focused = i === focus && !state.onPivots;
                                return (
                                    <button
                                        key={it.Id}
                                        type='button'
                                        tabIndex={-1}
                                        className={`halcyon-cover ${focused ? 'is-focused' : ''}`}
                                        onClick={() => (focused ? open(it) : set({ focus: i, onPivots: false }))}
                                    >
                                        {showGroup && <span className='halcyon-group'>{group}</span>}
                                        {src ? <img src={src} alt='' loading='lazy' /> : (
                                            <span className='halcyon-cover-blank'><Placeholder /><b>{it.Name}</b></span>
                                        )}
                                        {it.UserData?.Played && <span className='halcyon-check'>✓</span>}
                                        {!!it.UserData?.PlayedPercentage && !it.UserData.Played && (
                                            <span className='halcyon-progress' style={{ width: `${it.UserData.PlayedPercentage}%` }} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {current && (
                            <footer className='halcyon-gallery-info' style={{ top: `${GRID_TOP + rows * (COVER_H + GAP) + 1}vh` }}>
                                <div className='halcyon-gallery-name'>{current.Name}</div>
                                <div className='halcyon-gallery-meta'>
                                    <span>{metaLine(current)}</span>
                                    <span className='halcyon-dim'>{focus + 1} of {items.length}</span>
                                </div>
                            </footer>
                        )}
                    </>
                )}
            </div>
        </Screen>
    );
};

export default Gallery;
