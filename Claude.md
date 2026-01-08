# ReelForge - AI-Powered Video Editor

**Mission:** Eliminate time-consuming video editing. Transform 30-min raw footage → polished 40s social clips in 2 minutes.

**Target Users:** Content creators (barbershops, cooking, digital art) who need efficient multi-platform exports.

---

## Architecture Overview

**Tech Stack:**
- Next.js 13 (Pages router) - React 18
- Tailwind CSS - Styling
- FFmpeg.wasm - Client-side video processing (no server uploads)
- Vercel - Deployment & hosting
- Claude Sonnet 4.5 API - Smart Gen narrative analysis

**Core Systems:**

### 1. Drop & Crop Workflow
- Users upload video → place precision "anchors" (start/end markers)
- Anchors mark key moments to include in final clip
- System fills target duration with selected anchor segments
- Drag handles for frame-accurate adjustments

### 2. Smart Gen (AI Auto-Generation)
**Current Implementation (Two-Phase):**

**Phase 1: Comprehensive Frame Gathering**
- Extract 50 frames across 5 strategic zones:
  - Opening (0-10%): Setup, intro, context
  - Early-middle (20-35%): Technique begins
  - Middle (45-60%): Core content
  - Late-middle (70-85%): Advanced work
  - Finale (90-100%): Results, payoff, reactions
- Adaptive sampling: Short videos = dense, long videos = strategic
- ~60 seconds to gather

**Phase 2: Single Comprehensive Analysis**
- Claude receives ALL 50 frames + frame manifest (exact timestamps)
- Analyzes: video type, key moments, narrative arc
- Creates 8-12 clips with varied lengths (3-10s each)
- Returns: storyType, narrative, suggestedCuts[], confidence, missingMoments[]
- ~20 seconds to analyze

**Known Issues (CRITICAL - FIX PRIORITY):**
- ❌ Timestamp accuracy: Clips often all at 0:00 instead of spanning timeline
- ❌ Missing finale moments: Claude sees frames but doesn't recognize cooked food vs raw
- ❌ Frame manifest not being used correctly
- 🎯 NEED: Visual verification - Claude must SEE the rendered timeline to validate

### 3. Preview Mode
- Plays anchors sequentially with music sync
- Scrubber shows combined timeline
- Beat-sync optional (aligns cuts to music beats)

### 4. Export System
- Multi-platform: TikTok/Reels (9:16), Instagram Feed (4:5), Twitter (16:9), Original
- FFmpeg.wasm processes: concatenate clips → add music → crop/pad for aspect ratio
- Vercel-friendly (client-side, no server processing)

---

## File Structure
```
clipboost/
├── pages/
│   ├── index.js              # Main ReelForge component (~1450 lines)
│   │                         # Contains: video player, timeline, anchors, 
│   │                         # preview mode, Smart Gen logic
│   └── api/
│       └── analyze-narrative.js  # Claude API integration
│
├── styles/
│   └── globals.css           # Tailwind base
├── public/                   # Static assets
├── .claude/                  # Claude Code memory & commands
│   ├── commands/             # Reusable workflows
│   └── agents/               # Subagents (future: smart-gen-validator)
├── CLAUDE.md                 # This file (project brain)
└── package.json
```

**Key Functions in pages/index.js:**
- `gatherComprehensiveFrames()` - Extract 50 frames across zones
- `analyzeNarrativeComprehensive()` - Claude API call with frames
- `extractFramesFromRange()` - FFmpeg frame extraction helper
- `exportVideo()` - Multi-platform export pipeline

---

## Development Commands
```bash
npm run dev          # Local dev server (localhost:3000)
npm run build        # Production build
vercel --prod        # Deploy to production
vercel               # Deploy preview
```

**Testing Smart Gen:**
1. Upload test video (cooking show, livestream, tutorial)
2. Click "Smart Gen" button
3. Watch console for frame extraction + analysis logs
4. Check timeline for anchor distribution
5. Preview mode to verify clip sequence

---

## Coding Guidelines

**React:**
- Functional components + hooks only (no classes)
- State: `useState`, `useRef`, `useEffect`
- Memoization: `useCallback`, `useMemo` for performance

