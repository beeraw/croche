import { expect, test } from '@playwright/test';

import { DEMO, signIn, useLanguage } from './helpers.js';

const popover = '.driver-popover.tour-popover';

/**
 * The guided tour is what greets a child who has never opened Croche. It has to
 * start on its own the first time, stay out of the way afterwards, and come
 * back on demand — on both screens, and without a leftover flag from one screen
 * silencing the other.
 */
test.describe('the guided tour', () => {
    test.beforeEach(async ({ page }) => {
        await useLanguage(page, 'fr');
        await signIn(page, { tours: true });
    });

    test('it starts on its own the first time the list is opened', async ({ page }) => {
        await expect(page.locator(popover)).toBeVisible();
        await expect(page.locator('.driver-popover-title')).toHaveText('Un morceau tout neuf');
    });

    test('focus lands on the way forward, not on the way out', async ({ page }) => {
        await expect(page.locator(popover)).toBeVisible();

        await expect
            .poll(() => page.evaluate(() => document.activeElement?.className))
            .toContain('driver-popover-next-btn');
    });

    test('it walks every step of the list, then stops', async ({ page }) => {
        await expect(page.locator(popover)).toBeVisible();

        // The five annotated controls, plus the help button that ends the walk.
        await expect(page.locator('.driver-popover-progress-text')).toHaveText('1 / 6');

        for (let step = 2; step <= 6; step += 1) {
            await page.locator('.driver-popover-next-btn').click();
            await expect(page.locator('.driver-popover-progress-text')).toHaveText(`${step} / 6`);
        }

        await page.locator('.driver-popover-next-btn').click();
        await expect(page.locator(popover)).toBeHidden();
    });

    test('the last step points at the button that brings it back', async ({ page }) => {
        await expect(page.locator(popover)).toBeVisible();

        for (let step = 1; step < 6; step += 1) {
            await page.locator('.driver-popover-next-btn').click();
        }

        await expect(page.locator('.driver-popover-title')).toHaveText('Reviens quand tu veux');
    });

    test('it does not come back on the next visit', async ({ page }) => {
        await page.locator('.driver-popover-close-btn').click();
        await page.goto('/morceaux');

        // Give the auto-start every chance to fire before calling it absent.
        await page.waitForLoadState('load');
        await expect(page.locator(popover)).toBeHidden();
    });

    test('the help button plays it again', async ({ page }) => {
        await page.locator('.driver-popover-close-btn').click();
        await page.goto('/morceaux');

        await page.locator('.tour-btn').click();

        await expect(page.locator(popover)).toBeVisible();
        await expect(page.locator('.driver-popover-title')).toHaveText('Un morceau tout neuf');
    });

    test('the editor has a tour of its own, seen list or not', async ({ page }) => {
        await page.locator('.driver-popover-close-btn').click();
        await page.getByRole('heading', { name: DEMO.piece }).click();

        await expect(page.locator(popover)).toBeVisible();
        await expect(page.locator('.driver-popover-title')).toHaveText('Le nom de ton morceau');
        await expect(page.locator('.driver-popover-progress-text')).toHaveText('1 / 16');
    });

    /**
     * The bubble is pinned to one element, so a stray finger scrolling the page
     * would leave it pointing at nothing.
     */
    test('the page cannot be scrolled while a bubble is open', async ({ page }) => {
        await page.locator('.driver-popover-close-btn').click();
        await page.getByRole('heading', { name: DEMO.piece }).click();
        await expect(page.locator(popover)).toBeVisible();

        const scrolled = await page.evaluate(() => {
            const event = new WheelEvent('wheel', { deltaY: 200, cancelable: true, bubbles: true });

            return !window.dispatchEvent(event); // false once a listener called preventDefault
        });

        expect(scrolled).toBe(true);
    });
});
