import { keyToMidi, midiToFrequency } from '../score/pitch.js';

/**
 * Web Audio playback, synthesised locally.
 *
 * Everything sound-related lives behind this class. Swapping in local piano
 * samples later means rewriting `voiceFor` and nothing else — the editor only
 * ever calls playNote / playSequence / stop.
 *
 * Timbre: additive wavetable through a closing low-pass, plus a hammer click.
 * Four things make it read as a piano rather than a toy:
 *
 *   1. a percussive envelope — attack, then continuous decay, never a plateau;
 *   2. a harmonic spectrum built with createPeriodicWave, not a plain triangle;
 *   3. a low-pass that closes over the note, so the upper partials die before
 *      the fundamental does. This is the decisive cue;
 *   4. a very short filtered noise burst at the attack, for the hammer.
 *
 * Register matters too: a bass note rings for many seconds, a treble note is
 * gone in about one. Decay length and filter cutoff both follow the pitch.
 *
 * Budget per note: one oscillator, one filter, one gain, plus two short-lived
 * nodes for the hammer. Both staves can sound at once on an ageing iPad.
 */
export default class AudioEngine {
    /**
     * The knobs worth turning. `brightness` is the one to reach for first:
     * 0 is felt-muted, 1 is a bright upright. The default aims at a rounded
     * grand, heard on headphones or an iPad speaker.
     */
    static TONE = {
        brightness: 0.6,
        /** Harmonics in the wavetable. More costs nothing at build time. */
        harmonics: 12,
        /** Amplitude of harmonic n falls as 1 / n^partialRolloff. */
        partialRolloff: 1.5,
        /** Loudness of the hammer noise, relative to the note. */
        hammerLevel: 0.11,
        /** Hammer burst length, seconds. */
        hammerTime: 0.02,
        /** Attack, seconds. Short enough to read as a struck string. */
        attack: 0.004,
        /** Peak gain of one voice. */
        peak: 0.28,
        /** Seconds a note near A1 takes to fade out; trebles are far shorter. */
        decayAtLowEnd: 11,
    };

    constructor() {
        this.context = null;
        this.master = null;
        this.active = new Set();

        // Built once, on the first unlock, then shared by every note.
        this.wave = null;
        this.hammerBuffer = null;
    }

    /**
     * iOS will not produce a sound from a context created outside a user
     * gesture, and suspends it again on every navigation. Call this from the
     * first tap and it is handled once and for all.
     */
    unlock() {
        if (!this.context) {
            const Context = window.AudioContext ?? window.webkitAudioContext;

            if (!Context) {
                return false;
            }

            this.context = new Context();
            this.master = this.context.createGain();
            this.master.gain.value = 0.7;
            this.master.connect(this.context.destination);

            this.wave = this.buildWave();
            this.hammerBuffer = this.buildHammerBuffer();
        }

        if (this.context.state === 'suspended') {
            // Safari rejects this when the call did not come from a gesture.
            // There is nothing useful to do about it, and an unhandled
            // rejection would only clutter the console.
            Promise.resolve(this.context.resume()).catch(() => {});
        }

        return true;
    }

    get currentTime() {
        return this.context?.currentTime ?? 0;
    }

    /**
     * One note, right now or at a scheduled time.
     *
     * @param {string} key       pitch as "c/4"
     * @param {?string} accidental "#", "b", "n" or null
     * @param {number} duration  seconds the key is held down
     * @param {number} at        context time, defaults to now
     */
    playNote(key, accidental, duration, at = null) {
        if (!this.unlock()) {
            return null;
        }

        const midi = keyToMidi(key, accidental);

        if (midi === null) {
            return null;
        }

        return this.playFrequency(midiToFrequency(midi), duration, at);
    }

    playFrequency(frequency, duration, at = null) {
        if (!this.unlock()) {
            return null;
        }

        const start = at ?? this.context.currentTime;
        const voice = this.voiceFor(frequency, Math.max(0.08, duration), start);

        this.active.add(voice);
        voice.oscillator.onended = () => this.active.delete(voice);

        return voice;
    }

