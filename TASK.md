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
- Build passes. Initial screen was visually checked at `http://localhost:3002`.
