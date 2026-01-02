// API Route: Server-side narrative analysis with Claude Vision API
// Supports autonomous frame requests via tool use

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { frames, targetDuration, isMultiModal, transcript, audioTopics, messages } = req.body;

    // If messages array provided, handle multi-turn conversation
    if (messages && Array.isArray(messages)) {
      return handleMultiTurnConversation(req, res, messages);
    }

    // Otherwise, handle initial request (backward compatibility)
    if (!frames || !Array.isArray(frames)) {
      return res.status(400).json({ error: 'Invalid frames data' });
    }

    const mode = isMultiModal ? 'Multi-Modal (Vision + Audio)' : 'Visual Only';
    console.log(`📸 API: Analyzing ${frames.length} frames for ${targetDuration}s target [${mode}]`);

    let promptText = '';

    // Multi-modal prompt (vision + audio)
    if (isMultiModal && transcript) {
      promptText = `Analyze this video using BOTH visual and audio information to create compelling short-form clips.

TARGET DURATION: ${targetDuration} seconds

VISUAL INFORMATION:
You'll see ${frames.length} strategic frames showing key visual moments.

AUDIO TRANSCRIPT:
Full transcript with timestamps:
${transcript.segments?.map(s => `[${s.start.toFixed(1)}s] ${s.text}`).join('\n').substring(0, 8000) || transcript.text?.substring(0, 8000)}

TOPIC TRANSITIONS (from audio analysis):
${audioTopics?.topics?.map((t, i) => `Topic ${i + 1}: ${t.start.toFixed(1)}s - ${t.end.toFixed(1)}s`).join('\n') || 'No topics detected'}

KEY QUOTES (emphasis moments):
${audioTopics?.keyQuotes?.map(q => `[${q.time.toFixed(1)}s] "${q.text}"`).join('\n') || 'No key quotes'}

STEP 1: IDENTIFY VIDEO TYPE
First, determine what type of video this is:
- tutorial (how-to, cooking, DIY, educational)
- transformation (before/after, makeover, progress)
- vlog (personal narrative, day-in-life, commentary)
- product_demo (unboxing, review, showcase)
- interview (conversation, Q&A, podcast)
- performance (sports, music, dance, skills)

STEP 2: SELF-ANALYSIS
Ask yourself:
"What are the KEY MOMENTS that make a great [type] clip?"
"Where do VISUAL + AUDIO align most powerfully?"
"What makes this type engaging?"

STEP 3: TYPE-SPECIFIC GUIDANCE

FOR TUTORIALS:
- Look for: Setup/ingredients + explanation, key techniques + "here's the secret", result + satisfaction
- Clips: 4-12 seconds, complete thoughts with speech pauses
- Avoid: Long lists, repetitive process without commentary
- Build: Problem → Solution → Result

FOR TRANSFORMATIONS:
- Look for: "Before" state + context, dramatic changes + reactions, reveal + impact statement
- Clips: 5-15 seconds, build tension to payoff
- Avoid: Repetitive middle without audio emphasis
- Build: Contrast is everything - before/after with audio reinforcement

FOR VLOGS:
- Look for: Scene transitions + location announcements, reactions + excitement, punchlines + visual payoff
- Clips: 2-8 seconds, fast-paced with energy
- Avoid: Long explanations, static moments
- Build: Personality and variety - visual energy + vocal enthusiasm

FOR PRODUCT DEMOS:
- Look for: Reveal + "check this out", features + descriptions, usage + benefits, verdict + recommendation
- Clips: 1-6 seconds, punchy reveals
- Avoid: Packaging without commentary, spec reading
- Build: Reveal → Impress → Convince (show + tell)

FOR INTERVIEWS:
- Look for: Insightful quotes + facial reactions, emotional moments + tone shifts, stories + visual context
- Clips: 4-10 seconds, complete answers with natural pauses
- Avoid: Questions without answers, mid-sentence cuts
- Build: Extract wisdom - powerful words + authentic reactions

FOR PERFORMANCE:
- Look for: Peak action + crowd noise, success + celebrations, techniques + commentary
- Clips: 2-6 seconds, highlights with impact
- Avoid: Setup without payoff, waiting
- Build: Excitement - action + atmosphere

STEP 4: FIND VISUAL + AUDIO SYNERGY
Search for moments where what you SEE and what you HEAR align powerfully.

STEP 5: DETERMINE OPTIMAL CLIP LENGTH FOR EACH MOMENT

For EVERY moment you identify, think through:

QUESTION 1: "What is this moment doing?"
- Establishing context (intro, setup, location)?
- Demonstrating action (technique, process, how-to)?
- Revealing result (payoff, transformation, final product)?
- Showing reaction (emotion, satisfaction, surprise)?
- Providing information (text, list, explanation)?

QUESTION 2: "How long does THIS SPECIFIC content need to communicate effectively?"

SELF-PROMPTING GUIDELINES:

For Text/Graphics:
→ Ask: "Can a viewer read/absorb this in time?"
→ Typical: 2-4 seconds (ingredient lists, titles, captions)
→ Longer if dense (5-6s for paragraph of text)

For Action/Technique:
→ Ask: "Does this show a complete movement or process?"
→ Typical: 5-8 seconds (enough to see start → middle → finish)
→ Shorter if repetitive (3-4s for simple actions)

For Reveals (Results/Transformations):
→ Ask: "Is this a payoff moment that deserves impact?"
→ Typical: 6-10 seconds (let the reveal land, show before/after)
→ Longer if complex (8-12s for detailed transformation)

For Reactions/Emotions:
→ Ask: "Quick beat or extended moment?"
→ Typical: 2-4 seconds (instant emotional response)
→ Longer if story-critical (5-6s for meaningful exchange)

For Establishing Shots:
→ Ask: "Context or filler?"
→ Typical: 2-3 seconds (set scene, then move on)

PACING PHILOSOPHY:
- Vary clip lengths for rhythm (3s → 7s → 4s → 9s creates energy)
- Fast cuts for information/setup (keep momentum)
- Slower holds for impact (reveals, climaxes, reactions)
- Match the content's natural energy (frantic = quick cuts, serene = longer holds)

CLIP COUNT TARGETS (flexible based on content):
- 40-second target: Aim for 6-10 clips (average 4-7s each, but varied)
- 60-second target: Aim for 10-15 clips (average 4-6s each, but varied)
- Don't force it - if content naturally needs fewer longer clips, that's OK
- Prioritize rhythm over hitting exact counts

STEP 6: BUILD THE NARRATIVE
Create 5-8 anchors using type-specific strategy and self-determined clip lengths.

CRITICAL: ENDING MOMENTS

ALWAYS check the final frames (especially the LAST frame provided) for completion gestures:
- Signing artwork, tasting food, stepping back to admire
- Client/subject satisfied reaction or admiring result
- Holding up finished product, thumbs up
- Celebration, bow, arms raised in victory
- Wave goodbye, direct conclusion to camera
- "And there you have it!" or "That's it!" moments

These completion gestures provide closure and viewer satisfaction.
If present in the frames, they should ALMOST ALWAYS be included as the FINAL clip.

Missing endings makes clips feel incomplete and unsatisfying.

AUTONOMOUS FRAME REQUESTS:
If you're missing key moments (like final result, transformation reveal, etc.) and confidence is below 0.85,
you can use the request_additional_frames tool to ask for more frames from specific time ranges.

CRITICAL: COMMITMENT DECISION LOGIC

You can request additional frames using the request_additional_frames tool, BUT you must know when to COMMIT to your analysis.

DECISION RULES:

1. FIRST REQUEST ANALYSIS:
   After receiving your first set of additional frames, ask yourself:
   "Is my confidence now >= 0.75?"
   → YES: COMMIT - Return final JSON now
   → NO: Make ONE more targeted request for critical missing moment

2. SECOND REQUEST ANALYSIS:
   After receiving your second set of additional frames, you MUST commit
   → Return final JSON regardless of confidence level
   → Confidence 0.7-0.8 is acceptable and useful
   → Users can manually add clips for any remaining gaps

3. LONG VIDEO HANDLING (>20 minutes):
   You cannot see everything in a 30-minute video from 15-20 frames
   → Focus on the STRONGEST moments you HAVE identified
   → Don't request frames for every possible moment
   → Commit with 0.7-0.8 confidence - this is good enough

4. CONFIDENCE THRESHOLDS:
   - 0.85+: Excellent, definitely commit
   - 0.75-0.84: Good, commit now
   - 0.65-0.74: Acceptable, commit after 1 more request maximum
   - Below 0.65: Request 1 more critical range, then commit

EXAMPLES:

Scenario 1:
Initial frames → Confidence 0.6 (missing finale)
→ Request finale frames (attempt 1)
→ Receive finale → Confidence 0.85
→ COMMIT NOW ✅

Scenario 2:
Initial frames → Confidence 0.65 (missing middle technique and finale)
→ Request finale frames (attempt 1) - prioritize payoff
→ Receive finale → Confidence 0.75
→ COMMIT NOW ✅ (middle can be added manually if needed)

Scenario 3:
Initial frames → Confidence 0.5 (missing setup, technique, finale)
→ Request finale frames (attempt 1) - payoff is most critical
→ Receive finale → Confidence 0.65, still want technique
→ Request technique frames (attempt 2)
→ Receive technique → Confidence 0.78
→ MUST COMMIT NOW ✅ (at attempt 2)

Scenario 4:
30-minute cooking show → Initial frames show intro, middle, but no finale
→ Confidence 0.65
→ Request finale (25:00-28:40)
→ Receive finale → Confidence 0.80
→ COMMIT NOW ✅ (don't try to see every ingredient and technique)

KEY PRINCIPLE:
Perfect is the enemy of good.
Users prefer 6-8 solid clips at 75% confidence in 60 seconds
over waiting 3 minutes for 95% confidence.
After 2 requests, you MUST return your best analysis.

CRITICAL: JSON-ONLY RESPONSE FORMAT

Your final response (after using tools or on first analysis) MUST be ONLY the JSON object below.
Do NOT include:
- Markdown code fences (no \`\`\`json)
- Explanatory text before or after the JSON
- Conversational responses

ONLY output this exact JSON structure:
{
  "storyType": "tutorial|transformation|vlog|product_demo|interview|performance|other",
  "narrative": "brief description combining visual and audio story",
  "keyMomentsFound": ["which key moments you identified"],
  "suggestedCuts": [
    {
      "startTime": number (use transcript timestamps for precision),
      "endTime": number (align with speech pauses when possible),
      "visualReason": "what's happening visually",
      "audioReason": "what's being said/emphasized",
      "clipLengthReasoning": "why this duration is optimal for THIS content (e.g., 'Text needs 3s to be readable', 'Technique needs 6s to show full motion', 'Reveal deserves 8s for impact')",
      "narrativeRole": "hook|build|climax|payoff",
      "importance": number between 0-1
    }
  ],
  "confidence": number between 0-1,
  "missingMoments": ["moments you wanted but didn't see"],
  "recommendations": ["any suggestions for improvement"]
}`;
    } else {
      // Enhanced visual-only prompt with type-specific self-analysis
      promptText = `Analyze these ${frames.length} frames from a video to create compelling short-form clips.

TARGET DURATION: ${targetDuration} seconds

STEP 1: IDENTIFY VIDEO TYPE
First, determine what type of video this is:
- tutorial (how-to, cooking, DIY, educational)
- transformation (before/after, makeover, progress)
- vlog (personal narrative, day-in-life, commentary)
- product_demo (unboxing, review, showcase)
- interview (conversation, Q&A, podcast)
- performance (sports, music, dance, skills)

STEP 2: SELF-ANALYSIS
Once you identify the type, ask yourself:
"What are the KEY MOMENTS that make a great [type] clip?"
"What should I look for in the frames?"
"What makes this type of content engaging?"

STEP 3: TYPE-SPECIFIC GUIDANCE
Based on the type you identified, apply these strategies:

FOR TUTORIALS:
- Look for: Setup/ingredients, key techniques, final result
- Clips: 4-8 seconds, complete thoughts
- Avoid: Long lists, repetitive shots
- Build: Problem → Solution → Result

FOR TRANSFORMATIONS:
- Look for: Clear before, dramatic process, after reveal
- Clips: 5-15 seconds, show contrast
- Avoid: Repetitive middle, no change visible
- Build: Emphasize before/after contrast

FOR VLOGS:
- Look for: Location changes, reactions, energy peaks
- Clips: 2-8 seconds, fast paced
- Avoid: Long monologues, static talking
- Build: High energy, variety, personality

FOR PRODUCT DEMOS:
- Look for: Reveal, features, in-use, verdict
- Clips: 1-6 seconds, punchy
- Avoid: Packaging shots, spec lists
- Build: Reveal → Impress → Convince

FOR INTERVIEWS:
- Look for: Insightful quotes, reactions, stories
- Clips: 4-10 seconds, complete sentences
- Avoid: Mid-sentence cuts, questions without answers
- Build: Extract wisdom

FOR PERFORMANCE:
- Look for: Peak action, reactions, success moments
- Clips: 2-6 seconds, highlights
- Avoid: Setup, waiting, failures
- Build: Show excitement and skill

STEP 4: FIND THOSE MOMENTS
Search the provided frames for the key moments relevant to this video type.

STEP 5: DETERMINE OPTIMAL CLIP LENGTH FOR EACH MOMENT

For EVERY moment you identify, think through:

QUESTION 1: "What is this moment doing?"
- Establishing context (intro, setup, location)?
- Demonstrating action (technique, process, how-to)?
- Revealing result (payoff, transformation, final product)?
- Showing reaction (emotion, satisfaction, surprise)?
- Providing information (text, list, explanation)?

QUESTION 2: "How long does THIS SPECIFIC content need to communicate effectively?"

SELF-PROMPTING GUIDELINES:

For Text/Graphics:
→ Ask: "Can a viewer read/absorb this in time?"
→ Typical: 2-4 seconds (ingredient lists, titles, captions)
→ Longer if dense (5-6s for paragraph of text)

For Action/Technique:
→ Ask: "Does this show a complete movement or process?"
→ Typical: 5-8 seconds (enough to see start → middle → finish)
→ Shorter if repetitive (3-4s for simple actions)

For Reveals (Results/Transformations):
→ Ask: "Is this a payoff moment that deserves impact?"
→ Typical: 6-10 seconds (let the reveal land, show before/after)
→ Longer if complex (8-12s for detailed transformation)

For Reactions/Emotions:
→ Ask: "Quick beat or extended moment?"
→ Typical: 2-4 seconds (instant emotional response)
→ Longer if story-critical (5-6s for meaningful exchange)

For Establishing Shots:
→ Ask: "Context or filler?"
→ Typical: 2-3 seconds (set scene, then move on)

PACING PHILOSOPHY:
- Vary clip lengths for rhythm (3s → 7s → 4s → 9s creates energy)
- Fast cuts for information/setup (keep momentum)
- Slower holds for impact (reveals, climaxes, reactions)
- Match the content's natural energy (frantic = quick cuts, serene = longer holds)

CLIP COUNT TARGETS (flexible based on content):
- 40-second target: Aim for 6-10 clips (average 4-7s each, but varied)
- 60-second target: Aim for 10-15 clips (average 4-6s each, but varied)
- Don't force it - if content naturally needs fewer longer clips, that's OK
- Prioritize rhythm over hitting exact counts

STEP 6: BUILD THE NARRATIVE
Create 5-8 anchors that tell the story using the type-specific strategy and self-determined clip lengths.

CRITICAL: ENDING MOMENTS

ALWAYS check the final frames (especially the LAST frame provided) for completion gestures:
- Signing artwork, tasting food, stepping back to admire
- Client/subject satisfied reaction or admiring result
- Holding up finished product, thumbs up
- Celebration, bow, arms raised in victory
- Wave goodbye, direct conclusion to camera
- "And there you have it!" or "That's it!" moments

These completion gestures provide closure and viewer satisfaction.
If present in the frames, they should ALMOST ALWAYS be included as the FINAL clip.

Missing endings makes clips feel incomplete and unsatisfying.

AUTONOMOUS FRAME REQUESTS:
If you're missing key moments (like final result, transformation reveal, etc.) and confidence is below 0.85,
you can use the request_additional_frames tool to ask for more frames from specific time ranges.

CRITICAL: COMMITMENT DECISION LOGIC

You can request additional frames using the request_additional_frames tool, BUT you must know when to COMMIT to your analysis.

DECISION RULES:

1. FIRST REQUEST ANALYSIS:
   After receiving your first set of additional frames, ask yourself:
   "Is my confidence now >= 0.75?"
   → YES: COMMIT - Return final JSON now
   → NO: Make ONE more targeted request for critical missing moment

2. SECOND REQUEST ANALYSIS:
   After receiving your second set of additional frames, you MUST commit
   → Return final JSON regardless of confidence level
   → Confidence 0.7-0.8 is acceptable and useful
   → Users can manually add clips for any remaining gaps

3. LONG VIDEO HANDLING (>20 minutes):
   You cannot see everything in a 30-minute video from 15-20 frames
   → Focus on the STRONGEST moments you HAVE identified
   → Don't request frames for every possible moment
   → Commit with 0.7-0.8 confidence - this is good enough

4. CONFIDENCE THRESHOLDS:
   - 0.85+: Excellent, definitely commit
   - 0.75-0.84: Good, commit now
   - 0.65-0.74: Acceptable, commit after 1 more request maximum
   - Below 0.65: Request 1 more critical range, then commit

EXAMPLES:

Scenario 1:
Initial frames → Confidence 0.6 (missing finale)
→ Request finale frames (attempt 1)
→ Receive finale → Confidence 0.85
→ COMMIT NOW ✅

Scenario 2:
Initial frames → Confidence 0.65 (missing middle technique and finale)
→ Request finale frames (attempt 1) - prioritize payoff
→ Receive finale → Confidence 0.75
→ COMMIT NOW ✅ (middle can be added manually if needed)

Scenario 3:
Initial frames → Confidence 0.5 (missing setup, technique, finale)
→ Request finale frames (attempt 1) - payoff is most critical
→ Receive finale → Confidence 0.65, still want technique
→ Request technique frames (attempt 2)
→ Receive technique → Confidence 0.78
→ MUST COMMIT NOW ✅ (at attempt 2)

Scenario 4:
30-minute cooking show → Initial frames show intro, middle, but no finale
→ Confidence 0.65
→ Request finale (25:00-28:40)
→ Receive finale → Confidence 0.80
→ COMMIT NOW ✅ (don't try to see every ingredient and technique)

KEY PRINCIPLE:
Perfect is the enemy of good.
Users prefer 6-8 solid clips at 75% confidence in 60 seconds
over waiting 3 minutes for 95% confidence.
After 2 requests, you MUST return your best analysis.

CRITICAL: JSON-ONLY RESPONSE FORMAT

Your final response (after using tools or on first analysis) MUST be ONLY the JSON object below.
Do NOT include:
- Markdown code fences (no \`\`\`json)
- Explanatory text before or after the JSON
- Conversational responses

ONLY output this exact JSON structure:
{
  "storyType": "tutorial|transformation|vlog|product_demo|interview|performance|other",
  "narrative": "brief description",
  "keyMomentsFound": ["which key moments you identified"],
  "suggestedCuts": [
    {
      "startTime": number,
      "endTime": number,
      "reason": "why this moment matters for this TYPE",
      "clipLengthReasoning": "why this duration is optimal for THIS content (e.g., 'Text needs 3s to be readable', 'Technique needs 6s to show full motion', 'Reveal deserves 8s for impact')",
      "narrativeRole": "hook|build|climax|payoff",
      "importance": 0-1
    }
  ],
  "confidence": 0-1,
  "missingMoments": ["moments you wanted but didn't see"]
}`;
    }

    // Build the content array for Claude
    const content = [
      {
        type: "text",
        text: promptText
      }
    ];

    // Add frames
    frames.forEach((frame, index) => {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: frame.base64
        }
      });
      content.push({
        type: "text",
        text: `Frame ${index + 1}/${frames.length} at ${frame.timestamp.toFixed(1)}s`
      });
    });

    console.log('🤖 API: Calling Anthropic API with tool use...');

    // Define the request_additional_frames tool
    const tools = [{
      name: "request_additional_frames",
      description: "Request additional frames from a specific time range in the video when you need to see more detail about a particular moment (e.g., final result, transformation reveal, key technique).",
      input_schema: {
        type: "object",
        properties: {
          start_time: {
            type: "number",
            description: "Start time in seconds for the frame extraction range"
          },
          end_time: {
            type: "number",
            description: "End time in seconds for the frame extraction range"
          },
          reason: {
            type: "string",
            description: "Explain what you're looking for in this time range and why you need these frames"
          },
          frame_count: {
            type: "number",
            description: "Number of frames to extract from this range (default: 6, max: 10)",
            default: 6
          }
        },
        required: ["start_time", "end_time", "reason"]
      }
    }];

    // Call Anthropic API (server-side, no CORS issues)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        temperature: 0.5,
        messages: [{
          role: "user",
          content: content
        }],
        tools: tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API: Anthropic API error:', errorText);
      return res.status(response.status).json({
        error: 'API request failed',
        details: errorText
      });
    }

    const data = await response.json();

    // Return the raw response so client can handle tool use
    console.log('✅ API: Response received');
    return res.status(200).json({ content: data.content, stop_reason: data.stop_reason });

  } catch (error) {
    console.error('❌ API: Narrative analysis error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

// Handle multi-turn conversations with tool results
async function handleMultiTurnConversation(req, res, messages) {
  try {
    console.log(`🔄 API: Multi-turn conversation (${messages.length} messages)`);

    // Define tools
    const tools = [{
      name: "request_additional_frames",
      description: "Request additional frames from a specific time range in the video when you need to see more detail about a particular moment.",
      input_schema: {
        type: "object",
        properties: {
          start_time: {
            type: "number",
            description: "Start time in seconds"
          },
          end_time: {
            type: "number",
            description: "End time in seconds"
          },
          reason: {
            type: "string",
            description: "What you're looking for in this range"
          },
          frame_count: {
            type: "number",
            description: "Number of frames (default: 6, max: 10)",
            default: 6
          }
        },
        required: ["start_time", "end_time", "reason"]
      }
    }];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        temperature: 0.5,
        messages: messages,
        tools: tools
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API: Anthropic API error:', errorText);
      return res.status(response.status).json({
        error: 'API request failed',
        details: errorText
      });
    }

    const data = await response.json();
    console.log('✅ API: Multi-turn response received');

    return res.status(200).json({ content: data.content, stop_reason: data.stop_reason });

  } catch (error) {
    console.error('❌ API: Multi-turn error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
