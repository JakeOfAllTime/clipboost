// pages/api/generate-captions.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { fileName, videoUrl, videoType } = req.body

    console.log('Generating captions for:', fileName)

    // Call Claude API to generate captions
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `Generate 3 different Instagram captions for a barber video. The video filename is "${fileName}".

Create captions in these styles:
1. Professional/Business - clean, trustworthy, focuses on skill and service
2. Trendy/Social Media - fun, engaging, uses current slang and emojis
3. Call-to-Action - encourages booking, includes urgency

Requirements for each caption:
- 20-50 words
- Include 2-3 relevant hashtags
- Include 1-2 emojis
- Make it engaging and shareable
- Focus on barber/hair styling content

Respond with a JSON object in this exact format:
[
  {
    "style": "professional",
    "text": "Professional caption text here #barbershop #freshcut ✂️"
  },
  {
    "style": "trendy", 
    "text": "Trendy caption text here #fade #barberlife 🔥"
  },
  {
    "style": "call-to-action",
    "text": "CTA caption text here #booknow #barbershop 💯"
  }
]

IMPORTANT: Respond with ONLY the JSON array, no other text.`
          }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`)
    }

    const data = await response.json()
    let captionsText = data.content[0].text

    // Clean up the response (remove any markdown formatting)
    captionsText = captionsText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // Parse the JSON response
    const captions = JSON.parse(captionsText)

    console.log('Generated captions:', captions)

    res.status(200).json({ captions })

  } catch (error) {
    console.error('Caption generation error:', error)
    res.status(500).json({ 
      error: 'Failed to generate captions',
      details: error.message 
    })
  }
}