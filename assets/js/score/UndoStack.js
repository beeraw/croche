/**
 * Undo / redo by whole-document snapshots.
 *
 * A score is a few kilobytes of JSON, so storing 50 copies costs nothing worth
 * measuring — and snapshots cannot drift out of sync the way inverse commands
 * can. Simplicity wins here.
 */
export default class UndoStack {
    constructor(initial, limit = 50) {
        this.limit = limit;
        this.past = [];
        this.future = [];
        this.present = structuredClone(initial);
    }

    get canUndo() {
        return this.past.length > 0;
    }

    get canRedo() {
        return this.future.length > 0;
    }

    /**
     * Records a new state. Identical states are ignored so a no-op edit does
     * not eat an undo level.
     */
    push(state) {
        const snapshot = structuredClone(state);

        if (JSON.stringify(snapshot) === JSON.stringify(this.present)) {
            return false;
        }

        this.past.push(this.present);
        this.present = snapshot;
        this.future = [];

        while (this.past.length > this.limit) {
            this.past.shift();
        }

        return true;
    }

    /**
     * Replaces the current state without creating an undo level. Used when a
     * continuous gesture (dragging a note) should collapse into one step.
     */
    replace(state) {
        this.present = structuredClone(state);
    }

    undo() {
        if (!this.canUndo) {
            return null;
        }

        this.future.unshift(this.present);
        this.present = this.past.pop();

        return structuredClone(this.present);
    }

    redo() {
        if (!this.canRedo) {
            return null;
        }

        this.past.push(this.present);
        this.present = this.future.shift();

        return structuredClone(this.present);
    }
}
