import { expect } from '@playwright/test';

/**
 * Shared steps for the end-to-end tests.
 *
 * The demo profile from the fixtures. Reload them before a run:
 * `php bin/console doctrine:fixtures:load --no-interaction`.
 */
export const DEMO = {
    child: 'Aïcha',
    pin: '2018',
    piece: 'Au clair de la lune',
    scale: 'Ma première gamme',
};

/**
 * Marks the guided tours as already seen.
 *
 * They greet a first-time visitor on the library and in the editor, and the
 * overlay swallows every click while a bubble is open — which would stop any
 * test that is not about the tour itself. The flags written here are the ones
 * the controller writes once a child has been through it.
 */
export async function silenceTours(page) {
    await page.addInitScript(() => {
        window.localStorage.setItem('croche.tour.scores', '1');
        window.localStorage.setItem('croche.tour.editor', '1');
    });
}

/**
 * Signs in through the profile picker and the keypad, the way the child does.
 *
 * Pass `tours: true` to leave the guided tours armed; every other test wants
 * them out of the way.
 */
export async function signIn(page, { name = DEMO.child, pin = DEMO.pin, tours = false } = {}) {
    if (!tours) {
        await silenceTours(page);
    }

    await page.goto('/profils');
    await page.getByRole('link', { name }).click();

    await expect(page.locator('.pin-pad')).toBeVisible();

    for (const digit of pin.split('')) {
        await page.locator(`.pin-pad__key[data-digit="${digit}"]`).click();
    }

    await page.waitForURL('**/morceaux');
}

/**
 * Opens a piece from the library and waits for it to be drawn.
 */
export async function openScore(page, title = DEMO.piece) {
    await page.goto('/morceaux');
    await page.getByRole('heading', { name: title }).click();

    await expect(page.locator('.score-sheet__canvas svg')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect
        .poll(() => page.evaluate(() => !!window.crocheApp), { timeout: 10_000 })
        .toBe(true);
}

/**
 * The score-editor Stimulus controller, reached the same way the console would.
 */
export function editor(page) {
    return {
        /** Runs an expression with `c` bound to the controller. */
        eval: (body) => page.evaluate(`(() => {
            const c = window.crocheApp.getControllerForElementAndIdentifier(
                document.querySelector('.editor'), 'score-editor',
            );
            ${body}
        })()`),
        controller: (name) => page.evaluate(`(() => !!window.crocheApp
            .getControllerForElementAndIdentifier(document.querySelector('.editor'), '${name}'))()`),
    };
}

/**
 * Forces the interface language, so assertions do not depend on the browser's
 * Accept-Language header.
 */
export async function useLanguage(page, locale) {
    await page.goto(`/langue/${locale}`);
}
