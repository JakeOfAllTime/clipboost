// API Route: Server-side narrative analysis with Claude Vision API
// Simplified two-phase architecture - No tools, just direct analysis

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
};

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, videoType } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    // Log payload size for debugging
    const payloadSize = JSON.stringify(req.body).length;
    const payloadMB = (payloadSize / (1024 * 1024)).toFixed(2);
    console.log(`📸 API: Analyzing video [${videoType || 'visual-only'}]`);
    console.log(`📦 Payload size: ${payloadMB}MB (${payloadSize} bytes)`);

    // Call Claude API with messages (no tools)
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
        messages: messages
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

    // Return the response
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
