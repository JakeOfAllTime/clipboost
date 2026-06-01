import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';

/**
 * Anchor — a clip segment on the main video timeline.
 *
 * Core fields (persist to autosave / save-config):
 * @typedef {Object} Anchor
 * @property {number} id                 - Unique id (Date.now() + index at creation)
 * @property {number} start              - Clip start in seconds, absolute video time
 * @property {number} end                - Clip end in seconds, absolute video time
 *
 * Meta fields (underscore-prefixed, runtime-only, NOT guaranteed to round-trip):
 * @property {string}  [_narrativeReason] - Human-readable "why this clip" — set by
 *                                           Smart/Quick/Pro Gen. Shown in tooltips.
 * @property {number}  [_importance]      - 0..1 score. Smart Gen = Claude's importance;
 *                                           Quick Gen = normalized motion score.
 * @property {number}  [_index]           - Cached position at the time of precision-mode
 *                                           selection. Goes stale on reorder/delete — prefer
 *                                           anchors.findIndex(a => a.id === anchor.id) at
 *                                           read time (see goToPreviousAnchor/goToNextAnchor).
 * @property {number}  [_timelineOffset]  - Cumulative duration of preceding anchors in the
 *                                           preview timeline; set when the precision modal opens
 *                                           and used to map precision-time → preview-time.
 * @property {string}  [_zone]            - 'opening' | 'early' | 'middle' | 'late' | 'finale'.
 *                                           Attached by resolveAndValidateClips during Smart Gen
 *                                           distribution rebalancing; not written to user anchors.
 */

import { Upload, Play, Pause, Trash2, Sparkles, Download, X, RotateCcw, RotateCw, Edit, ChevronLeft, ChevronRight, ChevronDown, ZoomIn, ZoomOut } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const isLocalDev =
  process.env.NODE_ENV !== 'production' ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname));

const ReelForge = () => {
  const FRAME_STEP = 1 / 30;

  // Core video state
  const [video, setVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [originalVideoFile, setOriginalVideoFile] = useState(null); // Keep original for export
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0); // Only for initial value & explicit seeks
  const [isPlaying, setIsPlaying] = useState(false);
  const [isOptimizingVideo, setIsOptimizingVideo] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState(0);

  // Performance: Use refs for 60fps updates (avoid re-renders)
  const currentTimeRef = useRef(0);
  const playheadRef = useRef(null); // Main timeline playhead
  const playheadProgressRef = useRef(null); // Progress bar
  const timeDisplayRef = useRef(null); // Time text display

  // Preview mode state
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [previewAnchorIndex, setPreviewAnchorIndex] = useState(0);
  const previewIntervalRef = useRef(null);

  // Enhanced preview with scrubber
  const [previewTimeline, setPreviewTimeline] = useState([]);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewTotalDuration, setPreviewTotalDuration] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const previewAnimationRef = useRef(null);

  // Dual-video Play Clips system — ref-only so the hot swap doesn't wait on
  // a React re-render. See PROJECT_PRINCIPLES.md.
  const activeVideoRef = useRef('A');                  // 'A' | 'B' — single source of truth
  const videoBRef = useRef(null);                      // second video element
  const standbyReadyRef = useRef(false);               // standby has finished seeking to next clip
  const waitingForStandbyRef = useRef(null);           // timestamp when we started waiting for a late standby
  const transitioningRef = useRef(false);              // prevents swap re-entry
  const previewAnchorIndexRef = useRef(0);             // ref mirror of previewAnchorIndex for RAF

  // Music state
  const [music, setMusic] = useState(null);
  const [musicUrl, setMusicUrl] = useState(null);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicStartTime, setMusicStartTime] = useState(0);
  const [musicEndTime, setMusicEndTime] = useState(0);
  const [audioBalance, setAudioBalance] = useState(70);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  // Trim state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [showTrimModal, setShowTrimModal] = useState(false);

  // Anchors state
  const [anchors, setAnchors] = useState([]);
  const [selectedAnchor, setSelectedAnchor] = useState(null);
  const [selectedClipFocusTime, setSelectedClipFocusTime] = useState(null);
  const [previewAnchor, setPreviewAnchor] = useState(null);
  const [previewHandle, setPreviewHandle] = useState('start'); // 'start' or 'end' - which handle to show

  // Undo/Redo state
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Precision modal state
  const [showPrecisionModal, setShowPrecisionModal] = useState(false);
  const [precisionAnchor, setPrecisionAnchor] = useState(null);
  const [precisionTime, setPrecisionTime] = useState(0);
  const [precisionPlaying, setPrecisionPlaying] = useState(false);
  const [selectedHandle, setSelectedHandle] = useState('end'); // 'start' or 'end'

  // Music precision modal state
  const [selectedMusicHandle, setSelectedMusicHandle] = useState(null); // 'start' | 'end' | null

  // Unified drag state
  const [dragState, setDragState] = useState({
    active: false,
    type: null,
    startX: 0,
    anchorSnapshot: null
  });

  // Separate precision drag state
  const [precisionDragState, setPrecisionDragState] = useState({
    active: false,
    type: null,
    startX: 0,
    startAnchor: null
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState(['original']);
  const [videoAnalysis, setVideoAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisPhase, setAnalysisPhase] = useState('');
  const [targetDuration, setTargetDuration] = useState(20);
  const [maxClipLength, setMaxClipLength] = useState(3); // 2-15s per clip (Quick Gen)
  const [musicAnalysis, setMusicAnalysis] = useState(null);
  const [originalSoundAnalysis, setOriginalSoundAnalysis] = useState(null);
  const [motionSensitivity, setMotionSensitivity] = useState(0.5); // 0-1 range
  // Auto-save state
  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const [restoredAnchorCount, setRestoredAnchorCount] = useState(0);
  const [restoredVideoName, setRestoredVideoName] = useState(null);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);
  const [hoveredAnchor, setHoveredAnchor] = useState(null);

  // UX Enhancement: Visual bridges & progressive disclosure
  const [hoverTime, setHoverTime] = useState(null); // Hover position on clips timeline
  const [hasSeenPrecisionHint, setHasSeenPrecisionHint] = useState(false);
  const [hasCreatedFirstClip, setHasCreatedFirstClip] = useState(false);
  const [hasSeenDeleteHint, setHasSeenDeleteHint] = useState(false); // Hint for delete functionality
  const [hasSeenLoupeHint, setHasSeenLoupeHint] = useState(false); // AUDIT P1 #5: first-select loupe hint
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false); // AUDIT P2 #12: "?" toggles shortcut overlay
  const [nudgeActivity, setNudgeActivity] = useState({ handle: null, direction: 0, intensity: 0 });
  const storageFailedRef = useRef(false); // AUDIT P3 #19: fire the "storage unavailable" toast at most once per session
  const anchorsRef = useRef([]);
  const selectedAnchorRef = useRef(null);
  const nudgeHoldRef = useRef({ intervalId: null, timeoutId: null, active: false });

  // Double-tap tracking for anchor deletion on mobile
  const anchorTapRef = useRef({ anchorId: null, time: 0, hasMoved: false });

  // Hold-to-drag tracking for easier anchor movement on mobile
  const holdTimerRef = useRef(null);
  const [holdingAnchor, setHoldingAnchor] = useState(null);
  const HOLD_DURATION_MS = 400; // Hold for 400ms to activate drag
  const upgradeTimerRef = useRef(null);  // Handle → move-whole-anchor upgrade (1s hold)
  const dragLiveXRef = useRef(0);         // Tracks cursor X during drag for upgrade check
  const loupeRef = useRef(null);          // Zoom loupe strip ref
  const dragSourceRef = useRef('main');   // 'main' | 'loupe' — which timeline started the drag

  // Throttle video seeking during drag for smoother performance
  const lastSeekTimeRef = useRef(0);
  const SEEK_THROTTLE_MS = 100; // Only seek every 100ms max

  // Mobile edit mode state
  const [previewMuted, setPreviewMuted] = useState(false);

  // Tab navigation state
  const [currentTab, setCurrentTab] = useState('materials');
  // Possible values: 'materials', 'forge', 'ship'
  const [workspaceMode, setWorkspaceMode] = useState('simple'); // 'simple' | 'pro'

  // Timeline zoom state
  const [timelineZoom, setTimelineZoom] = useState(1);

  const selectedTimelineAnchor = useMemo(
    () => anchors.find(a => a.id === selectedAnchor) || null,
    [anchors, selectedAnchor]
  );

  const timelineView = useMemo(() => {
    if (!duration || timelineZoom <= 1 || !selectedTimelineAnchor) {
      return { start: 0, end: duration || 0, duration: duration || 1, zoomed: false };
    }

    const anchorDuration = Math.max(FRAME_STEP, selectedTimelineAnchor.end - selectedTimelineAnchor.start);
    const windowDuration = Math.min(
      duration,
      Math.max(90, anchorDuration + 30, anchorDuration * 1.8)
    );
    const focusTime = selectedClipFocusTime ?? ((selectedTimelineAnchor.start + selectedTimelineAnchor.end) / 2);
    const start = Math.max(0, Math.min(duration - windowDuration, focusTime - (windowDuration / 2)));
    const end = Math.min(duration, start + windowDuration);

    return { start, end, duration: Math.max(FRAME_STEP, end - start), zoomed: true };
  }, [duration, selectedTimelineAnchor, selectedClipFocusTime, timelineZoom]);

  const getTimelineTimeFromClientX = useCallback((clientX, rect) => {
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return timelineView.start + (percent * timelineView.duration);
  }, [timelineView]);

  const getTimelinePercent = useCallback((time) => {
    if (!timelineView.duration) return 0;
    return ((time - timelineView.start) / timelineView.duration) * 100;
  }, [timelineView]);

  // Clip thumbnails: Map<anchorId, dataURL> — captured from video midpoint
  const [clipThumbnails, setClipThumbnails] = useState({});

  // Auto-generate V3 state
  const [autoGenMode, setAutoGenMode] = useState('quick'); // 'quick' | 'smart' | 'pro'
  const [beatSyncTarget, setBeatSyncTarget] = useState('none'); // 'none' | 'music' | 'original'
  const [userApiKey, setUserApiKey] = useState('');
  const [devTestClips, setDevTestClips] = useState([]);
  const [devTestMusic, setDevTestMusic] = useState([]);
  const [isLoadingDevClip, setIsLoadingDevClip] = useState(false);
  const [isLoadingDevMusic, setIsLoadingDevMusic] = useState(false);

  // Sidebar navigation state — start false on server, sync from localStorage after hydration
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('clipboost-sidebar-collapsed');
      if (saved === 'true') setSidebarCollapsed(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (!isLocalDev) return;
    let cancelled = false;
    fetch('/api/dev-testclips')
      .then(res => (res.ok ? res.json() : { clips: [] }))
      .then(data => {
        if (!cancelled) setDevTestClips(Array.isArray(data.clips) ? data.clips : []);
        if (!cancelled) setDevTestMusic(Array.isArray(data.tracks) ? data.tracks : []);
      })
      .catch(() => {
        if (!cancelled) setDevTestClips([]);
        if (!cancelled) setDevTestMusic([]);
      });
    return () => { cancelled = true; };
  }, []);

  const [currentSection, setCurrentSection] = useState('edit'); // 'edit' | 'export'

  // Playback mode state
  const [playbackMode, setPlaybackMode] = useState('full'); // 'full' | 'clips'

  // Media Center collapse state
  const [mediaCenterCollapsed, setMediaCenterCollapsed] = useState(true);
  const [previewCardLooping, setPreviewCardLooping] = useState(true); // Phase 5B: clip loop in preview card
  const [cardVideoPlaying, setCardVideoPlaying] = useState(false);   // tracks play/pause for overlay button

  // Toast notifications — replaces all native alert() / confirm() dialogs
  const [toasts, setToasts] = useState([]);
  const dismissToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const showToast = useCallback((message, type = 'info', action = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), type === 'error' ? 5000 : 3500);
  }, []);

  // FFmpeg state
  const [ffmpeg, setFFmpeg] = useState(null);
  const [ffmpegLoaded, setFFmpegLoaded] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const precisionVideoRef = useRef(null);
  const musicRef = useRef(null);
  const timelineRef = useRef(null);
  const lastTapTimeRef = useRef(0);
  const lastTapPositionRef = useRef({ x: 0, y: 0 });
  const lastAnchorTapRef = useRef({ id: null, time: 0, x: 0, y: 0 });
  const precisionTimelineRef = useRef(null);
  const loadConfigInputRef = useRef(null);

  // Magnifier lens refs (Phase 5A) — updated via direct DOM mutation inside RAF, no setState
  const lensRef = useRef(null);
  const lensTimestampRef = useRef(null);

  // Play Clips: DOM refs for RAF direct-update (eliminate 60 re-renders/sec)
  const clipsPlayheadRef = useRef(null);
  const clipsTimeDisplayRef = useRef(null);
  const previewCurrentTimeRef = useRef(0); // authoritative value during RAF

  // Clips bar scrubbing
  const clipsBarRef = useRef(null);
  const clipsBarScrubRef = useRef(false); // true while dragging

  // Loupe handle drag — floating frame thumbnail
  const [loupeDragThumb, setLoupeDragThumb] = useState(null); // { dataUrl, side } | null
  const loupeDragThumbCanvas = useRef(null); // offscreen canvas for frame capture
  const loupeDragActiveRef = useRef(false);  // true while a loupe handle is being dragged

  // Preview card mini video player
  const cardVideoRef = useRef(null);

  // Web Audio API refs for mixing
  const audioContextRef = useRef(null);
  const videoSourceRef = useRef(null);
  const videoBSourceRef = useRef(null);
  const musicSourceRef = useRef(null);
  const videoGainRef = useRef(null);
  const musicGainRef = useRef(null);
  const precisionAudioContextRef = useRef(null);
  const precisionVideoSourceRef = useRef(null);
  const precisionMusicSourceRef = useRef(null);
  const precisionVideoGainRef = useRef(null);
  const precisionMusicGainRef = useRef(null);

  // Platform configurations
const platforms = {
  original: {
    name: 'Fast Original',
    subtitle: 'Quickest download',
    note: 'No resize; copies video where possible',
    aspect: 'original',
    color: 'from-cyan-500 to-blue-500'
  },
  draftVertical: {
    name: 'Draft Vertical',
    subtitle: 'Faster 9:16 test',
    note: 'Lower-res render for checking the edit',
    aspect: '9:16',
    color: 'from-blue-500 to-cyan-400',
    width: 540,
    height: 960
  },
  vertical: {
    name: 'Polished 9:16',
    subtitle: 'TikTok • Reels • Shorts',
    note: 'Full-size social render',
    aspect: '9:16',
    color: 'from-pink-500 to-purple-600',
    width: 1080,
    height: 1920
  },
  instagram: {
    name: '4:5 Instagram Feed',
    subtitle: 'Feed post',
    note: 'Full-size formatted render',
    aspect: '4:5',
    color: 'from-purple-500 to-fuchsia-600',
    width: 1080,
    height: 1350
  },
  horizontal: {
    name: '16:9 Horizontal',
    subtitle: 'Twitter/X',
    note: 'Full-size formatted render',
    aspect: '16:9',
    color: 'from-sky-500 to-blue-600',
    width: 1920,
    height: 1080
  }
};

  // Load FFmpeg
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpegInstance = new FFmpeg();

        ffmpegInstance.on('progress', ({ progress: prog }) => {
          setProgress(Math.min(100, Math.round(prog * 100)));
        });

        await ffmpegInstance.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        });

        setFFmpeg(ffmpegInstance);
        setFFmpegLoaded(true);
      } catch (error) {
        console.error('FFmpeg load failed:', error);
      }
    };

    loadFFmpeg();
  }, []);

  // Auto-save anchors when they change (debounced 300ms)
  useEffect(() => {
    if (anchors.length > 0 && video) {
      const timeoutId = setTimeout(() => {
        try {
          const saveData = {
            anchors,
            musicStartTime,
            audioBalance,
            timestamp: Date.now(),
            videoName: video?.name || null
          };
          localStorage.setItem('clipboost-autosave', JSON.stringify(saveData));

          // Show indicator briefly
          setShowAutoSaveIndicator(true);
          const indicatorTimeout = setTimeout(() => setShowAutoSaveIndicator(false), 2000);

          // Store timeout ID for cleanup
          return () => clearTimeout(indicatorTimeout);
        } catch (error) {
          console.error('Error auto-saving:', error);
          // AUDIT P3 #19: surface the first failure so users know autosave is off
          // (private mode / quota exceeded / storage disabled).
          if (!storageFailedRef.current) {
            storageFailedRef.current = true;
            showToast('Autosave disabled — browser storage is unavailable', 'warning');
          }
        }
      }, 300); // Debounce: wait 300ms after last change

      return () => clearTimeout(timeoutId);
    }
  }, [anchors, musicStartTime, audioBalance, video]);

  // Persist sidebar state
  useEffect(() => {
    try {
      localStorage.setItem('clipboost-sidebar-collapsed', String(sidebarCollapsed));
    } catch (error) {
      console.error('Error saving sidebar state:', error);
    }
  }, [sidebarCollapsed]);

  // Sync playback mode with isPreviewMode state
  useEffect(() => {
    if (isPreviewMode && playbackMode === 'full') {
      setPlaybackMode('clips');
    } else if (!isPreviewMode && playbackMode === 'clips') {
      setPlaybackMode('full');
    }
  }, [isPreviewMode, playbackMode]);

  // Clear autosave after successful export
  const clearAutoSave = () => {
    try {
      localStorage.removeItem('clipboost-autosave');
    } catch (error) {
      console.error('Error clearing autosave:', error);
    }
  };

  // Restore from autosave
  const restoreAutoSave = () => {
  try {
    const saved = localStorage.getItem('clipboost-autosave');
    if (saved) {
      const data = JSON.parse(saved);
      setAnchors(data.anchors);
      saveToHistory(data.anchors);
      if (data.musicStartTime !== undefined) setMusicStartTime(data.musicStartTime);
      if (data.audioBalance !== undefined) setAudioBalance(data.audioBalance);
      setShowRestoreToast(false);
    }
  } catch (error) {
    console.error('Error restoring autosave:', error);
  }
};

const dismissRestoreToast = () => {
  setShowRestoreToast(false);
  clearAutoSave();
};

  // Utility functions (memoized)
  const formatTime = useCallback((seconds) => {
    if (seconds == null || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const anchorColors = useMemo(() => [
    { bg: 'bg-cyan-500/30', border: 'border-cyan-400/80', handle: 'bg-cyan-400', glow: 'shadow-[0_0_15px_rgba(0,212,255,0.4)]' },
    { bg: 'bg-pink-500/30', border: 'border-pink-400/80', handle: 'bg-pink-400', glow: 'shadow-[0_0_15px_rgba(255,0,255,0.4)]' },
    { bg: 'bg-purple-500/30', border: 'border-purple-400/80', handle: 'bg-purple-400', glow: 'shadow-[0_0_15px_rgba(147,51,234,0.4)]' },
    { bg: 'bg-blue-500/30', border: 'border-blue-400/80', handle: 'bg-blue-400', glow: 'shadow-[0_0_15px_rgba(79,172,254,0.4)]' },
    { bg: 'bg-fuchsia-500/30', border: 'border-fuchsia-400/80', handle: 'bg-fuchsia-400', glow: 'shadow-[0_0_15px_rgba(233,30,140,0.4)]' }
  ], []);

  const getAnchorColor = useCallback((index, isSelected) => {
    const color = anchorColors[index % anchorColors.length];
    return isSelected ? { ...color, bg: color.bg.replace('/30', '/50') } : color;
  }, [anchorColors]);

  useEffect(() => {
    anchorsRef.current = anchors;
  }, [anchors]);

  useEffect(() => {
    selectedAnchorRef.current = selectedAnchor;
  }, [selectedAnchor]);

  // Undo/Redo functions (memoized)
  const saveToHistory = useCallback((newAnchors) => {
    setHistory(prevHistory => {
      const newHistory = prevHistory.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newAnchors)));
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAnchors(JSON.parse(JSON.stringify(prevState)));
      setHistoryIndex(historyIndex - 1);
    }
  }, [historyIndex, history]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAnchors(JSON.parse(JSON.stringify(nextState)));
      setHistoryIndex(historyIndex + 1);
    }
  }, [historyIndex, history]);

  // Web Audio API functions for audio mixing
  const getMixVolumes = useCallback(() => {
    const clampedBalance = Math.max(0, Math.min(100, audioBalance));
    return {
      videoVolume: music ? (100 - clampedBalance) / 100 : 1,
      musicVolume: music ? clampedBalance / 100 : 0
    };
  }, [audioBalance, music]);

  const applyElementAudioVolumes = useCallback(() => {
    const { videoVolume, musicVolume } = getMixVolumes();
    const mixMutesSource = music && videoVolume <= 0.001;

    if (videoRef.current) {
      videoRef.current.volume = mixMutesSource ? 0 : 1;
      videoRef.current.muted = mixMutesSource || (isPreviewMode && activeVideoRef.current !== 'A');
    }

    if (videoBRef.current) {
      videoBRef.current.volume = mixMutesSource ? 0 : 1;
      videoBRef.current.muted = mixMutesSource || !isPreviewMode || activeVideoRef.current !== 'B';
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.volume = mixMutesSource ? 0 : 1;
      previewVideoRef.current.muted = mixMutesSource || previewMuted;
    }

    if (precisionVideoRef.current) {
      precisionVideoRef.current.volume = mixMutesSource ? 0 : 1;
      precisionVideoRef.current.muted = mixMutesSource;
    }

    if (musicRef.current) {
      musicRef.current.volume = musicVolume;
    }
  }, [getMixVolumes, isPreviewMode, music, previewMuted]);

  const setupAudioMixer = useCallback((videoElement, musicElement) => {
    if (!videoElement || !musicElement) return;

    try {
      // Only create new context if it doesn't exist
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const ctx = audioContextRef.current;

      // Only create sources if they don't exist
      if (!videoSourceRef.current) {
        videoSourceRef.current = ctx.createMediaElementSource(videoElement);
        videoGainRef.current = ctx.createGain();
        videoSourceRef.current.connect(videoGainRef.current);
        videoGainRef.current.connect(ctx.destination);
      }

      if (!videoBSourceRef.current && videoBRef.current) {
        videoBSourceRef.current = ctx.createMediaElementSource(videoBRef.current);
        videoBSourceRef.current.connect(videoGainRef.current);
      }

      if (!musicSourceRef.current && musicElement.src) {
        musicSourceRef.current = ctx.createMediaElementSource(musicElement);
        musicGainRef.current = ctx.createGain();
        musicSourceRef.current.connect(musicGainRef.current);
        musicGainRef.current.connect(ctx.destination);
      }

      // Set initial volumes based on audioBalance
      updateAudioMixerVolumes();
      applyElementAudioVolumes();

    } catch (error) {
      console.error('Error setting up audio mixer:', error);
    }
  }, [applyElementAudioVolumes]);

  const updateAudioMixerVolumes = useCallback(() => {
    const { videoVolume, musicVolume } = getMixVolumes();

    if (videoGainRef.current) {
      videoGainRef.current.gain.value = videoVolume;
    }
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume;
    }
    applyElementAudioVolumes();
  }, [applyElementAudioVolumes, getMixVolumes]);

  const setupPrecisionAudioMixer = useCallback((videoElement, musicElement) => {
    if (!videoElement || !musicElement) return;

    try {
      // Only create new context if it doesn't exist
      if (!precisionAudioContextRef.current) {
        precisionAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      const ctx = precisionAudioContextRef.current;

      // Only create sources if they don't exist
      if (!precisionVideoSourceRef.current) {
        precisionVideoSourceRef.current = ctx.createMediaElementSource(videoElement);
        precisionVideoGainRef.current = ctx.createGain();
        precisionVideoSourceRef.current.connect(precisionVideoGainRef.current);
        precisionVideoGainRef.current.connect(ctx.destination);
      }

      if (!precisionMusicSourceRef.current && musicElement.src) {
        precisionMusicSourceRef.current = ctx.createMediaElementSource(musicElement);
        precisionMusicGainRef.current = ctx.createGain();
        precisionMusicSourceRef.current.connect(precisionMusicGainRef.current);
        precisionMusicGainRef.current.connect(ctx.destination);
      }

      // Set initial volumes based on audioBalance
      updatePrecisionAudioMixerVolumes();
      applyElementAudioVolumes();

    } catch (error) {
      console.error('Error setting up precision audio mixer:', error);
    }
  }, [applyElementAudioVolumes]);

  const updatePrecisionAudioMixerVolumes = useCallback(() => {
    const { videoVolume, musicVolume } = getMixVolumes();

    if (precisionVideoGainRef.current) {
      precisionVideoGainRef.current.gain.value = videoVolume;
    }
    if (precisionMusicGainRef.current) {
      precisionMusicGainRef.current.gain.value = musicVolume;
    }
    applyElementAudioVolumes();
  }, [applyElementAudioVolumes, getMixVolumes]);

  // Update volumes when audioBalance changes
  useEffect(() => {
    updateAudioMixerVolumes();
    updatePrecisionAudioMixerVolumes();
    applyElementAudioVolumes();
  }, [audioBalance, music, updateAudioMixerVolumes, updatePrecisionAudioMixerVolumes, applyElementAudioVolumes]);

  // Save/Load functions
  const saveConfiguration = () => {
    const config = {
      anchors: anchors,
      musicStartTime: musicStartTime,
      audioBalance: audioBalance,
      trimStart: trimStart,
      trimEnd: trimEnd,
      duration: duration,
      version: '1.0',
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clipboost-config-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadConfiguration = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config = JSON.parse(event.target.result);
        if (config.anchors) {
          setAnchors(config.anchors);
          saveToHistory(config.anchors);
        }
        if (config.musicStartTime !== undefined) setMusicStartTime(config.musicStartTime);
        if (config.audioBalance !== undefined) setAudioBalance(config.audioBalance);
        if (config.trimStart !== undefined) setTrimStart(config.trimStart);
        if (config.trimEnd !== undefined) setTrimEnd(config.trimEnd);
      } catch (error) {
        showToast('Error loading configuration file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Motion Detection System
// Motion Detection System
// (Replaced: defines music & video analyzers as two separate top-level functions)

// Beat-Sync / Music Analysis System
const analyzeMusicStructure = async (audioFile, startTime = 0, duration = null) => {
  return new Promise((resolve, reject) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const fileReader = new FileReader();

    fileReader.onload = async (e) => {
      try {
        const audioBuffer = await audioContext.decodeAudioData(e.target.result);
        const audioDuration = audioBuffer.duration;
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0); // Use first channel

        // Analyze in chunks
        const chunkSize = sampleRate * 0.1; // 100ms chunks
        const chunks = Math.floor(channelData.length / chunkSize);

        const energyData = [];

        // Calculate energy envelope
        for (let i = 0; i < chunks; i++) {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, channelData.length);

          let energy = 0;
          for (let j = start; j < end; j++) {
            energy += Math.abs(channelData[j]);
          }
          energy /= (end - start);

          const timestamp = (i * chunkSize) / sampleRate;
          energyData.push({ time: timestamp, energy });
        }

        // Detect tempo by finding peaks in energy
        const avgEnergy = energyData.reduce((sum, d) => sum + d.energy, 0) / energyData.length;
        const threshold = avgEnergy * 1.3;

        const peaks = [];
        for (let i = 1; i < energyData.length - 1; i++) {
          if (
            energyData[i].energy > threshold &&
            energyData[i].energy > energyData[i - 1].energy &&
            energyData[i].energy > energyData[i + 1].energy
          ) {
            peaks.push(energyData[i]);
          }
        }

        // Estimate BPM from peak intervals with outlier rejection
        let bpm = 0;
        let beatInterval = 0;
        if (peaks.length >= 2) {
          const intervals = [];

          // Use ALL peaks for better accuracy (not just first 20)
          for (let i = 1; i < peaks.length; i++) {
            intervals.push(peaks[i].time - peaks[i - 1].time);
          }

          // Median-based outlier rejection
          intervals.sort((a, b) => a - b);
          const median = intervals[Math.floor(intervals.length / 2)];

          // Filter out intervals that differ by more than 30% from median
          const validIntervals = intervals.filter(interval =>
            Math.abs(interval - median) < median * 0.3
          );

          // Calculate average from valid intervals
          const avgInterval = validIntervals.length > 0
            ? validIntervals.reduce((sum, v) => sum + v, 0) / validIntervals.length
            : median;

          beatInterval = avgInterval;
          bpm = 60 / avgInterval;

          // Validate BPM range and correct tempo multiples
          // Typical music is 60-180 BPM
          if (bpm < 60) {
            // Likely detected half-time (e.g., 60 BPM detected as 30)
            beatInterval /= 2;
            bpm *= 2;
          } else if (bpm > 180) {
            // Likely detected double-time (e.g., 120 BPM detected as 240)
            beatInterval *= 2;
            bpm /= 2;
          }
        } else {
          // Fallback defaults if detection fails
          beatInterval = 0.5;
          bpm = 120;
        }

// Generate beat grid using absolute video timestamps
// Music starts at 'startTime' in the video, beats align with that
const beatGrid = [];
const endTime = duration !== null ? Math.min(startTime + duration, audioDuration) : audioDuration;

for (let musicTime = startTime; musicTime < endTime; musicTime += beatInterval) {
  // Use absolute video time where music is playing
  // If music starts at 61.1s in video, first beat is at 61.1s
  beatGrid.push(musicTime);
}

        // Score musical moments
        const musicalMoments = [];
        for (let i = 0; i < beatGrid.length; i++) {
          const beatTime = beatGrid[i]; // Already absolute video timestamp
          const isPhraseBoundary = i % 8 === 0; // Every 8th beat

          // Beat grid already uses music timeline positions
          const energyIndex = Math.floor((beatTime / audioDuration) * energyData.length);
          const currentEnergy = energyData[energyIndex]?.energy || 0;
          const prevEnergy = energyData[Math.max(0, energyIndex - 1)]?.energy || 0;
          const energyIncrease = Math.max(0, currentEnergy - prevEnergy);

          const spectralChange = energyIncrease > avgEnergy * 0.2 ? 0.7 : 0;

          if (isPhraseBoundary || energyIncrease > avgEnergy * 0.3) {
            const strength =
              (isPhraseBoundary ? 1.0 : 0) +
              (avgEnergy ? (energyIncrease / avgEnergy) * 0.7 : 0) +
              spectralChange;

            musicalMoments.push({
              time: beatTime, // Use absolute video timestamp
              onPhraseBoundary: isPhraseBoundary,
              energyIncrease: avgEnergy ? energyIncrease / avgEnergy : 0,
              spectralChange,
              strength: Math.min(1, strength),
            });
          }
        }

        audioContext.close();
        resolve({ moments: musicalMoments, bpm, beatGrid });
      } catch (error) {
        reject(error);
      }
    };

    fileReader.onerror = () => reject(new Error("Error reading audio file"));
    fileReader.readAsArrayBuffer(audioFile);
  });
};

// Motion Detection / Video Analysis System (Enhanced)
const analyzeVideo = async (videoFile, sensitivity = 0.5, onProgress = null) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    video.src = URL.createObjectURL(videoFile);
    video.muted = true;

    const results = [];
    let previousFrame = null;
    let previousHistogram = null;
    let previousEdges = null;
    let allMotionScores = []; // For adaptive thresholding

    video.onloadedmetadata = () => {
      canvas.width = 320;
      canvas.height = 180;
      const videoDuration = video.duration;

      // Target ~80 frames max for performance
      const TARGET_FRAMES = 80;

      // Calculate interval to achieve target frame count
      let sampleInterval = Math.max(1, videoDuration / TARGET_FRAMES);
      const totalSamples = Math.min(TARGET_FRAMES, Math.floor(videoDuration / sampleInterval));

      console.log('📹 Video analysis starting:', {
        duration: videoDuration.toFixed(2),
        durationMinutes: (videoDuration / 60).toFixed(2),
        sampleInterval: sampleInterval.toFixed(2),
        totalSamples
      });

      let currentSample = 0;

      // Helper: Calculate histogram (RGB channels)
      const calculateHistogram = (imageData) => {
        const histogram = { r: new Array(256).fill(0), g: new Array(256).fill(0), b: new Array(256).fill(0) };
        for (let i = 0; i < imageData.data.length; i += 4) {
          histogram.r[imageData.data[i]]++;
          histogram.g[imageData.data[i + 1]]++;
          histogram.b[imageData.data[i + 2]]++;
        }
        return histogram;
      };

      // Helper: Compare histograms (Bhattacharyya distance approximation)
      const compareHistograms = (hist1, hist2) => {
        let distance = 0;
        const totalPixels = canvas.width * canvas.height;

        ['r', 'g', 'b'].forEach(channel => {
          for (let i = 0; i < 256; i++) {
            const p1 = hist1[channel][i] / totalPixels;
            const p2 = hist2[channel][i] / totalPixels;
            distance += Math.sqrt(p1 * p2);
          }
        });

        return 1 - (distance / 3); // Normalize to 0-1, higher = more different
      };

      // Helper: Edge detection (simple Sobel approximation)
      const detectEdges = (imageData) => {
        const edges = new Uint8ClampedArray(imageData.data.length / 4);
        const width = canvas.width;
        const height = canvas.height;

        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = (y * width + x) * 4;

            // Grayscale conversion
            const center = (imageData.data[idx] + imageData.data[idx + 1] + imageData.data[idx + 2]) / 3;

            // Simple gradient approximation
            const right = (imageData.data[idx + 4] + imageData.data[idx + 5] + imageData.data[idx + 6]) / 3;
            const bottom = (imageData.data[idx + width * 4] + imageData.data[idx + width * 4 + 1] + imageData.data[idx + width * 4 + 2]) / 3;

            const gx = right - center;
            const gy = bottom - center;
            edges[y * width + x] = Math.sqrt(gx * gx + gy * gy);
          }
        }

        return edges;
      };

      // Helper: Compare edge maps
      const compareEdges = (edges1, edges2) => {
        let diffSum = 0;
        for (let i = 0; i < edges1.length; i++) {
          diffSum += Math.abs(edges1[i] - edges2[i]);
        }
        return diffSum / edges1.length / 255;
      };

      const processFrame = () => {
        if (currentSample >= totalSamples) {
          // Apply adaptive thresholding based on collected data
          if (allMotionScores.length > 0) {
            const sortedScores = [...allMotionScores].sort((a, b) => a - b);
            const median = sortedScores[Math.floor(sortedScores.length / 2)];
            const stdDev = Math.sqrt(allMotionScores.reduce((sum, s) => sum + Math.pow(s - median, 2), 0) / allMotionScores.length);

            // Re-classify scene changes based on adaptive threshold
            const adaptiveSceneThreshold = Math.max(0.35, median + stdDev * 1.5);
            results.forEach(r => {
              r.sceneChange = r.motionScore > adaptiveSceneThreshold;
            });
          }

          // Defer blob cleanup to avoid race condition with video element
          setTimeout(() => URL.revokeObjectURL(video.src), 100);
          resolve(results);
          return;
        }
        const timestamp = currentSample * sampleInterval;
        video.currentTime = timestamp;
      };

      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

          if (previousFrame) {
            // 1. Basic pixel difference (with center weighting)
            let diffSum = 0;
            let centerDiffSum = 0;
            const totalPixels = currentFrame.data.length / 4;
            const width = canvas.width;
            const height = canvas.height;
            const centerX = width / 2;
            const centerY = height / 2;
            const centerRadius = Math.min(width, height) / 3;

            for (let i = 0; i < currentFrame.data.length; i += 4) {
              const pixelIndex = i / 4;
              const x = pixelIndex % width;
              const y = Math.floor(pixelIndex / width);

              const rDiff = Math.abs(currentFrame.data[i] - previousFrame.data[i]);
              const gDiff = Math.abs(currentFrame.data[i + 1] - previousFrame.data[i + 1]);
              const bDiff = Math.abs(currentFrame.data[i + 2] - previousFrame.data[i + 2]);
              const pixelDiff = (rDiff + gDiff + bDiff) / 3;

              diffSum += pixelDiff;

              // Center weighting (subject focus)
              const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
              if (distFromCenter < centerRadius) {
                centerDiffSum += pixelDiff;
              }
            }

            const basicMotionScore = diffSum / totalPixels / 255;
            const centerMotionScore = centerDiffSum / (Math.PI * centerRadius * centerRadius) / 255;

            // 2. Histogram comparison (color changes)
            const currentHistogram = calculateHistogram(currentFrame);
            const histogramDiff = previousHistogram ? compareHistograms(previousHistogram, currentHistogram) : 0;

            // 3. Edge detection comparison (structural changes)
            const currentEdges = detectEdges(currentFrame);
            const edgeDiff = previousEdges ? compareEdges(previousEdges, currentEdges) : 0;

            // 4. Combined motion score with weights
            const motionScore = (
              basicMotionScore * 0.4 +
              centerMotionScore * 0.3 +
              histogramDiff * 0.2 +
              edgeDiff * 0.1
            );

            // Store for adaptive thresholding
            allMotionScores.push(motionScore);

            // Temporal smoothing (average with previous result if exists)
            let smoothedScore = motionScore;
            if (results.length > 0) {
              const prevScore = results[results.length - 1].motionScore;
              smoothedScore = motionScore * 0.7 + prevScore * 0.3;
            }

            // Multi-tier classification
            const isSceneChange = motionScore > 0.4; // Will be adaptive later
            const motionIntensity = smoothedScore < 0.2 ? 'subtle' :
                                   smoothedScore < 0.5 ? 'moderate' : 'intense';

            // Sensitivity-adjusted threshold (sensitivity: 0=strict, 1=permissive)
            // Higher sensitivity = lower threshold = more moments pass through
            const baseThreshold = 0.15;
            const adjustedThreshold = baseThreshold * (1 - sensitivity * 0.8); // Range: 0.15 (strict) to 0.03 (permissive)

            if (smoothedScore > adjustedThreshold) {
              results.push({
                time: video.currentTime,
                motionScore: smoothedScore,
                sceneChange: isSceneChange,
                motionIntensity,
                centerMotion: centerMotionScore,
                colorChange: histogramDiff,
                edgeChange: edgeDiff
              });
            }

            previousHistogram = currentHistogram;
            previousEdges = currentEdges;
          }

          previousFrame = currentFrame;
          currentSample++;

          // Report progress
          if (onProgress) {
            onProgress(Math.round((currentSample / totalSamples) * 100));
          }

          // Yield to UI
          if (currentSample % 5 === 0) {
            setTimeout(processFrame, 0);
          } else {
            processFrame();
          }
        } catch (err) {
          currentSample++;
          if (currentSample < totalSamples) processFrame();
          else {
            // Defer blob cleanup to avoid race condition with video element
            setTimeout(() => URL.revokeObjectURL(video.src), 100);
            resolve(results);
          }
        }
      };

      processFrame();
    };

    video.onerror = () => reject(new Error("Error loading video for analysis"));
  });
};

