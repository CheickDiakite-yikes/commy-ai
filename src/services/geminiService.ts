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

// --- HELPER: FETCH BLOB AND CONVERT TO BASE64 ---
const urlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
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
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Ad Plan Generation Failed:", error);
    throw error;
  }
};

// --- 2. Storyboard Generation (UPDATED: Uses Rich Scene Data) ---

export const generateStoryboardImage = async (
    scene: Scene,
    aspectRatio: AspectRatio,
    visualAnchorDataUrl?: string,
): Promise<string | null> => {
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
      
      [CAMERA]: ${scene.camera.framing}, ${scene.camera.movement}. ${scene.camera.notes}
      
      [LIGHTING & ATMOSPHERE]: ${scene.environment.lighting}, ${scene.environment.look}.
      
      [LOCATION]: ${scene.environment.location}.
      
      [SUBJECT]: ${scene.character.description}. 
      - Hair: ${scene.character.hair}
      - Wardrobe: ${scene.character.wardrobe}
      - Face: ${scene.character.face}
      
      [ACTION]: ${scene.action_blocking.map(a => a.notes).join('. ')}
      
      [STYLE]: High-end commercial, 8k resolution, highly detailed.
    `;
    
    parts.push({ text: prompt });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: { parts },
            config: {
                imageConfig: { aspectRatio: aspect, imageSize: "1K" }
            }
        });

        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    } catch (e) {
        console.error("Storyboard Image Generation Failed:", e);
        return null;
    }
};

// --- 3. Veo 3.1 Video Generation ---

const internalGenerateVideo = async (
    ai: GoogleGenAI,
    prompt: string,
    aspect: string,
    imageInput?: { base64: string, mimeType: string }
): Promise<string | null> => {
    try {
        let requestPayload: any = {
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt, 
            config: { numberOfVideos: 1, resolution: '720p', aspectRatio: aspect }
        };

        if (imageInput) {
            requestPayload.image = { imageBytes: imageInput.base64, mimeType: imageInput.mimeType };
        }

        let operation = await ai.models.generateVideos(requestPayload);
        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) return null;

        const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
    } catch (error) {
        return null;
    }
}

export const generateVideoClip = async (
  scene: Scene,
  aspectRatio: AspectRatio,
  sourceImageDataUrl?: string
): Promise<string | null> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const aspect = aspectRatio === AspectRatio.SixteenNine ? '16:9' : '9:16';
    
    // Construct a rich prompt for Veo as well, even if using image input
    const veoPrompt = `
      Cinematic video.
      ${scene.action_blocking.map(a => a.notes).join('. ')}
      Camera: ${scene.camera.movement}.
      Lighting: ${scene.environment.lighting}.
    `;

    // ATTEMPT 1: Image-to-Video
    if (sourceImageDataUrl) {
        const parsed = parseDataUrl(sourceImageDataUrl);
        if (parsed) {
            const videoUrl = await internalGenerateVideo(ai, veoPrompt, aspect, parsed);
            if (videoUrl) return videoUrl;
        }
    }

    // ATTEMPT 2: Text-to-Video (Fallback using the visual summary)
    return await internalGenerateVideo(ai, scene.visual_summary_prompt + " (Cinematic, Photorealistic)", aspect, undefined);
};

// --- 4. TTS Generation (PCM to WAV) ---

export const generateVoiceover = async (text: string, voice: TTSVoice, dialogue?: DialogueLine[]): Promise<string | null> => {
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

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: promptContent }] }],
        config: config
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
        const pcmData = base64ToUint8Array(base64Audio);
        const wavBlob = pcmToWavBlob(pcmData, 24000, 1);
        return URL.createObjectURL(wavBlob);
    }
    return null;
  } catch (error) {
      console.error("TTS Error", error);
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
        console.warn(`Falling back to stock music. Reason: ${reason}`);
        return getFallbackMusic(moodDescription);
    };

    return new Promise((resolve) => {
        let hasResolved = false;
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

            ws.onopen = () => {
                // 1. Send Setup
                ws.send(JSON.stringify({
                    setup: { model: 'models/lyria-realtime-exp' }
                }));
            };

            ws.onmessage = async (event) => {
                let msg;
                if (event.data instanceof Blob) {
                    const text = await event.data.text();
                    msg = JSON.parse(text);
                } else {
                    msg = JSON.parse(event.data);
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
                } else if (msg.serverContent && msg.serverContent.audioChunks) {
                    for (const chunk of msg.serverContent.audioChunks) {
                        chunks.push(base64ToUint8Array(chunk.data));
                    }
                } else if (msg.warning) {
                    console.warn("Lyria Warning:", msg.warning);
                }
            };

            ws.onerror = (err) => {
                console.error("Lyria WS Error:", err);
                if (!hasResolved) { 
                    hasResolved = true; 
                    clearTimeout(safetyTimeout); 
                    resolve(triggerFallback("WebSocket Error")); 
                }
            };

            ws.onclose = () => {
                if (!hasResolved) {
                    hasResolved = true;
                    clearTimeout(safetyTimeout);
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
    if (hasLinks) config.tools = [{googleSearch: {}}];

    const chat = ai.chats.create({
        model: 'gemini-3-pro-preview', 
        history: history,
        config: config
    });
    
    const result = await chat.sendMessage({ message: parts });
    return result.text;
}
