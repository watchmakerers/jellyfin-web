import type { Api } from '@jellyfin/sdk';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { BaseItemKind } from '@jellyfin/sdk/lib/generated-client/models/base-item-kind';
import { CollectionType } from '@jellyfin/sdk/lib/generated-client/models/collection-type';
import { ImageType } from '@jellyfin/sdk/lib/generated-client/models/image-type';
import { ItemFields } from '@jellyfin/sdk/lib/generated-client/models/item-fields';
import { ItemSortBy } from '@jellyfin/sdk/lib/generated-client/models/item-sort-by';
import { MediaType } from '@jellyfin/sdk/lib/generated-client/models/media-type';
import { SortOrder } from '@jellyfin/sdk/lib/generated-client/models/sort-order';
import { getImageApi } from '@jellyfin/sdk/lib/utils/api/image-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { getUserDataApi } from '@jellyfin/sdk/lib/utils/api/user-data-api';
import { getUserViewApi } from '@jellyfin/sdk/lib/utils/api/user-view-api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';

const FIELDS = [ ItemFields.Overview, ItemFields.Genres, ItemFields.DateCreated ];

/** Everything the start menu shows, loaded in one go like Halcyon Media Center does. */
export interface StartData {
    views: BaseItemDto[]
    resume: BaseItemDto[]
    nextUp: BaseItemDto[]
    latestMovies: BaseItemDto[]
    latestShows: BaseItemDto[]
    latestMusic: BaseItemDto[]
}

const viewOf = (views: BaseItemDto[], type: CollectionType) => views.find(v => v.CollectionType === type);

async function fetchStart(api: Api, userId: string): Promise<StartData> {
    const library = getLibraryApi(api);
    const views = (await getUserViewApi(api).getUserViews({ userId })).data.Items ?? [];
    const latest = async (type: CollectionType) => {
        const view = viewOf(views, type);
        if (!view?.Id) return [];
        return (await library.getLatestMedia({ userId, parentId: view.Id, limit: 12, fields: FIELDS })).data;
    };
    const [ resume, nextUp, latestMovies, latestShows, latestMusic ] = await Promise.all([
        library.getResumeItems({ userId, limit: 12, mediaTypes: [ MediaType.Video ], fields: FIELDS })
            .then(r => r.data.Items ?? []),
        getShowApi(api).getNextUp({ userId, limit: 12, fields: FIELDS, enableResumable: false })
            .then(r => r.data.Items ?? []),
        latest(CollectionType.Movies),
        latest(CollectionType.Tvshows),
        latest(CollectionType.Music)
    ]);
    return { views, resume, nextUp, latestMovies, latestShows, latestMusic };
}

export const useStartData = () => {
    const { api, user } = useApi();
    return useQuery({
        queryKey: [ 'halcyon', 'start', user?.Id ],
        queryFn: () => fetchStart(api!, user!.Id!),
        enabled: !!api && !!user?.Id
    });
};

/** The item types a library's gallery shows. */
export function galleryTypes(collectionType?: string | null): BaseItemKind[] | undefined {
    switch (collectionType) {
        case CollectionType.Movies: return [ BaseItemKind.Movie ];
        case CollectionType.Tvshows: return [ BaseItemKind.Series ];
        case CollectionType.Music: return [ BaseItemKind.MusicAlbum ];
        case CollectionType.Boxsets: return [ BaseItemKind.BoxSet ];
        case CollectionType.Homevideos: return [ BaseItemKind.Video, BaseItemKind.Photo ];
        case CollectionType.Musicvideos: return [ BaseItemKind.MusicVideo ];
        default: return undefined;
    }
}

export const useGallery = (parentId: string | null, collectionType?: string | null) => {
    const { api, user } = useApi();
    const types = galleryTypes(collectionType);
    return useQuery({
        queryKey: [ 'halcyon', 'gallery', user?.Id, parentId, collectionType ],
        queryFn: async () => (await getLibraryApi(api!).getItems({
            userId: user!.Id!,
            parentId: parentId!,
            recursive: !!types,
            includeItemTypes: types,
            sortBy: [ ItemSortBy.SortName ],
            sortOrder: [ SortOrder.Ascending ],
            fields: FIELDS,
            enableUserData: true
        })).data.Items ?? [],
        enabled: !!api && !!user?.Id && !!parentId
    });
};

export const useItem = (itemId: string | null) => {
    const { api, user } = useApi();
    return useQuery({
        queryKey: [ 'halcyon', 'item', user?.Id, itemId ],
        queryFn: async () => (await getLibraryApi(api!).getItem({ itemId: itemId!, userId: user!.Id! })).data,
        enabled: !!api && !!user?.Id && !!itemId
    });
};

