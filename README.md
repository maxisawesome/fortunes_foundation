# Fortune's Foundation

A browser clone of the tarot solitaire from *The Zachtronics Solitaire Collection* —
FreeCell-like, played with a 74-card tarot deck.

## Play

Open `index.html` in a browser. No build step, no dependencies.

## Install as an app (PWA)

The game is a Progressive Web App: serve it over HTTPS (any static host —
GitHub Pages, Vercel, Netlify) and visit it on your phone. Chrome on Android
will offer **Install app** (or use ⋮ → *Add to Home Screen*). It launches
fullscreen in landscape with its own icon and works offline after the first
visit (`sw.js` caches the app shell; bump the cache version there when files
change).

To try it locally: `python3 -m http.server 8000`, then open
`http://localhost:8000`. Phones are best in landscape; portrait shows a
rotate prompt.

## Rules

- **Deck** — four suits of 13 (Ace–King) plus the 22 major arcana (0–21), which
  behave as a fifth suit.
- **Deal** — the four aces start on their foundations; the remaining 70 cards are
  dealt into 10 columns of 7 with an empty column in the middle.
- **Tableau** — a card may be placed on a same-suit card exactly one rank higher or
  lower. One card moves at a time. An empty column accepts any card.
- **Foundations** — suits collect upward from the aces. The major arcana collect on
  two piles, up from 0 and down from 21, meeting in the middle.
- **Free cell** — holds one card; while occupied, suit cards cannot be collected.
  Use it to stop cards you still need from flying to the foundations.
- **Collection is automatic** whenever legal (toggleable in the header).

## Controls

- Click a card to select it (legal destinations glow green), click a destination to move.
- Double-click a card to send it to a foundation, or failing that, the free cell.
- `U` or `Cmd+Z` to undo, `Esc` to deselect.
- The number in the header is the deal seed — type one in to replay a specific deal,
  or share it with a friend.

Note: unlike the original (which ships only solver-verified deals), deals here are
random and not guaranteed solvable — undo generously.

## Code

- `game.js` — pure game engine (deal, rules, moves, undo, auto-collect). Runs
  headless too: `node game.js --selftest`.
- `ui.js` — DOM rendering and input.
- `index.html` — markup, styles, and the suit icons.
