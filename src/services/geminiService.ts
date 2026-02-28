import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { AspectRatio, ProjectSettings, ReferenceFile, TTSVoice, AdProject, DialogueLine, ChatAttachment, Scene } from "../types";

// --- AUDIO UTILITIES (PCM to WAV) ---

const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
};

const createWavHeader = (sampleRate: number, numChannels: number, numFrames: number) => {
    const blockAlign = numChannels * 2; // 16-bit = 2 bytes
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    return buffer;
};

const base64ToUint8Array = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

const pcmToWavBlob = (pcmData: Uint8Array, sampleRate: number, channels: number): Blob => {
    // pcmData is Uint8Array of 16-bit little-endian samples
    const numFrames = pcmData.length / (channels * 2);
    const header = createWavHeader(sampleRate, channels, numFrames);
    return new Blob([header, pcmData], { type: 'audio/wav' });
};

// --- DATA URL PARSING ---
const parseDataUrl = (dataUrl: string) => {
    try {
        const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            throw new Error("Invalid Data URL format");
        }
        return {
            mimeType: matches[1],
            base64: matches[2]
        };
    } catch (e) {
        console.error("Data URL Parsing failed", e);
        return null;
    }
};

const toErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
const hasApiKey = () => Boolean(process.env.API_KEY);

const parsePcmMimeType = (mimeType?: string) => {
    if (!mimeType) return null;
    const lowerMime = mimeType.toLowerCase();
    if (!lowerMime.includes('l16') && !lowerMime.includes('pcm')) return null;

    const rateMatch = lowerMime.match(/rate=(\d+)/);
    const channelMatch = lowerMime.match(/channels=(\d+)/);
    return {
        sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
        channels: channelMatch ? Number(channelMatch[1]) : 1,
    };
};


// --- 1. The Creative Director Agent ---

const adPlanSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        concept: { type: Type.STRING },
        musicMood: { type: Type.STRING },
        characterProfile: { type: Type.STRING, description: "Detailed physical description of the main character to be used as a fallback." },
        visualStyleProfile: { type: Type.STRING, description: "Detailed world description." },
        fullScript: { type: Type.STRING },
        script: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    speaker: { type: Type.STRING },
                    text: { type: Type.STRING }
                }
            }
        },
        scenes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING },
                    order: { type: Type.INTEGER },
                    duration: { type: Type.INTEGER },
                    // NEW RICH STRUCTURE
                    character: {
                        type: Type.OBJECT,
                        properties: {
                            name: { type: Type.STRING },
                            description: { type: Type.STRING },
                            hair: { type: Type.STRING },
                            face: { type: Type.STRING },
                            wardrobe: { type: Type.STRING }
                        },
                        required: ["description", "wardrobe"]
                    },
                    environment: {
                        type: Type.OBJECT,
                        properties: {
                            location: { type: Type.STRING },
                            look: { type: Type.STRING },
                            lighting: { type: Type.STRING },
                            background_motion: { type: Type.STRING }
                        },
                        required: ["location", "look", "lighting"]
                    },
                    camera: {
                        type: Type.OBJECT,
                        properties: {
                            framing: { type: Type.STRING },
                            movement: { type: Type.STRING },
                            notes: { type: Type.STRING }
                        },
                        required: ["framing", "movement"]
                    },
                    action_blocking: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                time_window: { type: Type.STRING },
                                notes: { type: Type.STRING }
                            }
                        }
                    },
                    visual_summary_prompt: { type: Type.STRING },

                    textOverlay: { type: Type.STRING },
                    overlayConfig: {
                        type: Type.OBJECT,
                        properties: {
                            position: { type: Type.STRING, enum: ['center', 'top', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'] },
                            size: { type: Type.STRING, enum: ['small', 'medium', 'large', 'xl'] }
                        },
                        required: ["position", "size"]
                    }
                },
                required: ["id", "order", "duration", "character", "environment", "camera", "visual_summary_prompt", "action_blocking"]
            }
        },
        ffmpegCommand: { type: Type.STRING }
    },
    required: ["title", "concept", "scenes", "musicMood", "fullScript"]
};

