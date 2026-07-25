import { Controller } from '@hotwired/stimulus';

/**
 * Rename and delete affordances on a score card.
 *
 * Deliberately plain prompt/confirm dialogs: they are native, keyboard- and
 * VoiceOver-friendly on iPad, and nothing here warrants a custom modal.
 */
export default class extends Controller {
    static targets = ['renameForm', 'renameInput'];

    rename(event) {
        const current = event.params.current ?? '';
        const title = window.prompt('Nouveau nom du morceau :', current);

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

    confirmDelete(event) {
        const title = event.params.title ?? 'ce morceau';

        if (!window.confirm(`Supprimer « ${title} » ? C'est définitif.`)) {
            event.preventDefault();
        }
    }
}
