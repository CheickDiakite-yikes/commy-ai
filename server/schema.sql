-- Commy AI - Database Schema
-- Run with: /opt/homebrew/opt/postgresql@17/bin/psql -d commy_dev -f server/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  concept TEXT,
  music_mood TEXT,
  full_script TEXT,
  character_profile TEXT,
  visual_style_profile TEXT,
  mode TEXT,
  settings JSONB,
  current_phase TEXT DEFAULT 'planning',
  is_generating BOOLEAN DEFAULT FALSE,
  voiceover_path TEXT,
  music_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_order INT NOT NULL,
  duration INT NOT NULL DEFAULT 4,
  character JSONB,
  environment JSONB,
  camera JSONB,
  action_blocking JSONB,
  visual_summary_prompt TEXT,
  text_overlay TEXT,
  overlay_config JSONB,
  status TEXT DEFAULT 'pending',
  storyboard_path TEXT,
  video_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets table (reference files, visual anchors)
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL,  -- 'voiceover', 'music', 'reference', 'visual_anchor', 'storyboard', 'video'
  file_path TEXT,
  mime_type TEXT,
  original_name TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast project lookups
CREATE INDEX IF NOT EXISTS idx_scenes_project_id ON scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
