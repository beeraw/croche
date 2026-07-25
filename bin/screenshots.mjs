/**
 * Captures the screenshots shown in the README.
 *
 * It drives the running instance exactly as a child would — profile, code,
 * library, editor — on an iPad in landscape, the device the app is drawn for.
 * Two screens are captured twice: once plain, once with the guided tour open,
 * because the tour is what a first-time visitor actually sees.
 *
 *   node bin/screenshots.mjs
 *
 * It needs an instance that runs and the fixtures loaded, like the end-to-end
 * suite. Point CROCHE_BASE_URL elsewhere to aim at another instance.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { devices, webkit } from '@playwright/test';

const baseURL = process.env.CROCHE_BASE_URL ?? 'https://croche';
const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs/screenshots');

const DEMO = { child: 'Aïcha', pin: '2018', piece: 'Au clair de la lune' };

/** The web debug toolbar belongs to the developer, not to the README. */
const HIDE_DEV_CHROME = '.sf-toolbar, .sf-minitoolbar { display: none !important; }';

/**
 * The guided tours remember themselves in localStorage. Setting the flags keeps
 * them out of the plain screenshots; leaving them unset arms the auto-start.
 */
async function newContext({ tours = false } = {}) {
    const context = await browser.newContext({
        ...devices['iPad (gen 7) landscape'],
        baseURL,
        // Caddy serves a locally-signed certificate in development.
        ignoreHTTPSErrors: true,
        locale: 'fr-FR',
        reducedMotion: 'reduce',
    });

    if (!tours) {
        await context.addInitScript(() => {
            window.localStorage.setItem('croche.tour.scores', '1');
            window.localStorage.setItem('croche.tour.editor', '1');
        });
    }

    const page = await context.newPage();
    await page.goto('/langue/fr');

    return { context, page };
}

/** Signs in through the profile picker and the keypad. */
async function signIn(page) {
    await page.goto('/profils');
    await page.getByRole('link', { name: DEMO.child }).click();
    await page.locator('.pin-pad').waitFor();

    for (const digit of DEMO.pin.split('')) {
        await page.locator(`.pin-pad__key[data-digit="${digit}"]`).click();
    }

    await page.waitForURL('**/morceaux');
}

/** Opens a piece and waits for VexFlow to have drawn it. */
async function openScore(page) {
    await page.goto('/morceaux');
    await page.getByRole('heading', { name: DEMO.piece }).click();
    await page.locator('.score-sheet__canvas svg').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !!window.crocheApp);
}

async function shoot(page, name) {
    await page.addStyleTag({ content: HIDE_DEV_CHROME });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400); // bubbles and staves settling

    await page.screenshot({ path: join(outputDir, `${name}.png`) });
    console.log(`  docs/screenshots/${name}.png`);
}

await mkdir(outputDir, { recursive: true });
const browser = await webkit.launch();

console.log('Capturing…');

// The screens as they are, once the tours have been seen.
{
    const { context, page } = await newContext();

    await page.goto('/');
    await shoot(page, 'home');

    await page.goto('/profils');
    await shoot(page, 'profiles');

    await page.getByRole('link', { name: DEMO.child }).click();
    await page.locator('.pin-pad').waitFor();
    // Two digits in: enough to show the keypad answering, not enough to submit.
    await page.locator('.pin-pad__key[data-digit="2"]').click();
    await page.locator('.pin-pad__key[data-digit="0"]').click();
    await shoot(page, 'pin');

    await page.locator('.pin-pad__key[data-digit="1"]').click();
    await page.locator('.pin-pad__key[data-digit="8"]').click();
    await page.waitForURL('**/morceaux');
    await shoot(page, 'library');

    await openScore(page);
    await shoot(page, 'editor');

    await context.close();
}

// The same two screens as a first-time visitor meets them.
{
    const { context, page } = await newContext({ tours: true });

    await signIn(page);
    await page.locator('.driver-popover.tour-popover').waitFor();
    await shoot(page, 'library-tour');

    await page.locator('.driver-popover-close-btn').click();
    await openScore(page);
    await page.locator('.driver-popover.tour-popover').waitFor();

    // Walk to the piano: the step that shows best what the tour is for.
    for (let step = 1; step < 5; step += 1) {
        await page.locator('.driver-popover-next-btn').click();
    }

    await page.locator('.driver-popover-progress-text', { hasText: '5 / 16' }).waitFor();
    await shoot(page, 'editor-tour');

    await context.close();
}

await browser.close();
