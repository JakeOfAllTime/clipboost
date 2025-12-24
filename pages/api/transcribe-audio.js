// API Route: Server-side audio transcription with OpenAI Whisper
// Transcribes video audio to text with timestamps

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '100mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { audioBase64 } = req.body;

    if (!audioBase64) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    console.log('🎤 API: Transcribing audio with Whisper...');

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Create FormData for multipart upload
    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', audioBuffer, {
      filename: 'audio.mp3',
      contentType: 'audio/mpeg'
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'segment');

    console.log('📤 API: Sending to OpenAI Whisper...');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API: Whisper API error:', errorText);
      return res.status(response.status).json({
        error: 'Transcription failed',
        details: errorText
      });
    }

    const transcript = await response.json();

    console.log('✅ API: Transcription complete:', {
      duration: transcript.duration,
      segments: transcript.segments?.length,
      language: transcript.language
    });

    // Return formatted transcript with segments
    return res.status(200).json({
      text: transcript.text,
      segments: transcript.segments || [],
      language: transcript.language,
      duration: transcript.duration
    });

  } catch (error) {
    console.error('❌ API: Transcription error:', error);
    return res.status(500).json({
      error: 'Internal transcription error',
      message: error.message
    });
  }
}
