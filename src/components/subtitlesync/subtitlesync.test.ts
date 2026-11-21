import { beforeEach, describe, expect, it, vi } from 'vitest';

// Like the real player: remembers the offset it was last given.
const { setSubtitleOffset, applied } = vi.hoisted(() => {
    const state = { offset: 0 };
    return {
        applied: state,
        setSubtitleOffset: vi.fn((offset: number) => {
            state.offset = offset;
        })
    };
});

vi.mock('../playback/playbackmanager', () => ({
    playbackManager: {
        setSubtitleOffset,
        getPlayerSubtitleOffset: () => applied.offset,
        disableShowingSubtitleOffset: vi.fn(),
        supportSubtitleOffset: () => true,
        isShowingSubtitleOffsetEnabled: () => true,
        canHandleOffsetOnCurrentSubtitle: () => true
    }
}));
vi.mock('../layoutManager', () => ({ default: { tv: false } }));
vi.mock('./subtitlesync.scss', () => ({}));
vi.mock('./subtitlesync.template.html', () => ({
    default: `<div class="subtitleSync"><div class="subtitleSyncContainer">
        <button type="button" class="subtitleSync-closeButton"></button>
        <div class="subtitleSyncTextField" contenteditable="true">0s</div>
        <input type="range" step="0.1" min="-30" max="30" value="0" class="subtitleSyncSlider" />
    </div></div>`
}));

import SubtitleSync from './subtitlesync';

const typeOffset = (text: string) => {
    const field = document.querySelector('.subtitleSyncTextField') as HTMLElement;
    field.textContent = text;
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
};

const lastOffset = () => setSubtitleOffset.mock.calls.at(-1)?.[0];
const slider = () => document.querySelector('.subtitleSyncSlider') as HTMLInputElement;
const field = () => (document.querySelector('.subtitleSyncTextField') as HTMLElement).textContent;

describe('SubtitleSync', () => {
    let sync: SubtitleSync;

    beforeEach(() => {
        document.body.innerHTML = '';
        setSubtitleOffset.mockClear();
        applied.offset = 0;
        sync = new SubtitleSync({});
    });

    it('applies typed offsets beyond the slider range (jellyfin-web#3783)', () => {
        typeOffset('45');
        expect(lastOffset()).toBe(45);
        expect(field()).toBe('45s');
        // The slider can't go past its end, so it just shows the end.
        expect(slider().value).toBe('30');

        typeOffset('-90.5');
        expect(lastOffset()).toBe(-90.5);
        expect(field()).toBe('-90.5s');
        expect(slider().value).toBe('-30');
    });

    it('steps from the real offset, not the clamped slider position', () => {
        typeOffset('45');
        sync.incrementOffset();
        expect(lastOffset()).toBe(45.1);
        sync.decrementOffset();
        sync.decrementOffset();
        expect(lastOffset()).toBe(44.9);
    });

    it('does not accumulate floating point noise', () => {
        sync.incrementOffset();
        sync.incrementOffset();
        sync.incrementOffset();
        expect(lastOffset()).toBe(0.3);
    });

    it('still follows the slider when it is dragged', () => {
        typeOffset('45');
        slider().value = '-2.5';
        slider().dispatchEvent(new Event('change'));
        expect(lastOffset()).toBe(-2.5);
        expect(field()).toBe('-2.5s');
    });
});
