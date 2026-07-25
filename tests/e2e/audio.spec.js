import { expect, test } from '@playwright/test';

import { DEMO, openScore, signIn, useLanguage } from './helpers.js';

/**
 * The timbre is synthesised, so it can be measured rather than listened to.
 * These tests render the engine's own voices into an OfflineAudioContext and
 * check the shape of the waveform: scheduling nodes proves nothing on its own.
 */

/** Renders one note offline and returns the samples, plus a few helpers. */
const PROBE = `
const engine = window.crocheApp
    .getControllerForElementAndIdentifier(document.querySelector('.editor'), 'score-editor').audio;

const render = async (key, seconds) => {
    const rate = 44100;
    const offline = new OfflineAudioContext(1, rate * seconds, rate);
    const saved = {
        context: engine.context, master: engine.master,
        wave: engine.wave, hammer: engine.hammerBuffer,
    };

    engine.context = offline;
    engine.master = offline.createGain();
    engine.master.gain.value = 1;
    engine.master.connect(offline.destination);
    engine.wave = engine.buildWave();
    engine.hammerBuffer = engine.buildHammerBuffer();

    engine.playNote(key, null, 1.0, 0);
    const buffer = await offline.startRendering();

    engine.context = saved.context;
    engine.master = saved.master;
    engine.wave = saved.wave;
    engine.hammerBuffer = saved.hammer;

    return { data: buffer.getChannelData(0), rate };
};

/** Peak amplitude per 10 ms block: the loudness envelope. */
const envelope = ({ data, rate }) => {
    const block = Math.floor(rate * 0.01);
    const out = [];
    for (let i = 0; i + block <= data.length; i += block) {
        let peak = 0;
        for (let j = i; j < i + block; j += 1) peak = Math.max(peak, Math.abs(data[j]));
        out.push(peak);
    }
    return out;
};

/** Magnitude of one frequency bin, by Goertzel. */
const bin = (data, from, to, freq, rate) => {
    const w = 2 * Math.PI * freq / rate;
    const coeff = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = from; i < to; i += 1) {
        const s0 = data[i] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
    }
    return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2) / (to - from);
};

/** Energy in harmonics 4 to 10, relative to the fundamental and the octave. */
const upperRatio = (data, from, to, f0, rate) => {
    let low = 0;
    let high = 0;
    for (let n = 1; n <= 10; n += 1) {
        const m = bin(data, from, to, f0 * n, rate);
        if (n <= 2) low += m; else if (n >= 4) high += m;
    }
    return low > 0 ? high / low : 0;
};

/** Fundamental by autocorrelation, immune to extra harmonic zero crossings. */
const fundamental = (data, from, rate) => {
    const size = 4096;
    const slice = data.subarray(from, from + size);
    let best = 0;
    let bestLag = 0;
    for (let lag = Math.floor(rate / 1200); lag < Math.floor(rate / 80); lag += 1) {
        let sum = 0;
        for (let i = 0; i + lag < size; i += 1) sum += slice[i] * slice[i + lag];
        if (sum > best) { best = sum; bestLag = lag; }
    }
    return bestLag ? rate / bestLag : 0;
};
`;

test.beforeEach(async ({ page }) => {
    await useLanguage(page, 'fr');
    await signIn(page);
});

