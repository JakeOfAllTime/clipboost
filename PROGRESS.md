# Progress

## Completed
- Duplicated the original folder to `/Users/littlemac/Desktop/clipboost-loupe-refactor`.
- Installed dependencies in the duplicate.
- Added a clearer three-step workflow strip for upload, clip selection, and export readiness.
- Reworked the empty upload state around one primary action.
- Collapsed optional source/music controls by default after upload.
- Reworked the auto-generate controls into beginner-friendly Fast, Story, and Deep choices with clearer CTA labels.
- Fixed the music export duration shadowing bug.
- Strengthened Smart Gen frame manifests with raw seconds and made frame references override model-written timestamps.
- Fixed Smart/Pro final clip selection to pass story type instead of the zones array.
- Verified `npm run build` succeeds.
- Visually checked the initial screen at `http://localhost:3002`.
- Added a loaded-editor Workspace switch with Simple as the default and Pro tools as the opt-in mode.
- Hid source/music controls, the manual timeline, loupe trimming, undo/redo, trim, clear, and clip stats from Simple mode.
- Kept the main player, clips preview, and Make Clips generator visible in Simple mode so beginner users stay on the core loop.
- Added an inline "Open Pro Tools" prompt for users who need exact manual cuts.
- Verified `npm run build` succeeds after the Simple/Pro mode change.
- Rechecked the initial screen in Chrome at `http://localhost:3002`.
- Synced the Pro tools loupe/side preview with clips-bar selection and scrubbing, not only lower timeline anchor selection.
- Added a shared focused-frame state so frame nudges and clips-bar seeks update the mini preview target.
- Verified `npm run build` succeeds after the loupe/selection sync change.

## Attempted But Failed
- Tried to upload a local test video through the in-app browser automation, but the available browser API does not expose file selection for hidden file inputs.
- Chrome visual verification covered the initial app shell, but not the post-upload Workspace switch because local file chooser automation was not available.
- The loupe/selection sync change is build-verified and app-shell verified, but still needs hands-on post-upload testing with a real video.

## Next Logical Step
- Validate the post-upload Workspace switch and loupe preview sync manually or with a browser tool that supports file chooser automation.
- Next high-impact UX pass: polish the Simple mode post-upload hierarchy around one primary "Make Clips" action and a clearer export-ready state.

## Open Questions
- Should the default automatic mode stay Fast/free, or should Story become the recommended default for users who expect the AI experience?
- Should export prioritize exact cuts by re-encoding clips, or keep stream-copy speed with a visible warning that exact frame cuts may depend on keyframes?
