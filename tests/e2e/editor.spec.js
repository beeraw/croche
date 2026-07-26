import { expect, test } from '@playwright/test';

import { DEMO, editor, openScore, signIn, useLanguage } from './helpers.js';

test.beforeEach(async ({ page }) => {
    await useLanguage(page, 'fr');
    await signIn(page);
});

test.describe('rendering', () => {
    test('the grand staff is drawn with both clefs', async ({ page }) => {
        await openScore(page);

        const svg = page.locator('.score-sheet__canvas svg');
        await expect(svg).toBeVisible();
        // Bravura draws its glyphs as text, so a bare staff would have none.
        expect(await svg.locator('text').count()).toBeGreaterThan(10);
    });

    test('the barlines of the two staves line up', async ({ page }) => {
        await openScore(page);

        const aligned = await editor(page).eval(`
            const treble = c.renderer.measures.filter((m) => m.staveIndex === 0);
            const bass = c.renderer.measures.filter((m) => m.staveIndex === 1);
            return treble.length > 0 && treble.every((m, i) => Math.abs(m.x - bass[i].x) < 0.01
                && Math.abs(m.width - bass[i].width) < 0.01);
        `);

        expect(aligned).toBe(true);
    });

    test('the music fonts are loaded locally', async ({ page }) => {
        await openScore(page);

        const fonts = await page.evaluate(() => Array.from(document.fonts)
            .filter((f) => f.status === 'loaded')
            .map((f) => f.family));

        expect(fonts).toContain('Bravura');
        expect(fonts).toContain('Nunito');
    });

    test('nothing is fetched from another host', async ({ page }) => {
        const external = [];
        page.on('request', (request) => {
            const url = new URL(request.url());
            if (url.host !== new URL(page.url() || 'https://croche').host) {
                external.push(request.url());
            }
        });

        await openScore(page);
        await page.waitForTimeout(500);

        expect(external).toEqual([]);
    });
});

test.describe('entering notes', () => {
    test('a full bar refuses another note and explains why', async ({ page }) => {
        await openScore(page);

        const before = await editor(page).eval('return c.document.measure(0, 0).notes.length;');
        await editor(page).eval(`
            c.activeStave = 0;
            c.selection = null;
            c.insertNote({ keys: ['g/4'], duration: 'q', accidental: null, rest: false }, 0);
        `);

        expect(await editor(page).eval('return c.document.measure(0, 0).notes.length;')).toBe(before);
        await expect(page.locator('.editor__notice')).toContainText(/pleine|full/i);
        await expect(page.locator('.measure-refused')).toHaveCount(1);
    });

    test('adding a bar adds it to both staves at once', async ({ page }) => {
        await openScore(page);

        const before = await editor(page).eval('return c.document.measureCount;');
        await page.getByRole('button', { name: /Ajouter une mesure|Add a bar/ }).click();

        const after = await editor(page).eval(`return {
            count: c.document.measureCount,
            treble: c.document.stave(0).measures.length,
            bass: c.document.stave(1).measures.length,
        };`);

        expect(after.count).toBe(before + 1);
        expect(after.treble).toBe(after.bass);
    });

    test('tapping the staff places a note on the line under the finger', async ({ page }) => {
        await openScore(page);

        const result = await editor(page).eval(`
            c.activeStave = 0;
            c.selection = null;
            c.addMeasure();
            const target = c.document.measureCount - 1;
            const measure = c.renderer.measures.find(
                (m) => m.staveIndex === 0 && m.measureIndex === target,
            );
            const svg = document.querySelector('.score-sheet__canvas svg');
            const rect = svg.getBoundingClientRect();
            const sx = rect.width / svg.viewBox.baseVal.width;
            const sy = rect.height / svg.viewBox.baseVal.height;

            document.querySelector('.score-sheet__canvas').dispatchEvent(new PointerEvent('pointerdown', {
                clientX: rect.left + (measure.noteStartX + 25) * sx,
                clientY: rect.top + measure.stave.getYForLine(4) * sy,
                bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
            }));

            const notes = c.document.measure(0, target).notes;
            return { added: notes.length, key: notes[0]?.keys?.[0] ?? null };
        `);

        expect(result.added).toBe(1);
        // The bottom line of a treble staff is E above middle C.
        expect(result.key).toBe('e/4');
    });

    test('a rest is stored as a rest', async ({ page }) => {
        await openScore(page);

        const isRest = await editor(page).eval(`
            c.addMeasure();
            const target = c.document.measureCount - 1;
            c.insertNote({ keys: ['b/4'], duration: 'h', accidental: null, rest: true }, target);
            return c.document.measure(0, target).notes[0].rest;
        `);

        expect(isRest).toBe(true);
    });

    test('dragging a note up transposes it, in one undo step', async ({ page }) => {
        await openScore(page);

        const result = await editor(page).eval(`
            c.activeStave = 0;
            c.selection = null;
            c.render();

            const before = c.document.note(0, 0, 0).keys[0];
            const entry = c.renderer.notes.find(
                (n) => n.staveIndex === 0 && n.measureIndex === 0 && n.noteIndex === 0,
            );
            const measure = c.renderer.measures.find((m) => m.staveIndex === 0 && m.measureIndex === 0);
            const svg = document.querySelector('.score-sheet__canvas svg');
            const rect = svg.getBoundingClientRect();
            const sx = rect.width / svg.viewBox.baseVal.width;
            const sy = rect.height / svg.viewBox.baseVal.height;
            const step = (measure.stave.getSpacingBetweenLines() / 2) * sy;
            const x = rect.left + entry.x * sx;
            const y = rect.top + entry.y * sy;

            document.querySelector('.score-sheet__canvas').dispatchEvent(new PointerEvent('pointerdown', {
                clientX: x, clientY: y, bubbles: true, cancelable: true, pointerId: 7, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointermove', {
                clientX: x, clientY: y - step * 3, bubbles: true, pointerId: 7, isPrimary: true,
            }));
            const during = c.document.note(0, 0, 0).keys[0];
            window.dispatchEvent(new PointerEvent('pointerup', {
                clientX: x, clientY: y - step * 3, bubbles: true, pointerId: 7, isPrimary: true,
            }));

            c.undo();
            return { before, during, afterUndo: c.document.note(0, 0, 0).keys[0] };
        `);

        expect(result.before).toBe('c/4');
        // Three diatonic steps above C is F.
        expect(result.during).toBe('f/4');
        expect(result.afterUndo).toBe('c/4');
    });
});

