## Current Task
Duplicate the existing Clipboost/ReelForge folder and begin a UX-focused refactor that makes the editor easier for amateurs to use.

## Status
in progress

## Notes
- Working copy: `/Users/littlemac/Desktop/Clipboost Refactor Work/clipboost-loupe-refactor`
- Original folder remains untouched at `/Users/littlemac/Desktop/clipboost-loupe`.
- First pass focused on the upload/start flow, guided workflow state, simpler auto-generation controls, and trust-critical bug fixes.
- Added a Simple/Pro tools Workspace switch for the loaded-video editor. Simple is the default; Pro tools reveals the manual timeline, loupe, source/music controls, and other advanced controls.
- Synced clips-bar selection/scrubbing with the Pro tools loupe and mini preview so the active clip/frame has one source of truth.
- Backed up the current refactor state separately before continuing: `/Users/littlemac/Desktop/Clipboost Refactor Work/clipboost-loupe-refactor-backup-20260601-093832` and git tag `backup-before-precision-redesign-20260601`.
- Redesigned the inline Pro tools Precision Trimmer as a larger active-clip inspector with clearer start/end frame controls and synced clips-bar highlighting.
- Added a local-dev-only test clip loader for `/Users/littlemac/Desktop/testclips`.
- Added exclusive beat-sync targets for Music vs Original sound and fixed lazy beat-grid analysis for both.
- Browser smoke-tested Quick Gen with Original sound sync using `d79mAGVzZVM.mp4`; Pro tools opened with the Precision Trimmer active.
- Fixed the Music 100% audio-balance path so source audio is hard-muted in preview and not mapped into exports.
- The dev test clip panel now reads `Desktop/TestClips` and pins the five preferred test files first.
- The active refactor repo and backups now live under `/Users/littlemac/Desktop/Clipboost Refactor Work`.
- Play Clips now hard-cuts between dual video layers and waits for the standby frame to be presented before swapping, reducing the brief flash between clips.
- Dev music buttons now load `vlog-beat-background-349853.mp3` and `retro-lounge-389644.mp3` from `Desktop/TestClips`.
- Quick Gen now defaults Pace to 3 seconds.
- The inline Precision Trimmer now uses a focused frame nudge rail for Start/End edge adjustments.
- The former oversized loupe handle bar is now a compact Edge Map for Start/End focus selection.
- Precision controls now support hold-to-nudge on the rail, drag-to-nudge on the Edge Map pills, and a large two-zone hold nudge pad.
- The Edge Map is now a Boundary Map spanning the safe range between neighboring clips, with softer focus markers, separated overlapping handles, `1f`/`5f`/`10f` hold controls, and a draggable `S`/`E` pill in the preview-side rail.
- The preview-side rail pill is now a spring nudge puck with gentle/strong pull speeds, the Boundary Map area has local `Prev clip` / `Next clip` navigation, and the Pro timeline has a magnifier toggle that zooms around the selected clip.
- Boundary Map pills now free-drag the selected start/end boundary directly; frame nudging lives in the spring puck and nudge buttons.
- Frame nudges now clamp against previous/next clip boundaries so adjacent clips can touch but cannot overlap by accident.
- GitHub `main` now points at this refactor; previous GitHub `main` is backed up as `backup/pre-refactor-main-20260601-133245`; Vercel production is live at `https://clipboost-ten.vercel.app`.
- The Precision Trimmer now uses one consolidated editor card: preview and frame rail on top, compact Boundary Strip below, then local Prev/Loop/Next controls before the main Timeline.
- Export defaults to `Fast Original`, with `Draft Vertical` and polished social render options labeled by speed/format tradeoff.
- Latest touch-up pass removed the old Trim toolbar button, shortened the mobile timeline, made manual timeline clips default to 1s, added mobile double-tap delete for clips, lowered generated clip Length minimum to 5s, and reduced Play Clips fallback pausing on slower devices.
- Cleanup refactor removed the old global Trim modal, the older standalone Precision modal, stale precision modal state/refs/audio mixer code, and obsolete precision-modal shortcut help.
- Manual timeline clip creation now goes through one shared helper for desktop double-click and mobile double-tap, preserving 1s defaults and overlap prevention.
- Repeated anchor deletion now clears pending touch/hold timers, selects the nearest remaining clip, and preserves scroll position so the Precision Trimmer does not jump away after deleting.
- Mobile Pro timeline anchors are slightly shorter now; desktop timeline sizing is unchanged.
- Mobile anchor touches now suppress the parent timeline's create-clip double-tap handler, preventing the post-delete "Clip overlaps" warning.
- Corrected mobile anchor delete to match desktop more closely: touch-start selects/prepares drag, touch-end detects the double tap on the anchor body, and handle touches stay reserved for resizing.
- Build passes. The dev server is running on port 3002 with LAN binding for phone testing.
- Pushed the tested mobile-delete version to GitHub `main` and deployed production on Vercel.
- Story/Deep foundation pass started: the modes now receive distinct prompt guidance, supplemental missing-moment results are normalized correctly, and Deep includes motion candidates.
- `npm run build` passes after the Story/Deep foundation patch.
- Anthropic API key is configured locally and in Vercel Production/Development env storage.
- Story now routes to Haiku 4.5 (`claude-haiku-4-5-20251001`) and Deep routes to Sonnet 4.6 (`claude-sonnet-4-6`).
- Local API smoke tests pass for both Story and Deep. Next validation is full video runs against the preferred TestClips videos.
- Added visible AI reasoning: selected generated clips show a "Why this clip" panel, and wider clips in the preview strip show compact reason chips.
- Added an optional Deep brief field for creator direction; it feeds Deep prompt guidance and targeted missing-moment search.
- Build passes and browser smoke check confirmed the Deep brief appears after selecting Deep.
- Fixed the Deep brief keyboard conflict: global Space/playback shortcuts now ignore text-editing fields, and browser testing confirmed spaces type normally without toggling video playback.
- Applied a small mobile learner-friction pass: compacted the workflow strip, hardened Play Clips startup into clips mode, made anchor-handle double taps count for delete when not dragged, and added visible Deep progress phases.
- Forked this work into the separate `/Users/littlemac/Desktop/Clipboost Refactor Work/clipboost-mobile-simple` experiment and reshaped Simple mode into a mobile-first workbench: setup controls, Make Clips, main player, Play Clips/clip strip, then the zoomable anchor timeline; Pro keeps the extra precision/why/loupe surfaces.
