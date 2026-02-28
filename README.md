# Commy - AI Creative Director

Commy is a world-class AI creative director and production studio designed for generating high-quality video ads using Gemini, Veo, and Lyria. It acts as an end-to-end pipeline from a user's initial prompt to a final rendered MP4 video ad.

## Product Architecture & Workflow

The core process and workflow of Commy are broken down into a logical pipeline from the user's first prompt to the final MP4 export.

```text
+---------------------------------------------------------------------------------------------------+
|                                      Commy - AI Creative Director                                 |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ Phase 1: Ideation & Structuring ]         [ Phase 2: Asset Generation ]                        |
|  +-------------------------------+           +-------------------------------------------------+  |
|  | 1. Context Gathering          |           | 1. Visuals (Gemini/Veo)                         |  |
|  |    - Brand Assets             |           |    - Generates video clips/images per scene     |  |
|  |    - Visual Anchor            |           |    - Uses Visual Anchor for consistency         |  |
|  |    - Global Parameters        |           |                                                 |  |
|  +---------------+---------------+           | 2. Voiceover (Gemini TTS)                       |  |
|                  |                           |    - Generates spoken audio (WAV/PCM)           |  |
|                  v                           |                                                 |  |
|  +---------------+---------------+           | 3. Music (Lyria)                                |  |
|  | 2. Chat & Concepting          |           |    - Generates continuous background track      |  |
|  |    - Brainstorm with AI Agent |           +-----------------------+-------------------------+  |
|  +---------------+---------------+                                   |                            |
|                  |                                                   |                            |
|                  v                                                   |                            |
|  +---------------+---------------+                                   |                            |
|  | 3. Script & Storyboard        |===================================+                            |
|  |    - JSON-based Project       |                                                                |
|  |    - Discrete Scenes          |                                                                |
|  |      * Visual Prompt          |           [ Phase 3: Assembly & Review ]                       |
|  |      * Voiceover Script       |           +-------------------------------------------------+  |
|  |      * Text Overlay           |           | 1. Timeline Mapping                             |  |
|  |      * Estimated Duration     |           |    - Maps video, audio, and text to timeline    |  |
|  +-------------------------------+           |                                                 |  |
|                                              | 2. Playback/Review                              |  |
|                                              |    - Preview individual scenes                  |  |
|                                              |    - Regenerate specific clips                  |  |
|                                              |    - Rewrite text overlays                      |  |
|                                              +-----------------------+-------------------------+  |
|                                                                      |                            |
|                                                                      v                            |
|                                              [ Phase 4: Stitching & Export ]                      |
|                                              +-------------------------------------------------+  |
|                                              | 1. Visual Processing (FFmpeg WASM)              |  |
|                                              |    - Concatenates video clips                   |  |
|                                              |    - Burns text overlays onto frames            |  |
|                                              |                                                 |  |
|                                              | 2. Audio Mixing                                 |  |
|                                              |    - Voiceover track (100% volume)              |  |
|                                              |    - Lyria background music (~30% volume)       |  |
|                                              |                                                 |  |
|                                              | 3. Final Render                                 |  |
|                                              |    - Muxes audio & video into .mp4              |  |
|                                              +-------------------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

### Phase 1: Ideation & Structuring (The Brain)

*   **Context Gathering:** The user uploads reference files (Brand Assets, Visual Anchor) and sets global parameters (Brand Name, Target Audience, Tone).
*   **Chat & Concepting:** The user chats with the AI agent to brainstorm an ad concept.
*   **Script & Storyboard Generation:** Once a concept is agreed upon, the AI structures it into a JSON-based Project/Storyboard. This breaks the ad down into discrete Scenes. Each scene contains:
    *   A visual prompt (what happens on screen).
    *   A voiceover script (what is said).
    *   Text overlay (captions or hooks to display on screen).
    *   Estimated duration.

### Phase 2: Asset Generation (The Factory)

Once the storyboard is locked in, the app moves into parallel generation mode. The user can generate these all at once or scene-by-scene:

*   **Visuals (Gemini/Veo):** The app takes the visual prompt for each scene (heavily influenced by the uploaded "Visual Anchor" to maintain brand consistency) and generates the video clips or images.
*   **Voiceover (Gemini TTS):** The app takes the script for each scene and generates the spoken audio, returning standard WAV/PCM data.
*   **Music (Lyria):** The app takes the overall tone/mood of the ad and prompts the Lyria API to generate a continuous background music track for the duration of the video.

### Phase 3: Assembly & Review (The Editor)

*   **Timeline Mapping:** The app maps the generated video clips, voiceover audio, and text overlays to a timeline based on the duration of each scene.
*   **Playback/Review:** The user can preview individual scenes in the UI, regenerate a specific video clip if it looks weird, or rewrite a line of text without having to scrap the whole project.

### Phase 4: Stitching & Export (The Renderer)

When the user hits "Export", the app hands everything over to FFmpeg (running locally in the browser via WebAssembly):

*   **Visual Processing:** It concatenates the video clips in order and burns the text overlays directly onto the video frames at the correct timestamps.
*   **Audio Mixing:** It takes the stitched voiceover track (set to 100% volume) and layers the Lyria background music underneath it (ducked to ~30% volume so it doesn't overpower the voice).
*   **Final Render:** It multiplexes (muxes) the mixed audio and the processed video into a single, downloadable `.mp4` file.

## Tech Stack

*   **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
*   **AI Models:**
    *   Google Gemini (Ideation, Scripting, Storyboarding, TTS)
    *   Google Veo (Video Generation)
    *   Google Lyria (Music Generation)
*   **Video Processing:** FFmpeg (WebAssembly via `@ffmpeg/ffmpeg`)
*   **Icons:** Lucide React
