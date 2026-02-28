import { AdProject, ProjectSettings, ReferenceFile, Scene, TTSVoice } from "../types";
import * as GeminiService from "./geminiService";

export type PipelineLogLevel = "info" | "warn" | "error";
export type PipelineStage = AdProject["currentPhase"];

export interface SerializedPipelineError {
  name?: string;
  message: string;
  stack?: string;
  cause?: string;
}

export interface PipelineLogEntry {
  id: string;
  timestamp: string;
  stage: PipelineStage;
  level: PipelineLogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: SerializedPipelineError;
}

export interface PipelineIssue {
  stage: PipelineStage;
  message: string;
  sceneId?: string;
  recoverable: boolean;
  error?: SerializedPipelineError;
}

export interface GenerationPipelineDependencies {
  generateAdPlan: typeof GeminiService.generateAdPlan;
  generateStoryboardImage: typeof GeminiService.generateStoryboardImage;
  generateVideoClip: typeof GeminiService.generateVideoClip;
  generateVoiceover: typeof GeminiService.generateVoiceover;
  generateMusic: typeof GeminiService.generateMusic;
}

interface NormalizedProviderDiagnostic {
  level: PipelineLogLevel;
  code?: string;
  message: string;
  context?: Record<string, unknown>;
  error?: SerializedPipelineError;
}

interface NormalizedAssetResult {
  url: string | null;
  fallbackUsed: boolean;
  diagnostics: NormalizedProviderDiagnostic[];
}

export interface GenerationPipelineOptions {
  prompt: string;
  settings: ProjectSettings;
  files: ReferenceFile[];
  visualAnchorDataUrl?: string;
  preferredVoice: TTSVoice;
  shouldCancel?: () => boolean;
  deps?: Partial<GenerationPipelineDependencies>;
  onProjectInitialized: (project: AdProject) => void;
  onProjectUpdate: (project: AdProject) => void;
  onLog?: (entry: PipelineLogEntry) => void;
}

export interface GenerationPipelineRunResult {
  plan: any;
  project: AdProject;
  scenes: Scene[];
  voiceoverUrl?: string;
  musicUrl?: string;
  logs: PipelineLogEntry[];
  issues: PipelineIssue[];
}

export class PipelineCancelledError extends Error {
  constructor(message = "Generation cancelled by user.") {
    super(message);
    this.name = "PipelineCancelledError";
  }
}

const defaultDeps: GenerationPipelineDependencies = {
  generateAdPlan: GeminiService.generateAdPlan,
  generateStoryboardImage: GeminiService.generateStoryboardImage,
  generateVideoClip: GeminiService.generateVideoClip,
  generateVoiceover: GeminiService.generateVoiceover,
  generateMusic: GeminiService.generateMusic,
};

let logSeq = 0;

const isSerializedPipelineError = (value: unknown): value is SerializedPipelineError => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "message" in value &&
      typeof (value as SerializedPipelineError).message === "string",
  );
};

const toSerializedError = (error: unknown): SerializedPipelineError => {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "string"
          ? error.cause
          : undefined;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: "Unknown error" };
  }
};

const toPipelineLevel = (level: unknown): PipelineLogLevel => {
  if (level === "error" || level === "warn" || level === "info") return level;
  return "info";
};

const normalizeAssetResult = (value: unknown): NormalizedAssetResult => {
  if (typeof value === "string") {
    return { url: value, fallbackUsed: false, diagnostics: [] };
  }
  if (!value || typeof value !== "object") {
    return { url: null, fallbackUsed: false, diagnostics: [] };
  }

  const maybeResult = value as GeminiService.GeneratedAssetResult;
  const url = typeof maybeResult.url === "string" ? maybeResult.url : null;
  const fallbackUsed = Boolean(maybeResult.fallbackUsed);
  const diagnostics = Array.isArray(maybeResult.diagnostics)
    ? maybeResult.diagnostics.map((entry) => ({
        level: toPipelineLevel(entry.level),
        code: entry.code,
        message: entry.message,
        context: entry.context,
        error: entry.error
          ? isSerializedPipelineError(entry.error)
            ? entry.error
            : toSerializedError(entry.error)
          : undefined,
      }))
    : [];

  return { url, fallbackUsed, diagnostics };
};

