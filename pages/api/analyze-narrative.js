// API Route: Server-side narrative analysis with Claude Vision API
// AUDIT #26, #27: per-IP rate limit (10-burst / 1-per-30s), 25MB body cap,
// generic error envelope to the client (full detail logged server-side).

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb'
    },
    responseLimit: false
  }
};

// Token-bucket rate limiter. Process-local, so per-instance on Vercel. Good
// enough to stop burst abuse from a single client; switch to an edge store
// if horizontal scale ever matters.
const RATE_STATE = globalThis.__clipboost_rate_state__ || (globalThis.__clipboost_rate_state__ = new Map());
const BUCKET_SIZE = 10;           // max burst
const REFILL_PER_MS = 1 / 30_000; // one token every 30s

const STORY_MODEL = process.env.ANTHROPIC_STORY_MODEL || 'claude-haiku-4-5-20251001';
const DEEP_MODEL = process.env.ANTHROPIC_DEEP_MODEL || 'claude-sonnet-4-6';

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimitAllow(ip) {
  const now = Date.now();
  const prev = RATE_STATE.get(ip) || { tokens: BUCKET_SIZE, last: now };
  const elapsed = now - prev.last;
  const tokens = Math.min(BUCKET_SIZE, prev.tokens + elapsed * REFILL_PER_MS);
  if (tokens < 1) {
    RATE_STATE.set(ip, { tokens, last: now });
    return false;
  }
  RATE_STATE.set(ip, { tokens: tokens - 1, last: now });
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = clientIp(req);
  if (!rateLimitAllow(ip)) {
    console.warn(`🛑 Rate limit hit for ${ip}`);
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  try {
    const { messages, videoType, analysisMode } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request format.' });
    }

    const payloadSize = JSON.stringify(req.body).length;
    const payloadMB = (payloadSize / (1024 * 1024)).toFixed(2);
    const model = analysisMode === 'deep' || analysisMode === 'pro' ? DEEP_MODEL : STORY_MODEL;
    console.log(`📸 API: Analyzing video [${videoType || 'visual-only'}:${analysisMode || 'story'}]`);
    console.log(`🧠 API model: ${model}`);
    console.log(`📦 Payload size: ${payloadMB}MB (${payloadSize} bytes)`);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('❌ ANTHROPIC_API_KEY environment variable is not set.');
      return res.status(500).json({ error: 'Analysis is temporarily unavailable.' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.5,
        messages
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // AUDIT #27: log full upstream detail server-side, return a generic
      // message to the client so stack traces and internal state don't leak.
      console.error('❌ Anthropic API error:', response.status, errorText);
      return res.status(502).json({ error: 'Analysis failed. Please try again.' });
    }

    const data = await response.json();
    console.log('✅ API: Response received');
    return res.status(200).json({ content: data.content, stop_reason: data.stop_reason });

  } catch (error) {
    console.error('❌ API: Narrative analysis error:', error);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
}
