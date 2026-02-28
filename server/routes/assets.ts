import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storageDir = path.resolve(__dirname, '..', '..', 'storage', 'assets');
fs.mkdirSync(storageDir, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, storageDir),
        filename: (_req, file, cb) => {
            const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(file.originalname)}`;
            cb(null, uniqueName);
        },
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
});

const router = Router();

// POST /api/assets — Upload an asset (voiceover, music, reference)
router.post('/', upload.single('file'), async (req, res) => {
    const { project_id, asset_type, metadata } = req.body;

    if (!project_id || !asset_type) {
        return res.status(400).json({ error: 'project_id and asset_type are required' });
    }

    try {
        let filePath = null;
        let mimeType = null;
        let originalName = null;

        if (req.file) {
            filePath = `assets/${req.file.filename}`;
            mimeType = req.file.mimetype;
            originalName = req.file.originalname;
        }

        const result = await query(
            `INSERT INTO assets (project_id, asset_type, file_path, mime_type, original_name, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [project_id, asset_type, filePath, mimeType, originalName, metadata ? JSON.stringify(metadata) : null]
        );

        res.status(201).json({
            ...result.rows[0],
            file_url: filePath ? `/storage/${filePath}` : null,
        });
    } catch (err) {
        console.error('Error creating asset:', err);
        res.status(500).json({ error: 'Failed to create asset' });
    }
});

// POST /api/assets/upload-base64 — Upload base64-encoded asset
router.post('/upload-base64', async (req, res) => {
    const { project_id, asset_type, data, mimeType, originalName } = req.body;

    if (!project_id || !asset_type || !data) {
        return res.status(400).json({ error: 'project_id, asset_type, and data are required' });
    }

    try {
        const base64Data = data.includes(',') ? data.split(',')[1] : data;

        let ext = '.bin';
        if (mimeType?.includes('wav')) ext = '.wav';
        else if (mimeType?.includes('mp3') || mimeType?.includes('mpeg')) ext = '.mp3';
        else if (mimeType?.includes('mp4')) ext = '.mp4';
        else if (mimeType?.includes('png')) ext = '.png';
        else if (mimeType?.includes('jpeg') || mimeType?.includes('jpg')) ext = '.jpg';
        else if (mimeType?.includes('webm')) ext = '.webm';

        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const fullPath = path.join(storageDir, filename);
        const relativePath = `assets/${filename}`;

        fs.writeFileSync(fullPath, Buffer.from(base64Data, 'base64'));

        const result = await query(
            `INSERT INTO assets (project_id, asset_type, file_path, mime_type, original_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [project_id, asset_type, relativePath, mimeType, originalName]
        );

        // Also update the project's voiceover/music path if applicable
        if (asset_type === 'voiceover') {
            await query('UPDATE projects SET voiceover_path = $2 WHERE id = $1', [project_id, relativePath]);
        } else if (asset_type === 'music') {
            await query('UPDATE projects SET music_path = $2 WHERE id = $1', [project_id, relativePath]);
        }

        res.status(201).json({
            ...result.rows[0],
            file_url: `/storage/${relativePath}`,
        });
    } catch (err) {
        console.error('Error uploading base64 asset:', err);
        res.status(500).json({ error: 'Failed to upload asset' });
    }
});

// GET /api/assets/:id/file — Serve asset file
router.get('/:id/file', async (req, res) => {
    try {
        const result = await query('SELECT * FROM assets WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0 || !result.rows[0].file_path) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        const fullPath = path.resolve(__dirname, '..', '..', 'storage', result.rows[0].file_path);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        res.sendFile(fullPath);
    } catch (err) {
        console.error('Error serving asset:', err);
        res.status(500).json({ error: 'Failed to serve asset' });
    }
});

// DELETE /api/assets/:id — Delete asset + file
router.delete('/:id', async (req, res) => {
    try {
        const result = await query('DELETE FROM assets WHERE id = $1 RETURNING *', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Asset not found' });
        }

        // Try to clean up file
        if (result.rows[0].file_path) {
            const fullPath = path.resolve(__dirname, '..', '..', 'storage', result.rows[0].file_path);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        res.json({ deleted: true, id: req.params.id });
    } catch (err) {
        console.error('Error deleting asset:', err);
        res.status(500).json({ error: 'Failed to delete asset' });
    }
});

export default router;
