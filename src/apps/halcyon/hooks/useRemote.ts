import { useEffect, useRef } from 'react';

import { playbackManager } from 'components/playback/playbackmanager';

export type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'play' | 'info' | 'pageUp' | 'pageDown';

const KEYS: Record<string, RemoteKey> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Enter: 'ok',
    ' ': 'ok',
    Escape: 'back',
    Backspace: 'back',
    Back: 'back',
    BrowserBack: 'back',
    GoBack: 'back',
    MediaPlayPause: 'play',
    MediaPlay: 'play',
    p: 'play',
    i: 'info',
    ContextMenu: 'info',
    PageUp: 'pageUp',
    PageDown: 'pageDown'
};

// TV remotes that only report key codes (webOS: 461, Tizen: 10009).
const CODES: Record<number, RemoteKey> = { 461: 'back', 10009: 'back', 415: 'play', 19: 'play' };

/**
 * Arrow keys, Enter and Back for a Halcyon screen. Gamepads arrive here too: the shared
 * gamepadtokey script turns the d-pad/stick and A/B into the same key events.
 *
 * The listener runs in the capture phase on window, so it gets the keys before the
 * TV layout's own spatial navigation and stops them there.
 */
export function useRemote(handler: (key: RemoteKey) => boolean | void, enabled = true) {
    const ref = useRef(handler);
    ref.current = handler;

    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.altKey || e.ctrlKey || e.metaKey) return;
            const target = e.target as HTMLElement | null;
            // Leave visible text fields alone (search box, dialogs). Hidden ones left focused by the
            // previous page (e.g. the login password box) don't count.
            const field = target?.closest('input, textarea, select, [contenteditable=true], .dialogContainer, .actionSheet');
            if (field && (field as HTMLElement).offsetParent !== null) return;
            // The video player and its OSD own the keyboard while a video is up.
            if (playbackManager.isPlayingVideo()) return;
            // Dialogs opened by legacy code (action sheets, alerts) own the keyboard while open.
            if (document.querySelector('.dialogContainer .dialog.opened, .dialogContainer > .dialog')) return;

            const key = KEYS[e.key] ?? CODES[e.keyCode];
            if (!key) return;
            if (ref.current(key) !== false) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [ enabled ]);
}

/** Small helper for list/grid focus: clamp an index into [0, length). */
export const clamp = (i: number, length: number) => Math.max(0, Math.min(length - 1, i));
