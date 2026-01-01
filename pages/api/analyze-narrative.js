// API Route: Server-side narrative analysis with Claude Vision API
// This avoids CORS issues by calling Anthropic API from the server

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { frames, targetDuration, isMultiModal, transcript, audioTopics } = req.body;

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

STEP 5: BUILD THE NARRATIVE
Create 5-8 anchors using type-specific strategy, respecting speech pauses.

Respond with ONLY valid JSON (no markdown, no explanation):
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

STEP 5: BUILD THE NARRATIVE
Create 5-8 anchors that tell the story using the type-specific strategy.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "storyType": "string",
  "narrative": "brief description",
  "keyMomentsFound": ["which key moments you identified"],
  "suggestedCuts": [
    {
      "startTime": number,
      "endTime": number,
      "reason": "why this moment matters for this TYPE",
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

    console.log('🤖 API: Calling Anthropic API...');

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
        }]
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
    const textContent = data.content.find(c => c.type === 'text')?.text || '';

    console.log('📝 API: Received response, parsing JSON...');

    // Parse the JSON response
    try {
      const narrative = JSON.parse(textContent);
      console.log('✅ API: Successfully analyzed narrative:', {
        storyType: narrative.storyType,
        cutsCount: narrative.suggestedCuts?.length
      });
      return res.status(200).json(narrative);
    } catch (parseError) {
      console.error('❌ API: Failed to parse narrative JSON:', textContent);
      return res.status(500).json({
        error: 'Invalid response from AI',
        rawResponse: textContent
      });
    }

  } catch (error) {
    console.error('❌ API: Narrative analysis error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
