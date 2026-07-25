import { expect, test } from '@playwright/test';

import { openScore, signIn, useLanguage } from './helpers.js';

/**
 * Printing is the real reward: a piece leaving the screen as paper. The sheet
 * must carry the title, the child's first name and the score — and nothing of
 * the interface.
 */
test.describe('the print sheet', () => {
    test.beforeEach(async ({ page }) => {
        await useLanguage(page, 'fr');
        await signIn(page);
        await openScore(page);
        await page.emulateMedia({ media: 'print' });
    });

    test('every piece of interface is hidden', async ({ page }) => {
        for (const selector of ['.editor__bar', '.editor__tools', '.piano', '.playhead', '.editor__notice']) {
            await expect(page.locator(selector), selector).toBeHidden();
        }
    });

    test('the title and the first name are shown', async ({ page }) => {
        const header = page.locator('.editor__print-header');

        await expect(header).toBeVisible();
        await expect(header.locator('.editor__print-title')).toContainText('Au clair de la lune');
        await expect(header.locator('.editor__print-author')).toContainText('Aïcha');
    });

    test('the score itself is still there', async ({ page }) => {
        await expect(page.locator('.score-sheet__canvas svg')).toBeVisible();
    });

    /**
     * The print rules force every shape to solid black. The translucent band
     * marking the active staff has to be excluded, or it prints as a bar right
     * across the music.
     */
    test('the active-staff tint does not print', async ({ page }) => {
        // One band per system, so there may be several; none may be visible.
        const bands = page.locator('.score-sheet__canvas .vf-active-stave');

        expect(await bands.count()).toBeGreaterThan(0);
        expect(await page.locator('.score-sheet__canvas .vf-active-stave:visible').count()).toBe(0);
    });

    test('the page carries no scrollable chrome', async ({ page }) => {
        const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);

        expect(overflow).not.toBe('hidden');
    });
});
