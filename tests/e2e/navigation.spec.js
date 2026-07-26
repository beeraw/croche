import { expect, test } from '@playwright/test';

import { signIn, silenceTours } from './helpers.js';

/**
 * Cancels the navigation a click or a submit would cause, so the page stays put
 * and the waiting state it left behind can be read.
 *
 * The listener goes on the document, which is the last thing an event reaches:
 * the app binds its own on the body, so it has already run by then. Cancelling
 * any earlier would be cancelling the very thing under test.
 */
async function cancelNavigation(page, type) {
    await page.evaluate((eventType) => {
        document.addEventListener(eventType, (event) => event.preventDefault());
    }, type);
}

test.describe('waiting for the next screen', () => {
    test('a tapped link says so, and the bar starts', async ({ page }) => {
        await silenceTours(page);
        await page.goto('/profils');
        await cancelNavigation(page, 'click');

        await page.locator('.profile-tile').first().click();

        await expect(page.locator('.profile-tile.is-pending')).toHaveCount(1);
        await expect(page.locator('.nav-progress.is-running')).toHaveCount(1);
    });

    test('a link that only scrolls the page is left alone', async ({ page }) => {
        await silenceTours(page);
        await page.goto('/profils');
        await cancelNavigation(page, 'click');

        await page.evaluate(() => {
            const link = document.createElement('a');

            link.href = '#nowhere';
            link.id = 'probe';
            link.textContent = 'probe';
            // Out in front, clear of the development toolbar at the bottom.
            link.style.cssText = 'position:fixed;top:0;left:0;z-index:9999';
            document.body.append(link);
        });

        await page.locator('#probe').click();

        await expect(page.locator('.is-pending')).toHaveCount(0);
        await expect(page.locator('.nav-progress.is-running')).toHaveCount(0);
    });

    test('a submitted form marks the button that sent it', async ({ page }) => {
        await signIn(page);
        await page.goto('/morceaux');
        await cancelNavigation(page, 'submit');

        await page.getByRole('button', { name: /Nouveau morceau|New piece/ }).click();

        await expect(page.locator('.btn.is-pending')).toHaveCount(1);
        await expect(page.locator('.nav-progress.is-running')).toHaveCount(1);
    });

    test('saying no to a confirmation starts nothing', async ({ page }) => {
        await signIn(page);
        await page.goto('/morceaux');

        page.on('dialog', (dialog) => dialog.dismiss());
        await page.evaluate(() => document.querySelector('[data-controller="confirm"]').requestSubmit());
        await page.waitForTimeout(400);

        await expect(page.locator('.is-pending')).toHaveCount(0);
        await expect(page.locator('.nav-progress.is-running')).toHaveCount(0);
    });

    test('everything still navigates without the bar', async ({ page }) => {
        await silenceTours(page);
        await page.goto('/profils');
        await page.evaluate(() => {
            window.crocheApp
                .getControllerForElementAndIdentifier(document.body, 'navigation')
                .disconnect();
        });

        await page.locator('.profile-tile').first().click();

        await expect(page.locator('.pin-pad')).toBeVisible();
    });
});
