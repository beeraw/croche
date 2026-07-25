/**
 * Pitch helpers.
 *
 * A pitch is stored the way VexFlow wants it: "c/4", letter then octave, with
 * any accidental kept as a separate property on the note. Everything here
 * converts between that string, a diatonic step number, and a MIDI note.
 */

const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];

/** Semitones above C for each natural letter. */
const SEMITONES = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

const ACCIDENTAL_OFFSET = { '#': 1, b: -1, n: 0 };

export function parseKey(key) {
    const [letter, octave] = String(key).split('/');

    return { letter, octave: Number(octave) };
}

export function formatKey(letter, octave) {
    return `${letter}/${octave}`;
}

/**
 * Diatonic step counted from c/0 upward: c/4 is 28. Used for vertical
 * positioning on the staff, where a line or space is one step.
 */
export function keyToStep(key) {
    const { letter, octave } = parseKey(key);

    return octave * 7 + LETTERS.indexOf(letter);
}

export function stepToKey(step) {
    const octave = Math.floor(step / 7);
    const letter = LETTERS[((step % 7) + 7) % 7];

    return formatKey(letter, octave);
}

/**
 * MIDI note number, so the audio engine can turn a written pitch into a
 * frequency. Middle C (c/4) is 60.
 */
export function keyToMidi(key, accidental = null) {
    const { letter, octave } = parseKey(key);
    const base = SEMITONES[letter];

    if (base === undefined || Number.isNaN(octave)) {
        return null;
    }

    return (octave + 1) * 12 + base + (ACCIDENTAL_OFFSET[accidental] ?? 0);
}

export function midiToFrequency(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
}

export function midiToKey(midi) {
    const octave = Math.floor(midi / 12) - 1;
    const semitone = ((midi % 12) + 12) % 12;
    const letter = Object.keys(SEMITONES).find((name) => SEMITONES[name] === semitone);

    if (letter) {
        return { key: formatKey(letter, octave), accidental: null };
    }

    // Black keys are written as the sharp of the note below.
    const belowLetter = Object.keys(SEMITONES).find((name) => SEMITONES[name] === semitone - 1);

    return { key: formatKey(belowLetter, octave), accidental: '#' };
}

export function isBlackKey(midi) {
    return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/**
 * Label for a key on the virtual piano.
 *
 * The names come from the caller rather than living here: a French-speaking
 * child reads Do-Ré-Mi, an English-speaking one reads C-D-E, and the
 * translation catalogue is the single place that decides.
 *
 * @param {string} key            pitch as "c/4"
 * @param {Object<string,string>} names letter => displayed name
 */
export function noteLabel(key, names) {
    const { letter, octave } = parseKey(key);

    return `${names[letter] ?? letter.toUpperCase()}${octave}`;
}

/**
 * Step of the note sitting on the bottom line of a stave in this clef.
 * Treble: e/4. Bass: g/2.
 */
export function bottomLineStep(clef) {
    return clef === 'bass' ? keyToStep('g/2') : keyToStep('e/4');
}
