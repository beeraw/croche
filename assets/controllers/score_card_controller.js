import { Controller } from '@hotwired/stimulus';

/**
 * Renaming a score from its card.
 *
 * A plain prompt on purpose: it is native, works with VoiceOver on the iPad,
 * and nothing here warrants a custom modal. Deleting is handled by the
 * `confirm` controller on the form itself.
 */
export default class extends Controller {
    static targets = ['renameForm', 'renameInput'];

    rename(event) {
        const current = event.params.current ?? '';
        const title = window.prompt(event.params.prompt ?? '', current);

        if (title === null) {
            return;
        }

        const trimmed = title.trim();

        if (trimmed === '' || trimmed === current) {
            return;
        }

        this.renameInputTarget.value = trimmed;
        this.renameFormTarget.submit();
    }
}
