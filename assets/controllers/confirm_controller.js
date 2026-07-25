import { Controller } from '@hotwired/stimulus';

/**
 * Asks before a destructive submit. Attach to the form itself.
 */
export default class extends Controller {
    static values = {
        message: { type: String, default: 'Confirmer cette action ?' },
    };

    connect() {
        this.onSubmit = (event) => {
            if (!window.confirm(this.messageValue)) {
                event.preventDefault();
            }
        };

        this.element.addEventListener('submit', this.onSubmit);
    }

    disconnect() {
        this.element.removeEventListener('submit', this.onSubmit);
    }
}
