import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_CLIPS_DIR = path.join(os.homedir(), 'Desktop', 'testclips');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }

  try {
    const entries = await fs.readdir(TEST_CLIPS_DIR, { withFileTypes: true });
    const clips = await Promise.all(
      entries
        .filter(entry => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map(async entry => {
          const filePath = path.join(TEST_CLIPS_DIR, entry.name);
          const stat = await fs.stat(filePath);
          return {
            name: entry.name,
            size: stat.size,
            updatedAt: stat.mtimeMs
          };
        })
    );

    clips.sort((a, b) => b.updatedAt - a.updatedAt);
    return res.status(200).json({ clips });
  } catch (error) {
    console.error('Dev testclips list failed:', error);
    return res.status(200).json({ clips: [] });
  }
}
