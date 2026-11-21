import React from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

import { ASYNC_PUBLIC_ROUTES, ASYNC_USER_ROUTES } from 'apps/legacy/routes/asyncRoutes';
import { LEGACY_PUBLIC_ROUTES, LEGACY_USER_ROUTES } from 'apps/legacy/routes/legacyRoutes';
import ConnectionRequired from 'components/ConnectionRequired';
import { toAsyncPageRoute } from 'components/router/AsyncRoute';
import { toViewManagerPageRoute } from 'components/router/LegacyRoute';
import ErrorBoundary from 'components/router/ErrorBoundary';
import FallbackRoute from 'components/router/FallbackRoute';

/**
 * Halcyon screens replace the legacy TV layout's browsing pages (home, libraries, details).
 * Everything else (sign-in, settings, search, playback, dashboard) is the legacy TV page,
 * so links from shared code such as appRouter.showItem() still land somewhere sensible.
 */
const HALCYON_PAGES: RouteObject[] = [
    { path: 'home', lazy: () => import('./home').then(m => ({ Component: m.default })) },
    { path: 'gallery', lazy: () => import('./gallery').then(m => ({ Component: m.default })) },
    { path: 'details', lazy: () => import('./details').then(m => ({ Component: m.default })) },
    // Library landing pages the legacy app links to; send them to the gallery.
    { path: 'movies', lazy: () => import('./redirects').then(m => ({ Component: m.LibraryRedirect })) },
    { path: 'tv', lazy: () => import('./redirects').then(m => ({ Component: m.LibraryRedirect })) },
    { path: 'music', lazy: () => import('./redirects').then(m => ({ Component: m.LibraryRedirect })) },
    { path: 'list', lazy: () => import('./redirects').then(m => ({ Component: m.LibraryRedirect })) }
];

const OVERRIDDEN = new Set(HALCYON_PAGES.map(r => r.path));
const notOverridden = <T extends { path: string }>(r: T) => !OVERRIDDEN.has(r.path);

export const APP_ROUTES: RouteObject[] = [
    {
        path: '/*',
        lazy: () => import('../AppLayout'),
        children: [
            { index: true, element: <Navigate replace to='/home' /> },
            {
                Component: ConnectionRequired,
                children: [
                    ...HALCYON_PAGES,
                    ...ASYNC_USER_ROUTES.filter(notOverridden).map(toAsyncPageRoute),
                    ...LEGACY_USER_ROUTES.filter(notOverridden).map(toViewManagerPageRoute)
                ],
                ErrorBoundary
            },
            {
                element: <ConnectionRequired level='public' />,
                children: [
                    ...ASYNC_PUBLIC_ROUTES.map(toAsyncPageRoute),
                    ...LEGACY_PUBLIC_ROUTES.map(toViewManagerPageRoute),
                    { path: '*', Component: FallbackRoute }
                ]
            }
        ]
    }
];