    // --- Synthesis -------------------------------------------------------

    /**
     * Builds one sounding voice. This is the only place that knows how a note
     * is actually produced.
     *
     * @returns {{oscillator: OscillatorNode, sources: AudioScheduledSourceNode[], gains: GainNode[]}}
     */
    voiceFor(frequency, hold, start) {
        const decay = this.decayFor(frequency);
        // The damper coming down. Capped by register, so a bass note keeps a
        // little more tail than a treble one — but never enough to blur into
        // the next bar.
        const release = this.clamp(hold * 0.45, 0.06, 0.12 + decay * 0.035);
        const endsAt = start + hold + release;

        const oscillator = this.context.createOscillator();
        const filter = this.context.createBiquadFilter();
        const gain = this.context.createGain();

        oscillator.setPeriodicWave(this.wave);
        oscillator.frequency.setValueAtTime(frequency, start);

        filter.type = 'lowpass';
        // Gentle slope: a resonant peak would sound synthetic.
        filter.Q.setValueAtTime(0.7, start);
        this.scheduleFilter(filter.frequency, frequency, hold, decay, start);
        this.scheduleEnvelope(gain.gain, hold, release, decay, start);

        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        oscillator.start(start);
        oscillator.stop(endsAt + 0.02);

        const hammer = this.hammerFor(frequency, start);

        return {
            oscillator,
            sources: hammer ? [oscillator, hammer.source] : [oscillator],
            gains: hammer ? [gain, hammer.gain] : [gain],
        };
    }

    /**
     * Percussive envelope: a fast attack, then an unbroken exponential fall.
     *
     * Two decay segments rather than one, because a real string drops quickly
     * at first and then lingers. The level still reached when the key is
     * released depends on the register, which is what makes a bass note carry
     * and a treble note evaporate.
     */
    scheduleEnvelope(param, hold, release, decay, start) {
        const { attack, peak } = AudioEngine.TONE;
        const knee = Math.min(0.12, hold * 0.3);
        // Time constant of the long decay. A quarter of the way through the
        // note the level must already be visibly down — anything slower reads
        // as an organ holding a chord.
        const tau = decay / 7;

        // The prompt drop just after the strike, then the long fall. Both are
        // gentler in the bass: that is the whole register difference.
        const kneeLevel = peak * this.clamp(0.55 + decay / 50, 0.55, 0.8);
        const holdLevel = Math.max(
            peak * 0.004,
            kneeLevel * Math.exp(-Math.max(0, hold - knee) / tau),
        );

        param.setValueAtTime(0.0001, start);
        param.linearRampToValueAtTime(peak, start + attack);
        param.exponentialRampToValueAtTime(kneeLevel, start + attack + knee);
        param.exponentialRampToValueAtTime(holdLevel, start + hold);
        // The damper coming down, not a hard cut.
        param.exponentialRampToValueAtTime(0.0001, start + hold + release);
    }

    /**
     * The low-pass closes across the note, so the brightness of the attack
     * fades faster than the fundamental. Both ends track the pitch: a bass
     * note keeps more of its harmonics for longer than a treble one.
     */
    scheduleFilter(param, frequency, hold, decay, start) {
        const { brightness } = AudioEngine.TONE;

        // Wide open at the strike, nearly down to the fundamental by the end:
        // the note starts with bite and settles into something felt-covered.
        const open = this.clamp(frequency * (5 + brightness * 16), 700, 11000);
        const close = this.clamp(frequency * (1.1 + brightness * 1.2), 170, 2400);

        param.setValueAtTime(open, start);
        param.exponentialRampToValueAtTime(
            close,
            start + Math.max(0.08, Math.min(hold, decay * 0.5)),
        );
    }

