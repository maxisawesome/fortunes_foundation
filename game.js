/* Fortune's Foundation — a tarot FreeCell-like solitaire.
 *
 * Deck: 74 cards = 4 suits x 13 (Ace–King) + 22 major arcana (0–21).
 * Setup: the four aces start on their foundations; the remaining 70 cards
 * are dealt into 10 columns of 7, with an empty 11th column in the middle.
 * Tableau: place a card on a same-suit card exactly one rank higher or lower.
 *   Major arcana act as their own suit (0–21). Empty columns take any card.
 *   One card moves at a time.
 * Foundations: suits build Ace -> King. Major arcana build up from 0 and
 *   down from 21 on two piles that meet in the middle.
 * Free cell: holds one card. While occupied, suit cards cannot be collected
 *   (this is how you stop cards from flying to the foundations).
 * Collection is automatic whenever it is legal (toggleable).
 */

'use strict';

const SUITS = ['wands', 'cups', 'swords', 'pentacles'];
const MAJOR = 'major';

const MAJOR_NAMES = [
  'The Fool', 'The Magician', 'The High Priestess', 'The Empress',
  'The Emperor', 'The Hierophant', 'The Lovers', 'The Chariot',
  'Strength', 'The Hermit', 'Wheel of Fortune', 'Justice',
  'The Hanged Man', 'Death', 'Temperance', 'The Devil',
  'The Tower', 'The Star', 'The Moon', 'The Sun',
  'Judgement', 'The World',
];

const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankLabel = (r) => RANK_LABEL[r] || String(r);

function cardLabel(card) {
  if (card.s === MAJOR) return `${card.r} · ${MAJOR_NAMES[card.r]}`;
  return `${rankLabel(card.r)} of ${card.s[0].toUpperCase()}${card.s.slice(1)}`;
}

// ---------- seeded PRNG ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- game state ----------

let state = null;
let history = [];
let selected = null;          // {t:'col', i} | {t:'free'}
let autoCollectOn = true;

function buildDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 13; r++) deck.push({ s, r }); // aces start collected
  }
  for (let r = 0; r <= 21; r++) deck.push({ s: MAJOR, r });
  return deck; // 48 + 22 = 70
}

function newGame(seed) {
  const rand = mulberry32(seed);
  const deck = shuffle(buildDeck(), rand);
  const cols = [];
  for (let i = 0; i < 11; i++) cols.push([]);
  let k = 0;
  for (let i = 0; i < 11; i++) {
    if (i === 5) continue; // middle column starts empty
    for (let j = 0; j < 7; j++) cols[i].push(deck[k++]);
  }
  state = {
    seed,
    cols,
    free: null,
    minor: { wands: 1, cups: 1, swords: 1, pentacles: 1 }, // highest collected rank
    majLow: -1,   // highest card on the ascending major pile (-1 = empty)
    majHigh: 22,  // lowest card on the descending major pile (22 = empty)
    moves: 0,
  };
  history = [];
  selected = null;
  if (autoCollectOn) autoCollect();
}

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

function pushHistory() {
  history.push(snapshot());
  if (history.length > 2000) history.shift();
}

function undo() {
  if (!history.length) return false;
  state = history.pop();
  selected = null;
  return true;
}

// ---------- rules ----------

function topOf(col) {
  return col.length ? col[col.length - 1] : null;
}

function getCardAt(loc) {
  if (loc.t === 'free') return state.free;
  return topOf(state.cols[loc.i]);
}

function canStack(card, onto) {
  return card.s === onto.s && Math.abs(card.r - onto.r) === 1;
}

// Can `card` be collected onto a foundation right now?
function canCollect(card) {
  if (card.s === MAJOR) {
    return (card.r === state.majLow + 1 && card.r < state.majHigh) ||
           (card.r === state.majHigh - 1 && card.r > state.majLow);
  }
  // suit cards can't be collected while the free cell is occupied
  return state.free === null && card.r === state.minor[card.s] + 1;
}

function collect(card) {
  if (card.s === MAJOR) {
    if (card.r === state.majLow + 1 && card.r < state.majHigh) state.majLow = card.r;
    else state.majHigh = card.r;
  } else {
    state.minor[card.s] = card.r;
  }
}

// Is a move of the card at `from` to destination `to` legal?
function canMove(from, to) {
  const card = getCardAt(from);
  if (!card) return false;
  if (to.t === 'col') {
    if (from.t === 'col' && from.i === to.i) return false;
    const dest = state.cols[to.i];
    return dest.length === 0 || canStack(card, topOf(dest));
  }
  if (to.t === 'free') return from.t !== 'free' && state.free === null;
  if (to.t === 'found') return canCollect(card);
  return false;
}

function removeCard(from) {
  if (from.t === 'free') { const c = state.free; state.free = null; return c; }
  return state.cols[from.i].pop();
}

function applyMove(from, to) {
  const card = removeCard(from);
  if (to.t === 'col') state.cols[to.i].push(card);
  else if (to.t === 'free') state.free = card;
  else collect(card);
}

