/* Solvability search for Fortune's Foundation deals.
 *
 * Deals come from game.js (the real engine), get converted to a compact
 * integer representation, and are searched best-first with a transposition
 * table. Column order is irrelevant to the game, so states are canonicalized
 * by sorting columns before hashing. Every solution found is verified by
 * replaying it through game.js move-by-move.
 *
 * Usage:
 *   node solver.js solve <seed> [cap]        one seed, with the winning line
 *   node solver.js scan <start> <count> [cap]  many seeds, stats + seed list
 *
 * A search that exhausts every reachable state without winning is a proven
 * loss. One that hits the node cap is "unproven" — treated as unusable.
 */

'use strict';

const game = require('./game.js');

// card code = suit * 32 + rank; suits: 0-3 minors (game.SUITS order), 4 major
const MAJ = 4;
const suitIndex = Object.fromEntries(game.SUITS.map((s, i) => [s, i]));
const NO_CARD = -1;

function convert(gs) {
  return {
    cols: gs.cols.map((col) => col.map((c) => (c.s === game.MAJOR ? MAJ : suitIndex[c.s]) * 32 + c.r)),
    free: gs.free ? ((gs.free.s === game.MAJOR ? MAJ : suitIndex[gs.free.s]) * 32 + gs.free.r) : NO_CARD,
    minor: game.SUITS.map((s) => gs.minor[s]),
    majLow: gs.majLow,
    majHigh: gs.majHigh,
  };
}

const suitOf = (c) => c >> 5;
const rankOf = (c) => c & 31;

function cloneState(st) {
  return {
    cols: st.cols.map((c) => c.slice()),
    free: st.free,
    minor: st.minor.slice(),
    majLow: st.majLow,
    majHigh: st.majHigh,
  };
}

function canCollectFast(st, card) {
  const s = suitOf(card), r = rankOf(card);
  if (s === MAJ) {
    return (r === st.majLow + 1 && r < st.majHigh) || (r === st.majHigh - 1 && r > st.majLow);
  }
  return st.free === NO_CARD && r === st.minor[s] + 1;
}

// mirrors game.js collect(): a card fitting both major piles goes low
function collectFast(st, card) {
  const s = suitOf(card), r = rankOf(card);
  if (s === MAJ) {
    if (r === st.majLow + 1 && r < st.majHigh) st.majLow = r;
    else st.majHigh = r;
  } else {
    st.minor[s] = r;
  }
}

// mirrors game.js autoCollect() pass order exactly
function autoCollectFast(st) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const col of st.cols) {
      if (col.length && canCollectFast(st, col[col.length - 1])) {
        collectFast(st, col.pop());
        changed = true;
      }
    }
  }
}

function isWonFast(st) {
  return st.majLow + 1 === st.majHigh &&
         st.minor[0] === 13 && st.minor[1] === 13 && st.minor[2] === 13 && st.minor[3] === 13;
}

// canonical key: column order doesn't matter, so sort column strings
function hashState(st) {
  const cols = st.cols.map((c) => String.fromCharCode(...c)).sort();
  return cols.join('|') + '#' + st.free + '#' + st.minor.join(',') +
         '#' + st.majLow + '#' + st.majHigh;
}

/* All distinct user moves from a state. Foundation moves are almost entirely
 * handled by auto-collect; the one exception is a major arcana card sitting
 * in the free cell, which auto-collect never touches. Moves to empty columns
 * are generated only for the first empty column (they're interchangeable). */
function genMoves(st) {
  const moves = [];
  const firstEmpty = st.cols.findIndex((c) => c.length === 0);

  const destinations = (card, fromCol) => {
    const out = [];
    for (let j = 0; j < 11; j++) {
      if (j === fromCol) continue;
      const dest = st.cols[j];
      if (dest.length === 0) {
        if (j === firstEmpty) out.push({ t: 'col', i: j });
      } else {
        const top = dest[dest.length - 1];
        if (suitOf(card) === suitOf(top) && Math.abs(rankOf(card) - rankOf(top)) === 1) {
          out.push({ t: 'col', i: j });
        }
      }
    }
    return out;
  };

  for (let i = 0; i < 11; i++) {
    const col = st.cols[i];
    if (!col.length) continue;
    const card = col[col.length - 1];
    for (const to of destinations(card, i)) moves.push({ from: { t: 'col', i }, to });
    if (st.free === NO_CARD) moves.push({ from: { t: 'col', i }, to: { t: 'free' } });
  }

  if (st.free !== NO_CARD) {
    for (const to of destinations(st.free, -1)) moves.push({ from: { t: 'free' }, to });
    if (suitOf(st.free) === MAJ && canCollectFast(st, st.free)) {
      moves.push({ from: { t: 'free' }, to: { t: 'found' } });
    }
  }
  return moves;
}