// Smart Frame Extraction for Narrative Analysis
// Uses motion analysis to capture key moments (scene changes, transitions)
const extractFramesForNarrative = async (videoFile, motionAnalysis = null, frameCount = 12) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.src = URL.createObjectURL(videoFile);
    video.muted = true;

    video.onloadedmetadata = async () => {
      const duration = video.duration;
      canvas.width = 640;  // Reasonable size for API
      canvas.height = 360;

      // Build smart sampling strategy
      const timestamps = [];

      if (motionAnalysis && motionAnalysis.length > 0) {
        console.log('📊 Using smart frame sampling with motion analysis');

        // Strategic frames (guaranteed coverage)
        timestamps.push({ time: 0, reason: 'start' });
        timestamps.push({ time: duration / 2, reason: 'middle' });
        timestamps.push({ time: duration * 0.99, reason: 'true_end' }); // Sample much closer to actual end

        // Guarantee frame from completion window (final 5-10 seconds)
        if (duration > 15) {
          const completionWindow = Math.max(duration - 8, duration * 0.92);
          timestamps.push({ time: completionWindow, reason: 'completion_window' });
        }

        // Scene change frames (up to 4)
        const sceneChanges = motionAnalysis
          .filter(m => m.sceneChange)
          .sort((a, b) => b.motionScore - a.motionScore)
          .slice(0, 4);

        sceneChanges.forEach(sc => {
          timestamps.push({ time: sc.time, reason: 'scene_change' });
        });

        // Fill remaining budget with even spacing
        const remaining = frameCount - timestamps.length;
        const interval = duration / (remaining + 1);
        for (let i = 1; i <= remaining; i++) {
          timestamps.push({ time: i * interval, reason: 'coverage' });
        }

        // Deduplicate (remove frames within 5 seconds of each other)
        const sorted = timestamps.sort((a, b) => a.time - b.time);
        const unique = [];
        for (const ts of sorted) {
          if (unique.length === 0 || ts.time - unique[unique.length - 1].time >= 5) {
            unique.push(ts);
          }
        }

        // Take first frameCount frames
        const finalTimestamps = unique.slice(0, frameCount);
        console.log('✅ Smart sampling plan:', {
          total: finalTimestamps.length,
          sceneChanges: finalTimestamps.filter(t => t.reason === 'scene_change').length,
          coverage: finalTimestamps.filter(t => t.reason === 'coverage').length
        });

        // Extract frames at these specific times
        const frames = [];
        for (const ts of finalTimestamps) {
          await new Promise((seekResolve) => {
            video.onseeked = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = canvas.toDataURL('image/jpeg', 0.8);
              const base64Data = imageData.split(',')[1];

              frames.push({
                timestamp: ts.time,
                base64: base64Data,
                reason: ts.reason
              });

              seekResolve();
            };
            video.currentTime = ts.time;
          });
        }

        // Defer blob cleanup to avoid race condition with video element
        setTimeout(() => URL.revokeObjectURL(video.src), 100);
        resolve(frames);

      } else {
        // Fallback to even spacing if no motion analysis
        console.log('📊 Using fallback even spacing (no motion analysis)');
        const frames = [];
        const interval = duration / (frameCount - 1);

        for (let i = 0; i < frameCount; i++) {
          const timestamp = i * interval;

          await new Promise((seekResolve) => {
            video.onseeked = () => {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const imageData = canvas.toDataURL('image/jpeg', 0.8);
              const base64Data = imageData.split(',')[1];

              frames.push({
                timestamp: timestamp,
                base64: base64Data
              });

              seekResolve();
            };
            video.currentTime = timestamp;
          });
        }

        // Defer blob cleanup to avoid race condition with video element
        setTimeout(() => URL.revokeObjectURL(video.src), 100);
        resolve(frames);
      }
    };

    video.onerror = () => reject(new Error('Failed to load video'));
  });
};

// Extract frames from a specific time range (for autonomous frame requests)
const extractFramesFromRange = async (videoFile, startTime, endTime, frameCount = 6, resolution = 320) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.src = URL.createObjectURL(videoFile);
    video.muted = true;
    video.preload = 'auto';

    video.onloadedmetadata = async () => {
      // Adaptive resolution: 320x180 for analysis, can be adjusted
      canvas.width = resolution;
      canvas.height = Math.round(resolution * 9 / 16); // Maintain 16:9 aspect ratio

      const duration = endTime - startTime;
      const interval = frameCount > 1 ? duration / (frameCount - 1) : 0;
      const frames = [];

      for (let i = 0; i < frameCount; i++) {
        const timestamp = startTime + (i * interval);

        await new Promise((seekResolve) => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // Slightly lower quality for speed
            const base64Data = dataUrl.split(',')[1];

            frames.push({
              timestamp: timestamp,
              base64: base64Data,
              reason: 'zone_extraction'
            });

            seekResolve();
          };

          video.currentTime = timestamp;
        });
      }

      // Defer blob cleanup to avoid race condition with video element
      setTimeout(() => URL.revokeObjectURL(video.src), 100);
      resolve(frames);
    };

    video.onerror = () => reject(new Error('Video loading failed for frame extraction'));
  });
};

// Type-Specific Instructions for Smart Gen
const getTypeSpecificInstructions = (storyType) => {
  const instructions = {
    tutorial: {
      keyMoments: [
        "Problem setup or ingredient/tool reveal",
        "Key technique demonstration (the 'secret' or critical step)",
        "Final result showcase",
        "COMPLETION GESTURE: Signing artwork, tasting dish, stepping back to admire, or verbal conclusion"
      ],
      clipStrategy: "4-8 second clips showing complete thoughts",
      avoid: "Long ingredient lists, repetitive process shots, excessive setup",
      narrative: "Build from problem → solution → result"
    },

    transformation: {
      keyMoments: [
        "Clear 'before' state showing starting condition",
        "1-2 dramatic mid-process moments",
        "Reveal of final transformation",
        "Side-by-side or direct comparison if shown",
        "COMPLETION GESTURE: Client reaction in mirror, satisfaction gesture, admiring result"
      ],
      clipStrategy: "5-15 second clips to show contrast and build tension",
      avoid: "Repetitive middle process, static shots with no change",
      narrative: "Emphasize contrast - before vs after is the story"
    },

    vlog: {
      keyMoments: [
        "Location/scene changes",
        "High-energy reactions or emotional peaks",
        "Punchlines or comedic moments",
        "Direct-to-camera personal moments",
        "COMPLETION GESTURE: Wave goodbye, direct-to-camera conclusion, 'see you next time'"
      ],
      clipStrategy: "2-8 second clips, fast-paced cuts for energy",
      avoid: "Long monologues, static talking, slow transitions",
      narrative: "Keep energy high - variety and personality over exposition"
    },

    product_demo: {
      keyMoments: [
        "Product reveal (unboxing or first appearance)",
        "Key feature demonstrations",
        "Product in use (showing functionality)",
        "Final verdict or recommendation",
        "COMPLETION GESTURE: Holding up product, thumbs up, recommendation statement"
      ],
      clipStrategy: "1-6 second clips, punchy reveals and features",
      avoid: "Lengthy packaging shots, unboxing process, spec lists",
      narrative: "Reveal → impress → convince"
    },

    interview: {
      keyMoments: [
        "Insightful quotes or key statements",
        "Emotional reactions",
        "Direct answers to important questions",
        "Storytelling moments (anecdotes, examples)",
        "COMPLETION GESTURE: Final thought, thank you, handshake or departure"
      ],
      clipStrategy: "4-10 second clips with complete thoughts",
      avoid: "Mid-sentence cuts, question setups without answers",
      narrative: "Extract wisdom - let the best ideas speak"
    },

    performance: {
      keyMoments: [
        "Peak action moments (jumps, tricks, skills)",
        "Crowd reactions or energy peaks",
        "Success/outcome moments",
        "Unique or impressive techniques",
        "COMPLETION GESTURE: Landing, celebration, arms raised, bow, crowd applause"
      ],
      clipStrategy: "2-6 second clips capturing peak moments",
      avoid: "Setup time, waiting, static performance",
      narrative: "Show the highlights - excitement and skill"
    }
  };

  return instructions[storyType] || instructions.tutorial; // Default fallback
};

// PHASE 1: Gather comprehensive frames from strategic zones (PARALLEL extraction)
const gatherComprehensiveFrames = async (videoFile, videoDuration) => {
  console.log('📊 PHASE 1: Gathering comprehensive video coverage (parallel extraction)...');

  // Optimized zone sizing - fewer zones, fewer frames, faster extraction
  // Target: ~40-50 frames total (down from 80-100) while maintaining coverage
  const getZones = (duration) => {
    if (duration < 180) {
      // Very short video (< 3 min): 5 zones, ~35 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.20, frames: 7 },
        { name: 'early', start: duration * 0.20, end: duration * 0.40, frames: 7 },
        { name: 'middle', start: duration * 0.40, end: duration * 0.65, frames: 8 },
        { name: 'late', start: duration * 0.65, end: duration * 0.85, frames: 6 },
        { name: 'finale', start: duration * 0.85, end: duration * 0.995, frames: 8 }
      ];
    } else if (duration < 600) {
      // Short video (3-10 min): 5 zones, ~40 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.18, frames: 8 },
        { name: 'early', start: duration * 0.18, end: duration * 0.38, frames: 8 },
        { name: 'middle', start: duration * 0.38, end: duration * 0.62, frames: 10 },
        { name: 'late', start: duration * 0.62, end: duration * 0.85, frames: 7 },
        { name: 'finale', start: duration * 0.85, end: duration * 0.995, frames: 9 }
      ];
    } else if (duration < 1800) {
      // Medium video (10-30 min): 5 zones, ~50 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.15, frames: 9 },
        { name: 'early', start: duration * 0.15, end: duration * 0.35, frames: 10 },
        { name: 'middle', start: duration * 0.35, end: duration * 0.60, frames: 12 },
        { name: 'late', start: duration * 0.60, end: duration * 0.85, frames: 9 },
        { name: 'finale', start: duration * 0.85, end: duration * 0.995, frames: 10 }
      ];
    } else {
      // Long video (30+ min): 5 zones, ~55 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.12, frames: 10 },
        { name: 'early', start: duration * 0.12, end: duration * 0.32, frames: 11 },
        { name: 'middle', start: duration * 0.32, end: duration * 0.58, frames: 14 },
        { name: 'late', start: duration * 0.58, end: duration * 0.85, frames: 10 },
        { name: 'finale', start: duration * 0.85, end: duration * 0.995, frames: 11 }
      ];
    }
  };

  const zones = getZones(videoDuration);
  const totalFrames = zones.reduce((sum, z) => sum + z.frames, 0);

  console.log(`⚡ Extracting ${totalFrames} frames from ${zones.length} zones in PARALLEL...`);

  // PARALLEL extraction - kick off all zones simultaneously
  const extractionPromises = zones.map((zone, i) => {
    console.log(`📸 Zone ${i + 1}/${zones.length}: ${zone.name} (${formatTime(zone.start)}-${formatTime(zone.end)}) - ${zone.frames} frames`);

    return extractFramesFromRange(
      videoFile,
      zone.start,
      zone.end,
      zone.frames,
      320 // 320x180 resolution - small but sufficient for Claude
    ).then(zoneFrames => ({
      frames: zoneFrames.map(f => ({
        ...f,
        zone: zone.name,
        zoneIndex: i
      })),
      zoneName: zone.name,
      zoneIndex: i
    })).catch(error => {
      console.error(`  ❌ Failed to extract frames from ${zone.name}:`, error);
      return { frames: [], zoneName: zone.name, zoneIndex: i };
    });
  });

  // Wait for all zones to complete
  const results = await Promise.all(extractionPromises);

  // Combine and sort by zone index to maintain order
  const allFrames = results
    .sort((a, b) => a.zoneIndex - b.zoneIndex)
    .flatMap(r => {
      console.log(`  ✅ Extracted ${r.frames.length} frames from ${r.zoneName}`);
      return r.frames;
    });

  console.log(`✅ Phase 1 complete: ${allFrames.length} total frames gathered`);
  return { frames: allFrames, zones };
};

// PHASE 2: Single comprehensive analysis with all frames
const analyzeNarrativeComprehensive = async (allFrames, targetDuration, zones) => {
  console.log(`🧠 PHASE 2: Analyzing ${allFrames.length} frames with complete context...`);

  try {
    // Build frame manifest with exact timestamps
    const frameManifest = allFrames.map((frame, idx) =>
      `Frame ${idx + 1}: ${formatTime(frame.timestamp)} (${frame.timestamp.toFixed(2)}s) - ${frame.zone} zone`
    ).join('\n');

    // Build zone summary for Claude
    const zoneSummary = zones.map((z, i) =>
      `Zone ${i + 1} (${z.name}): ${formatTime(z.start)}-${formatTime(z.end)} (${z.frames} frames)`
    ).join('\n');

    const promptText = `
Analyze these ${allFrames.length} frames from a video to create compelling short-form clips.

CRITICAL: FRAME TIMING REFERENCE

You will see ${allFrames.length} images. Here are their EXACT timestamps:

${frameManifest}

IMPORTANT RULES:
1. When you identify a moment you want to use, note WHICH FRAME NUMBER shows it
2. Use that frame's EXACT timestamp from the manifest above
3. DO NOT make up timestamps or guess based on video position
4. Your startTime must match a frame time (or be very close to one)

Example workflow:
- You see Frame 42 shows "plated strudel result"
- Manifest says: Frame 42: 26:30 (finale zone)
- Your suggestedCut startTime: 1590 (which is 26:30 in seconds)
- Your endTime: 1598 (8 seconds later)
- Your frameReference: 42

DO NOT:
- Assign finale moments to opening timestamps
- Create startTimes that don't align with any frame
- Ignore the zone information

COMPREHENSIVE COVERAGE:
You have frames distributed across the entire video:
${zoneSummary}

This gives you complete visibility from start to finish.

TARGET DURATION: ${targetDuration} seconds

YOUR ANALYSIS PROCESS:

STEP 1: IDENTIFY VIDEO TYPE
Determine what type of video this is:
- tutorial (how-to, cooking, DIY, educational)
- transformation (before/after, makeover, progress)
- vlog (personal narrative, day-in-life, commentary)
- product_demo (unboxing, review, showcase)
- interview (conversation, Q&A, podcast)
- performance (sports, music, dance, skills)

STEP 2: SURVEY ALL FRAMES
Look through ALL frames to understand the complete story:
- What happens at the beginning?
- What develops in the middle?
- How does it conclude?
- What are the key moments across the entire arc?

STEP 3: IDENTIFY KEY MOMENTS - PROFESSIONAL EDITING MINDSET

You are a skilled video editor creating a short-form compilation.
Apply professional editing conventions based on video type:

COOKING VIDEOS - Look for these moments:
- Ingredient addition moments (pours, cracks, sprinkles, drops) → 2-3s clips
- Key techniques (mixing, flipping, searing, kneading) → 4-6s clips
- Texture/sizzle moments (close-ups of cooking action) → 3-4s clips
- Final result (plated dish, garnish, first bite) → 7-10s clips
ASK YOURSELF: "Did I capture ingredient additions? Cooking techniques? The final reveal?"

TRANSFORMATIONS - Look for these moments:
- Clear before state (starting condition) → 3-4s
- Process steps (each meaningful change) → 3-5s each
- Dramatic after reveal (final result) → 7-10s
- Reactions (satisfaction, comparison) → 3-4s
ASK YOURSELF: "Do I show the journey: before → process → after?"

TUTORIALS - Look for these moments:
- Problem/need setup → 3-4s
- Solution steps (each key action) → 4-6s each
- Technique close-ups → 4-5s
- Finished result with context → 6-8s
ASK YOURSELF: "Can someone understand the solution from my clips?"

VLOGS - Look for these moments:
- Energy peaks (excitement, laughter) → 3-4s
- Location changes (new setting intro) → 2-3s
- Punchlines (comedic beats) → 3-5s
- Personal moments (genuine reactions) → 4-6s
ASK YOURSELF: "Do my clips capture the personality and energy?"

PRODUCT DEMOS - Look for these moments:
- Product reveal (unboxing, first look) → 4-5s
- Key features (what makes it special) → 4-6s each
- In-use demonstration → 5-7s
- Verdict/recommendation → 5-6s
ASK YOURSELF: "Would someone understand what this product does?"

PERFORMANCE - Look for these moments:
- Build-up energy (preparation, focus) → 3-4s
- Peak action moment (the skill showcase) → 6-8s
- Success/failure reaction → 3-4s
- Celebration/emotion → 4-5s
ASK YOURSELF: "Did I capture the build-up, peak, and payoff?"

STEP 4: DETERMINE CLIP LENGTH FOR EACH MOMENT
For EACH moment you identify, ask yourself: "How long does THIS specific moment need?"

Self-prompting guidelines:
- Text/graphics (ingredient lists, titles): 2-4 seconds (readable time)
- Action/technique demonstration: 5-8 seconds (complete movement)
- Reveals (results, transformations): 6-10 seconds (impact + appreciation)
- Reactions (emotions, satisfaction): 2-4 seconds (quick beat)
- Establishing shots (context, setup): 2-3 seconds (set scene, move on)

Include your reasoning for each clip length in clipLengthReasoning field.

STEP 5: CREATE VARIED PACING
Mix clip lengths for rhythm: 3s → 7s → 4s → 9s → 3s creates energy
Fast cuts for information, slower holds for impact

INTELLIGENT CONTENT SELECTION

You have frames from ${zones.length} zones spanning the entire video.
Your goal: Find the BEST moments regardless of where they occur.

SELECTION PRINCIPLES:

1. QUALITY OVER DISTRIBUTION
   - Don't force clips from boring sections just to "cover the timeline"
   - If opening is dull setup, skip it and start with action
   - If middle has repetitive content, focus on the unique moments
   - Concentrate clips where the actual value is

2. IDENTIFY DEAD ZONES
   Look for signs of low-value content:
   - Static shots with no action
   - Repetitive processes (doing same thing multiple times)
   - Setup/cleanup with no educational value
   - Filler conversation or long intros

   SKIP these sections - focus on moments with clear purpose

3. NATURAL STORY ARC (when it exists)
   If the video has a clear progression:
   - Opening hook (if compelling) → 1 clip
   - Key developments → 4-6 clips
   - Satisfying conclusion → 1-2 clips

   If the video is just process:
   - Focus on the most interesting techniques/moments
   - Don't force artificial "story" structure

4. CONCENTRATION IS OK
   It's BETTER to have:
   - 8 great clips from 3 zones of high-value content

   Than:
   - 8 mediocre clips forced across all 5 zones

CLIP LENGTH ENFORCEMENT:
- Individual clips: 2-10 seconds (NO exceptions)
- If a moment naturally spans 15+ seconds, SPLIT it into 2-3 shorter clips
- Target 8-12 total clips for 40-60s final duration
- Avoid creating only 3-4 long clips

ASK YOURSELF:
"Where is the actual value in this video?"
"Which frames show interesting/educational/satisfying content?"
"Which sections are just filler or repetition?"

Focus your clips where the content deserves focus.

CLIP COUNT TARGETS (flexible):
- 40-second target: Aim for 8-12 clips (varied lengths)
- 60-second target: Aim for 10-15 clips (varied lengths)

IMPORTANT: Do NOT decide clip lengths yet. Just identify WHAT moments exist.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "storyType": "string",
  "narrative": "brief description of the story",
  "keyMoments": [
    {
      "frameReference": number,  // Which frame number shows this moment (1-${allFrames.length})
      "timestamp": number,       // Use exact time from frame manifest above
      "description": "what this moment shows",
      "importance": number between 0-1,
      "category": "string (describe moment type - e.g., reveal, reaction, technique, climax, setup, payoff, etc.)"
    }
  ],
  "missingMoments": ["moments you wanted to see but didn't find in frames"],
  "confidence": number between 0-1
}
`;

    // Calculate payload size for debugging
    const imagePayload = allFrames.map(f => ({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: f.base64 }
    }));
    const fullPayload = {
      messages: [{
        role: "user",
        content: [
          { type: "text", text: promptText },
          ...imagePayload
        ]
      }],
      videoType: 'visual-only'
    };
    const payloadSize = JSON.stringify(fullPayload).length;
    console.log(`📦 API payload: ${(payloadSize / (1024 * 1024)).toFixed(2)}MB (${allFrames.length} frames)`);

    const response = await fetch('/api/analyze-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullPayload)
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content;

    // Find text block with JSON
    const textBlock = content.find(block => block.type === 'text');
    if (!textBlock) {
      throw new Error('No text response from Claude');
    }

    // Parse JSON response
    let narrative;
    try {
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      narrative = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('JSON parse error:', textBlock.text);
      throw new Error('Invalid JSON response from Claude');
    }

    // Log results (moment inventory, not clips yet)
    console.log('🎬 Story Type:', narrative.storyType);
    console.log('📝 Narrative:', narrative.narrative);
    console.log('✅ Key Moments Identified:', narrative.keyMoments?.length || 0);
    if (narrative.missingMoments?.length > 0) {
      console.log('⚠️ Missing Moments:', narrative.missingMoments);
    }
    console.log('🎯 Confidence:', narrative.confidence);

    // Log moment breakdown by category
    if (narrative.keyMoments) {
      const categories = {};
      narrative.keyMoments.forEach(m => {
        categories[m.category] = (categories[m.category] || 0) + 1;
      });
      console.log('📊 Moment Categories:', categories);
    }

    return narrative;

  } catch (error) {
    console.error('❌ Comprehensive analysis failed:', error);
    console.error('❌ Error details:', error.message);
    // Don't throw - return null so caller can handle gracefully
    return null;
  }
};

// PHASE 3: Agentic seeking - targeted searches for missing moments
const seekMissingMoments = async (videoFile, videoDuration, missingMoments, existingFrames, zones) => {
  console.log('🔍 PHASE 3: Agentic seeking for missing moments...');

  if (!missingMoments || missingMoments.length === 0) {
    console.log('✅ No missing moments - skipping agentic seeking');
    return { newFrames: [], searches: [] };
  }

  const allNewFrames = [];
  const searchLog = [];
  const maxSearchesPerMoment = 1; // Conservative: 1 search per missing moment
  const framesPerSearch = 5; // Smaller searches to keep total under 120 frames (100 + 4*5 = 120)

  // Zone inference: Map missing moment keywords to likely zones
  const inferZone = (momentDescription) => {
    const desc = momentDescription.toLowerCase();

    // Finale indicators (results, plating, final product, taste test, completion)
    if (desc.includes('final') || desc.includes('plated') || desc.includes('result') ||
        desc.includes('taste') || desc.includes('finished') || desc.includes('completed') ||
        desc.includes('done') || desc.includes('garnish')) {
      return zones.find(z => z.name === 'finale') || zones[zones.length - 1];
    }

    // Opening indicators (intro, ingredients, setup)
    if (desc.includes('intro') || desc.includes('ingredient') || desc.includes('setup') ||
        desc.includes('display') || desc.includes('raw') || desc.includes('preparation')) {
      return zones.find(z => z.name === 'opening') || zones[0];
    }

    // Middle/process indicators (cooking, mixing, technique, process)
    if (desc.includes('process') || desc.includes('cooking') || desc.includes('baking') ||
        desc.includes('mixing') || desc.includes('technique') || desc.includes('assembly')) {
      return zones.find(z => z.name === 'middle') || zones[Math.floor(zones.length / 2)];
    }

    // Late/finishing indicators (cutting, serving, presentation)
    if (desc.includes('cutting') || desc.includes('slicing') || desc.includes('serving') ||
        desc.includes('presentation')) {
      return zones.find(z => z.name === 'late') || zones[zones.length - 2];
    }

    // Default: search finale zone (most likely place for missing climax moments)
    return zones.find(z => z.name === 'finale') || zones[zones.length - 1];
  };

  // Process each missing moment
  for (let i = 0; i < Math.min(missingMoments.length, 4); i++) {
    const moment = missingMoments[i];
    const targetZone = inferZone(moment);

    console.log(`🎯 Seeking: "${moment}" → ${targetZone.name} zone (${formatTime(targetZone.start)}-${formatTime(targetZone.end)})`);

    try {
      // Extract targeted frames from inferred zone
      const searchFrames = await extractFramesFromRange(
        videoFile,
        targetZone.start,
        targetZone.end,
        framesPerSearch
      );

      // Tag frames with search context
      const taggedFrames = searchFrames.map(f => ({
        ...f,
        zone: `${targetZone.name}_search`,
        zoneIndex: zones.indexOf(targetZone),
        searchContext: moment
      }));

      allNewFrames.push(...taggedFrames);

      searchLog.push({
        moment,
        zone: targetZone.name,
        framesFound: searchFrames.length,
        timeRange: `${formatTime(targetZone.start)}-${formatTime(targetZone.end)}`
      });

      console.log(`  ✅ Found ${searchFrames.length} additional frames in ${targetZone.name} zone`);
    } catch (error) {
      console.error(`  ❌ Search failed for "${moment}":`, error);
      searchLog.push({
        moment,
        zone: targetZone.name,
        framesFound: 0,
        error: error.message
      });
    }
  }

  console.log(`✅ Phase 3 complete: ${allNewFrames.length} additional frames from ${searchLog.length} searches`);
  return { newFrames: allNewFrames, searches: searchLog };
};

// PHASE 4: Focused analysis of new frames only (avoids re-sending all 100+ frames)
const analyzeNewFrames = async (originalFrames, newFrames, targetDuration, zones, missingMoments, originalCuts) => {
  console.log(`🔄 PHASE 4: Analyzing ${newFrames.length} new frames for missing moments...`);

  // Only analyze NEW frames to avoid API limits
  const framesToAnalyze = newFrames;

  try {
    // Build frame manifest for NEW frames only
    const frameManifest = framesToAnalyze.map((frame, idx) =>
      `Frame ${idx + 1}: ${formatTime(frame.timestamp)} (${frame.zone} - searched for: ${frame.searchContext})`
    ).join('\n');

    const zoneSummary = zones.map((z, i) =>
      `Zone ${i + 1} (${z.name}): ${formatTime(z.start)}-${formatTime(z.end)}`
    ).join('\n');

    const promptText = `
You are analyzing ADDITIONAL frames from a cooking video to find missing moments.

CONTEXT - What you previously found:
Your initial analysis of 100 frames found these key moments:
${originalCuts.map(c => `- ${c.reason} (${formatTime(c.startTime)})`).join('\n')}

But you identified these MISSING moments:
${missingMoments.map((m, i) => `${i + 1}. ${m}`).join('\n')}

I performed targeted searches in specific zones and extracted ${framesToAnalyze.length} additional frames.
Your job: Analyze ONLY these ${framesToAnalyze.length} new frames to find the missing moments.

CRITICAL: FRAME TIMING REFERENCE

You will see ${framesToAnalyze.length} images. Here are their EXACT timestamps:

${frameManifest}

IMPORTANT RULES:
1. When you identify a moment you want to use, note WHICH FRAME NUMBER shows it
2. Use that frame's EXACT timestamp from the manifest above
3. DO NOT make up timestamps or guess based on video position
4. Your startTime must match a frame time (or be very close to one)

Example workflow:
- You see Frame 105 shows "plated strudel result" (this was a searched frame!)
- Manifest says: Frame 105: 26:30 (finale_search zone - searched for: plated final result)
- Your suggestedCut startTime: 1590 (which is 26:30 in seconds)
- Your endTime: 1598 (8 seconds later)
- Your frameReference: 105

DO NOT:
- Invent timestamps between frames
- Use generic zone times (like "finale zone" = 25:00)
- Guess times based on visual progression

Video Zones Coverage:
${zoneSummary}

STEP 1: IDENTIFY THE VIDEO TYPE

Look at the content and determine which type this is:
- cooking: Recipe/food preparation videos
- transformation: Before/after, makeover, repair, restoration
- tutorial: How-to, educational, instructional
- vlog: Personal narrative, daily life, storytelling
- product: Reviews, unboxing, demonstrations
- performance: Music, dance, sports, entertainment

STEP 2: UNDERSTAND THE TARGET

Target duration: ${targetDuration} seconds
This is a SHORT-FORM compilation - be selective and impactful.

STEP 3: IDENTIFY KEY MOMENTS - PROFESSIONAL EDITING MINDSET

You are a skilled video editor creating a short-form compilation.
Apply professional editing conventions based on video type:

COOKING VIDEOS - Look for these moments:
- Ingredient addition moments (pours, cracks, sprinkles, drops) → 2-3s clips
- Key techniques (mixing, flipping, searing, kneading) → 4-6s clips
- Texture/sizzle moments (close-ups of cooking action) → 3-4s clips
- Final result (plated dish, garnish, first bite) → 7-10s clips
ASK YOURSELF: "Did I capture ingredient additions? Cooking techniques? The final reveal?"

TRANSFORMATIONS - Look for these moments:
- Clear before state (starting condition) → 3-4s
- Process steps (each meaningful change) → 3-5s each
- Dramatic after reveal (final result) → 7-10s
- Reactions (satisfaction, comparison) → 3-4s
ASK YOURSELF: "Do I show the journey: before → process → after?"

TUTORIALS - Look for these moments:
- Problem statement or setup → 3-4s
- Key steps (each distinct action) → 4-6s each
- Critical technique close-ups → 3-5s
- Finished result or demonstration → 6-8s
ASK YOURSELF: "Can someone follow along? Did I show each step clearly?"

VLOGS - Look for these moments:
- Emotional hooks (surprise, excitement, reactions) → 3-5s
- Story beats (setup, conflict, resolution) → 4-6s each
- Candid authentic moments → 3-4s
- Payoff or punchline → 5-8s
ASK YOURSELF: "Does this flow as a story? Is there an emotional arc?"

PRODUCT DEMOS - Look for these moments:
- Product reveal or unboxing → 4-5s
- Key features in action → 3-5s each
- Comparison or size reference → 3-4s
- Value proposition or results → 5-7s
ASK YOURSELF: "Would someone understand why this product matters?"

PERFORMANCE - Look for these moments:
- Opening/entrance → 3-4s
- Peak performance moments (high energy) → 4-6s each
- Technical showcases or highlights → 3-5s
- Climax or finale → 7-10s
ASK YOURSELF: "Did I capture the energy and skill on display?"

STEP 4: PRIORITIZE QUALITY OVER FORCED DISTRIBUTION

GOOD:
 - 8 excellent clips from zones 1, 3, 5, 7, 8 (zones with actual content)
 - Clips of varying lengths (2s, 5s, 3s, 8s, 4s, 6s, 10s, 4s)
 - Natural story flow

BAD:
 - 8 mediocre clips forced across all 5 zones

CLIP LENGTH ENFORCEMENT:
- Individual clips: 2-10 seconds (NO exceptions)
- If a moment naturally spans 15+ seconds, SPLIT it into 2-3 shorter clips
- Target 8-12 total clips for 40-60s final duration
- Avoid creating only 3-4 long clips

ASK YOURSELF:
"Where is the actual value in this video?"
"Which frames show interesting/educational/satisfying content?"
"Which sections are just filler or repetition?"

Focus your clips where the content deserves focus.

CLIP COUNT TARGETS (flexible):
- 40-second target: Aim for 8-12 clips (varied lengths)
- 60-second target: Aim for 10-15 clips (varied lengths)

Your task: Identify which moments you see in these ${framesToAnalyze.length} new frames.
Do NOT decide clip lengths yet - just identify WHAT moments exist.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "newMoments": [
    {
      "frameReference": number (1-${framesToAnalyze.length}),
      "timestamp": number (use EXACT time from manifest above),
      "description": "what this moment shows",
      "importance": number between 0-1,
      "category": "string (describe moment type - e.g., reveal, reaction, technique, climax, setup, payoff, etc.)"
    }
  ],
  "foundFromMissing": ["which of the 3 missing moments did you find"],
  "stillMissing": ["which missing moments are still not found"]
}
`;

    const response = await fetch('/api/analyze-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: [
            { type: "text", text: promptText },
            ...framesToAnalyze.map(f => ({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: f.base64 }
            }))
          ]
        }],
        videoType: 'supplemental-analysis'
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content;

    const textBlock = content.find(block => block.type === 'text');
    if (!textBlock) {
      throw new Error('No text response from Claude');
    }

    let supplementalResult;
    try {
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      supplementalResult = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('JSON parse error:', textBlock.text);
      throw new Error('Invalid JSON response from Claude');
    }

    // Log supplemental results
    if (supplementalResult.foundFromMissing?.length > 0) {
      console.log('🎉 FOUND Missing Moments:', supplementalResult.foundFromMissing);
    }
    if (supplementalResult.stillMissing?.length > 0) {
      console.log('⚠️ Still Missing:', supplementalResult.stillMissing);
    }
    console.log('✅ New Moments Identified:', supplementalResult.newMoments?.length || 0);

    return supplementalResult;

  } catch (error) {
    console.error('❌ Re-analysis failed:', error);
    throw error;
  }
};

// PHASE 5: Final clip selection with ALL moments known
const selectFinalClips = async (allMoments, targetDuration, storyType) => {
  console.log(`📝 PHASE 5: Selecting final clips from ${allMoments.length} total moments...`);

  try {
    // Build moment inventory with zone information
    const momentsList = allMoments.map((m, idx) =>
      `Moment ${idx + 1}: ${m.description} @ ${m.timestamp}s [zone: ${m.zone}, ${m.category}, importance: ${m.importance}]`
    ).join('\n');

    // Count moments by zone
    const zoneDistribution = {};
    allMoments.forEach(m => {
      zoneDistribution[m.zone] = (zoneDistribution[m.zone] || 0) + 1;
    });

    const promptText = `
You have identified ${allMoments.length} moments in a ${storyType} video.
Now select the BEST moments and assign clip lengths to create a ${targetDuration}-second compilation.

AVAILABLE MOMENTS:
${momentsList}

ZONE DISTRIBUTION:
${Object.entries(zoneDistribution).map(([zone, count]) => `- ${zone}: ${count} moments`).join('\n')}

TARGET: ${targetDuration} seconds total duration

Your job: Select the best moments and assign appropriate clip lengths (2-10s each).
Aim for 8-12 clips total, but prioritize quality over hitting exact counts.

EDITORIAL PRINCIPLES:
- Prioritize high-importance moments (0.7-1.0) regardless of where they appear
- Avoid clustering all clips in opening/early zones - seek diverse timeline representation
- Balance the narrative arc naturally based on what the video actually offers
- Vary clip lengths for pacing (mix quick 2-3s cuts with longer 6-10s showcase moments)
- Let importance scores guide your choices, not arbitrary zone requirements
- If the best moments cluster in certain zones, that's fine - follow the content

PACING GUIDANCE (flexible):
- High-energy moments: 2-4s (quick impact)
- Technique/process moments: 4-6s (time to demonstrate)
- Payoff/result moments: 6-10s (let viewers appreciate)
- Adjust based on content - these are guidelines, not rules

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "selectedClips": [
    {
      "momentIndex": number (1-${allMoments.length}),
      "startTime": number (use moment's timestamp),
      "endTime": number (startTime + desired clip length),
      "reason": "why this moment was selected",
      "clipLength": number (in seconds),
      "narrativeRole": "hook|build|climax|payoff"
    }
  ],
  "totalDuration": number,
  "editingRationale": "brief explanation of your clip selection and pacing strategy"
}
`;

    const response = await fetch('/api/analyze-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: [{ type: "text", text: promptText }]
        }],
        videoType: 'final-clip-selection'
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content;

    const textBlock = content.find(block => block.type === 'text');
    if (!textBlock) {
      throw new Error('No text response from Claude');
    }

    let clipSelection;
    try {
      const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim();
      clipSelection = JSON.parse(cleaned);
    } catch (parseError) {
      console.error('JSON parse error:', textBlock.text);
      throw new Error('Invalid JSON response from Claude');
    }

    console.log('✂️ Selected Clips:', clipSelection.selectedClips.length);
    console.log('⏱️ Total Duration:', clipSelection.totalDuration + 's (target: ' + targetDuration + 's)');
    console.log('📋 Strategy:', clipSelection.editingRationale);

    // Log zone representation in selected clips
    const selectedZones = clipSelection.selectedClips.map(clip => {
      const moment = allMoments[clip.momentIndex - 1];
      return moment.zone;
    });
    const selectedZoneDistribution = {};
    selectedZones.forEach(zone => {
      selectedZoneDistribution[zone] = (selectedZoneDistribution[zone] || 0) + 1;
    });
    console.log('📍 Zone Distribution in Selected Clips:', selectedZoneDistribution);

    return clipSelection;

  } catch (error) {
    console.error('❌ Final clip selection failed:', error);
    throw error;
  }
};

