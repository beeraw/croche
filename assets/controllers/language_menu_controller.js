import { Controller } from '@hotwired/stimulus';

/**
 * The manners a bare <details> menu lacks: it closes on Escape, on a tap
 * anywhere else, and when the focus leaves it.
 *
 * Opening and closing already work without any of this — the switcher is
 * usable while the bundle is still loading, or if it never does.
 */
export default class extends Controller {
    connect() {
        this.onPointerDown = (event) => {
            if (!this.element.contains(event.target)) {
                this.close();
            }
        };

        this.onKeyDown = (event) => {
            if (event.key !== 'Escape' || !this.element.open) {
                return;
            }

            // Escape sends the focus back to the button it came from,
            // otherwise it lands on the page and the keyboard user is lost.
            this.close();
            this.element.querySelector('summary')?.focus();
        };

        this.onFocusOut = (event) => {
            // Safari gives no focus to a link that is being clicked, so an
            // empty relatedTarget is not a sign the focus left the menu:
            // closing on it would swallow the tap. Taps outside are the
            // pointer handler's job anyway; this one is for the keyboard.
            if (event.relatedTarget instanceof Node && !this.element.contains(event.relatedTarget)) {
                this.close();
            }
        };

        document.addEventListener('pointerdown', this.onPointerDown);
        document.addEventListener('keydown', this.onKeyDown);
        this.element.addEventListener('focusout', this.onFocusOut);
    }

    disconnect() {
        document.removeEventListener('pointerdown', this.onPointerDown);
        document.removeEventListener('keydown', this.onKeyDown);
        this.element.removeEventListener('focusout', this.onFocusOut);
    }

    close() {
        this.element.open = false;
    }
}
