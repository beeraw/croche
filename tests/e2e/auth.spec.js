import { expect, test } from '@playwright/test';

import { DEMO, signIn, useLanguage } from './helpers.js';

test.describe('signing in', () => {
    test('the landing page explains the project and links to the source', async ({ page }) => {
        await useLanguage(page, 'en');
        await page.goto('/');

        await expect(page.locator('.home__brand')).toContainText('Croche');
        await expect(page.locator('.home__lead')).not.toBeEmpty();

        const source = page.getByRole('link', { name: 'View the project on GitHub' });
        await expect(source).toHaveAttribute('href', /github\.com\/beeraw\/croche/);
    });

    test('the profile picker shows a tile per child', async ({ page }) => {
        await page.goto('/profils');

        await expect(page.locator('.profile-tile').first()).toContainText(DEMO.child);
    });

    test('the right code opens her pieces', async ({ page }) => {
        await signIn(page);

        await expect(page).toHaveURL(/\/morceaux$/);
        // The fixtures ship two; later tests add more, so this is a floor.
        expect(await page.locator('.score-card').count()).toBeGreaterThanOrEqual(2);
    });

    test('the wrong code is refused and says so', async ({ page }) => {
        await useLanguage(page, 'fr');
        await page.goto('/profils');
        await page.getByRole('link', { name: DEMO.child }).click();

        for (const digit of '9999'.split('')) {
            await page.locator(`.pin-pad__key[data-digit="${digit}"]`).click();
        }

        // A sentence, not the translation key it travels as.
        await expect(page.locator('.alert--error')).toHaveText("Ce code n'est pas le bon.");
        await expect(page).toHaveURL(/\/profils\/\d+$/);
    });

    test('the keypad fills its dots as digits are tapped', async ({ page }) => {
        await page.goto('/profils');
        await page.getByRole('link', { name: DEMO.child }).click();

        await expect(page.locator('.pin-pad__dot.is-filled')).toHaveCount(0);
        await page.locator('.pin-pad__key[data-digit="1"]').click();
        await expect(page.locator('.pin-pad__dot.is-filled')).toHaveCount(1);
        await page.locator('.pin-pad__key[data-digit="2"]').click();
        await expect(page.locator('.pin-pad__dot.is-filled')).toHaveCount(2);

        await page.getByRole('button', { name: /Effacer un chiffre|Erase one digit/ }).click();
        await expect(page.locator('.pin-pad__dot.is-filled')).toHaveCount(1);
    });

    test('a signed-out visitor cannot reach the editor', async ({ page }) => {
        const response = await page.goto('/morceaux');

        await expect(page).toHaveURL(/connexion|profils|\/$/);
        expect(response?.status()).toBeLessThan(500);
    });
});

test.describe('language', () => {
    test('the interface switches and stays switched', async ({ page }) => {
        await useLanguage(page, 'en');
        await page.goto('/profils');
        await expect(page.locator('.login__subtitle')).toContainText('Pick your profile');

        await useLanguage(page, 'fr');
        await page.goto('/profils');
        await expect(page.locator('.login__subtitle')).toContainText('Choisis ton profil');
    });

    test('the switcher is a menu, and picking from it switches', async ({ page }) => {
        await useLanguage(page, 'fr');
        await page.goto('/profils');

        const switcher = page.locator('.language');
        const menu = switcher.locator('.language__menu');

        await expect(switcher.locator('.language__badge')).toHaveText('FR');
        await expect(menu).toBeHidden();

        await switcher.locator('summary').click();
        await expect(menu).toBeVisible();
        await menu.getByRole('link', { name: 'English' }).click();

        await expect(page.locator('.login__subtitle')).toContainText('Pick your profile');
        await expect(switcher.locator('.language__badge')).toHaveText('EN');
    });

    test('the menu closes on Escape and on a tap outside', async ({ page }) => {
        await page.goto('/profils');

        const switcher = page.locator('.language');
        const menu = switcher.locator('.language__menu');

        await switcher.locator('summary').click();
        await expect(menu).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        await switcher.locator('summary').click();
        await expect(menu).toBeVisible();
        await page.locator('.login__subtitle').click();
        await expect(menu).toBeHidden();
    });

    test('the editor and the piano keys follow the language', async ({ page }) => {
        await useLanguage(page, 'fr');
        await signIn(page);
        await page.goto('/morceaux');
        await page.getByRole('heading', { name: DEMO.piece }).click();

        await expect(page.locator('.piano__key--anchor')).toHaveText('Do4');
        // The black keys are named by a pattern, so a language that spells the
        // sharp in one word — Cis — can be added without touching the code.
        await expect(page.locator('.piano__key--black').first()).toHaveAttribute('aria-label', 'Do dièse2');

        await useLanguage(page, 'en');
        await page.goto('/morceaux');
        await page.getByRole('heading', { name: DEMO.piece }).click();

        await expect(page.locator('.piano__key--anchor')).toHaveText('C4');
        await expect(page.locator('.piano__key--black').first()).toHaveAttribute('aria-label', 'C sharp2');
    });

    test('German spells the notes its own way', async ({ page }) => {
        await useLanguage(page, 'de');
        await signIn(page);
        await page.goto('/morceaux');
        await page.getByRole('heading', { name: DEMO.piece }).click();

        // B natural is H in German, and the sharp is welded to the name.
        await expect(page.locator('.piano__key--anchor')).toHaveText('C4');
        await expect(page.getByRole('button', { name: 'H3', exact: true })).toBeVisible();
        await expect(page.locator('.piano__key--black').first()).toHaveAttribute('aria-label', 'Cis2');
    });
});
