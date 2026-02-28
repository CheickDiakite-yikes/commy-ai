import test from 'node:test';
import assert from 'node:assert/strict';
import {
    checkBackendAvailable,
    loadLatestProject,
    resetBackendAvailabilityForTests,
    saveProjectState,
} from './apiClient';

const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as any).window;

const setMockWindow = () => {
    (globalThis as any).window = {
        location: {
            origin: 'http://localhost:3000',
        },
    };
};

const jsonResponse = (payload: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        ...init,
    });

test.beforeEach(() => {
    setMockWindow();
    resetBackendAvailabilityForTests();
});

test.afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as any).window = originalWindow;
});

test('saveProjectState returns project id and scene DB id map keyed by scene order', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/health')) {
            return jsonResponse({ status: 'ok' });
        }
        if (url.endsWith('/api/projects') && (!init?.method || init.method === 'POST')) {
            return jsonResponse({
                id: 'project-db-id',
                scenes: [
                    { id: 'scene-db-1', scene_order: 1 },
                    { id: 'scene-db-2', scene_order: 2 },
                    { id: 'ignored-scene', scene_order: 'bad-order' },
                ],
            });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
    }) as typeof fetch;

    const available = await checkBackendAvailable();
    assert.equal(available, true);

    const result = await saveProjectState({
        title: 'Campaign',
        concept: 'Concept',
        musicMood: 'Upbeat',
        fullScript: 'Narration',
        scenes: [
            { order: 1, duration: 6, status: 'pending' },
            { order: 2, duration: 6, status: 'pending' },
        ],
    });

    assert.deepEqual(result, {
        projectId: 'project-db-id',
        sceneDbIdsByOrder: {
            1: 'scene-db-1',
            2: 'scene-db-2',
        },
    });
});

test('loadLatestProject hydrates storage paths to absolute URLs', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/health')) {
            return jsonResponse({ status: 'ok' });
        }
        if (url.endsWith('/api/projects')) {
            return jsonResponse([{ id: 'latest-project' }]);
        }
        if (url.endsWith('/api/projects/latest-project')) {
            return jsonResponse({
                id: 'latest-project',
                title: 'Hydrated Project',
                concept: 'Concept',
                music_mood: 'Mood',
                full_script: 'Persisted script',
                character_profile: 'Character profile',
                visual_style_profile: 'Style profile',
                mode: 'Commercial',
                current_phase: 'ready',
                is_generating: false,
                voiceover_path: 'assets/voice.wav',
                music_path: 'assets/music.wav',
                scenes: [
                    {
                        id: 'scene-db-1',
                        scene_order: 1,
                        duration: 6,
                        character: { name: 'Lead' },
                        environment: { location: 'NYC' },
                        camera: { framing: 'Wide' },
                        action_blocking: [],
                        visual_summary_prompt: 'Scene prompt',
                        text_overlay: 'Overlay',
                        overlay_config: { position: 'center' },
                        status: 'complete',
                        storyboard_path: 'scenes/storyboard.png',
                        video_path: 'scenes/video.mp4',
                    },
                ],
            });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
    }) as typeof fetch;

    const available = await checkBackendAvailable();
    assert.equal(available, true);

    const loaded = await loadLatestProject();
    assert.equal(loaded?._dbId, 'latest-project');
    assert.equal(loaded?.voiceoverUrl, 'http://localhost:3000/storage/assets/voice.wav');
    assert.equal(loaded?.musicUrl, 'http://localhost:3000/storage/assets/music.wav');
    assert.equal(loaded?.fullScript, 'Persisted script');
    assert.equal(loaded?.scenes?.length, 1);
    assert.equal(loaded?.scenes?.[0]?.storyboardUrl, 'http://localhost:3000/storage/scenes/storyboard.png');
    assert.equal(loaded?.scenes?.[0]?.videoUrl, 'http://localhost:3000/storage/scenes/video.mp4');
    assert.equal(loaded?.scenes?.[0]?.order, 1);
});