export const generateAdPlan = async (
    prompt: string,
    settings: ProjectSettings,
    referenceFiles: ReferenceFile[]
): Promise<any> => {
    if (!hasApiKey()) {
        throw new Error("Missing API key. Set GEMINI_API_KEY in .env and restart the app.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = "gemini-3-pro-preview";

    const contentParts: any[] = [];

    let textContext = "REFERENCE MATERIALS:\n";
    let hasLinks = false;

    for (const file of referenceFiles) {
        if (file.type === 'image' || file.type === 'pdf') {
            const base64 = file.content.includes(',') ? file.content.split(',')[1] : file.content;
            const mimeType = file.mimeType || (file.type === 'image' ? 'image/png' : 'application/pdf');
            contentParts.push({ inlineData: { mimeType: mimeType, data: base64 } });
        } else if (file.type === 'link') {
            hasLinks = true;
            textContext += `- YouTube/Web Link: ${file.content}\n`;
        } else {
            textContext += `- File: ${file.name}: ${file.content.substring(0, 500)}...\n`;
        }
    }

    const settingsContext = `
    SETTINGS:
    - Mode: ${settings.mode}
    - Aspect Ratio: ${settings.aspectRatio}
    - Text Overlays: ${settings.useTextOverlays}
    - Custom Script: ${settings.customScript}
    - Music Theme: ${settings.musicTheme}
  `;

    const fullPromptText = `
    ${textContext}
    ${settingsContext}
    USER REQUEST: "${prompt}"

    TASK: Generate a 30-second Video Ad Plan using the "Director's JSON" structure.
    
    INSTRUCTIONS:
    1. **Detailed Breakdowns**: For EVERY scene, you must generate specific details for Camera (Framing/Movement), Character (Wardrobe/Hair), and Environment (Lighting/Look).
    2. **Consistency**: The 'character.description' and 'environment.look' should be somewhat consistent across scenes unless the location changes.
    3. **Action Blocking**: Use the 'action_blocking' array to describe exactly what happens in the 4-6 second clip.
    4. **Visual Summary**: Also provide a 'visual_summary_prompt' which is a single cohesive paragraph summarizing the scene for a text-to-video model.
    
    CONSTRAINTS:
    - Duration: Exactly 30s.
    - Scenes: 4s or 6s each.
    - Script: 60-70 words.
  `;

    contentParts.push({ text: fullPromptText });

    try {
        console.log("[Gemini][Planning] Generating ad plan", {
            model,
            referenceFileCount: referenceFiles.length,
            hasLinks,
            mode: settings.mode,
            aspectRatio: settings.aspectRatio,
        });
        const requestConfig: any = {
            systemInstruction: "You are an elite Film Director. You break down scenes into granular technical components (Lighting, Wardrobe, Camera, Blocking) to ensure perfect production consistency.",
            responseMimeType: "application/json",
            responseSchema: adPlanSchema,
        };

        if (hasLinks) {
            requestConfig.tools = [{ googleSearch: {} }];
        }

        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: contentParts }],
            config: requestConfig
        });
        const parsed = JSON.parse(response.text || "{}");
        console.log("[Gemini][Planning] Ad plan generated", {
            sceneCount: Array.isArray(parsed?.scenes) ? parsed.scenes.length : 0,
            hasMusicMood: Boolean(parsed?.musicMood),
        });
        return parsed;
    } catch (error) {
        console.error("[Gemini][Planning] Ad plan generation failed", {
            model,
            promptPreview: prompt.slice(0, 160),
            error: toErrorMessage(error),
        }, error);
        throw error;
    }
};

// --- 2. Storyboard Generation (UPDATED: Uses Rich Scene Data) ---

