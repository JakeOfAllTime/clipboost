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
- Build passes. Initial screen was visually checked at `http://localhost:3002`.
