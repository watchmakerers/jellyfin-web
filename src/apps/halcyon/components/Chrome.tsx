import React, { type FC, type PropsWithChildren, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Page from 'components/Page';

import logo from '../assets/logo.png';

/** Out-of-focus dots on the backdrop: a fixed pattern, like the desktop app (seed 7). */
const DOTS = (() => {
    let seed = 7;
    const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    return Array.from({ length: 26 }, (_, id) => ({
        id,
        x: rnd() * 100,
        y: 15 + rnd() * 80,
        r: 1 + rnd() * 3.5,
        a: 0.03 + rnd() * 0.07
    }));
})();

export const Backdrop: FC<{ art?: string }> = ({ art }) => (
    <div className='halcyon-backdrop' aria-hidden>
        {art && <div className='halcyon-backdrop-art' style={{ backgroundImage: `url("${art}")` }} />}
        {DOTS.map(d => (
            <span
                key={d.id}
                className='halcyon-dot'
                style={{
                    left: `${d.x}%`,
                    top: `${d.y}%`,
                    width: `${d.r * 2}vh`,
                    height: `${d.r * 2}vh`,
                    opacity: d.a * 4
                }}
            />
        ))}
    </div>
);

function useClock() {
    const fmt = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const [ now, setNow ] = useState(fmt);
    useEffect(() => {
        const t = window.setInterval(() => setNow(fmt()), 10000);
        return () => window.clearInterval(t);
    }, []);
    return now;
}

interface ScreenProps {
    /** Show the round back button (everywhere except the start menu). */
    canGoBack?: boolean
    art?: string
    status?: string
}

/**
 * A full-screen Halcyon page: backdrop, wordmark + clock, back button.
 * While mounted it hides the legacy app header (see halcyon.scss).
 */
export const Screen: FC<PropsWithChildren<ScreenProps>> = ({ canGoBack = true, art, status, children }) => {
    const navigate = useNavigate();
    const time = useClock();

    useEffect(() => {
        // Take keyboard focus from whatever the previous page left focused.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        document.documentElement.classList.add('halcyon-screen');
        return () => document.documentElement.classList.remove('halcyon-screen');
    }, []);

    // Page tells the legacy view manager a new page is showing: it hides the previous legacy page
    // (so the video player tears down and stops, as it does going back to any page) and keeps the
    // app router's history state and the music now-playing bar in step.
    return (
        <Page id='halcyonPage' className='halcyon-page' isBackButtonEnabled={canGoBack}>
            <div className='halcyon'>
                <Backdrop art={art} />
                <header className='halcyon-chrome'>
                    {canGoBack && (
                        <button type='button' className='halcyon-back' aria-label='Back' onClick={() => navigate(-1)}>
                            <svg viewBox='0 0 24 24'><path d='M15 6l-6 6 6 6' /><path d='M9 12h9' /></svg>
                        </button>
                    )}
                    <div className='halcyon-brand'>
                        <button type='button' className='halcyon-wordmark' onClick={() => navigate('/home')}>
                            <b>Halcyon</b> Media Center
                            <img src={logo} alt='' />
                        </button>
                        <time>{time}</time>
                    </div>
                </header>
                <main className='halcyon-content'>{children}</main>
                {status && <div className='halcyon-status'>{status}</div>}
            </div>
        </Page>
    );
};

/** The faint stacked lines Media Center showed for items without pictures. */
export const Placeholder: FC = () => (
    <div className='halcyon-placeholder' aria-hidden>
        {Array.from({ length: 10 }, (_, i) => <span key={i} />)}
    </div>
);