**Styling:**
- Tailwind utility classes ONLY
- No custom CSS unless absolutely necessary
- Dark mode first (slate-900 bg, purple/pink accents)
- Mobile-responsive (touch events, edit mode)

**Video Processing:**
- FFmpeg.wasm for all client-side ops
- Canvas API for frame extraction
- Web Audio API for music analysis (beat detection)
- NO localStorage for artifacts (Claude.ai restriction)

**Performance:**
- RequestAnimationFrame for smooth UI
- Debounce state updates (300ms for auto-save)
- Lazy load video segments
- Minimize re-renders (memoization critical)

**Critical Rules:**
- Frame timestamps MUST match manifest (startTime = frame.time)
- Clips should span timeline, not cluster at 0:00
- 8-12 clips per analysis (varied 3-10s lengths)
- No backwards compatibility (causes silent failures)
- Test on mobile (edit mode, touch drag)

---

## Smart Gen Analysis Prompt Structure

**Required Response Format (JSON only, no markdown):**
```json
{
  "storyType": "tutorial|transformation|vlog|product_demo",
  "narrative": "brief story description",
  "keyMomentsFound": ["list of moments seen in frames"],
  "suggestedCuts": [
    {
      "frameReference": 42,
      "startTime": 1612,  // MUST match frame manifest
      "endTime": 1620,
      "reason": "what moment shows",
      "clipLengthReasoning": "why this duration optimal",
      "narrativeRole": "hook|build|climax|payoff",
      "importance": 0.8
    }
  ],
  "confidence": 0.85,
  "missingMoments": ["moments wanted but not found"]
}
```

**Frame Manifest Format:**
```
Frame 1: 0:00 (0.0s) - opening zone
Frame 10: 2:30 (150.0s) - early zone
Frame 42: 26:30 (1590.0s) - finale zone
```

**Analysis Guidelines:**
- Use EXACT timestamps from frame manifest
- Validate: Are clips spread across timeline or all at 0:00?
- Quality over geography (skip boring intros if needed)
- Vary clip lengths (3s → 7s → 4s → 9s creates rhythm)
- Social media = fast cuts, not long narratives

---

## Current Development Focus

**Top Priority: Fix Smart Gen Accuracy**

**Issue 1: Timestamp Mapping**
- Clips getting startTime: 0 regardless of frame position
- Frame manifest exists but not being used correctly
- Need: Validation that clips reference actual frame times

**Issue 2: Visual Recognition**
- Claude sees finale frames but doesn't identify "cooked dish"
- Needs: Context hints ("finale frames = finished product")
- OR: Visual verification via screenshots

**Issue 3: Distribution**
- Some videos: all clips in first 30 seconds of 85-min video
- Need: Validation that clips span opening → middle → finale

**Next Steps:**
1. Add Playwright visual verification
2. Claude screenshots timeline after Smart Gen
3. Validates anchor distribution visually
4. Iterates if all clustered at start

---

## Changelog

**2025-01-08:**
- Implemented two-phase Smart Gen (gather → analyze)
- Added frame manifest with explicit timestamps
- Removed agentic loop (too complex, unpredictable)
- Added validation logging for timestamp accuracy

**2025-01-07:**
- Simplified from agentic seeking to single-pass analysis
- 50 frames across 5 zones for comprehensive coverage

**2025-01-06:**
- Initial Smart Gen with adaptive frame sampling
- Motion detection + beat-sync integration

---

## Notes for Claude

**When working on Smart Gen:**
1. ALWAYS read this file first: "Prepare to discuss Smart Gen architecture"
2. Build 50k token context before making changes
3. Check console logs for actual clip timestamps
4. If touching analyzeNarrativeComprehensive: preserve frame manifest usage
5. Test with 3 video types: cooking (28min), livestream (85min), short (5min)

**When adding features:**
- Check if impacts mobile (test touch events)
- Verify FFmpeg.wasm compatibility
- Update this CLAUDE.md changelog

**Red Flags to Avoid:**
- Using localStorage in artifacts
- Backwards compatibility (creates silent failures)
- Generic "shadcn purple UI" (ReelForge = dark mode, medieval forge aesthetic)
- Long clips (>10s) for social media
- Ignoring frame manifest timestamps
