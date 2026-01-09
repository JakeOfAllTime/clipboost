# Fix Smart Gen Timestamp Accuracy

## Purpose
Debug and fix the timestamp mapping bug where clips all start at 0:00 instead of using frame manifest times.

## Problem Statement

**Symptoms:**
- Smart Gen creates all clips at start of video (0:00-2:00)
- 85-minute video → all clips in first 2 minutes
- Frame manifest shows "Frame 42: 26:30 (1590.0s)" but clip starts at 0:00
- Console logs don't show correlation between frameReference and startTime

**Root Cause:**
Claude receives frame manifest but response JSON doesn't use the timestamps correctly.

## Investigation Steps

### 1. Verify Frame Manifest Format

**Check:** `gatherComprehensiveFrames()` in pages/index.js

**Expected Output:**
```
Frame 1: 0:00 (0.0s) - opening zone
Frame 10: 2:30 (150.0s) - early zone
Frame 25: 14:45 (885.0s) - middle zone
Frame 42: 26:30 (1590.0s) - finale zone
```

**Validation:**
- Each frame has explicit time in seconds
- Times are NOT all 0 or clustered
- Manifest includes all 50 frames

### 2. Review Claude API Call

**Check:** `analyzeNarrativeComprehensive()` in pages/index.js

**Key Points:**
```javascript
const manifestText = frames
  .map((f, i) => `Frame ${i + 1}: ${formatTime(f.time)} (${f.time.toFixed(1)}s) - ${f.zone} zone`)
  .join('\n');

// Ensure this manifest is included in the API call
// Ensure prompt explicitly says: "Use EXACT timestamps from frame manifest"
```

**Red Flags:**
- Manifest not included in prompt
- Prompt doesn't emphasize timestamp usage
- No validation that Claude must reference frames

### 3. Inspect Claude Response

**Check:** Console logs after Smart Gen

**Expected JSON:**
```json
{
  "suggestedCuts": [
    {
      "frameReference": 42,
      "startTime": 1590,  // MUST match "Frame 42: ... (1590.0s)"
      "endTime": 1597,
      "reason": "Finished dish reveal"
    }
  ]
}
```

**Validation:**
```javascript
// After Claude responds, verify:
response.suggestedCuts.forEach(cut => {
  const frame = frames[cut.frameReference - 1]; // frameReference is 1-indexed
  const frametime = frame.time;
  const diff = Math.abs(cut.startTime - frametime);

  if (diff > 5) {
    console.warn(`❌ Timestamp mismatch! Frame ${cut.frameReference}: ${frametime}s but clip starts at ${cut.startTime}s`);
  }
});
```

### 4. Fix Prompt Engineering

**Current Prompt Issues:**
- May not emphasize frame manifest usage enough
- May not explicitly require `frameReference` field
- May not validate that startTime === frame.time

**Improved Prompt Structure:**
```
CRITICAL: You MUST use exact timestamps from the frame manifest below.

Frame Manifest:
${manifestText}

For each clip:
1. Choose a frame that shows the key moment
2. Set frameReference to that frame number
3. Set startTime to EXACTLY match that frame's time from manifest
4. Do NOT invent times - ONLY use times from the manifest

Example:
If you want to use Frame 42 (shown as "Frame 42: 26:30 (1590.0s)"):
{
  "frameReference": 42,
  "startTime": 1590,  // EXACT match to frame time
  "endTime": 1597     // startTime + clip length
}
```

### 5. Add Validation

**In pages/index.js after Claude responds:**

```javascript
// Validate timestamp mapping
const validateTimestamps = (cuts, frames) => {
  const errors = [];

  cuts.forEach(cut => {
    if (!cut.frameReference) {
      errors.push(`Clip missing frameReference: ${JSON.stringify(cut)}`);
      return;
    }

    const frame = frames[cut.frameReference - 1];
    if (!frame) {
      errors.push(`Invalid frameReference ${cut.frameReference} (only ${frames.length} frames)`);
      return;
    }

    const diff = Math.abs(cut.startTime - frame.time);
    if (diff > 5) {
      errors.push(`Frame ${cut.frameReference} time mismatch: manifest=${frame.time}s, clip=${cut.startTime}s (diff: ${diff}s)`);
    }
  });

  if (errors.length > 0) {
    console.error('❌ Timestamp validation failed:', errors);
    alert(`Smart Gen created clips with incorrect timestamps. Check console for details.`);
    return false;
  }

  console.log('✅ All timestamps validated successfully');
  return true;
};

// Use it:
if (!validateTimestamps(analysis.suggestedCuts, allFrames)) {
  // Don't create anchors if validation fails
  return;
}
```

## Testing the Fix

1. Make changes to prompt or validation
2. Upload 28-minute cooking video
3. Run Smart Gen (Smart or Pro mode)
4. Check console for validation messages
5. Verify timeline shows clips across full duration
6. If still failing:
   - Log entire Claude response
   - Check if frameReference field exists
   - Check if startTime values are diverse (not all 0)

## Success Criteria

✅ **Fixed:**
- Console shows "✅ All timestamps validated"
- Timeline has clips in opening, middle, AND finale
- 85-min video has clips after minute 30
- No warnings about timestamp mismatches

❌ **Still Broken:**
- Validation errors in console
- All clips clustered at start
- frameReference exists but times don't match

## Related Files

- `pages/index.js` lines ~2700-2900: `gatherComprehensiveFrames()`
- `pages/index.js` lines ~3100-3300: `analyzeNarrativeComprehensive()`
- `pages/api/analyze-narrative.js`: Claude API integration
- `CLAUDE.md` lines 143-180: Smart Gen prompt structure

## Next Steps After Fix

1. Test with all 3 video types (5min, 28min, 85min)
2. Update CLAUDE.md changelog
3. Run `/test-smart-gen` to verify quality
4. Consider adding visual verification (Playwright)
