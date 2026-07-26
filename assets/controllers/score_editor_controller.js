import { Controller } from '@hotwired/stimulus';

import ScoreDocument from '../js/score/ScoreDocument.js';
import ScoreRenderer from '../js/score/ScoreRenderer.js';
import UndoStack from '../js/score/UndoStack.js';
import { sharedAudioEngine } from '../js/audio/AudioEngine.js';

/** Finger travel, in pixels, before a tap on a note becomes a drag. */
const DRAG_THRESHOLD = 6;

/**
 * How far a drag may carry a note, in diatonic steps: one octave either way.
 *
 * Wide enough to transpose a phrase properly, tight enough that a finger
 * slipping down the iPad does not fling the note to the bottom of the keyboard
 * under a stack of ledger lines. Tapping the staff is held far closer than
 * this — a tap is a guess at a position, where a drag is a deliberate carry.
 */
const DRAG_RANGE = 7;

/**
 * The editor's brain.
 *
 * Owns the document, the renderer, the undo stack and the current selection.
 * The palette and the piano only announce intent; playback and autosave are
 * siblings on the same element and are driven from here.
 */
export default class extends Controller {
    static targets = [
        'canvas',
        'stage',
        'notice',
        'title',
        'printTitle',
        'measureCount',
        'staveButton',
        'undoButton',
        'redoButton',
        'deleteButton',
    ];

    static values = {
        content: Object,
        schema: Object,
        /** Interface strings, translated server-side and handed over as data. */
        messages: Object,
    };

