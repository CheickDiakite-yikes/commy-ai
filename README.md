# Commy AI

Commy is an AI creative-direction and ad-production studio.

From one prompt, it can produce:
- scene plan and director breakdowns
- storyboards
- generated scene clips
- TTS voiceover
- generated music
- final MP4 mix and download

It is built for fast demo and hackathon iteration with full local integration (frontend + API + PostgreSQL).

---

## Table Of Contents
1. [What This App Does](#what-this-app-does)
2. [System Architecture](#system-architecture)
3. [UI Architecture](#ui-architecture)
4. [Generation Pipeline](#generation-pipeline)
5. [Export And Download Pipeline](#export-and-download-pipeline)
6. [Database Model](#database-model)
7. [API Surface](#api-surface)
8. [Local Development (Full Integration)](#local-development-full-integration)
9. [Environment Variables](#environment-variables)
10. [Scripts](#scripts)
11. [Testing](#testing)
12. [Troubleshooting](#troubleshooting)
13. [Security Notes](#security-notes)
14. [Repository Map](#repository-map)

---

## What This App Does

Commy runs a multi-stage ad-production pipeline:

1. You describe the ad in chat.
2. The AI Creative Director proposes/iterates on concept and script.
3. On generation, Commy produces scene-by-scene assets.
4. Assets are persisted to local backend storage + PostgreSQL metadata.
5. You preview and export a stitched MP4.

The app supports:
- **Final Output** view (video player, progress, download)
- **Director's View** (camera, environment, character, action breakdown per scene)
- **Studio Settings** (mode, aspect ratio, voice, overlays, music, script)
- **Asset panels** (visual anchor + attachments)

---

## System Architecture

```text
                                            INTERNET
       ┌─────────────────────────────────────────────────────────────────────────────┐
       │ Google APIs                                                                │
       │  - Gemini (planning/chat/storyboard/TTS)                                  │
       │  - Veo (video generation)                                                  │
       │  - Lyria (music generation)                                                │
       └─────────────────────────────────────────────────────────────────────────────┘
                              ▲                                  
                              │ direct client-side model calls
                              │ using GEMINI_API_KEY
                              │
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                Browser (React + Vite @ :3000)                             │
│                                                                                             │
│  UI Layer                                                                                   │
│  ┌──────────────┬───────────────────────────────┬──────────────────────┐                    │
│  │ Left Panel   │ Center Panel                  │ Right Panel           │                    │
│  │ Assets       │ Final Output / Director View  │ Studio Settings       │                    │
│  └──────────────┴───────────────────────────────┴──────────────────────┘                    │
│            └──────────────────────┬──────────────────────────────┘                          │
│                                   │                                                         │
│                         Agent Chat + Generation Pipeline                                     │
│                                   │                                                         │
│                            /api + /storage requests                                         │
└───────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                │ (Vite proxy)
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               Express API (server @ :3001)                                 │
│                                                                                             │
│  Routes                                                                                     │
│   - /api/projects    (CRUD + hydrated load)                                                 │
│   - /api/scenes      (scene updates + media upload)                                         │
│   - /api/assets      (project-level assets)                                                 │
│   - /api/health      (health + DB connectivity)                                             │
│   - /storage/*       (static file hosting)                                                  │
│                                                                                             │
│  Storage on disk: ./storage/{scenes,assets}                                                 │
└───────────────────────────────┬─────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                PostgreSQL (commy_dev)                                      │
│  projects / scenes / assets                                                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Runtime split (why two ports)
- Frontend runs on **3000** (Vite dev server).
- API runs on **3001** (Express server).
- Vite proxies `/api` and `/storage` to API, so browser code can call `fetch('/api/...')` from port 3000 without CORS headaches.

---

## UI Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Header: Brand | New Project | Model Badge                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Left Panel (ReferenceManager)                                                               │
│  - Visual Anchor upload                                                                     │
│  - General assets (files/links)                                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Center Panel (ProjectBoard)                                                                 │
│  Tabs: [Final Output] [Director's View]                                                     │
│                                                                                             │
│  Final Output:                                                                              │
│   - Scene playback stack                                                                     │
│   - Overlay rendering                                                                        │
│   - Transport controls                                                                       │
│   - Download button + Download Tracker                                                       │
│                                                                                             │
│  Director's View:                                                                            │
│   - Per-scene visual summary                                                                 │
│   - Camera / Lighting / Character / Action cards                                             │
│   - Pipeline diagnostics log                                                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Right Panel (SettingsPanel)                                                                  │
│  - Mode, aspect ratio, voice, overlays, music, script                                       │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Floating Chat (AgentChat)                                                                    │
│  - Creative iteration + generation triggers                                                   │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Generation Pipeline

### Phase state machine

```text
planning
   │
   ▼
storyboarding
   │
   ▼
video_production
   │
   ├──────────────► voiceover
   │                    │
   └──────────────► scoring
                        │
                        ▼
                     mixing
                        │
                        ▼
                      ready
```

### Detailed flow

```text
User prompt
   │
   ▼
generateAdPlan()
   │  -> structured scenes + script + direction
   ▼
for each scene:
   ├─ generateStoryboardImage()
   └─ generateVideoClip()
   ▼
generateVoiceover()
   ▼
generateMusic()
   ▼
Persist project/scenes/assets via API
   ▼
Project ready for playback + export
```

### Reliability behavior
- Pipeline logs every stage (`info` / `warn` / `error`).
- Recoverable provider failures are logged as issues, not silent failures.
- Refresh persistence uses DB snapshot reconciliation (`projectPersistence` utils).
- Confirmation intents in chat can trigger generation directly (no repeated “ask again” loop).

---

## Export And Download Pipeline

```text
User clicks Download
   │
   ▼
Validate exportability (>= 1 scene has videoUrl)
   │
   ├─ no  -> disable + tracker warning
   │
   └─ yes -> stitchProject()
               │
               ├─ load FFmpeg core (CDN failover + timeout)
               ├─ write scene video inputs
               ├─ render text overlays
               ├─ concat video + mix audio
               └─ output.mp4 blob URL
                    │
                    ▼
                trigger download
```

### Current safeguards
- FFmpeg core CDN failover: `unpkg` -> `jsdelivr`.
- FFmpeg load timeout and render timeout.
- Download Tracker UI status line in Final Output controls.
- Export events are pushed into pipeline diagnostics.
- Fallback clip download attempt when final mix fails.

---

## Database Model

```text
projects (1) ────────────────< (N) scenes
    │
    └────────────────────────< (N) assets
```

### `projects`
- title, concept, mood/script fields
- mode + settings JSON
- current_phase, is_generating
- voiceover_path, music_path
- created_at, updated_at

### `scenes`
- `project_id`, `scene_order`, `duration`
- JSONB fields for character/environment/camera/action_blocking
- `visual_summary_prompt`, `text_overlay`, `overlay_config`
- `status`, `storyboard_path`, `video_path`

### `assets`
- `project_id`, `asset_type`
- `file_path`, `mime_type`, `original_name`
- optional metadata JSONB

Schema file: `server/schema.sql`

---

## API Surface

### Health
- `GET /api/health`

### Projects
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`

### Scenes
- `PUT /api/scenes/:id`
- `POST /api/scenes/:id/storyboard` (multipart)
- `POST /api/scenes/:id/video` (multipart)
- `POST /api/scenes/:id/upload-base64`

### Assets
- `POST /api/assets` (multipart)
- `POST /api/assets/upload-base64`
- `GET /api/assets/:id/file`
- `DELETE /api/assets/:id`

Static files:
- `GET /storage/*`

---

## Local Development (Full Integration)

### Prerequisites
- Node.js 20+
- npm 10+
- PostgreSQL running locally (default port 5432)
- `psql` installed (PATH or Homebrew path)

### 1) Install dependencies

```bash
npm install
```

### 2) Create environment file

```bash
cp .env.example .env
```

Set at least:
- `GEMINI_API_KEY`
- `DATABASE_URL` (recommended explicit credentials)
- optional: `SERVER_PORT`, `VITE_API_PROXY_TARGET`

### 3) Start full stack

```bash
npm run dev
```

`npm run dev` executes `scripts/dev_full_integration.sh`, which:
1. validates `DATABASE_URL`
2. checks DB connectivity
3. auto-creates the target DB if needed
4. applies `server/schema.sql`
5. starts both frontend and API (`npm run dev:all`)

### 4) Open app
- [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

```bash
# required for model calls from frontend
GEMINI_API_KEY=your_real_key

# required for local persistence
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/commy_dev

# optional
SERVER_PORT=3001
VITE_API_PROXY_TARGET=http://127.0.0.1:3001
```

Notes:
- Do not commit real keys.
- `.env` should stay local.

---

## Scripts

```text
npm run dev         -> full integration launcher (db checks + FE + API)
npm run dev:web     -> frontend only (vite)
npm run dev:api     -> backend only (tsx watch)
npm run dev:all     -> run FE + API concurrently
npm run build       -> TypeScript compile + Vite build
npm test            -> tsx tests (services + pipeline)
npm run db:setup    -> apply schema.sql directly with psql
```

---

## Testing

### Unit/integration tests

```bash
npm test
```

Coverage focus includes:
- API client hydration + persistence mapping
- generation pipeline degraded-path behavior
- provider diagnostic propagation
- persistence utilities

### Build check

```bash
npm run build
```

This catches TypeScript and bundle breakages before shipping.

---

## Troubleshooting

### Postgres trust-auth issue (Postgres.app)
If you see:
- `failed to verify "trust" authentication`

Do:
1. restart Postgres.app/service
2. switch to password auth if needed
3. set explicit `DATABASE_URL` credentials in `.env`
4. rerun `npm run dev`

### `password authentication failed`
- verify username/password in `DATABASE_URL`
- test manually with `psql "$DATABASE_URL"`

### Download stuck at render start
- check network access to FFmpeg core CDNs
- app now fails over CDN and reports status in Download Tracker
- if final mix fails and clips exist, fallback clip download is attempted

### Download button disabled
- no scene video clips currently available
- generate at least one scene clip first

### Backend available but media missing after refresh
- check `/api/health`
- check `/storage/*` paths resolve
- inspect Director's View diagnostics and browser console `x-request-id` logs

---

## Security Notes

- Never commit `.env` with production keys.
- Backend logs include request IDs for traceability and avoid raw secret dumps.
- Media uploads are constrained by route limits.
- Database URL is redacted in server startup logs.

---

## Repository Map

```text
.
├── src/
│   ├── App.tsx                         # Main app shell and production workflow UI
│   ├── index.tsx                       # Landing/app entry switch
│   ├── components/
│   │   └── LandingExperience.tsx       # Cinematic landing page
│   ├── services/
│   │   ├── geminiService.ts            # Gemini/Veo/Lyria service calls
│   │   ├── apiClient.ts                # backend persistence client
│   │   └── generationPipeline.ts       # orchestration pipeline + logs/issues
│   ├── utils/
│   │   ├── ffmpegStitcher.ts           # mp4 stitching/rendering
│   │   ├── canvasUtils.ts              # overlay rendering helpers
│   │   └── projectPersistence.ts       # reload reconciliation helpers
│   └── styles/
│       └── theme.css                   # landing + studio theme tokens/overrides
├── server/
│   ├── index.ts                        # Express server/bootstrap
│   ├── schema.sql                      # PostgreSQL schema
│   └── routes/
│       ├── projects.ts
│       ├── scenes.ts
│       └── assets.ts
├── scripts/
│   └── dev_full_integration.sh         # DB bootstrap + full dev start
└── storage/                            # local media files (runtime)
```

---

## Operational Summary

Commy is designed to be demo-fast while preserving real integration behavior:
- real model calls
- real API persistence
- real PostgreSQL state
- real media storage
- real MP4 export path with diagnostics and fallback behavior

If you run `npm run dev` with a valid `.env`, the full local stack should come up and be ready for end-to-end testing.
