import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_CLIPS_DIRS = [
  path.join(os.homedir(), 'Desktop', 'TestClips'),
  path.join(os.homedir(), 'Desktop', 'testclips')
];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const PREFERRED_TEST_CLIPS = [
  'jubjubthai trim.mp4',
  'Cooking_Mushrooms.mp4',
  'Painting_Journeys_038.mp4',
  'NWT81P6YQBM.mp4',
  'freecompress-videoplayback.mp4'
];

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }

  try {
    const byName = new Map();

    for (const clipsDir of TEST_CLIPS_DIRS) {
      let entries = [];
      try {
        entries = await fs.readdir(clipsDir, { withFileTypes: true });
      } catch (_) {
        continue;
      }

      const clipsInDir = await Promise.all(
        entries
          .filter(entry => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
          .map(async entry => {
            const filePath = path.join(clipsDir, entry.name);
            const stat = await fs.stat(filePath);
            return {
              name: entry.name,
              size: stat.size,
              updatedAt: stat.mtimeMs,
              directory: path.basename(clipsDir),
              preferred: PREFERRED_TEST_CLIPS.includes(entry.name)
            };
          })
      );

      clipsInDir.forEach(clip => {
        if (!byName.has(clip.name)) byName.set(clip.name, clip);
      });
    }

    const clips = Array.from(byName.values());

    clips.sort((a, b) => {
      const preferredDelta = Number(b.preferred) - Number(a.preferred);
      if (preferredDelta !== 0) return preferredDelta;
      const aPreferredIndex = PREFERRED_TEST_CLIPS.indexOf(a.name);
      const bPreferredIndex = PREFERRED_TEST_CLIPS.indexOf(b.name);
      if (aPreferredIndex !== -1 && bPreferredIndex !== -1) {
        return aPreferredIndex - bPreferredIndex;
      }
      return b.updatedAt - a.updatedAt;
    });
    return res.status(200).json({ clips });
  } catch (error) {
    console.error('Dev testclips list failed:', error);
    return res.status(200).json({ clips: [] });
  }
}