    connect() {
        this.document = new ScoreDocument(this.contentValue);
        this.undoStack = new UndoStack(this.document.toJSON());
        this.renderer = new ScoreRenderer(this.canvasTarget);
        this.audio = sharedAudioEngine();

        this.activeStave = 0;
        this.selection = null;
        this.tool = { duration: 'q', accidental: null, rest: false };
        this.drag = null;

        this.render();

        // The autosave controller lives on this same element, and Stimulus does
        // not promise an order between the two connect() calls. Waiting a tick
        // guarantees it is there before we ask it for a buffered copy.
        window.setTimeout(() => this.offerBufferedCopy(), 0);

        this.onResize = this.debounce(() => this.render(), 150);
        window.addEventListener('resize', this.onResize);

        this.onKeydown = (event) => this.handleKeydown(event);
        window.addEventListener('keydown', this.onKeydown);

        // A save in flight when the tab goes away would otherwise be lost.
        this.onHide = () => this.autosave?.flushNow();
        window.addEventListener('pagehide', this.onHide);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.onHide();
            }
        });

        // Unlock audio on the very first interaction anywhere in the editor.
        this.element.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    }

    disconnect() {
        window.removeEventListener('resize', this.onResize);
        window.removeEventListener('keydown', this.onKeydown);
        window.removeEventListener('pagehide', this.onHide);
    }

    get autosave() {
        return this.application.getControllerForElementAndIdentifier(this.element, 'autosave');
    }

    get playback() {
        return this.application.getControllerForElementAndIdentifier(this.element, 'playback');
    }

    // --- Rendering -------------------------------------------------------

    render() {
        this.renderer.render(this.document, {
            activeStave: this.activeStave,
            selection: this.selection,
        });

        if (this.hasMeasureCountTarget) {
            this.measureCountTarget.textContent = String(this.document.measureCount);
        }

        this.staveButtonTargets.forEach((button) => {
            button.classList.toggle('is-active', Number(button.dataset.stave) === this.activeStave);
        });

        if (this.hasUndoButtonTarget) {
            this.undoButtonTarget.disabled = !this.undoStack.canUndo;
        }

        if (this.hasRedoButtonTarget) {
            this.redoButtonTarget.disabled = !this.undoStack.canRedo;
        }

        if (this.hasDeleteButtonTarget) {
            this.deleteButtonTarget.disabled = this.selection === null;
        }
    }

    /**
     * Records an undo level, redraws, and hands the new document to autosave.
     */
    commit() {
        this.undoStack.push(this.document.toJSON());
        this.render();
        this.autosave?.schedule(this.document.toJSON());
    }

    // --- Tool and stave --------------------------------------------------

    toolChanged(event) {
        this.tool = { ...event.detail };

        // With a note selected, the palette edits it rather than the next one.
        if (this.selection) {
            this.applyToolToSelection();
        }
    }

    selectStave(event) {
        this.activeStave = Number(event.currentTarget.dataset.stave);
        this.selection = null;
        this.render();
    }

    // --- Input -----------------------------------------------------------

    /**
     * A key on the virtual piano: the note lands on the active stave, in the
     * selected measure or the first one with room.
     */
    pianoPressed(event) {
        const { key, accidental } = event.detail;

        this.insertNote({
            keys: [key],
            duration: this.tool.duration,
            // An accidental picked in the palette wins over the keyboard's own.
            accidental: this.tool.accidental ?? accidental,
            rest: false,
        });
    }

    pianoReleased() {
        // Nothing to do: notes have their own short envelope.
    }

    /**
     * A tap on the score: select a note if one is near, otherwise place one at
     * the nearest line or space.
     */
    stageTapped(event) {
        const point = this.renderer.toLocalPoint(event);

        if (!point) {
            return;
        }

        const hit = this.renderer.noteAt(point);

        if (hit) {
            this.beginNoteInteraction(event, hit, point);

            return;
        }

        const measure = this.renderer.measureAt(point);

        if (!measure) {
            this.selection = null;
            this.render();

            return;
        }

        // Tapping the other stave moves focus to it rather than placing a note.
        if (measure.staveIndex !== this.activeStave) {
            this.activeStave = measure.staveIndex;
            this.selection = null;
            this.render();

            return;
        }

        const key = this.renderer.keyAt(measure, point.y);

        this.insertNote({
            keys: [key],
            duration: this.tool.duration,
            accidental: this.tool.accidental,
            rest: this.tool.rest,
        }, measure.measureIndex);
    }

    /**
     * Select on tap, transpose on vertical drag.
     */
    beginNoteInteraction(event, hit, point) {
        this.selection = {
            staveIndex: hit.staveIndex,
            measureIndex: hit.measureIndex,
            noteIndex: hit.noteIndex,
        };
        this.activeStave = hit.staveIndex;

        const measure = this.renderer.measureAt(point);
        const note = this.document.note(hit.staveIndex, hit.measureIndex, hit.noteIndex);

        this.render();

        if (!measure || !note || note.rest) {
            return;
        }

        const before = this.document.toJSON();
        const startY = event.clientY;
        let moved = 0;

        const onMove = (moveEvent) => {
            const delta = moveEvent.clientY - startY;

            if (Math.abs(delta) < DRAG_THRESHOLD) {
                return;
            }

            const travelled = this.renderer.stepsFromPixels(measure, delta);
            const steps = Math.max(-DRAG_RANGE, Math.min(DRAG_RANGE, travelled));

            if (steps === moved) {
                return;
            }

            // Rebuild from the pre-drag state so the drag stays absolute.
            this.document = ScoreDocument.fromJSON(before);
            this.document.transposeNote(hit.staveIndex, hit.measureIndex, hit.noteIndex, steps);
            moved = steps;
            this.render();
        };

        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);

            if (moved === 0) {
                this.previewSelection();

                return;
            }

            // The whole drag collapses into a single undo level.
            this.commit();
            this.previewSelection();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }

    /**
     * Places a note, refusing outright when the measure is full.
     */
    insertNote(note, measureIndex = null) {
        const target = measureIndex ?? this.targetMeasure(note.duration);

        if (target === null) {
            this.notify(this.messagesValue.allFull);

            return;
        }

        const result = this.document.appendNote(this.activeStave, target, note);

        if (!result.ok) {
            this.refuse(target, note.duration);

            return;
        }

        this.selection = {
            staveIndex: this.activeStave,
            measureIndex: target,
            noteIndex: result.noteIndex,
        };

        this.commit();

        if (!note.rest) {
            this.audio.playNote(note.keys[0], note.accidental, 0.4);
        }
    }

    /**
     * Where the next note goes: after the selection if it still fits, otherwise
     * the first measure with room.
     */
    targetMeasure(duration) {
        if (this.selection && this.selection.staveIndex === this.activeStave) {
            const { measureIndex } = this.selection;

            if (this.document.fits(this.activeStave, measureIndex, duration)) {
                return measureIndex;
            }

            return this.document.firstMeasureWithRoom(this.activeStave, duration, measureIndex + 1);
        }

        return this.document.firstMeasureWithRoom(this.activeStave, duration);
    }

    applyToolToSelection() {
        const { staveIndex, measureIndex, noteIndex } = this.selection;
        const note = this.document.note(staveIndex, measureIndex, noteIndex);

        if (!note) {
            return;
        }

        let changed = false;

        if (note.duration !== this.tool.duration) {
            const result = this.document.setNoteDuration(
                staveIndex,
                measureIndex,
                noteIndex,
                this.tool.duration,
            );

            if (!result.ok) {
                this.refuse(measureIndex, this.tool.duration);

                return;
            }

            changed = true;
        }

        if (!note.rest && note.accidental !== this.tool.accidental) {
            this.document.setNoteAccidental(staveIndex, measureIndex, noteIndex, this.tool.accidental);
            changed = true;
        }

        if (changed) {
            this.commit();
            this.previewSelection();
        }
    }

    deleteSelection() {
        if (!this.selection) {
            return;
        }

        const { staveIndex, measureIndex, noteIndex } = this.selection;

        if (this.document.removeNote(staveIndex, measureIndex, noteIndex)) {
            this.selection = null;
            this.commit();
        }
    }

    previewSelection() {
        if (!this.selection) {
            return;
        }

        const { staveIndex, measureIndex, noteIndex } = this.selection;
        const note = this.document.note(staveIndex, measureIndex, noteIndex);

        if (note && !note.rest) {
            this.audio.playNote(note.keys[0], note.accidental, 0.35);
        }
    }

    // --- Measures --------------------------------------------------------

    addMeasure() {
        const result = this.document.addMeasure();

        if (!result.ok) {
            this.notify(this.messagesValue.maxMeasures);

            return;
        }

        this.commit();
    }

    removeMeasure() {
        const result = this.document.removeMeasure();

        if (!result.ok) {
            this.notify(
                result.reason === 'last-measure'
                    ? this.messagesValue.lastMeasure
                    : this.messagesValue.notEmpty,
            );

            return;
        }

        this.selection = null;
        this.commit();
    }

    tempoChanged(tempo) {
        this.document.setTempo(tempo);
        this.commit();
    }

    // --- Undo / redo -----------------------------------------------------

    undo() {
        const snapshot = this.undoStack.undo();

        if (!snapshot) {
            return;
        }

        this.document = ScoreDocument.fromJSON(snapshot);
        this.selection = null;
        this.render();
        this.autosave?.schedule(this.document.toJSON());
    }

    redo() {
        const snapshot = this.undoStack.redo();

        if (!snapshot) {
            return;
        }

        this.document = ScoreDocument.fromJSON(snapshot);
        this.selection = null;
        this.render();
        this.autosave?.schedule(this.document.toJSON());
    }

    handleKeydown(event) {
        const tag = event.target?.tagName;

        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            return;
        }

        const meta = event.metaKey || event.ctrlKey;

        if (meta && event.key.toLowerCase() === 'z') {
            event.preventDefault();

            if (event.shiftKey) {
                this.redo();
            } else {
                this.undo();
            }
        } else if (event.key === 'Backspace' || event.key === 'Delete') {
            event.preventDefault();
            this.deleteSelection();
        } else if (event.key === ' ') {
            event.preventDefault();
            this.playback?.toggle();
        }
    }

    // --- Feedback --------------------------------------------------------

    print() {
        if (this.hasPrintTitleTarget && this.hasTitleTarget) {
            this.printTitleTarget.textContent = this.titleTarget.value;
        }

        this.autosave?.flushNow().finally(() => window.print());
    }

    /**
     * A refused insertion: red flash on the measure, plus a word about why.
     */
    refuse(measureIndex, duration) {
        const name = this.messagesValue.durations?.[duration] ?? duration;

        this.notify(this.messagesValue.measureFull.replace('%duration%', name));
        this.flashMeasure(this.activeStave, measureIndex);
    }

    flashMeasure(staveIndex, measureIndex) {
        const geometry = this.renderer.measures.find(
            (measure) => measure.staveIndex === staveIndex && measure.measureIndex === measureIndex,
        );

        if (!geometry) {
            return;
        }

        const scale = this.renderer.displayScale();
        const flash = document.createElement('div');

        flash.className = 'measure-refused';
        flash.style.left = `${scale.offsetLeft + geometry.x * scale.x}px`;
        flash.style.top = `${scale.offsetTop + geometry.top * scale.y}px`;
        flash.style.width = `${geometry.width * scale.x}px`;
        flash.style.height = `${geometry.height * scale.y}px`;

        this.canvasTarget.parentElement.appendChild(flash);
        window.setTimeout(() => flash.remove(), 700);
    }

    notify(message) {
        if (!this.hasNoticeTarget) {
            return;
        }

        this.noticeTarget.textContent = message;
        this.noticeTarget.classList.add('is-visible');

        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = window.setTimeout(
            () => this.noticeTarget.classList.remove('is-visible'),
            2600,
        );
    }

    /**
     * If a previous session failed to save, offer that copy back before the
     * database version is shown. She decides; we never restore silently.
     */
    offerBufferedCopy() {
        const buffered = this.autosave?.readBuffer();

        if (!buffered?.content) {
            return;
        }

        const when = new Date(buffered.at).toLocaleString(document.documentElement.lang || undefined);
        const restore = window.confirm(this.messagesValue.recovered.replace('%date%', when));

        if (restore) {
            this.document = ScoreDocument.fromJSON(buffered.content);
            this.autosave?.schedule(this.document.toJSON());
        } else {
            this.autosave?.clearBuffer();
        }
    }

    debounce(fn, delay) {
        let timer = null;

        return (...args) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => fn(...args), delay);
        };
    }
}