test.describe('marking a note', () => {
    test('the selection is marked, and the mark follows it', async ({ page }) => {
        await openScore(page);

        await editor(page).eval('c.selection = { staveIndex: 0, measureIndex: 0, noteIndex: 0 }; c.render();');
        await expect(page.locator('.note--selected')).toHaveCount(1);
        await expect(page.locator('.note-halo--selected')).toHaveCount(1);

        const first = await page.locator('.note-halo--selected').getAttribute('x');

        await editor(page).eval('c.selection = { staveIndex: 0, measureIndex: 0, noteIndex: 1 }; c.render();');
        await expect(page.locator('.note-halo--selected')).toHaveCount(1);
        expect(await page.locator('.note-halo--selected').getAttribute('x')).not.toBe(first);

        await editor(page).eval('c.selection = null; c.render();');
        await expect(page.locator('.note-halo--selected')).toHaveCount(0);
    });

    test('the mark sits on the notehead, not over the stem', async ({ page }) => {
        await openScore(page);

        const spaces = await editor(page).eval(`
            c.selection = { staveIndex: 0, measureIndex: 0, noteIndex: 0 };
            c.render();

            const halo = document.querySelector('.note-halo--selected');
            const measure = c.renderer.measures.find((m) => m.staveIndex === 0 && m.measureIndex === 0);
            return Number(halo.getAttribute('height')) / measure.stave.getSpacingBetweenLines();
        `);

        // A quarter note's stem runs some three staff spaces; measuring the
        // note through the SVG rather than through VexFlow gives Bravura's em
        // box instead of its ink, and the mark comes out as a column.
        expect(spaces).toBeLessThan(2.5);
    });

    test('playback lights the note each hand is on, and puts it out at the end', async ({ page }) => {
        await openScore(page);

        await page.getByRole('button', { name: /Écouter|Play/ }).click();

        // The opening bar has notes on both staves, so both light together.
        await expect.poll(
            () => page.locator('.note--playing').count(),
            { timeout: 5_000 },
        ).toBe(2);
        await expect(page.locator('.note-halo--playing')).toHaveCount(2);

        await page.getByRole('button', { name: /Arrêter|Stop/ }).click();
        await expect(page.locator('.note--playing')).toHaveCount(0);
        await expect(page.locator('.note-halo--playing')).toHaveCount(0);
    });

    test('the play button becomes a stop button while it plays', async ({ page }) => {
        await openScore(page);

        await expect(page.locator('.play-button__icon--play')).toBeVisible();
        await expect(page.locator('.play-button__icon--stop')).toBeHidden();

        await page.getByRole('button', { name: /Écouter|Play/ }).click();
        await expect(page.locator('.play-button__icon--stop')).toBeVisible();
        await expect(page.locator('.play-button__icon--play')).toBeHidden();

        await page.getByRole('button', { name: /Arrêter|Stop/ }).click();
        await expect(page.locator('.play-button__icon--play')).toBeVisible();
        await expect(page.locator('.play-button__icon--stop')).toBeHidden();
    });

    test('dragging across the score does not sweep a text selection over it', async ({ page }) => {
        await openScore(page);

        // Starts above every staff, so the drag places nothing and moves
        // nothing: the piece this suite shares comes out of it untouched.
        const from = await page.locator('.score-sheet__canvas').evaluate((canvas) => {
            const rect = canvas.getBoundingClientRect();

            return { x: rect.left + 40, y: rect.top + 3 };
        });

        await page.mouse.move(from.x, from.y);
        await page.mouse.down();

        for (let step = 1; step <= 14; step += 1) {
            await page.mouse.move(from.x + step * 45, from.y + step * 22);
        }

        // VexFlow draws its glyphs as <text>, and without user-select Safari
        // highlights every one the drag crosses — which is the whole score.
        const selected = await page.evaluate(() => window.getSelection().toString());
        await page.mouse.up();

        expect(selected).toBe('');
        expect(await editor(page).eval('return c.document.note(0, 0, 0).keys[0];')).toBe('c/4');
    });
});

