import {
    Accidental,
    Beam,
    Formatter,
    Renderer,
    Stave,
    StaveConnector,
    StaveNote,
    Voice,
} from 'vexflow/bravura';

import { beatsPerMeasure } from './schema.js';
import { bottomLineStep, keyToStep, stepToKey } from './pitch.js';

const STAVE_GAP = 100; // vertical distance between the two staves of a system
const SYSTEM_GAP = 60; // blank space below a system before the next one
const SYSTEM_HEIGHT = STAVE_GAP + 40;
const TOP_MARGIN = 30;
const SIDE_MARGIN = 12;
const MIN_MEASURE_WIDTH = 190;
const FIRST_MEASURE_EXTRA = 90; // room for clef, key and time signature

/** Where a whole rest sits when a measure is empty. */
const REST_KEY = { treble: 'b/4', bass: 'd/3' };

/**
 * Draws the grand staff with VexFlow and remembers where everything landed.
 *
 * The two staves are formatted together, measure by measure, so their barlines
 * line up vertically — formatting them independently would let the same measure
 * end at two different x positions.
 *
 * Rendering also produces the geometry the editor needs: which note is under a
 * finger, which measure a tap falls in, and where the playhead should be.
 */
export default class ScoreRenderer {
    constructor(element) {
        this.element = element;
        this.renderer = new Renderer(element, Renderer.Backends.SVG);
        this.context = this.renderer.getContext();

        /** @type {Array<{staveIndex: number, measureIndex: number, noteIndex: number, x: number, y: number, top: number, height: number, note: StaveNote}>} */
        this.notes = [];
        /** @type {Array<{staveIndex: number, measureIndex: number, x: number, width: number, top: number, height: number, stave: Stave}>} */
        this.measures = [];
    }

    /**
     * @param {import('./ScoreDocument.js').default} document
     * @param {{activeStave: number, selection: ?object}} state
     */
    render(document, state = { activeStave: 0, selection: null }) {
        this.notes = [];
        this.measures = [];

        const width = Math.max(560, this.element.clientWidth || 900);
        const perLine = this.measuresPerLine(width, document.measureCount);
        const lineCount = Math.ceil(document.measureCount / perLine);
        const height = TOP_MARGIN + lineCount * (SYSTEM_HEIGHT + SYSTEM_GAP);

        this.context.clear();
        this.renderer.resize(width, height);
        this.context.setViewBox(0, 0, width, height);

        for (let line = 0; line < lineCount; line += 1) {
            const from = line * perLine;
            const to = Math.min(from + perLine, document.measureCount);

            this.drawSystem(document, state, line, from, to, width);
        }

        this.applySelection(state.selection);

        return { width, height };
    }

    measuresPerLine(width, measureCount) {
        const usable = width - SIDE_MARGIN * 2 - FIRST_MEASURE_EXTRA;
        const fit = Math.floor(usable / MIN_MEASURE_WIDTH);

        return Math.max(1, Math.min(fit || 1, 4, measureCount));
    }

    drawSystem(document, state, line, from, to, width) {
        const trebleY = TOP_MARGIN + line * (SYSTEM_HEIGHT + SYSTEM_GAP);
        const bassY = trebleY + STAVE_GAP;
        const count = to - from;

        const available = width - SIDE_MARGIN * 2 - FIRST_MEASURE_EXTRA;
        const measureWidth = available / count;

        // Staves are built first so the active-stave tint can be positioned from
        // their real line positions, and painted before anything else — in SVG,
        // draw order is paint order.
        const pairs = [];
        let x = SIDE_MARGIN;

        for (let index = from; index < to; index += 1) {
            const isFirstOfLine = index === from;
            const thisWidth = measureWidth + (isFirstOfLine ? FIRST_MEASURE_EXTRA : 0);

            const treble = new Stave(x, trebleY, thisWidth);
            const bass = new Stave(x, bassY, thisWidth);

            if (isFirstOfLine) {
                treble.addClef('treble').addKeySignature(document.content.keySignature);
                bass.addClef('bass').addKeySignature(document.content.keySignature);

                if (line === 0) {
                    treble.addTimeSignature(document.timeSignature);
                    bass.addTimeSignature(document.timeSignature);
                }
            }

            pairs.push({ index, treble, bass });
            x += thisWidth;
        }

        const active = pairs[0][state.activeStave === 0 ? 'treble' : 'bass'];
        this.drawActiveBand(active, SIDE_MARGIN, x - SIDE_MARGIN);

        // The playhead spans the whole system, from the top of the treble to
        // the bottom of the bass, so it reads as one cursor rather than two.
        const system = {
            top: pairs[0].treble.getTopLineTopY(),
            bottom: pairs[0].bass.getBottomLineBottomY(),
        };

        pairs.forEach(({ index, treble, bass }) => {
            treble.setContext(this.context).draw();
            bass.setContext(this.context).draw();

            this.formatMeasure(document, index, treble, bass, system);

            this.measures.push(
                this.measureGeometry(0, index, treble),
                this.measureGeometry(1, index, bass),
            );
        });

        const { treble: firstTreble, bass: firstBass } = pairs[0];

        new StaveConnector(firstTreble, firstBass)
            .setType('brace')
            .setContext(this.context)
            .draw();

        new StaveConnector(firstTreble, firstBass)
            .setType('singleLeft')
            .setContext(this.context)
            .draw();
    }

