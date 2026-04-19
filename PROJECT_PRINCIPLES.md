# Clipboost — Project Principles

This document is the north star for all work on Clipboost. When in doubt, read this before proposing options or writing code.

## Positioning

Clipboost is explicitly designed to **snipe the UX shortcomings of other video editing / clipmaking programs.** Our competitive edge is not features — it is polish, smoothness, and responsiveness during the act of using the app. Users should feel like the app *wants* them to succeed.

## The Edit Loop Is Sacred

The core loop is:

```
create anchors → play clips → tweak → play clips → export
```

Every design choice is judged by how it affects this loop. The loop must feel fast, confident, and rhythmic. Anything that forces the user to wait, confirm, re-learn, or second-guess during the loop is a bug — even if it's "working as intended."

## Ranking Principle

When multiple solutions are on the table, **rank by edit-loop happiness first, correctness/completeness second.**

- Instant + 95% perfect beats perfect-but-delayed.
- A sub-100ms transition is better than a flawless one that needs a "building preview…" state.
- Small visual imperfection under motion < large pause while still.
- Predictable < magical. The user must always know where they are and what's coming next.

## Concrete Non-Goals

These things, even if technically possible, are explicitly *not* what we want:

- "Please wait while we process…" states during the edit loop. Ever.
- Modals that pop in unprompted.
- Layout shifts when UI becomes active. Empty states must already occupy the space.
- Settings buried behind gear icons when they belong in the flow.
- Toasts for success states the user already confirmed by their action.
- Features that require a tutorial. If it needs a tutorial, the affordance is wrong.

## UX Standards Every Change Must Meet

Before marking a task complete:

- [ ] Works smoothly at 375px, 768px, and desktop. No layout thrash on resize.
- [ ] Touch targets ≥ 44×44 on mobile (use `.touch-target-min` if compact visual is needed).
- [ ] Focus-visible ring appears on Tab navigation; not on mouse clicks.
- [ ] Playback transitions under 100ms. Any gap is a regression.
- [ ] No `alert()` / `confirm()` — use `showToast`.
- [ ] State changes are reversible or confirmed. Undo stack covers anchor edits.
- [ ] Every new piece of UI has a visible empty state. No "pops into existence."
- [ ] Mobile test: drag, double-tap, pinch, long-press all feel intentional.

## Architectural Decisions on Record

These are the load-bearing choices. Revisit with care.

### Play Clips transition: dual-video hot swap

The Play Clips preview uses **two `<video>` elements** (A and B), both pointed at the source blob. While clip N plays on A, we pre-seek clip N+1 on B (~800ms before N ends). At the boundary we swap display/opacity and play B; A becomes the next standby.

**Why:** Single-video seek on transition was 100–800ms on mobile, breaking the rhythm of the loop. The FFmpeg-concat alternative would be pixel-perfect but require 3–20s of "building preview…" — which would train users to skip preview and just export. Dual-video swap gives sub-100ms transitions while using the same anchor boundaries as the export, so cut points match exactly.

**Trade-offs accepted:** If the next clip lands between keyframes on mobile, the pre-seek may still take 300ms — but this happens *during* the prior clip, invisibly. In the pathological case where pre-seek exceeds 800ms, we fall back to the old single-video seek path and accept one visible gap.

### Smart Gen timestamp authority: moment inventory, not Claude's response

When Smart Gen resolves clip start times, the authority is `allMoments[clip.momentIndex - 1].timestamp`, **not** Claude's `startTime`. Before the fix, `clip.startTime ?? 0` silently piled every clip at 0:00 when Claude's response was incomplete. The resolver (`resolveAndValidateClips` in pages/index.js) also rebalances zone distribution — no zone over 40%, finale coverage required on videos > 5 min.

### No client-side localStorage for artifacts

Per Claude.ai restrictions. Autosave lives in localStorage; exported videos go straight to download.

### Client-side FFmpeg.wasm only

No server upload pipeline. This is a privacy and speed commitment. A Vercel deploy stays edge-function-only; media never leaves the browser.

## When You're About to Make a Trade-off

State the happiness cost of each option explicitly. "This is correct but adds a 3-second wait" is a more honest framing than "this is the correct approach." The user can redirect you if the wait is unacceptable — they can't redirect you if you didn't name it.

---

*Last updated: 2026-04-18 — added on adoption of the dual-video Play Clips architecture.*
