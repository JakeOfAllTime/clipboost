# pages/ Directory Context

## Overview
This directory contains the main application pages for ReelForge. Currently using Next.js Pages Router (not App Router).

---

## index.js (~6500 lines)

**Purpose:** Main ReelForge video editor - handles all video editing workflows, UI, and state management.

### State Management

**Video State:**
- `video` - File object of uploaded video
- `videoUrl` - Blob URL for video player
- `duration` - Total video duration in seconds
- `currentTime` - Video playback position

**Anchors (Clips) State:**
- `anchors` - Array of clip objects: `[{ id, start, end }]`
- `selectedAnchor` - Currently selected anchor ID
- `history` / `historyIndex` - Undo/redo stack for anchors
- `anchorTime` - Total duration of all clips

**Preview Mode State:**
- `playbackMode` - 'clips' | 'full' (which timeline is active)
- `isPreviewMode` - Boolean for clips preview
- `previewTimeline` - Sequential clip timeline data
- `previewCurrentTime` - Current time in preview
- `previewAnchorIndex` - Which clip is currently playing
- `isPreviewPlaying` - Preview playback state

**Music State:**
- `music` - Audio file object
- `musicUrl` - Blob URL for audio
- `musicStartTime` / `musicEndTime` - Music trim points
- `audioBalance` - Video/music volume mix (0-100)
- `enableBeatSync` - Beat-sync toggle
- `musicAnalysis` - Beat grid data from audio analysis

**Smart Gen State:**
- `autoGenMode` - 'quick' | 'smart' | 'pro'
- `targetDuration` - Target clip duration (15-180s)
- `videoAnalysis` - Motion detection results
- `isAnalyzing` - Smart Gen in progress

**UI State:**
- `currentSection` - 'edit' | 'export'
- `showPrecisionModal` - Precision editor modal
- `precisionAnchor` - Anchor being edited in precision mode
- `selectedHandle` - 'start' | 'end' (which handle in precision)

---

## Key Functions (alphabetical)

### Video Analysis & Smart Gen

**`analyzeVideo(video, sensitivity)`** - Lines ~1800-1900
- Client-side motion detection using canvas frame extraction
- Returns array of motion scores per second
- Used by Quick Gen mode (FREE)

**`gatherComprehensiveFrames(video, duration)`** - Lines ~2700-2900
- **CRITICAL for Smart Gen**
- Extracts 50 frames across 5 strategic zones:
  - Opening (0-10%)
  - Early-middle (20-35%)
  - Middle (45-60%)
  - Late-middle (70-85%)
  - Finale (90-100%)
- Returns: `{ frames: [], zones: [] }`
- Each frame: `{ time, imageData, zone }`
- **Creates frame manifest** with exact timestamps

**`analyzeNarrativeComprehensive(frames, targetDuration, zones)`** - Lines ~3100-3300
- **CRITICAL for Smart Gen**
- Calls `/api/analyze-narrative` with all 50 frames + manifest
- Sends frame manifest: "Frame 42: 26:30 (1590.0s) - finale zone"
- Returns JSON: `{ storyType, narrative, suggestedCuts[], confidence, missingMoments[] }`
- Each suggestedCut: `{ frameReference, startTime, endTime, reason, importance }`

**Known Issue:** startTime often doesn't match frame.time from manifest
- Clips end up at 0:00 instead of spanning timeline
- Need validation: `cut.startTime === frames[cut.frameReference - 1].time`

**`applyGentleBeatSync(cuts, musicAnalysis)`** - Lines ~3400-3500
- Adjusts clip boundaries to align with music beats
- Used when `enableBeatSync === true`

---

### Timeline & Anchor Management

**`buildPreviewTimeline()`** - Lines ~2325-2360
- Builds sequential timeline from anchors
- Maps each anchor to preview time: `{ previewStart, previewEnd, sourceStart, sourceEnd, duration }`
- Sets `previewTimeline` and `previewTotalDuration`
- **Always runs** when anchors change (for clips timeline display)

**`handleTimelineMouseDown(e)`** - Lines ~3600-3800
- Handles all timeline interactions:
  - Click empty space → add anchor (double-click)
  - Click anchor → select
  - Drag anchor → move
  - Drag handles → resize start/end
- Uses `draggingAnchor` / `resizingHandle` state

**`getAnchorColor(index, isSelected)`** - Lines ~1600-1650
- Returns Tailwind classes for anchor visual state
- Cycles through colors: blue → purple → green → orange
- Highlights selected anchor

**`deleteAnchor(id)`** - Lines ~1700-1750
- Removes anchor by ID
- Saves to history for undo

**`saveToHistory(newAnchors)`** - Lines ~1500-1550
- Pushes anchor state to undo stack
- Clears redo history

**`undo()` / `redo()`** - Lines ~1550-1600
- Navigate undo/redo stack
- Updates anchors from history

---

### Preview Mode

**`startEnhancedPreview()`** - Lines ~2386-2420
- Enters clips preview mode
- Calls `buildPreviewTimeline()`
- Seeks to first clip
- Starts playback with music sync

**`stopEnhancedPreview()`** - Lines ~2422-2442
- Exits preview mode
- Stops video/music
- Resets preview state

**`togglePreviewPlayback()`** - Lines ~2445-2462
- If not in preview mode → call `startEnhancedPreview()`
- Else → toggle play/pause
- Syncs video and music playback

**`seekPreviewTime(previewTime)`** - Lines ~2368-2384
- Seeks to specific time in preview timeline
- Maps preview time → source time using timeline segments
- Syncs music if enabled

---

### Precision Mode

