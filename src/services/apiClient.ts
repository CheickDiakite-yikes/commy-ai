/**
 * API Client for Commy Backend
 * 
 * Provides a thin wrapper around the Express API with graceful fallback.
 * When the backend is unavailable (e.g., Replit, cloud), the frontend
 * continues to work using localStorage and blob URLs — zero breaking changes.
 */

const API_BASE = 'http://localhost:3001/api';
const STORAGE_BASE = 'http://localhost:3001/storage';

let _backendAvailable: boolean | null = null;

const logApiErrorResponse = async (label: string, response: Response) => {
    let bodyPreview = '';
    try {
        bodyPreview = (await response.clone().text()).slice(0, 300);
    } catch {
        bodyPreview = '<unable to read response body>';
    }
    console.error(`[API Client] ${label} failed`, {
        status: response.status,
        statusText: response.statusText,
        requestId: response.headers.get('x-request-id') || undefined,
        bodyPreview,
    });
};

/**
 * Check if the backend server is reachable.
 * Caches the result after the first check.
 */
export const checkBackendAvailable = async (): Promise<boolean> => {
    if (_backendAvailable !== null) return _backendAvailable;

    try {
        const response = await fetch(`${API_BASE}/health`, {
            signal: AbortSignal.timeout(2000)
        });
        const data = await response.json();
        _backendAvailable = data.status === 'ok';
        console.log(_backendAvailable ? '✅ Backend connected' : '⚠️ Backend unhealthy');
    } catch {
        _backendAvailable = false;
        console.log('ℹ️ Backend not available — using localStorage fallback');
    }

    return _backendAvailable;
};

export const isBackendAvailable = () => _backendAvailable === true;

/**
 * Convert a backend relative path to a full URL 
 */
export const toStorageUrl = (relativePath: string): string => {
    return `${STORAGE_BASE}/${relativePath}`;
};

// ─── Project API ───────────────────────────────────────────────

export const listProjects = async () => {
    const res = await fetch(`${API_BASE}/projects`);
    return res.json();
};

export const getProject = async (id: string) => {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    return res.json();
};

export const createProject = async (projectData: any) => {
    const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
    });
    return res.json();
};

export const updateProject = async (id: string, data: any) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
};

export const deleteProject = async (id: string) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
    return res.json();
};

// ─── Scene API ─────────────────────────────────────────────────

export const updateScene = async (id: string, data: any) => {
    const res = await fetch(`${API_BASE}/scenes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
};

/**
 * Upload a blob URL or data URL as a scene asset (storyboard or video)
 */
export const uploadSceneMedia = async (
    sceneId: string,
    blobOrDataUrl: string,
    type: 'storyboard' | 'video',
    mimeType: string
): Promise<string | null> => {
    if (!isBackendAvailable()) return null;

    try {
        let base64Data: string;

        if (blobOrDataUrl.startsWith('data:')) {
            base64Data = blobOrDataUrl.split(',')[1];
        } else {
            // Convert blob URL to base64
            const response = await fetch(blobOrDataUrl);
            const blob = await response.blob();
            base64Data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.includes(',') ? result.split(',')[1] : result);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        }

        const res = await fetch(`${API_BASE}/scenes/${sceneId}/upload-base64`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: base64Data, type, mimeType }),
        });

        if (!res.ok) {
            await logApiErrorResponse(`uploadSceneMedia:${type}`, res);
            return null;
        }

        const result = await res.json();
        return result[`${type}_url`] ? `${STORAGE_BASE.replace('/storage', '')}${result[`${type}_url`]}` : null;
    } catch (err) {
        console.error(`Failed to upload ${type} for scene ${sceneId}:`, err);
        return null;
    }
};

// ─── Asset API ─────────────────────────────────────────────────

/**
 * Upload a blob URL as a project-level asset (voiceover or music)
 */
export const uploadProjectAsset = async (
    projectId: string,
    blobUrl: string,
    assetType: 'voiceover' | 'music',
    mimeType: string
): Promise<string | null> => {
    if (!isBackendAvailable()) return null;

    try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        const base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.includes(',') ? result.split(',')[1] : result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        const res = await fetch(`${API_BASE}/assets/upload-base64`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                asset_type: assetType,
                data: base64Data,
                mimeType,
            }),
        });

        if (!res.ok) {
            await logApiErrorResponse(`uploadProjectAsset:${assetType}`, res);
            return null;
        }

        const result = await res.json();
        return result.file_url ? `${STORAGE_BASE.replace('/storage', '')}${result.file_url}` : null;
    } catch (err) {
        console.error(`Failed to upload ${assetType} asset:`, err);
        return null;
    }
};

/**
 * Save the entire project state to the backend.
 * Called after generation phases complete.
 */
export const saveProjectState = async (project: any, settings?: any): Promise<string | null> => {
    if (!isBackendAvailable()) return null;

    try {
        // Create or update
        const projectData = {
            title: project.title,
            concept: project.concept,
            music_mood: project.musicMood,
            full_script: project.fullScript,
            character_profile: project.characterProfile,
            visual_style_profile: project.visualStyleProfile,
            mode: project.mode,
            settings,
            scenes: project.scenes?.map((s: any) => ({
                order: s.order,
                duration: s.duration,
                character: s.character,
                environment: s.environment,
                camera: s.camera,
                action_blocking: s.action_blocking,
                visual_summary_prompt: s.visual_summary_prompt,
                textOverlay: s.textOverlay,
                overlayConfig: s.overlayConfig,
                status: s.status,
            })),
        };

        const result = await createProject(projectData);
        if (result?.error) {
            console.error('Failed to save project to database:', result.error);
            return null;
        }
        console.log('💾 Project saved to database:', result.id);
        return result.id;
    } catch (err) {
        console.error('Failed to save project to database:', err);
        return null;
    }
};

/**
 * Load the most recent project from the backend.
 */
export const loadLatestProject = async (): Promise<any | null> => {
    if (!isBackendAvailable()) return null;

    try {
        const projects = await listProjects();
        if (!projects || projects.length === 0) return null;

        const latest = await getProject(projects[0].id);

        // Transform DB format back to frontend format
        return {
            _dbId: latest.id,
            title: latest.title,
            concept: latest.concept,
            musicMood: latest.music_mood,
            fullScript: latest.full_script,
            characterProfile: latest.character_profile,
            visualStyleProfile: latest.visual_style_profile,
            mode: latest.mode,
            currentPhase: latest.current_phase,
            isGenerating: latest.is_generating,
            voiceoverUrl: latest.voiceover_path ? toStorageUrl(latest.voiceover_path) : undefined,
            musicUrl: latest.music_path ? toStorageUrl(latest.music_path) : undefined,
            scenes: (latest.scenes || []).map((s: any) => ({
                id: s.id,
                order: s.scene_order,
                duration: s.duration,
                character: s.character,
                environment: s.environment,
                camera: s.camera,
                action_blocking: s.action_blocking,
                visual_summary_prompt: s.visual_summary_prompt,
                textOverlay: s.text_overlay,
                overlayConfig: s.overlay_config,
                status: s.status,
                storyboardUrl: s.storyboard_path ? toStorageUrl(s.storyboard_path) : undefined,
                videoUrl: s.video_path ? toStorageUrl(s.video_path) : undefined,
            })),
        };
    } catch (err) {
        console.error('Failed to load project from database:', err);
        return null;
    }
};
