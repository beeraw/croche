import { Controller } from '@hotwired/stimulus';

/** Grace period before the bar appears. A page that fast needs no explaining. */
const BAR_DELAY = 140;

/**
 * Tells the child her tap registered.
 *
 * Croche navigates the ordinary way, one full page load per screen. Added to
 * the home screen it runs without Safari's chrome, so it also runs without
 * Safari's own loading indicator: between the tap and the next screen there is
 * nothing at all, and on a domestic connection that is long enough to tap
 * again, or to decide the app is broken.
 *
 * Two answers, because they cover different distances. The control that was
 * tapped goes into a waiting state immediately — that is the one the eye is
 * already on. And a bar creeps across the top of the screen if the page takes
 * longer than a blink, which is what says the wait is the network's doing.
 *
 * Nothing here is load-bearing: if the bundle has not arrived yet, or fails
 * outright, every link and button still navigates exactly as before.
 */
export default class extends Controller {
    static targets = ['bar'];

    connect() {
        this.timer = null;
        this.waiting = false;
    }

    disconnect() {
        this.reset();
    }

    /**
     * A tap on a link. Anything that will not actually leave the page is left
     * alone — a bar creeping across the top of a page that never moves is worse
     * than no bar at all.
     */
    tapped(event) {
        if (event.defaultPrevented || event.button !== 0 || this.hasModifier(event)) {
            return;
        }

        const link = event.target.closest?.('a[href]');

        if (link && this.leavesPage(link)) {
            this.begin(link);
        }
    }

    /**
     * A form on its way. `confirm` cancels the submit when she says no, and by
     * the time this runs on the body the cancellation has already happened.
     */
    submitted(event) {
        if (event.defaultPrevented) {
            return;
        }

        this.begin(event.submitter ?? event.target);
    }

    begin(element) {
        if (this.waiting) {
            return;
        }

        this.waiting = true;
        element?.classList?.add('is-pending');

        this.timer = window.setTimeout(() => {
            if (this.hasBarTarget) {
                this.barTarget.classList.add('is-running');
            }
        }, BAR_DELAY);
    }

    /**
     * Back from the browser's cache restores the page exactly as it was left —
     * including a control still spinning for a screen that has already been and
     * gone. Bound to pageshow, which is the one event bfcache does fire.
     */
    reset() {
        window.clearTimeout(this.timer);
        this.timer = null;
        this.waiting = false;

        if (this.hasBarTarget) {
            this.barTarget.classList.remove('is-running');
        }

        this.element.querySelectorAll('.is-pending')
            .forEach((element) => element.classList.remove('is-pending'));
    }

    hasModifier(event) {
        return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    }

    leavesPage(link) {
        if ((link.target && link.target !== '_self') || link.hasAttribute('download')) {
            return false;
        }

        const href = link.getAttribute('href') ?? '';

        if (/^(#|mailto:|tel:|javascript:)/i.test(href)) {
            return false;
        }

        if (link.origin !== window.location.origin) {
            return false;
        }

        // A link to a fragment of the page we are already on: the browser
        // scrolls, and that is the whole navigation.
        return !(link.hash
            && link.pathname === window.location.pathname
            && link.search === window.location.search);
    }
}