    /**
     * Formats both staves of one measure in a single pass, which is what keeps
     * the barlines aligned.
     */
    formatMeasure(document, measureIndex, trebleStave, bassStave, system) {
        const numBeats = beatsPerMeasure(document.timeSignature);
        const voices = [];
        const beams = [];

        [
            { staveIndex: 0, stave: trebleStave, clef: 'treble' },
            { staveIndex: 1, stave: bassStave, clef: 'bass' },
        ].forEach(({ staveIndex, stave, clef }) => {
            const measure = document.measure(staveIndex, measureIndex);
            const built = this.buildNotes(measure, clef, staveIndex, measureIndex);

            const voice = new Voice({ numBeats, beatValue: 4 })
                .setMode(Voice.Mode.SOFT)
                .setStave(stave);
            voice.addTickables(built.staveNotes);

            beams.push(...Beam.generateBeams(built.staveNotes.filter((note) => !note.isRest())));
            voices.push({ voice, stave, entries: built.entries });
        });

        const formatter = new Formatter();
        voices.forEach(({ voice }) => formatter.joinVoices([voice]));

        const justifyWidth = Math.max(
            60,
            trebleStave.getNoteEndX() - trebleStave.getNoteStartX() - 16,
        );
        formatter.format(voices.map(({ voice }) => voice), justifyWidth);

        voices.forEach(({ voice, stave, entries }) => {
            voice.draw(this.context, stave);
            entries.forEach((entry) => this.recordNote(entry, stave, system));
        });

        beams.forEach((beam) => beam.setContext(this.context).draw());
    }

    /**
     * Turns stored notes into VexFlow notes. An empty measure gets a whole rest
     * drawn on the fly — the document itself stays a faithful record of what
     * was actually entered.
     */
    buildNotes(measure, clef, staveIndex, measureIndex) {
        const staveNotes = [];
        const entries = [];

        if (!measure || measure.notes.length === 0) {
            staveNotes.push(
                new StaveNote({
                    keys: [REST_KEY[clef]],
                    duration: 'wr',
                    clef,
                    alignCenter: true,
                }),
            );

            return { staveNotes, entries };
        }

        measure.notes.forEach((note, noteIndex) => {
            const staveNote = new StaveNote({
                keys: note.rest ? [REST_KEY[clef]] : note.keys,
                duration: note.rest ? `${note.duration}r` : note.duration,
                clef,
            });

            if (!note.rest && note.accidental) {
                note.keys.forEach((_key, keyIndex) => {
                    staveNote.addModifier(new Accidental(note.accidental), keyIndex);
                });
            }

            staveNotes.push(staveNote);
            entries.push({ staveIndex, measureIndex, noteIndex, staveNote });
        });

        return { staveNotes, entries };
    }

    recordNote({ staveIndex, measureIndex, noteIndex, staveNote }, stave, system) {
        const box = staveNote.getBoundingBox();

        this.notes.push({
            staveIndex,
            measureIndex,
            noteIndex,
            x: staveNote.getAbsoluteX(),
            y: box ? box.getY() + box.getH() / 2 : stave.getYForLine(2),
            top: stave.getTopLineTopY(),
            height: stave.getBottomLineBottomY() - stave.getTopLineTopY(),
            // Bounds of the whole system, for the playback cursor.
            systemTop: system.top,
            systemHeight: system.bottom - system.top,
            element: staveNote.getSVGElement(),
        });
    }