export const generateStoryboardImage = async (
    scene: Scene,
    aspectRatio: AspectRatio,
    visualAnchorDataUrl?: string,
): Promise<string | null> => {
    if (!hasApiKey()) {
        console.error("[Gemini][Storyboard] Missing API key.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const aspect = aspectRatio === AspectRatio.SixteenNine ? '16:9' : '9:16';

    const parts: any[] = [];

    // 1. Inject Visual Anchor
    if (visualAnchorDataUrl) {
        const parsed = parseDataUrl(visualAnchorDataUrl);
        if (parsed) {
            parts.push({
                inlineData: { mimeType: parsed.mimeType, data: parsed.base64 }
            });
            parts.push({ text: "REFERENCE IMAGE: Use the subject from this image. Keep their face and body consistent." });
        }
    }

    // 2. Construct the Director's Prompt (The Sandwich)
    const prompt = `
      Create a photorealistic cinematic shot.
      
      [CAMERA]: ${scene.camera?.framing || 'Cinematic framing'}, ${scene.camera?.movement || 'Static'}. ${scene.camera?.notes || ''}
      
      [LIGHTING & ATMOSPHERE]: ${scene.environment?.lighting || 'Natural light'}, ${scene.environment?.look || 'Realistic'}.
      
      [LOCATION]: ${scene.environment?.location || 'Unknown'}.
      
      [SUBJECT]: ${scene.character?.description || 'A person'}. 
      - Hair: ${scene.character?.hair || 'Natural'}
      - Wardrobe: ${scene.character?.wardrobe || 'Casual'}
      - Face: ${scene.character?.face || 'Neutral'}
      
      [ACTION]: ${scene.action_blocking ? scene.action_blocking.map(a => a.notes).join('. ') : 'Static shot'}
      
      [STYLE]: High-end commercial, 8k resolution, highly detailed.
    `;

    parts.push({ text: prompt });

    try {
        console.log("[Gemini][Storyboard] Generating scene image", {
            sceneId: scene.id,
            order: scene.order,
            model: 'gemini-3-pro-image-preview',
            aspect,
            hasVisualAnchor: Boolean(visualAnchorDataUrl),
        });
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                imageConfig: { aspectRatio: aspect, imageSize: "1K" }
            }
        });

        const contentParts = response.candidates?.[0]?.content?.parts || [];
        for (const part of contentParts) {
            if (part.inlineData) {
                console.log("[Gemini][Storyboard] Scene image generated", {
                    sceneId: scene.id,
                    mimeType: part.inlineData.mimeType,
                });
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        console.warn("[Gemini][Storyboard] No image returned for scene", { sceneId: scene.id });
        return null;
    } catch (e) {
        console.error("[Gemini][Storyboard] Storyboard generation failed", {
            sceneId: scene.id,
            error: toErrorMessage(e),
        }, e);
        return null;
    }
};

// --- 3. Veo 3.1 Video Generation ---

const internalGenerateVideo = async (
    ai: GoogleGenAI,
    prompt: string,
    aspect: string,
    attemptLabel: string,
    imageInput?: { base64: string, mimeType: string }
): Promise<string | null> => {
    try {
        console.log("[Veo] Starting video generation attempt", {
            attemptLabel,
            model: 'veo-3.1-fast-generate-preview',
            aspect,
            hasImageInput: Boolean(imageInput),
        });
        let requestPayload: any = {
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: aspect }
        };

        if (imageInput) {
            requestPayload.image = { imageBytes: imageInput.base64, mimeType: imageInput.mimeType };
        }

        let operation = await ai.models.generateVideos(requestPayload);
        let polls = 0;
        while (!operation.done) {
            polls += 1;
            if (polls > 90) {
                console.warn("[Veo] Video generation timed out while polling.", { attemptLabel, polls });
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) {
            console.warn("[Veo] Generation completed without a video URI.", { attemptLabel });
            return null;
        }

        const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
        if (!response.ok) {
            console.error("[Veo] Failed downloading generated video.", {
                attemptLabel,
                status: response.status,
                statusText: response.statusText,
            });
            return null;
        }
        const blob = await response.blob();
        console.log("[Veo] Video generation attempt succeeded.", {
            attemptLabel,
            sizeBytes: blob.size,
        });
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error("[Veo] Video generation attempt failed.", {
            attemptLabel,
            error: toErrorMessage(error),
        }, error);
        return null;
    }
}

export const generateVideoClip = async (
    scene: Scene,
    aspectRatio: AspectRatio,
    sourceImageDataUrl?: string
): Promise<string | null> => {
    if (!hasApiKey()) {
        console.error("[Veo] Missing API key.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const aspect = aspectRatio === AspectRatio.SixteenNine ? '16:9' : '9:16';
    const actionNotes = Array.isArray(scene.action_blocking) ? scene.action_blocking.map(a => a.notes).join('. ') : '';

    // Construct a rich prompt for Veo as well, even if using image input
    const veoPrompt = `
      Cinematic video.
      ${actionNotes || scene.visual_summary_prompt || 'Subject performs action in a cinematic commercial style.'}
      Camera: ${scene.camera?.movement || 'smooth tracking'}.
      Lighting: ${scene.environment?.lighting || 'high-contrast cinematic'}.
    `;

    // ATTEMPT 1: Image-to-Video
    if (sourceImageDataUrl) {
        const parsed = parseDataUrl(sourceImageDataUrl);
        if (parsed) {
            const videoUrl = await internalGenerateVideo(ai, veoPrompt, aspect, `scene-${scene.id}-image2video`, parsed);
            if (videoUrl) return videoUrl;
            console.warn("[Veo] Image-to-video attempt failed, falling back to text-to-video.", { sceneId: scene.id });
        } else {
            console.warn("[Veo] Storyboard image could not be parsed. Falling back to text-to-video.", { sceneId: scene.id });
        }
    }

    // ATTEMPT 2: Text-to-Video (Fallback using the visual summary)
    return await internalGenerateVideo(
        ai,
        `${scene.visual_summary_prompt || veoPrompt} (Cinematic, Photorealistic)`,
        aspect,
        `scene-${scene.id}-text2video`,
        undefined
    );
};

// --- 4. TTS Generation (PCM to WAV) ---

export const generateVoiceover = async (text: string, voice: TTSVoice, dialogue?: DialogueLine[]): Promise<string | null> => {
    if (!hasApiKey()) {
        console.error("[Gemini][TTS] Missing API key.");
        return null;
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    if (!text && (!dialogue || dialogue.length === 0)) return null;

    try {
        let config: any = { responseModalities: [Modality.AUDIO] };
        let promptContent = "";

        if (dialogue && dialogue.length > 0) {
            const uniqueSpeakers = Array.from(new Set(dialogue.map(d => d.speaker)));
            if (uniqueSpeakers.length > 1) {
                const availableVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr', 'Aoede'];
                const speakerVoiceConfigs = uniqueSpeakers.map((speaker, idx) => ({
                    speaker: speaker,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: availableVoices[idx % availableVoices.length] } }
                }));

                config.speechConfig = { multiSpeakerVoiceConfig: { speakerVoiceConfigs: speakerVoiceConfigs } };
                promptContent = dialogue.map(d => `${d.speaker}: ${d.text}`).join('\n');
            } else {
                promptContent = text;
                config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
            }
        } else {
            promptContent = text;
            config.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };
        }

        console.log("[Gemini][TTS] Generating voiceover", {
            model: "gemini-2.5-flash-preview-tts",
            textLength: promptContent.length,
            isMultiSpeaker: Boolean(dialogue && dialogue.length > 0 && new Set(dialogue.map(d => d.speaker)).size > 1),
        });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: promptContent }] }],
            config: config
        });

        const inlineAudio = response.candidates?.[0]?.content?.parts?.find((part: any) => part.inlineData)?.inlineData;
        const base64Audio = inlineAudio?.data;
        if (base64Audio) {
            const rawAudio = base64ToUint8Array(base64Audio);
            const pcmConfig = parsePcmMimeType(inlineAudio?.mimeType);

            if (pcmConfig) {
                const wavBlob = pcmToWavBlob(rawAudio, pcmConfig.sampleRate, pcmConfig.channels);
                console.log("[Gemini][TTS] Voiceover generated (PCM->WAV).", {
                    mimeType: inlineAudio?.mimeType,
                    sampleRate: pcmConfig.sampleRate,
                    channels: pcmConfig.channels,
                    sizeBytes: wavBlob.size,
                });
                return URL.createObjectURL(wavBlob);
            }

            const audioBlob = new Blob([rawAudio], { type: inlineAudio?.mimeType || 'audio/wav' });
            console.log("[Gemini][TTS] Voiceover generated (direct blob).", {
                mimeType: inlineAudio?.mimeType,
                sizeBytes: audioBlob.size,
            });
            return URL.createObjectURL(audioBlob);
        }
        console.warn("[Gemini][TTS] No inline audio payload returned.");
        return null;
    } catch (error) {
        console.error("[Gemini][TTS] Voiceover generation failed.", {
            error: toErrorMessage(error),
        }, error);
        return null;
    }
};