// Smart Gen timestamp resolver + zone-distribution guard.
// Root cause of the "clips pile at 0:00" bug: anchor code used `clip.startTime ?? 0`,
// so when Claude's response omitted/mangled startTime, every clip fell back to 0.
// Fix: resolve start from the moment inventory (allMoments[momentIndex-1].timestamp),
// then rebalance the result if any zone holds >40% or the finale zone is empty on
// longer videos (where gatherComprehensiveFrames already sampled it).
const resolveAndValidateClips = (selectedClips, allMoments, videoDuration) => {
  if (!Array.isArray(selectedClips) || selectedClips.length === 0) return [];
  const clampStart = (t) => Math.max(0, Math.min(t, Math.max(0, videoDuration - 1)));
  const clampEnd = (t) => Math.max(1, Math.min(t, videoDuration));

  const resolveOne = (clip) => {
    const idx = (clip.momentIndex ?? 0) - 1;
    const moment = (idx >= 0 && idx < allMoments.length) ? allMoments[idx] : null;
    const rawStart = moment?.timestamp ?? clip.startTime ?? clip.start ?? 0;
    const rawLen =
      clip.clipLength ??
      ((clip.endTime ?? clip.end ?? 0) - (clip.startTime ?? clip.start ?? 0)) ??
      4;
    const len = Math.max(1.5, Math.min(10, Number.isFinite(rawLen) && rawLen > 0 ? rawLen : 4));
    const start = clampStart(rawStart);
    return {
      start,
      end: clampEnd(start + len),
      _narrativeReason: clip.reason || moment?.description || 'Selected moment',
      _importance: clip.importance ?? moment?.importance ?? 0.5,
      _zone: moment?.zone || 'unknown',
      _momentIndex: clip.momentIndex
    };
  };

  // Resolve and dedupe by rounded start time (Claude occasionally returns near-duplicates).
  const seen = new Set();
  let resolved = selectedClips.map(resolveOne).filter(c => {
    const key = Math.round(c.start * 10);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const zoneNames = ['opening', 'early', 'middle', 'late', 'finale'];
  const countZones = (clips) => zoneNames.reduce((acc, n) => {
    acc[n] = clips.filter(c => c._zone === n).length;
    return acc;
  }, {});

  const zoneCount = countZones(resolved);
  const total = resolved.length || 1;
  const overloadedZone = zoneNames.find(n => zoneCount[n] / total > 0.4 && zoneCount[n] >= 3);
  const finaleMissing = videoDuration > 300 && zoneCount.finale === 0;

  if (overloadedZone || finaleMissing) {
    console.warn(`⚠️ Smart Gen distribution failed: ${JSON.stringify(zoneCount)} — rebalancing`);

    const usedIndices = new Set(resolved.map(c => c._momentIndex).filter(Boolean));
    const emptyZones = zoneNames.filter(n => zoneCount[n] === 0);

    for (const zoneName of emptyZones) {
      const pick = allMoments
        .map((m, i) => ({ moment: m, idx: i + 1 }))
        .filter(({ moment, idx }) => moment.zone === zoneName && !usedIndices.has(idx))
        .sort((a, b) => (b.moment.importance || 0) - (a.moment.importance || 0))[0];
      if (!pick) continue;

      // Drop the weakest clip from the overloaded zone so we swap, not append.
      if (overloadedZone) {
        const dropIdx = resolved
          .map((c, i) => ({ c, i }))
          .filter(x => x.c._zone === overloadedZone)
          .sort((a, b) => (a.c._importance || 0) - (b.c._importance || 0))[0]?.i;
        if (dropIdx !== undefined) resolved.splice(dropIdx, 1);
      }

      const start = clampStart(pick.moment.timestamp);
      resolved.push({
        start,
        end: clampEnd(start + 4),
        _narrativeReason: pick.moment.description || 'Zone coverage',
        _importance: pick.moment.importance || 0.5,
        _zone: zoneName,
        _momentIndex: pick.idx
      });
      usedIndices.add(pick.idx);
    }

    console.log('✅ Smart Gen rebalanced:', countZones(resolved));
  } else {
    console.log('✅ Smart Gen zone distribution OK:', zoneCount);
  }

  resolved.sort((a, b) => a.start - b.start);
  return resolved;
};

// Multi-modal analysis combining vision and audio
const analyzeMultiModal = async (frames, transcript, audioTopics, targetDuration = 60) => {
  try {
    console.log('🎬 Starting multi-modal analysis (Vision + Audio)...');

    const response = await fetch("/api/analyze-narrative", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        frames: frames,
        targetDuration: targetDuration,
        isMultiModal: true,
        transcript: transcript,
        audioTopics: audioTopics
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Multi-modal API error:', error);
      throw new Error(error.error || 'Failed to analyze');
    }

    const narrative = await response.json();

    // Enhanced logging for multi-modal analysis
    console.log('✅ Multi-modal analysis complete!');
    console.log('🎬 Story Type:', narrative.storyType);
    console.log('📝 Narrative:', narrative.narrative);
    if (narrative.keyMomentsFound && narrative.keyMomentsFound.length > 0) {
      console.log('✅ Key Moments Found:', narrative.keyMomentsFound);
    }
    if (narrative.missingMoments && narrative.missingMoments.length > 0) {
      console.log('⚠️ Missing Moments:', narrative.missingMoments);
    }
    console.log('🎯 Confidence:', narrative.confidence);
    console.log('✂️ Suggested Cuts:', narrative.suggestedCuts?.length);

    return narrative;

  } catch (error) {
    console.error('Multi-modal analysis failed:', error);
    return null;
  }
};

// Refine Claude's cuts with motion detection for cleaner edits
const refineWithMotionDetection = (claudeCuts, videoAnalysis) => {
  if (!videoAnalysis || videoAnalysis.length === 0) {
    return claudeCuts; // No motion data, use Claude's suggestions as-is
  }

  return claudeCuts.map(cut => {
    // Find motion moments within ±2 seconds of Claude's suggestion
    const nearbyStart = videoAnalysis.filter(m =>
      Math.abs(m.time - cut.startTime) < 2
    );

    const nearbyEnd = videoAnalysis.filter(m =>
      Math.abs(m.time - cut.endTime) < 2
    );

    // Prefer scene changes for clean cuts
    const refinedStart = nearbyStart.find(m => m.sceneChange)?.time
      || nearbyStart.sort((a, b) => b.motionScore - a.motionScore)[0]?.time
      || cut.startTime;

    const refinedEnd = nearbyEnd.find(m => m.sceneChange)?.time
      || nearbyEnd.sort((a, b) => b.motionScore - a.motionScore)[0]?.time
      || cut.endTime;

    return {
      start: refinedStart,
      end: refinedEnd,
      reason: cut.reason,
      importance: cut.importance
    };
  });
};

// Gentle Beat-Sync - Snap to beats only when close (non-destructive)
const applyGentleBeatSync = (cuts, musicAnalysis) => {
  if (!musicAnalysis?.beatGrid || musicAnalysis.beatGrid.length === 0) {
    return cuts; // No music, no changes
  }

  const beatGrid = musicAnalysis.beatGrid;

  // Helper: Find closest value in array
  const findClosest = (target, array) => {
    return array.reduce((closest, current) => {
      return Math.abs(current - target) < Math.abs(closest - target)
        ? current
        : closest;
    });
  };

  return cuts.map((cut, index) => {
    // Find nearest beat to start time
    const nearestStartBeat = findClosest(cut.start, beatGrid);
    const startDistance = Math.abs(nearestStartBeat - cut.start);

    // Find nearest beat to end time
    const nearestEndBeat = findClosest(cut.end, beatGrid);
    const endDistance = Math.abs(nearestEndBeat - cut.end);

    // Only snap if beat is CLOSE (within 0.5 seconds)
    const newStart = startDistance < 0.5 ? nearestStartBeat : cut.start;
    const newEnd = endDistance < 0.5 ? nearestEndBeat : cut.end;

    // Ensure anchor is still valid (start < end, minimum 1s duration)
    if (newEnd - newStart >= 1.0) {
      const snapped = startDistance < 0.5 || endDistance < 0.5;
      if (snapped) {
        console.log(`🎵 Beat-snapped cut ${index}:`, {
          original: { start: cut.start.toFixed(2), end: cut.end.toFixed(2) },
          snapped: { start: newStart.toFixed(2), end: newEnd.toFixed(2) }
        });
      }
      return { ...cut, start: newStart, end: newEnd };
    }

    return cut; // Keep original if snap would break it
  });
};

// Extract audio from video and transcribe with Whisper
const transcribeVideo = async (videoFile) => {
  try {
    console.log('🎤 Extracting audio for transcription...');

    // Use FFmpeg to extract audio
    if (!ffmpeg || !ffmpegLoaded) {
      throw new Error('FFmpeg not loaded');
    }

    await ffmpeg.writeFile('input_video.mp4', await fetchFile(videoFile));

    // Extract audio as MP3
    await ffmpeg.exec([
      '-i', 'input_video.mp4',
      '-vn', // No video
      '-acodec', 'libmp3lame',
      '-ar', '16000', // 16kHz sample rate (Whisper optimal)
      '-ac', '1', // Mono
      '-b:a', '32k', // Low bitrate (smaller file)
      'audio.mp3'
    ]);

    const audioData = await ffmpeg.readFile('audio.mp3');
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioData)));

    console.log('📤 Sending audio to Whisper API...');

    // Call our API route
    const response = await fetch('/api/transcribe-audio', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audioBase64: audioBase64
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Transcription failed');
    }

    const transcript = await response.json();

    console.log('✅ Transcription complete:', {
      duration: transcript.duration,
      segments: transcript.segments?.length,
      language: transcript.language
    });

    return transcript;

  } catch (error) {
    console.error('Transcription error:', error);
    return null;
  }
};

// Analyze transcript to find topic transitions and key quotes
const analyzeTranscriptTopics = (transcript) => {
  if (!transcript || !transcript.segments) {
    return { topics: [], keyQuotes: [], pauses: [] };
  }

  const topics = [];
  const keyQuotes = [];
  const pauses = [];

  let currentTopic = {
    start: 0,
    end: 0,
    text: ''
  };

  transcript.segments.forEach((segment, index) => {
    const nextSegment = transcript.segments[index + 1];

    // Detect topic transitions (long pauses or significant text changes)
    if (nextSegment) {
      const pauseDuration = nextSegment.start - segment.end;

      // If pause > 2 seconds, likely a topic transition
      if (pauseDuration > 2.0) {
        currentTopic.end = segment.end;
        if (currentTopic.text.length > 0) {
          topics.push({ ...currentTopic });
        }

        currentTopic = {
          start: nextSegment.start,
          end: nextSegment.end,
          text: nextSegment.text
        };

        pauses.push({
          time: segment.end,
          duration: pauseDuration
        });
      } else {
        currentTopic.end = segment.end;
        currentTopic.text += ' ' + segment.text;
      }
    }

    // Identify potential key quotes (sentences with emphasis words)
    const emphasisWords = ['secret', 'important', 'key', 'critical', 'exactly', 'perfect', 'amazing'];
    const hasEmphasis = emphasisWords.some(word =>
      segment.text.toLowerCase().includes(word)
    );

    if (hasEmphasis && segment.text.split(' ').length > 5) {
      keyQuotes.push({
        time: segment.start,
        text: segment.text,
        importance: 0.8
      });
    }
  });

  // Add final topic
  if (currentTopic.text.length > 0) {
    topics.push(currentTopic);
  }

  return { topics, keyQuotes, pauses };
};

