# Update CLAUDE.md

## Purpose
Keep CLAUDE.md (project brain) in sync with code changes. Update after significant features, bug fixes, or architecture changes.

## When to Run This Command

**Trigger Events:**
- Fixed a major bug (especially Smart Gen issues)
- Added/removed a feature
- Changed architecture or file structure
- Refactored core systems (timeline, export, preview)
- Made breaking changes
- Learned something important about the codebase

**Don't run for:**
- Minor UI tweaks
- Small bug fixes
- Dependency updates
- Comment/formatting changes

## What to Update

### 1. Changelog (Required)

**Add entry with date and changes:**
```markdown
## Changelog

**2025-01-XX:**
- [Brief description of what changed]
- [Impact: what this fixes/adds/improves]
- [Any breaking changes or migration notes]
```

**Examples:**
```markdown
**2025-01-08:**
- Fixed Smart Gen timestamp accuracy bug
- Added validation to ensure clips use frame manifest times
- Clips now properly distributed across opening → finale
```

### 2. Known Issues (If Fixed)

**Remove issues that are now resolved:**
```markdown
**Known Issues (CRITICAL - FIX PRIORITY):**
- ❌ Timestamp accuracy ← REMOVE if fixed
- ❌ Missing finale moments ← REMOVE if fixed
- ✅ [Moved to fixed in changelog]
```

**Add new issues discovered:**
```markdown
- ❌ New issue description
- 🎯 NEED: What's needed to fix
```

### 3. Architecture Overview (If Changed)

**Update if systems changed:**
- New phase in Smart Gen workflow
- Changed export pipeline
- Modified anchor/timeline system
- Added new core feature

**Example:**
```markdown
### 2. Smart Gen (AI Auto-Generation)
**Current Implementation (Three-Phase):**  ← Update if phases changed

**Phase 1: Comprehensive Frame Gathering**
- [Updated frame count or sampling strategy]

**Phase 2: Validation**  ← New phase added
- [Description of new validation step]
```

### 4. File Structure (If Changed)

**Update if files added/removed/moved:**
```markdown
├── pages/
│   ├── index.js              # Main ReelForge component (~1450 lines) ← Update line count
│   ├── api/
│   │   ├── analyze-narrative.js
│   │   └── validate-clips.js  ← New file
```

### 5. Coding Guidelines (If New Patterns)

**Add guidelines for new patterns:**
```markdown
**Critical Rules:**
- Frame timestamps MUST match manifest (startTime = frame.time)
- Always validate Smart Gen output before creating anchors ← New rule
- Use TypeScript for API responses ← New rule
```

### 6. Development Commands (If New Scripts)

**Add new npm scripts or test procedures:**
```markdown
## Development Commands
```bash
npm run dev          # Local dev server
npm run test:smartgen # Test Smart Gen accuracy ← New command
```

## How to Run This Command

### Step 1: Analyze Recent Changes

**Check git history:**
```bash
git log --oneline -10
git diff HEAD~5..HEAD --stat
```

**Identify what changed:**
- Which files were modified?
- What was the purpose (bug fix, feature, refactor)?
- Any breaking changes?

### Step 2: Review Current CLAUDE.md

```bash
# Read current state
cat CLAUDE.md

# Check what sections exist
grep "^## " CLAUDE.md
grep "^### " CLAUDE.md
```

### Step 3: Make Updates

**Required:**
- Add changelog entry with date
- Remove resolved issues from "Known Issues"
- Update line counts if significantly changed

**If Applicable:**
- Update architecture descriptions
- Add new coding guidelines
- Update file structure diagram
- Add testing notes

### Step 4: Validate

**Check:**
- Changelog is reverse chronological (newest on top)
- No duplicate entries
- Grammar and formatting consistent
- Code examples are valid
- Links/references are correct

## Template for Changelog Entry

```markdown
**YYYY-MM-DD:**
- [What]: Brief description of the change
- [Why]: What problem this solves or feature this adds
- [Impact]: What users/developers should know
- [Breaking]: Any breaking changes (if applicable)
```

## Examples

### Bug Fix Entry
```markdown
**2025-01-08:**
- Fixed Smart Gen timestamp bug causing all clips at 0:00
- Added validation: startTime must match frame.time from manifest
- Clips now properly distributed across full video timeline
- Breaking: Old Smart Gen responses without frameReference will fail validation
```

### Feature Addition Entry
```markdown
**2025-01-09:**
- Added visual verification for Smart Gen via Playwright
- Claude screenshots timeline after generation
- Validates anchor distribution (opening → middle → finale)
- Iterates if clips clustered at start (max 2 retries)
```

### Architecture Change Entry
```markdown
**2025-01-10:**
- Refactored Smart Gen to three-phase workflow
- Phase 1: Gather frames (unchanged)
- Phase 2: Validate output (NEW - checks timestamp accuracy)
- Phase 3: Create anchors (only if validation passes)
- Added validateTimestamps() helper function
```

## Related Files

- `CLAUDE.md` - The file being updated
- `.claude/commands/` - Other command files
- `pages/index.js` - Main source code
- `package.json` - For version/dependency updates

## After Updating

1. Review changes: `git diff CLAUDE.md`
2. Commit with clear message:
   ```bash
   git add CLAUDE.md
   git commit -m "Update CLAUDE.md: [brief description of update]"
   ```
3. Push if working on shared repo

## Notes

- CLAUDE.md is the "single source of truth" for project knowledge
- Keep it concise but complete
- Future Claude sessions will read this first
- Good documentation prevents repeated questions/mistakes
- Update within 24 hours of major changes while fresh in memory