// --- 5. Music Generation (Lyria WebSocket Implementation) ---
const MOOD_TRACKS: Record<string, string> = {
    'upbeat': 'https://cdn.pixabay.com/download/audio/2024/05/20/audio_34b92569de.mp3?filename=uplifting-background-music-for-videos-corporates-presentations-205562.mp3',
    'cinematic': 'https://cdn.pixabay.com/download/audio/2022/10/25/audio_5119a9705a.mp3?filename=cinematic-atmosphere-score-2-21142.mp3',
    'emotional': 'https://cdn.pixabay.com/download/audio/2022/05/05/audio_13b5646142.mp3?filename=emotional-piano-110266.mp3',
    'corporate': 'https://cdn.pixabay.com/download/audio/2024/02/07/audio_4f0b2a7585.mp3?filename=corporate-music-189688.mp3',
    'jazz': 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_5245842187.mp3?filename=smooth-jazz-110757.mp3'
};

const getFallbackMusic = (mood: string) => {
    const lowerMood = mood.toLowerCase();
    if (lowerMood.includes('happy') || lowerMood.includes('upbeat')) return MOOD_TRACKS['upbeat'];
    if (lowerMood.includes('business') || lowerMood.includes('tech')) return MOOD_TRACKS['corporate'];
    if (lowerMood.includes('sad') || lowerMood.includes('emotional')) return MOOD_TRACKS['emotional'];
    if (lowerMood.includes('jazz')) return MOOD_TRACKS['jazz'];
    return MOOD_TRACKS['cinematic'];
}

