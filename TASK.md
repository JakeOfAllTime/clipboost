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
- Build passes. Initial screen was visually checked at `http://localhost:3002`.
