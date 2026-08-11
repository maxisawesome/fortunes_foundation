/* UI layer for Fortune's Foundation. Depends on game.js (window.FF). */

'use strict';

(function () {
  const FF = window.FF;
  const $ = (sel) => document.querySelector(sel);

  const FORTUNE_LINES = [
    'The cards have spoken, and they speak of victory.',
    'A fine spread — fortune favors the patient.',
    'The arcana align; your path is clear.',
    'What was scattered is now whole.',
    'The foundation holds. Your fortune is told.',
  ];

  // deal from the certified-winnable list when it's available
  const CERTIFIED = typeof WINNABLE_SEEDS !== 'undefined' ? WINNABLE_SEEDS : null;

  let currentSeed = randomSeed();

  function randomSeed() {
    if (CERTIFIED && CERTIFIED.length) {
      return CERTIFIED[Math.floor(Math.random() * CERTIFIED.length)];
    }
    return Math.floor(Math.random() * 1e9);
  }

  function isCertified(seed) {
    return !!CERTIFIED && CERTIFIED.includes(seed);
  }

  // ---------- card elements ----------

  function suitIcon(suit) {
    return `<svg class="suit-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#sym-${suit}"/></svg>`;
  }

  function cardEl(card, opts = {}) {
    const el = document.createElement('div');
    el.className = `card ${card.s === FF.MAJOR ? 'major' : 'suit-' + card.s}`;
    el.title = FF.cardLabel(card);
    if (card.s === FF.MAJOR) {
      el.innerHTML = `
        <div class="corner"><span class="rank">${card.r}</span></div>
        <div class="center major-center">
          <div class="major-star">✶</div>
          <div class="major-name">${FF.MAJOR_NAMES[card.r]}</div>
        </div>
        <div class="corner corner-br"><span class="rank">${card.r}</span></div>`;
    } else {
      el.innerHTML = `
        <div class="corner"><span class="rank">${FF.rankLabel(card.r)}</span>${suitIcon(card.s)}</div>
        <div class="center">${suitIcon(card.s)}</div>
        <div class="corner corner-br"><span class="rank">${FF.rankLabel(card.r)}</span>${suitIcon(card.s)}</div>`;
    }
    if (opts.selected) el.classList.add('selected');
    if (opts.clickable) el.classList.add('clickable');
    return el;
  }

  function placeholderEl(label) {
    const el = document.createElement('div');
    el.className = 'card placeholder';
    el.innerHTML = `<span>${label}</span>`;
    return el;
  }

  // ---------- rendering ----------

  function sameLoc(a, b) {
    return a && b && a.t === b.t && (a.t !== 'col' || a.i === b.i);
  }

  function render() {
    const s = FF.state;
    const targets = FF.selected ? FF.legalTargets(FF.selected) : [];
    const targetHas = (t) => targets.some((x) => x.t === t.t && (x.t !== 'col' || x.i === t.i));

    // --- foundations row ---
    const found = $('#foundations');
    found.innerHTML = '';
    const foundIsTarget = targetHas({ t: 'found' });

    // ascending major pile
    found.appendChild(pile(
      s.majLow >= 0 ? { s: FF.MAJOR, r: s.majLow } : null,
      '0 ▲', foundIsTarget, 'found'
    ));
    // minor piles (left pair)
    for (const suit of ['wands', 'cups']) found.appendChild(minorPile(suit, foundIsTarget));

    // free cell
    const freeWrap = document.createElement('div');
    freeWrap.className = 'pile free-pile' + (targetHas({ t: 'free' }) ? ' target' : '');
    if (s.free) {
      const c = cardEl(s.free, { selected: sameLoc(FF.selected, { t: 'free' }), clickable: true });
      c.dataset.loc = 'free';
      freeWrap.appendChild(c);
    } else {
      freeWrap.appendChild(placeholderEl('FREE'));
    }
    freeWrap.dataset.dest = 'free';
    const freeLabel = document.createElement('div');
    freeLabel.className = 'pile-label' + (s.free ? ' blocking' : '');
    freeLabel.textContent = s.free ? '⛔ blocking' : 'free cell';
    freeWrap.appendChild(freeLabel);
    found.appendChild(freeWrap);

    // minor piles (right pair)
    for (const suit of ['swords', 'pentacles']) found.appendChild(minorPile(suit, foundIsTarget));

    // descending major pile
    found.appendChild(pile(
      s.majHigh <= 21 ? { s: FF.MAJOR, r: s.majHigh } : null,
      '21 ▼', foundIsTarget, 'found'
    ));

    function pile(card, label, isTarget, dest) {
      const wrap = document.createElement('div');
      wrap.className = 'pile' + (isTarget ? ' target' : '');
      wrap.dataset.dest = dest;
      wrap.appendChild(card ? cardEl(card) : placeholderEl(label));
      return wrap;
    }

    function minorPile(suit, isTarget) {
      const wrap = pile({ s: suit, r: s.minor[suit] }, '', isTarget, 'found');
      if (s.free) wrap.classList.add('blocked');
      return wrap;
    }

    // --- tableau ---
    const tab = $('#tableau');
    tab.innerHTML = '';
    const availH = tab.clientHeight || 520;
    const cardH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ch')) || 118;

    s.cols.forEach((col, i) => {
      const colEl = document.createElement('div');
      colEl.className = 'col' + (targetHas({ t: 'col', i }) ? ' target' : '');
      colEl.dataset.dest = 'col';
      colEl.dataset.col = i;
      const baseOffset = cardH * 0.30;
      const offset = col.length > 1
        ? Math.min(baseOffset, (availH - cardH - 8) / (col.length - 1))
        : baseOffset;
      colEl.style.setProperty('--drop-y', `${col.length ? (col.length - 1) * offset : 0}px`);
      col.forEach((card, j) => {
        const isTop = j === col.length - 1;
        const el = cardEl(card, {
          selected: isTop && sameLoc(FF.selected, { t: 'col', i }),
          clickable: isTop,
        });
        el.style.top = `${j * offset}px`;
        el.style.zIndex = j + 1;
        if (isTop) { el.dataset.loc = 'col'; el.dataset.col = i; }
        colEl.appendChild(el);
      });
      tab.appendChild(colEl);
    });

    // --- status bar ---
    $('#moves').textContent = `moves: ${FF.state.moves}`;
    $('#seed').value = currentSeed;
    $('#certified').hidden = !isCertified(currentSeed);
    $('#undoBtn').disabled = FF.historyLength === 0;

    if (FF.isWon()) showWin();
  }

  // ---------- interactions ----------

  function locFromCardEl(el) {
    if (el.dataset.loc === 'free') return { t: 'free' };
    if (el.dataset.loc === 'col') return { t: 'col', i: +el.dataset.col };
    return null;
  }

  function tryMove(from, to) {
    if (FF.move(from, to)) {
      FF.selected = null;
      render();
      return true;
    }
    return false;
  }

  // The board re-renders on every click, so native dblclick events end up
  // targeting stale ancestors. Detect double-clicks manually instead.
  let lastClick = { loc: null, time: 0 };

  function onBoardClick(e) {
    const cardEl = e.target.closest('.card:not(.placeholder)');
    const clickedLoc = cardEl ? locFromCardEl(cardEl) : null;

    if (clickedLoc && sameLoc(clickedLoc, lastClick.loc) &&
        e.timeStamp - lastClick.time < 450) {
      // double-click: send to foundation, else to the free cell
      lastClick = { loc: null, time: 0 };
      if (tryMove(clickedLoc, { t: 'found' })) return;
      if (clickedLoc.t !== 'free' && tryMove(clickedLoc, { t: 'free' })) return;
    }
    lastClick = { loc: clickedLoc, time: e.timeStamp };

    if (FF.selected) {
      // find a destination under the click
      const destEl = e.target.closest('[data-dest]');
      if (destEl) {
        const dest = destEl.dataset.dest === 'col'
          ? { t: 'col', i: +destEl.dataset.col }
          : { t: destEl.dataset.dest };
        if (tryMove(FF.selected, dest)) return;
      }
      if (clickedLoc && sameLoc(clickedLoc, FF.selected)) {
        FF.selected = null; // deselect
      } else if (clickedLoc) {
        FF.selected = clickedLoc; // switch selection
      } else {
        FF.selected = null;
      }
      render();
      return;
    }

    if (clickedLoc) {
      FF.selected = clickedLoc;
      render();
    }
  }

  // ---------- win overlay ----------

  function showWin() {
    const overlay = $('#winOverlay');
    if (!overlay.hidden) return;
    overlay.hidden = false;

    const spread = $('#fortuneSpread');
    spread.innerHTML = '';
    const picks = new Set();
    while (picks.size < 3) picks.add(Math.floor(Math.random() * 22));
    for (const r of picks) {
      const el = cardEl({ s: FF.MAJOR, r });
      el.classList.add('fortune-card');
      spread.appendChild(el);
    }
    $('#fortuneLine').textContent =
      FORTUNE_LINES[Math.floor(Math.random() * FORTUNE_LINES.length)];
    $('#winMoves').textContent = `Solved in ${FF.state.moves} moves.`;
  }

  function hideWin() { $('#winOverlay').hidden = true; }

  // ---------- controls ----------

  function startGame(seed) {
    currentSeed = seed >>> 0;
    FF.newGame(currentSeed);
    hideWin();
    render();
  }

  function init() {
    $('#newBtn').addEventListener('click', () => startGame(randomSeed()));
    $('#restartBtn').addEventListener('click', () => startGame(currentSeed));
    $('#undoBtn').addEventListener('click', () => { if (FF.undo()) render(); });
    $('#winNewBtn').addEventListener('click', () => startGame(randomSeed()));

    $('#seed').addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v)) startGame(v);
    });

    const autoBox = $('#autoCollect');
    autoBox.checked = localStorage.getItem('ff-autocollect') !== 'off';
    FF.autoCollectOn = autoBox.checked;
    autoBox.addEventListener('change', () => {
      FF.autoCollectOn = autoBox.checked;
      localStorage.setItem('ff-autocollect', autoBox.checked ? 'on' : 'off');
      if (autoBox.checked) { FF.autoCollect(); render(); }
    });

    $('#rulesBtn').addEventListener('click', () => { $('#rulesModal').hidden = false; });
    $('#rulesClose').addEventListener('click', () => { $('#rulesModal').hidden = true; });
    $('#rulesModal').addEventListener('click', (e) => {
      if (e.target.id === 'rulesModal') $('#rulesModal').hidden = true;
    });

    const board = $('#board');
    board.addEventListener('click', onBoardClick);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (FF.undo()) render();
      } else if (e.key === 'u') {
        if (FF.undo()) render();
      } else if (e.key === 'Escape') {
        FF.selected = null;
        $('#rulesModal').hidden = true;
        render();
      }
    });

    window.addEventListener('resize', render);

    startGame(currentSeed);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
