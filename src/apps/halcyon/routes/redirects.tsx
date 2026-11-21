import React, { type FC } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';

import { useItem } from '../api';
import { Screen } from '../components/Chrome';

/** /movies?topParentId=…, /tv?topParentId=…, /list?parentId=… → the Halcyon gallery for that folder. */
export const LibraryRedirect: FC = () => {
    const [ params ] = useSearchParams();
    const id = params.get('topParentId') ?? params.get('parentId');
    const { data: view } = useItem(id);
    if (!id) return <Navigate replace to='/home' />;
    if (!view) return <Screen status='Loading…' />;
    return (
        <Navigate
            replace
            to={`/gallery?parentId=${view.Id}&type=${view.CollectionType ?? ''}&title=${encodeURIComponent(view.Name ?? '')}`}
        />
    );
};
