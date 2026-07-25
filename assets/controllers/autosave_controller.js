import { Controller } from '@hotwired/stimulus';

const DEBOUNCE_MS = 2000;

/** Back-off before retrying a save that failed, usually for want of network. */
const RETRY_MS = 5000;

/**
 * Saves on its own, two seconds after the last change.
 *
 * There is deliberately no save button — she would forget it. The indicator
 * next to the title is the only feedback, and it stays quiet.
 *
 * localStorage is a buffer for failed requests, never the source of truth:
 * Safari evicts storage for sites that are not installed, so the database is
 * the only thing we trust. On load, a buffered copy is offered back.
 */
export default class extends Controller {
    static targets = ['indicator', 'indicatorText', 'title'];

    static values = {
        url: String,
        token: String,
        storageKey: String,
        debounce: { type: Number, default: DEBOUNCE_MS },
    };

    connect() {
        this.timer = null;
        this.inFlight = false;
        this.pending = null;
        this.lastSaved = null;
        this.setState('idle', 'Enregistré');
    }

    disconnect() {
        window.clearTimeout(this.timer);
    }

    /**
     * Called by the editor whenever the document changes.
     */
    schedule(content) {
        this.pending = { content, title: this.currentTitle() };
        this.setState('pending', 'Modifié…');

        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.flush(), this.debounceValue);
    }

    titleChanged() {
        this.pending = {
            content: this.pending?.content ?? null,
            title: this.currentTitle(),
        };
        this.setState('pending', 'Modifié…');

        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.flush(), this.debounceValue);
    }

    currentTitle() {
        return this.hasTitleTarget ? this.titleTarget.value.trim() : null;
    }

    async flush() {
        if (!this.pending || this.inFlight) {
            return;
        }

        const payload = this.pending;
        this.pending = null;
        this.inFlight = true;
        let retryIn = null;
        this.setState('saving', 'Enregistrement…');

        const body = {};

        if (payload.content) {
            body.content = payload.content;
        }

        if (payload.title) {
            body.title = payload.title;
        }

        try {
            const response = await fetch(this.urlValue, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': this.tokenValue,
                    'X-Requested-With': 'fetch',
                },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error ?? `HTTP ${response.status}`);
            }

            this.lastSaved = payload;
            this.clearBuffer();
            this.setState('saved', 'Enregistré');
            this.dispatch('saved', { prefix: 'autosave' });
        } catch {
            this.buffer(payload);
            this.setState('error', 'Hors ligne — réessai…');

            // Put the work back at the front of the queue. A newer change may
            // have arrived while the request was in flight; it wins, since it
            // already contains everything this payload held.
            this.pending = this.pending ?? payload;
            retryIn = RETRY_MS;
        } finally {
            this.inFlight = false;

            if (this.pending) {
                window.clearTimeout(this.timer);
                this.timer = window.setTimeout(() => this.flush(), retryIn ?? this.debounceValue);
            }
        }
    }

    /**
     * Forces a save now — used when the page is about to go away.
     */
    flushNow() {
        window.clearTimeout(this.timer);

        return this.flush();
    }

    buffer(payload) {
        try {
            window.localStorage.setItem(
                this.storageKeyValue,
                JSON.stringify({ ...payload, at: Date.now() }),
            );
        } catch {
            // Storage full or disabled: the buffer is a nicety, not a promise.
        }
    }

    clearBuffer() {
        try {
            window.localStorage.removeItem(this.storageKeyValue);
        } catch {
            // Nothing to do.
        }
    }

    /**
     * A copy that never reached the server, if there is one.
     */
    readBuffer() {
        try {
            const raw = window.localStorage.getItem(this.storageKeyValue);

            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    setState(state, text) {
        if (!this.hasIndicatorTarget) {
            return;
        }

        this.indicatorTarget.dataset.state = state;

        if (this.hasIndicatorTextTarget) {
            this.indicatorTextTarget.textContent = text;
        }
    }
}
