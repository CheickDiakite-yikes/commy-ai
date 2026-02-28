import test from 'node:test';
import assert from 'node:assert/strict';
import { AspectRatio, ProjectSettings, Scene, TTSVoice } from '../types';
import { PipelineCancelledError, PipelineLogEntry, runGenerationPipeline } from './generationPipeline';

const baseSettings: ProjectSettings = {
    customScript: '',
    musicTheme: 'Commercial',
    useTextOverlays: 'auto',
    preferredVoice: 'auto',
    aspectRatio: AspectRatio.SixteenNine,
    mode: 'Commercial',
};

const makeScene = (id: string, order: number): Scene => ({
    id,
    order,
    duration: 6,
    character: {
        name: 'Lead',
        description: 'A confident builder',
        hair: 'Short',
        face: 'Focused',
        wardrobe: 'Modern smart casual',
    },
    environment: {
        location: 'NYC',
        look: 'Luxury office',
        lighting: 'Warm cinematic',
        background_motion: 'Pedestrians',
    },
    camera: {
        framing: 'Medium',
        movement: 'Dolly in',
        notes: 'Smooth',
    },
    action_blocking: [{ time_window: '0-6s', notes: 'Walks toward camera' }],
    visual_summary_prompt: 'A cinematic walk through Manhattan.',
    textOverlay: 'Build the future',
    overlayConfig: { position: 'center', size: 'large' },
    status: 'pending',
});

const makePlan = () => ({
    title: 'Campaign',
    concept: 'High energy hackathon ad',
    musicMood: 'upbeat',
    fullScript: 'A short script',
    script: [{ speaker: 'Narrator', text: 'Let us build.' }],
    scenes: [makeScene('s1', 1), makeScene('s2', 2)],
});

const createProjectHarness = () => {
    let projectState: any = null;
    const logs: PipelineLogEntry[] = [];
    return {
        getProject: () => projectState,
        getLogs: () => logs,
        onProjectInitialized: (project: any) => {
            projectState = project;
        },
        onProjectUpdate: (project: any) => {
            projectState = project;
        },
        onLog: (entry: PipelineLogEntry) => {
            logs.push(entry);
        },
    };
};

test('runGenerationPipeline completes successfully and marks scenes complete', async () => {
    const harness = createProjectHarness();
    const plan = makePlan();

    const result = await runGenerationPipeline({
        prompt: 'Create a campaign',
        settings: baseSettings,
        files: [],
        preferredVoice: TTSVoice.Kore,
        onProjectInitialized: harness.onProjectInitialized,
        onProjectUpdate: harness.onProjectUpdate,
        onLog: harness.onLog,
        deps: {
            generateAdPlan: async () => plan,
            generateStoryboardImage: async (scene) => `data:image/png;base64,${scene.id}`,
            generateVideoClip: async (scene) => `blob:${scene.id}.mp4`,
            generateVoiceover: async () => 'blob:voiceover.wav',
            generateMusic: async () => 'blob:music.wav',
        },
    });

    assert.equal(result.issues.length, 0);
    assert.equal(result.project.currentPhase, 'ready');
    assert.equal(result.project.isGenerating, false);
    assert.equal(result.scenes.every(scene => scene.status === 'complete'), true);
    assert.equal(result.voiceoverUrl, 'blob:voiceover.wav');
    assert.equal(result.musicUrl, 'blob:music.wav');

    const finalProject = harness.getProject();
    assert.equal(finalProject.currentPhase, 'ready');
    assert.equal(finalProject.scenes.length, 2);
    assert.ok(harness.getLogs().some(log => log.stage === 'ready' && log.level === 'info'));
});

test('runGenerationPipeline degrades gracefully when video/tts/music fail', async () => {
    const harness = createProjectHarness();
    const plan = makePlan();
    let videoCallCount = 0;

    const result = await runGenerationPipeline({
        prompt: 'Create a campaign',
        settings: baseSettings,
        files: [],
        preferredVoice: TTSVoice.Kore,
        onProjectInitialized: harness.onProjectInitialized,
        onProjectUpdate: harness.onProjectUpdate,
        onLog: harness.onLog,
        deps: {
            generateAdPlan: async () => plan,
            generateStoryboardImage: async () => null,
            generateVideoClip: async () => {
                videoCallCount += 1;
                if (videoCallCount === 1) return 'blob:s1.mp4';
                return null;
            },
            generateVoiceover: async () => {
                throw new Error('tts provider error');
            },
            generateMusic: async () => null,
        },
    });

    assert.equal(result.project.currentPhase, 'ready');
    assert.equal(result.project.isGenerating, false);
    assert.equal(result.scenes[0].status, 'complete');
    assert.equal(result.scenes[1].status, 'failed');
    assert.equal(result.issues.length >= 4, true);
    assert.ok(result.issues.some(issue => issue.stage === 'voiceover'));
    assert.ok(result.issues.some(issue => issue.stage === 'scoring'));
    assert.ok(harness.getLogs().some(log => log.level === 'warn'));
});

test('runGenerationPipeline throws PipelineCancelledError when cancelled', async () => {
    const harness = createProjectHarness();
    const plan = makePlan();
    let cancelled = false;

    await assert.rejects(async () => {
        await runGenerationPipeline({
            prompt: 'Create a campaign',
            settings: baseSettings,
            files: [],
            preferredVoice: TTSVoice.Kore,
            shouldCancel: () => cancelled,
            onProjectInitialized: harness.onProjectInitialized,
            onProjectUpdate: harness.onProjectUpdate,
            onLog: harness.onLog,
            deps: {
                generateAdPlan: async () => plan,
                generateStoryboardImage: async () => {
                    cancelled = true;
                    return null;
                },
                generateVideoClip: async () => 'blob:clip.mp4',
                generateVoiceover: async () => 'blob:voice.wav',
                generateMusic: async () => 'blob:music.wav',
            },
        });
    }, (error: any) => {
        assert.equal(error instanceof PipelineCancelledError, true);
        return true;
    });
});