function applyMoveFast(st, m) {
  const card = m.from.t === 'free'
    ? st.free
    : st.cols[m.from.i][st.cols[m.from.i].length - 1];
  if (m.from.t === 'free') st.free = NO_CARD;
  else st.cols[m.from.i].pop();
  if (m.to.t === 'col') st.cols[m.to.i].push(card);
  else if (m.to.t === 'free') st.free = card;
  else collectFast(st, card);
  autoCollectFast(st);
}

/* Heuristic: mostly "how much is collected", plus soft credit for same-suit
 * adjacent pairs already stacked, empty columns, and a free free-cell. */
function score(st) {
  let collected = st.majLow + 1 + (22 - st.majHigh);
  for (let s = 0; s < 4; s++) collected += st.minor[s];
  let adj = 0, empties = 0;
  for (const col of st.cols) {
    if (!col.length) { empties++; continue; }
    for (let k = 1; k < col.length; k++) {
      if (suitOf(col[k]) === suitOf(col[k - 1]) &&
          Math.abs(rankOf(col[k]) - rankOf(col[k - 1])) === 1) adj++;
    }
  }
  return collected * 1000 + adj * 12 + empties * 40 + (st.free === NO_CARD ? 25 : 0);
}

// ---------- max-heap ----------

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].score >= a[i].score) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].score > a[m].score) m = l;
        if (r < a.length && a[r].score > a[m].score) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// ---------- search ----------

function solve(seed, cap = 200000) {
  game.newGame(seed);
  const start = convert(game.getState());
  if (isWonFast(start)) return { seed, result: 'solved', moves: [], nodes: 0 };

  const heap = new Heap();
  const visited = new Set([hashState(start)]);
  heap.push({ st: start, parent: null, move: null, score: score(start) });
  let nodes = 0;

  while (heap.size && nodes < cap) {
    const cur = heap.pop();
    for (const m of genMoves(cur.st)) {
      const next = cloneState(cur.st);
      applyMoveFast(next, m);
      const key = hashState(next);
      if (visited.has(key)) continue;
      visited.add(key);
      nodes++;
      const node = { st: next, parent: cur, move: m, score: score(next) };
      if (isWonFast(next)) {
        const moves = [];
        for (let n = node; n.move; n = n.parent) moves.push(n.move);
        moves.reverse();
        return { seed, result: 'solved', moves, nodes };
      }
      heap.push(node);
    }
  }
  return { seed, result: heap.size === 0 ? 'unsolvable' : 'unproven', nodes };
}

// replay a solution through the real engine — the ground truth
function verify(seed, moves) {
  game.newGame(seed);
  for (const m of moves) {
    if (!game.move(m.from, m.to)) return false;
  }
  return game.isWon();
}

// ---------- CLI ----------

if (require.main === module) {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'solve') {
    const seed = parseInt(args[0], 10);
    const cap = args[1] ? parseInt(args[1], 10) : 200000;
    const t0 = Date.now();
    const res = solve(seed, cap);
    const ms = Date.now() - t0;
    if (res.result === 'solved') {
      const ok = verify(seed, res.moves);
      console.log(`seed ${seed}: SOLVED in ${res.moves.length} moves ` +
        `(${res.nodes} nodes, ${ms}ms) — replay ${ok ? 'VERIFIED' : 'FAILED!!'}`);
      process.exitCode = ok ? 0 : 1;
    } else {
      console.log(`seed ${seed}: ${res.result.toUpperCase()} (${res.nodes} nodes, ${ms}ms)`);
    }
  } else if (cmd === 'scan') {
    const start = parseInt(args[0], 10);
    const count = parseInt(args[1], 10);
    const cap = args[2] ? parseInt(args[2], 10) : 200000;
    const winnable = [];
    let unsolvable = 0, unproven = 0, verifyFailures = 0;
    const t0 = Date.now();
    for (let seed = start; seed < start + count; seed++) {
      const res = solve(seed, cap);
      if (res.result === 'solved') {
        if (verify(seed, res.moves)) winnable.push(seed);
        else { verifyFailures++; console.error(`seed ${seed}: REPLAY FAILED — solver/engine mismatch!`); }
      } else if (res.result === 'unsolvable') unsolvable++;
      else unproven++;
      const done = seed - start + 1;
      if (done % 25 === 0) {
        console.error(`  ...${done}/${count} scanned, ${winnable.length} winnable, ` +
          `${unsolvable} unsolvable, ${unproven} unproven (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
      }
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    console.error(`\nscanned ${count} seeds in ${secs}s: ${winnable.length} winnable ` +
      `(${(100 * winnable.length / count).toFixed(1)}%), ${unsolvable} proven unsolvable ` +
      `(${(100 * unsolvable / count).toFixed(1)}%), ${unproven} unproven, ${verifyFailures} verify failures`);
    console.log(JSON.stringify(winnable));
  } else {
    console.log('usage: node solver.js solve <seed> [cap] | scan <start> <count> [cap]');
  }
}

module.exports = { solve, verify };
