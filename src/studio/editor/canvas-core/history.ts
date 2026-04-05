/**
 * history.ts — Simple undo/redo history stack for the Fabric canvas.
 * Max 50 snapshots (serialised canvas JSON strings).
 */

const MAX_HISTORY = 50

export class HistoryStack {
  private stack: string[] = []
  private idx: number = -1

  get canUndo(): boolean {
    return this.idx > 0
  }

  get canRedo(): boolean {
    return this.idx < this.stack.length - 1
  }

  push(json: string): void {
    // Discard any redo tail
    this.stack = this.stack.slice(0, this.idx + 1)
    this.stack.push(json)
    this.idx = this.stack.length - 1
    // Trim oldest if over cap
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift()
      this.idx--
    }
  }

  undo(): string | null {
    if (!this.canUndo) return null
    this.idx--
    return this.stack[this.idx] ?? null
  }

  redo(): string | null {
    if (!this.canRedo) return null
    this.idx++
    return this.stack[this.idx] ?? null
  }

  /** Current snapshot without moving the pointer. */
  current(): string | null {
    return this.stack[this.idx] ?? null
  }

  clear(): void {
    this.stack = []
    this.idx = -1
  }

  /** Raw pointer — used by Canvas.tsx to read/write directly via ref. */
  get pointer(): number { return this.idx }
  set pointer(v: number) { this.idx = v }

  /** Raw array access for Canvas.tsx imperative checks. */
  get length(): number { return this.stack.length }
}
