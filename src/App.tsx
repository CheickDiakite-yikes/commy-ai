import React, { useState, useEffect, useRef } from 'react';
import { AdProject, AspectRatio, ChatMessage, ProjectSettings, ReferenceFile, TTSVoice, OverlayConfig, ProjectMode, ChatAttachment, Scene } from './types';
import * as GeminiService from './services/geminiService';
import { ArrowUpCircle, Film, Layers, Settings, FileText, Music, Mic, X, Plus, Play, Download, MessageSquare, Loader2, Pause, CheckCircle2, Menu, ImagePlus, User, Eye, Sparkles, Paperclip, FileImage, FileVideo, Link as LinkIcon, Youtube, Image as ImageIcon, VenetianMask, Palette, Video, Camera, Shirt, Sun, ChevronDown, ChevronUp } from 'lucide-react';
import { stitchProject } from './utils/ffmpegStitcher';

// --- Reference Manager (Left Panel) ---
const ReferenceManager: React.FC<{
  files: ReferenceFile[];
  setFiles: React.Dispatch<React.SetStateAction<ReferenceFile[]>>;
  visualAnchor: ReferenceFile | null;
  setVisualAnchor: React.Dispatch<React.SetStateAction<ReferenceFile | null>>;
}> = ({ files, setFiles, visualAnchor, setVisualAnchor }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const anchorInputRef = useRef<HTMLInputElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isAnchor: boolean = false) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        const mimeType = result.match(/^data:(.+);base64/)?.[1];
        
        const newFile: ReferenceFile = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type.includes('image') ? 'image' : file.type.includes('pdf') ? 'pdf' : 'text',
          content: result, 
          previewUrl: file.type.includes('image') ? URL.createObjectURL(file) : undefined,
          mimeType: mimeType 
        };
        if (isAnchor) {
            setVisualAnchor(newFile);
        } else {
            setFiles(prev => [...prev, newFile]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addLink = () => {
    if (!linkUrl.trim()) return;
    const newFile: ReferenceFile = {
        id: Date.now().toString(),
        name: linkUrl,
        type: 'link',
        content: linkUrl
    };
    setFiles(prev => [...prev, newFile]);
    setLinkUrl('');
    setShowLinkInput(false);
  };

  return (
    <div className="h-full flex flex-col p-6 space-y-8">
      {/* Visual Anchor Section */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <User size={14} /> Visual Anchor
            </h2>
             {visualAnchor && (
                <button 
                  onClick={() => setVisualAnchor(null)}
                  className="text-xs text-red-400 hover:text-red-500 font-bold"
                >
                  Clear
                </button>
            )}
        </div>
        
        <div 
            onClick={() => anchorInputRef.current?.click()}
            className={`
                relative h-40 rounded-2xl border-2 border-dashed transition-all cursor-pointer overflow-hidden group
                ${visualAnchor 
                    ? 'border-pink-500 bg-pink-50' 
                    : 'border-slate-300 hover:border-pink-400 hover:bg-white/50 bg-slate-50'}
            `}
        >
            <input type="file" ref={anchorInputRef} className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, true)} />
            
            {visualAnchor ? (
                <>
                    <img src={visualAnchor.previewUrl || visualAnchor.content} alt="Anchor" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white font-bold text-sm">Change Anchor</span>
                    </div>
                </>
            ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <ImagePlus size={32} />
                    <span className="text-xs font-bold text-center px-4">Upload Character or<br/>Product Reference</span>
                </div>
            )}
        </div>
        <p className="text-[10px] text-slate-400 leading-tight">
            This image will be used as a strict visual reference for <strong>every</strong> generated scene to ensure consistency.
        </p>
      </div>

      <hr className="border-slate-200" />

      {/* General Assets Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-display font-bold text-slate-800">Assets</h2>
            <div className="flex gap-2">
                <button 
                    onClick={() => setShowLinkInput(!showLinkInput)}
                    className="p-2 bg-slate-100 text-slate-600 rounded-full hover:bg-pink-100 hover:text-pink-600 transition-colors shadow-sm"
                    title="Add Link"
                >
                    <LinkIcon size={20} />
                </button>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 bg-slate-900 text-white rounded-full hover:bg-pink-500 transition-colors shadow-lg"
                    title="Upload File"
                >
                    <Plus size={20} />
                </button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*,application/pdf,text/plain" onChange={(e) => handleFileUpload(e, false)} />
        </div>
        
        {/* Link Input Drawer */}
        {showLinkInput && (
            <div className="mb-4 bg-white p-2 rounded-xl border border-pink-200 shadow-sm flex gap-2 animate-in slide-in-from-top-2">
                <input 
                    type="text" 
                    placeholder="Paste YouTube or Web URL..." 
                    className="flex-1 text-sm outline-none px-2"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addLink()}
                />
                <button onClick={addLink} className="bg-pink-500 text-white px-3 py-1 rounded-lg text-xs font-bold">Add</button>
            </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {files.length === 0 && (
                <div className="text-slate-400 text-sm text-center mt-10 italic">No general assets uploaded.</div>
            )}
            {files.map(file => (
            <div key={file.id} className="memphis-card p-3 rounded-xl relative group">
                <button 
                onClick={() => setFiles(prev => prev.filter(f => f.id !== file.id))}
                className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                <X size={12} />
                </button>
                <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200">
                    {file.type === 'image' && (file.previewUrl || file.content) ? <img src={file.previewUrl || file.content} alt={file.name} className="w-full h-full object-cover" /> : 
                     file.type === 'link' ? <Youtube className="text-red-500" /> : <FileText className="text-slate-400" />}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                    <p className="text-xs text-slate-500 uppercase">{file.type}</p>
                </div>
                </div>
            </div>
            ))}
        </div>
      </div>
    </div>
  );
};

const SettingsPanel: React.FC<{
  settings: ProjectSettings;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}> = ({ settings, setSettings }) => {
  return (
    <div className="h-full flex flex-col p-6 space-y-8 overflow-y-auto">
      <h2 className="text-2xl font-display font-bold text-slate-800">Studio Settings</h2>
      
      {/* Project Mode Selector */}
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Sparkles size={14} /> Project Mode</label>
        <div className="grid grid-cols-2 gap-2">
            {['Commercial', 'Music Video', 'Trippy', 'Cinematic'].map((mode) => (
                <button
                    key={mode}
                    onClick={() => setSettings(prev => ({ ...prev, mode: mode as ProjectMode }))}
                    className={`p-2 text-xs font-bold rounded-lg border-2 transition-all ${settings.mode === mode ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-100 text-slate-500 hover:border-slate-300'}`}
                >
                    {mode}
                </button>
            ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Aspect Ratio</label>
        <div className="grid grid-cols-2 gap-3">
          {(Object.values(AspectRatio) as AspectRatio[]).map(ratio => (
            <button
              key={ratio}
              onClick={() => setSettings(prev => ({ ...prev, aspectRatio: ratio }))}
              className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${settings.aspectRatio === ratio ? 'border-pink-500 bg-pink-50 text-pink-600 shadow-[2px_2px_0px_0px_rgba(236,72,153,1)]' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Mic size={14} /> Voice</label>
        <select 
          className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white/50 focus:border-pink-500 outline-none"
          value={settings.preferredVoice}
          onChange={(e) => setSettings(prev => ({ ...prev, preferredVoice: e.target.value as TTSVoice | 'auto' }))}
        >
          <option value="auto">Let AI Decide</option>
          {Object.values(TTSVoice).map(voice => <option key={voice} value={voice}>{voice}</option>)}
        </select>
      </div>
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Layers size={14} /> Text Overlays</label>
        <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
            {['yes', 'auto', 'no'].map((opt) => (
                 <button key={opt} onClick={() => setSettings(prev => ({ ...prev, useTextOverlays: opt as any }))} className={`flex-1 py-2 text-xs font-bold rounded-md capitalize ${settings.useTextOverlays === opt ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>{opt}</button>
            ))}
        </div>
        {settings.useTextOverlays !== 'no' && (
            <input type="text" placeholder="Preferred Font (Optional)" className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white/50 text-sm" value={settings.textOverlayFont || ''} onChange={(e) => setSettings(prev => ({...prev, textOverlayFont: e.target.value}))} />
        )}
      </div>
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><Music size={14} /> Music Theme</label>
        <input type="text" placeholder="e.g., Upbeat..." className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white/50 text-sm" value={settings.musicTheme} onChange={(e) => setSettings(prev => ({...prev, musicTheme: e.target.value}))} />
      </div>
      <div className="space-y-3">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2"><FileText size={14} /> Custom Script</label>
        <textarea placeholder="Enter lines..." className="w-full p-3 rounded-xl border-2 border-slate-200 bg-white/50 text-sm h-32 resize-none" value={settings.customScript} onChange={(e) => setSettings(prev => ({...prev, customScript: e.target.value}))} />
      </div>
    </div>
  );
};
const getOverlayClasses = (config?: OverlayConfig) => {
    const pos = config?.position || 'center';
    const size = config?.size || 'large';
    let containerClasses = "absolute inset-0 pointer-events-none flex p-8 md:p-16 z-20 transition-all duration-500";
    let textClasses = "font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] leading-tight";
    switch(pos) {
        case 'top-left': containerClasses += " items-start justify-start text-left"; break;
        case 'top-right': containerClasses += " items-start justify-end text-right"; break;
        case 'bottom-left': containerClasses += " items-end justify-start text-left"; break;
        case 'bottom-right': containerClasses += " items-end justify-end text-right"; break;
        case 'top': containerClasses += " items-start justify-center text-center"; break;
        case 'bottom': containerClasses += " items-end justify-center text-center"; break;
        case 'center': default: containerClasses += " items-center justify-center text-center"; break;
    }
    switch(size) {
        case 'small': textClasses += " text-lg md:text-2xl max-w-sm"; break;
        case 'medium': textClasses += " text-2xl md:text-4xl max-w-xl"; break;
        case 'xl': textClasses += " text-5xl md:text-7xl max-w-4xl"; break;
        case 'large': default: textClasses += " text-3xl md:text-5xl max-w-3xl"; break;
    }
    return { containerClasses, textClasses };
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, textAlign: CanvasTextAlign) => {
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    ctx.textAlign = textAlign;
    lines.forEach((l, i) => {
        ctx.fillText(l.trim(), x, y + (i * lineHeight));
    });
};

const drawTextOverlayToCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number, text: string, config?: OverlayConfig) => {
    if (!text) return;
    const pos = config?.position || 'center';
    const size = config?.size || 'large';
    const scale = width < height ? width / 720 : height / 720;
    let fontSize = 48;
    switch(size) {
        case 'small': fontSize = 24; break;
        case 'medium': fontSize = 36; break;
        case 'xl': fontSize = 72; break;
        case 'large': default: fontSize = 48; break;
    }
    fontSize = fontSize * scale;
    ctx.font = `900 ${fontSize}px "Outfit", sans-serif`;
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    const padding = 64 * scale;
    const lineHeight = fontSize * 1.2;
    const maxWidth = width * 0.8;
    let x = width / 2;
    let y = height / 2;
    let align: CanvasTextAlign = 'center';
    switch(pos) {
        case 'top-left': x = padding; y = padding + fontSize; align = 'left'; break;
        case 'top-right': x = width - padding; y = padding + fontSize; align = 'right'; break;
        case 'bottom-left': x = padding; y = height - padding - (lineHeight * 2); align = 'left'; break;
        case 'bottom-right': x = width - padding; y = height - padding - (lineHeight * 2); align = 'right'; break;
        case 'top': x = width / 2; y = padding + fontSize; align = 'center'; break;
        case 'bottom': x = width / 2; y = height - padding - (lineHeight * 2); align = 'center'; break;
        case 'center': default: x = width / 2; y = height / 2; align = 'center'; break;
    }
    wrapText(ctx, text, x, y, maxWidth, lineHeight, align);
};


// --- Middle Panel: Advanced Sequencer Player ---
const ProjectBoard: React.FC<{
  project: AdProject | null;
  setProject: React.Dispatch<React.SetStateAction<AdProject | null>>;
  settings: ProjectSettings;
}> = ({ project, setProject, settings }) => {
  const [activeTab, setActiveTab] = useState<'output' | 'ingredients'>('output');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{percent: number, message: string} | null>(null);
  
  const [currentTime, setCurrentTime] = useState(0);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  
  const musicRef = useRef<HTMLAudioElement>(null);
  const voRef = useRef<HTMLAudioElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const totalDuration = project ? project.scenes.reduce((acc, scene) => acc + scene.duration, 0) : 0;

  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const loop = () => {
        const now = performance.now();
        const dt = (now - lastTime) / 1000; 
        lastTime = now;

        if (isPlaying && totalDuration > 0) {
            setCurrentTime(prev => {
                const next = prev + dt;
                if (next >= totalDuration) {
                    setIsPlaying(false);
                    if (isExporting) stopExport();
                    return 0; 
                }
                return next;
            });

            if (isExporting && canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                const vid = videoRefs.current[activeSceneIndex];
                if (ctx && vid) {
                    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                    try {
                        ctx.drawImage(vid, 0, 0, ctx.canvas.width, ctx.canvas.height);
                    } catch(e) {}
                    const scene = project?.scenes[activeSceneIndex];
                    if (scene?.textOverlay) {
                        drawTextOverlayToCanvas(ctx, ctx.canvas.width, ctx.canvas.height, scene.textOverlay, scene.overlayConfig);
                    }
                }
            }
        }
        animationFrameId = requestAnimationFrame(loop);
    };

    if (isPlaying) {
        lastTime = performance.now();
        loop();
    } else {
        cancelAnimationFrame(animationFrameId);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, totalDuration, isExporting, activeSceneIndex, project]);

  useEffect(() => {
    if (!project) return;
    let accumulatedTime = 0;
    let newIndex = 0;
    for (let i = 0; i < project.scenes.length; i++) {
        if (currentTime >= accumulatedTime && currentTime < accumulatedTime + project.scenes[i].duration) {
            newIndex = i;
            break;
        }
        accumulatedTime += project.scenes[i].duration;
    }
    setActiveSceneIndex(newIndex);

    videoRefs.current.forEach((vid, idx) => {
        if (!vid) return;
        if (isPlaying && vid.paused) {
             vid.play().catch(() => {});
        } else if (!isPlaying && !vid.paused) {
             vid.pause();
        }
        if (idx === newIndex) {
            vid.style.opacity = '1';
            vid.style.zIndex = '10';
        } else {
            vid.style.opacity = '0';
            vid.style.zIndex = '0';
        }
    });
  }, [currentTime, project, isPlaying]);

  useEffect(() => {
    if (isPlaying) {
        if (musicRef.current && project?.musicUrl) musicRef.current.play().catch(e => console.log('Music play blocked', e));
        if (voRef.current && project?.voiceoverUrl) voRef.current.play().catch(e => console.log('VO play blocked', e));
    } else {
        musicRef.current?.pause();
        voRef.current?.pause();
    }
  }, [isPlaying, project]);

  const handleExport = async () => {
    if (!project) return;
    setIsExporting(true);
    setExportProgress({ percent: 0, message: 'Starting export...' });
    
    try {
        const url = await stitchProject(project, settings.aspectRatio, (percent, message) => {
            setExportProgress({ percent, message });
        });
        
        if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${project.title.replace(/\s+/g, '_')}_final_mix.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    } catch (error) {
        console.error("Export failed:", error);
        alert("Export failed. See console for details.");
    } finally {
        setIsExporting(false);
        setExportProgress(null);
    }
  };

  const stopExport = () => {
      // FFmpeg export cannot be easily aborted in this setup, so we just let it finish.
  };

  const handleAudioError = (source: string, e: any) => {
      console.error(`${source} Playback Error:`, e.message, e.target?.src);
  };

  if (!project) {
    return (
        <div className="h-full flex items-center justify-center text-slate-400 font-display">
            <div className="text-center">
                <Film size={48} className="mx-auto mb-4 opacity-50" />
                <p>Start a conversation with the Agent<br/>to generate a project.</p>
            </div>
        </div>
    );
  }

  const formatTime = (time: number) => {
      const m = Math.floor(time / 60);
      const s = Math.floor(time % 60);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const activeScene = project.scenes[activeSceneIndex];
  const overlayConfig = activeScene?.overlayConfig;
  const { containerClasses, textClasses } = getOverlayClasses(overlayConfig);
  const canvasW = settings.aspectRatio === AspectRatio.SixteenNine ? 1280 : 720;
  const canvasH = settings.aspectRatio === AspectRatio.SixteenNine ? 720 : 1280;

  return (
    <div className="h-full flex flex-col">
      <canvas ref={canvasRef} width={canvasW} height={canvasH} className="hidden absolute pointer-events-none" />

      <div className="flex border-b border-white/40 bg-white/10 backdrop-blur-sm">
        <button onClick={() => setActiveTab('output')} className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'output' ? 'text-pink-600 border-b-2 border-pink-500 bg-pink-50/50' : 'text-slate-500 hover:text-slate-700'}`}>Final Output</button>
        <button onClick={() => setActiveTab('ingredients')} className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'ingredients' ? 'text-teal-600 border-b-2 border-teal-500 bg-teal-50/50' : 'text-slate-500 hover:text-slate-700'}`}>Director's View</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        {project.isGenerating && (
            <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center">
                <div className="max-w-md w-full space-y-6">
                    <Loader2 className="animate-spin text-pink-500 mx-auto" size={48} />
                    <h3 className="text-2xl font-display font-bold text-slate-900">Production In Progress</h3>
                    <div className="space-y-4">
                        {/* Status indicators */}
                        {['planning', 'storyboarding', 'video_production', 'voiceover', 'scoring', 'mixing', 'ready'].map((phase, i) => {
                            const labels: any = {planning: 'Creative Brief', storyboarding: 'Storyboards', video_production: 'Video Generation', voiceover: 'Voice Recording', scoring: 'Music Composition', mixing: 'Final Mix', ready: 'Ready'};
                            const isActive = project.currentPhase === phase;
                            const isDone = ['planning', 'storyboarding', 'video_production', 'voiceover', 'scoring', 'mixing', 'ready'].indexOf(project.currentPhase) > i;
                            return (
                                <div key={phase} className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${isActive ? 'bg-pink-100 text-pink-900' : 'text-slate-400'}`}>
                                    {isDone ? <CheckCircle2 className="text-green-500" /> : <div className="w-5 h-5 rounded-full border-2 border-current" />}
                                    <span className="font-bold">{labels[phase]}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>
        )}

        {isExporting && (
             <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center text-white">
                <Loader2 className="animate-spin text-pink-500 mx-auto mb-4" size={48} />
                <h3 className="text-2xl font-display font-bold">Rendering Final Mix...</h3>
                <p className="text-slate-400 mt-2">{exportProgress?.message || 'Processing...'}</p>
                <div className="w-full max-w-md mt-4 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${exportProgress?.percent || 0}%` }} />
                </div>
                <div className="mt-2 font-mono text-sm">{exportProgress?.percent || 0}%</div>
            </div>
        )}

        {activeTab === 'output' ? (
          <div className="flex flex-col items-center h-full">
            {project.musicUrl && <audio key={project.musicUrl} ref={musicRef} src={project.musicUrl} crossOrigin="anonymous" onError={(e) => handleAudioError("Music", e)} onLoadedMetadata={(e) => { e.currentTarget.volume = 0.3; }} />}
            {project.voiceoverUrl && <audio key={project.voiceoverUrl} ref={voRef} src={project.voiceoverUrl} crossOrigin="anonymous" onError={(e) => handleAudioError("Voice", e)} onLoadedMetadata={(e) => { e.currentTarget.volume = 1.0; }} />}

            <div className={`relative bg-black rounded-2xl overflow-hidden shadow-2xl transition-all duration-500 border border-slate-800 ${
                settings.aspectRatio === '16:9' ? 'w-full aspect-video' : 'h-[50vh] md:h-[600px] aspect-[9/16]'
            }`}>
                {project.scenes.map((scene, idx) => (
                    <React.Fragment key={scene.id}>
                        {scene.storyboardUrl && !scene.videoUrl && (
                            <img src={scene.storyboardUrl} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out" style={{ opacity: idx === 0 ? 1 : 0, zIndex: idx === 0 ? 5 : 0 }} />
                        )}
                        <video preload="auto" ref={(el) => { videoRefs.current[idx] = el; }} src={scene.videoUrl} className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ease-in-out" style={{ opacity: idx === 0 ? 1 : 0, zIndex: idx === 0 ? 10 : 0 }} muted playsInline loop crossOrigin="anonymous" />
                    </React.Fragment>
                ))}
                <div className={containerClasses}><h2 className={textClasses}>{activeScene?.textOverlay}</h2></div>
            </div>

            <div className="w-full mt-4 bg-white border border-slate-200 rounded-2xl p-3 md:p-4 shadow-xl flex flex-col md:flex-row items-center gap-4 z-10 max-w-4xl">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={() => setIsPlaying(!isPlaying)} disabled={isExporting} className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-slate-900 rounded-full text-white hover:bg-pink-500 transition-all shadow-md shrink-0 disabled:opacity-50">
                        {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-1" />}
                    </button>
                    <div className="flex flex-col">
                        <span className="font-mono text-sm font-bold text-slate-700">{formatTime(currentTime)} <span className="text-slate-400">/ {formatTime(totalDuration)}</span></span>
                        <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Preview</span>
                    </div>
                </div>
                <div className="flex-1 w-full h-2 bg-slate-100 rounded-full overflow-hidden relative group cursor-pointer">
                    <div className="absolute top-0 left-0 h-full bg-slate-200 w-full" />
                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-pink-500 to-orange-400 transition-all duration-100 ease-linear" style={{ width: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }} />
                </div>
                <button onClick={handleExport} disabled={isExporting || isPlaying} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap" title="Render & Download">
                     {isExporting ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                     <span>{isExporting ? 'Rendering...' : 'Download'}</span>
                </button>
            </div>

            <div className="mt-6 w-full max-w-2xl text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-800">{project.title}</h1>
                    {project.mode && <span className="text-[10px] bg-purple-100 text-purple-600 px-2 py-1 rounded-full uppercase font-bold tracking-wider">{project.mode}</span>}
                </div>
                <p className="text-sm text-slate-600 max-w-lg mx-auto">{project.concept}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
             <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">
                 <h3 className="text-xl font-display font-bold text-slate-800 flex items-center gap-2">
                    <VenetianMask className="text-purple-500" />
                    Director's Breakdown
                 </h3>
                 <p className="text-sm text-slate-500">
                     The AI Agent has deconstructed the video into granular technical components to ensure maximum consistency across scenes.
                 </p>
             </div>

             <div className="space-y-8">
                {project.scenes.map((scene, idx) => (
                    <div key={scene.id} className="relative group">
                         <div className="flex items-center gap-4 mb-2">
                            <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">{idx + 1}</div>
                            <h4 className="font-bold text-slate-700">Scene {idx + 1} ({scene.duration}s)</h4>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                             {/* VISUAL */}
                             <div className="md:col-span-4 lg:col-span-3">
                                 <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative">
                                    {scene.videoUrl ? (
                                        <video src={scene.videoUrl} className="w-full h-full object-cover" />
                                    ) : scene.storyboardUrl ? (
                                        <img src={scene.storyboardUrl} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300"><ImageIcon size={24}/></div>
                                    )}
                                    <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-sm p-2 rounded-lg">
                                        <p className="text-[10px] text-white/90 line-clamp-2">{scene.visual_summary_prompt}</p>
                                    </div>
                                 </div>
                             </div>

                             {/* INGREDIENTS */}
                             <div className="md:col-span-8 lg:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-3">
                                 {/* Camera Card */}
                                 <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl">
                                     <div className="flex items-center gap-2 text-blue-700 font-bold text-xs uppercase tracking-wider mb-2">
                                         <Camera size={14} /> Camera
                                     </div>
                                     <div className="space-y-1">
                                         <p className="text-xs text-slate-700"><span className="font-bold">Framing:</span> {scene.camera.framing}</p>
                                         <p className="text-xs text-slate-700"><span className="font-bold">Move:</span> {scene.camera.movement}</p>
                                     </div>
                                 </div>

                                 {/* Lighting Card */}
                                 <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                                     <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider mb-2">
                                         <Sun size={14} /> Lighting & Env
                                     </div>
                                      <div className="space-y-1">
                                         <p className="text-xs text-slate-700"><span className="font-bold">Light:</span> {scene.environment.lighting}</p>
                                         <p className="text-xs text-slate-700"><span className="font-bold">Loc:</span> {scene.environment.location}</p>
                                     </div>
                                 </div>

                                 {/* Wardrobe Card */}
                                 <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl">
                                     <div className="flex items-center gap-2 text-purple-700 font-bold text-xs uppercase tracking-wider mb-2">
                                         <Shirt size={14} /> Character
                                     </div>
                                     <div className="space-y-1">
                                         <p className="text-xs text-slate-700 line-clamp-2">{scene.character.description}</p>
                                         <p className="text-[10px] text-purple-600 font-mono mt-1 bg-purple-100/50 p-1 rounded">
                                             Wearing: {scene.character.wardrobe}
                                         </p>
                                     </div>
                                 </div>

                                 {/* Action Card */}
                                 <div className="bg-slate-50 border border-slate-100 p-3 rounded-xl">
                                     <div className="flex items-center gap-2 text-slate-700 font-bold text-xs uppercase tracking-wider mb-2">
                                         <Video size={14} /> Action Blocking
                                     </div>
                                     <ul className="text-xs text-slate-600 list-disc list-inside space-y-1">
                                         {scene.action_blocking.map((action, i) => (
                                             <li key={i}>{action.notes}</li>
                                         ))}
                                     </ul>
                                 </div>
                             </div>
                        </div>
                    </div>
                ))}
             </div>
          </div>
        )}
      </div>
    </div>
  );
}

const AgentChat: React.FC<{
  onGenerate: (prompt: string, attachments?: ChatAttachment[]) => void;
  isProcessing: boolean;
  project: AdProject | null;
}> = ({ onGenerate, isProcessing, project }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('adstudio_chat');
    return saved ? JSON.parse(saved) : [
        { id: '1', role: 'model', text: 'Hello! I am Commy, your AI Creative Director. Tell me about the ad you want to create.', timestamp: Date.now() }
    ];
  });
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      localStorage.setItem('adstudio_chat', JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isProcessing) return;

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: input, 
        timestamp: Date.now(),
        attachments: [...attachments]
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    
    // Check if we should generate a project
    const isGenerationRequest = input.toLowerCase().includes('generate') || input.toLowerCase().includes('create') || input.toLowerCase().includes('make a video');
    
    if (isGenerationRequest && !project) {
        // Trigger generation
        const thinkingMsg: ChatMessage = { id: 'thinking', role: 'model', text: 'Developing creative concept...', timestamp: Date.now(), isThinking: true };
        setMessages(prev => [...prev, thinkingMsg]);
        
        await onGenerate(input, userMsg.attachments);
        
        setMessages(prev => prev.filter(m => m.id !== 'thinking').concat({
            id: Date.now().toString(),
            role: 'model',
            text: "I've drafted a creative brief and storyboard based on your request. Check out the project board!",
            timestamp: Date.now()
        }));
    } else {
         // Normal Chat
         const thinkingMsg: ChatMessage = { id: 'thinking', role: 'model', text: 'Thinking...', timestamp: Date.now(), isThinking: true };
         setMessages(prev => [...prev, thinkingMsg]);

         try {
             const history = messages.map(m => ({
                 role: m.role,
                 parts: [{ text: m.text }]
             }));
             
             const response = await GeminiService.sendChatMessage(history, userMsg.text, project || undefined, userMsg.attachments);
             
             setMessages(prev => prev.filter(m => m.id !== 'thinking').concat({
                 id: Date.now().toString(),
                 role: 'model',
                 text: response || "I'm not sure how to respond to that.",
                 timestamp: Date.now()
             }));
         } catch (e) {
             setMessages(prev => prev.filter(m => m.id !== 'thinking').concat({
                 id: Date.now().toString(),
                 role: 'model',
                 text: "Sorry, I encountered an error.",
                 timestamp: Date.now()
             }));
         }
    }
  };

  const handleAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (ev) => {
              const result = ev.target?.result as string;
              const base64 = result.split(',')[1];
              const newAtt: ChatAttachment = {
                  id: Date.now().toString(),
                  type: file.type.startsWith('image/') ? 'image' : 'link', // Basic check
                  url: URL.createObjectURL(file), // Preview URL
                  mimeType: file.type,
                  base64Data: base64
              };
              setAttachments(prev => [...prev, newAtt]);
          };
          reader.readAsDataURL(file);
      }
  }

  const addLink = () => {
    if (!linkUrl.trim()) return;
    const newAtt: ChatAttachment = {
        id: Date.now().toString(),
        type: 'link',
        url: linkUrl,
        mimeType: 'text/uri-list',
        base64Data: ''
    };
    setAttachments(prev => [...prev, newAtt]);
    setLinkUrl('');
    setShowLinkInput(false);
  };

  return (
    <div className={`
        fixed bottom-0 right-0 w-full lg:w-96 lg:right-6 lg:bottom-6 
        bg-white rounded-t-2xl lg:rounded-2xl shadow-2xl border border-slate-200 z-[100] 
        flex flex-col overflow-hidden transition-all duration-300 ease-in-out
        ${isOpen ? 'h-[60vh] lg:h-[600px]' : 'h-14'}
    `}>
        {/* Header */}
        <div 
            className="p-4 bg-slate-900 text-white flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors"
            onClick={() => setIsOpen(!isOpen)}
        >
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="font-bold text-sm">AI Creative Director</span>
            </div>
            <div className="flex items-center gap-2">
                {isProcessing && <Loader2 size={16} className="animate-spin text-pink-500" />}
                {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === 'user' ? 'bg-pink-500 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none'}`}>
                        {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mb-2 flex gap-2 overflow-x-auto">
                                {msg.attachments.map(att => (
                                    <div key={att.id} className="relative group shrink-0">
                                         {att.type === 'image' ? (
                                             <img src={att.base64Data ? `data:${att.mimeType};base64,${att.base64Data}` : att.url} className="w-16 h-16 object-cover rounded-lg border border-white/20" />
                                         ) : (
                                             <div className="w-16 h-16 rounded-lg bg-slate-100 flex items-center justify-center text-red-500">
                                                 <Youtube size={24} />
                                             </div>
                                         )}
                                    </div>
                                ))}
                            </div>
                        )}
                        {msg.isThinking ? (
                            <div className="flex gap-1 items-center">
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-75" />
                                <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-150" />
                            </div>
                        ) : (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                        )}
                    </div>
                </div>
            ))}
            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 bg-white border-t border-slate-200">
            {showLinkInput && (
                <div className="flex gap-2 mb-2 animate-in slide-in-from-bottom-2">
                    <input 
                        type="text" 
                        placeholder="Paste YouTube or Web URL..." 
                        className="flex-1 bg-slate-100 text-slate-900 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-pink-500"
                        value={linkUrl}
                        onChange={(e) => setLinkUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addLink()}
                    />
                    <button onClick={addLink} className="bg-slate-900 text-white px-3 rounded-lg text-xs font-bold">Add</button>
                    <button onClick={() => setShowLinkInput(false)} className="bg-slate-200 text-slate-600 px-2 rounded-lg"><X size={14}/></button>
                </div>
            )}
            
            {attachments.length > 0 && (
                <div className="flex gap-2 mb-2 px-2">
                    {attachments.map(att => (
                        <div key={att.id} className="relative group">
                            <div className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center">
                                {att.type === 'image' ? <img src={att.url} className="w-full h-full object-cover" /> : <LinkIcon size={16} className="text-slate-400"/>}
                            </div>
                            <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"><X size={10} /></button>
                        </div>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-2">
                 <button onClick={() => setShowLinkInput(!showLinkInput)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-full transition-colors">
                    <LinkIcon size={20} />
                 </button>
                 <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                    <Paperclip size={20} />
                 </button>
                 <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAttachment} />
                 
                 <input 
                    className="flex-1 bg-slate-100 text-slate-900 border-none rounded-full px-4 py-2 text-sm focus:ring-2 focus:ring-pink-500 outline-none"
                    placeholder="Describe your ad..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    disabled={isProcessing}
                 />
                 <button 
                    onClick={handleSend} 
                    disabled={(!input && attachments.length === 0) || isProcessing}
                    className="p-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                >
                    <ArrowUpCircle size={24} />
                 </button>
            </div>
        </div>
    </div>
  );
}

export const App: React.FC = () => {
    // ... (Existing state hooks)
    const [files, setFiles] = useState<ReferenceFile[]>(() => {
        const saved = localStorage.getItem('adstudio_files');
        return saved ? JSON.parse(saved) : [];
    });
    const [visualAnchor, setVisualAnchor] = useState<ReferenceFile | null>(() => {
        const saved = localStorage.getItem('adstudio_visualAnchor');
        return saved ? JSON.parse(saved) : null;
    });
    const [settings, setSettings] = useState<ProjectSettings>(() => {
        const saved = localStorage.getItem('adstudio_settings');
        return saved ? JSON.parse(saved) : {
            customScript: '',
            musicTheme: 'Commercial',
            useTextOverlays: 'auto',
            preferredVoice: 'auto',
            aspectRatio: AspectRatio.SixteenNine,
            mode: 'Commercial' as ProjectMode
        };
    });
    const [project, setProject] = useState<AdProject | null>(() => {
        const saved = localStorage.getItem('adstudio_project');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Clear blob URLs as they are invalid across sessions
                parsed.voiceoverUrl = undefined;
                parsed.musicUrl = undefined;
                parsed.scenes.forEach((s: any) => {
                    s.videoUrl = undefined;
                    s.storyboardUrl = undefined;
                });
                return parsed;
            } catch (e) {
                return null;
            }
        }
        return null;
    });
    const [isProcessing, setIsProcessing] = useState(false);
    const [showLeftPanel, setShowLeftPanel] = useState(false);
    const [showRightPanel, setShowRightPanel] = useState(false);
    const [hasKey, setHasKey] = useState(false);

    useEffect(() => {
        localStorage.setItem('adstudio_files', JSON.stringify(files));
    }, [files]);

    useEffect(() => {
        localStorage.setItem('adstudio_visualAnchor', JSON.stringify(visualAnchor));
    }, [visualAnchor]);

    useEffect(() => {
        localStorage.setItem('adstudio_settings', JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        localStorage.setItem('adstudio_project', JSON.stringify(project));
    }, [project]);

    useEffect(() => {
        const checkKey = async () => {
            // @ts-ignore
            if (window.aistudio) {
                // @ts-ignore
                const has = await window.aistudio.hasSelectedApiKey();
                setHasKey(has);
            } else {
                setHasKey(true); 
            }
        };
        checkKey();
    }, []);

    const handleGenerate = async (prompt: string, attachments?: ChatAttachment[]) => {
        setIsProcessing(true);
        try {
            // 1. Plan
            const plan = await GeminiService.generateAdPlan(prompt, settings, files);
            
            const newProject: AdProject = {
                ...plan,
                isGenerating: true,
                currentPhase: 'storyboarding',
                scenes: plan.scenes.map((s: any) => ({ ...s, status: 'pending' })),
                mode: settings.mode
            };
            setProject(newProject);
    
            // 2. Storyboards
            const scenesWithStoryboards = await Promise.all(newProject.scenes.map(async (scene: Scene) => {
                const img = await GeminiService.generateStoryboardImage(
                    scene, // PASSING FULL SCENE OBJECT NOW
                    settings.aspectRatio, 
                    visualAnchor?.content
                );
                return { ...scene, storyboardUrl: img || undefined, status: 'pending' } as Scene;
            }));
    
            setProject(prev => prev ? { ...prev, scenes: scenesWithStoryboards as any, currentPhase: 'video_production' } : null);
    
            // 3. Videos
            const scenesWithVideo: any[] = [];
            
            for (const scene of scenesWithStoryboards) {
                 setProject(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        scenes: prev.scenes.map(s => s.id === scene.id ? { ...s, status: 'generating' } as Scene : s)
                    };
                });
    
                const video = await GeminiService.generateVideoClip(
                    scene, // PASSING FULL SCENE OBJECT
                    settings.aspectRatio, 
                    scene.storyboardUrl
                );
                
                const updatedScene = { ...scene, videoUrl: video || undefined, status: 'complete' } as Scene;
                scenesWithVideo.push(updatedScene);
    
                setProject(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        scenes: prev.scenes.map(s => s.id === scene.id ? updatedScene : s) as any
                    };
                });
            }
    
            // 4. Audio
            setProject(prev => prev ? { ...prev, currentPhase: 'voiceover' } : null);
            const vo = await GeminiService.generateVoiceover(plan.fullScript, settings.preferredVoice === 'auto' ? TTSVoice.Kore : settings.preferredVoice, plan.script);
            setProject(prev => prev ? { ...prev, currentPhase: 'scoring', voiceoverUrl: vo || undefined } : null);
    
            const music = await GeminiService.generateMusic(plan.musicMood || settings.musicTheme);
            setProject(prev => prev ? { ...prev, currentPhase: 'ready', musicUrl: music || undefined, isGenerating: false } : null);
    
        } catch (e) {
            console.error("Generation failed", e);
            setIsProcessing(false);
            setProject(prev => prev ? { ...prev, isGenerating: false } : null);
        }
    };

    if (!hasKey) {
        // ... (Render Key Selection Screen - Unchanged)
        return (
             <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 gap-6 p-4">
                 <div className="text-center space-y-2">
                    <h1 className="text-3xl font-display font-bold text-slate-900">Commy</h1>
                    <p className="text-slate-500">Video generation requires a paid API key.</p>
                 </div>
                 <button onClick={async () => {
                     // @ts-ignore
                     if (window.aistudio) {
                         // @ts-ignore
                         await window.aistudio.openSelectKey();
                         // @ts-ignore
                         const has = await window.aistudio.hasSelectedApiKey();
                         setHasKey(has);
                     }
                 }} className="bg-slate-900 text-white px-8 py-3 rounded-full font-bold hover:bg-slate-800 transition-colors shadow-lg flex items-center gap-2">
                     <Sparkles size={18} /> Select API Key
                 </button>
                 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-sm text-pink-500 font-bold hover:underline">Billing Information</a>
             </div>
         )
    }

    return (
        <div className="h-screen w-screen flex flex-col overflow-hidden bg-slate-50">
            <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-white/40 backdrop-blur-md border-b border-white/50 z-20 relative shrink-0">
                {/* Mobile: Left Button opens Assets */}
                <button onClick={() => setShowLeftPanel(!showLeftPanel)} className="lg:hidden p-2 text-slate-700 hover:bg-white/50 rounded-lg transition-colors">
                    <Menu />
                </button>
                
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-tr from-pink-500 to-orange-400 rounded-lg shadow-lg flex items-center justify-center text-white font-bold font-display">C</div>
                    <span className="text-xl font-display font-bold text-slate-900">Commy</span>
                </div>
    
                {/* Mobile: Right Button opens Settings */}
                <button onClick={() => setShowRightPanel(!showRightPanel)} className="lg:hidden p-2 text-slate-700 hover:bg-white/50 rounded-lg transition-colors">
                    <Settings />
                </button>
    
                <div className="hidden lg:flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-500 uppercase bg-white/50 px-3 py-1 rounded-full border border-white">Gemini 3 Pro</span>
                    <div className="w-8 h-8 bg-slate-200 rounded-full overflow-hidden border-2 border-white shadow-md">
                        <img src="https://picsum.photos/100" alt="User" />
                    </div>
                </div>
            </header>
    
            <div className="flex-1 relative overflow-hidden">
                <div className="w-full h-full grid grid-cols-1 lg:grid-cols-4">
                    
                    {/* Left Panel (Reference Manager) - Sliding on Mobile */}
                    <div className={`
                        fixed inset-y-0 left-0 w-80 lg:w-full lg:static lg:col-span-1 
                        bg-white/95 backdrop-blur-xl lg:bg-white/20 lg:backdrop-blur-md 
                        border-r border-white/40 shadow-2xl lg:shadow-lg z-30 transition-transform duration-300 ease-in-out
                        ${showLeftPanel ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                    `}>
                        <div className="h-full relative pt-16 lg:pt-0">
                            <button onClick={() => setShowLeftPanel(false)} className="lg:hidden absolute top-4 right-4 p-2 bg-slate-100 rounded-full text-slate-600"><X size={16}/></button>
                            <ReferenceManager 
                                files={files} 
                                setFiles={setFiles} 
                                visualAnchor={visualAnchor}
                                setVisualAnchor={setVisualAnchor}
                            />
                        </div>
                    </div>
    
                    {/* Center Panel (Project Board) */}
                    <div className="col-span-1 lg:col-span-2 relative bg-white/5 w-full h-full overflow-hidden">
                        <ProjectBoard project={project} setProject={setProject} settings={settings} />
                    </div>
    
                    {/* Right Panel (Settings) - Sliding on Mobile */}
                    <div className={`
                        fixed inset-y-0 right-0 w-80 lg:w-full lg:static lg:col-span-1 
                        bg-white/95 backdrop-blur-xl lg:bg-white/20 lg:backdrop-blur-md 
                        border-l border-white/40 shadow-2xl lg:shadow-lg z-30 transition-transform duration-300 ease-in-out
                        ${showRightPanel ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
                    `}>
                        <div className="h-full relative pt-16 lg:pt-0">
                             <button onClick={() => setShowRightPanel(false)} className="lg:hidden absolute top-4 left-4 p-2 bg-slate-100 rounded-full text-slate-600"><X size={16}/></button>
                            <SettingsPanel settings={settings} setSettings={setSettings} />
                        </div>
                    </div>
    
                </div>
    
                 {/* Mobile Overlay for panels */}
                {(showLeftPanel || showRightPanel) && (
                    <div 
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden"
                        onClick={() => { setShowLeftPanel(false); setShowRightPanel(false); }}
                    />
                )}
            </div>
            
            <AgentChat onGenerate={handleGenerate} isProcessing={isProcessing} project={project} />
        </div>
      );
}
