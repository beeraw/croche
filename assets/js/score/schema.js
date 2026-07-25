/**
 * Client-side mirror of App\Score\ScoreSchema. Change both together.
 */

export const SCHEMA_VERSION = 1;

export const CLEFS = ['treble', 'bass'];

export const DURATIONS = ['w', 'h', 'q', '8'];

/** Duration in quarter-note beats. */
export const DURATION_BEATS = {
    w: 4,
    h: 2,
    q: 1,
    8: 0.5,
};

export const DURATION_LABELS = {
    w: 'ronde',
    h: 'blanche',
    q: 'noire',
    8: 'croche',
};

export const ACCIDENTALS = ['#', 'b', 'n'];

export const TEMPO_MIN = 40;
export const TEMPO_MAX = 208;

export const MAX_MEASURES = 64;

/** Floating-point slack when comparing beat sums. */
export const BEAT_EPSILON = 0.0001;

/**
 * How many quarter-note beats a measure holds under this time signature.
 */
export function beatsPerMeasure(timeSignature) {
    const [beats, unit] = String(timeSignature).split('/').map(Number);

    if (!unit) {
        return 4;
    }

    return beats * (4 / unit);
}

export function measureBeats(measure) {
    return measure.notes.reduce((total, note) => total + (DURATION_BEATS[note.duration] ?? 0), 0);
}

export function blankContent(measures = 4) {
    const emptyMeasures = () => Array.from({ length: measures }, () => ({ notes: [] }));

    return {
        schemaVersion: SCHEMA_VERSION,
        keySignature: 'C',
        timeSignature: '4/4',
        tempo: 90,
        staves: CLEFS.map((clef) => ({ clef, measures: emptyMeasures() })),
    };
}
