# Test Smart Gen Results

## Purpose
Validate that Smart Gen produces high-quality clips with accurate timestamps and proper timeline distribution.

## What to Check

### 1. Timestamp Accuracy
**Problem:** Clips often all start at 0:00 instead of spanning the timeline.

**Validation:**
```javascript
// Check console logs after Smart Gen runs
// Look for: "Creating anchor: start=X, end=Y"
// Verify that start times are NOT all 0 or clustered near 0

// Expected: Clips should reference actual frame times from manifest
// Example: If frame 42 is at 1590s, a clip using that frame should start ~1590s
```

**Red Flags:**
- All clips have `start: 0` or `start < 30`
- 85-minute video with all clips in first 2 minutes
- Console shows "Frame 42: 26:30" but clip starts at 0:00

### 2. Timeline Distribution
**Problem:** Clips cluster at beginning instead of spanning opening → finale.

**Validation:**
- Check timeline visually after Smart Gen
- Clips should be spread across zones:
  - Opening (0-10%): 1-2 clips
  - Early-middle (20-35%): 2-3 clips
  - Middle (45-60%): 2-3 clips
  - Late-middle (70-85%): 2-3 clips
  - Finale (90-100%): 1-2 clips

**Red Flags:**
- All anchors in first 20% of timeline
- No clips from finale zone (missing payoff/result)
- Gaps larger than 30% of video with no clips

### 3. Frame Manifest Usage
**Problem:** Claude receives frame manifest but doesn't use timestamps correctly.

**Validation:**
```javascript
// In analyzeNarrativeComprehensive response
// Each suggestedCut should have:
{
  "frameReference": 42,  // Which frame from manifest
  "startTime": 1590,     // MUST match frame.time from manifest
  "endTime": 1597,
  "reason": "Finished dish reveal"
}

// Verify: frame.time === startTime (or very close, ±2s)
```

**Red Flags:**
- `frameReference` exists but `startTime` doesn't match frame time
- No `frameReference` field (not using manifest)
- Generic timestamps like 0, 30, 60 (not frame-based)

### 4. Clip Quality
**Expected:** 8-12 clips with varied lengths (3-10s)

**Validation:**
- Count clips created
- Check for length variety:
  - Opening/finale: shorter (3-5s)
  - Middle action: longer (6-9s)
  - Not all the same length (boring rhythm)

**Red Flags:**
- Less than 8 clips (missing key moments)
- More than 12 clips (too fragmented)
- All clips 3-4s (no variety)
- Any clip longer than 10s (too slow for social)

## Test Videos

**Cooking Show (28min):**
- Should find: raw ingredients → technique → finished dish
- Finale MUST include plated food (Claude often misses this)

**Livestream (85min):**
- Should find: highlights across full duration
- Not just first 10 minutes

**Short Tutorial (5min):**
- Dense sampling, every key step
- Total clip duration near target (30-40s)

## How to Run Test

1. Upload test video
2. Click "Smart Gen" → Select mode (Quick/Smart/Pro)
3. Open browser console (F12)
4. Watch for:
   - "Frame extraction complete" → Check frame times
   - "Narrative analysis complete" → Check suggestedCuts
   - "Creating anchor" → Verify start/end times
5. Inspect timeline visually
6. Play clips in Preview Mode

## Success Criteria

✅ **PASS:**
- Clips spread across opening → middle → finale
- Start times match frame manifest (±2s)
- 8-12 clips with varied lengths
- Console shows diverse timestamps (not all near 0)

❌ **FAIL:**
- All clips at start of video
- Timestamps all 0 or clustered
- Missing finale moments
- Less than 8 clips or more than 12

## If Test Fails

1. Read CLAUDE.md "Smart Gen Analysis Prompt Structure"
2. Check `analyzeNarrativeComprehensive()` in pages/index.js
3. Verify frame manifest is passed to Claude correctly
4. Review Claude's response JSON for timestamp mapping
5. Use `/fix-timestamp-accuracy` command to debug

## Notes

- Always test with 3 video types (short, medium, long)
- Check console logs for actual values, don't trust UI alone
- Frame manifest format: "Frame 42: 26:30 (1590.0s) - finale zone"
- Smart Gen should create clips in 60-80 seconds total
