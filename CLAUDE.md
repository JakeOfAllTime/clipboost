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

## Orchestration Framework: Context + Tools + Validators

**Philosophy:** You (Claude) are not just a code generator. You are an intelligent agent operating within a carefully designed environment. Your success depends on three pillars:

```
┌─────────────────────────────────────────┐
│   CONTEXT: What you need to know        │
│   - Business objectives, constraints    │
│   - Architecture, tech stack, patterns  │
│   - User workflows, design principles   │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│   TOOLS: What you can use               │
│   - MCPs (Playwright, GitHub, etc.)     │
│   - Bash commands (git, npm, grep)      │
│   - File operations (Read, Edit, Glob)  │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│   VALIDATORS: How you know success      │
│   - Screenshots, console logs, tests    │
│   - Sub-agents, acceptance criteria     │
│   - User feedback, quality gates        │
└─────────────────────────────────────────┘
```

### The LLM Empathy Test (Patrick Ellis)

**Before starting ANY task, close your eyes (metaphorically) and ask:**

> "If I were an AI with ONLY what I've been given, could I complete this task competently?"

**What you DON'T have by default:**
- ❌ The current UI state (what's on screen)
- ❌ Recent user interactions (what buttons they clicked)
- ❌ Business context (why this feature matters)
- ❌ Style preferences (what "good design" means here)
- ❌ Architecture constraints (what libraries we can use)
- ❌ Success criteria (what "done" looks like)

**What you NEED to ask for:**
- ✅ Screenshots (use Playwright MCP when available)
- ✅ Console logs (what errors are happening?)
- ✅ Specific examples ("show me a good vs bad output")
- ✅ Acceptance criteria ("what does success look like?")
- ✅ Related code context (read files, grep patterns)

### Context Layer: What You Need to Know

**Business Objectives:**
- **Mission:** Transform 30-min raw footage → polished 40s social clips in 2 minutes
- **Target Users:** Content creators (barbershops, cooking, digital art)
- **Key Metric:** Time to export - must be <2 minutes total (not including upload)
- **Competitive Edge:** Client-side processing (privacy + speed), frame-accurate precision

**Critical Constraints:**
- ✅ Client-side ONLY (FFmpeg.wasm, no server uploads)
- ✅ Vercel-friendly (static export, edge functions for API routes)
- ✅ Mobile-responsive (50% of users edit on mobile)
- ✅ Frame-accurate (1/30s precision for anchors)
- ✅ No localStorage for artifacts (Claude.ai artifact restriction)

**Tech Stack (What You Can Use):**
```javascript
// Frontend
Next.js 13 (Pages router) - NOT App router
React 18 - Functional components + hooks only
Tailwind CSS - Utility classes ONLY (no custom CSS unless critical)

// Video Processing
FFmpeg.wasm - All video ops (client-side, no server)
Canvas API - Frame extraction, thumbnail generation
Web Audio API - Music analysis, beat detection (optional)

// AI Integration
Claude Sonnet 4.5 API - Smart Gen narrative analysis
Anthropic SDK - For API calls in pages/api/analyze-narrative.js

// Deployment
Vercel - Hosting, edge functions, preview deployments
```

**Architecture Patterns (What You Should Follow):**
- **State management:** `useState`, `useRef`, `useEffect` (no Redux/Zustand)
- **Memoization:** `useCallback`, `useMemo` for expensive operations
- **Animations:** `transform` and `opacity` ONLY (GPU-accelerated, 60fps)
- **File structure:** Single-file components in pages/index.js (~7000 lines)
- **Styling:** Tailwind utilities → CSS variables → inline styles (in that order)

**Design System (Pocket Picks Aesthetic):**
- **Colors:** Deep navy bg (#0a0e27), cyan primary (#00d4ff), pink accent (#ff00ff)
- **Glassmorphism:** `backdrop-filter: blur(10px)` + semi-transparent bg
- **Neon glow:** `box-shadow: 0 0 20px rgba(0,212,255,0.6)` on hover
- **Animations:** 0.25s ease transitions, GPU-accelerated only
- **Typography:** Bold uppercase headers, clear hierarchy, 14px min body text

### Tools Layer: What You Can Use

**File Operations (Preferred):**
```bash
# Search for files by pattern
Glob pattern="**/*.js"

# Search code content
Grep pattern="analyzeNarrative" output_mode="content" -C=5

# Read any file (supports images, PDFs)
Read file_path="pages/index.js" offset=2560 limit=80

# Edit existing files (exact string replacement)
Edit file_path="pages/index.js" old_string="..." new_string="..."

# Create new files (prefer Edit for existing)
Write file_path="pages/new-component.js" content="..."
```

**Bash Commands (For System Ops):**
```bash
# Git operations
git status
git add pages/index.js
git commit -m "Fix Play Clips stuttering"
git push origin main

# NPM operations
npm run dev          # Start dev server
npm run build        # Production build
npm install [package] # Add dependency

# Testing
npm test             # Run tests (when we add them)
```

**MCPs (Model Context Protocol - When Available):**
```
Playwright MCP:
- Screenshot pages: playwright_screenshot url="http://localhost:3000"
- Navigate & interact: playwright_navigate, playwright_click
- Read console logs: playwright_console_logs
- Emulate devices: playwright_emulate device="iPhone 15"

GitHub MCP (Future):
- Read issues: github_get_issue number=123
- Create PRs: github_create_pr title="Fix Smart Gen"
- Comment on PRs: github_comment pr=456 body="LGTM"
```

**Sub-Agents (Delegate to Specialists):**
```bash
# Design validation
Task subagent_type="design-reviewer" prompt="Review Export button for accessibility and design standards"

# Smart Gen validation
Task subagent_type="smart-gen-validator" prompt="Test Smart Gen with cooking video, verify timestamp distribution"

# UX friction audit
Task subagent_type="ux-friction-auditor" prompt="Identify friction points in clip creation workflow"
```

### Validators Layer: How You Know Success

**Functional Validation (Does It Work?):**
- ✅ Play Clips: Transitions smoothly between anchors (no stuttering/hanging)
- ✅ Smart Gen: Clips distributed across timeline (not all at 0:00)
- ✅ Export: Video plays correctly in target aspect ratio
- ✅ Precision Edit: Frame-accurate adjustments (1/30s precision)
- ✅ Mobile: Touch events work (double-tap, drag, resize)

**Visual Validation (Does It Look Right?):**
- ✅ Colors match palette (DevTools → Computed → verify hex values)
- ✅ Animations smooth (60fps, no jank - use Performance tab)
- ✅ Glassmorphism visible (backdrop-filter blur on panels)
- ✅ Glow effects present (box-shadow on interactive elements)
- ✅ Typography consistent (weights, spacing, casing)

**Performance Validation (Is It Fast?):**
- ✅ Lighthouse score >90 (performance, accessibility, best practices)
- ✅ No layout thrashing (animations use transform/opacity only)
- ✅ Minimal re-renders (check React DevTools Profiler)
- ✅ Bundle size <500kb gzipped (check Vercel build output)

**Accessibility Validation (Is It Usable?):**
- ✅ ARIA labels on all interactive elements
- ✅ Keyboard navigation works (Tab, Enter, Escape)
- ✅ Focus indicators visible (outline or glow)
- ✅ Color contrast ≥4.5:1 (use WebAIM contrast checker)
- ✅ Touch targets ≥44px on mobile

**Console Validation (What's Happening?):**
```javascript
// Smart Gen validation (check after generation)
console.log('✅ Phase 1 complete: 100 total frames gathered')
console.log('🧠 PHASE 2: Analyzing 100 frames with complete context...')
console.log('✂️ Selected Clips:', clipSelection.selectedClips.length)
console.log('📍 Zone Distribution:', selectedZoneDistribution)

// Timeline validation (check clip positions)
anchors.forEach((a, i) => {
  console.log(`Clip ${i+1}: ${formatTime(a.start)} - ${formatTime(a.end)}`)
})
// ✅ GOOD: Clips span 0:00, 5:30, 12:45, 25:30 (distributed)
// ❌ BAD: All clips at 0:00, 0:02, 0:05 (clustered)
```

**Sub-Agent Validation (Quality Gates):**
- ✅ Design reviewer PASS (colors, typography, accessibility)
- ✅ Smart Gen validator PASS (timestamp distribution, zone coverage)
- ✅ UX friction auditor PASS (friction score <5/10)

### Iterative Agentic Loop (How to Work)

**Standard Pattern for ANY Task:**
```
1. READ CONTEXT
   ↓ Read CLAUDE.md, pages/CLAUDE.md
   ↓ Grep for relevant code patterns
   ↓ Understand existing architecture

2. PLAN APPROACH
   ↓ Break into sub-tasks (use TodoWrite)
   ↓ Identify validation criteria
   ↓ Choose tools needed (Playwright? Sub-agent?)

3. IMPLEMENT
   ↓ Write code following patterns
   ↓ Use existing utilities (don't reinvent)
   ↓ Add console logs for debugging

4. VALIDATE
   ↓ Test functionality (does it work?)
   ↓ Check console (any errors?)
   ↓ Screenshot UI (does it look right?)
   ↓ Run sub-agent if available

5. ITERATE
   ↓ If validation fails → fix and re-validate
   ↓ Max 2-3 iterations
   ↓ If stuck → ask user for guidance

6. DOCUMENT
   ↓ Update changelog in CLAUDE.md
   ↓ Commit with clear message
   ↓ Mark todos complete
```

**Example: Fixing Play Clips Stuttering**
```
1. READ CONTEXT
   ✓ Read pages/index.js lines 2560-2630 (RAF loop)
   ✓ Grep "previewAnchorIndex" to find related state
   ✓ Understand: RAF updates time, transitions between clips

2. PLAN APPROACH
   ✓ Todo 1: Identify race condition in seek events
   ✓ Todo 2: Add isTransitioning flag to pause RAF
   ✓ Todo 3: Test with 3-clip sequence
   ✓ Validation: Play Clips should transition smoothly (no frame-by-frame)

3. IMPLEMENT
   ✓ Add isTransitioning flag in RAF closure
   ✓ Pause updates during seek, resume after 50ms
   ✓ Add console log: "Transitioning to clip X"

4. VALIDATE
   ✓ Test: Upload video → create 3 clips → Play Clips
   ✓ Check console: "Transitioning to clip 2", "Transitioning to clip 3"
   ✓ Visual: Smooth playback, no stuttering ✅

5. ITERATE
   ✓ First attempt worked! No iteration needed.

6. DOCUMENT
   ✓ Commit: "Fix Play Clips stuttering with simpler transition logic"
   ✓ Update changelog: "Fixed RAF race condition"
   ✓ Mark todo complete
```

### Reducing Friction (Patrick Ellis Principle)

**Friction = Any manual step that slows down iteration**

**High Friction (Avoid):**
- ❌ Asking user to copy/paste console output
- ❌ Requiring user to describe UI state
- ❌ Manual testing of every change
- ❌ Writing code → commit → push → wait for user feedback loop

**Low Friction (Embrace):**
- ✅ Use Playwright to screenshot UI automatically
- ✅ Read console logs programmatically (when MCP available)
- ✅ Use sub-agents for validation (async, no user needed)
- ✅ Create validation scripts that run automatically

**Voice-to-Code (Future):**
- Use Super Whisper or similar for dictation
- Hotkey → speak → auto-formatted for context
- Useful for: Quick bug reports, PRD dictation, commit messages

### Always-Visible UI Philosophy

**From ReelForge's Clips Preview Implementation:**

> "If it pops up suddenly after the first action, it should have been
> visible all along with an empty state." - Patrick Ellis

**Why:**
- ✅ Reduces surprise (UI structure predictable from start)
- ✅ Teaches workflow (shows WHERE things will appear)
- ✅ No layout shift (smooth, professional feel)
- ✅ Guides next action ("Create clips below to see them here")

**Examples in ReelForge:**
- ✅ Clips Preview bar: Always visible, shows "Create clips below" when empty
- ✅ Timeline: Always visible, double-click hint when no clips
- 🔄 Smart Gen progress: Should show "Ready to analyze" even before starting
- 🔄 Export options: Should show greyed-out until clips exist

### Cross-Model Review (Advanced)

**From Patrick Ellis Codex vs Claude Code Comparison:**

> "Have Codex review Claude's work and vice versa. Different model
> personalities catch different issues." - Patrick Ellis

**Model Personalities:**
- **Sonnet 4.5** = "Entrepreneur" (tactical, iterative, learns by doing)
- **Opus 4** = "Academic" (strategic, thoughtful, measures twice)
- **Codex** = "Architect" (systematic, depth-first reasoning)

**Workflow (Future):**
1. Implementation: Sonnet 4.5 (fast iteration)
2. Security review: Opus 4 (deep analysis)
3. Architecture review: Codex (systematic thinking)
4. Final validation: Sub-agent (acceptance criteria)

---

## Design Principles & Visual Language

**Aesthetic:** Pocket Picks-inspired futuristic dark theme with neon accents, particle effects, and glassmorphism.

### Color Palette (CSS Variables)
```css
/* Deep Space Backgrounds */
--bg-primary: #0a0e27      /* Main background - deep navy */
--bg-secondary: #141832    /* Panel backgrounds */
--bg-tertiary: #1e2442     /* Elevated elements */

/* Vibrant Neon Accents */
--accent-cyan: #00d4ff     /* Primary interactive elements */
--accent-pink: #ff00ff     /* Secondary accents, active states */
--accent-magenta: #e91e8c  /* Gradient endpoints */
--accent-purple: #9333ea   /* Mid-tones, variety */
--accent-blue: #4facfe     /* Complementary blues */

/* Gradients (for buttons, backgrounds) */
--gradient-primary: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)  /* Cyan */
--gradient-accent: linear-gradient(135deg, #e91e8c 0%, #ff00ff 100%)   /* Pink/Magenta */
--gradient-hero: linear-gradient(135deg, #1e3a8a 0%, #3b0764 50%, #831843 100%)  /* Background */
```

### Typography Standards
- **Headers:** Bold (800 weight), uppercase, 0.5-1px letter-spacing
  - Main titles: 3xl-4xl (48-60px)
  - Section headers: xl-2xl (24-32px)
- **Body:** Regular weight, sentence case, clear hierarchy
  - Primary text: #ffffff (--text-primary)
  - Secondary: #cbd5e1 (--text-secondary)
  - Tertiary: #94a3b8 (--text-tertiary)
- **Buttons:** Semibold-Bold (600-700), uppercase for primary actions

### Component Patterns

**Panels (Cards):**
- Glassmorphism: `background: rgba(20, 24, 50, 0.7)` + `backdrop-filter: blur(10px)`
- Border: `1px solid var(--border-subtle)` (subtle blue glow)
- Border-radius: `16px` (rounded, modern)
- Shadow: `0 8px 32px rgba(0, 0, 0, 0.4)` (depth)

**Buttons:**
- **Primary (Cyan):** Gradient cyan → light cyan, glow on hover, scale(1.02)
- **Accent (Pink/Magenta):** Gradient magenta → pink, strong glow, scale(1.02)
- **Secondary:** Solid bg-tertiary, subtle border, no gradient
- **Hover states:**
  - `transform: translateY(-2px)` or `scale(1.02-1.05)`
  - Glow effect: `box-shadow: 0 0 20px rgba(color, 0.4-0.6)`
- **Active states:** Reset transform, reduce shadow
- **Disabled:** Opacity 0.4, no interaction

**Timeline Anchors:**
- 5 vibrant colors: cyan, pink, purple, blue, fuchsia
- Semi-transparent backgrounds (30% opacity, 50% when selected)
- Glow borders matching anchor color
- Hover: `scale(1.02)`, subtle glow increase
- Selected: Stronger glow, higher opacity, pink accent border

**Animations:**
- Transitions: `0.25-0.3s ease` for most interactions
- Hero gradient: 15s infinite shift animation
- Particle effects: 20s float animation (translateY + scale)
- Sparkle icons: `animate-pulse` for Smart Gen button
- Loading states: Alternating cyan/pink glow (2s pulse)

### Elite Frontend Standards (Inspired by Industry Leaders)

**Sara Soueidan (Accessibility & SVG):**
- All interactive elements MUST have ARIA labels
- Focus states visible (outline or glow)
- Keyboard navigation fully supported
- SVG animations smooth (60fps), accessible fallbacks

**Rachel Andrew / Jen Simmons (Responsive Layout):**
- CSS Grid for complex layouts (timeline, export options)
- Container queries where appropriate (not just media queries)
- Intrinsic sizing: `min()`, `max()`, `clamp()` for fluid typography
- Mobile-first approach: touch targets ≥44px, test on mobile viewport

**Addy Osmani (Performance):**
- Lighthouse score target: >90 (performance, accessibility, best practices)
- Lazy load heavy components (FFmpeg.wasm, video player)
- Minimize re-renders: `useCallback`, `useMemo` for expensive operations
- Animations: `transform` and `opacity` only (GPU-accelerated)
- 60fps interactions: No layout thrashing, requestAnimationFrame for smooth UI

**Chris Coyier / Lea Verou (Creative CSS):**
- Document complex patterns inline (gradient recipes, shadow combinations)
- Use CSS custom properties for themability
- Prefer CSS solutions over JS where possible (animations, layouts)
- Experimental features with fallbacks (backdrop-filter → solid bg)

### Verification Checklist (Before Completing Features)

**Visual Quality:**
- [ ] Colors match palette (use DevTools to verify hex values)
- [ ] Typography follows standards (weights, spacing, casing)
- [ ] Spacing consistent (Tailwind scale: 2, 4, 6, 8, 12, 16, 24)
- [ ] Animations smooth (no jank, 60fps confirmed)
- [ ] Glow effects applied to interactive elements
- [ ] Glassmorphism blur visible on panels

**Responsiveness:**
- [ ] Mobile viewport tested (375px, 768px, 1024px, 1920px)
- [ ] Touch targets ≥44px on mobile
- [ ] No horizontal scroll on narrow screens
- [ ] Readable text at all sizes (min 14px body, 12px labels)

**Accessibility:**
- [ ] ARIA labels on buttons, controls, regions
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus indicators visible (outline or glow)
- [ ] Color contrast ≥4.5:1 for text (use WebAIM contrast checker)
- [ ] Screen reader friendly (semantic HTML, proper headings)

**Performance:**
- [ ] Lighthouse performance >90
- [ ] No unnecessary re-renders (React DevTools profiler)
- [ ] Images/videos lazy loaded
- [ ] Animations use `transform`/`opacity` only
- [ ] Bundle size acceptable (<500kb gzipped for main chunk)

**Code Quality:**
- [ ] Complex CSS documented inline (gradient values, shadow combos)
- [ ] Tailwind utilities preferred over custom CSS
- [ ] No magic numbers (use CSS variables or Tailwind scale)
- [ ] Consistent patterns (button variants, panel styles)

### Reference Screenshots

**Current Implementation:**
- `reelforge-final.png` - Landing page with Pocket Picks aesthetic
- `reelforge-screenshot.png` - Full interface with video loaded
- Sidebar: Glowing cyan "EDIT" button, pink "EXPORT" when active
- Hero: Animated gradient (blue→purple→pink) at top
- Panels: Glassmorphism with subtle blue borders
- Buttons: Vibrant gradients with glow effects

**Design Inspiration:**
- Pocket Picks app (minefixds.app) - Reference for color palette, particle effects, neon glow
- Sara Soueidan's portfolio - SVG animations, accessibility patterns
- Jen Simmons' Layout Land demos - CSS Grid mastery
- Awwwards winners 2024-2026 - Modern interaction patterns

---

## File Structure
```
clipboost/
├── pages/
│   ├── index.js              # Main ReelForge component (~6500 lines)
│   │                         # Video player, timeline, anchors, preview, Smart Gen
│   ├── CLAUDE.md             # Detailed index.js context (functions, state, patterns)
│   └── api/
│       └── analyze-narrative.js  # Claude API integration
│
├── styles/
│   └── globals.css           # Tailwind base
├── public/                   # Static assets
├── .claude/                  # Claude Code memory & commands
│   ├── commands/             # Reusable slash commands
│   │   ├── test-smart-gen.md
│   │   ├── fix-timestamp-accuracy.md
│   │   └── update-claude-md.md
│   └── settings.local.json   # Git permissions, MCP config
├── CLAUDE.md                 # This file (project brain, injected into every session)
└── package.json
```

**IMPORTANT:** Before working on pages/index.js, read `pages/CLAUDE.md` for:
- Detailed function documentation (~50 key functions)
- State management patterns
- Component structure
- Testing procedures
- Recent changes and known issues

**Key Functions (see pages/CLAUDE.md for details):**
- `gatherComprehensiveFrames()` - Extract 50 frames across zones
- `analyzeNarrativeComprehensive()` - Claude API call with frames
- `buildPreviewTimeline()` - Sequential timeline from anchors
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
1. Install Playwright MCP for visual verification
2. Create sub-agent for Smart Gen validation
3. Implement iterative loop: generate → screenshot → validate → retry

---

## Playwright MCP Integration

**Purpose:** Give Claude "eyes" to see the UI and validate designs/layouts visually.

**Installation:**
```bash
npx @anthropic/claude-code mcp add @modelcontextprotocol/server-playwright
```

**Key Capabilities:**
- Screenshot pages automatically
- Read browser console logs
- Navigate and interact with UI
- Emulate different devices/viewports
- Visual regression testing

**Smart Gen Use Case:**
After Smart Gen completes:
1. Playwright opens `localhost:3000`
2. Screenshots the timeline
3. Claude analyzes: "Are clips distributed across timeline or clustered at start?"
4. If clustered → retry Smart Gen with stronger prompt emphasis
5. Max 2-3 iterations to get proper distribution

**Configuration Notes:**
- Default browser: Chromium (headless mode optional)
- Desktop viewport: 1920x1080 (or custom)
- Mobile testing: Can emulate iPhone 15, etc.
- Enable in `.claude/settings.local.json` MCP config

**Workflow Pattern (from Patrick Ellis):**
```
Context + Tools + Validation = Success

Context: CLAUDE.md, pages/CLAUDE.md, prompts
Tools: Playwright MCP, git, grep, etc.
Validation: Visual checks, console logs, acceptance criteria
```

---

## Sub-Agents for Specialized Workflows

ReelForge uses specialized sub-agents (inspired by Patrick Ellis's agentic workflows) for quality assurance and iterative refinement. These agents live in `.claude/agents/` and can be invoked for specific validation tasks.

### Available Sub-Agents

**1. Design Reviewer** (`.claude/agents/design-reviewer.md`)
- **Purpose:** Validate visual quality and design standards
- **Expertise:** Sara Soueidan (accessibility), Rachel Andrew (layout), Pocket Picks aesthetic
- **Tasks:**
  - Color palette verification (hex values, gradients)
  - Typography standards (weights, spacing, casing)
  - Component patterns (glassmorphism, button states, glow effects)
  - Accessibility audit (ARIA, keyboard nav, focus states, contrast)
  - Responsive design (mobile viewports, touch targets)
  - Performance checks (60fps animations, no layout thrashing)
- **Outputs:** Detailed report with screenshots, specific code fixes, prioritized action items

**How to invoke:**
```
Use the design-reviewer sub-agent to validate the homepage design. Check if colors, typography, and interactions match our Pocket Picks-inspired standards.
```

**2. Smart Gen Validator** (`.claude/agents/smart-gen-validator.md`)
- **Purpose:** Ensure Smart Gen clips distribute correctly across timeline (fix 0:00 clustering bug)
- **Expertise:** Timestamp accuracy, zone distribution, narrative quality
- **Tasks:**
  - Upload test video via Playwright
  - Trigger Smart Gen and capture console logs
  - Screenshot timeline to verify clip distribution
  - Programmatically check timestamps match frame manifest
  - Iterate fixes (prompt tuning, validation logic, zone forcing) max 2-3 times
- **Outputs:** PASS/FAIL report with screenshot evidence, console logs, root cause diagnosis, code fixes

**How to invoke:**
```
Use the smart-gen-validator sub-agent to test Smart Gen with Cooking_Mushrooms.mp4. Verify clips span opening → middle → finale zones, not all at 0:00.
```

### When to Use Sub-Agents

**Design Reviewer:**
- After implementing new UI features (buttons, panels, timeline)
- Before merging design changes (ensure standards met)
- When user reports visual inconsistencies
- For accessibility audits (before production deploy)

**Smart Gen Validator:**
- After modifying Smart Gen logic or API prompt
- When testing new video types (cooking, tutorial, livestream)
- To diagnose timestamp accuracy issues
- Before releasing Smart Gen updates

### Workflow: Iterative Validation Loop

**Standard Pattern (for any feature):**
1. **Build Context:** Read CLAUDE.md, pages/CLAUDE.md for patterns
2. **Implement Feature:** Write code following design principles
3. **Invoke Sub-Agent:** Validate quality (design-reviewer or smart-gen-validator)
4. **Review Report:** Check PASS/FAIL, read action items
5. **Apply Fixes:** Implement specific code changes from report
6. **Re-validate:** Invoke sub-agent again (max 2-3 iterations)
7. **Approve or Escalate:** If PASS → done. If still FAIL → ask user for guidance

**Example: Adding a New Button**
```
1. Read CLAUDE.md Design Principles → Button patterns (cyan gradient, glow on hover)
2. Implement button in index.js with Tailwind classes
3. Invoke design-reviewer: "Review the new Export button for color, hover state, and accessibility"
4. Receive report: "❌ Glow effect too weak, ⚠️ Missing ARIA label"
5. Fix: Increase glow to 0 0 25px, add aria-label="Export video"
6. Re-invoke design-reviewer: "Re-check Export button after fixes"
7. Receive report: "✅ PASS - All standards met"
```

### Benefits of This Approach

- **Consistency:** Sub-agents ensure every feature meets same quality bar
- **Efficiency:** Automated validation faster than manual review
- **Learning:** Reports teach patterns (what good design looks like)
- **Iteration:** Built-in retry logic (up to 3 attempts) without user intervention
- **Scalability:** Add more sub-agents as project grows (e.g., performance-auditor, a11y-tester)

---

## Changelog

**2025-01-14:**
- **MAJOR:** Added comprehensive Orchestration Framework section (Context + Tools + Validators)
- Integrated Patrick Ellis's methodologies from 3 video transcripts:
  - The LLM Empathy Test (close your eyes, imagine you're the AI)
  - Reducing friction (eliminate manual steps, use automation)
  - Always-visible UI philosophy (reduce surprise, teach workflow)
  - Cross-model review patterns (different personalities catch different issues)
- Documented all available tools (File ops, Bash, MCPs, Sub-agents)
- Added validation checklists (Functional, Visual, Performance, Accessibility, Console)
- Defined standard iterative agentic loop (Read → Plan → Implement → Validate → Iterate → Document)
- Clarified business objectives, constraints, tech stack, architecture patterns
- This framework makes Claude Code 10x more effective by providing proper context

**2025-01-09:**
- Implemented Pocket Picks-inspired redesign (futuristic dark theme, neon accents, glassmorphism)
- Added comprehensive Design Principles section to CLAUDE.md (color palette, typography, component patterns, elite frontend standards)
- Created sub-agents for quality assurance:
  - `.claude/agents/design-reviewer.md` - Visual quality & accessibility validation
  - `.claude/agents/smart-gen-validator.md` - Timeline distribution & timestamp accuracy testing
- Updated CSS with vibrant gradients, glow effects, animated hero background
- Enhanced UI components: sidebar nav, buttons, timeline anchors with neon colors
- Documented iterative validation workflow (Context + Tools + Validation = Success)

**2025-01-08:**
- Added pages/CLAUDE.md for detailed index.js documentation
- Refined Claude Code setup based on Patrick Ellis workflow patterns
- Removed GitHub Actions workflow (not needed for parallel processing yet)
- Added Playwright MCP integration notes for visual verification

**2025-01-08 (earlier):**
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

## Workflow Best Practices (Patrick Ellis Method)

**This CLAUDE.md is your working memory** - It's injected into every Claude Code session. Think of it as a README specifically for AI agents.

**Before starting ANY session:**
1. Read this CLAUDE.md file (you're doing it now!)
2. If working on pages/index.js → read pages/CLAUDE.md for function details
3. Use `/test-smart-gen` or `/fix-timestamp-accuracy` commands for guided workflows
4. Check changelog to understand recent changes

**Orchestration Framework:**
```
Context (CLAUDE.md files, prompts)
  + Tools (Playwright, git, grep, bash)
  + Validation (console logs, screenshots, acceptance criteria)
  = Successful Agentic Workflow
```

**Iterative Agentic Loop:**
1. Read spec/requirements (from user prompt or CLAUDE.md)
2. Take action (write code, generate clips, etc.)
3. Validate output (screenshot, console check, test)
4. Compare to spec
5. If not matching → iterate (go to step 2)
6. Max 2-3 iterations before asking user for clarification

**Using Sub-Agents:**
- Commands (`.claude/commands/*.md`) = Reusable prompts you can `/invoke`
- Agents (`.claude/agents/*.md`) = Independent workers with their own context
- Agents can call other agents (e.g., design-reviewer → mobile-validator)
- Keeps main thread context clean

**Context Management:**
- When context heavy (~180k tokens) → user can type `/rewind` to compact to 40%
- Build context BEFORE making changes (grep, read files, check logs)
- Don't ask user for info that's already in CLAUDE.md or code

---

## Notes for Claude

**When working on Smart Gen:**
1. ALWAYS read CLAUDE.md first + pages/CLAUDE.md for function details
2. Build 50k token context before making changes (grep, read relevant functions)
3. Check console logs for actual clip timestamps after generation
4. If touching analyzeNarrativeComprehensive: preserve frame manifest usage
5. Test with 3 video types: cooking (28min), livestream (85min), short (5min)
6. Use Playwright to screenshot timeline after generation (when MCP installed)

**When adding features:**
- Check if impacts mobile (test touch events)
- Verify FFmpeg.wasm compatibility
- Update this CLAUDE.md changelog using `/update-claude-md` command
- Read pages/CLAUDE.md to understand existing patterns

**Red Flags to Avoid:**
- Using localStorage in artifacts (violates Claude.ai restrictions)
- Backwards compatibility hacks (creates silent failures)
- Generic "shadcn purple UI" (ReelForge = dark mode, medieval forge aesthetic)
- Long clips (>10s) for social media
- Ignoring frame manifest timestamps
- Making changes without reading CLAUDE.md files first
