import { AdProject } from '../types';

export const isEphemeralMediaUrl = (url?: string): boolean =>
    Boolean(url && (url.startsWith('blob:') || url.startsWith('data:')));

export const sanitizeProjectMediaForReload = (project: any): { project: any; clearedCount: number; retainedCount: number } => {
    let clearedCount = 0;
    let retainedCount = 0;

    const keepPersistentUrl = (url?: string): string | undefined => {
        if (!url) return undefined;
        if (isEphemeralMediaUrl(url)) {
            clearedCount += 1;
            return undefined;
        }
        retainedCount += 1;
        return url;
    };

    const safeScenes = Array.isArray(project?.scenes) ? project.scenes : [];
    const sanitizedScenes = safeScenes.map((scene: any) => ({
        ...scene,
        videoUrl: keepPersistentUrl(scene?.videoUrl),
        storyboardUrl: keepPersistentUrl(scene?.storyboardUrl),
    }));

    return {
        project: {
            ...project,
            scenes: sanitizedScenes,
            voiceoverUrl: keepPersistentUrl(project?.voiceoverUrl),
            musicUrl: keepPersistentUrl(project?.musicUrl),
        },
        clearedCount,
        retainedCount,
    };
};

export const hasPersistentMedia = (project: Partial<AdProject> | null | undefined): boolean => {
    if (!project) return false;
    if (project.voiceoverUrl && !isEphemeralMediaUrl(project.voiceoverUrl)) return true;
    if (project.musicUrl && !isEphemeralMediaUrl(project.musicUrl)) return true;
    return Array.isArray(project.scenes) && project.scenes.some(
        (scene) =>
            (scene.storyboardUrl && !isEphemeralMediaUrl(scene.storyboardUrl))
            || (scene.videoUrl && !isEphemeralMediaUrl(scene.videoUrl))
    );
};

export const hasDirectorContent = (project: Partial<AdProject> | null | undefined): boolean => {
    if (!project) return false;
    if (typeof project.fullScript === 'string' && project.fullScript.trim().length > 0) return true;
    return Array.isArray(project.scenes) && project.scenes.some((scene) =>
        Boolean(
            scene.visual_summary_prompt
            || scene.textOverlay
            || scene.character
            || scene.environment
            || scene.camera
        )
    );
};

export const shouldReplaceWithBackendSnapshot = (
    currentProject: Partial<AdProject>,
    loadedProject: Partial<AdProject>,
): boolean => {
    const currentHasPersistentMedia = hasPersistentMedia(currentProject);
    const loadedHasPersistentMedia = hasPersistentMedia(loadedProject);
    const currentHasDirectorData = hasDirectorContent(currentProject);
    const loadedHasDirectorData = hasDirectorContent(loadedProject);
    return (loadedHasPersistentMedia && !currentHasPersistentMedia)
        || (loadedHasDirectorData && !currentHasDirectorData)
        || (loadedProject.currentPhase === 'ready' && currentProject.currentPhase !== 'ready');
};
