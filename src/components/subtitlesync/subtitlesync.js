
import { playbackManager } from '../playback/playbackmanager';
import layoutManager from '../layoutManager';
import template from './subtitlesync.template.html';
import './subtitlesync.scss';

let player;
let subtitleSyncSlider;
let subtitleSyncTextField;
let subtitleSyncCloseButton;
let subtitleSyncContainer;
/**
 * The offset actually applied, in seconds. The slider only covers [min, max], so it can't hold
 * offsets typed into the text field beyond that range (jellyfin-web#3783): it just displays the
 * nearest end while the real value lives here.
 */
let currentOffset = 0;

/** Round away floating-point noise from repeated 0.1s steps (0.1 + 0.2 = 0.30000000000000004). */
const roundOffset = value => Math.round(value * 1000) / 1000;

function init(instance) {
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    parent.innerHTML = template;

    subtitleSyncSlider = parent.querySelector('.subtitleSyncSlider');
    subtitleSyncTextField = parent.querySelector('.subtitleSyncTextField');
    subtitleSyncCloseButton = parent.querySelector('.subtitleSync-closeButton');
    subtitleSyncContainer = parent.querySelector('.subtitleSyncContainer');

    if (layoutManager.tv) {
        subtitleSyncSlider.classList.add('focusable');
        // HACK: Delay to give time for registered element attach (Firefox)
        setTimeout(function () {
            subtitleSyncSlider.enableKeyboardDragging();
        }, 0);
    }

    subtitleSyncContainer.classList.add('hide');

    subtitleSyncTextField.updateOffset = function (offset) {
        this.textContent = offset + 's';
    };

    subtitleSyncTextField.addEventListener('click', function () {
        // keep focus to prevent fade with osd
        this.hasFocus = true;
    });

    subtitleSyncTextField.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
            // if input key is enter search for float pattern
            let inputOffset = /[-+]?\d+\.?\d*/g.exec(this.textContent);
            if (inputOffset) {
                inputOffset = inputOffset[0];
                inputOffset = parseFloat(inputOffset);

                subtitleSyncSlider.updateOffset(inputOffset);
            } else {
                this.textContent = (playbackManager.getPlayerSubtitleOffset(player) || 0) + 's';
            }
            this.hasFocus = false;
            event.preventDefault();
        } else {
            // keep focus to prevent fade with osd
            this.hasFocus = true;
            if (event.key.match(/[+-\d.s]/) === null) {
                event.preventDefault();
            }
        }

        // FIXME: TV layout will require special handling for navigation keys. But now field is not focusable
        event.stopPropagation();
    });

    subtitleSyncTextField.blur = function () {
        // prevent textfield to blur while element has focus
        if (!this.hasFocus && this.prototype) {
            this.prototype.blur();
        }
    };

    subtitleSyncSlider.updateOffset = function (offset) {
        // default value is 0s = 0ms
        currentOffset = roundOffset(offset === undefined || Number.isNaN(offset) ? 0 : offset);
        playbackManager.setSubtitleOffset(currentOffset, player);
        subtitleSyncTextField.updateOffset(currentOffset);
        // The slider shows the offset clamped to its range; the text field shows the real value.
        const min = parseFloat(this.min);
        const max = parseFloat(this.max);
        this.value = String(Math.min(max, Math.max(min, currentOffset)));
    };

    subtitleSyncSlider.addEventListener('change', () => subtitleSyncSlider.updateOffset(parseFloat(subtitleSyncSlider.value)));

    subtitleSyncSlider.getBubbleHtml = function (_, value) {
        return '<h1 class="sliderBubbleText">'
            + (value > 0 ? '+' : '') + parseFloat(value) + 's'
            + '</h1>';
    };

    subtitleSyncCloseButton.addEventListener('click', function () {
        playbackManager.disableShowingSubtitleOffset(player);
        SubtitleSync.prototype.toggle('forceToHide');
    });

    instance.element = parent;
}

class SubtitleSync {
    constructor(currentPlayer) {
        player = currentPlayer;
        init(this);
    }

    destroy() {
        SubtitleSync.prototype.toggle('forceToHide');
        if (player) {
            playbackManager.disableShowingSubtitleOffset(player);
            playbackManager.setSubtitleOffset(0, player);
        }
        currentOffset = 0;
        const elem = this.element;
        if (elem) {
            elem.parentNode.removeChild(elem);
            this.element = null;
        }
    }

    toggle(action) {
        if (action && !['hide', 'forceToHide'].includes(action)) {
            console.warn('SubtitleSync.toggle called with invalid action', action);
            return;
        }

        if (player && playbackManager.supportSubtitleOffset(player)) {
            if (!action) {
                // if showing subtitle sync is enabled and if there is an external subtitle stream enabled
                if (playbackManager.isShowingSubtitleOffsetEnabled(player) && playbackManager.canHandleOffsetOnCurrentSubtitle(player)) {
                    // if no subtitle offset is defined or element has focus (offset being defined)
                    if (!(playbackManager.getPlayerSubtitleOffset(player) || subtitleSyncTextField.hasFocus)) {
                        // set default offset to '0' = 0ms
                        subtitleSyncSlider.updateOffset(0);
                    }
                    // show subtitle sync
                    subtitleSyncContainer.classList.remove('hide');
                    return;
                }
            } else if (action === 'hide' && subtitleSyncTextField.hasFocus) {
                // do not hide if element has focus
                return;
            }

            subtitleSyncContainer.classList.add('hide');
        }
    }

    update(offset) {
        this.toggle();

        // Step from the real offset, not the (possibly clamped) slider position.
        subtitleSyncSlider.updateOffset(currentOffset + offset);
    }

    incrementOffset() {
        this.update(+subtitleSyncSlider.step);
    }

    decrementOffset() {
        this.update(-subtitleSyncSlider.step);
    }
}

export default SubtitleSync;
