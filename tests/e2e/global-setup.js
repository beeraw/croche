import { execSync } from 'node:child_process';

/**
 * Puts the database back to the fixtures before a run.
 *
 * The end-to-end tests drive a live instance, so they need a known starting
 * point — and several of them create or edit pieces. This reloads the demo
 * data once per run. It is destructive: point CROCHE_BASE_URL at a development
 * instance, never at anything you care about.
 *
 * Set CROCHE_KEEP_DATA=1 to skip it and run against whatever is already there.
 */
export default function globalSetup() {
    if (process.env.CROCHE_KEEP_DATA === '1') {
        return;
    }

    execSync('php bin/console doctrine:fixtures:load --no-interaction --quiet', {
        stdio: 'inherit',
    });
}