// Repeatedly send legal tableau top cards to the foundations.
function autoCollect() {
  let changed = true;
  while (changed) {
    changed = false;
    for (const col of state.cols) {
      const top = topOf(col);
      if (top && canCollect(top)) {
        col.pop();
        collect(top);
        changed = true;
      }
    }
  }
}

// A user move: validate, record history, apply, then auto-collect.
function move(from, to) {
  if (!canMove(from, to)) return false;
  pushHistory();
  applyMove(from, to);
  state.moves++;
  if (autoCollectOn) autoCollect();
  return true;
}

function isWon() {
  return state.majLow + 1 === state.majHigh &&
         SUITS.every((s) => state.minor[s] === 13);
}

// All legal destinations for the card at `from` (used for highlighting).
function legalTargets(from) {
  const targets = [];
  for (let i = 0; i < 11; i++) {
    if (canMove(from, { t: 'col', i })) targets.push({ t: 'col', i });
  }
  if (canMove(from, { t: 'free' })) targets.push({ t: 'free' });
  if (canMove(from, { t: 'found' })) targets.push({ t: 'found' });
  return targets;
}

// ---------- self-test (run with: node game.js --selftest) ----------

function selfTest() {
  const assert = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); };

  newGame(12345);
  const total = state.cols.reduce((n, c) => n + c.length, 0);
  const collected =
    SUITS.reduce((n, s) => n + state.minor[s], 0) +
    (state.majLow + 1) + (22 - state.majHigh);
  assert(total + collected === 74, 'deal + foundations account for all 74 cards');
  assert(state.cols.length === 11, '11 columns');

  // deterministic deals
  const a = JSON.stringify(state.cols);
  newGame(12345);
  assert(JSON.stringify(state.cols) === a, 'same seed gives same deal');
  newGame(54321);
  assert(JSON.stringify(state.cols) !== a, 'different seed gives different deal');

  // stacking rules
  assert(canStack({ s: 'cups', r: 5 }, { s: 'cups', r: 6 }), '5C on 6C');
  assert(canStack({ s: 'cups', r: 7 }, { s: 'cups', r: 6 }), '7C on 6C');
  assert(!canStack({ s: 'cups', r: 5 }, { s: 'wands', r: 6 }), 'no cross-suit');
  assert(!canStack({ s: 'cups', r: 4 }, { s: 'cups', r: 6 }), 'no rank gap');
  assert(canStack({ s: MAJOR, r: 13 }, { s: MAJOR, r: 14 }), 'majors stack');

  // foundation rules
  newGame(1);
  state.free = null;
  state.minor.cups = 3;
  assert(canCollect({ s: 'cups', r: 4 }), 'next suit card collects');
  assert(!canCollect({ s: 'cups', r: 5 }), 'out-of-order suit card does not');
  state.free = { s: 'wands', r: 9 };
  assert(!canCollect({ s: 'cups', r: 4 }), 'occupied free cell blocks suits');
  state.majLow = 3; state.majHigh = 22;
  assert(canCollect({ s: MAJOR, r: 4 }), 'major collects ascending');
  assert(canCollect({ s: MAJOR, r: 21 }), 'major collects descending');
  state.majLow = 10; state.majHigh = 12;
  assert(canCollect({ s: MAJOR, r: 11 }), 'meeting card collects');
  collect({ s: MAJOR, r: 11 });
  assert(state.majLow + 1 === state.majHigh, 'major piles meet');
  assert(!canCollect({ s: MAJOR, r: 11 }), 'no double-collect');

  // moves + undo
  newGame(99);
  const before = JSON.stringify(state);
  const from = { t: 'col', i: 0 };
  let moved = false;
  for (const to of legalTargets(from)) {
    if (to.t === 'free') { moved = move(from, to); break; }
  }
  assert(moved, 'can move a top card to the empty free cell');
  assert(state.free !== null, 'free cell holds the card');
  assert(undo(), 'undo succeeds');
  assert(JSON.stringify(state) === before, 'undo restores exact state');

  // empty column accepts anything
  newGame(7);
  assert(canMove({ t: 'col', i: 0 }, { t: 'col', i: 5 }), 'empty column takes any card');

  // win detection
  state.majLow = 10; state.majHigh = 11;
  for (const s of SUITS) state.minor[s] = 13;
  assert(isWon(), 'win detected');
  state.minor.cups = 12;
  assert(!isWon(), 'not won with cards remaining');

  console.log('All self-tests passed.');
}

// ---------- exports / entry ----------

if (typeof module !== 'undefined' && typeof document === 'undefined') {
  if (process.argv.includes('--selftest')) selfTest();
} else if (typeof document !== 'undefined') {
  // UI layer lives in ui.js; expose the engine on window.
  window.FF = {
    SUITS, MAJOR, MAJOR_NAMES, rankLabel, cardLabel,
    newGame, move, undo, isWon, legalTargets, canMove, getCardAt, topOf,
    autoCollect,
    get state() { return state; },
    get historyLength() { return history.length; },
    get selected() { return selected; },
    set selected(v) { selected = v; },
    get autoCollectOn() { return autoCollectOn; },
    set autoCollectOn(v) { autoCollectOn = !!v; },
  };
}
