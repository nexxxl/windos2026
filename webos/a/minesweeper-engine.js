// Original NEXLOS Minesweeper model: no DOM, clocks, storage or dependencies.
// Rules checked against MIT projects, not copied implementation/assets:
// wieslawsoltes/Win98@bf27d8ab215bc4ba16d0a36a063854c4deb03c3b/packages/games/index.js
// https://github.com/DavidNHill/JSMinesweeper (README blob 2db9c55e3d0fd666473d7ab3f91940233f345b1e)
export const MINE_PRESETS = Object.freeze({
  beginner: Object.freeze({ cols: 9, rows: 9, mines: 10 }),
  intermediate: Object.freeze({ cols: 16, rows: 16, mines: 40 }),
  expert: Object.freeze({ cols: 30, rows: 16, mines: 99 }),
});

export function validMineBoard(cols, rows, mines) {
  return Number.isInteger(cols) && cols >= 5 && cols <= 30
    && Number.isInteger(rows) && rows >= 5 && rows <= 24
    && Number.isInteger(mines) && mines >= 1 && mines <= cols * rows - 9;
}

export class MinesweeperGame {
  constructor({ cols = 9, rows = 9, mines = 10, random = Math.random } = {}) {
    if (!validMineBoard(cols, rows, mines)) throw new RangeError('Invalid Minesweeper board');
    if (typeof random !== 'function') throw new TypeError('A random function is required');
    this.cols = cols;
    this.rows = rows;
    this.mines = mines;
    this.random = random;
    this.state = 'ready';
    this.started = false;
    this.exploded = -1;
    this.revealed = 0;
    this.flags = 0;
    this.cells = Array.from({ length: cols * rows }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false }));
  }

  neighbors(index) {
    if (!this.has(index)) return [];
    const x = index % this.cols;
    const y = Math.floor(index / this.cols);
    const out = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || x + dx < 0 || x + dx >= this.cols || y + dy < 0 || y + dy >= this.rows) continue;
        out.push((y + dy) * this.cols + x + dx);
      }
    }
    return out;
  }

  has(index) { return Number.isInteger(index) && index >= 0 && index < this.cells.length; }
  get finished() { return this.state === 'won' || this.state === 'lost'; }
  get remaining() { return this.mines - this.flags; }

  placeMines(first) {
    const safe = new Set([first].concat(this.neighbors(first)));
    const candidates = [];
    for (let i = 0; i < this.cells.length; i++) if (!safe.has(i)) candidates.push(i);
    // Partial Fisher-Yates: bounded work, exact count, no collision/retry loop.
    // Select all positions before mutation so an invalid injected RNG is atomic.
    for (let i = 0; i < this.mines; i++) {
      const draw = this.random();
      if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new RangeError('Random value must be in [0,1)');
      const next = i + Math.floor(draw * (candidates.length - i));
      const saved = candidates[i];
      candidates[i] = candidates[next]; candidates[next] = saved;
    }
    for (let i = 0; i < this.mines; i++) this.cells[candidates[i]].mine = true;
    for (let i = 0; i < this.mines; i++) {
      for (const neighbor of this.neighbors(candidates[i])) this.cells[neighbor].adjacent++;
    }
    this.started = true;
  }

  toggleFlag(index) {
    if (!this.has(index) || this.finished || this.cells[index].revealed) return false;
    const cell = this.cells[index];
    cell.flagged = !cell.flagged;
    this.flags += cell.flagged ? 1 : -1;
    return true;
  }

  reveal(index) {
    if (!this.has(index) || this.finished) return false;
    const first = this.cells[index];
    if (first.revealed || first.flagged) return false;
    if (!this.started) this.placeMines(index);
    this.state = 'playing';
    if (first.mine) {
      first.revealed = true;
      this.exploded = index;
      this.state = 'lost';
      return true;
    }
    const queue = [index];
    const queued = new Uint8Array(this.cells.length);
    queued[index] = 1;
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      const cell = this.cells[at];
      if (cell.revealed || cell.flagged || cell.mine) continue;
      cell.revealed = true;
      this.revealed++;
      if (!cell.adjacent) {
        for (const neighbor of this.neighbors(at)) {
          if (queued[neighbor]) continue;
          queued[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }
    if (this.revealed === this.cells.length - this.mines) {
      this.state = 'won';
      for (const cell of this.cells) if (cell.mine) cell.flagged = true;
      this.flags = this.mines;
    }
    return true;
  }

  chord(index) {
    if (!this.has(index) || this.state !== 'playing') return false;
    const cell = this.cells[index];
    if (!cell.revealed || !cell.adjacent) return false;
    const neighbors = this.neighbors(index);
    if (neighbors.filter((at) => this.cells[at].flagged).length !== cell.adjacent) return false;
    let changed = false;
    for (const at of neighbors) {
      if (this.finished) break;
      if (this.reveal(at)) changed = true;
    }
    return changed;
  }
}
