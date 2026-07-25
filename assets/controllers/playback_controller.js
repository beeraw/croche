import { Controller } from '@hotwired/stimulus';

import { DURATION_BEATS } from '../js/score/schema.js';
import { sharedAudioEngine } from '../js/audio/AudioEngine.js';

/**
 * Plays both staves at once and walks a cursor across the score.
 *
 * The notes are scheduled up front on the audio clock, which is far steadier
 * than a timer; the playhead is animated separately against that same clock,
 * so sound and cursor cannot drift apart.
 */
export default class extends Controller {
    static targets = ['playhead', 'playButton', 'tempoInput', 'tempoValue'];

    static values = {
        tempo: { type: Number, default: 90 },
        /** Button labels and notices, translated server-side. */
        messages: Object,
    };

    connect() {
        this.audio = sharedAudioEngine();
        this.playing = false;
        this.frame = null;
        this.timeline = [];
        this.renderTempo();
    }

    disconnect() {
        this.stop();
    }

    get editor() {
        return this.application.getControllerForElementAndIdentifier(this.element, 'score-editor');
    }

    toggle() {
        if (this.playing) {
            this.stop();

            return;
        }

        this.start();
    }

    start() {
        const editor = this.editor;

        if (!editor) {
            return;
        }

        const document = editor.document;
        const timeline = this.buildTimeline(document);

        if (timeline.events.length === 0) {
            editor.notify(this.messagesValue.nothingToPlay);

            return;
        }

        this.audio.unlock();
        this.origin = this.audio.playSequence(timeline.events);
        this.timeline = timeline.marks;
        this.totalSeconds = timeline.total;
        this.playing = true;
        this.renderPlayButton();
        this.tick();
    }

    stop() {
        this.playing = false;
        this.audio.stop();

        if (this.frame) {
            window.cancelAnimationFrame(this.frame);
            this.frame = null;
        }

        this.hidePlayhead();
        this.renderPlayButton();
    }

    /**
     * Flattens both staves into scheduled events plus playhead marks.
     */
    buildTimeline(document) {
        const secondsPerBeat = 60 / this.tempoValue;
        const events = [];
        const marks = [];
        let total = 0;

        document.content.staves.forEach((stave, staveIndex) => {
            let beat = 0;

            stave.measures.forEach((measure, measureIndex) => {
                const measureStart = measureIndex * document.capacity;

                measure.notes.forEach((note, noteIndex) => {
                    const at = (measureStart + beat) * secondsPerBeat;
                    const seconds = DURATION_BEATS[note.duration] * secondsPerBeat;

                    if (!note.rest) {
                        events.push({
                            keys: note.keys,
                            accidental: note.accidental,
                            at,
                            // Shorter than the written value, so successive
                            // notes breathe instead of running into each other.
                            duration: seconds * 0.85,
                            rest: false,
                        });
                    }

                    marks.push({ at, staveIndex, measureIndex, noteIndex });
                    beat += DURATION_BEATS[note.duration];
                    total = Math.max(total, at + seconds);
                });

                beat = 0;
            });
        });

        marks.sort((a, b) => a.at - b.at);

        return { events, marks, total };
    }

    tick() {
        if (!this.playing) {
            return;
        }

        const elapsed = this.audio.currentTime - this.origin;

        if (elapsed > this.totalSeconds + 0.2) {
            this.stop();

            return;
        }

        this.movePlayhead(elapsed);
        this.frame = window.requestAnimationFrame(() => this.tick());
    }

    movePlayhead(elapsed) {
        const editor = this.editor;
        const renderer = editor?.renderer;

        if (!renderer || !this.hasPlayheadTarget) {
            return;
        }

        // Last mark whose time has passed.
        let current = null;

        for (const mark of this.timeline) {
            if (mark.at > elapsed) {
                break;
            }

            current = mark;
        }

        if (!current) {
            return;
        }

        const geometry = renderer.playheadFor(
            current.staveIndex,
            current.measureIndex,
            current.noteIndex,
        );

        if (!geometry) {
            return;
        }

        const scale = renderer.displayScale();
        const playhead = this.playheadTarget;

        // The cursor spans the whole system, both staves at once.
        playhead.style.left = `${scale.offsetLeft + geometry.x * scale.x}px`;
        playhead.style.top = `${scale.offsetTop + geometry.systemTop * scale.y}px`;
        playhead.style.height = `${geometry.systemHeight * scale.y}px`;
        playhead.classList.add('is-visible');
    }

    hidePlayhead() {
        if (this.hasPlayheadTarget) {
            this.playheadTarget.classList.remove('is-visible');
        }
    }

    tempoChanged(event) {
        this.tempoValue = Number.parseInt(event.currentTarget.value, 10);
        this.renderTempo();
        this.editor?.tempoChanged(this.tempoValue);

        if (this.playing) {
            this.stop();
        }
    }

    renderTempo() {
        if (this.hasTempoValueTarget) {
            this.tempoValueTarget.textContent = `${this.tempoValue} bpm`;
        }
    }

    renderPlayButton() {
        if (!this.hasPlayButtonTarget) {
            return;
        }

        this.playButtonTarget.classList.toggle('is-active', this.playing);
        const label = this.playing ? this.messagesValue.stop : this.messagesValue.play;

        this.playButtonTarget.setAttribute('aria-label', label);
        this.playButtonTarget.setAttribute('title', label);
    }
}