test.describe('undo and redo', () => {
    test('they walk back and forth through the edits', async ({ page }) => {
        await openScore(page);

        const start = await editor(page).eval('return c.document.measureCount;');
        await page.getByRole('button', { name: /Ajouter une mesure|Add a bar/ }).click();
        await page.getByRole('button', { name: /Ajouter une mesure|Add a bar/ }).click();
        expect(await editor(page).eval('return c.document.measureCount;')).toBe(start + 2);

        await page.getByRole('button', { name: /^(Annuler|Undo)$/ }).click();
        expect(await editor(page).eval('return c.document.measureCount;')).toBe(start + 1);

        await page.getByRole('button', { name: /^(Rétablir|Redo)$/ }).click();
        expect(await editor(page).eval('return c.document.measureCount;')).toBe(start + 2);
    });
});

test.describe('autosave', () => {
    test('a change reaches the server without a save button', async ({ page }) => {
        await openScore(page);

        await expect(page.locator('.editor')).not.toContainText(/Enregistrer$/);

        await page.getByRole('button', { name: /Ajouter une mesure|Add a bar/ }).click();
        await expect(page.locator('.save-state')).toHaveAttribute('data-state', /pending|saving|saved/);

        await expect(page.locator('.save-state')).toHaveAttribute('data-state', 'saved', { timeout: 10_000 });

        // And it survives a reload, which is the whole point.
        const expected = await editor(page).eval('return c.document.measureCount;');
        await page.reload();
        await expect(page.locator('.score-sheet__canvas svg')).toBeVisible();
        await expect
            .poll(() => page.evaluate(() => !!window.crocheApp), { timeout: 10_000 })
            .toBe(true);

        expect(await editor(page).eval('return c.document.measureCount;')).toBe(expected);
    });
});

test.describe('the library', () => {
    test('a new piece can be created and opened', async ({ page }) => {
        await page.goto('/morceaux');
        const before = await page.locator('.score-card').count();

        await page.getByRole('button', { name: /Nouveau morceau|New piece/ }).click();
        await expect(page).toHaveURL(/\/morceaux\/\d+$/);
        await expect(page.locator('.score-sheet__canvas svg')).toBeVisible();

        await page.goto('/morceaux');
        await expect(page.locator('.score-card')).toHaveCount(before + 1);
    });

    test('a child sees only her own pieces', async ({ page }) => {
        await page.goto('/api/scores');
        const body = await page.evaluate(() => JSON.parse(document.body.textContent));

        const owners = new Set(body.scores.map((s) => s.owner.displayName));
        expect([...owners]).toEqual([DEMO.child]);
    });
});
