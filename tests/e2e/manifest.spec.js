import { expect, test } from '@playwright/test';

import { useLanguage } from './helpers.js';

test.describe('installing on the home screen', () => {
    test('the manifest is linked and serves', async ({ page }) => {
        await page.goto('/');

        const link = page.locator('link[rel="manifest"]');
        await expect(link).toHaveAttribute('href', '/manifest.webmanifest');

        const href = await link.getAttribute('href');
        const response = await page.request.get(href);

        expect(response.status()).toBe(200);
        expect(response.headers()['content-type']).toContain('application/manifest+json');

        const manifest = await response.json();

        expect(manifest.display).toBe('standalone');
        expect(manifest.start_url).toBe('/');
    });

    test('the icons it points at are really there', async ({ page }) => {
        await page.goto('/');

        const manifest = await (await page.request.get('/manifest.webmanifest')).json();
        expect(manifest.icons.length).toBeGreaterThan(0);

        for (const icon of manifest.icons) {
            const response = await page.request.get(icon.src);

            expect(response.status(), icon.src).toBe(200);
            expect(response.headers()['content-type']).toContain('image/png');
        }
    });

    // The 180px icon never appears in the manifest: iOS takes it from the link
    // tag, and picks it over anything the manifest offers.
    test('iOS is given its own icon and told to drop the browser chrome', async ({ page }) => {
        await page.goto('/');

        await expect(page.locator('link[rel="apple-touch-icon"]'))
            .toHaveAttribute('href', '/icons/croche-180.png');
        await expect(page.locator('meta[name="apple-mobile-web-app-capable"]'))
            .toHaveAttribute('content', 'yes');
        await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]'))
            .toHaveAttribute('content', 'default');

        const response = await page.request.get('/icons/croche-180.png');
        expect(response.status()).toBe(200);
    });

    test('the installed name is written in the language on screen', async ({ page }) => {
        await useLanguage(page, 'es');
        await page.goto('/');

        const manifest = await (await page.request.get('/manifest.webmanifest')).json();

        expect(manifest.name).toBe('Croche — escribir música');
        expect(manifest.lang).toBe('es');
    });
});
