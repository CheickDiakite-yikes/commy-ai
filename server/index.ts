import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import pool from './db.js';
import projectsRouter from './routes/projects.js';
import scenesRouter from './routes/scenes.js';
import assetsRouter from './routes/assets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
}));
app.use(express.json({ limit: '100mb' }));

app.use((req, res, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    res.locals.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    console.log(`[API][${requestId}] -> ${req.method} ${req.originalUrl}`);
    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        console.log(`[API][${requestId}] <- ${req.method} ${req.originalUrl} ${res.statusCode} (${durationMs}ms)`);
    });
    next();
});

// Serve uploaded media files
const storagePath = path.resolve(__dirname, '..', 'storage');
app.use('/storage', express.static(storagePath));

// API Routes
app.use('/api/projects', projectsRouter);
app.use('/api/scenes', scenesRouter);
app.use('/api/assets', assetsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = res.locals.requestId || 'unknown';
    console.error(`[API][${requestId}] Unhandled server error`, err);
    if (res.headersSent) return;
    res.status(500).json({
        error: 'Internal server error',
        requestId,
    });
});

// Health check
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', database: 'disconnected' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Commy API server running on http://localhost:${PORT}`);
    console.log(`📁 Storage directory: ${storagePath}`);
    console.log(`💾 Database: ${process.env.DATABASE_URL || 'postgresql://localhost:5432/commy_dev'}\n`);
});
