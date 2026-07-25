import { Controller } from '@hotwired/stimulus';

/**
 * Four-digit keypad. Fills the hidden field, lights the dots, and submits on
 * its own once the last digit lands — no validate button to find.
 */
export default class extends Controller {
    static targets = ['input', 'dot'];

    static values = {
        length: { type: Number, default: 4 },
    };

    connect() {
        this.digits = '';
        this.submitted = false;
        this.render();

        this.onKeydown = this.handleKeydown.bind(this);
        document.addEventListener('keydown', this.onKeydown);
    }

    disconnect() {
        document.removeEventListener('keydown', this.onKeydown);
    }

    press(event) {
        this.append(event.currentTarget.dataset.digit);
    }

    backspace() {
        this.digits = this.digits.slice(0, -1);
        this.render();
    }

    clear() {
        this.digits = '';
        this.render();
    }

    handleKeydown(event) {
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }

        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            this.append(event.key);
        } else if (event.key === 'Backspace') {
            event.preventDefault();
            this.backspace();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            this.clear();
        }
    }

    append(digit) {
        if (this.submitted || this.digits.length >= this.lengthValue) {
            return;
        }

        this.digits += digit;
        this.render();

        if (this.digits.length === this.lengthValue) {
            this.submit();
        }
    }

    submit() {
        this.submitted = true;
        this.inputTarget.value = this.digits;
        // A short beat so the last dot is visibly filled before the page leaves.
        window.setTimeout(() => this.element.submit(), 120);
    }

    render() {
        this.inputTarget.value = this.digits;

        this.dotTargets.forEach((dot, index) => {
            dot.classList.toggle('is-filled', index < this.digits.length);
        });
    }
}
