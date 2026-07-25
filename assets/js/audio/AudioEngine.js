import { keyToMidi, midiToFrequency } from '../score/pitch.js';

/**
 * Web Audio playback, synthesised locally.
 *
 * Everything sound-related lives behind this class. Swapping the oscillator for
 * local piano samples later means rewriting `voiceFor` and nothing else — the
 * editor only ever calls playNote / playSequence / stop.
 *
 * Timbre: a triangle wave with a short ADSR. A sine is too thin to hear the
 * harmony, a square is harsh at a child's listening volume.
 */
export default class AudioEngine {
    constructor() {
        this.context = null;
        this.master = null;
        this.active = new Set();
        this.scheduled = [];
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
        }

        if (this.context.state === 'suspended') {
            this.context.resume();
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
     * @param {number} duration  seconds
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

    /**
     * Builds one sounding voice. This is the only place that knows how a note
     * is actually produced.
     */
    voiceFor(frequency, duration, start) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, start);

        const attack = 0.012;
        const decay = 0.09;
        const sustain = 0.55;
        const release = Math.min(0.25, duration * 0.4);
        const peak = 0.32;

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(peak, start + attack);
        gain.gain.linearRampToValueAtTime(peak * sustain, start + attack + decay);
        gain.gain.setValueAtTime(peak * sustain, start + duration);
        // Exponential release, so the tail dies away instead of clicking off.
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration + release);

        oscillator.connect(gain);
        gain.connect(this.master);

        oscillator.start(start);
        oscillator.stop(start + duration + release + 0.02);

        return { oscillator, gain };
    }

    /**
     * Plays a list of {key, accidental, at, duration} entries, all times in
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
     * not click.
     */
    stop() {
        if (!this.context) {
            return;
        }

        const now = this.context.currentTime;

        this.active.forEach(({ oscillator, gain }) => {
            try {
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
                oscillator.stop(now + 0.04);
            } catch {
                // The voice had already finished; nothing to silence.
            }
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
