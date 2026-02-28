import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/projects — List all projects
router.get('/', async (_req, res) => {
    try {
        const result = await query(
            'SELECT id, title, concept, mode, current_phase, is_generating, created_at, updated_at FROM projects ORDER BY updated_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Error listing projects:', err);
        res.status(500).json({ error: 'Failed to list projects' });
    }
});

// GET /api/projects/:id — Get full project with scenes
router.get('/:id', async (req, res) => {
    try {
        const projectResult = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
        if (projectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = projectResult.rows[0];
        const scenesResult = await query(
            'SELECT * FROM scenes WHERE project_id = $1 ORDER BY scene_order ASC',
            [req.params.id]
        );
        const assetsResult = await query(
            'SELECT * FROM assets WHERE project_id = $1',
            [req.params.id]
        );

        res.json({
            ...project,
            scenes: scenesResult.rows,
            assets: assetsResult.rows,
        });
    } catch (err) {
        console.error('Error fetching project:', err);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});

// POST /api/projects — Create a new project
router.post('/', async (req, res) => {
    const { title, concept, music_mood, full_script, character_profile, visual_style_profile, mode, settings, scenes } = req.body;

    const client = await (await import('../db.js')).getClient();
    try {
        await client.query('BEGIN');

        const projectResult = await client.query(
            `INSERT INTO projects (title, concept, music_mood, full_script, character_profile, visual_style_profile, mode, settings, current_phase, is_generating)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [title, concept, music_mood, full_script, character_profile, visual_style_profile, mode, JSON.stringify(settings), 'planning', false]
        );
        const project = projectResult.rows[0];

        // Insert scenes if provided
        const insertedScenes = [];
        if (scenes && scenes.length > 0) {
            for (const scene of scenes) {
                const sceneResult = await client.query(
                    `INSERT INTO scenes (project_id, scene_order, duration, character, environment, camera, action_blocking, visual_summary_prompt, text_overlay, overlay_config, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
                    [
                        project.id,
                        scene.order,
                        scene.duration,
                        JSON.stringify(scene.character),
                        JSON.stringify(scene.environment),
                        JSON.stringify(scene.camera),
                        JSON.stringify(scene.action_blocking),
                        scene.visual_summary_prompt,
                        scene.textOverlay || scene.text_overlay,
                        JSON.stringify(scene.overlayConfig || scene.overlay_config),
                        scene.status || 'pending',
                    ]
                );
                insertedScenes.push(sceneResult.rows[0]);
            }
        }

        await client.query('COMMIT');
        res.status(201).json({ ...project, scenes: insertedScenes });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating project:', err);
        res.status(500).json({ error: 'Failed to create project' });
    } finally {
        client.release();
    }
});

// PUT /api/projects/:id — Update project
router.put('/:id', async (req, res) => {
    const { title, concept, current_phase, is_generating, music_mood, full_script, mode } = req.body;

    try {
        const result = await query(
            `UPDATE projects SET
        title = COALESCE($2, title),
        concept = COALESCE($3, concept),
        current_phase = COALESCE($4, current_phase),
        is_generating = COALESCE($5, is_generating),
        music_mood = COALESCE($6, music_mood),
        full_script = COALESCE($7, full_script),
        mode = COALESCE($8, mode),
        updated_at = NOW()
      WHERE id = $1 RETURNING *`,
            [req.params.id, title, concept, current_phase, is_generating, music_mood, full_script, mode]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating project:', err);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// DELETE /api/projects/:id — Delete project + cascade
router.delete('/:id', async (req, res) => {
    try {
        const result = await query('DELETE FROM projects WHERE id = $1 RETURNING id', [req.params.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.json({ deleted: true, id: req.params.id });
    } catch (err) {
        console.error('Error deleting project:', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

export default router;
