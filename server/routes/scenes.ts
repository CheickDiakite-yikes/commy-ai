import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storageDir = path.resolve(__dirname, '..', '..', 'storage', 'scenes');
fs.mkdirSync(storageDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, storageDir),
        filename: (_req, file, cb) => {
            const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        },
    }),
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
});

const router = Router();

// PUT /api/scenes/:id — Update scene data
router.put('/:id', async (req, res) => {
    const { status, text_overlay, overlay_config, duration } = req.body;

    try {
        const result = await query(
            `UPDATE scenes SET
        status = COALESCE($2, status),
        text_overlay = COALESCE($3, text_overlay),
        overlay_config = COALESCE($4, overlay_config),
        duration = COALESCE($5, duration)
      WHERE id = $1 RETURNING *`,
            [req.params.id, status, text_overlay, overlay_config ? JSON.stringify(overlay_config) : null, duration]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Scene not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating scene:', err);
        res.status(500).json({ error: 'Failed to update scene' });
    }
});

// POST /api/scenes/:id/storyboard — Upload storyboard image
router.post('/:id/storyboard', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const relativePath = `scenes/${req.file.filename}`;
    try {
        const result = await query(
            'UPDATE scenes SET storyboard_path = $2 WHERE id = $1 RETURNING *',
            [req.params.id, relativePath]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Scene not found' });
        }

        res.json({
            ...result.rows[0],
            storyboard_url: `/storage/${relativePath}`,
        });
    } catch (err) {
        console.error('Error uploading storyboard:', err);
        res.status(500).json({ error: 'Failed to upload storyboard' });
    }
});

// POST /api/scenes/:id/video — Upload video clip
router.post('/:id/video', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const relativePath = `scenes/${req.file.filename}`;
    try {
        const result = await query(
            `UPDATE scenes SET video_path = $2, status = 'complete' WHERE id = $1 RETURNING *`,
            [req.params.id, relativePath]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Scene not found' });
        }

        res.json({
            ...result.rows[0],
            video_url: `/storage/${relativePath}`,
        });
    } catch (err) {
        console.error('Error uploading video:', err);
        res.status(500).json({ error: 'Failed to upload video' });
    }
});

// POST /api/scenes/:id/upload-base64 — Upload base64 media (storyboard or video)
router.post('/:id/upload-base64', async (req, res) => {
    const { data, type, mimeType } = req.body; // type: 'storyboard' | 'video'
    if (!data || !type) return res.status(400).json({ error: 'Missing data or type' });

    try {
        // Remove data URL prefix if present
        const base64Data = data.includes(',') ? data.split(',')[1] : data;
        const ext = mimeType?.includes('mp4') ? '.mp4' : mimeType?.includes('webm') ? '.webm' : '.png';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const filePath = path.join(storageDir, filename);
        const relativePath = `scenes/${filename}`;

        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));

        const column = type === 'video' ? 'video_path' : 'storyboard_path';
        const statusUpdate = type === 'video' ? ", status = 'complete'" : '';

        const result = await query(
            `UPDATE scenes SET ${column} = $2${statusUpdate} WHERE id = $1 RETURNING *`,
            [req.params.id, relativePath]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Scene not found' });
        }

        res.json({
            ...result.rows[0],
            [`${type}_url`]: `/storage/${relativePath}`,
        });
    } catch (err) {
        console.error('Error uploading base64 media:', err);
        res.status(500).json({ error: 'Failed to upload media' });
    }
});

export default router;
