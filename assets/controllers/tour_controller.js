import { Controller } from '@hotwired/stimulus';
import { driver } from 'driver.js';

/**
 * The guided tour — how the app explains itself to an eight-year-old.
 *
 * The help button carries this controller. It gathers every element on the
 * current screen that carries a `data-tour-step` attribute, sorts them, and
 * walks through them one bubble at a time. The first time a screen is opened
 * the walk starts on its own; afterwards the button brings it back.
 *
 * Annotating an element:
 *   data-tour-step="1"          position in the walk (a number)
 *   data-tour-title="…"         heading of the bubble
 *   data-tour-text="…"          body of the bubble
 *   data-tour-side="bottom"     (optional) which side the bubble sits on
 *   data-tour-align="start"     (optional) how it aligns along that side
 *
 * Repeated elements — the cards of a list, say — may all carry the same step
 * number: only the first visible one is kept, so the tour explains the card
 * once rather than once per score.
 */
export default class extends Controller {
    static values = {
        /** Identifies the screen, so "already seen" is remembered per tour. */
        name: String,
        /** Whether to start on its own the first time this screen is opened. */
        auto: Boolean,
        next: { type: String, default: 'Next' },
        prev: { type: String, default: 'Back' },
        done: { type: String, default: 'Done' },
        close: { type: String, default: 'Close' },
    };

    connect() {
        if (!this.autoValue || this.hasBeenSeen()) {
            return;
        }

        // The editor draws its staves during connect() and may put up the
        // "recover a draft?" confirm on the next tick. Waiting for the load
        // event lets both settle, so the bubbles land on their final position.
        this.autoStart = () => window.requestAnimationFrame(() => this.start());

        if (document.readyState === 'complete') {
            this.autoStartTimer = window.setTimeout(this.autoStart, 0);
        } else {
            window.addEventListener('load', this.autoStart, { once: true });
        }
    }

    disconnect() {
        if (this.autoStart) {
            window.removeEventListener('load', this.autoStart);
            window.clearTimeout(this.autoStartTimer);
        }

        this.unlockScroll();
        this.tour?.destroy();
    }

    start(event) {
        event?.preventDefault();

        const steps = this.collectSteps();
        if (steps.length === 0) {
            return;
        }

        // Marked as seen when the tour opens, not when it ends: a child who
        // waves it away should not be shown it again on the next visit.
        this.rememberSeen();

        this.tour = driver({
            showProgress: steps.length > 1,
            allowClose: true,
            stagePadding: 6,
            stageRadius: 12,
            overlayColor: 'rgba(43, 37, 33, 0.6)',
            popoverClass: 'tour-popover',
            progressText: '{{current}} / {{total}}',
            nextBtnText: this.nextValue,
            prevBtnText: this.prevValue,
            doneBtnText: this.doneValue,
            steps,
            onPopoverRender: (popover) => {
                popover.closeButton.setAttribute('aria-label', this.closeValue);
            },
            onHighlightStarted: () => this.lockScroll(),
            // Left alone, driver.js hands focus to the close cross, and the
            // app's focus ring then rings the way out rather than the way on.
            // The bubble is a labelled dialog whichever button holds focus, so
            // moving it to the primary one loses nothing and reads better.
            onHighlighted: () => this.focusPrimaryButton(),
            onDestroyed: () => {
                this.unlockScroll();
                this.tour = null;
            },
        });

        this.tour.drive();
    }

    /**
     * "Next" on every step, "Done" on the last one — driver.js reuses the same
     * button for both.
     */
    focusPrimaryButton() {
        document.querySelector('.driver-popover-next-btn')?.focus();
    }

    /**
     * The bubble is pinned to one element, so a scroll started by a stray
     * finger would leave it pointing at nothing. Only the scrolling driver.js
     * does itself — bringing the next step into view — is programmatic, and
     * preventDefault here does not touch that.
     */
    lockScroll() {
        if (this.blockScroll) {
            return; // already armed: this fires on every step
        }

        this.blockScroll = (event) => {
            // A long bubble may need scrolling of its own.
            if (event.target.closest?.('.driver-popover')) {
                return;
            }

            event.preventDefault();
        };

        window.addEventListener('wheel', this.blockScroll, { passive: false });
        window.addEventListener('touchmove', this.blockScroll, { passive: false });
    }

    unlockScroll() {
        if (!this.blockScroll) {
            return;
        }

        window.removeEventListener('wheel', this.blockScroll);
        window.removeEventListener('touchmove', this.blockScroll);
        this.blockScroll = null;
    }

    /**
     * Visible annotated elements, one per step number, in order.
     */
    collectSteps() {
        const seen = new Set();
        const elements = [];

        document.querySelectorAll('[data-tour-step]').forEach((element) => {
            // Hidden — an empty list, a control the screen does not show.
            if (element.getClientRects().length === 0) {
                return;
            }

            const step = element.dataset.tourStep;
            if (seen.has(step)) {
                return;
            }

            seen.add(step);
            elements.push(element);
        });

        elements.sort((a, b) => Number(a.dataset.tourStep) - Number(b.dataset.tourStep));

        return elements.map((element) => ({
            element,
            popover: {
                title: element.dataset.tourTitle || '',
                description: element.dataset.tourText || '',
                side: element.dataset.tourSide || 'bottom',
                align: element.dataset.tourAlign || 'start',
            },
        }));
    }

    get storageKey() {
        return `croche.tour.${this.nameValue}`;
    }

    /**
     * Private browsing and a full quota both make localStorage throw. Losing
     * the memory only means the tour opens once more than it should, which is
     * no reason to break the screen.
     */
    hasBeenSeen() {
        try {
            return window.localStorage.getItem(this.storageKey) !== null;
        } catch {
            return false;
        }
    }

    rememberSeen() {
        try {
            window.localStorage.setItem(this.storageKey, '1');
        } catch {
            // Ignored on purpose, see above.
        }
    }
}
