import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests.
 *
 * They run against a live instance rather than booting one, because the app
 * needs its database and compiled assets. Point CROCHE_BASE_URL at wherever
 * yours is served; see the README for the two commands to run first.
 *
 * All three engines are covered. WebKit is the one that matters most — the
 * iPad is the target device — but Chromium and Firefox catch the differences
 * that would otherwise only surface on somebody else's machine.
 */
const baseURL = process.env.CROCHE_BASE_URL ?? 'https://croche';

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.js',
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',

    use: {
        baseURL,
        // Caddy serves a locally-signed certificate in development.
        ignoreHTTPSErrors: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            // The real target: a tablet, touch input, portrait.
            name: 'ipad',
            use: { ...devices['iPad (gen 7)'] },
        },
    ],
});