test.describe('the piano tone', () => {
    test('a note sounds, with a percussive envelope and no sustain plateau', async ({ page }) => {
        await openScore(page);

        const report = await page.evaluate(`(async () => {
            ${PROBE}
            const a4 = await render('a/4', 2);
            const env = envelope(a4);
            const peak = Math.max(...env);
            const peakAt = env.indexOf(peak);

            // Past the attack the envelope must only ever fall. A sustain
            // plateau would show up as a long run of near-equal blocks.
            let rises = 0;
            let plateau = 0;
            let longestPlateau = 0;
            for (let i = peakAt + 2; i < 100; i += 1) {
                if (env[i] > env[i - 1] * 1.06) rises += 1;
                if (env[i] > env[i - 1] * 0.995) {
                    plateau += 1;
                    longestPlateau = Math.max(longestPlateau, plateau);
                } else {
                    plateau = 0;
                }
            }

            let tail = 0;
            for (let i = a4.data.length - 4410; i < a4.data.length; i += 1) {
                tail = Math.max(tail, Math.abs(a4.data[i]));
            }

            return {
                peak, attackMs: peakAt * 10, rises,
                longestPlateauMs: longestPlateau * 10,
                fundamental: Math.round(fundamental(a4.data, 22050, a4.rate)),
                tail,
            };
        })()`);

        expect(report.peak, 'the note is audible').toBeGreaterThan(0.1);
        expect(report.attackMs, 'the attack is immediate').toBeLessThanOrEqual(30);
        expect(report.rises, 'the decay never turns back up').toBe(0);
        expect(report.longestPlateauMs, 'no sustain plateau').toBeLessThan(120);
        expect(Math.abs(report.fundamental - 440), 'A4 is in tune').toBeLessThan(12);
        expect(report.tail, 'it releases cleanly, with no click').toBeLessThan(0.001);
    });

    test('the low-pass closes across the note', async ({ page }) => {
        await openScore(page);

        const report = await page.evaluate(`(async () => {
            ${PROBE}
            const a4 = await render('a/4', 2);
            return {
                early: upperRatio(a4.data, 2205, 6615, 440, a4.rate),
                late: upperRatio(a4.data, 30000, 40000, 440, a4.rate),
            };
        })()`);

        expect(report.early, 'the attack is bright, not veiled').toBeGreaterThan(0.3);
        expect(report.late, 'the upper partials fade before the fundamental')
            .toBeLessThan(report.early * 0.7);
    });

    test('the bass decays more slowly than the treble, and sits below it', async ({ page }) => {
        await openScore(page);

        const report = await page.evaluate(`(async () => {
            ${PROBE}
            const bass = await render('c/2', 4);
            const treble = await render('c/6', 4);
            const left = (r) => {
                const e = envelope(r);
                return e[90] / Math.max(...e);
            };
            return {
                bassLeft: left(bass),
                trebleLeft: left(treble),
                bassPeak: Math.max(...envelope(bass)),
                treblePeak: Math.max(...envelope(treble)),
            };
        })()`);

        expect(report.bassLeft, 'a bass note still rings at 0.9 s')
            .toBeGreaterThan(report.trebleLeft * 2.5);
        expect(report.trebleLeft, 'a treble note is all but gone by then').toBeLessThan(0.2);
        expect(report.bassPeak, 'the left hand sits under the right')
            .toBeLessThan(report.treblePeak * 0.85);
    });

    test('stacked notes do not clip', async ({ page }) => {
        await openScore(page, DEMO.scale);

        const report = await page.evaluate(`(async () => {
            const ed = window.crocheApp
                .getControllerForElementAndIdentifier(document.querySelector('.editor'), 'score-editor');
            const pb = window.crocheApp
                .getControllerForElementAndIdentifier(document.querySelector('.editor'), 'playback');
            const engine = ed.audio;
            const timeline = pb.buildTimeline(ed.document);

            const rate = 44100;
            const offline = new OfflineAudioContext(1, rate * Math.ceil(timeline.total + 2), rate);
            const saved = {
                context: engine.context, master: engine.master,
                wave: engine.wave, hammer: engine.hammerBuffer,
            };

            engine.context = offline;
            engine.master = offline.createGain();
            engine.master.gain.value = 0.7;
            engine.master.connect(offline.destination);
            engine.wave = engine.buildWave();
            engine.hammerBuffer = engine.buildHammerBuffer();

            timeline.events.forEach((e) => e.keys.forEach(
                (k) => engine.playNote(k, e.accidental, e.duration, e.at + 0.05),
            ));
            const buffer = await offline.startRendering();

            engine.context = saved.context;
            engine.master = saved.master;
            engine.wave = saved.wave;
            engine.hammerBuffer = saved.hammer;

            const d = buffer.getChannelData(0);
            let peak = 0;
            let clipped = 0;
            for (let i = 0; i < d.length; i += 1) {
                const a = Math.abs(d[i]);
                if (a > peak) peak = a;
                if (a >= 0.999) clipped += 1;
            }

            return { events: timeline.events.length, peak, clipped };
        })()`);

        expect(report.events, 'every note is scheduled').toBeGreaterThan(15);
        expect(report.clipped, 'no sample is clipped').toBe(0);
        expect(report.peak, 'there is headroom left').toBeLessThan(0.9);
    });

    test('stopping silences every voice, hammer included', async ({ page }) => {
        await openScore(page);

        const report = await page.evaluate(`(() => {
            const engine = window.crocheApp
                .getControllerForElementAndIdentifier(document.querySelector('.editor'), 'score-editor').audio;
            engine.unlock();
            engine.playNote('c/4', null, 5);
            engine.playNote('e/4', null, 5);

            const before = engine.active.size;
            const nodes = [...engine.active].map((v) => ({
                sources: v.sources.length, gains: v.gains.length,
            }));
            engine.stop();

            return { before, after: engine.active.size, nodes };
        })()`);

        expect(report.before).toBe(2);
        expect(report.after).toBe(0);
        // One oscillator plus one hammer source, each with its own gain.
        expect(report.nodes.every((n) => n.sources === 2 && n.gains === 2)).toBe(true);
    });
});

test.describe('playback', () => {
    test('the cursor appears, advances and disappears', async ({ page }) => {
        await openScore(page);

        await page.getByRole('button', { name: /^(Écouter|Play)$/ }).click();
        await expect(page.locator('.playhead')).toHaveClass(/is-visible/);

        const first = await page.locator('.playhead').evaluate((el) => parseFloat(getComputedStyle(el).left));
        const height = await page.locator('.playhead').evaluate((el) => parseFloat(getComputedStyle(el).height));
        // It spans the whole system, not just one staff.
        expect(height).toBeGreaterThan(120);

        await page.waitForTimeout(1400);
        const later = await page.locator('.playhead').evaluate((el) => parseFloat(getComputedStyle(el).left));
        expect(later).toBeGreaterThan(first);

        await page.getByRole('button', { name: /^(Arrêter|Stop)$/ }).click();
        await expect(page.locator('.playhead')).not.toHaveClass(/is-visible/);
    });

    test('both staves are scheduled together', async ({ page }) => {
        await openScore(page);

        const timeline = await page.evaluate(`(() => {
            const ed = window.crocheApp
                .getControllerForElementAndIdentifier(document.querySelector('.editor'), 'score-editor');
            const pb = window.crocheApp
                .getControllerForElementAndIdentifier(document.querySelector('.editor'), 'playback');
            const t = pb.buildTimeline(ed.document);
            return { events: t.events.length, marks: t.marks.length, total: t.total };
        })()`);

        expect(timeline.events).toBeGreaterThan(15);
        expect(timeline.total).toBeGreaterThan(5);
        expect(timeline.marks).toBeGreaterThanOrEqual(timeline.events);
    });
});
