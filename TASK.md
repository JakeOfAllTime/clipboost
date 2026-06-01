## Current Task
Duplicate the existing Clipboost/ReelForge folder and begin a UX-focused refactor that makes the editor easier for amateurs to use.

## Status
in progress

## Notes
- Working copy: `/Users/littlemac/Desktop/clipboost-loupe-refactor`
- Original folder remains untouched at `/Users/littlemac/Desktop/clipboost-loupe`.
- First pass focused on the upload/start flow, guided workflow state, simpler auto-generation controls, and trust-critical bug fixes.
- Added a Simple/Pro tools Workspace switch for the loaded-video editor. Simple is the default; Pro tools reveals the manual timeline, loupe, source/music controls, and other advanced controls.
- Synced clips-bar selection/scrubbing with the Pro tools loupe and mini preview so the active clip/frame has one source of truth.
- Backed up the current refactor state separately before continuing: `/Users/littlemac/Desktop/clipboost-loupe-refactor-backup-20260601-093832` and git tag `backup-before-precision-redesign-20260601`.
- Redesigned the inline Pro tools Precision Trimmer as a larger active-clip inspector with clearer start/end frame controls and synced clips-bar highlighting.
- Build passes. Initial screen was visually checked at `http://localhost:3002`.
