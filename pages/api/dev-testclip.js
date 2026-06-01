import fs from 'fs';
import path from 'path';
import os from 'os';

const TEST_CLIPS_DIRS = [
  path.join(os.homedir(), 'Desktop', 'TestClips'),
  path.join(os.homedir(), 'Desktop', 'testclips')
];
const MIME_BY_EXTENSION = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm'
};

export const config = {
  api: {
    responseLimit: false
  }
};

export default function handler(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }

  const name = typeof req.query.name === 'string' ? req.query.name : '';
  const safeName = path.basename(name);
  const ext = path.extname(safeName).toLowerCase();
  const contentType = MIME_BY_EXTENSION[ext];

  if (!safeName || safeName !== name || !contentType) {
    return res.status(400).json({ error: 'Invalid test clip name' });
  }

  const filePath = TEST_CLIPS_DIRS
    .map(clipsDir => ({
      clipsDir,
      candidate: path.join(clipsDir, safeName)
    }))
    .find(({ clipsDir, candidate }) => (
      candidate.startsWith(clipsDir + path.sep) && fs.existsSync(candidate)
    ))?.candidate;

  if (!filePath) {
    return res.status(404).json({ error: 'Test clip not found' });
  }

  const stat = fs.statSync(filePath);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(filePath).pipe(res);
}
