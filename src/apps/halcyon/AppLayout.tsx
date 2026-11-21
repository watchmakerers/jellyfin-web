import React from 'react';
import { Outlet } from 'react-router-dom';

import AppBody from 'components/AppBody';
import CustomCss from 'components/CustomCss';
import ThemeCss from 'components/ThemeCss';

import './halcyon.scss';

export function Component() {
    return (
        <>
            <AppBody>
                <Outlet />
            </AppBody>
            <ThemeCss />
            <CustomCss />
        </>
    );
}

Component.displayName = 'HalcyonAppLayout';
