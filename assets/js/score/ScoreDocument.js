import {
    BEAT_EPSILON,
    CLEFS,
    DURATION_BEATS,
    MAX_MEASURES,
    TEMPO_MAX,
    TEMPO_MIN,
    beatsPerMeasure,
    blankContent,
    measureBeats,
} from './schema.js';
import { keyToStep, stepToKey } from './pitch.js';

/**
 * The score document, and the only place it is mutated.
 *
 * Two rules are enforced here rather than left to callers:
 *   - both staves always hold the same number of measures;
 *   - a measure never holds more beats than the time signature allows.
 *
 * Insertions that would break the second rule are refused and reported, never
 * silently trimmed or spilled into the next measure.
 */
export default class ScoreDocument {
    constructor(content) {
        this.content = ScoreDocument.normalise(content);
    }

    static normalise(content) {
        const source = content && typeof content === 'object' ? content : {};
        const fallback = blankContent();

        const staves = CLEFS.map((clef, index) => {
            const stave = Array.isArray(source.staves) ? source.staves[index] : null;
            const measures = Array.isArray(stave?.measures) && stave.measures.length > 0
                ? stave.measures.map((measure) => ({
                    notes: Array.isArray(measure?.notes) ? measure.notes.map((note) => ({ ...note })) : [],
                }))
                : [{ notes: [] }];

            return { clef, measures };
        });

        // Restore the invariant if the payload arrived lopsided.
        const longest = Math.max(...staves.map((stave) => stave.measures.length));

        staves.forEach((stave) => {
            while (stave.measures.length < longest) {
                stave.measures.push({ notes: [] });
            }
        });

        return {
            schemaVersion: fallback.schemaVersion,
            keySignature: source.keySignature ?? fallback.keySignature,
            timeSignature: source.timeSignature ?? fallback.timeSignature,
            tempo: ScoreDocument.clampTempo(source.tempo ?? fallback.tempo),
            staves,
        };
    }

    static clampTempo(tempo) {
        const value = Number.parseInt(tempo, 10);

        if (Number.isNaN(value)) {
            return 90;
        }

        return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, value));
    }

    toJSON() {
        return structuredClone(this.content);
    }

    static fromJSON(snapshot) {
        return new ScoreDocument(snapshot);
    }

    // --- Reading ---------------------------------------------------------

    get measureCount() {
        return this.content.staves[0].measures.length;
    }

    get tempo() {
        return this.content.tempo;
    }

    get timeSignature() {
        return this.content.timeSignature;
    }

    get capacity() {
        return beatsPerMeasure(this.content.timeSignature);
    }

    stave(index) {
        return this.content.staves[index];
    }

    measure(staveIndex, measureIndex) {
        return this.content.staves[staveIndex]?.measures[measureIndex] ?? null;
    }

    note(staveIndex, measureIndex, noteIndex) {
        return this.measure(staveIndex, measureIndex)?.notes[noteIndex] ?? null;
    }

    freeBeats(staveIndex, measureIndex) {
        const measure = this.measure(staveIndex, measureIndex);

        if (!measure) {
            return 0;
        }

        return this.capacity - measureBeats(measure);
    }

    fits(staveIndex, measureIndex, duration) {
        return this.freeBeats(staveIndex, measureIndex) - DURATION_BEATS[duration] >= -BEAT_EPSILON;
    }

    /**
     * First measure on this stave with room for the duration, or null.
     */
    firstMeasureWithRoom(staveIndex, duration, from = 0) {
        for (let index = from; index < this.measureCount; index += 1) {
            if (this.fits(staveIndex, index, duration)) {
                return index;
            }
        }

        return null;
    }

    // --- Writing ---------------------------------------------------------

    setTempo(tempo) {
        this.content.tempo = ScoreDocument.clampTempo(tempo);
    }

    /**
     * Appends a note or rest at the end of the given measure.
     *
     * @returns {{ok: true, noteIndex: number} | {ok: false, reason: string}}
     */
    appendNote(staveIndex, measureIndex, { keys, duration, accidental = null, rest = false }) {
        const measure = this.measure(staveIndex, measureIndex);

        if (!measure) {
            return { ok: false, reason: 'measure-missing' };
        }

        if (!this.fits(staveIndex, measureIndex, duration)) {
            return { ok: false, reason: 'measure-full' };
        }

        measure.notes.push({
            keys: [...keys],
            duration,
            accidental: rest ? null : accidental,
            rest,
        });

        return { ok: true, noteIndex: measure.notes.length - 1 };
    }

    removeNote(staveIndex, measureIndex, noteIndex) {
        const measure = this.measure(staveIndex, measureIndex);

        if (!measure || !measure.notes[noteIndex]) {
            return false;
        }

        measure.notes.splice(noteIndex, 1);

        return true;
    }

    /**
     * Changes an existing note's duration, refusing if the measure cannot hold it.
     */
    setNoteDuration(staveIndex, measureIndex, noteIndex, duration) {
        const note = this.note(staveIndex, measureIndex, noteIndex);

        if (!note) {
            return { ok: false, reason: 'note-missing' };
        }

        const delta = DURATION_BEATS[duration] - DURATION_BEATS[note.duration];

        if (this.freeBeats(staveIndex, measureIndex) - delta < -BEAT_EPSILON) {
            return { ok: false, reason: 'measure-full' };
        }

        note.duration = duration;

        return { ok: true };
    }

    setNoteAccidental(staveIndex, measureIndex, noteIndex, accidental) {
        const note = this.note(staveIndex, measureIndex, noteIndex);

        if (!note || note.rest) {
            return false;
        }

        note.accidental = accidental;

        return true;
    }

    /**
     * Moves a note up or down by whole diatonic steps — the drag gesture.
     */
    transposeNote(staveIndex, measureIndex, noteIndex, steps) {
        const note = this.note(staveIndex, measureIndex, noteIndex);

        if (!note || note.rest || steps === 0) {
            return false;
        }

        note.keys = note.keys.map((key) => {
            const step = keyToStep(key) + steps;

            return stepToKey(Math.min(keyToStep('b/7'), Math.max(keyToStep('c/1'), step)));
        });

        return true;
    }

    setNoteKeys(staveIndex, measureIndex, noteIndex, keys) {
        const note = this.note(staveIndex, measureIndex, noteIndex);

        if (!note) {
            return false;
        }

        note.keys = [...keys];

        return true;
    }

    /** Adds an empty measure to both staves at once. */
    addMeasure() {
        if (this.measureCount >= MAX_MEASURES) {
            return { ok: false, reason: 'max-measures' };
        }

        this.content.staves.forEach((stave) => stave.measures.push({ notes: [] }));

        return { ok: true, index: this.measureCount - 1 };
    }

    /** Removes the last measure from both staves at once. */
    removeMeasure() {
        if (this.measureCount <= 1) {
            return { ok: false, reason: 'last-measure' };
        }

        const hasNotes = this.content.staves.some(
            (stave) => stave.measures[stave.measures.length - 1].notes.length > 0,
        );

        if (hasNotes) {
            return { ok: false, reason: 'measure-not-empty' };
        }

        this.content.staves.forEach((stave) => stave.measures.pop());

        return { ok: true };
    }
}
