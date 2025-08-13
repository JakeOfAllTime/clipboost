import multer from 'multer';
import { createClient } from '@supabase/supabase-js';

const upload = multer();

export default async function handler(req, res) {
  upload.array('clipUpload')(req, res, async (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    for (let file of files) {
      const { data, error } = await supabase.storage
        .from('clips')
        .upload(file.originalname, file.buffer, { upsert: true });
      if (error) {
        return res.status(500).json({ error: error.message });
      }
    }
    res.status(200).json({ message: 'Uploaded!' });
  });
}

export const config = {
  api: {
    bodyParser: false, // Required for multer to handle multipart/form-data
  },
};