// API Route: Server-side narrative analysis with Claude Vision API
// This avoids CORS issues by calling Anthropic API from the server

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { frames, targetDuration } = req.body;

    if (!frames || !Array.isArray(frames)) {
      return res.status(400).json({ error: 'Invalid frames data' });
    }

    console.log(`📸 API: Analyzing ${frames.length} frames for ${targetDuration}s target`);

    // Build the content array for Claude
    const content = [
      {
        type: "text",
        text: `Analyze these ${frames.length} frames from a video to create a compelling short-form edit.

TARGET DURATION: ${targetDuration} seconds

Your task:
1. Identify the story type (tutorial, transformation, vlog, product_demo, performance, other)
2. Understand the narrative arc and key moments
3. Suggest 5-7 cut points that tell a cohesive story
4. Each clip should be 2-5 seconds long
5. Prioritize moments with visual interest or emotional weight

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "storyType": "string",
  "narrative": "brief description of the story",
  "suggestedCuts": [
    {
      "startTime": number,
      "endTime": number,
      "reason": "why this moment matters",
      "importance": number between 0-1
    }
  ]
}`
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
