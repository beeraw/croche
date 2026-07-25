import { Controller } from '@hotwired/stimulus';

import { isBlackKey, keyToMidi, midiToKey, solfegeLabel } from '../js/score/pitch.js';
import { sharedAudioEngine } from '../js/audio/AudioEngine.js';

/**
 * The virtual piano — the main way of entering notes.
 *
 * Keys are built here rather than in Twig so the range lives in one place. A
 * press sounds the note immediately and announces it with `piano-keyboard:press`;
 * the editor turns that into an insertion.
 */
export default class extends Controller {
    static targets = ['keys'];

    static values = {
        from: { type: String, default: 'c/3' },
        to: { type: String, default: 'c/6' },
        scrollTo: { type: String, default: 'c/4' },
    };

    connect() {
        this.audio = sharedAudioEngine();
        this.build();
        this.scrollToAnchor();
    }

    build() {
        const first = keyToMidi(this.fromValue);
        const last = keyToMidi(this.toValue);
        const fragment = document.createDocumentFragment();

        for (let midi = first; midi <= last; midi += 1) {
            fragment.appendChild(this.buildKey(midi));
        }

        this.keysTarget.replaceChildren(fragment);
    }

    buildKey(midi) {
        const black = isBlackKey(midi);
        const { key, accidental } = midiToKey(midi);
        const label = accidental ? `${solfegeLabel(key)} dièse` : solfegeLabel(key);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = `piano__key piano__key--${black ? 'black' : 'white'}`;
        button.dataset.midi = String(midi);
        button.dataset.key = key;
        button.dataset.accidental = accidental ?? '';
        button.setAttribute('aria-label', label);

        if (!black) {
            button.textContent = solfegeLabel(key);
        }

        // Middle C is the landmark she navigates from.
        if (key === 'c/4') {
            button.classList.add('piano__key--anchor');
        }

        button.addEventListener('pointerdown', (event) => this.press(event, button));
        button.addEventListener('pointerup', () => this.release(button));
        button.addEventListener('pointerleave', () => this.release(button));
        button.addEventListener('pointercancel', () => this.release(button));

        return button;
    }

    press(event, button) {
        event.preventDefault();
        button.classList.add('is-pressed');

        const key = button.dataset.key;
        const accidental = button.dataset.accidental || null;

        // The first tap anywhere is what unlocks audio on iPad.
        this.audio.unlock();
        this.audio.playNote(key, accidental, 0.45);

        this.dispatch('press', { detail: { key, accidental }, prefix: 'piano-keyboard' });
    }

    release(button) {
        button.classList.remove('is-pressed');
    }

    /**
     * Opens on middle C rather than at the far left of the range.
     */
    scrollToAnchor() {
        const anchor = this.keysTarget.querySelector(`[data-key="${this.scrollToValue}"]`);

        if (!anchor) {
            return;
        }

        const offset = anchor.offsetLeft - this.element.clientWidth / 2 + anchor.offsetWidth / 2;
        this.element.scrollLeft = Math.max(0, offset);
    }
}
