import test from 'node:test';
import assert from 'node:assert/strict';
import { AspectRatio, Scene, TTSVoice } from '../types';
import {
    AssetGenerationResponse,
    GeneratedAssetResult,
    generateMusic,
    generateStoryboardImage,
    generateVideoClip,
    generateVoiceover,
} from './geminiService';

const originalApiKey = process.env.API_KEY;

const makeScene = (): Scene => ({
    id: 'scene-1',
    order: 1,
    duration: 6,
    character: {
        name: 'Lead',
        description: 'A founder pitching on stage',
        hair: 'Short',
        face: 'Focused',
        wardrobe: 'Smart casual',
    },
    environment: {
        location: 'Conference hall',
        look: 'Premium event',
        lighting: 'Neon cinematic',
        background_motion: 'Crowd cheering',
    },
    camera: {
        framing: 'Medium close-up',
        movement: 'Push in',
        notes: 'Smooth stabilizer move',
    },
    action_blocking: [{ time_window: '0-6s', notes: 'Raises hand and points at screen' }],
    visual_summary_prompt: 'Founder raises hand on a bright stage with crowd energy.',
    textOverlay: 'Build fast',
    status: 'pending',
});

const asGeneratedResult = (value: AssetGenerationResponse): GeneratedAssetResult => {
    assert.equal(typeof value, 'object');
    assert.notEqual(value, null);
    return value as GeneratedAssetResult;
};

test.beforeEach(() => {
    delete process.env.API_KEY;
});

test.after(() => {
    if (originalApiKey === undefined) {
        delete process.env.API_KEY;
    } else {
        process.env.API_KEY = originalApiKey;
    }
});

test('generateStoryboardImage returns structured diagnostic when API key is missing', async () => {
    const result = asGeneratedResult(await generateStoryboardImage(makeScene(), AspectRatio.SixteenNine));
    assert.equal(result.url, null);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.operation, 'storyboard');
    assert.ok(result.diagnostics?.some((entry) => entry.code === 'GEMINI_STORYBOARD_MISSING_API_KEY'));
});

test('generateVideoClip returns structured diagnostic when API key is missing', async () => {
    const result = asGeneratedResult(await generateVideoClip(makeScene(), AspectRatio.SixteenNine));
    assert.equal(result.url, null);
    assert.equal(result.provider, 'veo');
    assert.equal(result.operation, 'video');
    assert.ok(result.diagnostics?.some((entry) => entry.code === 'VEO_MISSING_API_KEY'));
});

test('generateVoiceover returns structured diagnostic when API key is missing', async () => {
    const result = asGeneratedResult(await generateVoiceover('hello world', TTSVoice.Kore));
    assert.equal(result.url, null);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.operation, 'voiceover');
    assert.ok(result.diagnostics?.some((entry) => entry.code === 'GEMINI_TTS_MISSING_API_KEY'));
});

test('generateMusic falls back with explicit diagnostic when API key is missing', async () => {
    const result = asGeneratedResult(await generateMusic('upbeat tech anthem', 4));
    assert.equal(result.provider, 'lyria');
    assert.equal(result.operation, 'music');
    assert.equal(result.fallbackUsed, true);
    assert.equal(typeof result.url, 'string');
    assert.ok(result.url?.startsWith('https://'));
    assert.ok(result.diagnostics?.some((entry) => entry.code === 'LYRIA_MISSING_API_KEY'));
});
