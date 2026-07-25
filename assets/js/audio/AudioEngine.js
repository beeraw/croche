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
     * The three knobs to reach for first. Everything below them is detail.
     */
    static TONE = {
        /**
         * Overall brightness, 0 to 1. Drives the spectrum and both ends of the
         * filter sweep. Below ~0.4 the tone turns felt-covered; above ~0.85 it
         * starts to sound like an upright with the lid up.
         */
        brightness: 0.72,

        /**
         * Seconds a note at the very bottom of the keyboard takes to fade.
         * Trebles are proportionally much shorter. Raise it and the left hand
         * starts smearing under the melody.
         */
        resonance: 6,

        /**
         * Level of the hammer noise, relative to the note. This is what makes
         * successive notes distinguishable in a fast run — too low and a scale
         * turns into one continuous smear.
         */
        hammer: 0.34,

        // --- Detail ------------------------------------------------------

        /** Harmonics in the wavetable. More costs nothing at build time. */
        harmonics: 14,
        /** Amplitude of harmonic n falls roughly as 1 / n^partialRolloff. */
        partialRolloff: 1.2,
        /** Extra lift on partials 2 to 4, where presence lives. */
        presence: [1.35, 1.24, 1.14],
        /** Hammer burst length, seconds. */
        hammerTime: 0.024,
        /** Attack, seconds. Short enough to read as a struck string. */
        attack: 0.004,
        /** Peak gain of one voice, before the register tilt. */
        peak: 0.26,
        /**
         * How much quieter the bass is than the treble. Without this the left
         * hand, which holds long notes, sits on top of the melody.
         */
        registerTilt: 0.18,
    };

    constructor() {
        this.context = null;
        this.master = null;
        this.active = new Set();

        // Built once, on the first unlock, then shared by every note.
        this.wave = null;
        this.hammerBuffer = null;

        this.watchForGestures();
    }

    /**
     * iOS does not just gate the first sound behind a user gesture: it also
     * suspends the context when the tab is backgrounded, when a call comes in,
     * and sometimes on simply rotating the iPad. A single unlock at startup is
     * therefore not enough — every tap is treated as another chance to recover.
     */
    watchForGestures() {
        if (typeof document === 'undefined') {
            return;
        }

        const recover = () => {
            if (this.context && this.context.state !== 'running') {
                this.unlock();
            }
        };

        ['pointerdown', 'touchend', 'keydown'].forEach((type) => {
            document.addEventListener(type, recover, { capture: true, passive: true });
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                recover();
            }
        });
    }

    /**
     * Creates the context if needed and does its best to get it running.
     * Safe to call from anywhere; only actually works from a user gesture on
     * iOS, which is why every entry point calls it rather than assuming.
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

        if (this.context.state !== 'running') {
            // Safari rejects resume() when the call did not come from a
            // gesture, and can throw synchronously rather than rejecting.
            // Nothing useful to do either way, and an unhandled error would
            // only clutter the console.
            try {
                Promise.resolve(this.context.resume()).catch(() => {});
            } catch {
                // Context not in a resumable state.
            }

            this.nudge();
        }

        return true;
    }

    /**
     * The long-standing iOS workaround: a context sometimes refuses to leave
     * "suspended" until a source has actually been started on it. One silent
     * sample is enough, and costs nothing anywhere else.
     */
    nudge() {
        try {
            const source = this.context.createBufferSource();

            source.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
            source.connect(this.context.destination);
            source.start(0);
        } catch {
            // Context in a state that refuses new sources; nothing to do.
        }
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
        this.scheduleEnvelope(gain.gain, hold, release, decay, start, this.tiltFor(frequency));

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
    scheduleEnvelope(param, hold, release, decay, start, tilt = 1) {
        const { attack } = AudioEngine.TONE;
        const peak = AudioEngine.TONE.peak * tilt;
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

        // The absolute floors matter more than the ratios. Scaling the cutoff
        // from the fundamental alone leaves the bass with almost no harmonics
        // above its own pitch, which is exactly how a bass note loses its
        // definition and turns into a rumble.
        const open = this.clamp(frequency * (7 + brightness * 4), 4200 + brightness * 1200, 12000);
        const close = this.clamp(frequency * (1.5 + brightness * 1.6), 950, 4200);

        // Slow enough that the attack keeps its edge well into the note, but
        // it does have to arrive: a sweep that never reaches its target is a
        // static filter with extra steps.
        param.setValueAtTime(open, start);
        param.exponentialRampToValueAtTime(
            close,
            start + Math.max(0.25, Math.min(hold * 1.1, decay * 0.7)),
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

        const { hammer, hammerTime, peak } = AudioEngine.TONE;

        const source = this.context.createBufferSource();
        const gain = this.context.createGain();

        source.buffer = this.hammerBuffer;
        source.playbackRate.setValueAtTime(this.clamp(frequency / 220, 0.5, 2.6), start);

        gain.gain.setValueAtTime(peak * hammer * this.tiltFor(frequency), start);
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
        const { resonance } = AudioEngine.TONE;

        return this.clamp(resonance * (55 / frequency) ** 0.55, 0.8, resonance);
    }

    /**
     * Level trim by register. Low notes are pulled down so the left hand, which
     * usually holds the long values, stops sitting on top of the melody.
     */
    tiltFor(frequency) {
        const { registerTilt } = AudioEngine.TONE;

        return this.clamp((frequency / 260) ** registerTilt, 0.68, 1.12);
    }

    /**
     * The harmonic spectrum, built once. Amplitudes fall as 1/n^1.5, with an
     * extra geometric roll-off so `brightness` has something to act on.
     */
    buildWave() {
        const { harmonics, partialRolloff, presence, brightness } = AudioEngine.TONE;
        // Kept gentle on purpose: the table supplies the material and the
        // closing filter does the shaping. Damping hard here would leave the
        // filter nothing to work on, and every note would sound the same from
        // beginning to end.
        const damping = 0.88 + brightness * 0.1;

        const real = new Float32Array(harmonics + 1);
        const imag = new Float32Array(harmonics + 1);

        for (let n = 1; n <= harmonics; n += 1) {
            const lift = presence[n - 2] ?? 1;

            imag[n] = (1 / n ** partialRolloff) * damping ** (n - 1) * lift;
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

        // Only lightly smoothed: the click needs its top end to cut through a
        // fast run. Heavier filtering here turns the attack into a soft thud
        // and consecutive notes stop being distinguishable.
        let previous = 0;

        for (let i = 0; i < length; i += 1) {
            const white = Math.random() * 2 - 1;
            previous += 0.78 * (white - previous);
            data[i] = previous * (1 - i / length) ** 2.2;
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
