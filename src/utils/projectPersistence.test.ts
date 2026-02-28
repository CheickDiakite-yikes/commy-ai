import test from 'node:test';
import assert from 'node:assert/strict';
import { AdProject } from '../types';
import {
    hasDirectorContent,
    hasPersistentMedia,
    isEphemeralMediaUrl,
    sanitizeProjectMediaForReload,
    shouldReplaceWithBackendSnapshot,
} from './projectPersistence';

const makeProject = (overrides: Partial<AdProject> = {}): AdProject => ({
    title: 'Project',
    concept: 'Concept',
    musicMood: 'Mood',
    fullScript: '',
    scenes: [],
    isGenerating: false,
    currentPhase: 'planning',
    ...overrides,
});

test('isEphemeralMediaUrl detects blob/data URLs', () => {
    assert.equal(isEphemeralMediaUrl('blob:http://localhost:3000/abc'), true);
    assert.equal(isEphemeralMediaUrl('data:image/png;base64,abc'), true);
    assert.equal(isEphemeralMediaUrl('/storage/scenes/scene.png'), false);
    assert.equal(isEphemeralMediaUrl('https://example.com/video.mp4'), false);
});

test('sanitizeProjectMediaForReload clears only ephemeral URLs', () => {
    const input = makeProject({
        voiceoverUrl: 'blob:http://localhost:3000/voice',
        musicUrl: '/storage/assets/music.wav',
        scenes: [
            {
                id: 'scene_01',
                order: 1,
                duration: 6,
                character: { name: 'Lead', description: '', hair: '', face: '', wardrobe: '' },
                environment: { location: '', look: '', lighting: '', background_motion: '' },
                camera: { framing: '', movement: '', notes: '' },
                action_blocking: [],
                visual_summary_prompt: '',
                textOverlay: '',
                status: 'pending',
                storyboardUrl: 'data:image/png;base64,123',
                videoUrl: '/storage/scenes/scene_01.mp4',
            },
        ],
    });

    const { project, clearedCount, retainedCount } = sanitizeProjectMediaForReload(input);
    assert.equal(project.voiceoverUrl, undefined);
    assert.equal(project.musicUrl, '/storage/assets/music.wav');
    assert.equal(project.scenes[0].storyboardUrl, undefined);
    assert.equal(project.scenes[0].videoUrl, '/storage/scenes/scene_01.mp4');
    assert.equal(clearedCount, 2);
    assert.equal(retainedCount, 2);
});

test('hasPersistentMedia returns true when persistent URLs exist', () => {
    assert.equal(hasPersistentMedia(makeProject()), false);
    assert.equal(hasPersistentMedia(makeProject({ voiceoverUrl: '/storage/assets/voice.wav' })), true);
    assert.equal(
        hasPersistentMedia(
            makeProject({
                scenes: [
                    {
                        id: 'scene_01',
                        order: 1,
                        duration: 6,
                        character: { name: 'Lead', description: '', hair: '', face: '', wardrobe: '' },
                        environment: { location: '', look: '', lighting: '', background_motion: '' },
                        camera: { framing: '', movement: '', notes: '' },
                        action_blocking: [],
                        visual_summary_prompt: '',
                        textOverlay: '',
                        status: 'pending',
                        videoUrl: '/storage/scenes/video.mp4',
                    },
                ],
            }),
        ),
        true,
    );
});

test('hasDirectorContent returns true when script or scene details exist', () => {
    assert.equal(hasDirectorContent(makeProject()), false);
    assert.equal(hasDirectorContent(makeProject({ fullScript: 'Narration text.' })), true);
    assert.equal(
        hasDirectorContent(
            makeProject({
                scenes: [
                    {
                        id: 'scene_01',
                        order: 1,
                        duration: 6,
                        character: { name: 'Lead', description: '', hair: '', face: '', wardrobe: '' },
                        environment: { location: '', look: '', lighting: '', background_motion: '' },
                        camera: { framing: '', movement: '', notes: '' },
                        action_blocking: [],
                        visual_summary_prompt: 'A luxury office reveal.',
                        textOverlay: '',
                        status: 'pending',
                    },
                ],
            }),
        ),
        true,
    );
});

test('shouldReplaceWithBackendSnapshot prefers richer backend snapshots', () => {
    const current = makeProject({ currentPhase: 'planning' });
    const loaded = makeProject({
        currentPhase: 'ready',
        fullScript: 'Persisted script',
        scenes: [
            {
                id: 'scene_01',
                order: 1,
                duration: 6,
                character: { name: 'Lead', description: '', hair: '', face: '', wardrobe: '' },
                environment: { location: '', look: '', lighting: '', background_motion: '' },
                camera: { framing: '', movement: '', notes: '' },
                action_blocking: [],
                visual_summary_prompt: 'Scene details',
                textOverlay: '',
                status: 'complete',
                videoUrl: '/storage/scenes/scene_01.mp4',
            },
        ],
    });

    assert.equal(shouldReplaceWithBackendSnapshot(current, loaded), true);

    const currentAlreadyRich = makeProject({
        currentPhase: 'ready',
        fullScript: 'Local script',
        scenes: loaded.scenes,
        voiceoverUrl: '/storage/assets/voice.wav',
    });
    const loadedNotRicher = makeProject({ currentPhase: 'planning' });
    assert.equal(shouldReplaceWithBackendSnapshot(currentAlreadyRich, loadedNotRicher), false);
});
