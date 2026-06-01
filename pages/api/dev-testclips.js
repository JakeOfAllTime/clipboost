import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const TEST_CLIPS_DIRS = [
  path.join(os.homedir(), 'Desktop', 'TestClips'),
  path.join(os.homedir(), 'Desktop', 'testclips')
];
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);
const PREFERRED_TEST_CLIPS = [
  'jubjubthai trim.mp4',
  'Cooking_Mushrooms.mp4',
  'Painting_Journeys_038.mp4',
  'NWT81P6YQBM.mp4',
  'freecompress-videoplayback.mp4'
];
const PREFERRED_TEST_TRACKS = [
  'vlog-beat-background-349853.mp3',
  'retro-lounge-389644.mp3'
];

const sortPreferredFirst = (items, preferredNames) => {
  items.sort((a, b) => {
    const preferredDelta = Number(b.preferred) - Number(a.preferred);
    if (preferredDelta !== 0) return preferredDelta;
    const aPreferredIndex = preferredNames.indexOf(a.name);
    const bPreferredIndex = preferredNames.indexOf(b.name);
    if (aPreferredIndex !== -1 && bPreferredIndex !== -1) {
      return aPreferredIndex - bPreferredIndex;
    }
    return b.updatedAt - a.updatedAt;
  });
  return items;
};

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }

  try {
    const clipsByName = new Map();
    const tracksByName = new Map();

    for (const clipsDir of TEST_CLIPS_DIRS) {
      let entries = [];
      try {
        entries = await fs.readdir(clipsDir, { withFileTypes: true });
      } catch (_) {
        continue;
      }

      const mediaInDir = await Promise.all(
        entries
          .filter(entry => {
            if (!entry.isFile()) return false;
            const ext = path.extname(entry.name).toLowerCase();
            return VIDEO_EXTENSIONS.has(ext) || AUDIO_EXTENSIONS.has(ext);
          })
          .map(async entry => {
            const filePath = path.join(clipsDir, entry.name);
            const ext = path.extname(entry.name).toLowerCase();
            const isAudio = AUDIO_EXTENSIONS.has(ext);
            const stat = await fs.stat(filePath);
            return {
              name: entry.name,
              size: stat.size,
              updatedAt: stat.mtimeMs,
              directory: path.basename(clipsDir),
              type: isAudio ? 'audio' : 'video',
              preferred: isAudio
                ? PREFERRED_TEST_TRACKS.includes(entry.name)
                : PREFERRED_TEST_CLIPS.includes(entry.name)
            };
          })
      );

      mediaInDir.forEach(item => {
        const targetMap = item.type === 'audio' ? tracksByName : clipsByName;
        if (!targetMap.has(item.name)) targetMap.set(item.name, item);
      });
    }

    const clips = sortPreferredFirst(Array.from(clipsByName.values()), PREFERRED_TEST_CLIPS);
    const tracks = sortPreferredFirst(Array.from(tracksByName.values()), PREFERRED_TEST_TRACKS);

    return res.status(200).json({ clips, tracks });
  } catch (error) {
    console.error('Dev testclips list failed:', error);
    return res.status(200).json({ clips: [], tracks: [] });
  }
}