    measureGeometry(staveIndex, measureIndex, stave) {
        const top = stave.getTopLineTopY();

        return {
            staveIndex,
            measureIndex,
            x: stave.getX(),
            width: stave.getWidth(),
            noteStartX: stave.getNoteStartX(),
            noteEndX: stave.getNoteEndX(),
            top,
            height: stave.getBottomLineBottomY() - top,
            stave,
        };
    }

    /**
     * Soft tint marking which stave the next note will land on.
     *
     * Wrapped in its own group so the print stylesheet can drop it: printing
     * forces every shape in the SVG to solid black, which would turn this
     * translucent band into a bar across the staff.
     */
    drawActiveBand(stave, x, width) {
        const top = stave.getTopLineTopY() - 10;
        const height = stave.getBottomLineBottomY() - stave.getTopLineTopY() + 20;

        this.context.openGroup('active-stave');
        this.context.save();
        this.context.setFillStyle('rgba(240, 138, 36, 0.10)');
        this.context.fillRect(x - 6, top, width + 12, height);
        this.context.restore();
        this.context.closeGroup();
    }

    applySelection(selection) {
        if (!selection) {
            return;
        }

        const match = this.notes.find(
            (entry) => entry.staveIndex === selection.staveIndex
                && entry.measureIndex === selection.measureIndex
                && entry.noteIndex === selection.noteIndex,
        );

        match?.element?.classList.add('note--selected');
    }

    // --- Hit testing -----------------------------------------------------

    /**
     * Converts a pointer event into coordinates inside the drawing.
     */
    toLocalPoint(event) {
        const svg = this.element.querySelector('svg');

        if (!svg) {
            return null;
        }

        const rect = svg.getBoundingClientRect();
        const scaleX = svg.viewBox.baseVal.width / rect.width || 1;
        const scaleY = svg.viewBox.baseVal.height / rect.height || 1;

        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    }

    /**
     * Nearest note within a finger-sized radius, or null.
     */
    noteAt({ x, y }, radius = 26) {
        let best = null;
        let bestDistance = Infinity;

        this.notes.forEach((entry) => {
            if (y < entry.top - 20 || y > entry.top + entry.height + 20) {
                return;
            }

            const distance = Math.abs(entry.x - x);

            if (distance < radius && distance < bestDistance) {
                best = entry;
                bestDistance = distance;
            }
        });

        return best;
    }

    measureAt({ x, y }) {
        return this.measures.find(
            (measure) => x >= measure.x
                && x <= measure.x + measure.width
                && y >= measure.top - 24
                && y <= measure.top + measure.height + 24,
        ) ?? null;
    }

    /**
     * Snaps a y coordinate to the nearest line or space of that stave, and
     * returns the pitch sitting there.
     */
    keyAt(measureGeometry, y) {
        const { stave, staveIndex } = measureGeometry;
        const spacing = stave.getSpacingBetweenLines() / 2;
        const topLineY = stave.getYForLine(0);
        const topLineStep = bottomLineStep(staveIndex === 1 ? 'bass' : 'treble') + 8;

        // Steps are counted down from the top line, so the five staff lines
        // occupy 0 to -8. Four more steps either side allows a couple of ledger
        // lines without letting a stray tap land three octaves away.
        const steps = Math.round((topLineY - y) / spacing);
        const clamped = Math.max(-12, Math.min(4, steps));

        return stepToKey(topLineStep + clamped);
    }

    /**
     * Vertical distance in diatonic steps, for dragging a note up or down.
     */
    stepsFromPixels(measureGeometry, deltaY) {
        const spacing = measureGeometry.stave.getSpacingBetweenLines() / 2;

        return -Math.round(deltaY / spacing);
    }

    /**
     * Playhead geometry for one note, in drawing coordinates.
     */
    playheadFor(staveIndex, measureIndex, noteIndex) {
        return this.notes.find(
            (entry) => entry.staveIndex === staveIndex
                && entry.measureIndex === measureIndex
                && entry.noteIndex === noteIndex,
        ) ?? null;
    }

    /**
     * Scale between drawing coordinates and on-screen pixels.
     */
    displayScale() {
        const svg = this.element.querySelector('svg');

        if (!svg) {
            return { x: 1, y: 1, offsetTop: 0, offsetLeft: 0 };
        }

        const rect = svg.getBoundingClientRect();
        const parent = this.element.getBoundingClientRect();

        return {
            x: rect.width / (svg.viewBox.baseVal.width || 1),
            y: rect.height / (svg.viewBox.baseVal.height || 1),
            offsetTop: rect.top - parent.top,
            offsetLeft: rect.left - parent.left,
        };
    }
}

export { keyToStep };