**`getPrecisionRange(anchor)`** - Lines ~3200-3250
- Calculates viewport for precision timeline
- Dynamic range based on anchor length (3x buffer)
- Returns: `{ start, end }` for timeline bounds

**`handlePrecisionTimelineMouseDown(e)`** - Lines ~3300-3400
- Precision timeline click/drag handlers
- Allows pixel-perfect anchor adjustments

**`applyPrecisionChanges()`** - Lines ~3480-3500
- Saves precision edits to main anchors
- Closes modal
- Updates history

---

### Export

**`exportVideo()`** - Lines ~5800-6200
- Multi-platform export using FFmpeg.wasm
- Processes each platform: TikTok (9:16), Feed (4:5), Twitter (16:9), Original
- Pipeline:
  1. Concatenate anchor segments
  2. Add music (if enabled)
  3. Crop/pad for aspect ratio
  4. Encode and download

**Platform configs:**
```javascript
platforms = {
  tiktok: { width: 1080, height: 1920, name: "TikTok/Reels" },
  feed: { width: 1080, height: 1350, name: "Instagram Feed" },
  twitter: { width: 1920, height: 1080, name: "Twitter" },
  original: { aspect: "original", name: "Original" }
}
```

---

### Helper Functions

**`formatTime(seconds)`** - Lines ~1400-1420
- Converts seconds → "MM:SS" format
- Used throughout UI for time display

**`extractFramesFromRange(video, startTime, count, interval)`** - Lines ~2500-2650
- FFmpeg.wasm frame extraction helper
- Returns base64 image data for frames
- Used by `gatherComprehensiveFrames()`

**`setupAudioMixer(videoEl, musicEl)`** - Lines ~1900-2000
- Web Audio API setup for volume mixing
- Allows `audioBalance` slider to work
- Mixes video audio + music track

---

## Component Structure (JSX)

**Layout:**
```
<div className="app">
  <Sidebar /> - Navigation (Edit/Export)

  {currentSection === 'edit' && (
    <>
      <VideoUploadPanel />
      <MusicUploadPanel />
      <VideoEditorPanel /> - Unified panel (new)
    </>
  )}

  {currentSection === 'export' && (
    <ExportPanel />
  )}

  <PrecisionModal />
  <TrimModal />
</div>
```

**VideoEditorPanel** (Lines 4310-5280):
- Video player with play/pause overlay
- Playback info (time, clip count)
- Playback controls (Prev/Play Clips/Next/Precision)
- Clips Timeline - Shows sequential clips with overlays
- Main Timeline - Full video with draggable anchors
- Action Toolbar - Undo/Redo/Trim/Clear + Stats + Auto-Gen

---

## Important Patterns

**When editing Smart Gen:**
1. Always read frame manifest structure first
2. Check `analyzeNarrativeComprehensive()` for API call format
3. Verify frame manifest is included in prompt
4. Test with console logs: `console.log('Frame times:', frames.map(f => f.time))`
5. Validate: `cut.startTime` should match `frames[cut.frameReference - 1].time`

**When editing timeline:**
1. Anchors use absolute time (video timestamp)
2. Preview timeline uses relative time (sequential)
3. Don't mix anchor.start with previewTimeline.previewStart
4. Always save to history after anchor changes

**When editing preview mode:**
1. `buildPreviewTimeline()` must run before preview starts
2. Preview uses `previewCurrentTime` (not `currentTime`)
3. Music sync uses `segment.musicTime + offset`
4. Always stop preview when switching to full mode

**FFmpeg.wasm patterns:**
1. Always load FFmpeg before operations
2. Use `-ss` (start) and `-t` (duration) for trimming
3. Use `-filter_complex` for audio mixing
4. Clean up temp files: `ffmpeg.FS('unlink', filename)`

---

## Recent Changes

**2025-01-08:**
- Removed redundant clips timeline (Preview Mode Scrubber)
- Enhanced bottom clips timeline with time/clip overlays
- Improved mobile layout (reduced padding, better space usage)
- Fixed Play Clips button to start preview mode properly

**2025-01-08 (earlier):**
- Fixed precision modal prev/next buttons (added _index property)
- Reorganized music controls (Preview Audio alongside adjustment buttons)
- Consolidated video editor into unified panel with dynamic glow

**2025-01-07:**
- Implemented two-phase Smart Gen (gather → analyze)
- Added frame manifest with explicit timestamps
- Removed agentic seeking loop (too complex/unpredictable)

---

## Testing Notes

**Smart Gen Testing:**
- Use `/test-smart-gen` command for validation checklist
- Test with 3 video types: cooking (28min), livestream (85min), tutorial (5min)
- Check console for "Creating anchor: start=X, end=Y"
- Verify clips span opening → middle → finale zones

**Timeline Testing:**
- Add anchors by double-clicking main timeline
- Drag handles to resize (min 1s duration)
- Drag anchor body to move
- Test undo/redo after each operation
- Verify anchor colors cycle correctly

**Preview Testing:**
- Click "Play Clips" to start preview
- Verify clips play sequentially
- Check music sync if enabled
- Test Prev/Next buttons
- Verify clips timeline playhead moves

**Export Testing:**
- Select multiple platforms
- Verify FFmpeg loaded before export
- Check console for processing logs
- Test downloaded files play correctly
- Verify aspect ratios match platform specs

---

## File Dependencies

**Required Files:**
- None - index.js is self-contained

**API Routes:**
- `/api/analyze-narrative` - Claude API for Smart Gen

**External Libraries:**
- `@ffmpeg/ffmpeg` - Video processing
- `lucide-react` - Icons
- `tailwindcss` - Styling

**No localStorage** - Violates Claude.ai artifact restrictions