    /**
     * The felt hammer striking the string: a tiny burst of shaped noise.
     * Pitched with playbackRate so high notes click tighter than low ones.
     */
    hammerFor(frequency, start) {
        if (!this.hammerBuffer) {
            return null;
        }

        const { hammerLevel, hammerTime, peak } = AudioEngine.TONE;

        const source = this.context.createBufferSource();
        const gain = this.context.createGain();

        source.buffer = this.hammerBuffer;
        source.playbackRate.setValueAtTime(this.clamp(frequency / 220, 0.5, 2.6), start);

        gain.gain.setValueAtTime(peak * hammerLevel, start);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + hammerTime);

        source.connect(gain);
        gain.connect(this.master);

        source.start(start);
        source.stop(start + hammerTime + 0.01);

        return { source, gain };
    }

    /**
     * Seconds a note of this pitch needs to fade out. Roughly a halving per
     * octave upward, which is close enough to a real instrument.
     */
    decayFor(frequency) {
        const { decayAtLowEnd } = AudioEngine.TONE;

        return this.clamp(decayAtLowEnd * (55 / frequency) ** 0.55, 0.9, decayAtLowEnd);
    }

    /**
     * The harmonic spectrum, built once. Amplitudes fall as 1/n^1.5, with an
     * extra geometric roll-off so `brightness` has something to act on.
     */
    buildWave() {
        const { harmonics, partialRolloff, brightness } = AudioEngine.TONE;
        // Deliberately gentle: the spectrum should stay close to 1/n^1.5 and
        // let the closing filter do the shaping. Damping the table hard here
        // instead would leave the filter nothing to work on, and the note
        // would sound the same from beginning to end.
        const damping = 0.82 + brightness * 0.16;

        const real = new Float32Array(harmonics + 1);
        const imag = new Float32Array(harmonics + 1);

        for (let n = 1; n <= harmonics; n += 1) {
            imag[n] = (1 / n ** partialRolloff) * damping ** (n - 1);
        }

        return this.context.createPeriodicWave(real, imag, { disableNormalization: false });
    }

    /**
     * Noise for the hammer, generated once. The decay is baked into the
     * buffer, and a one-pole low-pass takes the hiss off, so playing it back
     * costs a source and a gain and nothing else.
     */
    buildHammerBuffer() {
        const { sampleRate } = this.context;
        const length = Math.max(1, Math.floor(sampleRate * 0.03));
        const buffer = this.context.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);

        let previous = 0;

        for (let i = 0; i < length; i += 1) {
            const white = Math.random() * 2 - 1;
            previous += 0.32 * (white - previous);
            data[i] = previous * (1 - i / length) ** 3;
        }

        return buffer;
    }

    clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    // --- Sequencing ------------------------------------------------------

    /**
     * Plays a list of {keys, accidental, at, duration} entries, all times in
     * seconds relative to the moment playback starts.
     *
     * @returns {number} the context time playback started at
     */
    playSequence(events) {
        if (!this.unlock()) {
            return 0;
        }

        // A beat of headroom so the first note is scheduled, not rushed.
        const origin = this.context.currentTime + 0.06;

        events.forEach((event) => {
            if (event.rest) {
                return;
            }

            event.keys.forEach((key) => {
                this.playNote(key, event.accidental, event.duration, origin + event.at);
            });
        });

        return origin;
    }

    /**
     * Silences everything immediately, with a very short fade so stopping does
     * not click. Notes still waiting to be played are cancelled outright.
     */
    stop() {
        if (!this.context) {
            return;
        }

        const now = this.context.currentTime;

        this.active.forEach((voice) => {
            voice.gains.forEach((gain) => {
                try {
                    gain.gain.cancelScheduledValues(now);
                    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
                } catch {
                    // The voice had already finished; nothing to silence.
                }
            });

            voice.sources.forEach((source) => {
                try {
                    source.stop(now + 0.04);
                } catch {
                    // Already stopped, or never started.
                }
            });
        });

        this.active.clear();
    }
}

/**
 * One engine for the whole page: several controllers share it, and iOS only
 * lets us unlock a single context cheaply.
 */
let shared = null;

export function sharedAudioEngine() {
    if (!shared) {
        shared = new AudioEngine();
    }

    return shared;
}
