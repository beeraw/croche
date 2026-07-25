import { Controller } from '@hotwired/stimulus';

/**
 * Duration, accidental and rest pickers.
 *
 * Owns nothing but the current tool, and announces it upward with a
 * `note-palette:change` event. The editor decides what to do with it.
 */
export default class extends Controller {
    static targets = ['duration', 'accidental', 'rest'];

    connect() {
        this.tool = { duration: 'q', accidental: null, rest: false };
        this.render();
        this.announce();
    }

    selectDuration(event) {
        this.tool.duration = event.currentTarget.dataset.duration;
        this.render();
        this.announce();
    }

    /** Tapping the active accidental again clears it. */
    toggleAccidental(event) {
        const value = event.currentTarget.dataset.accidental;

        this.tool.accidental = this.tool.accidental === value ? null : value;
        this.render();
        this.announce();
    }

    toggleRest() {
        this.tool.rest = !this.tool.rest;

        // A rest has no accidental; keeping one selected would be misleading.
        if (this.tool.rest) {
            this.tool.accidental = null;
        }

        this.render();
        this.announce();
    }

    render() {
        this.durationTargets.forEach((button) => {
            button.classList.toggle('is-active', button.dataset.duration === this.tool.duration);
        });

        this.accidentalTargets.forEach((button) => {
            const active = button.dataset.accidental === this.tool.accidental;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
            button.disabled = this.tool.rest;
        });

        if (this.hasRestTarget) {
            this.restTarget.classList.toggle('is-active', this.tool.rest);
            this.restTarget.setAttribute('aria-pressed', String(this.tool.rest));
        }
    }

    announce() {
        this.dispatch('change', { detail: { ...this.tool }, prefix: 'note-palette' });
    }
}
