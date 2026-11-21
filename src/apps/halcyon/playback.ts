import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';

import { playbackManager } from 'components/playback/playbackmanager';

/**
 * Play through the regular Jellyfin player (it handles transcoding, subtitles, the OSD and
 * reporting progress back). Series/seasons/albums are expanded by the playback manager.
 */
export function playItem(item: BaseItemDto, opts: { resume?: boolean, startIndex?: number, items?: BaseItemDto[] } = {}) {
    const startPositionTicks = opts.resume ? item.UserData?.PlaybackPositionTicks ?? 0 : 0;
    playbackManager.play({
        items: opts.items ?? [ item ],
        startIndex: opts.startIndex,
        startPositionTicks,
        autoplay: true
    }).catch((err: unknown) => console.error('[Halcyon] failed to play', err));
}

export const canResume = (item?: BaseItemDto) =>
    !!item?.UserData?.PlaybackPositionTicks && !item.UserData.Played;