export const generateMusic = async (moodDescription: string, durationSeconds: number = 30): Promise<string | null> => {
    const triggerFallback = (reason: string) => {
        console.warn(`[Lyria] Falling back to stock music. Reason: ${reason}`);
        return getFallbackMusic(moodDescription);
    };

    if (!hasApiKey()) {
        return triggerFallback("Missing API key");
    }

    return new Promise((resolve) => {
        let hasResolved = false;
        let chunkCount = 0;
        let receivedBytes = 0;
        const safetyTimeout = setTimeout(() => {
            if (!hasResolved) {
                hasResolved = true;
                resolve(triggerFallback("Lyria Timeout"));
            }
        }, (durationSeconds * 1000) + 15000);

        try {
            const apiKey = process.env.API_KEY;
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic?key=${apiKey}`;
            const ws = new WebSocket(wsUrl);
            const chunks: Uint8Array[] = [];
            console.log("[Lyria] Opening realtime music socket.", {
                durationSeconds,
                moodPreview: moodDescription.slice(0, 100),
            });

            ws.onopen = () => {
                // 1. Send Setup
                ws.send(JSON.stringify({
                    setup: { model: 'models/lyria-realtime-exp' }
                }));
                console.log("[Lyria] Socket open, setup sent.");
            };

            ws.onmessage = async (event) => {
                let msg;
                try {
                    if (event.data instanceof Blob) {
                        const text = await event.data.text();
                        msg = JSON.parse(text);
                    } else {
                        msg = JSON.parse(event.data);
                    }
                } catch (parseErr) {
                    console.warn("[Lyria] Failed to parse websocket message.", {
                        error: toErrorMessage(parseErr),
                    });
                    return;
                }

                if (msg.setupComplete) {
                    // 2. Send Config
                    ws.send(JSON.stringify({
                        musicGenerationConfig: {
                            musicGenerationMode: 'QUALITY'
                        }
                    }));

                    // 3. Send Prompts
                    ws.send(JSON.stringify({
                        clientContent: {
                            weightedPrompts: [{ text: moodDescription, weight: 1.0 }]
                        }
                    }));

                    // 4. Send Play
                    ws.send(JSON.stringify({
                        playbackControl: 'PLAY'
                    }));
                    console.log("[Lyria] Setup complete, config/prompts/play sent.");
                } else if (msg.serverContent && msg.serverContent.audioChunks) {
                    for (const chunk of msg.serverContent.audioChunks) {
                        try {
                            const bytes = base64ToUint8Array(chunk.data);
                            chunks.push(bytes);
                            chunkCount += 1;
                            receivedBytes += bytes.length;
                        } catch (chunkErr) {
                            console.warn("[Lyria] Failed to decode audio chunk.", {
                                error: toErrorMessage(chunkErr),
                            });
                        }
                    }
                } else if (msg.warning) {
                    console.warn("[Lyria] Warning:", msg.warning);
                }
            };

            ws.onerror = (err) => {
                console.error("[Lyria] WebSocket error.", err);
                if (!hasResolved) {
                    hasResolved = true;
                    clearTimeout(safetyTimeout);
                    resolve(triggerFallback("WebSocket Error"));
                }
            };

            ws.onclose = (event) => {
                if (!hasResolved) {
                    hasResolved = true;
                    clearTimeout(safetyTimeout);
                    console.log("[Lyria] Socket closed.", {
                        code: event.code,
                        reason: event.reason,
                        wasClean: event.wasClean,
                        chunkCount,
                        receivedBytes,
                    });
                    if (chunks.length === 0) {
                        resolve(triggerFallback("No Data Received"));
                        return;
                    }

                    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                    const combinedPcm = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        combinedPcm.set(chunk, offset);
                        offset += chunk.length;
                    }

                    // Lyria typically outputs 44.1kHz or 48kHz PCM. Assuming 48kHz stereo.
                    const wavBlob = pcmToWavBlob(combinedPcm, 48000, 2);
                    console.log("[Lyria] Music generated.", { sizeBytes: wavBlob.size, chunkCount });
                    resolve(URL.createObjectURL(wavBlob));
                }
            };

            // Stop generation after requested duration
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ playbackControl: 'STOP' }));
                    ws.close();
                }
            }, durationSeconds * 1000);

        } catch (e) {
            if (!hasResolved) {
                hasResolved = true;
                clearTimeout(safetyTimeout);
                resolve(triggerFallback(`Exception: ${e}`));
            }
        }
    });
};

// --- 6. Chat Helper ---
export const sendChatMessage = async (
    history: any[],
    message: string,
    project?: AdProject,
    attachments?: ChatAttachment[]
) => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let parts: any[] = [];
    let hasLinks = false;

    if (attachments && attachments.length > 0) {
        attachments.forEach(att => {
            if (att.type === 'link') {
                hasLinks = true;
                parts.push({ text: `[REFERENCE LINK]: ${att.url} (Use Google Search to analyze this link)` });
            } else {
                parts.push({
                    inlineData: { mimeType: att.mimeType, data: att.base64Data }
                });
            }
        });
    }

    parts.push({ text: message });
    let systemInstruction = "You are a helpful AI Creative Director.";

    const config: any = { systemInstruction: systemInstruction };
    if (hasLinks) config.tools = [{ googleSearch: {} }];

    const chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        history: history,
        config: config
    });

    const result = await chat.sendMessage({ message: parts });
    return result.text;
}