const selectPrimaryDiagnostic = (
  diagnostics: NormalizedProviderDiagnostic[],
): NormalizedProviderDiagnostic | undefined =>
  diagnostics.find((entry) => entry.level === "error") ??
  diagnostics.find((entry) => entry.level === "warn");

export const runGenerationPipeline = async (
  options: GenerationPipelineOptions,
): Promise<GenerationPipelineRunResult> => {
  const deps: GenerationPipelineDependencies = { ...defaultDeps, ...options.deps };
  const logs: PipelineLogEntry[] = [];
  const issues: PipelineIssue[] = [];
  let projectState: AdProject | null = null;

  const pushLog = (
    level: PipelineLogLevel,
    stage: PipelineStage,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ) => {
    const entry: PipelineLogEntry = {
      id: `pipeline-log-${Date.now()}-${++logSeq}`,
      timestamp: new Date().toISOString(),
      stage,
      level,
      message,
      context,
      error: error
        ? isSerializedPipelineError(error)
          ? error
          : toSerializedError(error)
        : undefined,
    };
    logs.push(entry);
    options.onLog?.(entry);
    const payload = { stage, message, context, error: entry.error };
    if (level === "error") console.error("[Pipeline]", payload);
    else if (level === "warn") console.warn("[Pipeline]", payload);
    else console.log("[Pipeline]", payload);
  };

  const addIssue = (issue: PipelineIssue) => {
    issues.push(issue);
    pushLog(
      issue.recoverable ? "warn" : "error",
      issue.stage,
      issue.message,
      issue.sceneId ? { sceneId: issue.sceneId } : undefined,
      issue.error,
    );
  };

  const emitProviderDiagnostics = (
    stage: PipelineStage,
    diagnostics: NormalizedProviderDiagnostic[],
    baseContext?: Record<string, unknown>,
  ) => {
    diagnostics.forEach((entry) => {
      const mergedContext =
        baseContext || entry.context ? { ...(baseContext || {}), ...(entry.context || {}) } : undefined;
      const message = entry.code ? `[${entry.code}] ${entry.message}` : entry.message;
      pushLog(entry.level, stage, message, mergedContext, entry.error);
    });
  };

  const updateProject = (nextProject: AdProject) => {
    projectState = nextProject;
    options.onProjectUpdate(nextProject);
  };

  const checkCancelled = (stage: PipelineStage) => {
    if (options.shouldCancel?.()) {
      pushLog("warn", stage, "Generation cancelled.");
      throw new PipelineCancelledError();
    }
  };

  pushLog("info", "planning", "Pipeline started.");
  checkCancelled("planning");

  let plan: any;
  try {
    plan = await deps.generateAdPlan(options.prompt, options.settings, options.files);
  } catch (error) {
    pushLog("error", "planning", "Failed to generate ad plan.", undefined, error);
    throw error;
  }

  checkCancelled("planning");

  const initialProject: AdProject = {
    ...plan,
    isGenerating: true,
    currentPhase: "storyboarding",
    scenes: (plan.scenes || []).map((scene: any) => ({
      ...scene,
      status: "pending",
    })),
    mode: options.settings.mode,
  };
  projectState = initialProject;
  options.onProjectInitialized(initialProject);
  pushLog("info", "storyboarding", "Ad plan generated.", {
    title: initialProject.title,
    sceneCount: initialProject.scenes.length,
  });

  const storyboardedScenes: Scene[] = [];
  for (const scene of initialProject.scenes) {
    checkCancelled("storyboarding");
    pushLog("info", "storyboarding", "Generating storyboard.", {
      sceneId: scene.id,
      order: scene.order,
    });

    try {
      const storyboardResult = normalizeAssetResult(
        await deps.generateStoryboardImage(
          scene,
          options.settings.aspectRatio,
          options.visualAnchorDataUrl,
        ),
      );
      emitProviderDiagnostics("storyboarding", storyboardResult.diagnostics, { sceneId: scene.id });
      const storyboardUrl = storyboardResult.url;
      const failureDiagnostic = selectPrimaryDiagnostic(storyboardResult.diagnostics);
      const nextScene = {
        ...scene,
        storyboardUrl: storyboardUrl || undefined,
      };
      storyboardedScenes.push(nextScene);

      if (!storyboardUrl) {
        addIssue({
          stage: "storyboarding",
          sceneId: scene.id,
          message: failureDiagnostic
            ? `Storyboard generation returned no image. ${failureDiagnostic.message}`
            : "Storyboard generation returned no image. Continuing with fallback flow.",
          recoverable: true,
          error: failureDiagnostic?.error,
        });
      } else {
        pushLog("info", "storyboarding", "Storyboard generated.", {
          sceneId: scene.id,
        });
      }

      if (projectState) {
        updateProject({
          ...projectState,
          scenes: projectState.scenes.map((s) => (s.id === scene.id ? nextScene : s)),
        });
      }
    } catch (error) {
      const serialized = toSerializedError(error);
      addIssue({
        stage: "storyboarding",
        sceneId: scene.id,
        message: "Storyboard generation failed. Continuing without storyboard.",
        recoverable: true,
        error: serialized,
      });

      const nextScene = {
        ...scene,
        storyboardUrl: undefined,
      };
      storyboardedScenes.push(nextScene);
      if (projectState) {
        updateProject({
          ...projectState,
          scenes: projectState.scenes.map((s) => (s.id === scene.id ? nextScene : s)),
        });
      }
    }
  }

  checkCancelled("video_production");
  if (projectState) {
    updateProject({
      ...projectState,
      currentPhase: "video_production",
      scenes: storyboardedScenes,
    });
  }

  const videoScenes: Scene[] = [];
  for (const scene of storyboardedScenes) {
    checkCancelled("video_production");

    if (projectState) {
      updateProject({
        ...projectState,
        scenes: projectState.scenes.map((s) =>
          s.id === scene.id ? { ...s, status: "generating" } : s,
        ),
      });
    }

    pushLog("info", "video_production", "Generating video clip.", {
      sceneId: scene.id,
      hasStoryboard: !!scene.storyboardUrl,
    });

    try {
      const videoResult = normalizeAssetResult(
        await deps.generateVideoClip(
          scene,
          options.settings.aspectRatio,
          scene.storyboardUrl,
        ),
      );
      emitProviderDiagnostics("video_production", videoResult.diagnostics, { sceneId: scene.id });
      const videoUrl = videoResult.url;
      const failureDiagnostic = selectPrimaryDiagnostic(videoResult.diagnostics);
      const nextScene: Scene = {
        ...scene,
        videoUrl: videoUrl || undefined,
        status: videoUrl ? "complete" : "failed",
      };
      videoScenes.push(nextScene);

      if (!videoUrl) {
        addIssue({
          stage: "video_production",
          sceneId: scene.id,
          message: failureDiagnostic
            ? `Video generation returned no output. ${failureDiagnostic.message}`
            : "Video generation returned no output.",
          recoverable: true,
          error: failureDiagnostic?.error,
        });
      } else {
        if (videoResult.fallbackUsed) {
          pushLog("warn", "video_production", "Video generation used a fallback mode.", {
            sceneId: scene.id,
          });
        }
        pushLog("info", "video_production", "Video clip generated.", {
          sceneId: scene.id,
        });
      }

      if (projectState) {
        updateProject({
          ...projectState,
          scenes: projectState.scenes.map((s) => (s.id === scene.id ? nextScene : s)),
        });
      }
    } catch (error) {
      const serialized = toSerializedError(error);
      addIssue({
        stage: "video_production",
        sceneId: scene.id,
        message: "Video generation failed.",
        recoverable: true,
        error: serialized,
      });

      const nextScene: Scene = { ...scene, status: "failed" };
      videoScenes.push(nextScene);
      if (projectState) {
        updateProject({
          ...projectState,
          scenes: projectState.scenes.map((s) => (s.id === scene.id ? nextScene : s)),
        });
      }
    }
  }

  checkCancelled("voiceover");
  if (projectState) {
    updateProject({
      ...projectState,
      currentPhase: "voiceover",
      scenes: videoScenes,
    });
  }

  let voiceoverUrl: string | undefined;
  try {
    const voiceoverResult = normalizeAssetResult(
      await deps.generateVoiceover(plan.fullScript, options.preferredVoice, plan.script),
    );
    emitProviderDiagnostics("voiceover", voiceoverResult.diagnostics);
    const failureDiagnostic = selectPrimaryDiagnostic(voiceoverResult.diagnostics);
    voiceoverUrl = voiceoverResult.url || undefined;
    if (!voiceoverUrl) {
      addIssue({
        stage: "voiceover",
        message: failureDiagnostic
          ? `Voiceover generation returned no audio. ${failureDiagnostic.message}`
          : "Voiceover generation returned no audio.",
        recoverable: true,
        error: failureDiagnostic?.error,
      });
    } else {
      pushLog("info", "voiceover", "Voiceover generated.");
    }
  } catch (error) {
    const serialized = toSerializedError(error);
    addIssue({
      stage: "voiceover",
      message: "Voiceover generation failed.",
      recoverable: true,
      error: serialized,
    });
  }

  checkCancelled("scoring");
  if (projectState) {
    updateProject({
      ...projectState,
      currentPhase: "scoring",
      voiceoverUrl,
    });
  }

  let musicUrl: string | undefined;
  try {
    const musicResult = normalizeAssetResult(
      await deps.generateMusic(plan.musicMood || options.settings.musicTheme),
    );
    emitProviderDiagnostics("scoring", musicResult.diagnostics);
    const failureDiagnostic = selectPrimaryDiagnostic(musicResult.diagnostics);
    musicUrl = musicResult.url || undefined;
    if (!musicUrl) {
      addIssue({
        stage: "scoring",
        message: failureDiagnostic
          ? `Music generation returned no audio. ${failureDiagnostic.message}`
          : "Music generation returned no audio.",
        recoverable: true,
        error: failureDiagnostic?.error,
      });
    } else if (musicResult.fallbackUsed) {
      addIssue({
        stage: "scoring",
        message: failureDiagnostic
          ? `Music generation used fallback track. ${failureDiagnostic.message}`
          : "Music generation used fallback track.",
        recoverable: true,
        error: failureDiagnostic?.error,
      });
    } else {
      pushLog("info", "scoring", "Music generated.");
    }
  } catch (error) {
    const serialized = toSerializedError(error);
    addIssue({
      stage: "scoring",
      message: "Music generation failed.",
      recoverable: true,
      error: serialized,
    });
  }

  if (!projectState) {
    throw new Error("Pipeline state error: project was not initialized.");
  }

  const finalProject: AdProject = {
    ...projectState,
    currentPhase: "ready",
    isGenerating: false,
    scenes: videoScenes,
    voiceoverUrl,
    musicUrl,
  };
  updateProject(finalProject);
  pushLog("info", "ready", "Pipeline completed.", { issueCount: issues.length });

  return {
    plan,
    project: finalProject,
    scenes: videoScenes,
    voiceoverUrl,
    musicUrl,
    logs,
    issues,
  };
};