// Refine cuts to align with speech pauses
const refineWithSpeechPauses = (cuts, pauses) => {
  if (!pauses || pauses.length === 0) {
    return cuts; // No pause data, return as-is
  }

  return cuts.map(cut => {
    // Find nearest pause to start time
    const nearbyStartPauses = pauses.filter(p =>
      Math.abs(p.time - cut.startTime) < 2
    ).sort((a, b) =>
      Math.abs(a.time - cut.startTime) - Math.abs(b.time - cut.startTime)
    );

    // Find nearest pause to end time
    const nearbyEndPauses = pauses.filter(p =>
      Math.abs(p.time - cut.endTime) < 2
    ).sort((a, b) =>
      Math.abs(a.time - cut.endTime) - Math.abs(b.time - cut.endTime)
    );

    const refinedStart = nearbyStartPauses[0]?.time || cut.startTime;
    const refinedEnd = nearbyEndPauses[0]?.time || cut.endTime;

    // Ensure valid duration (at least 1 second)
    if (refinedEnd - refinedStart >= 1.0) {
      return {
        ...cut,
        start: refinedStart,
        end: refinedEnd
      };
    }

    return {
      ...cut,
      start: cut.startTime,
      end: cut.endTime
    };
  });
};

  // Optimize video with frequent keyframes for instant seeking (professional NLE quality)
  const optimizeVideoForEditing = async (videoFile) => {
    if (!ffmpeg || !ffmpegLoaded) {
      console.warn('FFmpeg not loaded, skipping optimization');
      return null;
    }

    try {
      setIsOptimizingVideo(true);
      setOptimizationProgress(0);
      console.log('🔧 Optimizing video for editing (adding keyframes)...');

      // Set up progress tracking for optimization
      ffmpeg.on('progress', ({ progress: prog }) => {
        setOptimizationProgress(Math.min(95, Math.round(prog * 100)));
      });

      // Write input file to FFmpeg filesystem
      await ffmpeg.writeFile('input.mp4', await fetchFile(videoFile));

      // Re-mux with frequent keyframes for instant seeking
      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',      // Speed over compression
        '-g', '15',                   // Keyframe every 15 frames (~0.5s at 30fps)
        '-keyint_min', '15',          // Min keyframe interval
        '-sc_threshold', '0',         // Disable scene detection (force keyframes)
        '-c:a', 'copy',               // Copy audio without re-encoding
        'optimized.mp4'
      ]);

      // Read optimized video
      const data = await ffmpeg.readFile('optimized.mp4');
      const optimizedBlob = new Blob([data.buffer], { type: 'video/mp4' });
      const optimizedFile = new File([optimizedBlob], videoFile.name, { type: 'video/mp4' });

      // Cleanup
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('optimized.mp4');

      console.log('✅ Video optimized for editing (instant seeking enabled)');
      setOptimizationProgress(100);
      setIsOptimizingVideo(false);

      return optimizedFile;
    } catch (error) {
      console.error('❌ Video optimization failed:', error);
      setIsOptimizingVideo(false);
      // Return original file if optimization fails
      return null;
    }
  };

  const loadVideoFile = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      showToast('File too large — maximum size is 500 MB', 'warning');
      return;
    }

    // Store original file for export (maintains quality)
    setOriginalVideoFile(file);

    // Create URL for immediate preview
    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setAnchors([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedAnchor(null);
    setSelectedClipFocusTime(null);
    setPreviewAnchor(null);
    setCurrentTime(0);
    setOriginalSoundAnalysis(null);
    setMusicAnalysis(null);
    setMusic(null);
    setMusicUrl(null);
    setBeatSyncTarget('none');
    setMediaCenterCollapsed(true);
    setWorkspaceMode('simple');

    // OPTIMIZATION TEMPORARILY DISABLED (takes several minutes)
    // Testing dual-video system with original video first
    // Once dual-video works smoothly, we can re-enable optimization for even better performance

    /* UNCOMMENT TO RE-ENABLE KEYFRAME OPTIMIZATION:
    if (ffmpeg && ffmpegLoaded) {
      const optimizedFile = await optimizeVideoForEditing(file);
      if (optimizedFile) {
        const optimizedUrl = URL.createObjectURL(optimizedFile);
        setVideo(optimizedFile);
        setVideoUrl(optimizedUrl);
        URL.revokeObjectURL(url);
        console.log('✅ Now using optimized video for editing (instant seeks enabled)');
      }
    }
    */

 try {
    const saved = localStorage.getItem('clipboost-autosave');
    if (saved) {
      const data = JSON.parse(saved);
      const daysSince = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24);
      if (daysSince < 7 && data.anchors && data.anchors.length > 0) {
        setRestoredAnchorCount(data.anchors.length);
        setRestoredVideoName(data.videoName || null);
        setShowRestoreToast(true);
        setTimeout(() => setShowRestoreToast(false), 10000);
      } else {
        localStorage.removeItem('clipboost-autosave');
      }
    }
  } catch (error) {
    console.error('Error checking autosave:', error);
  }
  }, [showToast]);

  // Video handlers
  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    await loadVideoFile(file);
    e.target.value = '';
  };

  const loadDevTestClip = useCallback(async (clipName) => {
    if (!clipName || isLoadingDevClip) return;
    try {
      setIsLoadingDevClip(true);
      const response = await fetch(`/api/dev-testclip?name=${encodeURIComponent(clipName)}`);
      if (!response.ok) throw new Error('Could not load test clip');
      const blob = await response.blob();
      const file = new File([blob], clipName, { type: blob.type || 'video/mp4' });
      await loadVideoFile(file);
      showToast(`Loaded test clip: ${clipName}`, 'success');
    } catch (error) {
      console.error('Dev test clip load failed:', error);
      showToast('Could not load that test clip', 'error');
    } finally {
      setIsLoadingDevClip(false);
    }
  }, [isLoadingDevClip, loadVideoFile, showToast]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(dur);
      // Paint the first frame so the player isn't black on upload
      videoRef.current.currentTime = 0.1;
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current || duration === 0) return;

    const time = videoRef.current.currentTime;
    currentTimeRef.current = time;

    // Direct DOM updates - no React re-render (60fps optimization)
    const percent = Math.max(0, Math.min(100, getTimelinePercent(time)));
    const isInTimelineView = time >= timelineView.start && time <= timelineView.end;

    if (playheadRef.current) {
      playheadRef.current.style.display = isInTimelineView ? 'block' : 'none';
      playheadRef.current.style.left = `${percent}%`;
    }
    if (playheadProgressRef.current) {
      playheadProgressRef.current.style.width = `${percent}%`;
    }
    if (timeDisplayRef.current) {
      timeDisplayRef.current.textContent = `${formatTime(time)} / ${formatTime(duration)}`;
    }
  }, [duration, getTimelinePercent, timelineView]);

  // Preview mode functions
  const startPreviewMode = () => {
    if (anchors.length === 0) {
      showToast('Create some clips first to enable preview', 'warning');
      return;
    }

    setIsPreviewMode(true);
    setPreviewAnchorIndex(0);

    // Set up Web Audio API mixer
    if (videoRef.current && musicRef.current) {
      setupAudioMixer(videoRef.current, musicRef.current);

      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    }

    if (music && musicRef.current) {
      musicRef.current.currentTime = musicStartTime;
      musicRef.current.play();
    }

    if (videoRef.current) {
      videoRef.current.currentTime = anchors[0].start;
      videoRef.current.play();
    }
  };

  const stopPreviewMode = () => {
    setIsPreviewMode(false);
    setPreviewAnchorIndex(0);

    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = musicStartTime;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }

    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
  };

  // Zoom loupe: computes the time window shown in the loupe strip for the selected anchor
  // Computed inline (not memoized) to avoid stale useMemo cache issues
  const loupeWindow = (() => {
    if (!selectedAnchor || !duration) return null;
    const anchor = anchors.find(a => a.id === selectedAnchor);
    if (!anchor) return null;
    const anchorDuration = Math.max(anchor.end - anchor.start, 0.1);
    // Context: proportional but capped — anchor fills ~65-80% of loupe at any clip length
    const CONTEXT = Math.min(Math.max(anchorDuration * 0.25, 0.5), 3);
    const windowDuration = anchorDuration + CONTEXT * 2;
    const center = (anchor.start + anchor.end) / 2;
    const start = Math.max(0, center - windowDuration / 2);
    const end = Math.min(duration, start + windowDuration);
    return { start, end, duration: end - start };
  })();

  // Build preview timeline map from anchors
  const buildPreviewTimeline = useCallback(() => {
    if (anchors.length === 0) {
      setPreviewTimeline([]);
      setPreviewTotalDuration(0);
      return;
    }

    const timeline = [];
    let previewTime = 0;

    // Sort anchors by start time
    const sortedAnchors = [...anchors].sort((a, b) => a.start - b.start);

    sortedAnchors.forEach((anchor, index) => {
      const segmentDuration = anchor.end - anchor.start;

      timeline.push({
        index,
        anchorId: anchor.id,
        previewStart: previewTime,
        previewEnd: previewTime + segmentDuration,
        sourceStart: anchor.start,
        sourceEnd: anchor.end,
        musicTime: musicStartTime + previewTime, // Music plays linearly through preview
        duration: segmentDuration
      });

      previewTime += segmentDuration;
    });

    setPreviewTimeline(timeline);
    setPreviewTotalDuration(previewTime);
  }, [anchors, musicStartTime]);

  // Find which segment contains the preview time
  const findSegmentAtTime = useCallback((time) => {
    return previewTimeline.find(seg =>
      time >= seg.previewStart && time < seg.previewEnd
    ) || previewTimeline[previewTimeline.length - 1];
  }, [previewTimeline]);

  // Seek to preview time
  const seekPreviewTime = useCallback((previewTime) => {
    const segment = findSegmentAtTime(previewTime);
    if (!segment) return;

    const offset = previewTime - segment.previewStart;
    const sourceTime = segment.sourceStart + offset;
    if (segment.anchorId !== undefined) {
      const activeAnchor = anchors.find(a => a.id === segment.anchorId);
      setSelectedAnchor(segment.anchorId);
      setSelectedClipFocusTime(sourceTime);
      if (activeAnchor) {
        setPreviewAnchor(activeAnchor);
        setPreviewHandle(sourceTime > (activeAnchor.start + activeAnchor.end) / 2 ? 'end' : 'start');
      }
    }

    // Always clear stuck-transition state on any manual seek
    transitioningRef.current = false;
    waitingForStandbyRef.current = null;
    standbyReadyRef.current = false;

    // Seek the active video element (may be A or B after a swap)
    const activeVideoEl = activeVideoRef.current === 'A' ? videoRef.current : videoBRef.current;
    const standbyVideoEl = activeVideoRef.current === 'A' ? videoBRef.current : videoRef.current;
    if (activeVideoEl) activeVideoEl.currentTime = sourceTime;
    // Also reset standby to be ready for the segment after this one
    const afterIndex = segment.index + 1;
    if (standbyVideoEl && previewTimeline[afterIndex]) {
      standbyVideoEl.currentTime = previewTimeline[afterIndex].sourceStart;
    }

    // Sync anchor index refs so RAF tracks the right segment
    previewAnchorIndexRef.current = segment.index;
    setPreviewAnchorIndex(segment.index);
    setPreviewCurrentTime(previewTime);
    previewCurrentTimeRef.current = previewTime;

    // Update clips bar playhead
    if (clipsPlayheadRef.current && previewTotalDuration > 0) {
      clipsPlayheadRef.current.style.left = `${(previewTime / previewTotalDuration) * 100}%`;
    }
    // Update main timeline playhead to the source position
    if (duration > 0) {
      const pct = Math.max(0, Math.min(100, getTimelinePercent(sourceTime)));
      const isInTimelineView = sourceTime >= timelineView.start && sourceTime <= timelineView.end;
      if (playheadRef.current) {
        playheadRef.current.style.display = isInTimelineView ? 'block' : 'none';
        playheadRef.current.style.left = `${pct}%`;
      }
      if (playheadProgressRef.current) playheadProgressRef.current.style.width = `${pct}%`;
    }

    // Sync music if available
    if (music && musicRef.current) {
      const musicTime = (segment.musicTime ?? 0) + offset;
      musicRef.current.currentTime = Math.max(0, musicTime);
    }
  }, [findSegmentAtTime, music, previewTimeline, previewTotalDuration, duration, anchors, getTimelinePercent, timelineView]);

  // Scrub clips bar by clientX — called during drag
  const scrubClipsBar = useCallback((clientX) => {
    if (!clipsBarRef.current || previewTotalDuration <= 0) return;
    const rect = clipsBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = pct * previewTotalDuration;
    setPlaybackMode('clips');
    seekPreviewTime(newTime);
  }, [previewTotalDuration, seekPreviewTime]);

  const syncPreviewIndexForAnchor = useCallback((anchorId) => {
    const segmentIndex = previewTimeline.findIndex(segment => segment.anchorId === anchorId);
    if (segmentIndex === -1) return;
    previewAnchorIndexRef.current = segmentIndex;
    setPreviewAnchorIndex(segmentIndex);
  }, [previewTimeline]);

  const markStandbyReadyAfterFrame = useCallback((videoElement) => {
    if (!videoElement || !isPreviewMode) return;

    let marked = false;
    const markReady = () => {
      if (marked) return;
      const currentStandby = activeVideoRef.current === 'A' ? videoBRef.current : videoRef.current;
      if (videoElement === currentStandby) {
        marked = true;
        standbyReadyRef.current = true;
      }
    };

    if (typeof videoElement.requestVideoFrameCallback === 'function') {
      videoElement.requestVideoFrameCallback(markReady);
      setTimeout(markReady, 120);
    } else {
      requestAnimationFrame(markReady);
    }
  }, [isPreviewMode]);

  // Frame thumbnail during loupe handle drag — capture from main video at 100ms intervals
  useEffect(() => {
    // Initialise the offscreen canvas once
    if (!loupeDragThumbCanvas.current) {
      const c = document.createElement('canvas');
      c.width = 120; c.height = 68;
      loupeDragThumbCanvas.current = c;
    }
    if (!dragState.active || dragSourceRef.current !== 'loupe') {
      // Drag ended or not a loupe drag — clear thumbnail
      if (loupeDragThumb !== null) setLoupeDragThumb(null);
      loupeDragActiveRef.current = false;
      return;
    }
    const handle = dragState.handle; // 'anchor-left' | 'anchor-right' | 'anchor-move'
    if (handle !== 'anchor-left' && handle !== 'anchor-right') {
      if (loupeDragThumb !== null) setLoupeDragThumb(null);
      return;
    }
    loupeDragActiveRef.current = true;
    const side = handle === 'anchor-left' ? 'start' : 'end';
    const capture = () => {
      const vid = videoRef.current;
      if (!vid || !loupeDragThumbCanvas.current) return;
      const ctx = loupeDragThumbCanvas.current.getContext('2d');
      try {
        ctx.drawImage(vid, 0, 0, 120, 68);
        const dataUrl = loupeDragThumbCanvas.current.toDataURL('image/jpeg', 0.75);
        setLoupeDragThumb({ dataUrl, side });
      } catch (_) {}
    };
    capture(); // immediate first frame
    const interval = setInterval(capture, 100);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState.active, dragState.handle]);

  // Global listeners for clips bar scrub drag
  useEffect(() => {
    const onMove = (e) => {
      if (!clipsBarScrubRef.current) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      scrubClipsBar(clientX);
    };
    const onUp = () => { clipsBarScrubRef.current = false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [scrubClipsBar]);

  // Start enhanced preview mode with dual-video system
  const startEnhancedPreview = useCallback(async () => {
    if (anchors.length === 0) {
      showToast('Create some clips first to enable preview', 'warning');
      return;
    }

    buildPreviewTimeline();
    setIsPreviewMode(true);
    setPreviewCurrentTime(0);

    // Initialize refs and state for dual-video system
    previewAnchorIndexRef.current = 0;
    setPreviewAnchorIndex(0);

    activeVideoRef.current = 'A';
    // Reset opacity state — A visible, B hidden (standby)
    if (videoRef.current) videoRef.current.style.opacity = '1';
    if (videoBRef.current) videoBRef.current.style.opacity = '0';
    applyElementAudioVolumes();

    // Reset transition flags
    transitioningRef.current = false;
    waitingForStandbyRef.current = null;

    // Initialize dual-video system for gapless playback
    const videoA = videoRef.current;
    const videoB = videoBRef.current;

    if (!videoA || !videoB) {
      console.error('Video elements not ready');
      return;
    }

    // Use anchors directly (timeline will be built from these)
    const firstAnchor = anchors[0];
    const secondAnchor = anchors.length > 1 ? anchors[1] : null;

    // Pre-seek both videos for gapless transitions
    videoA.currentTime = firstAnchor.start;
    if (secondAnchor) {
      standbyReadyRef.current = false;
      videoB.currentTime = secondAnchor.start;
    }

    // Wait for Video A to be seeked and ready
    await new Promise((resolve) => {
      const onSeeked = () => {
        videoA.removeEventListener('seeked', onSeeked);
        resolve();
      };
      videoA.addEventListener('seeked', onSeeked);
    });

    // Set up Web Audio API mixer
    if (videoA && musicRef.current) {
      setupAudioMixer(videoA, musicRef.current);

      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    }

    // Start music from beginning
    if (music && musicRef.current) {
      musicRef.current.currentTime = 0;
      musicRef.current.play();
    }

    // Start video A playback
    setIsPreviewPlaying(true);
    const playPromise = videoA.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Autoplay blocked, user interaction required:', err);
      });
    }

    console.log('✅ Dual-video preview initialized (Video A active, Video B standby)');
  }, [anchors, applyElementAudioVolumes, buildPreviewTimeline, music, setupAudioMixer]);

  // Stop enhanced preview
  const stopEnhancedPreview = useCallback(() => {
    setIsPreviewMode(false);
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewAnchorIndex(0);

    // Clear stuck-transition state
    transitioningRef.current = false;
    waitingForStandbyRef.current = null;

    if (previewAnimationRef.current) {
      cancelAnimationFrame(previewAnimationRef.current);
      previewAnimationRef.current = null;
    }

    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = musicStartTime;
    }

    // Pause BOTH video elements — active may be A or B after swaps
    if (videoRef.current) videoRef.current.pause();
    if (videoBRef.current) videoBRef.current.pause();

    // Reset dual-video visual state: A visible, B hidden. Ensures the main
    // (non-preview) video player always shows A.
    activeVideoRef.current = 'A';
    standbyReadyRef.current = false;
    if (videoRef.current) {
      videoRef.current.style.opacity = '1';
    }
    if (videoBRef.current) {
      videoBRef.current.style.opacity = '0';
    }
    applyElementAudioVolumes();
  }, [applyElementAudioVolumes, musicStartTime]);

  // Toggle preview playback
  const togglePreviewPlayback = useCallback(() => {
    // If not in preview mode, start it
    if (!isPreviewMode) {
      startEnhancedPreview();
      return;
    }

    // Toggle play/pause — affect whichever video is currently active
    const activeVideoEl = activeVideoRef.current === 'A' ? videoRef.current : videoBRef.current;
    if (isPreviewPlaying) {
      setIsPreviewPlaying(false);
      if (videoRef.current) videoRef.current.pause();
      if (videoBRef.current) videoBRef.current.pause(); // pause both to be safe
      if (musicRef.current) musicRef.current.pause();
    } else {
      setIsPreviewPlaying(true);
      if (activeVideoEl) activeVideoEl.play().catch(() => {});
      if (musicRef.current) musicRef.current.play().catch(() => {});
    }
  }, [isPreviewMode, isPreviewPlaying, startEnhancedPreview]);

  // Rebuild timeline when anchors change
  useEffect(() => {
    // Always build preview timeline when anchors change (for clips timeline display)
    buildPreviewTimeline();
  }, [anchors, buildPreviewTimeline]);

  // Capture thumbnails for any anchors that don't have one yet.
  // AUDIT P1 #8: previous impl used ONE video element and seeked serially — ~500ms
  // per anchor, 5s+ for 10 clips, with no error handling. Now we spawn detached
  // video elements in a small pool (cap 4 concurrent) so captures run in parallel,
  // wrap each in try/catch, and surface a toast if more than 30% fail.
  useEffect(() => {
    if (!videoUrl || anchors.length === 0) return;
    const missing = anchors.filter(a => !clipThumbnails[a.id]);
    if (missing.length === 0) return;

    let cancelled = false;
    const videos = new Set();
    const POOL_SIZE = Math.min(4, missing.length);

    const captureOne = (anchor) => new Promise((resolve) => {
      const vid = document.createElement('video');
      videos.add(vid);
      vid.src = videoUrl;
      vid.muted = true;
      vid.preload = 'metadata';
      vid.crossOrigin = 'anonymous';

      const mid = (anchor.start + anchor.end) / 2;
      let timeoutId = null;

      const cleanup = () => {
        clearTimeout(timeoutId);
        vid.removeAttribute('src');
        vid.load();
        videos.delete(vid);
      };

      const finish = (ok) => {
        if (cancelled) return resolve(false);
        cleanup();
        resolve(ok);
      };

      const drawAndStore = () => {
        if (cancelled) return finish(false);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 160;
          canvas.height = 90;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(vid, 0, 0, 160, 90);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setClipThumbnails(prev => ({ ...prev, [anchor.id]: dataUrl }));
          finish(true);
        } catch (err) {
          console.warn(`Thumbnail capture failed for anchor ${anchor.id}:`, err);
          finish(false);
        }
      };

      vid.addEventListener('loadedmetadata', () => {
        if (cancelled) return finish(false);
        vid.currentTime = mid;
      }, { once: true });
      vid.addEventListener('seeked', drawAndStore, { once: true });
      vid.addEventListener('error', () => finish(false), { once: true });

      // Safety: if neither seeked nor error fires within 3s, give up on this one.
      timeoutId = setTimeout(() => finish(false), 3000);
      vid.load();
    });

    // Run with bounded concurrency so mobile browsers don't choke on N video elements.
    const runPool = async () => {
      const queue = [...missing];
      const results = [];
      const workers = Array.from({ length: POOL_SIZE }, async () => {
        while (queue.length > 0 && !cancelled) {
          const anchor = queue.shift();
          const ok = await captureOne(anchor);
          results.push(ok);
        }
      });
      await Promise.all(workers);
      if (cancelled) return;
      const failed = results.filter(r => !r).length;
      if (results.length > 0 && failed / results.length > 0.3) {
        showToast(`Thumbnail capture failed for ${failed} of ${results.length} clips`, 'warning');
      }
    };

    runPool();

    return () => {
      cancelled = true;
      videos.forEach(v => {
        v.removeAttribute('src');
        try { v.load(); } catch (_) {}
      });
      videos.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchors, videoUrl]);

  // Keyboard shortcuts for preview mode
  useEffect(() => {
    if (!isPreviewMode) return;

    const handleKeyDown = (e) => {
      // Prevent default behavior if we're handling the key
      switch (e.key) {
        case ' ':
        case 'Spacebar':
          e.preventDefault();
          togglePreviewPlayback();
          break;
        case 'Escape':
          e.preventDefault();
          stopEnhancedPreview();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          const prevIndex = Math.max(0, previewAnchorIndex - 1);
          if (prevIndex !== previewAnchorIndex && previewTimeline[prevIndex]) {
            seekPreviewTime(previewTimeline[prevIndex].previewStart);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          const nextIndex = Math.min(previewTimeline.length - 1, previewAnchorIndex + 1);
          if (nextIndex !== previewAnchorIndex && previewTimeline[nextIndex]) {
            seekPreviewTime(previewTimeline[nextIndex].previewStart);
          }
          break;
        case 'Home':
          e.preventDefault();
          seekPreviewTime(0);
          break;
        case 'End':
          e.preventDefault();
          if (previewTimeline.length > 0) {
            const lastSegment = previewTimeline[previewTimeline.length - 1];
            seekPreviewTime(lastSegment.previewStart);
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewMode, togglePreviewPlayback, stopEnhancedPreview, previewAnchorIndex, previewTimeline, seekPreviewTime]);

  // Dual-video gapless preview (professional NLE quality) - WITH DEBUG LOGGING
  useEffect(() => {
    if (!isPreviewMode || !isPreviewPlaying || previewTimeline.length === 0) {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
      // Reset transition state when stopping preview
      transitioningRef.current = false;
      waitingForStandbyRef.current = null;
      return;
    }

    // DON'T reset transition state here - would break mid-transition
    // Only reset when preview stops (in cleanup above)

    const updatePreviewTime = () => {
      // Get active and standby video refs (read from ref, not state)
      const activeVideoEl = activeVideoRef.current === 'A' ? videoRef.current : videoBRef.current;
      const standbyVideoEl = activeVideoRef.current === 'A' ? videoBRef.current : videoRef.current;

      if (!activeVideoEl) {
        previewAnimationRef.current = requestAnimationFrame(updatePreviewTime);
        return;
      }

      const currentIndex = previewAnchorIndexRef.current;
      const currentSegment = previewTimeline[currentIndex];
      if (!currentSegment) return;

      const sourceTime = activeVideoEl.currentTime;
      const offset = sourceTime - currentSegment.sourceStart;
      const newPreviewTime = currentSegment.previewStart + offset;

      // DOM update: no React re-render every frame
      previewCurrentTimeRef.current = newPreviewTime;
      if (clipsPlayheadRef.current && previewTotalDuration > 0) {
        clipsPlayheadRef.current.style.left = `${(newPreviewTime / previewTotalDuration) * 100}%`;
      }
      if (clipsTimeDisplayRef.current) {
        clipsTimeDisplayRef.current.textContent = `${Math.floor(newPreviewTime / 60)}:${String(Math.floor(newPreviewTime % 60)).padStart(2, '0')} / ${Math.floor(previewTotalDuration / 60)}:${String(Math.floor(previewTotalDuration % 60)).padStart(2, '0')}`;
      }
      // Also keep the main timeline playhead in sync with the source position
      if (duration > 0) {
        const pct = Math.max(0, Math.min(100, getTimelinePercent(sourceTime)));
        const isInTimelineView = sourceTime >= timelineView.start && sourceTime <= timelineView.end;
        if (playheadRef.current) {
          playheadRef.current.style.display = isInTimelineView ? 'block' : 'none';
          playheadRef.current.style.left = `${pct}%`;
        }
        if (playheadProgressRef.current) playheadProgressRef.current.style.width = `${pct}%`;
      }

      // Reached the end of the current segment — swap if standby is pre-seeked.
      // Previously triggered 200ms early to mask swap latency, which shortened
      // every clip by 200ms. With direct-ref opacity flip + no pause→play
      // setTimeout, the swap is effectively instant, so we fire 40ms early
      // purely as a safety cushion.
      const shouldTransition = sourceTime >= currentSegment.sourceEnd - 0.04 || transitioningRef.current;
      if (shouldTransition) {
        const nextIndex = currentIndex + 1;

        if (nextIndex < previewTimeline.length) {
          const nextSegment = previewTimeline[nextIndex];

          // GAPLESS SWAP — standby is already at nextSegment.sourceStart.
          if (standbyReadyRef.current && standbyVideoEl) {
            waitingForStandbyRef.current = null;
            transitioningRef.current = false;

            // Ownership flips
            const newActiveVideo = activeVideoRef.current === 'A' ? 'B' : 'A';
            activeVideoRef.current = newActiveVideo;

            // Audio ownership — only the active video is unmuted (music has its own element)
            applyElementAudioVolumes();

            // Hard-cut the layers only after the standby has presented a frame.
            // Fading these layers creates a visible one-frame blend between clips.
            standbyVideoEl.style.opacity = '1';
            activeVideoEl.style.opacity = '0';

            // Clip index + preview-card selection track the currently-playing clip
            previewAnchorIndexRef.current = nextIndex;
            setPreviewAnchorIndex(nextIndex);
            setPreviewCurrentTime(nextSegment.previewStart);
            if (nextSegment.anchorId !== undefined) {
              setSelectedAnchor(nextSegment.anchorId);
              setSelectedClipFocusTime(nextSegment.sourceStart);
            }

            // Start new active, stop old. Play before pause so the first new
            // frame is already rendering when the old element stops — no gap.
            standbyVideoEl.play().catch(err => console.error('❌ Standby play failed:', err));
            activeVideoEl.pause();

            // Pre-seek the now-standby to the clip after next
            const afterNextIndex = nextIndex + 1;
            if (afterNextIndex < previewTimeline.length) {
              standbyReadyRef.current = false;
              activeVideoEl.currentTime = previewTimeline[afterNextIndex].sourceStart;
            }
          } else if (standbyVideoEl) {
            // WAIT FOR STANDBY — keep the visible video rolling while the hidden
            // element catches up. On slower/mobile devices this feels smoother
            // than freezing on the last frame, and exports remain unaffected.
            if (!waitingForStandbyRef.current) {
              waitingForStandbyRef.current = Date.now();
              transitioningRef.current = true;
            }

            if (Date.now() - waitingForStandbyRef.current > 500) {
              waitingForStandbyRef.current = null;
              transitioningRef.current = false;

              previewAnchorIndexRef.current = nextIndex;
              setPreviewAnchorIndex(nextIndex);
              setPreviewCurrentTime(nextSegment.previewStart);
              if (nextSegment.anchorId !== undefined) {
                setSelectedAnchor(nextSegment.anchorId);
                setSelectedClipFocusTime(nextSegment.sourceStart);
              }

              activeVideoEl.currentTime = nextSegment.sourceStart;
              activeVideoEl.play().catch(err => console.error('❌ Play failed:', err));
            }
            // else keep waiting; RAF will check again next frame
          } else {
            // No standby element available — single-video seek.
            transitioningRef.current = false;
            previewAnchorIndexRef.current = nextIndex;
            setPreviewAnchorIndex(nextIndex);
            setPreviewCurrentTime(nextSegment.previewStart);
            if (nextSegment.anchorId !== undefined) {
              setSelectedAnchor(nextSegment.anchorId);
              setSelectedClipFocusTime(nextSegment.sourceStart);
            }

            activeVideoEl.currentTime = nextSegment.sourceStart;
            if (activeVideoEl.paused) {
              activeVideoEl.play().catch(err => console.error('❌ Play failed:', err));
            }
          }

        } else {
          // End of preview - loop or stop
          transitioningRef.current = false; // Reset transition flag
          waitingForStandbyRef.current = null; // Reset waiting timer
          setIsPreviewPlaying(false);
          activeVideoEl.pause();
          if (musicRef.current) musicRef.current.pause();
          seekPreviewTime(0);
          return;
        }
      }

      previewAnimationRef.current = requestAnimationFrame(updatePreviewTime);
    };

    previewAnimationRef.current = requestAnimationFrame(updatePreviewTime);

    return () => {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreviewMode, isPreviewPlaying, previewTimeline, getTimelinePercent, timelineView]);

  // Music handlers
  const loadMusicFile = useCallback((file) => {
    if (!file) return;
    if (musicUrl) URL.revokeObjectURL(musicUrl);

    setMusic(file);
    setMusicAnalysis(null);
    setMusicUrl(URL.createObjectURL(file));
    setMusicStartTime(0);
    setMusicEndTime(0);
    setMusicDuration(0);
  }, [musicUrl]);

  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      loadMusicFile(file);
      e.target.value = '';
    }
  };

  const loadDevTestMusic = useCallback(async (trackName) => {
    if (!trackName || isLoadingDevMusic) return;
    try {
      setIsLoadingDevMusic(true);
      const response = await fetch(`/api/dev-testclip?name=${encodeURIComponent(trackName)}`);
      if (!response.ok) throw new Error('Could not load test music');
      const blob = await response.blob();
      const file = new File([blob], trackName, { type: blob.type || 'audio/mpeg' });
      loadMusicFile(file);
      showToast(`Loaded music: ${trackName}`, 'success');
    } catch (error) {
      console.error('Dev test music load failed:', error);
      showToast('Could not load that music track', 'error');
    } finally {
      setIsLoadingDevMusic(false);
    }
  }, [isLoadingDevMusic, loadMusicFile, showToast]);

  const handleMusicLoadedMetadata = () => {
    if (musicRef.current) {
      const dur = musicRef.current.duration;
      setMusicDuration(dur);
      if (musicEndTime === 0) {
        setMusicEndTime(dur); // Initially select full song
      }
    }
  };

  const toggleMusicPreview = () => {
    if (musicRef.current) {
      if (isMusicPlaying) {
        musicRef.current.pause();
      } else {
        musicRef.current.currentTime = musicStartTime;
        musicRef.current.play();
      }
      setIsMusicPlaying(!isMusicPlaying);
    }
  };

  // Adjust music handle with audio preview
  const adjustMusicHandle = useCallback((delta) => {
    if (!selectedMusicHandle || !music) return;

    const minDuration = 1.0; // Minimum 1 second duration

    if (selectedMusicHandle === 'start') {
      const newStart = Math.max(0, Math.min((musicEndTime || musicDuration) - minDuration, musicStartTime + delta));
      setMusicStartTime(newStart);

      // Preview: Play 1s FROM start position
      if (musicRef.current) {
        musicRef.current.currentTime = newStart;
        musicRef.current.play();
        setTimeout(() => {
          if (musicRef.current) {
            musicRef.current.pause();
            musicRef.current.currentTime = newStart;
          }
        }, 1000);
      }
    } else if (selectedMusicHandle === 'end') {
      const newEnd = Math.max(musicStartTime + minDuration, Math.min(musicDuration, (musicEndTime || musicDuration) + delta));
      setMusicEndTime(newEnd);

      // Preview: Play 1s BEFORE end position
      if (musicRef.current) {
        const previewStart = Math.max(0, newEnd - 1.0);
        musicRef.current.currentTime = previewStart;
        musicRef.current.play();
        setTimeout(() => {
          if (musicRef.current) {
            musicRef.current.pause();
            musicRef.current.currentTime = newEnd;
          }
        }, 1000);
      }
    }
  }, [selectedMusicHandle, music, musicStartTime, musicEndTime, musicDuration]);

  // Keyboard shortcuts for music handle adjustment
  useEffect(() => {
    if (!selectedMusicHandle || !music) return;

    const handleKeyDown = (e) => {
      // Prevent if typing in input field
      if (e.target.tagName === 'INPUT') return;

      let delta = 0;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        delta = e.shiftKey ? -5 : -1;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        delta = e.shiftKey ? 5 : 1;
      } else if (e.code === 'Space') {
        e.preventDefault();
        toggleMusicPreview();
        return;
      } else if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedMusicHandle(prev =>
          prev === 'start' ? 'end' :
          prev === 'end' ? 'start' :
          'start'
        );
        return;
      }

      if (delta !== 0) {
        adjustMusicHandle(delta);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedMusicHandle, music, musicStartTime, musicEndTime, musicDuration, adjustMusicHandle, toggleMusicPreview]);

  // Timeline interaction (memoized)
  const seekToPosition = useCallback((e) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const time = getTimelineTimeFromClientX(e.clientX, rect);
    videoRef.current.currentTime = time;
    currentTimeRef.current = time;
    setCurrentTime(time); // Update state for initial render
  }, [getTimelineTimeFromClientX]);

  const handleTimelineMouseDown = useCallback((e) => {
    if (!timelineRef.current || !videoRef.current) return;
    setDragState({
      active: true,
      type: 'timeline',
      startX: e.clientX,
      anchorSnapshot: null
    });
    seekToPosition(e);
  }, [seekToPosition]);

  // Handle double-tap on timeline (mobile)
  const handleTimelineDoubleTap = useCallback((e) => {
    if (!timelineRef.current || !duration) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const time = getTimelineTimeFromClientX(touch.clientX, rect);

    const newAnchor = {
      id: Date.now(),
      start: time,
      end: Math.min(time + 1, duration)
    };

    const hasOverlap = anchors.some(a =>
      (newAnchor.start >= a.start && newAnchor.start < a.end) ||
      (newAnchor.end > a.start && newAnchor.end <= a.end) ||
      (newAnchor.start <= a.start && newAnchor.end >= a.end)
    );

    if (!hasOverlap) {
      const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
      setAnchors(updated);
      saveToHistory(updated);
      setSelectedAnchor(newAnchor.id);
      setSelectedClipFocusTime(newAnchor.start);

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  }, [duration, anchors, saveToHistory, getTimelineTimeFromClientX]);

  // Anchor management (memoized)
  const addAnchor = useCallback(() => {
    if (!duration) return;

    const newAnchor = {
      id: Date.now(),
      start: currentTimeRef.current,
      end: Math.min(currentTime + 1, duration)
    };

    const hasOverlap = anchors.some(a =>
      (newAnchor.start >= a.start && newAnchor.start < a.end) ||
      (newAnchor.end > a.start && newAnchor.end <= a.end) ||
      (newAnchor.start <= a.start && newAnchor.end >= a.end)
    );

    if (hasOverlap) {
      showToast('Clip overlaps with an existing clip — try a different position', 'warning');
      return;
    }

    const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
    setAnchors(updated);
    saveToHistory(updated);
    setSelectedAnchor(newAnchor.id);
    setSelectedClipFocusTime(newAnchor.start);
  }, [duration, currentTime, anchors, saveToHistory]);

  const deleteAnchor = useCallback((anchorId) => {
    const updated = anchors.filter(a => a.id !== anchorId);
    setAnchors(updated);
    saveToHistory(updated);
    if (selectedAnchor === anchorId) {
      setSelectedAnchor(null);
      setSelectedClipFocusTime(null);
    }
    if (previewAnchor?.id === anchorId) {
      setPreviewAnchor(null);
    }
    // AUDIT P0 #3: without this, the precision modal would keep rendering with
    // a stale reference after the underlying anchor was deleted.
    if (precisionAnchor?.id === anchorId) {
      setPrecisionAnchor(null);
      setShowPrecisionModal(false);
    }
    // Mark delete hint as seen
    setHasSeenDeleteHint(true);
  }, [anchors, saveToHistory, selectedAnchor, previewAnchor, precisionAnchor]);

  // Nudge selected anchor start or end by one video frame (1/30s)
  const nudgeAnchor = useCallback((handle, direction, frames = 1, options = {}) => {
    const { commit = true } = options;
    const activeAnchorId = selectedAnchorRef.current;
    if (!activeAnchorId) return;

    const sortedAnchors = [...anchorsRef.current].sort((a, b) => a.start - b.start);
    const activeIndex = sortedAnchors.findIndex(a => a.id === activeAnchorId);
    const previousAnchor = activeIndex > 0 ? sortedAnchors[activeIndex - 1] : null;
    const nextAnchor = activeIndex >= 0 && activeIndex < sortedAnchors.length - 1 ? sortedAnchors[activeIndex + 1] : null;
    const minStart = previousAnchor ? previousAnchor.end : 0;
    const maxEnd = nextAnchor ? nextAnchor.start : duration;

    let focusedTime = null;
    let changed = false;
    const updated = anchorsRef.current.map(a => {
      if (a.id !== activeAnchorId) return a;
      const delta = direction * frames * FRAME_STEP;
      if (handle === 'start') {
        const newStart = Math.max(minStart, Math.min(a.start + delta, a.end - FRAME_STEP));
        if (newStart === a.start) return a;
        changed = true;
        focusedTime = newStart;
        return { ...a, start: newStart };
      }
      const newEnd = Math.max(a.start + FRAME_STEP, Math.min(a.end + delta, maxEnd));
      if (newEnd === a.end) return a;
      changed = true;
      focusedTime = newEnd;
      return { ...a, end: newEnd };
    });

    if (!changed) return;
    anchorsRef.current = updated;
    setAnchors(updated);
    setSelectedClipFocusTime(focusedTime);
    const updatedAnchor = updated.find(a => a.id === activeAnchorId);
    if (updatedAnchor) {
      setPreviewAnchor(updatedAnchor);
      setPreviewHandle(handle);
    }
    if (cardVideoRef.current && focusedTime !== null) {
      cardVideoRef.current.currentTime = focusedTime;
    }
    if (commit) {
      saveToHistory(updated);
    }
  }, [duration, saveToHistory]);

  const finishNudgeHold = useCallback(() => {
    if (nudgeHoldRef.current.timeoutId) clearTimeout(nudgeHoldRef.current.timeoutId);
    if (nudgeHoldRef.current.intervalId) clearInterval(nudgeHoldRef.current.intervalId);
    if (nudgeHoldRef.current.active) {
      saveToHistory(anchorsRef.current);
    }
    nudgeHoldRef.current = { intervalId: null, timeoutId: null, active: false };
    setNudgeActivity({ handle: null, direction: 0, intensity: 0 });
  }, [saveToHistory]);

  const startNudgeHold = useCallback((event, handle, direction, frames = 1) => {
    event.preventDefault();
    event.stopPropagation();
    finishNudgeHold();

    let tick = 0;
    const run = () => {
      tick += 1;
      const boost = tick > 24 ? 3 : tick > 10 ? 2 : 1;
      nudgeAnchor(handle, direction, frames * boost, { commit: false });
      setNudgeActivity({ handle, direction, intensity: boost });
    };

    nudgeHoldRef.current.active = true;
    run();
    nudgeHoldRef.current.timeoutId = setTimeout(() => {
      nudgeHoldRef.current.intervalId = setInterval(run, 120);
    }, 260);

    document.addEventListener('pointerup', finishNudgeHold, { once: true });
    document.addEventListener('pointercancel', finishNudgeHold, { once: true });
  }, [finishNudgeHold, nudgeAnchor]);

  const startBoundaryMapHandleDrag = useCallback((event, handle, edgeWindowStart, edgeWindowEnd) => {
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const originTarget = event.currentTarget;
    if (originTarget?.setPointerCapture && pointerId !== undefined) {
      try { originTarget.setPointerCapture(pointerId); } catch (_) {}
    }

    const mapEl = originTarget.closest('[data-boundary-map]');
    if (!mapEl) return;
    const rect = mapEl.getBoundingClientRect();
    const rangeDuration = Math.max(FRAME_STEP, edgeWindowEnd - edgeWindowStart);
    let didMove = false;
    setPreviewHandle(handle);
    const selected = anchorsRef.current.find(a => a.id === selectedAnchorRef.current);
    if (selected) {
      const focusTime = handle === 'end' ? Math.max(selected.start, selected.end - FRAME_STEP) : selected.start;
      setSelectedClipFocusTime(focusTime);
      if (cardVideoRef.current) cardVideoRef.current.currentTime = focusTime;
    }

    const applyDrag = (clientX) => {
      const activeAnchorId = selectedAnchorRef.current;
      if (!activeAnchorId) return;

      const percent = Math.max(0, Math.min(1, ((clientX || rect.left) - rect.left) / rect.width));
      const rawTime = edgeWindowStart + (percent * rangeDuration);
      const snappedTime = Math.round(rawTime / FRAME_STEP) * FRAME_STEP;
      let focusedTime = null;
      let changed = false;

      const updated = anchorsRef.current.map(a => {
        if (a.id !== activeAnchorId) return a;

        if (handle === 'start') {
          const newStart = Math.max(edgeWindowStart, Math.min(snappedTime, a.end - FRAME_STEP));
          if (newStart === a.start) return a;
          changed = true;
          focusedTime = newStart;
          return { ...a, start: newStart };
        }

        const newEnd = Math.max(a.start + FRAME_STEP, Math.min(snappedTime, edgeWindowEnd));
        if (newEnd === a.end) return a;
        changed = true;
        focusedTime = Math.max(a.start, newEnd - FRAME_STEP);
        return { ...a, end: newEnd };
      });

      if (!changed) return;
      didMove = true;
      anchorsRef.current = updated;
      setAnchors(updated);
      setSelectedClipFocusTime(focusedTime);
      const updatedAnchor = updated.find(a => a.id === activeAnchorId);
      if (updatedAnchor) {
        setPreviewAnchor(updatedAnchor);
        setPreviewHandle(handle);
      }
      if (cardVideoRef.current && focusedTime !== null) {
        cardVideoRef.current.currentTime = focusedTime;
      }
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      if (didMove) {
        saveToHistory(anchorsRef.current);
      }
    };

    const handleMove = (moveEvent) => applyDrag(moveEvent.clientX);

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', cleanup, { once: true });
    document.addEventListener('pointercancel', cleanup, { once: true });
  }, [saveToHistory]);

  const startRailPuckDrag = useCallback((event, handle) => {
    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const originTarget = event.currentTarget;
    if (originTarget?.setPointerCapture && pointerId !== undefined) {
      try { originTarget.setPointerCapture(pointerId); } catch (_) {}
    }

    const originX = event.clientX || 0;
    let pullState = { direction: 0, frames: 0, offset: 0 };
    let didNudge = false;
    let lastImmediateNudge = 0;

    setPreviewHandle(handle);
    const selected = anchorsRef.current.find(a => a.id === selectedAnchorRef.current);
    if (selected) {
      const focusTime = handle === 'end' ? Math.max(selected.start, selected.end - FRAME_STEP) : selected.start;
      setSelectedClipFocusTime(focusTime);
      if (cardVideoRef.current) cardVideoRef.current.currentTime = focusTime;
    }

    const run = () => {
      if (!pullState.direction || !pullState.frames) return;
      didNudge = true;
      nudgeAnchor(handle, pullState.direction, pullState.frames, { commit: false });
      setNudgeActivity({
        handle,
        direction: pullState.direction,
        intensity: pullState.frames >= 5 ? 3 : 1,
        frames: pullState.frames,
        offset: pullState.offset,
      });
    };

    const intervalId = setInterval(run, 130);

    const handleMove = (moveEvent) => {
      const deltaX = (moveEvent.clientX || originX) - originX;
      const offset = Math.max(-42, Math.min(42, deltaX));
      const abs = Math.abs(deltaX);

      if (abs < 12) {
        pullState = { direction: 0, frames: 0, offset };
        setNudgeActivity({ handle, direction: 0, intensity: 0, frames: 0, offset });
        return;
      }

      const direction = Math.sign(deltaX);
      const frames = abs >= 32 ? 5 : 1;
      pullState = { direction, frames, offset };
      setNudgeActivity({
        handle,
        direction,
        intensity: frames >= 5 ? 3 : 1,
        frames,
        offset,
      });

      const now = Date.now();
      if (now - lastImmediateNudge > 120) {
        lastImmediateNudge = now;
        run();
      }
    };

    const cleanup = () => {
      clearInterval(intervalId);
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      if (didNudge) {
        saveToHistory(anchorsRef.current);
      }
      setNudgeActivity({ handle: null, direction: 0, intensity: 0, frames: 0, offset: 0 });
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', cleanup, { once: true });
    document.addEventListener('pointercancel', cleanup, { once: true });
  }, [saveToHistory, nudgeAnchor]);

  const focusInlineAnchor = useCallback((anchor, handle = 'start') => {
    if (!anchor) return;
    const focusTime = handle === 'end'
      ? Math.max(anchor.start, anchor.end - FRAME_STEP)
      : anchor.start;

    setSelectedAnchor(anchor.id);
    setSelectedClipFocusTime(focusTime);
    syncPreviewIndexForAnchor(anchor.id);
    setHoveredAnchor(null);
    setPreviewAnchor(anchor);
    setPreviewHandle(handle);

    if (videoRef.current) {
      videoRef.current.currentTime = focusTime;
      currentTimeRef.current = focusTime;
      setCurrentTime(focusTime);
    }
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = focusTime;
    }
    if (cardVideoRef.current) {
      cardVideoRef.current.currentTime = focusTime;
    }
  }, [syncPreviewIndexForAnchor]);

  const handleAnchorClick = useCallback((e, anchor) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent mobile tap delay

    focusInlineAnchor(anchor, 'start');
  }, [focusInlineAnchor]);

  // Update preview video time when hovering/selecting different anchors or changing handle
  useEffect(() => {
    const anchor = previewAnchor || hoveredAnchor;
    if (anchor && previewVideoRef.current) {
      // Show the frame based on which handle is being previewed
      const time = previewHandle === 'end' ? anchor.end : anchor.start;
      previewVideoRef.current.currentTime = time;
    }
  }, [hoveredAnchor, previewAnchor, previewHandle]);

  // Click outside to deselect anchor
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if clicking outside anchor areas and preview panel
      const clickedAnchor = e.target.closest('[data-anchor-element]');
      const clickedPreview = e.target.closest('[data-preview-panel]');

      if (!clickedAnchor && !clickedPreview && previewAnchor) {
        setPreviewAnchor(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [previewAnchor]);

  const handleAnchorMouseDown = useCallback((e, anchor, dragType) => {
    e.stopPropagation();
    setSelectedAnchor(anchor.id);
    setSelectedClipFocusTime(dragType === 'anchor-right' ? anchor.end : anchor.start);
    syncPreviewIndexForAnchor(anchor.id);
    setPreviewAnchor(anchor);
    setPreviewHandle(dragType === 'anchor-right' ? 'end' : 'start');

    const startX = e.clientX || e.touches?.[0]?.clientX || 0;

    if (dragType === 'anchor-left' || dragType === 'anchor-right') {
      // HANDLES: activate drag immediately — quick drag = resize that end
      // If held ≥ 1s without significant movement, upgrade to moving the whole anchor
      dragLiveXRef.current = startX;
      dragSourceRef.current = 'main';
      setDragState({
        active: true,
        type: dragType,
        startX,
        anchorSnapshot: { ...anchor }
      });

      upgradeTimerRef.current = setTimeout(() => {
        const moved = Math.abs(dragLiveXRef.current - startX);
        if (moved < 15) {
          // User held still for 1s — upgrade to whole-anchor move + haptic
          if (navigator.vibrate) navigator.vibrate([40, 15, 40]);
          setDragState(prev =>
            prev.active ? { ...prev, type: 'anchor-move', startX: dragLiveXRef.current, anchorSnapshot: { ...anchor } } : prev
          );
        }
        upgradeTimerRef.current = null;
      }, 1000);

    } else {
      // BODY: existing hold-to-drag (400ms) — unchanged
      setHoldingAnchor({ id: anchor.id, type: dragType });
      dragSourceRef.current = 'main';
      holdTimerRef.current = setTimeout(() => {
        if (navigator.vibrate) {
          navigator.vibrate([30, 10, 30]);
        }
        setDragState({
          active: true,
          type: dragType,
          startX,
          anchorSnapshot: { ...anchor }
        });
      }, HOLD_DURATION_MS);
    }
  }, [syncPreviewIndexForAnchor]);

  const handleAnchorTouchStart = useCallback((e, anchor, dragType) => {
    e.stopPropagation();
    e.preventDefault();

    const touch = e.touches?.[0];
    if (dragType === 'anchor-move' && touch) {
      const now = Date.now();
      const previousTap = lastAnchorTapRef.current;
      const distance = Math.sqrt(
        Math.pow(touch.clientX - previousTap.x, 2) +
        Math.pow(touch.clientY - previousTap.y, 2)
      );

      if (previousTap.id === anchor.id && now - previousTap.time < 350 && distance < 40) {
        lastAnchorTapRef.current = { id: null, time: 0, x: 0, y: 0 };
        deleteAnchor(anchor.id);
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
        return;
      }

      lastAnchorTapRef.current = { id: anchor.id, time: now, x: touch.clientX, y: touch.clientY };
    }

    if (navigator.vibrate) navigator.vibrate(10);

    setSelectedAnchor(anchor.id);
    setSelectedClipFocusTime(dragType === 'anchor-right' ? anchor.end : anchor.start);
    syncPreviewIndexForAnchor(anchor.id);
    setPreviewAnchor(anchor);
    setPreviewHandle(dragType === 'anchor-right' ? 'end' : 'start');

    const startX = e.touches?.[0]?.clientX || 0;

    if (dragType === 'anchor-left' || dragType === 'anchor-right') {
      dragLiveXRef.current = startX;
      dragSourceRef.current = 'main';
      setDragState({
        active: true,
        type: dragType,
        startX,
        anchorSnapshot: { ...anchor }
      });

      upgradeTimerRef.current = setTimeout(() => {
        const moved = Math.abs(dragLiveXRef.current - startX);
        if (moved < 15) {
          if (navigator.vibrate) navigator.vibrate([40, 15, 40]);
          setDragState(prev =>
            prev.active ? { ...prev, type: 'anchor-move', startX: dragLiveXRef.current, anchorSnapshot: { ...anchor } } : prev
          );
        }
        upgradeTimerRef.current = null;
      }, 1000);

    } else {
      setHoldingAnchor({ id: anchor.id, type: dragType });
      dragSourceRef.current = 'main';
      holdTimerRef.current = setTimeout(() => {
        if (navigator.vibrate) navigator.vibrate([30, 10, 30]);
        setDragState({
          active: true,
          type: dragType,
          startX,
          anchorSnapshot: { ...anchor }
        });
      }, HOLD_DURATION_MS);
    }
  }, [deleteAnchor, syncPreviewIndexForAnchor]);

  // Persistent drag handlers with 60fps throttling (optimized)
  const rafIdRef = useRef(null);
  const dragDataRef = useRef({ anchors, duration, selectedAnchor, dragState, previewAnchor, saveToHistory, loupeWindow: null, timelineView });

  // Keep refs in sync without recreating handlers
  useEffect(() => {
    dragDataRef.current = { anchors, duration, selectedAnchor, dragState, previewAnchor, saveToHistory, loupeWindow, timelineView };
  }, [anchors, duration, selectedAnchor, dragState, previewAnchor, saveToHistory, loupeWindow, timelineView]);

  const processMouseMove = useCallback((clientX) => {
    const { dragState, anchors, duration, selectedAnchor, previewAnchor, timelineView } = dragDataRef.current;
    dragLiveXRef.current = clientX; // Track for handle upgrade timer

    // Cancel handle→move upgrade the moment the user actually drags (> 5px).
    // This prevents the 1-second timer from firing mid-drag and hijacking the resize.
    if (
      upgradeTimerRef.current &&
      (dragState.type === 'anchor-left' || dragState.type === 'anchor-right') &&
      Math.abs(clientX - dragState.startX) > 5
    ) {
      clearTimeout(upgradeTimerRef.current);
      upgradeTimerRef.current = null;
    }

    if (dragState.type === 'timeline') {
      if (timelineRef.current && videoRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const time = timelineView.start + (percent * timelineView.duration);
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
    } else if (dragState.type.startsWith('anchor-')) {
      const snapshot = dragState.anchorSnapshot;
      if (!snapshot) return;

      // Use loupe coordinate space if drag started from loupe, else main timeline
      const isLoupeDrag = dragSourceRef.current === 'loupe';
      const rect = isLoupeDrag
        ? loupeRef.current?.getBoundingClientRect()
        : timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      // loupe shows a sub-window of the full video, so time-per-pixel is different
      const { loupeWindow } = dragDataRef.current;
      const effectiveDuration = isLoupeDrag && loupeWindow ? loupeWindow.duration : timelineView.duration;

      const deltaX = clientX - dragState.startX;
      const deltaTime = (deltaX / rect.width) * effectiveDuration;

      let newStart = snapshot.start;
      let newEnd = snapshot.end;

      if (dragState.type === 'anchor-left') {
        newStart = Math.max(0, Math.min(snapshot.end - 1, snapshot.start + deltaTime));
        newEnd = snapshot.end; // Keep end fixed
      } else if (dragState.type === 'anchor-right') {
        newStart = snapshot.start; // Keep start fixed
        newEnd = Math.max(snapshot.start + 1, Math.min(duration, snapshot.end + deltaTime));
      } else if (dragState.type === 'anchor-move') {
        const anchorDuration = snapshot.end - snapshot.start;
        newStart = Math.max(0, Math.min(duration - anchorDuration, snapshot.start + deltaTime));
        newEnd = newStart + anchorDuration;
      }

      // Safety check: ensure start is always before end
      if (newStart >= newEnd) {
        // If they would cross, don't allow the update
        return;
      }

      const otherAnchors = anchors.filter(a => a.id !== selectedAnchor);
      const wouldOverlap = otherAnchors.some(a =>
        (newStart >= a.start && newStart < a.end) ||
        (newEnd > a.start && newEnd <= a.end) ||
        (newStart <= a.start && newEnd >= a.end)
      );

      if (!wouldOverlap) {
        const updated = anchors.map(a =>
          a.id === selectedAnchor ? { ...a, start: newStart, end: newEnd } : a
        ).sort((a, b) => a.start - b.start);
        setAnchors(updated);

        // === Phase 5A: Update magnifier lens position & text (direct DOM, no setState) ===
        if (lensRef.current && lensTimestampRef.current && duration > 0) {
          const clampedX = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
          const displayTime = dragState.type === 'anchor-right' ? newEnd : newStart;
          const mins = Math.floor(displayTime / 60);
          const secs = (displayTime % 60).toFixed(1).padStart(4, '0');
          lensRef.current.style.left = `${clampedX}%`;
          lensRef.current.style.display = 'flex';
          lensTimestampRef.current.textContent = `${mins}:${secs}`;
        }

        // Sync video to the frame being adjusted (throttled for smooth performance)
        const now = Date.now();
        if (videoRef.current && now - lastSeekTimeRef.current >= SEEK_THROTTLE_MS) {
          lastSeekTimeRef.current = now;
          if (dragState.type === 'anchor-left') {
            videoRef.current.currentTime = newStart;
            setCurrentTime(newStart);
          } else if (dragState.type === 'anchor-right') {
            videoRef.current.currentTime = newEnd;
            setCurrentTime(newEnd);
          } else if (dragState.type === 'anchor-move') {
            // When moving whole anchor, show start frame
            videoRef.current.currentTime = newStart;
            setCurrentTime(newStart);
          }
        }

        // Update preview handle state when dragging
        if (previewAnchor?.id === selectedAnchor) {
          if (dragState.type === 'anchor-left') {
            // Dragging start handle → show start frame
            setPreviewHandle('start');
          } else if (dragState.type === 'anchor-right') {
            // Dragging end handle → show end frame
            setPreviewHandle('end');
          }
        }
      }
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    if (!clientX || !dragDataRef.current.dragState.active) return;

    // 60fps throttling with RAF
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      processMouseMove(clientX);
    });
  }, [processMouseMove]);

  const handleMouseUp = useCallback(() => {
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    // Cancel handle upgrade timer
    if (upgradeTimerRef.current) {
      clearTimeout(upgradeTimerRef.current);
      upgradeTimerRef.current = null;
    }

    // Cancel hold timer if released before hold duration
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    dragSourceRef.current = 'main'; // Reset to main timeline
    setHoldingAnchor(null);

    const { dragState, anchors, saveToHistory } = dragDataRef.current;

    if (dragState.type?.startsWith('anchor-')) {
      saveToHistory(anchors);
    }
    setDragState({ active: false, type: null, startX: 0, anchorSnapshot: null });

    // Phase 5A: hide magnifier lens on drag end
    if (lensRef.current) lensRef.current.style.display = 'none';
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    handleMouseMove(e);
  }, [handleMouseMove]);

  // Cancel pending hold-to-drag if mouse/touch is released before the timer fires.
  // Without this, a quick click releases the mouse while holdTimerRef is still pending —
  // the timer fires 400ms later, sets dragState.active=true, and the anchor chases the cursor
  // even though the user already let go. This effect is the targeted fix.
  useEffect(() => {
    if (!holdingAnchor) return;

    const cancelPendingDrag = () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      setHoldingAnchor(null);
    };

    document.addEventListener('mouseup', cancelPendingDrag, { once: true });
    document.addEventListener('touchend', cancelPendingDrag, { once: true });

    return () => {
      document.removeEventListener('mouseup', cancelPendingDrag);
      document.removeEventListener('touchend', cancelPendingDrag);
    };
  }, [holdingAnchor]);


  // AUDIT P1 #5: the loupe is undiscoverable from the main timeline. Surface a one-time
  // toast the first time the user selects an anchor so they learn the loupe strip is live.
  useEffect(() => {
    if (!selectedAnchor || hasSeenLoupeHint) return;
    showToast('Loupe strip active — drag the green/red handles for frame-accurate edits', 'info');
    setHasSeenLoupeHint(true);
  }, [selectedAnchor, hasSeenLoupeHint, showToast]);

  // Phase 5B: Drive card video playback — plays & loops the clip segment in the mini player.
  // AUDIT P0 #4: previously, rapid anchor switching stacked play()/seeked listeners, and
  // if the seek target matched currentTime the 'seeked' event never fired — leaving the
  // card stuck. Use an AbortController per selection, skip the seeked wait when the video
  // is already buffered, and fall back to a 400ms timeout so we never hang on the listener.
  useEffect(() => {
    if (dragState.active || !selectedAnchor || !videoUrl) {
      cardVideoRef.current?.pause();
      return;
    }
    const anchor = anchors.find(a => a.id === selectedAnchor);
    if (!anchor || !cardVideoRef.current) return;

    const vid = cardVideoRef.current;
    const controller = new AbortController();
    const { signal } = controller;
    const latestVisibleFrame = Math.max(anchor.start, anchor.end - FRAME_STEP);
    const focusTime = selectedClipFocusTime == null
      ? anchor.start
      : Math.max(anchor.start, Math.min(selectedClipFocusTime, latestVisibleFrame));

    const startPlay = () => {
      if (signal.aborted) return;
      if (vid.readyState < 2) return; // HAVE_CURRENT_DATA; wait for canplay
      vid.play().catch(() => {});
    };

    const alreadyAtTarget = Math.abs(vid.currentTime - focusTime) < 0.05;
    vid.currentTime = focusTime;

    if (alreadyAtTarget && vid.readyState >= 2) {
      startPlay();
    } else {
      const onSeeked = () => startPlay();
      const onCanPlay = () => startPlay();
      vid.addEventListener('seeked', onSeeked, { once: true, signal });
      vid.addEventListener('canplay', onCanPlay, { once: true, signal });

      // Safety timeout — if neither 'seeked' nor 'canplay' fires within 400ms
      // (common when the seek target is a keyframe already buffered), start anyway.
      const timeoutId = setTimeout(() => {
        if (!signal.aborted) startPlay();
      }, 400);
      signal.addEventListener('abort', () => clearTimeout(timeoutId));
    }

    return () => {
      controller.abort();
      vid.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnchor, selectedClipFocusTime, videoUrl, dragState.active, anchors]);

  // Persistent event listeners (only attach/detach once)
  useEffect(() => {
    if (!dragState.active) return;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragState.active, handleMouseMove, handleMouseUp, handleTouchMove]);

  // Lock body scroll during drag
  useEffect(() => {
    if (dragState.active) {
      // Save original styles and scroll position
      const scrollY = window.scrollY || window.pageYOffset;
      const originalOverflow = document.body.style.overflow;
      const originalPosition = document.body.style.position;
      const originalWidth = document.body.style.width;
      const originalTop = document.body.style.top;

      // Lock scroll while preserving scroll position
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        // Restore original styles
        document.body.style.overflow = originalOverflow;
        document.body.style.position = originalPosition;
        document.body.style.top = originalTop;
        document.body.style.width = originalWidth;

        // Restore scroll position
        window.scrollTo(0, scrollY);
      };
    }
  }, [dragState.active]);

  // Lock body scroll when precision modal is open (mobile fix)
  useEffect(() => {
    if (showPrecisionModal) {
      // Prevent mobile scroll/zoom when modal is open
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
  }, [showPrecisionModal]);

  // Update preview anchor when anchors change
  useEffect(() => {
    if (previewAnchor && selectedAnchor) {
      const updatedAnchor = anchors.find(a => a.id === selectedAnchor);
      if (updatedAnchor && (
        updatedAnchor.start !== previewAnchor.start ||
        updatedAnchor.end !== previewAnchor.end
      )) {
        setPreviewAnchor(updatedAnchor);
        if (previewVideoRef.current) {
          previewVideoRef.current.currentTime = updatedAnchor.start;
        }
      }
    }
  }, [anchors, selectedAnchor, previewAnchor]);

  // Preview video handlers
  const togglePreviewPlay = () => {
    if (previewVideoRef.current && previewAnchor) {
      if (previewVideoRef.current.paused) {
        // Start playback with music sync if music exists
        if (music && musicRef.current && !previewMuted) {
          // Calculate timeline offset for this anchor
          const anchorIndex = anchors.findIndex(a => a.id === previewAnchor.id);
          const timelineOffset = anchors
            .slice(0, anchorIndex)
            .reduce((sum, a) => sum + (a.end - a.start), 0);

          // Sync music to timeline position
          const musicTime = musicStartTime + timelineOffset;
          musicRef.current.currentTime = musicTime;
          musicRef.current.play().catch(e => console.log('Music play failed:', e));
        }

        previewVideoRef.current.play().catch(e => console.log('Preview play failed:', e));
      } else {
        previewVideoRef.current.pause();
        if (musicRef.current) {
          musicRef.current.pause();
        }
      }
    }
  };

  const handlePreviewTimeUpdate = () => {
    if (previewVideoRef.current && previewAnchor) {
      const currentTime = previewVideoRef.current.currentTime;
      if (currentTime >= previewAnchor.end) {
        previewVideoRef.current.currentTime = previewAnchor.start;

        // Loop music as well
        if (music && musicRef.current && !musicRef.current.paused) {
          const anchorIndex = anchors.findIndex(a => a.id === previewAnchor.id);
          const timelineOffset = anchors
            .slice(0, anchorIndex)
            .reduce((sum, a) => sum + (a.end - a.start), 0);
          const musicTime = musicStartTime + timelineOffset;
          musicRef.current.currentTime = musicTime;
        }
      }
    }
  };

  // Precision modal handlers
  const openPrecisionModal = (anchor) => {
  const anchorIndex = anchors.findIndex(a => a.id === anchor.id);

  // Stop any playing music
  if (musicRef.current) {
    musicRef.current.pause();
  }
  setIsMusicPlaying(false);

  // Calculate this anchor's position in the FINAL TIMELINE
  const timelineOffset = anchors
    .slice(0, anchorIndex)
    .reduce((sum, a) => sum + (a.end - a.start), 0);

  setPrecisionAnchor({ ...anchor, _index: anchorIndex, _timelineOffset: timelineOffset });
  setPrecisionTime(anchor.end);
  setSelectedHandle('end');
  setShowPrecisionModal(true);
  if (precisionVideoRef.current) {
    precisionVideoRef.current.currentTime = anchor.end;
  }
};

  // Mobile-specific precision modal handler to prevent freeze
  const openPrecisionModalMobile = (anchor) => {
    // Prevent scroll/interaction during transition
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${window.scrollY}px`;
    document.body.style.width = '100%';

    // Stop any playing music
    if (musicRef.current) {
      musicRef.current.pause();
    }
    setIsMusicPlaying(false);

    const anchorIndex = anchors.findIndex(a => a.id === anchor.id);

    // Calculate this anchor's position in the FINAL TIMELINE
    const timelineOffset = anchors
      .slice(0, anchorIndex)
      .reduce((sum, a) => sum + (a.end - a.start), 0);

    setPrecisionAnchor({ ...anchor, _index: anchorIndex, _timelineOffset: timelineOffset });
    setPrecisionTime(anchor.end);
    setSelectedHandle('end');

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      setShowPrecisionModal(true);
      if (precisionVideoRef.current) {
        precisionVideoRef.current.currentTime = anchor.end;
      }
    });
  };

  // Seek the precision video AFTER the modal has mounted.
  // The calls inside openPrecisionModal/openPrecisionModalMobile fire synchronously
  // right after setShowPrecisionModal(true), before React commits the <video> element,
  // so precisionVideoRef.current is still null — resulting in a black screen.
  // This effect runs after the DOM commit and reliably seeks to the right frame.
  useEffect(() => {
    if (!showPrecisionModal || !precisionAnchor) return;

    const seekPrecisionVideo = () => {
      if (precisionVideoRef.current) {
        const targetTime = selectedHandle === 'start' ? precisionAnchor.start : precisionAnchor.end;
        precisionVideoRef.current.currentTime = targetTime;
      }
    };

    // Try immediately (video may already be loaded if it was open before)
    seekPrecisionVideo();

    // Also seek on loadedmetadata in case the video element just mounted
    const vid = precisionVideoRef.current;
    if (vid) {
      vid.addEventListener('loadedmetadata', seekPrecisionVideo, { once: true });
      return () => vid.removeEventListener('loadedmetadata', seekPrecisionVideo);
    }
  }, [showPrecisionModal, precisionAnchor, selectedHandle]);

// AUDIT P3 #17: mutating `_index` onto the anchor object went stale on
// reorder/delete. Always derive the current index from the live `anchors` array.
const goToPreviousAnchor = () => {
  if (!precisionAnchor) return;
  const currentIdx = anchors.findIndex(a => a.id === precisionAnchor.id);
  if (currentIdx <= 0) return;
  const prevIndex = currentIdx - 1;
  const prevAnchor = anchors[prevIndex];

  const timelineOffset = anchors
    .slice(0, prevIndex)
    .reduce((sum, a) => sum + (a.end - a.start), 0);

  setPrecisionAnchor({ ...prevAnchor, _index: prevIndex, _timelineOffset: timelineOffset });
  setPrecisionTime(prevAnchor.end);
  setSelectedHandle('end');
  if (precisionVideoRef.current) {
    precisionVideoRef.current.currentTime = prevAnchor.end;
  }
};

const goToNextAnchor = () => {
  if (!precisionAnchor) return;
  const currentIdx = anchors.findIndex(a => a.id === precisionAnchor.id);
  if (currentIdx < 0 || currentIdx >= anchors.length - 1) return;
  const nextIndex = currentIdx + 1;
  const nextAnchor = anchors[nextIndex];

  const timelineOffset = anchors
    .slice(0, nextIndex)
    .reduce((sum, a) => sum + (a.end - a.start), 0);

  setPrecisionAnchor({ ...nextAnchor, _index: nextIndex, _timelineOffset: timelineOffset });
  setPrecisionTime(nextAnchor.end);
  setSelectedHandle('end');
  if (precisionVideoRef.current) {
    precisionVideoRef.current.currentTime = nextAnchor.end;
  }
};
  const getPrecisionRange = (anchor) => {
    const anchorDuration = anchor.end - anchor.start;
    const viewportDuration = Math.max(60, anchorDuration + 20);
    const anchorCenter = (anchor.start + anchor.end) / 2;
    const viewStart = Math.max(0, anchorCenter - viewportDuration / 2);
    const viewEnd = Math.min(duration, viewStart + viewportDuration);

    return {
      start: viewStart,
      end: viewEnd
    };
  };

  const seekToPrecisionPosition = (e) => {
    if (!precisionTimelineRef.current || !precisionAnchor) return;
    const rect = precisionTimelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const range = getPrecisionRange(precisionAnchor);
    const time = range.start + (percent * (range.end - range.start));
    setPrecisionTime(time);
    if (precisionVideoRef.current) {
      precisionVideoRef.current.currentTime = time;
    }
  };

  const handlePrecisionTimelineMouseDown = (e) => {
    if (!precisionTimelineRef.current) return;
    setDragState({
      active: true,
      type: 'precision-timeline',
      startX: e.clientX,
      anchorSnapshot: null
    });
    seekToPrecisionPosition(e);
  };

  const handlePrecisionHandleMouseDown = (e, handleType) => {
    e.stopPropagation();
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
    setPrecisionDragState({
      active: true,
      type: handleType,
      startX: clientX,
      startAnchor: { ...precisionAnchor }
    });
  };

  const handlePrecisionHandleTouchStart = (e, handleType) => {
    e.stopPropagation();
    e.preventDefault();
    setPrecisionDragState({
      active: true,
      type: handleType,
      startX: e.touches?.[0]?.clientX || 0,
      startAnchor: { ...precisionAnchor }
    });
  };

  // Isolated precision drag effect
  useEffect(() => {
    if (!precisionDragState.active || !precisionDragState.startAnchor) return;

    let rafId = null;
    let lastClientX = precisionDragState.startX;

    const handleMouseMove = (e) => {
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      if (!clientX) return;
      lastClientX = clientX;

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!precisionTimelineRef.current) return;

        const rect = precisionTimelineRef.current.getBoundingClientRect();
        const deltaX = lastClientX - precisionDragState.startX;
        const range = getPrecisionRange(precisionDragState.startAnchor);
        const deltaTime = (deltaX / rect.width) * (range.end - range.start);

        const snapshot = precisionDragState.startAnchor;

        if (precisionDragState.type === 'start') {
          let newStart = Math.max(
            range.start,
            Math.min(snapshot.end - 1, snapshot.start + deltaTime)
          );

          // Check for overlaps with other anchors
          const otherAnchors = anchors.filter(a => a.id !== snapshot.id);
          for (const other of otherAnchors) {
            // If new start would overlap with another anchor, constrain it
            if (newStart < other.end && snapshot.end > other.start) {
              newStart = Math.max(newStart, other.end);
            }
          }

          setPrecisionAnchor(prev => ({ ...snapshot, start: newStart }));
          // Update precisionTime and video to show the start frame being dragged
          setPrecisionTime(newStart);
          if (precisionVideoRef.current) {
            precisionVideoRef.current.currentTime = newStart;
          }
        } else if (precisionDragState.type === 'end') {
          let newEnd = Math.max(
            snapshot.start + 1,
            Math.min(range.end, snapshot.end + deltaTime)
          );

          // Check for overlaps with other anchors
          const otherAnchors = anchors.filter(a => a.id !== snapshot.id);
          for (const other of otherAnchors) {
            // If new end would overlap with another anchor, constrain it
            if (snapshot.start < other.end && newEnd > other.start) {
              newEnd = Math.min(newEnd, other.start);
            }
          }

          setPrecisionAnchor(prev => ({ ...snapshot, end: newEnd }));
          // Update precisionTime and video to show the end frame being dragged
          setPrecisionTime(newEnd);
          if (precisionVideoRef.current) {
            precisionVideoRef.current.currentTime = newEnd;
          }
        }
      });
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      handleMouseMove(e);
    };

    const handleMouseUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      setPrecisionDragState({ active: false, type: null, startX: 0, startAnchor: null });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [precisionDragState, duration]);

  useEffect(() => {
    if (!dragState.active || !dragState.type.startsWith('precision')) return;

    const handleMouseMove = (e) => {
      if (dragState.type === 'precision-timeline') {
        seekToPrecisionPosition(e);
      }
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      const touch = e.touches?.[0];
      if (touch && dragState.type === 'precision-timeline') {
        seekToPrecisionPosition({ ...e, clientX: touch.clientX, clientY: touch.clientY });
      }
    };

    const handleMouseUp = () => {
      setDragState({ active: false, type: null, startX: 0, anchorSnapshot: null });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragState, precisionAnchor, duration]);

  const togglePrecisionPlay = () => {
    if (precisionVideoRef.current && precisionAnchor) {
      if (precisionPlaying) {
        precisionVideoRef.current.pause();
        if (musicRef.current && music) {
          musicRef.current.pause();
        }
      } else {
        // Set up Web Audio API mixer for precision modal
        if (precisionVideoRef.current && musicRef.current && music) {
          setupPrecisionAudioMixer(precisionVideoRef.current, musicRef.current);

          // Resume audio context if suspended
          if (precisionAudioContextRef.current?.state === 'suspended') {
            precisionAudioContextRef.current.resume();
          }

          // Sync music time with FINAL TIMELINE position
          // Calculate how far into the anchor we are
          const anchorRelativeTime = precisionTime - precisionAnchor.start;
          // Add the anchor's timeline offset to get position in final edit
          const timelineOffset = precisionAnchor._timelineOffset || 0;
          const finalTimelinePosition = timelineOffset + anchorRelativeTime;
          // Apply music start offset
          const musicTime = musicStartTime + finalTimelinePosition;

          musicRef.current.currentTime = musicTime;
          musicRef.current.play().catch(e => console.log('Music play failed:', e));
        }

        precisionVideoRef.current.currentTime = precisionTime;
        precisionVideoRef.current.play().catch(e => console.log('Video play failed:', e));
      }
      setPrecisionPlaying(!precisionPlaying);
    }
  };

  const handlePrecisionVideoTimeUpdate = () => {
    if (precisionVideoRef.current && precisionAnchor) {
      const currentTime = precisionVideoRef.current.currentTime;
      // Only loop when playing, not when manually seeking
      if (currentTime >= precisionAnchor.end && precisionPlaying) {
        precisionVideoRef.current.currentTime = precisionAnchor.start;
        setPrecisionTime(precisionAnchor.start);

        // Loop music as well
        if (musicRef.current && music) {
          const timelineOffset = precisionAnchor._timelineOffset || 0;
          const musicTime = musicStartTime + timelineOffset;
          musicRef.current.currentTime = musicTime;
        }

        precisionVideoRef.current.play();
      } else {
        setPrecisionTime(currentTime);

        // Keep music in sync during playback
        if (musicRef.current && music && precisionPlaying) {
          const anchorRelativeTime = currentTime - precisionAnchor.start;
          const timelineOffset = precisionAnchor._timelineOffset || 0;
          const finalTimelinePosition = timelineOffset + anchorRelativeTime;
          const musicTime = musicStartTime + finalTimelinePosition;

          // Only update if music has drifted more than 0.1s (avoid constant seeking)
          if (Math.abs(musicRef.current.currentTime - musicTime) > 0.1) {
            musicRef.current.currentTime = musicTime;
          }
        }
      }
    }
  };

  const applyPrecisionChanges = () => {
    const updated = anchors.map(a =>
      a.id === precisionAnchor.id
        ? { ...a, start: precisionAnchor.start, end: precisionAnchor.end }
        : a
    ).sort((a, b) => a.start - b.start);
    setAnchors(updated);
    saveToHistory(updated);
    setShowPrecisionModal(false);
    setPrecisionAnchor(null);
  };

  // Trim handlers
  const applyTrim = async () => {
    if (!ffmpegLoaded || !video) return;

    setIsProcessing(true);
    setProgress(0);

    try {
      await ffmpeg.writeFile('input.mp4', await fetchFile(video));

      await ffmpeg.exec([
        '-i', 'input.mp4',
        '-ss', trimStart.toFixed(3),
        '-to', trimEnd.toFixed(3),
        '-c', 'copy',
        'trimmed.mp4'
      ]);

      const data = await ffmpeg.readFile('trimmed.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideo(blob);
      setVideoUrl(url);
      setShowTrimModal(false);
      setCurrentTime(0);
      setAnchors([]);
      setHistory([]);
      setHistoryIndex(-1);

    } catch (error) {
      console.error('Trim error:', error);
      showToast('Error trimming video — please try again', 'error');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // Tab navigation helpers
  // TabNav Component - Clean tab-only design
  const TabNav = ({ currentTab, onChange, hasVideo }) => {
    const tabs = [
      { id: 'materials', label: 'MATERIALS' },
      { id: 'forge', label: 'FORGE' },
      { id: 'ship', label: 'SHIP' }
    ];

    const isTabAccessible = (tabId) => {
      if (tabId === 'materials') return true;
      // Only require video for forge and ship tabs
      return hasVideo;
    };

    const handleTabClick = (tabId) => {
      if (!isTabAccessible(tabId)) {
        return;
      }

      onChange(tabId);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(15);
      }
    };

    return (
      <div className="mb-8">
        {/* Stone Tablet Navigation */}
        <div className="flex justify-center items-end gap-1 max-w-5xl mx-auto" style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0' }}>
          {tabs.map((tab) => {
            const isActive = currentTab === tab.id;
            const isAccessible = isTabAccessible(tab.id);

            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                disabled={!isAccessible}
                className={`
                  px-4 sm:px-6 py-3 sm:py-3 min-h-[48px] font-bold text-sm sm:text-base tracking-wider rounded-t-lg
                  transition-all duration-200 relative
                  ${isActive ? 'tab-active' : 'tab'}
                  ${!isAccessible ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}
                `}
                style={{
                  fontFamily: 'serif',
                  letterSpacing: '0.1em',
                  ...(isActive && {
                    boxShadow: '0 -4px 12px rgba(59, 130, 246, 0.3), inset 0 2px 8px rgba(139, 92, 246, 0.15)'
                  })
                }}
              >
                {tab.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Export processing
const exportVideo = async () => {
  if (!ffmpegLoaded || !video || selectedPlatforms.length === 0) return;

  setIsProcessing(true);
  setProgress(0);
  setShowExportModal(false);

  try {
    // Use original video file for export (maintains quality)
    // If no original (old projects), use current video
    const fileToExport = originalVideoFile || video;
    await ffmpeg.writeFile('input.mp4', await fetchFile(fileToExport));

    // Process clips
    let clips = [];
    if (anchors.length > 0) {
      clips = anchors.map(a => ({ start: a.start, end: a.end }));
    } else {
      clips = [{ start: 0, end: Math.min(60, duration) }];
    }

    // OPTIMIZATION: Use stream copy for clips (10-50x faster)
    // Only re-encode when absolutely necessary (platform formatting)
    const clipFiles = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const outputName = `clip_${i}.mp4`;
      const clipDuration = clip.end - clip.start;

      await ffmpeg.exec([
        '-ss', clip.start.toFixed(3),
        '-i', 'input.mp4',
        '-t', clipDuration.toFixed(3),
        '-c:v', 'copy',  // Stream copy - no re-encoding!
        '-c:a', 'copy',  // Stream copy audio too
        outputName
      ]);

      clipFiles.push(outputName);
    }

    // Concatenate clips with stream copy
    const concatList = clipFiles.map(f => `file '${f}'`).join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));

    // Add music if present
    if (music) {
      await ffmpeg.writeFile('music.mp3', await fetchFile(music));

      const clampedAudioBalance = Math.max(0, Math.min(100, audioBalance));
      const videoVolume = (100 - clampedAudioBalance) / 100;
      const musicVolume = clampedAudioBalance / 100;

      // Trim music with stream copy
      const selectedMusicDuration = (musicEndTime || musicDuration) - musicStartTime;

      await ffmpeg.exec([
        '-ss', musicStartTime.toFixed(3),
        '-t', selectedMusicDuration.toFixed(3),
        '-i', 'music.mp3',
        '-c:a', 'copy',
        'trimmed_music.mp3'
      ]);

      if (clampedAudioBalance >= 100) {
        // All music means the original audio stream is not mapped at all.
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat.txt',
          '-i', 'trimmed_music.mp3',
          '-map', '0:v',
          '-map', '1:a',
          '-c:v', 'copy',
          '-c:a', 'aac',
          'output.mp4'
        ]);
      } else if (clampedAudioBalance <= 0) {
        // All source video audio; ignore the music file entirely.
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat.txt',
          '-c:v', 'copy',
          '-c:a', 'copy',
          'output.mp4'
        ]);
      } else {
        // Mix audio (must re-encode audio here, but video stays copied)
        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat.txt',
          '-i', 'trimmed_music.mp3',
          '-filter_complex',
          `[0:a]volume=${videoVolume}[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
          '-map', '0:v',
          '-map', '[aout]',
          '-c:v', 'copy',  // Still stream copy video!
          '-c:a', 'aac',   // Only re-encode audio for mixing
          'output.mp4'
        ]);
      }
    } else {
      // No music - pure stream copy concatenation (fastest path)
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c:v', 'copy',  // Stream copy video
        '-c:a', 'copy',  // Stream copy audio
        'output.mp4'
      ]);
    }

    // OPTIMIZATION: Export platforms in single-pass when possible
    // Only re-encode for aspect ratio changes
    for (let i = 0; i < selectedPlatforms.length; i++) {
      const platformKey = selectedPlatforms[i];
      const platform = platforms[platformKey];

      setProgress(Math.round(((i + 1) / selectedPlatforms.length) * 100));

      let finalFile = 'output.mp4';

      if (platform.aspect !== 'original') {
        // Only re-encode when aspect ratio changes
        const outputName = `formatted_${platformKey}.mp4`;
        await ffmpeg.exec([
          '-i', 'output.mp4',
          '-vf', `scale=${platform.width}:${platform.height}:force_original_aspect_ratio=decrease,pad=${platform.width}:${platform.height}:(ow-iw)/2:(oh-ih)/2`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',  // Fastest encoding preset
          '-c:a', 'copy',  // Still copy audio
          outputName
        ]);
        finalFile = outputName;
      } else {
        // Original aspect = pure stream copy (instant!)
        finalFile = 'output.mp4';
      }

      const data = await ffmpeg.readFile(finalFile);
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `clipboost_${platformKey}_${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    setProgress(100);
    setTimeout(() => setProgress(0), 1000);
    clearAutoSave();

  } catch (error) {
    console.error('Export error:', error);
    showToast('Export failed — check console for details', 'error');
  } finally {
    setIsProcessing(false);
  }
};

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!video) return;
      if (e.target.tagName === 'INPUT') return;

      // Check if precision modal is open
      if (showPrecisionModal) {
        if (e.code === 'Space') {
          e.preventDefault();
          togglePrecisionPlay();
        } else if (e.code === 'ArrowLeft' && precisionVideoRef.current && precisionAnchor) {
          e.preventDefault();
          const newTime = precisionAnchor[selectedHandle] - 1/30;
          const range = getPrecisionRange(precisionAnchor);

          if (selectedHandle === 'start') {
            const constrainedTime = Math.max(range.start, Math.min(precisionAnchor.end - 1, newTime));
            setPrecisionAnchor(prev => ({ ...prev, start: constrainedTime }));
            setPrecisionTime(constrainedTime);
            precisionVideoRef.current.currentTime = constrainedTime;
          } else {
            const constrainedTime = Math.max(precisionAnchor.start + 1, Math.min(range.end, newTime));
            setPrecisionAnchor(prev => ({ ...prev, end: constrainedTime }));
            setPrecisionTime(constrainedTime);
            precisionVideoRef.current.currentTime = constrainedTime;
          }
        } else if (e.code === 'ArrowRight' && precisionVideoRef.current && precisionAnchor) {
          e.preventDefault();
          const newTime = precisionAnchor[selectedHandle] + 1/30;
          const range = getPrecisionRange(precisionAnchor);

          if (selectedHandle === 'start') {
            const constrainedTime = Math.max(range.start, Math.min(precisionAnchor.end - 1, newTime));
            setPrecisionAnchor(prev => ({ ...prev, start: constrainedTime }));
            setPrecisionTime(constrainedTime);
            precisionVideoRef.current.currentTime = constrainedTime;
          } else {
            const constrainedTime = Math.max(precisionAnchor.start + 1, Math.min(range.end, newTime));
            setPrecisionAnchor(prev => ({ ...prev, end: constrainedTime }));
            setPrecisionTime(constrainedTime);
            precisionVideoRef.current.currentTime = constrainedTime;
          }
        } else if (e.code === 'Comma') {
          // AUDIT P2 #12: "," jumps to previous anchor without leaving precision mode
          e.preventDefault();
          goToPreviousAnchor();
        } else if (e.code === 'Period') {
          // AUDIT P2 #12: "." jumps to next anchor without leaving precision mode
          e.preventDefault();
          goToNextAnchor();
        } else if (e.code === 'KeyS' && precisionAnchor && precisionVideoRef.current) {
          // AUDIT P2 #12: "S" snaps the start handle to the beginning of the precision range
          e.preventDefault();
          const range = getPrecisionRange(precisionAnchor);
          const newStart = Math.max(range.start, Math.min(precisionAnchor.end - 1, range.start));
          setPrecisionAnchor(prev => ({ ...prev, start: newStart }));
          setPrecisionTime(newStart);
          precisionVideoRef.current.currentTime = newStart;
        } else if (e.code === 'KeyE' && precisionAnchor && precisionVideoRef.current) {
          // AUDIT P2 #12: "E" snaps the end handle to the end of the precision range
          e.preventDefault();
          const range = getPrecisionRange(precisionAnchor);
          const newEnd = Math.max(precisionAnchor.start + 1, Math.min(range.end, range.end));
          setPrecisionAnchor(prev => ({ ...prev, end: newEnd }));
          setPrecisionTime(newEnd);
          precisionVideoRef.current.currentTime = newEnd;
        }
        return;
      }

      // AUDIT P2 #12: "?" toggles the keyboard-shortcut overlay anywhere in the app.
      if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
        e.preventDefault();
        setShowKeyboardHelp(s => !s);
        return;
      }
      if (e.code === 'Escape' && showKeyboardHelp) {
        setShowKeyboardHelp(false);
        return;
      }

      // Main timeline controls
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft' && videoRef.current) {
        e.preventDefault();
        const newTime = Math.max(0, currentTimeRef.current - 1);
        videoRef.current.currentTime = newTime;
        currentTimeRef.current = newTime;
      } else if (e.code === 'ArrowRight' && videoRef.current) {
        e.preventDefault();
        const newTime = Math.min(duration, currentTimeRef.current + 1);
        videoRef.current.currentTime = newTime;
        currentTimeRef.current = newTime;
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedAnchor) {
        e.preventDefault();
        deleteAnchor(selectedAnchor);
      } else if (e.ctrlKey && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey && e.shiftKey && e.code === 'KeyZ') || (e.ctrlKey && e.code === 'KeyY')) {
        e.preventDefault();
        redo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [video, selectedAnchor, currentTime, duration, isPlaying, showPrecisionModal, precisionPlaying, historyIndex, selectedHandle, precisionAnchor]);

  const anchorTime = anchors.reduce((sum, a) => sum + (a.end - a.start), 0);
  const workflowSteps = [
    {
      label: 'Add video',
      value: video ? video.name : 'Waiting for a file',
      done: !!video,
      active: !video
    },
    {
      label: 'Choose moments',
      value: anchors.length > 0 ? `${anchors.length} clip${anchors.length === 1 ? '' : 's'} selected` : 'Make clips automatically or mark your own',
      done: anchors.length > 0,
      active: !!video && anchors.length === 0
    },
    {
      label: 'Preview and export',
      value: anchors.length > 0 ? `${formatTime(anchorTime)} ready` : 'Unlocked after clips exist',
      done: currentSection === 'export' && anchors.length > 0,
      active: anchors.length > 0
    }
  ];
  const activeAutoGenLabel = autoGenMode === 'quick'
    ? 'Create starter clips'
    : autoGenMode === 'smart'
      ? 'Find story moments'
      : 'Build best cut';
  const isProMode = workspaceMode === 'pro';

  return (
<>
<Head>
  <title>ReelForge — AI Video Editor</title>
  <meta name="description" content="Transform raw footage into polished social clips in minutes." />
</Head>
<div className="flex min-h-screen relative" style={{ color: 'var(--text-primary)', background: 'var(--bg-primary)' }}>
  {/* Animated Hero Gradient Background */}
  <div className="hero-gradient">
    <div className="hero-particles" />
		                      </div>

  {/* Sidebar Navigation */}
  <div
    className={`${sidebarCollapsed ? 'w-16' : 'w-64'} hidden sm:flex flex-col panel border-r transition-all duration-300 relative z-10`}
    style={{
      borderRadius: 0,
      borderTop: 'none',
      borderLeft: 'none',
      borderBottom: 'none',
      minHeight: '100vh'
    }}
  >
    {/* Logo & Toggle */}
    <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      {!sidebarCollapsed && (
        <h1 className="text-2xl font-bold glow-text-cyan" style={{ letterSpacing: '1px', fontWeight: 800 }}>
          REELFORGE
        </h1>
      )}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="p-2 hover:bg-gray-700/50 rounded transition"
        title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
      </button>
		                          </div>

    {/* Navigation Items */}
    <nav className="flex-1 p-2">
      <button
        onClick={() => setCurrentSection('edit')}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl mb-2 transition-all ${
          currentSection === 'edit'
            ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
            : 'text-gray-400 hover:bg-gray-700/30 hover:text-gray-200'
        }`}
        style={currentSection === 'edit' ? { boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)' } : {}}
      >
        <Edit size={20} className="flex-shrink-0" />
        {!sidebarCollapsed && <span className="font-semibold">EDIT</span>}
      </button>

      <button
        onClick={() => setCurrentSection('export')}
        disabled={!video}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${
          currentSection === 'export'
            ? 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-400 border border-pink-500/30'
            : !video
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:bg-gray-700/30 hover:text-gray-200'
        }`}
        style={currentSection === 'export' ? { boxShadow: '0 0 20px rgba(255, 0, 255, 0.2)' } : {}}
      >
        <Download size={20} className="flex-shrink-0" />
        {!sidebarCollapsed && <span className="font-semibold">EXPORT</span>}
      </button>
    </nav>

    {/* Footer Info */}
    {!sidebarCollapsed && !ffmpegLoaded && (
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ⚡ Loading processor...
        </p>
      </div>
    )}
  </div>

  {/* Mobile Bottom Navigation */}
  <div className={`sm:hidden fixed bottom-0 left-0 right-0 panel border-t z-50 ${showPrecisionModal ? 'hidden' : ''}`} style={{ borderRadius: 0 }}>
    <div className="flex">
      <button
        onClick={() => setCurrentSection('edit')}
        className={`flex-1 flex flex-col items-center py-3 ${
          currentSection === 'edit' ? 'text-blue-400' : 'text-gray-400'
        }`}
      >
        <Edit size={24} />
        <span className="text-xs mt-1">Edit</span>
      </button>
      <button
        onClick={() => setCurrentSection('export')}
        disabled={!video}
        className={`flex-1 flex flex-col items-center py-3 ${
          currentSection === 'export' ? 'text-blue-400' : !video ? 'text-gray-600' : 'text-gray-400'
        }`}
      >
        <Download size={24} />
        <span className="text-xs mt-1">Export</span>
      </button>
    </div>
  </div>

  {/* Main Content Area */}
  <div className="flex-1 overflow-y-auto pb-20 sm:pb-0 relative z-10">
    <div className="px-0 py-1 sm:p-8 w-full sm:max-w-7xl sm:mx-auto">
      {/* Header */}
	      <div className="mb-2 sm:mb-6 px-2 sm:px-0">
	        <h2 className="text-3xl sm:text-4xl font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '0.5px', fontWeight: 800 }}>
	          {currentSection === 'edit' ? 'MAKE YOUR REEL' : 'EXPORT YOUR REEL'}
	        </h2>
	        <p className="text-sm sm:text-base mt-2" style={{ color: 'var(--text-secondary)' }}>
	          {currentSection === 'edit'
	            ? 'Start with a draft, keep the best moments, then polish only what needs it.'
	            : 'Choose the formats you need and download the finished edit.'
	          }
	        </p>
	      </div>
	      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3 sm:mb-6 px-2 sm:px-0">
	        {workflowSteps.map((step, index) => (
	          <div
	            key={step.label}
	            className={`rounded-lg border p-3 transition-all ${
	              step.active
	                ? 'border-cyan-400/60 bg-cyan-500/10 shadow-[0_0_18px_rgba(0,212,255,0.18)]'
	                : step.done
	                  ? 'border-emerald-400/40 bg-emerald-500/10'
	                  : 'border-slate-700/70 bg-slate-900/30'
	            }`}
	          >
	            <div className="flex items-center gap-2">
	              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
	                step.done ? 'bg-emerald-400 text-slate-950' : step.active ? 'bg-cyan-400 text-slate-950' : 'bg-slate-700 text-slate-300'
	              }`}>
	                {step.done ? 'OK' : index + 1}
	              </div>
	              <div className="min-w-0">
	                <div className="text-sm font-semibold text-white">{step.label}</div>
	                <div className="truncate text-xs text-slate-400">{step.value}</div>
	              </div>
	            </div>
	          </div>
	        ))}
	      </div>
{/* Restore Toast Notification */}
        {showRestoreToast && (
          <div className="fixed top-4 right-4 bg-slate-800 border-2 border-cyan-500/40 rounded-lg shadow-2xl p-4 z-50 max-w-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold mb-1">Previous Work Found</div>
                <div className="text-sm text-gray-300 mb-1">
                  Found {restoredAnchorCount} clip{restoredAnchorCount === 1 ? '' : 's'} from your last session
                </div>
                {restoredVideoName && (
                  <div className="text-xs text-amber-400/80 mb-3">
                    ⚠ From: <span className="font-mono">{restoredVideoName}</span> — may not match your current video
                  </div>
                )}
                {!restoredVideoName && <div className="mb-3" />}
                <div className="flex gap-2">
                  <button
                    onClick={restoreAutoSave}
                    className="px-3 py-1.5 bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 border border-cyan-500/30 hover:border-cyan-500/40 rounded text-sm font-semibold transition"
                  >
                    Restore
                  </button>
                  <button
                    onClick={dismissRestoreToast}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-sm transition"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowRestoreToast(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
		                          )}

        {/* Analysis Progress Indicator */}
        {isAnalyzing && (
          <div className="fixed top-4 right-4 bg-slate-800 border border-cyan-500/50 rounded-lg p-4 shadow-xl z-50 min-w-[200px]">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-cyan-500 border-t-transparent"></div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-cyan-400">{analysisPhase || 'Analyzing...'}</div>
                <div className="text-xs text-gray-400">{analysisProgress}% complete</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
                style={{ width: `${analysisProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* EDIT SECTION (combines Materials + Forge) */}
        {currentSection === 'edit' && (
          <div className="panel rounded-2xl p-2 sm:p-12">
	            {!video ? (
	              <div className="mx-auto max-w-3xl text-center py-8 sm:py-12">
	                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-400/30 shadow-[0_0_28px_rgba(0,212,255,0.18)]">
	                  <Upload className="w-10 h-10" style={{ color: 'var(--accent-cyan)' }} />
	                </div>
	                <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Start With One Video</h2>
	                <p className="mx-auto mb-6 max-w-xl text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
	                  Drop in raw footage and create a first cut before touching any advanced controls.
	                </p>
	                <label className="inline-flex items-center gap-2 px-8 py-4 btn-primary rounded-xl font-bold cursor-pointer hover:scale-105 transition-transform">
	                  <Upload size={18} />
	                  Choose Video
	                  <input
	                    type="file"
	                    accept="video/*"
	                    onChange={handleVideoUpload}
	                    className="hidden"
	                  />
	                </label>
		                <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-slate-300">
		                  <span className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1">Up to 500 MB</span>
		                  <span className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1">Private in your browser</span>
		                  <span className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-1">Export for social formats</span>
		                </div>
		                {isLocalDev && devTestClips.length > 0 && (
		                  <div className="mx-auto mt-6 max-w-2xl rounded-xl border border-slate-700/70 bg-slate-950/35 p-3 text-left">
		                    <div className="mb-2 flex items-center justify-between gap-3">
		                      <div>
		                        <div className="text-xs font-bold uppercase tracking-wide text-cyan-300">Dev test clips</div>
		                        <div className="text-xs text-slate-500">Loaded from Desktop/TestClips</div>
		                      </div>
		                      {isLoadingDevClip && <div className="text-xs text-slate-400">Loading...</div>}
		                    </div>
		                    <div className="grid gap-2 sm:grid-cols-2">
		                      {devTestClips.slice(0, 6).map(clip => (
		                        <button
		                          key={clip.name}
		                          type="button"
		                          onClick={() => loadDevTestClip(clip.name)}
		                          disabled={isLoadingDevClip}
		                          className="min-h-10 truncate rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-cyan-400/60 hover:text-white disabled:opacity-50"
		                          title={clip.name}
		                        >
		                          {clip.name}
		                        </button>
		                      ))}
		                    </div>
		                  </div>
		                )}
		              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* Optimization Progress Indicator */}
	                {isOptimizingVideo && (
	                  <div className="mb-4 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-semibold text-cyan-400">Optimizing for editing...</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300"
                        style={{ width: `${optimizationProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Adding keyframes for instant seeking (professional NLE quality)</p>
	                  </div>
	                )}

	                <div className="mb-2 sm:mb-4 rounded-xl border border-slate-700/60 bg-slate-950/30 p-2 sm:p-3">
	                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                    <div>
	                      <div className="text-sm font-bold text-white">Workspace</div>
	                      <div className="text-xs text-slate-400">
	                        {isProMode ? 'Exact timeline tools are visible.' : 'Simple view keeps only the main editing loop in front.'}
	                      </div>
	                      <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-slate-900/60 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-white">
	                        <Upload size={12} />
	                        Change video
	                        <input
	                          type="file"
	                          accept="video/*"
	                          onChange={handleVideoUpload}
	                          className="hidden"
	                        />
	                      </label>
	                    </div>
	                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-900/80 p-1 text-sm">
	                      <button
	                        type="button"
	                        onClick={() => setWorkspaceMode('simple')}
	                        aria-pressed={!isProMode}
	                        className={`min-h-11 rounded-md px-4 py-2 font-semibold transition ${
	                          !isProMode
	                            ? 'bg-cyan-400 text-slate-950 shadow-[0_0_14px_rgba(0,212,255,0.32)]'
	                            : 'text-slate-300 hover:bg-slate-800'
	                        }`}
	                      >
	                        Simple
	                      </button>
	                      <button
	                        type="button"
	                        onClick={() => setWorkspaceMode('pro')}
	                        aria-pressed={isProMode}
	                        className={`min-h-11 rounded-md px-4 py-2 font-semibold transition ${
	                          isProMode
	                            ? 'bg-pink-400 text-slate-950 shadow-[0_0_14px_rgba(255,0,255,0.28)]'
	                            : 'text-slate-300 hover:bg-slate-800'
	                        }`}
	                      >
	                        Pro tools
	                      </button>
	                    </div>
	                  </div>
	                </div>

		                {/* MEDIA CENTER - Collapsible */}
		                {isProMode && (
		                  <div className="panel rounded-none sm:rounded-xl mb-2 sm:mb-4 w-full border-0 sm:border">
                  <button
                    onClick={() => setMediaCenterCollapsed(!mediaCenterCollapsed)}
                    className="w-full flex items-center justify-between p-2 sm:p-4 hover:bg-slate-800/30 transition-colors rounded-t-xl"
                  >
                    <div className="flex items-center gap-2">
	                      <h3 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
	                        Source and Music
	                      </h3>
                      <span className="text-xs text-gray-400">
                        {video.name} • {formatTime(duration)}
                      </span>
		                </div>
                    <ChevronDown
                      className={`transition-transform ${mediaCenterCollapsed ? '' : 'rotate-180'}`}
                      size={20}
                    />
                  </button>

                  {!mediaCenterCollapsed && (
                    <div className="p-2 sm:p-4 pt-0 space-y-3">
                      {/* Change Video Button */}
                      <button
                        onClick={() => {
                          if (videoUrl) URL.revokeObjectURL(videoUrl);
                          setVideo(null);
                          setVideoUrl(null);
                          setAnchors([]);
                          setHistory([]);
                          setHistoryIndex(-1);
                          setSelectedAnchor(null);
                          setSelectedClipFocusTime(null);
	                          setPreviewAnchor(null);
	                          setMusic(null);
	                          setMusicUrl(null);
	                          setMusicAnalysis(null);
	                          setOriginalSoundAnalysis(null);
	                          setBeatSyncTarget('none');
	                          setPlaybackMode('full');
                        }}
                        className="w-full px-4 py-2 btn-secondary rounded-lg flex items-center justify-center gap-2 text-sm"
                        title="Change Video"
                      >
                        <Upload size={16} />
                        Change Video
                      </button>

                      {/* Music Section */}
                      <div className="border-t border-gray-700 pt-3">
                        {!music ? (
                          <div className="space-y-2">
                            <label className="block px-4 py-2 btn-secondary rounded-lg cursor-pointer text-center text-sm">
                              🎵 Add Music (Optional)
                              <input
                                type="file"
                                accept="audio/*"
                                onChange={handleMusicUpload}
                                className="hidden"
                              />
                            </label>
                            {isLocalDev && devTestMusic.length > 0 && (
                              <div className="rounded-lg border border-slate-700/70 bg-slate-950/35 p-2">
                                <div className="mb-1 flex items-center justify-between gap-2">
                                  <span className="text-[10px] font-bold uppercase tracking-wide text-green-300">Dev music</span>
                                  {isLoadingDevMusic && <span className="text-[10px] text-slate-400">Loading...</span>}
                                </div>
                                <div className="grid gap-1 sm:grid-cols-2">
                                  {devTestMusic.slice(0, 4).map(track => (
                                    <button
                                      key={track.name}
                                      type="button"
                                      onClick={() => loadDevTestMusic(track.name)}
                                      disabled={isLoadingDevMusic}
                                      className="min-h-9 truncate rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-200 transition hover:border-green-400/60 hover:text-white disabled:opacity-50"
                                      title={track.name}
                                    >
                                      {track.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-300 truncate">🎵 {music.name}</span>
                              <button
	                                onClick={() => {
	                                  setMusic(null);
	                                  setMusicUrl(null);
	                                  setMusicAnalysis(null);
	                                  if (beatSyncTarget === 'music') setBeatSyncTarget('none');
	                                }}
                                className="text-gray-400 hover:text-white ml-2"
                              >
                                <X size={14} />
                              </button>
		                </div>

                            <audio
                              ref={musicRef}
                              src={musicUrl}
                              onLoadedMetadata={handleMusicLoadedMetadata}
                              onEnded={() => setIsMusicPlaying(false)}
                              className="hidden"
                            />

                            {/* Music Range Selector */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-xs text-gray-400">Music Range</label>
	                                <span className="text-xs text-gray-500">
	                                  {formatTime(musicEndTime - musicStartTime)} selected
	                                </span>
		                </div>

                              {/* Visual range selector */}
                              <div
                                className="relative h-10 bg-slate-700 rounded-lg mb-1 cursor-pointer"
                                onClick={() => setSelectedMusicHandle(null)}
                              >
                                {/* Selected range highlight */}
                                <div
                                  className="absolute top-0 bottom-0 rounded pointer-events-none"
                                  style={{
                                    left: `${(musicStartTime / musicDuration) * 100}%`,
                                    width: `${((musicEndTime - musicStartTime) / musicDuration) * 100}%`,
                                    background: 'linear-gradient(to right, rgba(59, 130, 246, 0.6), rgba(139, 92, 246, 0.6))'
                                  }}
                                />

                                {/* Start handle */}
                                <div
                                  className={`absolute top-0 bottom-0 w-1 cursor-ew-resize z-10 rounded-full group ${
                                    selectedMusicHandle === 'start'
                                      ? 'bg-green-400 shadow-[0_0_16px_rgba(74,222,128,0.8)]'
                                      : 'bg-green-500/60'
                                  }`}
                                  style={{ left: `${(musicStartTime / musicDuration) * 100}%` }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMusicHandle('start');
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setSelectedMusicHandle('start');
                                    const startX = e.clientX;
                                    const startTime = musicStartTime;
                                    const rect = e.currentTarget.parentElement.getBoundingClientRect();

                                    const handleMouseMove = (moveE) => {
                                      const deltaX = moveE.clientX - startX;
                                      const deltaTime = (deltaX / rect.width) * musicDuration;
                                      const newTime = Math.max(0, Math.min(musicEndTime - 1, startTime + deltaTime));
                                      setMusicStartTime(newTime);
                                    };

                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };

                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }}
                                  onTouchStart={(e) => {
                                    e.stopPropagation();
                                    if (navigator.vibrate) {
                                      navigator.vibrate(10);
                                    }
                                    const startX = e.touches[0].clientX;
                                    const startTime = musicStartTime;
                                    const rect = e.currentTarget.parentElement.getBoundingClientRect();

                                    const handleTouchMove = (moveE) => {
                                      const deltaX = moveE.touches[0].clientX - startX;
                                      const deltaTime = (deltaX / rect.width) * musicDuration;
                                      const newTime = Math.max(0, Math.min(musicEndTime - 1, startTime + deltaTime));
                                      setMusicStartTime(newTime);
                                    };

                                    const handleTouchEnd = () => {
                                      if (navigator.vibrate) {
                                        navigator.vibrate(15);
                                      }
                                      document.removeEventListener('touchmove', handleTouchMove);
                                      document.removeEventListener('touchend', handleTouchEnd);
                                    };

                                    document.addEventListener('touchmove', handleTouchMove);
                                    document.addEventListener('touchend', handleTouchEnd);
                                  }}
                                  title="Drag to adjust start"
                                >
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-5 bg-green-400 group-hover:bg-green-300 group-active:bg-green-200 rounded-full shadow-lg border-2 border-white/30 pointer-events-none" />
                                </div>

                                {/* End handle */}
                                <div
                                  className={`absolute top-0 bottom-0 w-1 cursor-ew-resize z-10 rounded-full group ${
                                    selectedMusicHandle === 'end'
                                      ? 'bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.8)]'
                                      : 'bg-red-500/60'
                                  }`}
                                  style={{ left: `${(musicEndTime / musicDuration) * 100}%` }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMusicHandle('end');
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setSelectedMusicHandle('end');
                                    const startX = e.clientX;
                                    const startTime = musicEndTime;
                                    const rect = e.currentTarget.parentElement.getBoundingClientRect();

                                    const handleMouseMove = (moveE) => {
                                      const deltaX = moveE.clientX - startX;
                                      const deltaTime = (deltaX / rect.width) * musicDuration;
                                      const newTime = Math.max(musicStartTime + 1, Math.min(musicDuration, startTime + deltaTime));
                                      setMusicEndTime(newTime);
                                    };

                                    const handleMouseUp = () => {
                                      document.removeEventListener('mousemove', handleMouseMove);
                                      document.removeEventListener('mouseup', handleMouseUp);
                                    };

                                    document.addEventListener('mousemove', handleMouseMove);
                                    document.addEventListener('mouseup', handleMouseUp);
                                  }}
                                  onTouchStart={(e) => {
                                    e.stopPropagation();
                                    if (navigator.vibrate) {
                                      navigator.vibrate(10);
                                    }
                                    const startX = e.touches[0].clientX;
                                    const startTime = musicEndTime;
                                    const rect = e.currentTarget.parentElement.getBoundingClientRect();

                                    const handleTouchMove = (moveE) => {
                                      const deltaX = moveE.touches[0].clientX - startX;
                                      const deltaTime = (deltaX / rect.width) * musicDuration;
                                      const newTime = Math.max(musicStartTime + 1, Math.min(musicDuration, startTime + deltaTime));
                                      setMusicEndTime(newTime);
                                    };

                                    const handleTouchEnd = () => {
                                      if (navigator.vibrate) {
                                        navigator.vibrate(15);
                                      }
                                      document.removeEventListener('touchmove', handleTouchMove);
                                      document.removeEventListener('touchend', handleTouchEnd);
                                    };

                                    document.addEventListener('touchmove', handleTouchMove);
                                    document.addEventListener('touchend', handleTouchEnd);
                                  }}
                                  title="Drag to adjust end"
                                >
                                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-5 bg-red-400 group-hover:bg-red-300 group-active:bg-red-200 rounded-full shadow-lg border-2 border-white/30 pointer-events-none" />
                                </div>
                              </div>

                              {/* Time displays */}
                              <div className="flex justify-between text-xs mb-2">
                                <div
                                  onClick={() => setSelectedMusicHandle('start')}
                                  className={`cursor-pointer transition-colors ${selectedMusicHandle === 'start' ? 'font-bold text-green-400' : 'text-gray-300 hover:text-green-300'}`}
                                >
                                  🟢 Start: {formatTime(musicStartTime)}
                                </div>
                                <div className="text-gray-400">
                                  Duration: {formatTime((musicEndTime || musicDuration) - musicStartTime)}
                                </div>
                                <div
                                  onClick={() => setSelectedMusicHandle('end')}
                                  className={`cursor-pointer transition-colors ${selectedMusicHandle === 'end' ? 'font-bold text-red-400' : 'text-gray-300 hover:text-red-300'}`}
                                >
                                  🔴 End: {formatTime(musicEndTime || musicDuration)}
                                </div>
                              </div>

                              {/* Fine-tune Buttons + Preview (Desktop: side-by-side, Mobile: stacked) */}
                              <div className="mb-3">
                                {/* Desktop: Preview Audio Button on the left, Adjustment Buttons on the right */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-2">
                                  {/* Preview Audio Button - Left side on desktop */}
                                  <button
                                    onClick={toggleMusicPreview}
                                    className="px-3 py-1.5 btn-accent rounded-lg flex items-center justify-center gap-1.5 text-xs sm:w-auto whitespace-nowrap"
                                  >
                                    {isMusicPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    {isMusicPlaying ? 'Pause' : 'Preview'}
                                  </button>

                                  {/* Adjustment Buttons - Right side on desktop */}
                                  <div className="flex items-center justify-center gap-2 flex-1">
                                    <span className="text-xs text-gray-400 hidden sm:inline">
                                      {selectedMusicHandle ? `Adjusting: ${selectedMusicHandle === 'start' ? 'Start' : 'End'}` : 'Select handle'}
                                    </span>
                                    <button
                                      onClick={() => adjustMusicHandle(-1)}
                                      disabled={!selectedMusicHandle}
                                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 text-xs transition-colors"
                                    >
                                      -1s
                                    </button>
                                    <button
                                      onClick={() => adjustMusicHandle(-0.1)}
                                      disabled={!selectedMusicHandle}
                                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 text-xs transition-colors"
                                    >
                                      -0.1s
                                    </button>
                                    <button
                                      onClick={() => adjustMusicHandle(+0.1)}
                                      disabled={!selectedMusicHandle}
                                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 text-xs transition-colors"
                                    >
                                      +0.1s
                                    </button>
                                    <button
                                      onClick={() => adjustMusicHandle(+1)}
                                      disabled={!selectedMusicHandle}
                                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-30 text-xs transition-colors"
                                    >
                                      +1s
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs text-gray-400 text-center">
                                  Tip: Arrow keys ±1s • Shift+Arrow ±5s • Space to preview
                                </p>
                              </div>

                              {/* Audio Balance - Color-coded */}
                              <div className="mb-3">
                                <div className="flex justify-between items-center mb-0.5">
                                  <label className="text-xs text-gray-400">Balance</label>
                                  <span className="text-xs flex items-center gap-1.5">
                                    <span className="text-blue-400 font-semibold">Video {100 - audioBalance}%</span>
                                    <span className="text-gray-600">•</span>
                                    <span className="text-green-400 font-semibold">Music {audioBalance}%</span>
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="100"
                                  value={audioBalance}
                                  onChange={(e) => setAudioBalance(parseInt(e.target.value))}
                                  onTouchStart={(e) => setAudioBalance(parseInt(e.target.value))}
                                  onTouchMove={(e) => setAudioBalance(parseInt(e.target.value))}
                                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer outline-none focus:outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(168,85,247,0.6)] [&::-webkit-slider-thumb]:outline-none [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-purple-500 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:shadow-[0_0_12px_rgba(168,85,247,0.6)] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:outline-none"
                                  style={{
                                    background: `linear-gradient(to right, rgb(74, 222, 128) 0%, rgb(74, 222, 128) ${audioBalance}%, rgb(96, 165, 250) ${audioBalance}%, rgb(96, 165, 250) 100%)`
                                  }}
                                />
                              </div>
	                      </div>
	                    </div>
	                  )}
	                </div>
                    </div>
                  )}
                </div>
                )}

                {/* Video Editor - Unified Panel */}
                <div
                  className={`panel rounded-none sm:rounded-xl p-0 sm:p-6 transition-all w-full border-0 sm:border ${
                    playbackMode === 'clips'
                      ? 'ring-0 sm:ring-2 ring-blue-500/50 shadow-none sm:shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                      : 'ring-0 sm:ring-2 ring-cyan-500/50 shadow-none sm:shadow-[0_0_20px_rgba(0,212,255,0.3)]'
                  }`}
                >
                  {/* Video Player Section */}
                  <div className="bg-slate-900/30 rounded-lg p-1 sm:p-3 mb-1 sm:mb-4">
                    <div className="aspect-video bg-black rounded-lg overflow-hidden mb-3 relative group w-full">
                    {/* Dual-video Play Clips system — see PROJECT_PRINCIPLES.md
                        ("Play Clips transition: dual-video hot swap").
                        Both elements are absolutely stacked and swap via direct
                        opacity manipulation on the DOM ref (no React re-render
                        on the hot path) so transitions are truly instant. */}
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="absolute inset-0 w-full h-full object-contain"
                      style={{ opacity: 1, transition: 'none', willChange: 'opacity' }}
                      preload="auto"
                      playsInline
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={() => setIsPlaying(false)}
                      onSeeked={() => {
                        if (isPreviewMode && activeVideoRef.current === 'B') {
                          markStandbyReadyAfterFrame(videoRef.current);
                        }
                      }}
                    />
                    <video
                      ref={videoBRef}
                      src={videoUrl}
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      style={{ opacity: 0, transition: 'none', willChange: 'opacity' }}
                      preload="auto"
                      playsInline
                      muted
                      onSeeked={() => {
                        if (isPreviewMode && activeVideoRef.current === 'A') {
                          markStandbyReadyAfterFrame(videoBRef.current);
                        }
                      }}
                    />

                    {/* Play/Pause Overlay Button — hidden during Play Clips (preview owns playback) */}
                    <button
                      onClick={isPreviewMode ? togglePreviewPlayback : togglePlay}
                      className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                        isPreviewMode
                          ? (isPreviewPlaying
                              ? 'bg-black/0 opacity-0 group-hover:opacity-100 group-hover:bg-black/20'
                              : 'bg-black/40 opacity-100')
                          : (isPlaying
                              ? 'bg-black/0 opacity-0 group-hover:opacity-100 group-hover:bg-black/20'
                              : 'bg-black/40 opacity-100')
                      }`}
                    >
                      <div className={`transition-all duration-300 ${
                        (isPreviewMode ? isPreviewPlaying : isPlaying)
                          ? 'scale-75 opacity-60 group-hover:scale-100 group-hover:opacity-100'
                          : 'scale-100 opacity-100'
                      }`}>
                        {(isPreviewMode ? isPreviewPlaying : isPlaying) ? (
                          <Pause size={64} className="text-white drop-shadow-lg" />
                        ) : (
                          <Play size={64} className="text-white drop-shadow-lg" />
                        )}
                      </div>
                    </button>

                    {/* Video Scrub Bar - Show for full video mode */}
                    {playbackMode === 'full' && (
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1 bg-slate-700/50 group-hover:h-3 transition-all cursor-pointer"
                        onMouseDown={(e) => {
                          const container = e.currentTarget;
                          const rect = container.getBoundingClientRect();

                          const scrubVideo = (clientX) => {
                            const x = clientX - rect.left;
                            const percent = Math.max(0, Math.min(1, x / rect.width));
                            const time = percent * duration;
                            if (videoRef.current) {
                              videoRef.current.currentTime = time;
                            }
                          };

                          scrubVideo(e.clientX);

                          const handleMouseMove = (moveEvent) => {
                            scrubVideo(moveEvent.clientX);
                          };

                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };

                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                        onTouchStart={(e) => {
                          const container = e.currentTarget;
                          const rect = container.getBoundingClientRect();
                          const touch = e.touches?.[0];
                          if (!touch) return;

                          const scrubVideo = (clientX) => {
                            const x = clientX - rect.left;
                            const percent = Math.max(0, Math.min(1, x / rect.width));
                            const time = percent * duration;
                            if (videoRef.current) {
                              videoRef.current.currentTime = time;
                            }
                          };

                          scrubVideo(touch.clientX);

                          const handleTouchMove = (moveEvent) => {
                            const touchX = moveEvent.touches?.[0]?.clientX;
                            if (touchX !== undefined) {
                              scrubVideo(touchX);
                            }
                          };

                          const handleTouchEnd = () => {
                            document.removeEventListener('touchmove', handleTouchMove);
                            document.removeEventListener('touchend', handleTouchEnd);
                          };

                          document.addEventListener('touchmove', handleTouchMove);
                          document.addEventListener('touchend', handleTouchEnd);
                        }}
                      >
                        <div
                          className="h-full bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 transition-all relative pointer-events-none border-r-2 border-cyan-500/50"
                          style={{ width: `${(currentTime / duration) * 100}%` }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    )}
                  </div>

                    {/* Playback Info - Subtle inner box */}
                    <div className="bg-slate-800/50 rounded px-2 sm:px-3 py-1.5 text-xs text-gray-300 text-center">
                      {playbackMode === 'clips' && anchors.length > 0 ? (
                        <>
                          Clip {previewAnchorIndex + 1} • {(anchors[previewAnchorIndex]?.end - anchors[previewAnchorIndex]?.start).toFixed(1)}s / {previewTotalDuration.toFixed(1)}s total
                        </>
                      ) : (
                        <>{formatTime(currentTime)} / {formatTime(duration)}</>
                      )}
                    </div>
                  </div>
                  {/* End Video Player Section */}

	                  {/* Contextual Hints - Progressive Disclosure */}
	                  {!hasCreatedFirstClip && anchors.length === 0 && (
	                    <div className="hint-toast mb-2">
	                      {isProMode ? (
	                        <><strong>Pro tip:</strong> Double-tap the timeline below to mark exact moments yourself</>
	                      ) : (
	                        <><strong>Get started:</strong> create starter clips, then preview and adjust only what needs it</>
	                      )}
	                    </div>
	                  )}
	                  {isProMode && anchors.length > 0 && anchors.length <= 3 && (!hasSeenDeleteHint || !hasSeenPrecisionHint) && (
	                    <div className="hint-toast mb-2">
                      {!hasSeenDeleteHint && <span>🗑️ Double-tap clips to delete</span>}
                      {!hasSeenDeleteHint && !hasSeenPrecisionHint && <span className="mx-2">•</span>}
                      {!hasSeenPrecisionHint && selectedAnchor && <span>✨ Try <strong>Precision Edit</strong> for frame-perfect trimming</span>}
                    </div>
                  )}

                  {/* Playback Controls + Clips Preview Section */}
                  <div className="bg-slate-900/30 rounded-lg p-1 sm:p-3 mb-1 sm:mb-4">
                    {/* Controls Row - always visible */}
                    {anchors.length > 0 ? (
                      <div className="flex items-center justify-center gap-2 mb-3">
                        {/* Prev Button */}
                        <button
                          onClick={() => {
                            if (playbackMode === 'clips') {
                              const prevIndex = Math.max(0, previewAnchorIndex - 1);
                              if (prevIndex !== previewAnchorIndex) {
                                seekPreviewTime(previewTimeline[prevIndex].previewStart);
                              }
                            }
                          }}
                          disabled={playbackMode !== 'clips' || previewAnchorIndex <= 0}
                          className="px-4 py-2 btn-secondary rounded-lg flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Previous Clip (Left Arrow)"
                        >
                          <span>◄</span>
                          <span className="hidden sm:inline">Prev</span>
                        </button>

                        {/* Play Clips Button - Updated gradient */}
                        <button
                          onClick={togglePreviewPlayback}
                          className="px-6 py-2 bg-gradient-to-br from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 rounded-lg flex items-center gap-2 font-semibold shadow-lg transition text-sm"
                          title="Play Clips (Spacebar)"
                        >
                          {isPreviewPlaying ? <Pause size={18} /> : <Play size={18} />}
                          <span>{isPreviewPlaying ? 'Pause Clips' : 'Play Clips'}</span>
                        </button>

                        {/* Next Button */}
                        <button
                          onClick={() => {
                            if (playbackMode === 'clips') {
                              const nextIndex = Math.min(previewTimeline.length - 1, previewAnchorIndex + 1);
                              if (nextIndex !== previewAnchorIndex) {
                                seekPreviewTime(previewTimeline[nextIndex].previewStart);
                              }
                            }
                          }}
                          disabled={playbackMode !== 'clips' || previewAnchorIndex >= previewTimeline.length - 1}
                          className="px-4 py-2 btn-secondary rounded-lg flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Next Clip (Right Arrow)"
                        >
                          <span className="hidden sm:inline">Next</span>
                          <span>►</span>
                        </button>

                        {/* Precision button removed — frame nudge now lives inline in the loupe strip */}
                      </div>
                    ) : null}

                    {/* Clips Preview Bar - always visible */}
                    {anchors.length > 0 ? (
                      <div>
                        <div
                          ref={clipsBarRef}
                          className="relative h-20 bg-slate-800 rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-500/40 transition-all select-none"
                          onMouseDown={(e) => {
                            if (e.button !== 0) return;
                            clipsBarScrubRef.current = true;
                            scrubClipsBar(e.clientX);
                          }}
                          onTouchStart={(e) => {
                            clipsBarScrubRef.current = true;
                            scrubClipsBar(e.touches[0].clientX);
                          }}
                        >
                          {/* Time + Clip Counter - merged into one badge (top left) */}
                          {playbackMode === 'clips' && (
                            <div className="absolute top-1 left-2 text-xs font-semibold text-white bg-black/60 px-2 py-0.5 rounded z-20 pointer-events-none">
                              <span ref={clipsTimeDisplayRef}>0:00 / {formatTime(previewTotalDuration)}</span>
                              <span className="ml-2 opacity-60">· Clip {previewAnchorIndex + 1}/{previewTimeline.length}</span>
                            </div>
                          )}

                          {/* Render clip segments */}
                          {previewTimeline.map((segment, idx) => {
                            const segmentWidth = ((segment.duration / previewTotalDuration) * 100);
                            const segmentLeft = ((segment.previewStart / previewTotalDuration) * 100);
                            const isCurrentSegment = playbackMode === 'clips' && idx === previewAnchorIndex;
                            const isSelectedSegment = segment.anchorId === selectedAnchor;
                            const colors = getAnchorColor(idx, isCurrentSegment || isSelectedSegment);

                            const thumb = clipThumbnails[segment.anchorId];
                            return (
                              <div
                                key={idx}
                                className={`absolute top-0 bottom-0 transition-all rounded ${isCurrentSegment || isSelectedSegment ? '' : colors.border} border-2 overflow-hidden cursor-pointer`}
                                style={{
                                  left: `${segmentLeft}%`,
                                  width: `${segmentWidth}%`,
                                  backgroundColor: thumb ? 'transparent' : undefined,
                                  borderColor: isCurrentSegment ? 'var(--accent-cyan)' : isSelectedSegment ? 'var(--accent-pink)' : undefined,
                                  boxShadow: isCurrentSegment
                                    ? '0 0 18px rgba(0, 212, 255, 0.65), inset 0 0 0 1px rgba(0, 212, 255, 0.4)'
                                    : isSelectedSegment
                                      ? '0 0 16px rgba(255, 0, 255, 0.45), inset 0 0 0 1px rgba(255, 0, 255, 0.35)'
                                      : undefined,
                                  zIndex: isCurrentSegment || isSelectedSegment ? 2 : 1
                                }}
                                title={`Clip ${idx + 1}: ${segment.duration.toFixed(1)}s — click to jump`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPlaybackMode('clips');
                                  previewAnchorIndexRef.current = idx;
                                  setPreviewAnchorIndex(idx);
                                  seekPreviewTime(segment.previewStart);
                                  // Select the corresponding anchor → shows pillbox
                                  setSelectedAnchor(segment.anchorId);
                                }}
                              >
                                {/* Thumbnail background */}
                                {thumb ? (
                                  <div
                                    className="absolute inset-0"
                                    style={{
                                      backgroundImage: `url(${thumb})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                    }}
                                  />
                                ) : (
                                  <div className={`absolute inset-0 ${colors.bg}`} />
                                )}
                                {/* Dark scrim for readability */}
                                <div className={`absolute inset-0 ${thumb ? 'bg-black/40' : 'bg-black/20'}`} />
                                {/* Active indicator — top edge highlight */}
                                {(isCurrentSegment || isSelectedSegment) && (
                                  <div className={`absolute top-0 left-0 right-0 h-0.5 rounded-t pointer-events-none ${isCurrentSegment ? 'bg-white/90' : 'bg-pink-300/90'}`} />
                                )}
                                {/* Clip number */}
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none text-white drop-shadow">
                                  {idx + 1}
                                </div>
                                {/* Duration badge — only render if segment is wide enough */}
                                {segmentWidth > 7 && (
                                  <div className="absolute bottom-1 left-0 right-0 text-center text-[9px] text-white/70 pointer-events-none leading-none drop-shadow">
                                    {segment.duration.toFixed(1)}s
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Playhead for clips timeline */}
                          {playbackMode === 'clips' && (
                            <div
                              ref={clipsPlayheadRef}
                              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 cursor-ew-resize"
                              style={{ left: '0%' }}
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                clipsBarScrubRef.current = true;
                                scrubClipsBar(e.clientX);
                              }}
                              onTouchStart={(e) => {
                                e.stopPropagation();
                                clipsBarScrubRef.current = true;
                                scrubClipsBar(e.touches[0].clientX);
                              }}
                            >
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-xl border-2 border-blue-500" />
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Empty state - shows structure before clips exist */
                      <div className="relative h-20 bg-slate-800/30 rounded-lg border-2 border-dashed border-slate-700/50">
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                          <div className="text-sm font-medium mb-1">Clips Preview</div>
                          <div className="text-xs opacity-70">Create clips below to see them here</div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* End Playback Controls + Clips Preview Section */}

	                  {isProMode ? (
	                    <>
	                  {/* ═══ Loupe Strip — always visible, no layout pop ═══ */}
	                  {(() => {
                    const anchor = anchors.find(a => a.id === selectedAnchor);
                    const active = !!(anchor && loupeWindow);
                    const colors = active ? getAnchorColor(anchors.indexOf(anchor), true) : null;
                    const sortedAnchors = active ? [...anchors].sort((a, b) => a.start - b.start) : [];
                    const sortedAnchorIndex = active ? sortedAnchors.findIndex(a => a.id === anchor.id) : -1;
                    const previousAnchor = sortedAnchorIndex > 0 ? sortedAnchors[sortedAnchorIndex - 1] : null;
                    const nextAnchor = sortedAnchorIndex >= 0 && sortedAnchorIndex < sortedAnchors.length - 1 ? sortedAnchors[sortedAnchorIndex + 1] : null;
                    const timelineEnd = active ? Math.max(duration || 0, anchor.end) : FRAME_STEP;
                    const edgeWindowStart = active ? Math.max(0, previousAnchor ? previousAnchor.end : 0) : 0;
                    const edgeWindowEnd = active ? Math.max(edgeWindowStart + FRAME_STEP, Math.min(timelineEnd, nextAnchor ? nextAnchor.start : timelineEnd)) : FRAME_STEP;
                    const edgeWindowDuration = Math.max(FRAME_STEP, edgeWindowEnd - edgeWindowStart);
                    const anchorLeft = active ? ((anchor.start - edgeWindowStart) / edgeWindowDuration) * 100 : 0;
                    const anchorRight = active ? ((anchor.end - edgeWindowStart) / edgeWindowDuration) * 100 : 0;
                    const clampedLeft = active ? Math.max(0, Math.min(96, anchorLeft)) : 0;
	                    const clampedWidth = active ? Math.max(2, Math.min(100 - clampedLeft, anchorRight - clampedLeft)) : 0;
	                    const startMarkerLeft = active ? Math.max(4, Math.min(96, anchorLeft)) : 0;
	                    const endMarkerLeft = active ? Math.max(4, Math.min(96, anchorRight)) : 0;
	                    const markersOverlap = active ? Math.abs(endMarkerLeft - startMarkerLeft) < 6 : false;
	                    const startMarkerTop = markersOverlap ? '42%' : '50%';
	                    const endMarkerTop = markersOverlap ? '58%' : '50%';
	                    const clipIndex = active ? anchors.findIndex(a => a.id === anchor.id) : -1;
	                    const latestVisibleFrame = active ? Math.max(anchor.start, anchor.end - FRAME_STEP) : 0;
	                    const focusTime = active
	                      ? Math.max(anchor.start, Math.min(selectedClipFocusTime ?? anchor.start, latestVisibleFrame))
	                      : null;
	                    const focusLeft = active ? Math.max(0, Math.min(100, ((focusTime - edgeWindowStart) / edgeWindowDuration) * 100)) : 0;
	                    const focusHandle = active && Math.abs(focusTime - anchor.end) < Math.abs(focusTime - anchor.start) ? 'end' : 'start';
	                    const focusHandleLabel = focusHandle === 'end' ? 'End' : 'Start';
	                    const focusHandleClass = focusHandle === 'end' ? 'text-red-300 border-red-400/40 bg-red-500/10' : 'text-green-300 border-green-400/40 bg-green-500/10';
	                    const railActivity = nudgeActivity.handle === focusHandle ? nudgeActivity : null;
	                    const railActiveTick = railActivity?.direction
	                      ? 7 + (railActivity.direction * Math.min(3, railActivity.intensity || 1))
	                      : 7;
	                    const railPuckOffset = railActivity?.offset || 0;
	                    const railPullFrames = railActivity?.frames || (railActivity?.intensity >= 3 ? 5 : 1);
	                    const setFocusToHandle = (handle) => {
	                      if (!active) return;
	                      const time = handle === 'end' ? latestVisibleFrame : anchor.start;
	                      setPreviewHandle(handle);
	                      setSelectedClipFocusTime(time);
	                      if (cardVideoRef.current) cardVideoRef.current.currentTime = time;
	                    };

	                    return (
	                      <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-950/30 p-2 sm:p-3">
	                        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
	                          <div>
	                            <div className="text-sm font-bold text-white">Precision Trimmer</div>
	                            <div className="text-xs text-slate-400">
	                              {active ? `Clip ${clipIndex + 1} of ${anchors.length} • ${formatTime(anchor.end - anchor.start)}` : 'Select a clip'}
	                            </div>
	                          </div>
	                          {active && (
	                            <div className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${focusHandleClass}`}>
	                              {focusHandleLabel} frame {formatTime(focusTime)}
	                            </div>
	                          )}
	                        </div>

		                        <div className="flex flex-col gap-2">

		                        {/* Active clip preview, frame controls, and compact boundary strip */}
		                        <div
		                          className="w-full overflow-hidden rounded-lg border transition-colors"
		                          style={{
		                            background: 'rgba(8, 12, 28, 0.97)',
		                            borderColor: active ? 'rgba(100,116,139,0.6)' : 'rgba(100,116,139,0.15)',
		                          }}
		                          onMouseDown={(e) => e.stopPropagation()}
		                        >
		                          {active ? (
		                            <div className="p-2 lg:grid lg:grid-cols-[minmax(240px,320px)_minmax(280px,1fr)] lg:gap-3">
		                              <div className="min-w-0">
		                              {/* Video with play/pause */}
		                              <div className="relative aspect-video overflow-hidden rounded-md bg-black">
	                                <video
	                                  ref={cardVideoRef}
	                                  src={videoUrl}
                                  muted
                                  playsInline
                                  onPlay={() => setCardVideoPlaying(true)}
                                  onPause={() => setCardVideoPlaying(false)}
	                                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
	                                  onTimeUpdate={() => {
	                                    const vid = cardVideoRef.current;
	                                    if (!vid || !anchor) return;
                                    if (previewCardLooping && vid.currentTime >= anchor.end) vid.currentTime = anchor.start;
                                    else if (!previewCardLooping && vid.currentTime >= anchor.end) vid.pause();
                                  }}
                                />
	                                <button
	                                  className="absolute inset-0 flex items-center justify-center transition-colors hover:bg-black/20"
	                                  style={{ background: 'transparent' }}
	                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const vid = cardVideoRef.current;
                                    if (!vid) return;
                                    if (vid.paused) vid.play().catch(() => {});
                                    else vid.pause();
                                  }}
                                >
	                                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/55 opacity-70 backdrop-blur-sm hover:opacity-100">
	                                    {cardVideoPlaying ? <Pause size={16} /> : <Play size={16} />}
	                                  </div>
	                                </button>
	                                <div className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
	                                  {formatTime(focusTime)}
	                                </div>
	                              </div>

	                              <div className="mt-2 grid grid-cols-2 gap-2">
	                                <button
	                                  type="button"
	                                  onMouseDown={(e) => e.stopPropagation()}
	                                  onClick={(e) => { e.stopPropagation(); setFocusToHandle('start'); }}
	                                  aria-pressed={focusHandle === 'start'}
	                                  className={`min-h-11 rounded-md border px-2 py-1.5 text-left transition ${focusHandle === 'start' ? 'border-green-400/60 bg-green-500/15 text-green-200' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-green-400/40'}`}
	                                >
	                                  <div className="text-[10px] font-bold uppercase tracking-wide">Start</div>
	                                  <div className="font-mono text-xs tabular-nums">{formatTime(anchor.start)}</div>
	                                </button>
	                                <button
	                                  type="button"
	                                  onMouseDown={(e) => e.stopPropagation()}
	                                  onClick={(e) => { e.stopPropagation(); setFocusToHandle('end'); }}
	                                  aria-pressed={focusHandle === 'end'}
	                                  className={`min-h-11 rounded-md border px-2 py-1.5 text-left transition ${focusHandle === 'end' ? 'border-red-400/60 bg-red-500/15 text-red-200' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-red-400/40'}`}
	                                >
	                                  <div className="text-[10px] font-bold uppercase tracking-wide">End</div>
		                                  <div className="font-mono text-xs tabular-nums">{formatTime(anchor.end)}</div>
		                                </button>
		                              </div>
		                              </div>

		                              {/* Frame nudge rail */}
		                              <div className="min-w-0">
		                              <div
		                                className={`mt-2 rounded-lg border p-2 lg:mt-0 ${focusHandle === 'start' ? 'border-green-400/30 bg-green-500/5' : 'border-red-400/30 bg-red-500/5'}`}
		                                onMouseDown={(e) => e.stopPropagation()}
		                              >
	                                <div className="mb-2 flex items-center justify-between gap-2">
	                                  <div className={`text-[10px] font-bold uppercase tracking-wide ${focusHandle === 'start' ? 'text-green-300' : 'text-red-300'}`}>
	                                    {focusHandle === 'start' ? 'Start edge' : 'End edge'}
	                                  </div>
	                                  <div className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 font-mono text-[10px] text-slate-300 tabular-nums">
	                                    1 frame = 0.03s
	                                  </div>
	                                </div>
	                                <div className="grid grid-cols-4 items-center gap-1.5">
	                                  <button
	                                    type="button"
	                                    onPointerDown={(e) => startNudgeHold(e, focusHandle, -1, 5)}
	                                    onKeyDown={(e) => {
	                                      if (e.key === 'Enter' || e.key === ' ') {
	                                        e.preventDefault();
	                                        nudgeAnchor(focusHandle, -1, 5);
	                                      }
	                                    }}
	                                    className="min-h-11 rounded-md border border-slate-700 bg-slate-900/80 text-[11px] font-bold text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
	                                    title={`${focusHandleLabel}: back 5 frames`}
	                                  >
	                                    -5
	                                  </button>
	                                  <button
	                                    type="button"
	                                    onPointerDown={(e) => startNudgeHold(e, focusHandle, -1)}
	                                    onKeyDown={(e) => {
	                                      if (e.key === 'Enter' || e.key === ' ') {
	                                        e.preventDefault();
	                                        nudgeAnchor(focusHandle, -1);
	                                      }
	                                    }}
	                                    className={`min-h-12 rounded-md border px-1 text-xs font-bold transition ${focusHandle === 'start' ? 'border-green-400/40 bg-green-500/15 text-green-100 hover:bg-green-500/25' : 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25'}`}
	                                    title={`${focusHandleLabel}: back 1 frame`}
	                                  >
	                                    -1f
	                                  </button>
	                                  <button
	                                    type="button"
	                                    onPointerDown={(e) => startNudgeHold(e, focusHandle, 1)}
	                                    onKeyDown={(e) => {
	                                      if (e.key === 'Enter' || e.key === ' ') {
	                                        e.preventDefault();
	                                        nudgeAnchor(focusHandle, 1);
	                                      }
	                                    }}
	                                    className={`min-h-12 rounded-md border px-1 text-xs font-bold transition ${focusHandle === 'start' ? 'border-green-400/40 bg-green-500/15 text-green-100 hover:bg-green-500/25' : 'border-red-400/40 bg-red-500/15 text-red-100 hover:bg-red-500/25'}`}
	                                    title={`${focusHandleLabel}: forward 1 frame`}
	                                  >
	                                    +1f
	                                  </button>
	                                  <button
	                                    type="button"
	                                    onPointerDown={(e) => startNudgeHold(e, focusHandle, 1, 5)}
	                                    onKeyDown={(e) => {
	                                      if (e.key === 'Enter' || e.key === ' ') {
	                                        e.preventDefault();
	                                        nudgeAnchor(focusHandle, 1, 5);
	                                      }
	                                    }}
	                                    className="min-h-11 rounded-md border border-slate-700 bg-slate-900/80 text-[11px] font-bold text-slate-300 transition hover:border-cyan-400/40 hover:text-white"
	                                    title={`${focusHandleLabel}: forward 5 frames`}
	                                  >
	                                    +5
	                                  </button>
	                                </div>
	                                <div className="mt-2 flex items-center justify-center gap-2">
	                                  <div className="h-px flex-1 bg-slate-700" />
	                                  <button
	                                    type="button"
	                                    onPointerDown={(e) => startRailPuckDrag(e, focusHandle)}
	                                    className={`relative flex h-9 w-9 cursor-ew-resize touch-none items-center justify-center rounded-full border text-[10px] font-bold uppercase tracking-wide transition-transform duration-150 hover:scale-105 ${focusHandle === 'start' ? 'border-green-400/50 bg-green-500/20 text-green-200 hover:bg-green-500/30' : 'border-red-400/50 bg-red-500/20 text-red-200 hover:bg-red-500/30'} ${railActivity?.direction ? 'shadow-[0_0_14px_rgba(0,212,255,0.3)]' : ''}`}
	                                    style={{ transform: `translateX(${railPuckOffset}px)` }}
	                                    title={`${focusHandleLabel}: pull to nudge 1 or 5 frames`}
	                                    aria-label={`${focusHandleLabel} spring nudge puck`}
	                                  >
	                                    {focusHandle === 'start' ? 'S' : 'E'}
	                                    {railActivity?.direction ? (
	                                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-cyan-400/40 bg-slate-950 px-1.5 py-0.5 font-mono text-[9px] text-cyan-200">
	                                        {railPullFrames}f
	                                      </span>
	                                    ) : null}
	                                  </button>
	                                  <div className="h-px flex-1 bg-slate-700" />
	                                </div>
	                                <div
	                                  className="mt-2 grid gap-px"
	                                  style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }}
	                                  aria-hidden="true"
	                                >
	                                  {Array.from({ length: 15 }).map((_, tickIndex) => (
	                                    <div
	                                      key={tickIndex}
	                                      className={`mx-auto rounded-full transition-all ${
	                                        tickIndex === railActiveTick
	                                          ? `h-3.5 w-0.5 ${railActivity?.direction ? (focusHandle === 'start' ? 'bg-green-300 shadow-[0_0_10px_rgba(34,197,94,0.75)]' : 'bg-red-300 shadow-[0_0_10px_rgba(239,68,68,0.75)]') : 'bg-cyan-300'}`
	                                          : tickIndex === 7
	                                            ? 'h-3 w-0.5 bg-cyan-300/70'
	                                            : tickIndex % 2 === 0
	                                              ? 'h-2 w-px bg-slate-500'
	                                              : 'h-1.5 w-px bg-slate-700'
	                                      }`}
	                                    />
		                                  ))}
		                                </div>
		                              </div>
		                              </div>

		                              <div
		                                ref={loupeRef}
		                                className="mt-2 rounded-lg border border-slate-700/70 bg-slate-950/60 p-2 lg:col-span-2"
		                              >
		                                <div className="mb-1.5 flex items-center justify-between gap-2">
		                                  <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Boundary strip</div>
		                                  <div className="font-mono text-[10px] text-slate-400 tabular-nums">{formatTime(edgeWindowStart)} - {formatTime(edgeWindowEnd)}</div>
		                                </div>
		                                <div data-boundary-map="true" className="relative h-[72px] rounded-md border border-slate-800 bg-slate-950/80 px-3 py-3 sm:h-20">
		                                  <div className="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-800" />
		                                  <div
		                                    className={`absolute top-1/2 h-3 -translate-y-1/2 rounded-full ${colors.bg} ${colors.glow}`}
		                                    style={{ left: `${clampedLeft}%`, width: `${clampedWidth}%` }}
		                                  />
		                                  <button
		                                    type="button"
		                                    className={`absolute z-10 min-h-12 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border text-[10px] font-bold transition ${focusHandle === 'start' ? 'border-green-300 bg-green-500 text-slate-950 shadow-[0_0_18px_rgba(34,197,94,0.45)]' : 'border-green-400/50 bg-green-500/20 text-green-200 hover:bg-green-500/30'}`}
		                                    style={{ left: `${startMarkerLeft}%`, top: startMarkerTop }}
		                                    aria-label={`Drag start boundary — ${formatTime(anchor.start)}`}
		                                    onPointerDown={(e) => startBoundaryMapHandleDrag(e, 'start', edgeWindowStart, edgeWindowEnd)}
		                                    onKeyDown={(e) => {
		                                      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeAnchor('start', -1); }
		                                      else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeAnchor('start', 1); }
		                                    }}
		                                  >
		                                    S
		                                  </button>
		                                  <button
		                                    type="button"
		                                    className={`absolute z-10 min-h-12 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none rounded-full border text-[10px] font-bold transition ${focusHandle === 'end' ? 'border-red-300 bg-red-500 text-white shadow-[0_0_18px_rgba(239,68,68,0.45)]' : 'border-red-400/50 bg-red-500/20 text-red-200 hover:bg-red-500/30'}`}
		                                    style={{ left: `${endMarkerLeft}%`, top: endMarkerTop }}
		                                    aria-label={`Drag end boundary — ${formatTime(anchor.end)}`}
		                                    onPointerDown={(e) => startBoundaryMapHandleDrag(e, 'end', edgeWindowStart, edgeWindowEnd)}
		                                    onKeyDown={(e) => {
		                                      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeAnchor('end', -1); }
		                                      else if (e.key === 'ArrowRight') { e.preventDefault(); nudgeAnchor('end', 1); }
		                                    }}
		                                  >
		                                    E
		                                  </button>
		                                  <div
		                                    className={`absolute top-3 bottom-3 z-[1] w-0.5 rounded-full pointer-events-none ${focusHandle === 'start' ? 'bg-green-200/35 shadow-[0_0_8px_rgba(34,197,94,0.2)]' : 'bg-red-200/35 shadow-[0_0_8px_rgba(239,68,68,0.2)]'}`}
		                                    style={{ left: `${focusLeft}%` }}
		                                  />
		                                </div>
		                              </div>

		                              <div className="mt-2 grid grid-cols-3 items-center gap-2 lg:col-span-2">
		                                <button
		                                  type="button"
		                                  onClick={(e) => {
		                                    e.stopPropagation();
		                                    focusInlineAnchor(previousAnchor, 'end');
		                                  }}
		                                  disabled={!previousAnchor}
		                                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900/75 px-3 text-xs font-bold text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-100 disabled:opacity-35 disabled:hover:border-slate-700 disabled:hover:text-slate-300"
		                                  title="Previous clip"
		                                >
		                                  <ChevronLeft size={14} />
		                                  Prev
		                                </button>
			                                <button
			                                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border px-3 text-[10px] font-bold uppercase tracking-wide transition-all"
	                                  aria-pressed={previewCardLooping}
	                                  title={previewCardLooping ? 'Loop is ON — click to disable' : 'Loop is OFF — click to enable'}
	                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => { e.stopPropagation(); setPreviewCardLooping(l => !l); }}
                                  style={{
                                    background: previewCardLooping ? 'rgba(0, 212, 255, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                                    color: previewCardLooping ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
                                    boxShadow: previewCardLooping ? '0 0 8px rgba(0, 212, 255, 0.4)' : 'none',
	                                    border: previewCardLooping ? '1px solid rgba(0, 212, 255, 0.5)' : '1px solid rgba(100, 116, 139, 0.3)'
	                                  }}
		                                >
		                                  {previewCardLooping ? 'Loop on' : 'Loop off'}
		                                </button>
			                                <button
			                                  type="button"
		                                  onClick={(e) => {
		                                    e.stopPropagation();
		                                    focusInlineAnchor(nextAnchor, 'start');
		                                  }}
		                                  disabled={!nextAnchor}
			                                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md border border-slate-700 bg-slate-900/75 px-3 text-xs font-bold text-slate-300 transition hover:border-cyan-400/50 hover:text-cyan-100 disabled:opacity-35 disabled:hover:border-slate-700 disabled:hover:text-slate-300"
			                                  title="Next clip"
			                                >
			                                  Next
			                                  <ChevronRight size={14} />
			                                </button>
			                                <span className="col-span-3 text-center font-mono text-[10px] text-slate-400 tabular-nums">{formatTime(anchor.start)} - {formatTime(anchor.end)}</span>
		                              </div>
		                            </div>
		                          ) : (
	                            <div className="flex min-h-36 items-center justify-center">
	                              <span className="text-slate-700 text-[10px] uppercase tracking-widest select-none">Preview</span>
	                            </div>
	                          )}
	                        </div>

	                      </div>
	                    </div>
	                    );
                  })()}
                  {/* ═══ End Loupe Strip ═══ */}

                  {/* Unified Layered Timeline - Option B */}
                  <div className="mb-1 sm:mb-4">
                    {/* Unified Timeline Container - Layered Design (Option B) */}
                    <div className="bg-slate-900/30 rounded-lg p-1 sm:p-3">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Timeline</h3>
                          <button
                            type="button"
                            onClick={() => setTimelineZoom(z => (z > 1 ? 1 : 8))}
                            disabled={!selectedAnchor}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${timelineView.zoomed ? 'border-cyan-400/60 bg-cyan-500/15 text-cyan-200 shadow-[0_0_12px_rgba(0,212,255,0.25)]' : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:border-cyan-400/40 hover:text-cyan-200 disabled:opacity-40 disabled:hover:border-slate-700 disabled:hover:text-slate-400'}`}
                            title={timelineView.zoomed ? 'Zoom out timeline' : 'Zoom to selected clip'}
                            aria-label={timelineView.zoomed ? 'Zoom out timeline' : 'Zoom to selected clip'}
                          >
                            {timelineView.zoomed ? <ZoomOut size={15} /> : <ZoomIn size={15} />}
                          </button>
                        </div>
                        <div className="text-right text-xs text-gray-400">
                          <span ref={timeDisplayRef}>{formatTime(currentTime)} / {formatTime(duration)}</span> • {anchors.length} clip{anchors.length === 1 ? '' : 's'} • {formatTime(anchorTime)}
                          {timelineView.zoomed && (
                            <span className="ml-2 font-mono text-cyan-300/80">{formatTime(timelineView.start)} - {formatTime(timelineView.end)}</span>
                          )}
                        </div>
                      </div>

                      {/* Layered Timeline: Top = Playhead Track, Bottom = Clips Lane */}
                      <div className="relative h-[124px] overflow-visible rounded-lg border border-slate-700/50 bg-gradient-to-b from-slate-800/60 to-slate-900/80 sm:h-[160px]">

                        {/* Top Layer: Playhead Track (30% height) - Click to seek */}
                        <div
                          ref={timelineRef}
                          onMouseDown={handleTimelineMouseDown}
                          onMouseMove={(e) => {
                            // Show hover preview tooltip
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const percent = Math.max(0, Math.min(1, x / rect.width));
                            const time = timelineView.start + (percent * timelineView.duration);
                            setHoverTime(time);
                          }}
                          onMouseLeave={() => setHoverTime(null)}
                          onClick={(e) => {
                            // Clicking playhead track switches to full video mode
                            if (playbackMode === 'clips') {
                              setPlaybackMode('full');
                              stopEnhancedPreview();
                            }
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            const touch = e.touches[0];
                            handleTimelineMouseDown({ ...e, clientX: touch.clientX });
                          }}
                          onTouchMove={(e) => {
                            e.preventDefault();
                          }}
                          className="absolute top-0 left-0 right-0 h-12 cursor-pointer hover:bg-slate-800/40 transition-colors border-b border-slate-700/50"
                          style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                          title="Click to seek video"
                        >
                          {/* Time markers at top */}
                          <div className="absolute top-1 left-0 right-0 flex justify-between px-2 text-[10px] text-gray-500 pointer-events-none">
                            <span>{formatTime(timelineView.start)}</span>
                            <span>{formatTime(timelineView.start + (timelineView.duration / 4))}</span>
                            <span>{formatTime(timelineView.start + (timelineView.duration / 2))}</span>
                            <span>{formatTime(timelineView.start + (3 * timelineView.duration / 4))}</span>
                            <span>{formatTime(timelineView.end)}</span>
                          </div>

                          {/* Playhead - spans full height of timeline */}
                          <div
                            ref={playheadRef}
                            className="absolute top-0 h-[124px] w-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(0,212,255,0.6)] pointer-events-none sm:h-[160px]"
                            style={{
                              display: currentTime >= timelineView.start && currentTime <= timelineView.end ? 'block' : 'none',
                              left: `${getTimelinePercent(currentTime)}%`,
                              zIndex: 50,
                            }}
                          >
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
                          </div>

                          {/* Progress bar fill */}
                          <div
                            ref={playheadProgressRef}
                            className="absolute bottom-0 left-0 h-1 bg-cyan-500/30 pointer-events-none"
                            style={{ width: `${Math.max(0, Math.min(100, getTimelinePercent(currentTime)))}%` }}
                          />

                          {/* Hover preview tooltip */}
                          {hoverTime !== null && (
                            <div
                              className="absolute top-0 -translate-y-8 pointer-events-none z-30"
                              style={{ left: `${getTimelinePercent(hoverTime)}%`, transform: 'translateX(-50%) translateY(-100%)' }}
                            >
                              <div className="bg-slate-900 px-2 py-1 rounded text-xs text-cyan-400 border border-cyan-500/50 shadow-lg">
                                {formatTime(hoverTime)}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Bottom Layer: Clips Lane (70% height) - Create and edit clips */}
                        <div
                          onDoubleClick={(e) => {
                            // Double-click clips lane to create anchor
                            if (!duration) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            const time = getTimelineTimeFromClientX(e.clientX, rect);

                            const newAnchor = {
                              id: Date.now(),
                              start: time,
                              end: Math.min(time + 1, duration)
                            };

                            const hasOverlap = anchors.some(a =>
                              (newAnchor.start >= a.start && newAnchor.start < a.end) ||
                              (newAnchor.end > a.start && newAnchor.end <= a.end) ||
                              (newAnchor.start <= a.start && newAnchor.end >= a.end)
                            );

                            if (hasOverlap) {
                              showToast('Clip overlaps with an existing clip — try a different position', 'warning');
                              return;
                            }

                            const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
                            setAnchors(updated);
                            saveToHistory(updated);
                            setSelectedAnchor(newAnchor.id);
                            setSelectedClipFocusTime(newAnchor.start);
                            setHasCreatedFirstClip(true);
                          }}
                          onTouchEnd={(e) => {
                            // Handle double-tap for mobile
                            e.preventDefault();
                            const now = Date.now();
                            const timeSinceLastTap = now - lastTapTimeRef.current;
                            const touch = e.changedTouches[0];
                            const tapPosition = { x: touch.clientX, y: touch.clientY };
                            const distance = Math.sqrt(
                              Math.pow(tapPosition.x - lastTapPositionRef.current.x, 2) +
                              Math.pow(tapPosition.y - lastTapPositionRef.current.y, 2)
                            );

                            if (timeSinceLastTap < 300 && distance < 30) {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const time = getTimelineTimeFromClientX(tapPosition.x, rect);

                              const newAnchor = {
                                id: Date.now(),
                                start: time,
                                end: Math.min(time + 1, duration)
                              };

                              const hasOverlap = anchors.some(a =>
                                (newAnchor.start >= a.start && newAnchor.start < a.end) ||
                                (newAnchor.end > a.start && newAnchor.end <= a.end) ||
                                (newAnchor.start <= a.start && newAnchor.end >= a.end)
                              );

                              if (!hasOverlap) {
                                const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
                                setAnchors(updated);
                                saveToHistory(updated);
                                setSelectedAnchor(newAnchor.id);
                                setSelectedClipFocusTime(newAnchor.start);
                                setHasCreatedFirstClip(true);
                              }

                              lastTapTimeRef.current = 0;
                            } else {
                              lastTapTimeRef.current = now;
                              lastTapPositionRef.current = tapPosition;
                            }
                          }}
                          className="absolute bottom-0 left-0 right-0 top-10 cursor-crosshair transition-colors hover:bg-slate-800/20 sm:top-12"
                          title="Double-click to create clip"
                        >
                          {/* === Phase 5A: Magnifier Lens — floats above cursor during anchor drag === */}
                          <div
                            ref={lensRef}
                            style={{
                              display: 'none',
                              position: 'absolute',
                              top: '-34px',
                              transform: 'translateX(-50%)',
                              zIndex: 500,
                              pointerEvents: 'none',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            className="bg-slate-950/95 border border-cyan-500/70 text-cyan-300 font-mono text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg shadow-cyan-500/30 whitespace-nowrap"
                          >
                            <span style={{ opacity: 0.7 }}>⏱</span>
                            <span ref={lensTimestampRef}>0:00.0</span>
                          </div>

                          {anchors.length === 0 ? (
                            // Empty state
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                              <div className="text-2xl mb-1 opacity-40">✂️</div>
                              <div className="text-xs font-medium">No clips yet</div>
                              <div className="text-[10px] mt-1 opacity-60">Double-click to create a clip</div>
                            </div>
                          ) : (
                            // Clips display
                            <>
                              {anchors.map((anchor, index) => {
                                const isSelected = selectedAnchor === anchor.id;
                                const colors = getAnchorColor(index, isSelected);
                                const visibleStart = Math.max(anchor.start, timelineView.start);
                                const visibleEnd = Math.min(anchor.end, timelineView.end);
                                if (visibleEnd <= visibleStart) return null;
                                const left = ((visibleStart - timelineView.start) / timelineView.duration) * 100;
                                const width = ((visibleEnd - visibleStart) / timelineView.duration) * 100;

                                return (
                                  <div
                                    key={anchor.id}
                                    className="absolute top-0 bottom-0"
                                    style={{
                                      left: `${left}%`,
                                      width: `${width}%`,
                                      zIndex: isSelected ? 50 : 30
                                    }}
                                  >
                                    {/* Preview card moved below timeline (above loupe) — no longer floats over timeline */}

                                    <div
                                      data-anchor-element="true"
                                      onClick={(e) => handleAnchorClick(e, anchor)}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        deleteAnchor(anchor.id);
                                      }}
                                      onMouseDown={(e) => handleAnchorMouseDown(e, anchor, 'anchor-move')}
                                      onTouchStart={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedAnchor(anchor.id);
                                        handleAnchorTouchStart(e, anchor, 'anchor-move');
                                      }}
                                      onMouseEnter={() => {
                                        if (!previewAnchor) {
                                          setHoveredAnchor(anchor);
                                        }
                                      }}
                                      onMouseLeave={() => {
                                        if (!previewAnchor || previewAnchor.id !== anchor.id) {
                                          setHoveredAnchor(null);
                                        }
                                      }}
                                      className={`absolute inset-0 ${colors.bg} border-2 ${colors.border} ${isSelected ? colors.glow : ''} rounded-lg cursor-move transition-all hover:scale-[1.02] touch-manipulation`}
                                      style={{ touchAction: 'none', zIndex: 10 }}
                                    >
                                      <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none">
                                        {formatTime(anchor.end - anchor.start)}
                                      </div>

                                      {/* AUDIT P1 #5: loupe discoverability — show magnifier on
                                          hover so users see that clicking zooms into this anchor. */}
                                      {!isSelected && hoveredAnchor?.id === anchor.id && (
                                        <div
                                          className="absolute top-0.5 right-0.5 pointer-events-none flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
                                          style={{ width: '18px', height: '18px', boxShadow: '0 0 10px rgba(0,212,255,0.5)' }}
                                          aria-hidden="true"
                                        >
                                          <span className="text-[11px] leading-none">🔍</span>
                                        </div>
                                      )}

                                      {isSelected && (
                                        <>
                                          {/* Left handle */}
                                          <div
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              handleAnchorMouseDown(e, anchor, 'anchor-left');
                                            }}
                                            onTouchStart={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleAnchorTouchStart(e, anchor, 'anchor-left');
                                            }}
                                            className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 cursor-ew-resize hover:bg-green-400 transition-all rounded-full touch-none -translate-x-1/2"
                                            style={{ touchAction: 'none', zIndex: 100, pointerEvents: 'auto' }}
                                          >
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-green-400 rounded-full shadow-lg border-2 border-white/30" />
                                          </div>
                                          {/* Right handle */}
                                          <div
                                            onMouseDown={(e) => {
                                              e.stopPropagation();
                                              handleAnchorMouseDown(e, anchor, 'anchor-right');
                                            }}
                                            onTouchStart={(e) => {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              handleAnchorTouchStart(e, anchor, 'anchor-right');
                                            }}
                                            className="absolute right-0 top-0 bottom-0 w-1 bg-red-500 cursor-ew-resize hover:bg-red-400 transition-all rounded-full touch-none translate-x-1/2"
                                            style={{ touchAction: 'none', zIndex: 100, pointerEvents: 'auto' }}
                                          >
                                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-red-400 rounded-full shadow-lg border-2 border-white/30" />
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          )}
                        </div>{/* end clips lane */}
                      </div>{/* end timeline container */}

                      {/* Loupe strip moved above main timeline — see "Loupe Strip" section above */}

                      {/* Helper text */}
                      <div className="text-xs text-gray-500 text-center mt-2">
                        {anchors.length > 0
                          ? 'Top: Click to seek • Bottom: Double-click to create • Drag clips to move • Drag handles to trim'
                          : 'Playhead above shows current position • Double-click below to create clips'}
                      </div>
                    </div>
                  </div>
	                  {/* End Timeline Section */}
	                    </>
	                  ) : (
	                    <div className="mb-1 sm:mb-4 rounded-lg border border-slate-700/60 bg-slate-900/30 p-3 text-center">
	                      <div className="text-sm font-semibold text-white">Need exact cuts?</div>
	                      <div className="mt-1 text-xs text-slate-400">Switch to Pro tools for manual timeline clips, handle dragging, loupe trimming, undo history, and source/music controls.</div>
	                      <button
	                        type="button"
	                        onClick={() => setWorkspaceMode('pro')}
	                        className="mt-3 min-h-11 rounded-lg border border-pink-400/40 bg-pink-500/10 px-4 py-2 text-sm font-semibold text-pink-200 transition hover:bg-pink-500/20"
	                      >
	                        Open Pro Tools
	                      </button>
	                    </div>
	                  )}

	                  {/* Action Toolbar Section */}
	                  <div className="bg-slate-900/30 rounded-lg p-2 sm:p-3">
	                    {isProMode && (
	                      <>
	                    {/* Toolbar Buttons Row */}
	                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        onClick={undo}
                        disabled={historyIndex <= 0}
                        className="px-3 py-1.5 btn-secondary rounded-lg flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                        title="Undo (Ctrl+Z)"
                      >
                        <RotateCcw size={14} />
                        <span>Undo</span>
                      </button>
                      <button
                        onClick={redo}
                        disabled={historyIndex >= history.length - 1}
                        className="px-3 py-1.5 btn-secondary rounded-lg flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                        title="Redo (Ctrl+Y)"
                      >
                        <RotateCw size={14} />
                        <span>Redo</span>
                      </button>
                      <button
                        onClick={() => {
                          if (anchors.length > 0) {
                            {
                              const count = anchors.length;
                              const emptyAnchors = [];
                              setAnchors(emptyAnchors);
                              saveToHistory(emptyAnchors);
                              setSelectedAnchor(null);
                              setSelectedClipFocusTime(null);
                              setPreviewAnchor(null);
                              showToast(`Cleared ${count} clip${count === 1 ? '' : 's'}`, 'success', { label: 'Undo', onClick: undo });
                            }
                          }
                        }}
                        disabled={anchors.length === 0}
                        className="px-3 py-1.5 btn-secondary rounded-lg flex items-center gap-1 text-xs disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={14} />
                        <span>Clear</span>
                      </button>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="bg-slate-800/50 p-2 rounded text-center">
                        <div className="text-gray-400">Clips</div>
                        <div className="font-semibold text-white">{anchors.length}</div>
                      </div>
                      <div className="bg-slate-800/50 p-2 rounded text-center">
                        <div className="text-gray-400">Duration</div>
                        <div className="font-semibold text-blue-400">{formatTime(anchorTime)}</div>
                      </div>
                      <div className="bg-slate-800/50 p-2 rounded text-center">
                        <div className="text-gray-400">Selected</div>
                        <div className="font-semibold text-amber-400">
                          {selectedAnchor ? anchors.findIndex(a => a.id === selectedAnchor) + 1 : '-'}
                        </div>
	                      </div>
	                    </div>
	                      </>
	                    )}

	                    {/* Auto-Generator Controls */}
	                    <div className="bg-slate-800/50 rounded-lg p-3 space-y-3 border border-slate-700/60">
	                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                        <div>
	                          <div className="text-sm font-bold text-white">Make Clips</div>
	                          <div className="text-xs text-slate-400">
	                            {anchors.length > 0 ? 'Replace the current draft or keep trimming by hand.' : 'Create a first draft, then adjust the timeline.'}
	                          </div>
	                        </div>
	                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-950/50 p-1 text-xs">
	                          {[
	                            { id: 'quick', label: 'Fast', note: 'free' },
	                            { id: 'smart', label: 'Story', note: '$0.60' },
	                            { id: 'pro', label: 'Deep', note: '$1.20' }
	                          ].map(mode => (
	                            <button
	                              key={mode.id}
	                              type="button"
	                              onClick={() => setAutoGenMode(mode.id)}
	                              aria-pressed={autoGenMode === mode.id}
	                              className={`min-h-11 rounded-md px-3 py-2 font-semibold transition ${
	                                autoGenMode === mode.id
	                                  ? 'bg-cyan-400 text-slate-950 shadow-[0_0_14px_rgba(0,212,255,0.35)]'
	                                  : 'text-slate-300 hover:bg-slate-800'
	                              }`}
	                            >
	                              <span className="block leading-tight">{mode.label}</span>
	                              <span className={`block text-[10px] leading-tight ${autoGenMode === mode.id ? 'text-slate-700' : 'text-slate-500'}`}>{mode.note}</span>
	                            </button>
	                          ))}
	                        </div>
	                      </div>

	                      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
	                        <div className="space-y-3">
	                          <div className="flex items-center gap-3 text-xs">
	                            <label htmlFor="target-duration" className="w-24 text-gray-300">
	                              Length: {targetDuration}s
	                            </label>
	                              <input
	                                type="range"
	                                id="target-duration"
	                              min="5"
	                              max="180"
	                              step="1"
	                              value={targetDuration}
	                              onChange={(e) => setTargetDuration(parseInt(e.target.value))}
	                              className="flex-1 h-1 rounded-lg appearance-none cursor-pointer bg-slate-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-cyan-300 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-cyan-400 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
	                            />
	                          </div>

	                          {autoGenMode === 'quick' && (
	                            <div className="flex items-center gap-3 text-xs">
	                              <label htmlFor="max-clip-length" className="w-24 text-gray-300">
	                                Pace: {maxClipLength}s
	                              </label>
	                              <input
	                                type="range"
	                                id="max-clip-length"
	                                min="2"
	                                max="15"
	                                step="1"
	                                value={maxClipLength}
	                                onChange={(e) => setMaxClipLength(parseInt(e.target.value))}
	                                className="flex-1 h-1 rounded-lg appearance-none cursor-pointer bg-slate-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-400 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-pink-300 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-pink-400 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
	                              />
	                            </div>
	                          )}

		                          <div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-2">
		                            <div className="mb-2 text-xs font-semibold text-slate-300">Sync cuts to</div>
		                            <div className="grid gap-2 sm:grid-cols-2">
		                              <label className={`flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
		                                music
		                                  ? beatSyncTarget === 'music'
		                                    ? 'border-cyan-400/60 bg-cyan-500/10 text-cyan-100'
		                                    : 'border-slate-700 bg-slate-900/50 text-gray-300'
		                                  : 'border-slate-800 bg-slate-900/30 text-slate-600'
		                              }`}>
		                                <input
		                                  type="checkbox"
		                                  id="beat-sync-music"
		                                  checked={beatSyncTarget === 'music'}
		                                  onChange={(e) => setBeatSyncTarget(e.target.checked ? 'music' : 'none')}
		                                  disabled={!music}
		                                  className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
		                                />
		                                Music
		                              </label>
		                              <label className={`flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-xs transition ${
		                                beatSyncTarget === 'original'
		                                  ? 'border-pink-400/60 bg-pink-500/10 text-pink-100'
		                                  : 'border-slate-700 bg-slate-900/50 text-gray-300'
		                              }`}>
		                                <input
		                                  type="checkbox"
		                                  id="beat-sync-original"
		                                  checked={beatSyncTarget === 'original'}
		                                  onChange={(e) => setBeatSyncTarget(e.target.checked ? 'original' : 'none')}
		                                  className="h-4 w-4 cursor-pointer"
		                                />
		                                Original sound
		                              </label>
		                            </div>
		                          </div>
		                        </div>

                      {/* Auto-Generate Button */}
                      <button
                        onClick={async () => {
                          if (!video || isAnalyzing) return;

                          try {
	                            setIsAnalyzing(true);

	                            console.log(`🎬 AUTO-GENERATE V3 STARTING - Mode: ${autoGenMode.toUpperCase()}`);
	                            let beatSyncAnalysisForRun = null;
	                            if (beatSyncTarget === 'music') {
	                              if (!music) {
	                                showToast('Add music before syncing cuts to music beats', 'warning');
	                                return;
	                              }
	                              setAnalysisPhase('Reading music beats...');
	                              beatSyncAnalysisForRun = musicAnalysis;
	                              if (!beatSyncAnalysisForRun?.beatGrid?.length) {
	                                const selectedMusicDuration = (musicEndTime || musicDuration || null)
	                                  ? (musicEndTime || musicDuration) - musicStartTime
	                                  : null;
	                                beatSyncAnalysisForRun = await analyzeMusicStructure(music, musicStartTime, selectedMusicDuration);
	                                setMusicAnalysis(beatSyncAnalysisForRun);
	                              }
	                            } else if (beatSyncTarget === 'original') {
	                              setAnalysisPhase('Reading original sound beats...');
	                              beatSyncAnalysisForRun = originalSoundAnalysis;
	                              if (!beatSyncAnalysisForRun?.beatGrid?.length) {
	                                beatSyncAnalysisForRun = await analyzeMusicStructure(video, 0, duration);
	                                setOriginalSoundAnalysis(beatSyncAnalysisForRun);
	                              }
	                            }

	                            // === MODE 1: QUICK GEN (FREE - Motion Only, Variable Lengths) ===
                            if (autoGenMode === 'quick') {
                              console.log('⚡ Quick Gen: Motion detection only (FREE)');
                              setAnalysisPhase('Detecting motion...');
                              setAnalysisProgress(0);

                              // Step 1: Motion detection
                              let videoAnalysisResult = videoAnalysis;
                              if (!videoAnalysisResult || videoAnalysisResult.length === 0) {
                                console.log('🎬 Running motion detection...');
                                videoAnalysisResult = await analyzeVideo(video, motionSensitivity, (progress) => {
                                  setAnalysisProgress(progress);
                                });
                                setVideoAnalysis(videoAnalysisResult);
                              } else {
                                console.log('✅ Using cached motion analysis');
                                setAnalysisProgress(100);
                              }

                              // Step 2: Score analysis & variable clip length assignment
                              const allScores = videoAnalysisResult.map(m => m.motionScore);
                              const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
                              const maxMotionScore = Math.max(...allScores);
                              const scoreRange = (maxMotionScore - avgScore) || 1;
                              const sceneChanges = videoAnalysisResult.filter(m => m.sceneChange).length;
                              console.log('📊 Motion stats:', { frames: videoAnalysisResult.length, max: maxMotionScore.toFixed(3), avg: avgScore.toFixed(3), sceneChanges, targetDuration, maxClipLength });

                              // Candidates: above-average motion OR scene changes (up to 40 candidates)
                              const sortedMoments = [...videoAnalysisResult].sort((a, b) => b.motionScore - a.motionScore);
                              const candidates = sortedMoments
                                .filter(m => m.motionScore > avgScore * 0.7 || m.sceneChange)
                                .slice(0, 40);

                              // Assign variable clip length: higher score → longer clip (2s min, maxClipLength max)
                              const MIN_CLIP = 2;
                              const candidateCuts = (candidates.length > 0 ? candidates : sortedMoments.slice(0, 12))
                                .map(m => {
                                  const normalized = Math.min(1, Math.max(0, (m.motionScore - avgScore * 0.7) / scoreRange));
                                  const clipLen = Math.max(MIN_CLIP, Math.round(MIN_CLIP + normalized * (maxClipLength - MIN_CLIP)));
                                  const start = Math.max(0, m.time - clipLen * 0.3);
                                  const end = Math.min(duration, m.time + clipLen * 0.7);
                                  return { start, end, reason: m.sceneChange ? 'Scene change' : 'High motion', importance: m.motionScore };
                                });

                              // Step 3: Zone-guaranteed selection — ensure clips span the full video
                              // Divide into 5 zones; pick best candidate from each, then fill with greedy
                              const NUM_ZONES = 5;
                              const zoneBests = Array.from({ length: NUM_ZONES }, (_, zi) => {
                                const zoneStart = (zi / NUM_ZONES) * duration;
                                const zoneEnd = ((zi + 1) / NUM_ZONES) * duration;
                                // Find highest-importance candidate whose midpoint falls in this zone
                                return candidateCuts
                                  .filter(c => (c.start + c.end) / 2 >= zoneStart && (c.start + c.end) / 2 < zoneEnd)
                                  .sort((a, b) => b.importance - a.importance)[0] || null;
                              }).filter(Boolean);

                              // Start with zone anchors
                              let totalDur = 0;
                              const selectedCuts = [];
                              const addCut = (cut) => {
                                const overlaps = selectedCuts.some(s => cut.start < s.end && cut.end > s.start);
                                if (overlaps) return false;
                                const remaining = targetDuration - totalDur;
                                const actualEnd = Math.min(cut.end, cut.start + remaining);
                                const actualDur = actualEnd - cut.start;
                                if (actualDur < 1) return false;
                                selectedCuts.push({ ...cut, end: actualEnd });
                                totalDur += actualDur;
                                return true;
                              };

                              // Track zone membership so we can enforce a per-zone cap.
                              // AUDIT P0 #0: without a cap, the fill loop (sorted by motion score)
                              // would happily dump every remaining candidate into the noisiest zone,
                              // undoing the zone-bests spread.
                              const zoneOf = (cut) => Math.min(
                                NUM_ZONES - 1,
                                Math.floor((((cut.start + cut.end) / 2) / duration) * NUM_ZONES)
                              );
                              const zoneCounts = Array(NUM_ZONES).fill(0);
                              const expectedClips = Math.max(5, Math.ceil(targetDuration / 6));
                              const MAX_PER_ZONE = Math.max(2, Math.ceil(expectedClips * 0.35));

                              // Guarantee one clip per zone (chronological order)
                              for (const cut of zoneBests) {
                                if (totalDur >= targetDuration) break;
                                if (addCut(cut)) zoneCounts[zoneOf(cut)]++;
                              }

                              // Fill remaining duration with best remaining candidates, skipping
                              // any zone already at cap (but only once ≥3 zones are represented).
                              for (const cut of candidateCuts) {
                                if (totalDur >= targetDuration) break;
                                const zi = zoneOf(cut);
                                const zonesCovered = zoneCounts.filter(n => n > 0).length;
                                if (zonesCovered >= 3 && zoneCounts[zi] >= MAX_PER_ZONE) continue;
                                if (addCut(cut)) zoneCounts[zi]++;
                              }

                              // Sort chronologically
                              const chronoCuts = selectedCuts.sort((a, b) => a.start - b.start);
                              // Log zone distribution
                              const zoneNames = ['opening', 'early', 'middle', 'late', 'finale'];
                              const distLog = chronoCuts.map(c => zoneNames[Math.min(4, Math.floor((c.start / duration) * NUM_ZONES))]);
                              console.log('📍 Quick Gen zone distribution:', distLog.join(', '));
                              console.log(`📍 Quick Gen: ${chronoCuts.length} clips, total ${totalDur.toFixed(1)}s (target ${targetDuration}s)`);

                              // Step 4: Apply gentle beat-sync if enabled
                              let finalCuts = chronoCuts;
	                              if (beatSyncAnalysisForRun?.beatGrid?.length) {
	                                console.log(`🎵 Applying gentle beat-sync to ${beatSyncTarget}...`);
	                                finalCuts = applyGentleBeatSync(chronoCuts, beatSyncAnalysisForRun);
                              }

                              // Step 5: Create anchors
                              const finalAnchors = finalCuts.map((cut, index) => ({
                                id: Date.now() + index,
                                start: Math.max(0, cut.start),
                                end: Math.min(duration, cut.end),
                                _narrativeReason: cut.reason,
                                _importance: cut.importance
                              }));

                              console.log('✅ QUICK GEN COMPLETE:', {
                                anchorsCreated: finalAnchors.length,
                                totalDuration: finalAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1) + 's',
                                target: targetDuration + 's'
                              });

	                              setAnchors(finalAnchors);
	                              saveToHistory(finalAnchors);
	                              if (finalAnchors[0]) {
	                                setSelectedAnchor(finalAnchors[0].id);
	                                setSelectedClipFocusTime(finalAnchors[0].start);
	                                setPreviewAnchorIndex(0);
	                                previewAnchorIndexRef.current = 0;
	                                setPlaybackMode('clips');
	                              }
	                            }

                            // === MODE 2: SMART GEN (V5 - Five-Phase: Gather → Analyze → Seek → Supplement → Select) ===
                            else if (autoGenMode === 'smart') {
                              console.log('🧠 Smart Gen: Five-Phase Editorial Workflow (~$0.60-$1.50)');
                              setAnalysisProgress(0);
                              setAnalysisPhase('Extracting frames...');

                              // PHASE 1: Gather comprehensive frames
                              const { frames: allFrames, zones } = await gatherComprehensiveFrames(video, duration);
                              setAnalysisProgress(20);

                              if (allFrames.length === 0) {
                                showToast('Failed to extract frames from video — please try again', 'error');
                                return;
                              }

                              // PHASE 2: Identify moments (no clip lengths yet)
                              setAnalysisPhase('AI analyzing frames...');
                              console.log('📤 Sending', allFrames.length, 'frames to Claude API...');
                              const initialAnalysis = await analyzeNarrativeComprehensive(allFrames, targetDuration, zones);
                              setAnalysisProgress(50);

                              if (!initialAnalysis) {
                                showToast('Narrative analysis failed — please try again', 'error');
                                return;
                              }

                              // Build initial moment inventory with zone enrichment
                              const enrichMomentsWithZones = (moments, zones) => {
                                return moments.map(moment => {
                                  const frameIndex = Number(moment.frameReference);
                                  const referencedFrame = Number.isFinite(frameIndex)
                                    ? allFrames[frameIndex - 1]
                                    : null;
                                  const timestamp = Number.isFinite(referencedFrame?.timestamp)
                                    ? referencedFrame.timestamp
                                    : moment.timestamp;
                                  // Find which zone this timestamp falls into
                                  const zone = zones.find(z => timestamp >= z.start && timestamp <= z.end);
                                  return {
                                    ...moment,
                                    timestamp,
                                    zone: zone?.name || 'unknown',
                                    zoneIndex: zones.indexOf(zone)
                                  };
                                });
                              };

                              let allMoments = enrichMomentsWithZones(initialAnalysis.keyMoments || [], zones);

                              // PHASE 3: Agentic seeking for missing moments
                              setAnalysisPhase('Seeking missing moments...');
                              if (initialAnalysis.missingMoments && initialAnalysis.missingMoments.length > 0) {
                                const { newFrames, searches } = await seekMissingMoments(
                                  video,
                                  duration,
                                  initialAnalysis.missingMoments,
                                  allFrames,
                                  zones
                                );

                                if (newFrames && newFrames.length > 0) {
                                  const seekAnalysis = await analyzeNewFrames(
                                    allFrames,
                                    newFrames,
                                    targetDuration,
                                    zones,
                                    initialAnalysis.missingMoments,
                                    initialAnalysis.suggestedCuts || []
                                  );
                                  if (seekAnalysis && seekAnalysis.suggestedCuts) {
                                    // Convert suggestedCuts to moment format and add to allMoments
                                    const newMoments = seekAnalysis.suggestedCuts.map(cut => ({
                                      timestamp: cut.startTime,
                                      importance: cut.importance || 0.7,
                                      description: cut.reason,
                                      source: 'seek'
                                    }));
                                    allMoments = allMoments.concat(enrichMomentsWithZones(newMoments, zones));
                                  }
                                }
                              }

                              // PHASE 4: Supplement with motion detection
                              setAnalysisProgress(70);
                              setAnalysisPhase('Detecting motion...');
                              let videoAnalysisResult = videoAnalysis;
                              if (!videoAnalysisResult || videoAnalysisResult.length === 0) {
                                videoAnalysisResult = await analyzeVideo(video, motionSensitivity);
                                setVideoAnalysis(videoAnalysisResult);
                              }

                              const motionMoments = videoAnalysisResult
                                .filter(m => m.motionScore > 0.7 || m.sceneChange)
                                .map(m => ({
                                  timestamp: m.time,
                                  importance: m.motionScore * 0.6,
                                  description: m.sceneChange ? 'Scene change (motion)' : 'High motion',
                                  source: 'motion',
                                  zone: zones.find(z => m.time >= z.start && m.time <= z.end)?.name || 'unknown'
                                }));

                              allMoments = allMoments.concat(motionMoments);

                              // PHASE 5: Final selection
                              setAnalysisProgress(85);
                              setAnalysisPhase('Selecting best clips...');
                              const finalSelection = await selectFinalClips(allMoments, targetDuration, initialAnalysis.storyType || 'video');

                              if (!finalSelection || !finalSelection.selectedClips) {
                                showToast('Clip selection failed — please try again', 'error');
                                return;
                              }

                              // Apply beat-sync if enabled
                              let selectedClips = finalSelection.selectedClips;
	                              if (beatSyncAnalysisForRun?.beatGrid?.length) {
	                                selectedClips = applyGentleBeatSync(selectedClips, beatSyncAnalysisForRun);
                              }

                              // Resolve timestamps via moment inventory (fixes 0:00 clustering)
                              // and enforce zone distribution before creating anchors.
                              const resolvedClips = resolveAndValidateClips(selectedClips, allMoments, duration);
                              const newAnchors = resolvedClips.map((clip, index) => ({
                                id: Date.now() + index,
                                start: clip.start,
                                end: clip.end,
                                _narrativeReason: clip._narrativeReason,
                                _importance: clip._importance
                              }));

                              setAnalysisProgress(100);
                              setAnalysisPhase('Complete!');
                              console.log('✅ SMART GEN COMPLETE:', {
                                anchorsCreated: newAnchors.length,
                                totalDuration: newAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1)
                              });

	                              setAnchors(newAnchors);
	                              saveToHistory(newAnchors);
	                              if (newAnchors[0]) {
	                                setSelectedAnchor(newAnchors[0].id);
	                                setSelectedClipFocusTime(newAnchors[0].start);
	                                setPreviewAnchorIndex(0);
	                                previewAnchorIndexRef.current = 0;
	                                setPlaybackMode('clips');
	                              }
	                            }

                            // === MODE 3: PRO GEN (Full Narrative Analysis) ===
                            else if (autoGenMode === 'pro') {
                              console.log('💎 Pro Gen: Full Narrative Analysis (~$1.20-$2.00)');

                              // Similar to Smart Gen but with more comprehensive analysis
                              const { frames: allFrames, zones } = await gatherComprehensiveFrames(video, duration);

                              if (allFrames.length === 0) {
                                showToast('Failed to extract frames from video — please try again', 'error');
                                return;
                              }

                              // Run full narrative analysis with pro settings
                              const narrativeResult = await analyzeNarrativeComprehensive(allFrames, targetDuration, zones, { mode: 'pro' });

                              if (!narrativeResult) {
                                showToast('Narrative analysis failed — please try again', 'error');
                                return;
                              }

                              const enrichMomentsWithZones = (moments, zones) => {
                                return moments.map(moment => {
                                  const frameIndex = Number(moment.frameReference);
                                  const referencedFrame = Number.isFinite(frameIndex)
                                    ? allFrames[frameIndex - 1]
                                    : null;
                                  const timestamp = Number.isFinite(referencedFrame?.timestamp)
                                    ? referencedFrame.timestamp
                                    : moment.timestamp;
                                  const zone = zones.find(z => timestamp >= z.start && timestamp <= z.end);
                                  return {
                                    ...moment,
                                    timestamp,
                                    zone: zone?.name || 'unknown',
                                    zoneIndex: zones.indexOf(zone)
                                  };
                                });
                              };

                              let allMoments = enrichMomentsWithZones(narrativeResult.keyMoments || [], zones);

                              // Pro mode: More aggressive seeking
                              if (narrativeResult.missingMoments && narrativeResult.missingMoments.length > 0) {
                                const { newFrames } = await seekMissingMoments(
                                  video,
                                  duration,
                                  narrativeResult.missingMoments,
                                  allFrames,
                                  zones
                                );

                                if (newFrames && newFrames.length > 0) {
                                  const seekAnalysis = await analyzeNewFrames(
                                    allFrames,
                                    newFrames,
                                    targetDuration,
                                    zones,
                                    narrativeResult.missingMoments,
                                    narrativeResult.suggestedCuts || []
                                  );
                                  if (seekAnalysis && seekAnalysis.suggestedCuts) {
                                    const newMoments = seekAnalysis.suggestedCuts.map(cut => ({
                                      timestamp: cut.startTime,
                                      importance: cut.importance || 0.7,
                                      description: cut.reason,
                                      source: 'seek'
                                    }));
                                    allMoments = allMoments.concat(enrichMomentsWithZones(newMoments, zones));
                                  }
                                }
                              }

                              // Final selection with pro quality
                              const finalSelection = await selectFinalClips(allMoments, targetDuration, narrativeResult.storyType || 'video');

                              if (!finalSelection || !finalSelection.selectedClips) {
                                showToast('Clip selection failed — please try again', 'error');
                                return;
                              }

                              let selectedClips = finalSelection.selectedClips;
	                              if (beatSyncAnalysisForRun?.beatGrid?.length) {
	                                selectedClips = applyGentleBeatSync(selectedClips, beatSyncAnalysisForRun);
                              }

                              const resolvedClips = resolveAndValidateClips(selectedClips, allMoments, duration);
                              const newAnchors = resolvedClips.map((clip, index) => ({
                                id: Date.now() + index,
                                start: clip.start,
                                end: clip.end,
                                _narrativeReason: clip._narrativeReason,
                                _importance: clip._importance
                              }));

                              console.log('✅ PRO GEN COMPLETE:', {
                                anchorsCreated: newAnchors.length,
                                totalDuration: newAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1)
                              });

	                              setAnchors(newAnchors);
	                              saveToHistory(newAnchors);
	                              if (newAnchors[0]) {
	                                setSelectedAnchor(newAnchors[0].id);
	                                setSelectedClipFocusTime(newAnchors[0].start);
	                                setPreviewAnchorIndex(0);
	                                previewAnchorIndexRef.current = 0;
	                                setPlaybackMode('clips');
	                              }
	                            }

                          } catch (error) {
                            console.error('❌ Auto-generate error:', error);
                            showToast(`Auto-generate failed: ${error.message}`, 'error');
                          } finally {
                            setIsAnalyzing(false);
                            setAnalysisProgress(0);
                            setAnalysisPhase('');
                          }
	                        }}
	                        disabled={!duration || isAnalyzing}
	                        className="w-full min-h-12 px-5 py-3 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 hover:shadow-[0_0_25px_rgba(255,0,255,0.5)] rounded-xl flex items-center justify-center gap-2 font-bold shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] lg:w-56"
	                      >
	                        <Sparkles size={18} className="animate-pulse" />
	                        <span>{isAnalyzing ? 'Working...' : activeAutoGenLabel}</span>
	                      </button>
	                      </div>
	                    </div>
                  </div>
                  {/* End Action Toolbar Section */}

                </div>
                {/* End Video Editor Unified Panel */}
              </div>
            )}
          </div>
        )}


        {/* AUDIT P2 #12: keyboard-shortcut overlay. Toggled with "?" from anywhere. */}
        {showKeyboardHelp && (
          <div
            className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-[10000] p-4"
            onClick={() => setShowKeyboardHelp(false)}
          >
            <div
              className="glass-panel p-6 rounded-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-label="Keyboard shortcuts"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-lg font-bold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</div>
                <button
                  onClick={() => setShowKeyboardHelp(false)}
                  className="text-gray-400 hover:text-white text-xl leading-none"
                  aria-label="Close"
                >×</button>
              </div>
              <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Main timeline</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm mb-4">
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">Space</kbd><span className="text-gray-300">Play / pause</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">← / →</kbd><span className="text-gray-300">Skip 1s</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">Delete</kbd><span className="text-gray-300">Remove selected anchor</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">Ctrl+Z</kbd><span className="text-gray-300">Undo</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">Ctrl+Y</kbd><span className="text-gray-300">Redo</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">?</kbd><span className="text-gray-300">Toggle this overlay</span>
              </div>
              <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Precision modal</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm mb-4">
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">← / →</kbd><span className="text-gray-300">Nudge selected handle ±1 frame</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">,</kbd><span className="text-gray-300">Previous anchor</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">.</kbd><span className="text-gray-300">Next anchor</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">S</kbd><span className="text-gray-300">Snap start to range start</span>
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">E</kbd><span className="text-gray-300">Snap end to range end</span>
              </div>
              <div className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">Loupe handles (when focused)</div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <kbd className="bg-slate-700 px-2 py-0.5 rounded text-xs font-mono">← / →</kbd><span className="text-gray-300">Adjust clip boundary ±1 frame</span>
              </div>
            </div>
          </div>
        )}

        {/* Trim Modal */}
        {showTrimModal && (
          <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50">
            <div className="glass-panel p-6 rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto">
             <div className="space-y-2 mb-3">
  {/* Top Row: Prev/Next Navigation — AUDIT P3 #17: derive index from live anchors[] */}
  <div className="flex items-center justify-center gap-4">
    <button
      onClick={goToPreviousAnchor}
      disabled={!precisionAnchor || anchors.findIndex(a => a.id === precisionAnchor.id) <= 0}
      className="px-4 py-2 btn-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Previous Anchor"
    >
      ← Prev
    </button>

    <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
      Anchor {Math.max(0, precisionAnchor ? anchors.findIndex(a => a.id === precisionAnchor.id) : 0) + 1} of {anchors.length}
    </div>

    <button
      onClick={goToNextAnchor}
      disabled={!precisionAnchor || anchors.findIndex(a => a.id === precisionAnchor.id) >= anchors.length - 1}
      className="px-4 py-2 btn-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Next Anchor"
    >
      Next →
    </button>
  </div>

  {/* Start/End Time Buttons */}
  <div className="flex items-center justify-center gap-6">
    <button
      onClick={() => {
        setSelectedHandle('start');
        setPrecisionTime(precisionAnchor.start);
        if (precisionVideoRef.current) {
          precisionVideoRef.current.currentTime = precisionAnchor.start;
        }
      }}
      className={`px-8 py-4 rounded-xl font-bold text-xl transition-all ${
        selectedHandle === 'start'
          ? 'bg-green-500 text-white shadow-lg shadow-green-500/50 scale-105'
          : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
      }`}
    >
      <div className="text-xs opacity-80 mb-1">START</div>
      <div>{formatTime(precisionAnchor.start)}</div>
    </button>

    <button
      onClick={() => {
        setSelectedHandle('end');
        setPrecisionTime(precisionAnchor.end);
        if (precisionVideoRef.current) {
          precisionVideoRef.current.currentTime = precisionAnchor.end;
        }
      }}
      className={`px-8 py-4 rounded-xl font-bold text-xl transition-all ${
        selectedHandle === 'end'
          ? 'bg-red-500 text-white shadow-lg shadow-red-500/50 scale-105'
          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
      }`}
    >
      <div className="text-xs opacity-80 mb-1">END</div>
      <div>{formatTime(precisionAnchor.end)}</div>
    </button>
  </div>
</div>
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 p-4 rounded-lg">
                    <div className="text-sm text-gray-400 mb-1">Start Time</div>
                    <div className="text-2xl font-mono text-green-400">{formatTime(trimStart)}</div>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-lg">
                    <div className="text-sm text-gray-400 mb-1">End Time</div>
                    <div className="text-2xl font-mono text-red-400">{formatTime(trimEnd)}</div>
                  </div>
                </div>

                <div className="bg-slate-900/50 p-4 rounded-lg text-center">
                  <div className="text-sm text-gray-400 mb-1">Duration</div>
                  <div className="text-3xl font-bold text-amber-400">{formatTime(trimEnd - trimStart)}</div>
                </div>

                <div>
                  <label className="text-sm text-gray-300 mb-2 block">Start Position</label>
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={trimStart}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val < trimEnd - 2) setTrimStart(val);
                    }}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-300 mb-2 block">End Position</label>
                  <input
                    type="range"
                    min="0"
                    max={duration}
                    step="0.1"
                    value={trimEnd}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (val > trimStart + 2) setTrimEnd(val);
                    }}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                {isProcessing && (
                  <div>
                    <div className="text-sm text-gray-300 mb-2">Processing... {progress}%</div>
                    <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 border-r-2 border-cyan-500/50 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowTrimModal(false)}
                    disabled={isProcessing}
                    className="px-6 py-3 btn-secondary rounded-lg font-semibold disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyTrim}
                    disabled={isProcessing || (trimEnd - trimStart) < 2}
                    className="px-6 py-3 btn-accent hover:scale-105 rounded-lg font-semibold transition disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isProcessing ? 'Processing...' : 'Apply Trim'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Precision Modal */}
{showPrecisionModal && precisionAnchor && anchors.some(a => a.id === precisionAnchor.id) && (
  <div
    className="fixed inset-0 glass-modal-overlay flex items-center justify-center p-2 sm:p-4"
    style={{ zIndex: 9999, touchAction: 'none', WebkitOverflowScrolling: 'auto' }}
    onTouchMove={(e) => {
      // Allow scrolling within modal but prevent body scroll
      const target = e.target;
      if (!target.closest('.modal-scroll-container')) {
        e.preventDefault();
      }
    }}
  >
    <div className="glass-panel p-4 sm:p-6 rounded-xl sm:rounded-2xl max-w-6xl w-full h-full sm:h-auto sm:max-h-[95vh] overflow-y-auto flex flex-col modal-scroll-container" style={{ zIndex: 10000 }}>
            <div className="space-y-3 mb-6">
  {/* Top Row: Prev/Next Navigation — AUDIT P3 #17: derive index from live anchors[] */}
  <div className="flex items-center justify-center gap-4">
    <button
      onClick={goToPreviousAnchor}
      disabled={!precisionAnchor || anchors.findIndex(a => a.id === precisionAnchor.id) <= 0}
      className="px-4 py-2 btn-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Previous Anchor"
    >
      ← Prev
    </button>

    <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
      Anchor {Math.max(0, precisionAnchor ? anchors.findIndex(a => a.id === precisionAnchor.id) : 0) + 1} of {anchors.length}
    </div>

    <button
      onClick={goToNextAnchor}
      disabled={!precisionAnchor || anchors.findIndex(a => a.id === precisionAnchor.id) >= anchors.length - 1}
      className="px-4 py-2 btn-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Next Anchor"
    >
      Next →
    </button>
  </div>
</div>

{/* Video Preview */}
<div className="bg-black rounded-lg overflow-hidden mb-3 flex-shrink-0">
                <video
                  ref={precisionVideoRef}
                  src={videoUrl}
                  className="w-full h-64 object-contain"
                  onTimeUpdate={handlePrecisionVideoTimeUpdate}
                  onEnded={() => setPrecisionPlaying(false)}
                />
              </div>

              {/* Controls */}
             {/* Frame Controls */}
<div className="flex items-center justify-center gap-3 mb-4">
  <button
    onMouseDown={(e) => {
      e.preventDefault();
      if (!precisionVideoRef.current || !precisionAnchor) return;

      const step = () => {
        const newTime = precisionAnchor[selectedHandle] - 1/30;
        const range = getPrecisionRange(precisionAnchor);

        if (selectedHandle === 'start') {
          const constrainedTime = Math.max(range.start, Math.min(precisionAnchor.end - 1, newTime));
          setPrecisionAnchor(prev => ({ ...prev, start: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        } else {
          const constrainedTime = Math.max(precisionAnchor.start + 1, Math.min(range.end, newTime));
          setPrecisionAnchor(prev => ({ ...prev, end: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        }
      };

      step();
      const interval = setInterval(step, 100);

      const cleanup = () => clearInterval(interval);
      document.addEventListener('mouseup', cleanup, { once: true });
      document.addEventListener('touchend', cleanup, { once: true });
    }}
    onTouchStart={(e) => {
      e.preventDefault();
      if (!precisionVideoRef.current || !precisionAnchor) return;

      const step = () => {
        const newTime = precisionAnchor[selectedHandle] - 1/30;
        const range = getPrecisionRange(precisionAnchor);

        if (selectedHandle === 'start') {
          const constrainedTime = Math.max(range.start, Math.min(precisionAnchor.end - 1, newTime));
          setPrecisionAnchor(prev => ({ ...prev, start: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        } else {
          const constrainedTime = Math.max(precisionAnchor.start + 1, Math.min(range.end, newTime));
          setPrecisionAnchor(prev => ({ ...prev, end: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        }
      };

      step();
      const interval = setInterval(step, 100);

      const cleanup = () => clearInterval(interval);
      document.addEventListener('mouseup', cleanup, { once: true });
      document.addEventListener('touchend', cleanup, { once: true });
    }}
    className="px-4 py-3 btn-secondary rounded-lg font-semibold shadow-md"
  >
    ← Frame
  </button>

  <button
    onClick={togglePrecisionPlay}
    className="p-4 btn-accent rounded-full shadow-lg transition"
  >
    {precisionPlaying ? <Pause size={24} /> : <Play size={24} />}
  </button>

  <button
    onMouseDown={(e) => {
      e.preventDefault();
      if (!precisionVideoRef.current || !precisionAnchor) return;

      const step = () => {
        const newTime = precisionAnchor[selectedHandle] + 1/30;
        const range = getPrecisionRange(precisionAnchor);

        if (selectedHandle === 'start') {
          const constrainedTime = Math.max(range.start, Math.min(precisionAnchor.end - 1, newTime));
          setPrecisionAnchor(prev => ({ ...prev, start: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        } else {
          const constrainedTime = Math.max(precisionAnchor.start + 1, Math.min(range.end, newTime));
          setPrecisionAnchor(prev => ({ ...prev, end: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        }
      };

      step();
      const interval = setInterval(step, 100);

      const cleanup = () => clearInterval(interval);
      document.addEventListener('mouseup', cleanup, { once: true });
      document.addEventListener('touchend', cleanup, { once: true });
    }}
    onTouchStart={(e) => {
      e.preventDefault();
      if (!precisionVideoRef.current || !precisionAnchor) return;

      const step = () => {
        const newTime = precisionAnchor[selectedHandle] + 1/30;
        const range = getPrecisionRange(precisionAnchor);

        if (selectedHandle === 'start') {
          const constrainedTime = Math.max(range.start, Math.min(precisionAnchor.end - 1, newTime));
          setPrecisionAnchor(prev => ({ ...prev, start: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        } else {
          const constrainedTime = Math.max(precisionAnchor.start + 1, Math.min(range.end, newTime));
          setPrecisionAnchor(prev => ({ ...prev, end: constrainedTime }));
          setPrecisionTime(constrainedTime);
          precisionVideoRef.current.currentTime = constrainedTime;
        }
      };

      step();
      const interval = setInterval(step, 100);

      const cleanup = () => clearInterval(interval);
      document.addEventListener('mouseup', cleanup, { once: true });
      document.addEventListener('touchend', cleanup, { once: true });
    }}
    className="px-4 py-3 btn-secondary rounded-lg font-semibold shadow-md"
  >
    Frame →
  </button>
</div>

{/* START/END Buttons with Current Time Display */}
<div className="flex items-center justify-center gap-3 mb-3">
  <button
    onClick={() => {
      setSelectedHandle('start');
      setPrecisionTime(precisionAnchor.start);
      if (precisionVideoRef.current) {
        precisionVideoRef.current.currentTime = precisionAnchor.start;
      }
    }}
    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
      selectedHandle === 'start'
        ? 'bg-green-500 text-white shadow-lg shadow-green-500/50'
        : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
    }`}
  >
    START {formatTime(precisionAnchor.start)}
  </button>

  <div className="text-base font-mono bg-slate-900 rounded-lg px-3 py-2">
    {formatTime(precisionTime)}
  </div>

  <button
    onClick={() => {
      setSelectedHandle('end');
      setPrecisionTime(precisionAnchor.end);
      if (precisionVideoRef.current) {
        precisionVideoRef.current.currentTime = precisionAnchor.end;
      }
    }}
    className={`px-4 py-2 rounded-lg font-semibold transition-all ${
      selectedHandle === 'end'
        ? 'bg-red-500 text-white shadow-lg shadow-red-500/50'
        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
    }`}
  >
    END {formatTime(precisionAnchor.end)}
  </button>
</div>

{/* Precision Timeline */}
<div className="relative mb-3 flex-shrink-0">
  <div
    ref={precisionTimelineRef}
    onMouseDown={handlePrecisionTimelineMouseDown}
    onTouchStart={(e) => {
      const touch = e.touches?.[0];
      if (touch) {
        handlePrecisionTimelineMouseDown({ ...e, clientX: touch.clientX });
      }
    }}
    className="relative h-24 bg-slate-900 rounded-lg cursor-pointer border-2 border-slate-600"
  >
                  {/* Current time indicator - Thin white line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/80 cursor-ew-resize z-20 pointer-events-none"
                    style={{
                      left: `${((precisionTime - getPrecisionRange(precisionAnchor).start) / (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start)) * 100}%`
                    }}
                  />

                  {/* Anchor visualization */}
                  <div
                    className="absolute top-0 bottom-0 bg-cyan-500/20 border-2 border-cyan-500/50 rounded z-10"
                    style={{
                      left: `${((precisionAnchor.start - getPrecisionRange(precisionAnchor).start) / (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start)) * 100}%`,
                      width: `${((precisionAnchor.end - precisionAnchor.start) / (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start)) * 100}%`
                    }}
                  >
                    {/* Start handle - Green */}
                    <div
                      onMouseDown={(e) => handlePrecisionHandleMouseDown(e, 'start')}
                      onTouchStart={(e) => handlePrecisionHandleTouchStart(e, 'start')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHandle('start');
                        setPrecisionTime(precisionAnchor.start);
                        if (precisionVideoRef.current) {
                          precisionVideoRef.current.currentTime = precisionAnchor.start;
                        }
                      }}
                      className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize transition touch-none rounded-full ${
                        selectedHandle === 'start'
                          ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)]'
                          : 'bg-green-500/80 hover:bg-green-400 hover:shadow-[0_0_8px_rgba(34,197,94,0.6)]'
                      }`}
                      style={{ zIndex: 100 }}
                    >
                      {/* Pill-shaped grab handle */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-green-400 rounded-full shadow-lg border-2 border-white/30" />
                    </div>

                    {/* End handle - Red */}
                    <div
                      onMouseDown={(e) => handlePrecisionHandleMouseDown(e, 'end')}
                      onTouchStart={(e) => handlePrecisionHandleTouchStart(e, 'end')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHandle('end');
                        setPrecisionTime(precisionAnchor.end);
                        if (precisionVideoRef.current) {
                          precisionVideoRef.current.currentTime = precisionAnchor.end;
                        }
                      }}
                      className={`absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize transition touch-none rounded-full ${
                        selectedHandle === 'end'
                          ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]'
                          : 'bg-red-500/80 hover:bg-red-400 hover:shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                      }`}
                      style={{ zIndex: 100 }}
                    >
                      {/* Pill-shaped grab handle */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-6 bg-red-400 rounded-full shadow-lg border-2 border-white/30" />
                    </div>

                    {/* Duration label */}
                    <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white pointer-events-none">
                      {formatTime(precisionAnchor.end - precisionAnchor.start)}
                    </div>
                  </div>
                </div>

                {/* Time markers */}
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatTime(getPrecisionRange(precisionAnchor).start)}</span>
                  <span>{formatTime((getPrecisionRange(precisionAnchor).start + getPrecisionRange(precisionAnchor).end) / 2)}</span>
                  <span>{formatTime(getPrecisionRange(precisionAnchor).end)}</span>
                </div>
              </div>

{/* Action Buttons */}
<div className="flex gap-3 justify-end mt-auto pt-4 flex-shrink-0" style={{ borderTop: '2px solid var(--border)' }}>
  <button
    onClick={() => setShowPrecisionModal(false)}
    className="px-4 sm:px-6 py-2 sm:py-3 btn-secondary rounded-lg font-semibold text-sm sm:text-base"
  >
    Cancel
  </button>
  <button
    onClick={applyPrecisionChanges}
    className="px-4 sm:px-6 py-2 sm:py-3 btn-accent hover:scale-105 rounded-lg font-semibold text-sm sm:text-base transition"
  >
    Apply Changes
  </button>
</div>
            </div>
          </div>
        )}

        {/* Music Precision Modal */}
        {/* EXPORT SECTION */}
        {currentSection === 'export' && video && (
          <div className="panel rounded-2xl p-2 sm:p-8">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--accent-primary)', textShadow: '0 0 10px rgba(59,130,246,0.4)' }}>⚡ Export Your Video</h2>
              {anchors.length > 0 && (
                <p style={{ color: 'var(--text-tertiary)' }}>
                  {anchors.length} clip{anchors.length !== 1 ? 's' : ''} &bull; {formatTime(anchors.reduce((s, a) => s + (a.end - a.start), 0))} total — ready to forge
                </p>
              )}
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Choose export speed:</h3>
                <p className="mt-1 text-sm text-slate-400">Fast Original downloads quickest. Social formats render resized video for posting.</p>
              </div>
              {Object.entries(platforms).map(([key, platform]) => (
                <label
                  key={key}
                  className="flex items-center gap-4 p-4 btn-secondary rounded-lg cursor-pointer transition hover:border-cyan-400/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPlatforms([...selectedPlatforms, key]);
                      } else {
                        setSelectedPlatforms(selectedPlatforms.filter(p => p !== key));
                      }
                    }}
                    className="w-5 h-5 rounded border-2 border-cyan-500/40"
                  />
                  <div className={`min-w-28 px-3 py-2 bg-gradient-to-r ${platform.color} rounded-lg font-semibold text-center`}>
                    <div>{platform.name}</div>
                    {platform.subtitle && <div className="text-xs opacity-80">{platform.subtitle}</div>}
                  </div>
                  <div className="flex-1 text-sm text-slate-300">
                    {platform.note}
                    {platform.aspect !== 'original' && platform.width && (
                      <span className="ml-2 font-mono text-xs text-slate-500">{platform.width}x{platform.height}</span>
                    )}
                  </div>
                </label>
              ))}
            </div>

            <div className="text-center">
              <button
                onClick={exportVideo}
                disabled={!ffmpegLoaded || isProcessing || selectedPlatforms.length === 0}
                className="px-8 py-4 btn-accent rounded-xl font-bold text-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <span>Processing...</span>
                    <span className="text-sm">{progress}%</span>
                  </div>
                ) : (
                  <span className="flex items-center gap-2">
                    <Download size={20} />
                    FORGE REEL {selectedPlatforms.length > 1 ? `(${selectedPlatforms.length} platforms)` : ''}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Export Platform Modal */}
{/* Export Platform Modal */}
{showExportModal && (
  <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50">
    <div className="glass-panel p-8 rounded-2xl max-w-lg w-full mx-4">
              <h3 className="text-xl font-semibold mb-2 text-center">Choose Export Speed</h3>
              <p className="mb-6 text-center text-sm text-slate-400">Fast Original is quickest. Social formats render resized video.</p>

      <div className="space-y-3 mb-6">
        {Object.entries(platforms).map(([key, platform]) => (
          <label
            key={key}
            className="flex items-center gap-4 p-4 bg-slate-700/50 hover:bg-slate-700 rounded-lg cursor-pointer transition group"
          >
            <input
              type="checkbox"
              checked={selectedPlatforms.includes(key)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedPlatforms([...selectedPlatforms, key]);
                } else {
                  setSelectedPlatforms(selectedPlatforms.filter(p => p !== key));
                }
              }}
            className="w-5 h-5 rounded border-2 border-cyan-500/40 bg-slate-800 checked:bg-white checked:border-amber-600 focus:ring-2 focus:ring-amber-500 cursor-pointer"/>
            <div className={`min-w-32 px-4 py-3 bg-gradient-to-r ${platform.color} rounded-lg font-semibold text-center`}>
              <div className="text-base">{platform.name}</div>
              {platform.subtitle && <div className="text-xs opacity-90 mt-1">{platform.subtitle}</div>}
            </div>
            <div className="flex-1 text-sm text-slate-300">
              {platform.note}
              {platform.aspect !== 'original' && platform.width && (
                <span className="ml-2 font-mono text-xs text-slate-500">{platform.width}x{platform.height}</span>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setShowExportModal(false)}
          className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition"
        >
          Cancel
        </button>
        <button
          onClick={exportVideo}
          disabled={selectedPlatforms.length === 0}
          className="flex-1 px-6 py-3 bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 border-2 border-cyan-500/30 hover:border-cyan-500/40 hover:scale-105 hover:shadow-[0_0_16px_rgba(0,212,255,0.5)] rounded-lg font-semibold transition disabled:opacity-50 disabled:hover:scale-100"
        >
          Export {selectedPlatforms.length > 1 ? `(${selectedPlatforms.length})` : ''}
        </button>
      </div>
    </div>
  </div>
)}
      </div>
    </div>

      {/* ── Toast Notifications ────────────────────────────────────────────────── */}
  <div
    className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none"
    style={{ maxWidth: '360px' }}
    aria-live="polite"
    aria-atomic="false"
  >
    {toasts.map(toast => (
      <div
        key={toast.id}
        role="alert"
        className={`toast-enter pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm ${
          toast.type === 'error'   ? 'bg-red-950/95 border-red-500/60 text-red-100' :
          toast.type === 'warning' ? 'bg-amber-950/95 border-amber-500/60 text-amber-100' :
          toast.type === 'success' ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-100' :
                                     'bg-slate-900/95 border-cyan-500/60 text-slate-100'
        }`}
      >
        <span className="text-sm leading-none mt-0.5 flex-shrink-0" aria-hidden="true">
          {toast.type === 'error' ? '✕' : toast.type === 'warning' ? '⚠' : toast.type === 'success' ? '✓' : 'ℹ'}
        </span>
        <span className="flex-1 text-sm leading-snug">{toast.message}</span>
        {toast.action && (
          <button
            className="text-xs font-bold underline opacity-80 hover:opacity-100 whitespace-nowrap flex-shrink-0 transition-opacity"
            onClick={() => { toast.action.onClick(); dismissToast(toast.id); }}
          >
            {toast.action.label}
          </button>
        )}
        <button
          className="opacity-40 hover:opacity-100 text-sm flex-shrink-0 transition-opacity ml-1"
          onClick={() => dismissToast(toast.id)}
          aria-label="Dismiss"
        >✕</button>
      </div>
    ))}
  </div>

  </div>
</>
  );
};

export default ReelForge;
