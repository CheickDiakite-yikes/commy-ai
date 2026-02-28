import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { AdProject, AspectRatio, Scene } from '../types';
import { drawTextOverlayToCanvas } from './canvasUtils';

const createOverlayPng = async (scene: Scene, width: number, height: number): Promise<Uint8Array> => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new Uint8Array();

    ctx.clearRect(0, 0, width, height);

    if (scene.textOverlay) {
        drawTextOverlayToCanvas(ctx, width, height, scene.textOverlay, scene.overlayConfig);
    }

    return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
            if (blob) {
                const buffer = await blob.arrayBuffer();
                resolve(new Uint8Array(buffer));
            } else {
                resolve(new Uint8Array());
            }
        }, 'image/png');
    });
};

export const stitchProject = async (
    project: AdProject,
    aspectRatio: AspectRatio,
    onProgress: (progress: number, message: string) => void
): Promise<string | null> => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
        const p = Math.max(0, Math.min(100, Math.round(progress * 100)));
        onProgress(p, `Rendering video frames... ${p}%`);
    });

    ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
    });

    onProgress(0, 'Loading rendering engine...');
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    const width = aspectRatio === AspectRatio.SixteenNine ? 1280 : 720;
    const height = aspectRatio === AspectRatio.SixteenNine ? 720 : 1280;

    onProgress(5, 'Preparing assets...');

    const inputs: string[] = [];
    let filterComplex = '';
    let videoOutLabels: string[] = [];

    // 1. Process Scenes
    for (let i = 0; i < project.scenes.length; i++) {
        const scene = project.scenes[i];
        if (!scene.videoUrl) continue;

        const vidName = `vid${i}.mp4`;
        const overlayName = `overlay${i}.png`;

        await ffmpeg.writeFile(vidName, await fetchFile(scene.videoUrl));
        inputs.push(`-i`, vidName);
        const vidInputIdx = (inputs.length / 2) - 1;

        const overlayData = await createOverlayPng(scene, width, height);
        await ffmpeg.writeFile(overlayName, overlayData);
        inputs.push(`-i`, overlayName);
        const overlayInputIdx = (inputs.length / 2) - 1;

        filterComplex += `[${vidInputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[vscaled${i}];`;
        filterComplex += `[vscaled${i}][${overlayInputIdx}:v]overlay=0:0[vout${i}];`;
        videoOutLabels.push(`[vout${i}]`);
    }

    if (videoOutLabels.length === 0) {
        throw new Error("No video scenes available to stitch.");
    } else if (videoOutLabels.length === 1) {
        filterComplex += `${videoOutLabels[0]}null[final_v];`;
    } else {
        filterComplex += `${videoOutLabels.join('')}concat=n=${videoOutLabels.length}:v=1:a=0[final_v];`;
    }

    // 2. Process Audio
    let audioOutLabel = '';
    const audioMixInputs: string[] = [];

    if (project.voiceoverUrl) {
        await ffmpeg.writeFile('vo.wav', await fetchFile(project.voiceoverUrl));
        inputs.push(`-i`, 'vo.wav');
        const voIdx = (inputs.length / 2) - 1;
        filterComplex += `[${voIdx}:a]volume=1.0[avo];`;
        audioMixInputs.push(`[avo]`);
    }

    if (project.musicUrl) {
        await ffmpeg.writeFile('music.wav', await fetchFile(project.musicUrl));
        inputs.push(`-i`, 'music.wav');
        const musicIdx = (inputs.length / 2) - 1;
        filterComplex += `[${musicIdx}:a]volume=0.3[amusic];`;
        audioMixInputs.push(`[amusic]`);
    }

    if (audioMixInputs.length > 0) {
        filterComplex += `${audioMixInputs.join('')}amix=inputs=${audioMixInputs.length}:duration=longest[final_a];`;
        audioOutLabel = '[final_a]';
    }

    onProgress(10, 'Stitching video and audio...');

    const args = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[final_v]',
    ];

    if (audioOutLabel) {
        args.push('-map', audioOutLabel);
    }

    args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-shortest',
        'output.mp4'
    );

    await ffmpeg.exec(args);

    onProgress(95, 'Finalizing file...');
    const data = await ffmpeg.readFile('output.mp4');
    const blob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });
    return URL.createObjectURL(blob);
};