export const useSeasons = (seriesId?: string | null) => {
    const { api, user } = useApi();
    return useQuery({
        queryKey: [ 'halcyon', 'seasons', user?.Id, seriesId ],
        queryFn: async () => (await getShowApi(api!).getSeasons({ seriesId: seriesId!, userId: user!.Id! })).data.Items ?? [],
        enabled: !!api && !!user?.Id && !!seriesId
    });
};

export const useEpisodes = (seriesId?: string | null, seasonId?: string | null) => {
    const { api, user } = useApi();
    return useQuery({
        queryKey: [ 'halcyon', 'episodes', user?.Id, seriesId, seasonId ],
        queryFn: async () => (await getShowApi(api!).getEpisodes({
            seriesId: seriesId!,
            seasonId: seasonId!,
            userId: user!.Id!,
            fields: [ ItemFields.Overview ]
        })).data.Items ?? [],
        enabled: !!api && !!user?.Id && !!seriesId && !!seasonId
    });
};

/** Mark watched/unwatched or favourite, then refresh everything Halcyon has cached. */
export const useUserDataToggle = () => {
    const { api, user } = useApi();
    const client = useQueryClient();
    return useMutation({
        mutationFn: async ({ item, what }: { item: BaseItemDto, what: 'played' | 'favorite' }) => {
            const userData = getUserDataApi(api!);
            const params = { itemId: item.Id!, userId: user!.Id! };
            if (what === 'played') {
                await (item.UserData?.Played ? userData.markUnplayedItem(params) : userData.markPlayedItem(params));
            } else {
                await (item.UserData?.IsFavorite ? userData.unmarkFavoriteItem(params) : userData.markFavoriteItem(params));
            }
        },
        onSuccess: () => client.invalidateQueries({ queryKey: [ 'halcyon' ] })
    });
};

type ImageGetter = (id: string, type: ImageType, tag?: string | null) => string;

function backdropUrl(item: BaseItemDto, get: ImageGetter) {
    if (item.BackdropImageTags?.length) return get(item.Id!, ImageType.Backdrop, item.BackdropImageTags[0]);
    if (item.ParentBackdropItemId && item.ParentBackdropImageTags?.length) {
        return get(item.ParentBackdropItemId, ImageType.Backdrop, item.ParentBackdropImageTags[0]);
    }
    return undefined;
}

function thumbUrl(item: BaseItemDto, get: ImageGetter) {
    const tags = item.ImageTags ?? {};
    if (tags.Thumb) return get(item.Id!, ImageType.Thumb, tags.Thumb);
    if (item.ParentThumbItemId && item.ParentThumbImageTag) return get(item.ParentThumbItemId, ImageType.Thumb, item.ParentThumbImageTag);
    if (tags.Primary && item.Type === BaseItemKind.Episode) return get(item.Id!, ImageType.Primary, tags.Primary);
    return backdropUrl(item, get);
}

function posterUrl(item: BaseItemDto, get: ImageGetter) {
    const tags = item.ImageTags ?? {};
    // Episodes use their series' poster so rows of mixed items look uniform.
    if (item.Type === BaseItemKind.Episode && item.SeriesId && item.SeriesPrimaryImageTag) {
        return get(item.SeriesId, ImageType.Primary, item.SeriesPrimaryImageTag);
    }
    if (tags.Primary) return get(item.Id!, ImageType.Primary, tags.Primary);
    if (item.AlbumId && item.AlbumPrimaryImageTag) return get(item.AlbumId, ImageType.Primary, item.AlbumPrimaryImageTag);
    return undefined;
}

/** A poster, thumb or backdrop URL for an item, falling back to its series/parent art. */
export function imageUrl(api: Api | undefined, item: BaseItemDto | undefined, kind: 'poster' | 'thumb' | 'backdrop', height: number) {
    if (!api || !item?.Id) return undefined;
    const images = getImageApi(api);
    const get: ImageGetter = (id, type, tag) =>
        images.getItemImageUrlById(id, type, { maxHeight: Math.round(height), quality: 90, tag: tag ?? undefined });
    if (kind === 'backdrop') return backdropUrl(item, get);
    if (kind === 'thumb') return thumbUrl(item, get);
    return posterUrl(item, get);
}

/** Square art for music; 2:3 posters for everything else. */
export const isSquare = (item?: BaseItemDto) =>
    item?.Type === BaseItemKind.MusicAlbum || item?.Type === BaseItemKind.Audio || item?.Type === BaseItemKind.MusicArtist;

export const ticksToMinutes = (ticks?: number | null) => (ticks ? Math.round(ticks / 600000000) : 0);

export const viewFor = (views: BaseItemDto[] | undefined, type: CollectionType) => views && viewOf(views, type);
