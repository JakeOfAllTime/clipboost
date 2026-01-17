import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Upload, Play, Pause, Trash2, Sparkles, Music as MusicIcon, Download, Scissors, X, ZoomIn, ZoomOut, RotateCcw, RotateCw, Save, FolderOpen, Volume2, VolumeX, Maximize2, Minimize2, Edit, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ReelForge = () => {
  // Core video state
  const [video, setVideo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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
  const [selectedPlatforms, setSelectedPlatforms] = useState(['vertical']);
  const [videoAnalysis, setVideoAnalysis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisPhase, setAnalysisPhase] = useState('');
  const [targetDuration, setTargetDuration] = useState(60);
  const [musicAnalysis, setMusicAnalysis] = useState(null);
  const [motionSensitivity, setMotionSensitivity] = useState(0.5); // 0-1 range
  // Auto-save state
  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const [restoredAnchorCount, setRestoredAnchorCount] = useState(0);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);
  const [hoveredAnchor, setHoveredAnchor] = useState(null);

  // UX Enhancement: Visual bridges & progressive disclosure
  const [hoverTime, setHoverTime] = useState(null); // Hover position on clips timeline
  const [hasSeenPrecisionHint, setHasSeenPrecisionHint] = useState(false);
  const [hasCreatedFirstClip, setHasCreatedFirstClip] = useState(false);
  const [hasSeenDeleteHint, setHasSeenDeleteHint] = useState(false); // Hint for delete functionality

  // Double-tap tracking for anchor deletion on mobile
  const anchorTapRef = useRef({ anchorId: null, time: 0, hasMoved: false });

  // Throttle video seeking during drag for smoother performance
  const lastSeekTimeRef = useRef(0);
  const SEEK_THROTTLE_MS = 100; // Only seek every 100ms max

  // Mobile edit mode state
  const [previewMuted, setPreviewMuted] = useState(false);

  // Tab navigation state
  const [currentTab, setCurrentTab] = useState('materials');
  // Possible values: 'materials', 'forge', 'ship'

  // Timeline zoom state
  const [timelineZoom, setTimelineZoom] = useState(1);

  // Auto-generate V3 state
  const [autoGenMode, setAutoGenMode] = useState('smart'); // 'quick' | 'smart' | 'pro'
  const [enableBeatSync, setEnableBeatSync] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');

  // Sidebar navigation state (load from localStorage)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('clipboost-sidebar-collapsed');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const [currentSection, setCurrentSection] = useState('edit'); // 'edit' | 'export'

  // Playback mode state
  const [playbackMode, setPlaybackMode] = useState('full'); // 'full' | 'clips'

  // Media Center collapse state
  const [mediaCenterCollapsed, setMediaCenterCollapsed] = useState(false);

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
  const precisionTimelineRef = useRef(null);
  const loadConfigInputRef = useRef(null);

  // Web Audio API refs for mixing
  const audioContextRef = useRef(null);
  const videoSourceRef = useRef(null);
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
  vertical: {
    name: '9:16 Vertical',
    subtitle: 'TikTok • Reels • Shorts',
    aspect: '9:16',
    color: 'from-cyan-500 to-blue-500',  // Matches accent-cyan/accent-blue
    width: 1080,
    height: 1920
  },
  instagram: {
    name: '4:5 Instagram Feed',
    aspect: '4:5',
    color: 'from-pink-500 to-purple-600',  // Matches accent-pink/accent-purple
    width: 1080,
    height: 1350
  },
  horizontal: {
    name: '16:9 Horizontal',
    subtitle: 'Twitter/X',
    aspect: '16:9',
    color: 'from-blue-500 to-cyan-400',  // Matches accent-blue/accent-cyan
    width: 1920,
    height: 1080
  },
  original: {
    name: 'Original',
    subtitle: 'No crop',
    aspect: 'original',
    color: 'from-purple-500 to-purple-700'  // Matches accent-purple
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
            timestamp: Date.now()
          };
          localStorage.setItem('clipboost-autosave', JSON.stringify(saveData));

          // Show indicator briefly
          setShowAutoSaveIndicator(true);
          const indicatorTimeout = setTimeout(() => setShowAutoSaveIndicator(false), 2000);

          // Store timeout ID for cleanup
          return () => clearTimeout(indicatorTimeout);
        } catch (error) {
          console.error('Error auto-saving:', error);
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

      if (!musicSourceRef.current && musicElement.src) {
        musicSourceRef.current = ctx.createMediaElementSource(musicElement);
        musicGainRef.current = ctx.createGain();
        musicSourceRef.current.connect(musicGainRef.current);
        musicGainRef.current.connect(ctx.destination);
      }

      // Set initial volumes based on audioBalance
      updateAudioMixerVolumes();

    } catch (error) {
      console.error('Error setting up audio mixer:', error);
    }
  }, [audioBalance]);

  const updateAudioMixerVolumes = useCallback(() => {
    if (videoGainRef.current && musicGainRef.current) {
      // audioBalance: 0 = all video, 50 = balanced, 100 = all music
      const musicVolume = audioBalance / 100;
      const videoVolume = 1 - (audioBalance / 100);

      videoGainRef.current.gain.value = videoVolume;
      musicGainRef.current.gain.value = musicVolume;
    }
  }, [audioBalance]);

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

    } catch (error) {
      console.error('Error setting up precision audio mixer:', error);
    }
  }, [audioBalance]);

  const updatePrecisionAudioMixerVolumes = useCallback(() => {
    if (precisionVideoGainRef.current && precisionMusicGainRef.current) {
      // audioBalance: 0 = all video, 50 = balanced, 100 = all music
      const musicVolume = audioBalance / 100;
      const videoVolume = 1 - (audioBalance / 100);

      precisionVideoGainRef.current.gain.value = videoVolume;
      precisionMusicGainRef.current.gain.value = musicVolume;
    }
  }, [audioBalance]);

  // Update volumes when audioBalance changes
  useEffect(() => {
    updateAudioMixerVolumes();
    updatePrecisionAudioMixerVolumes();
  }, [audioBalance, updateAudioMixerVolumes, updatePrecisionAudioMixerVolumes]);

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
        alert('Error loading configuration file');
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
const extractFramesFromRange = async (videoFile, startTime, endTime, frameCount = 6) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    video.src = URL.createObjectURL(videoFile);
    video.muted = true;

    video.onloadedmetadata = async () => {
      canvas.width = 320;  // Smaller size for additional frames
      canvas.height = 180;

      const duration = endTime - startTime;
      const interval = duration / (frameCount - 1);
      const frames = [];

      for (let i = 0; i < frameCount; i++) {
        const timestamp = startTime + (i * interval);

        await new Promise((seekResolve) => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const base64Data = dataUrl.split(',')[1];

            frames.push({
              timestamp: timestamp,
              base64: base64Data,
              reason: 'requested_by_claude'
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

// PHASE 1: Gather comprehensive frames from strategic zones
const gatherComprehensiveFrames = async (videoFile, videoDuration) => {
  console.log('📊 PHASE 1: Gathering comprehensive video coverage...');

  // Adaptive zone sizing based on video length - NO GAPS for comprehensive coverage
  const getZones = (duration) => {
    if (duration < 300) {
      // Short video (< 5 min): Dense sampling, ~60 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.20, frames: 14 },
        { name: 'early', start: duration * 0.20, end: duration * 0.40, frames: 12 },
        { name: 'middle', start: duration * 0.40, end: duration * 0.65, frames: 14 },
        { name: 'late', start: duration * 0.65, end: duration * 0.85, frames: 12 },
        { name: 'finale', start: duration * 0.85, end: duration * 0.995, frames: 18 }
      ];
    } else if (duration < 1200) {
      // Medium video (5-20 min): Balanced coverage, ~80 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.15, frames: 12 },
        { name: 'early', start: duration * 0.15, end: duration * 0.30, frames: 12 },
        { name: 'early_middle', start: duration * 0.30, end: duration * 0.45, frames: 12 },
        { name: 'middle', start: duration * 0.45, end: duration * 0.60, frames: 12 },
        { name: 'late_middle', start: duration * 0.60, end: duration * 0.75, frames: 12 },
        { name: 'late', start: duration * 0.75, end: duration * 0.88, frames: 10 },
        { name: 'finale', start: duration * 0.88, end: duration * 0.995, frames: 14 }
      ];
    } else {
      // Long video (20+ min): Continuous coverage, ~100 frames
      return [
        { name: 'opening', start: 0, end: duration * 0.10, frames: 12 },
        { name: 'early', start: duration * 0.10, end: duration * 0.22, frames: 12 },
        { name: 'early_middle', start: duration * 0.22, end: duration * 0.35, frames: 12 },
        { name: 'middle', start: duration * 0.35, end: duration * 0.50, frames: 14 },
        { name: 'middle_late', start: duration * 0.50, end: duration * 0.65, frames: 14 },
        { name: 'late_middle', start: duration * 0.65, end: duration * 0.78, frames: 12 },
        { name: 'late', start: duration * 0.78, end: duration * 0.88, frames: 10 },
        { name: 'finale', start: duration * 0.88, end: duration * 0.995, frames: 14 }
      ];
    }
  };

  const zones = getZones(videoDuration);
  const allFrames = [];

  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i];
    console.log(`📸 Zone ${i + 1}/${zones.length}: ${zone.name} (${formatTime(zone.start)}-${formatTime(zone.end)}) - extracting ${zone.frames} frames`);

    try {
      const zoneFrames = await extractFramesFromRange(
        videoFile,
        zone.start,
        zone.end,
        zone.frames
      );

      allFrames.push(...zoneFrames.map(f => ({
        ...f,
        zone: zone.name,
        zoneIndex: i
      })));

      console.log(`  ✅ Extracted ${zoneFrames.length} frames from ${zone.name}`);
    } catch (error) {
      console.error(`  ❌ Failed to extract frames from ${zone.name}:`, error);
      // Continue with other zones even if one fails
    }
  }

  console.log(`✅ Phase 1 complete: ${allFrames.length} total frames gathered`);
  return { frames: allFrames, zones };
};

// PHASE 2: Single comprehensive analysis with all frames
const analyzeNarrativeComprehensive = async (allFrames, targetDuration, zones) => {
  console.log(`🧠 PHASE 2: Analyzing ${allFrames.length} frames with complete context...`);

  try {
    // Build frame manifest with exact timestamps
    const frameManifest = allFrames.map((frame, idx) =>
      `Frame ${idx + 1}: ${formatTime(frame.timestamp)} (${frame.zone} zone)`
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

    const response = await fetch('/api/analyze-narrative', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: "user",
          content: [
            { type: "text", text: promptText },
            ...allFrames.map(f => ({
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: f.base64 }
            }))
          ]
        }],
        videoType: 'visual-only'
      })
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
    throw error;
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

  // Video handlers
  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const maxSize = 500 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File too large! Maximum size is 500 MB.`);
      return;
    }

    const url = URL.createObjectURL(file);
    setVideo(file);
    setVideoUrl(url);
    setAnchors([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedAnchor(null);
    setPreviewAnchor(null);
    setCurrentTime(0);
    setMusic(null);
    setMusicUrl(null);
 try {
    const saved = localStorage.getItem('clipboost-autosave');
    if (saved) {
      const data = JSON.parse(saved);
      const daysSince = (Date.now() - data.timestamp) / (1000 * 60 * 60 * 24);
      if (daysSince < 7 && data.anchors && data.anchors.length > 0) {
        setRestoredAnchorCount(data.anchors.length);
        setShowRestoreToast(true);
        setTimeout(() => setShowRestoreToast(false), 10000);
      } else {
        localStorage.removeItem('clipboost-autosave');
      }
    }
  } catch (error) {
    console.error('Error checking autosave:', error);
  }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setTrimStart(0);
      setTrimEnd(dur);
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

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Preview mode functions
  const startPreviewMode = () => {
    if (anchors.length === 0) {
      alert('Add anchors first to preview');
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
    if (!segment || !videoRef.current) return;

    const offset = previewTime - segment.previewStart;
    const sourceTime = segment.sourceStart + offset;

    videoRef.current.currentTime = sourceTime;
    setPreviewCurrentTime(previewTime);
    setPreviewAnchorIndex(segment.index);

    // Sync music if available
    if (music && musicRef.current) {
      const musicTime = segment.musicTime + offset;
      musicRef.current.currentTime = musicTime;
    }
  }, [findSegmentAtTime, music]);

  // Start enhanced preview mode
  const startEnhancedPreview = useCallback(() => {
    if (anchors.length === 0) {
      alert('Add anchors first to preview');
      return;
    }

    buildPreviewTimeline();
    setIsPreviewMode(true);
    setPreviewCurrentTime(0);
    setIsPreviewPlaying(true);

    // Seek to start
    seekPreviewTime(0);

    // Set up Web Audio API mixer
    if (videoRef.current && musicRef.current) {
      setupAudioMixer(videoRef.current, musicRef.current);

      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
    }

    // Start music
    if (music && musicRef.current) {
      musicRef.current.play();
    }

    // Start video (handle autoplay restrictions)
    if (videoRef.current) {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.warn('Autoplay blocked, user interaction required:', err);
        });
      }
    }
  }, [anchors, buildPreviewTimeline, seekPreviewTime, music, audioBalance]);

  // Stop enhanced preview
  const stopEnhancedPreview = useCallback(() => {
    setIsPreviewMode(false);
    setIsPreviewPlaying(false);
    setPreviewCurrentTime(0);
    setPreviewAnchorIndex(0);

    if (previewAnimationRef.current) {
      cancelAnimationFrame(previewAnimationRef.current);
      previewAnimationRef.current = null;
    }

    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = musicStartTime;
    }

    if (videoRef.current) {
      videoRef.current.pause();
    }
  }, [musicStartTime]);

  // Toggle preview playback
  const togglePreviewPlayback = useCallback(() => {
    // If not in preview mode, start it
    if (!isPreviewMode) {
      startEnhancedPreview();
      return;
    }

    // Toggle play/pause
    if (isPreviewPlaying) {
      setIsPreviewPlaying(false);
      if (videoRef.current) videoRef.current.pause();
      if (musicRef.current) musicRef.current.pause();
    } else {
      setIsPreviewPlaying(true);
      if (videoRef.current) videoRef.current.play();
      if (musicRef.current) musicRef.current.play();
    }
  }, [isPreviewMode, isPreviewPlaying, startEnhancedPreview]);

  // Rebuild timeline when anchors change
  useEffect(() => {
    // Always build preview timeline when anchors change (for clips timeline display)
    buildPreviewTimeline();
  }, [anchors, buildPreviewTimeline]);

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

  useEffect(() => {
    if (!isPreviewMode || anchors.length === 0) return;

    const checkAndJump = () => {
      if (!videoRef.current) return;
      
      const currentAnchor = anchors[previewAnchorIndex];
      if (!currentAnchor) return;

      const currentTime = videoRef.current.currentTime;

      if (currentTime >= currentAnchor.end) {
        const nextIndex = previewAnchorIndex + 1;
        
        if (nextIndex < anchors.length) {
          setPreviewAnchorIndex(nextIndex);
          videoRef.current.currentTime = anchors[nextIndex].start;
        } else {
          stopPreviewMode();
        }
      }
    };

    previewIntervalRef.current = setInterval(checkAndJump, 100);

    return () => {
      if (previewIntervalRef.current) {
        clearInterval(previewIntervalRef.current);
      }
    };
  }, [isPreviewMode, previewAnchorIndex, anchors]);

  // Enhanced preview playback monitoring with RAF
  useEffect(() => {
    if (!isPreviewMode || !isPreviewPlaying || previewTimeline.length === 0) {
      if (previewAnimationRef.current) {
        cancelAnimationFrame(previewAnimationRef.current);
        previewAnimationRef.current = null;
      }
      return;
    }

    let isTransitioning = false;

    const updatePreviewTime = () => {
      if (!videoRef.current || isTransitioning) {
        previewAnimationRef.current = requestAnimationFrame(updatePreviewTime);
        return;
      }

      const currentSegment = previewTimeline[previewAnchorIndex];
      if (!currentSegment) return;

      const sourceTime = videoRef.current.currentTime;
      const offset = sourceTime - currentSegment.sourceStart;
      const newPreviewTime = currentSegment.previewStart + offset;

      setPreviewCurrentTime(newPreviewTime);

      // Check if we've reached the end of current segment
      if (sourceTime >= currentSegment.sourceEnd - 0.05) { // 50ms tolerance for tighter transitions
        const nextIndex = previewAnchorIndex + 1;

        if (nextIndex < previewTimeline.length) {
          // Jump to next segment
          isTransitioning = true;
          const nextSegment = previewTimeline[nextIndex];

          // Seek to next segment and ensure playback continues
          videoRef.current.currentTime = nextSegment.sourceStart;
          setPreviewAnchorIndex(nextIndex);
          setPreviewCurrentTime(nextSegment.previewStart);

          // Ensure video continues playing after seek
          if (videoRef.current.paused) {
            videoRef.current.play().catch(err => console.error('Play failed:', err));
          }

          // Minimal delay to let seek settle (reduced from 50ms to 30ms)
          setTimeout(() => {
            isTransitioning = false;
          }, 30);

        } else {
          // End of preview - loop or stop
          setIsPreviewPlaying(false);
          videoRef.current.pause();
          if (musicRef.current) musicRef.current.pause();
          // Reset to beginning
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
  }, [isPreviewMode, isPreviewPlaying, previewTimeline, previewAnchorIndex, seekPreviewTime]);

  // Music handlers
  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMusic(file);
      const url = URL.createObjectURL(file);
      setMusicUrl(url);
      setMusicStartTime(0);
    }
  };

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
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * duration;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, [duration]);

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
    const x = touch.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * duration;

    const newAnchor = {
      id: Date.now(),
      start: time,
      end: Math.min(time + 2, duration)
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

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }
  }, [duration, anchors, saveToHistory]);

  // Anchor management (memoized)
  const addAnchor = useCallback(() => {
    if (!duration) return;

    const newAnchor = {
      id: Date.now(),
      start: currentTime,
      end: Math.min(currentTime + 2, duration)
    };

    const hasOverlap = anchors.some(a =>
      (newAnchor.start >= a.start && newAnchor.start < a.end) ||
      (newAnchor.end > a.start && newAnchor.end <= a.end) ||
      (newAnchor.start <= a.start && newAnchor.end >= a.end)
    );

    if (hasOverlap) {
      alert('Anchor overlaps with existing anchor');
      return;
    }

    const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
    setAnchors(updated);
    saveToHistory(updated);
    setSelectedAnchor(newAnchor.id);
  }, [duration, currentTime, anchors, saveToHistory]);

  const deleteAnchor = useCallback((anchorId) => {
    const updated = anchors.filter(a => a.id !== anchorId);
    setAnchors(updated);
    saveToHistory(updated);
    if (selectedAnchor === anchorId) {
      setSelectedAnchor(null);
    }
    if (previewAnchor?.id === anchorId) {
      setPreviewAnchor(null);
    }
    // Mark delete hint as seen
    setHasSeenDeleteHint(true);
  }, [anchors, saveToHistory, selectedAnchor, previewAnchor]);

  const handleAnchorClick = useCallback((e, anchor) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent mobile tap delay

    // Batch state updates to reduce re-renders
    setSelectedAnchor(anchor.id);
    setHoveredAnchor(null);
    setPreviewAnchor(anchor);
    setPreviewHandle('start'); // Default to showing start frame

    // Set video to start frame when clicking
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = anchor.start;
    }
  }, []);

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
    setDragState({
      active: true,
      type: dragType,
      startX: e.clientX || e.touches?.[0]?.clientX || 0,
      anchorSnapshot: { ...anchor }
    });
  }, []);

  const handleAnchorTouchStart = useCallback((e, anchor, dragType) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent click interference and scrolling

    // Haptic feedback if supported
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    setSelectedAnchor(anchor.id);
    setDragState({
      active: true,
      type: dragType,
      startX: e.touches?.[0]?.clientX || 0,
      anchorSnapshot: { ...anchor }
    });
  }, []);

  // Persistent drag handlers with 60fps throttling (optimized)
  const rafIdRef = useRef(null);
  const dragDataRef = useRef({ anchors, duration, selectedAnchor, dragState, previewAnchor, saveToHistory });

  // Keep refs in sync without recreating handlers
  useEffect(() => {
    dragDataRef.current = { anchors, duration, selectedAnchor, dragState, previewAnchor, saveToHistory };
  }, [anchors, duration, selectedAnchor, dragState, previewAnchor, saveToHistory]);

  const processMouseMove = useCallback((clientX) => {
    const { dragState, anchors, duration, selectedAnchor, previewAnchor } = dragDataRef.current;

    if (dragState.type === 'timeline') {
      if (timelineRef.current && videoRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const time = percent * duration;
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }
    } else if (dragState.type.startsWith('anchor-')) {
      const snapshot = dragState.anchorSnapshot;
      if (!snapshot) return;

      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect) return;

      const deltaX = clientX - dragState.startX;
      const deltaTime = (deltaX / rect.width) * duration;

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

    const { dragState, anchors, saveToHistory } = dragDataRef.current;

    if (dragState.type?.startsWith('anchor-')) {
      saveToHistory(anchors);
    }
    setDragState({ active: false, type: null, startX: 0, anchorSnapshot: null });
  }, []);

  const handleTouchMove = useCallback((e) => {
    e.preventDefault();
    handleMouseMove(e);
  }, [handleMouseMove]);

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

const goToPreviousAnchor = () => {
  if (!precisionAnchor || precisionAnchor._index <= 0) return;
  const prevIndex = precisionAnchor._index - 1;
  const prevAnchor = anchors[prevIndex];

  // Recalculate timeline offset for previous anchor
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
  if (!precisionAnchor || precisionAnchor._index >= anchors.length - 1) return;
  const nextIndex = precisionAnchor._index + 1;
  const nextAnchor = anchors[nextIndex];

  // Recalculate timeline offset for next anchor
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
      alert('Error trimming video');
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
    await ffmpeg.writeFile('input.mp4', await fetchFile(video));

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

      const videoVolume = (100 - audioBalance) / 100;
      const musicVolume = audioBalance / 100;

      // Trim music with stream copy
      const musicDuration = (musicEndTime || musicDuration) - musicStartTime;

      await ffmpeg.exec([
        '-ss', musicStartTime.toFixed(3),
        '-t', musicDuration.toFixed(3),
        '-i', 'music.mp3',
        '-c:a', 'copy',
        'trimmed_music.mp3'
      ]);

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
    alert('Error exporting video');
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
        }
        return;
      }

      // Main timeline controls
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft' && videoRef.current) {
        e.preventDefault();
        videoRef.current.currentTime = Math.max(0, currentTime - 1);
      } else if (e.code === 'ArrowRight' && videoRef.current) {
        e.preventDefault();
        videoRef.current.currentTime = Math.min(duration, currentTime + 1);
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

  return (
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
          {currentSection === 'edit' ? 'EDIT VIDEO' : 'EXPORT VIDEO'}
        </h2>
        <p className="text-sm sm:text-base mt-2" style={{ color: 'var(--text-secondary)' }}>
          {currentSection === 'edit'
            ? 'Upload, trim, and add music to your video'
            : 'Choose platforms and export your final video'
          }
        </p>
      </div>
{/* Restore Toast Notification */}
        {showRestoreToast && (
          <div className="fixed top-4 right-4 bg-slate-800 border-2 border-cyan-500/40 rounded-lg shadow-2xl p-4 z-50 max-w-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold mb-1">Previous Work Found</div>
                <div className="text-sm text-gray-300 mb-3">
                  Found {restoredAnchorCount} anchor{restoredAnchorCount === 1 ? '' : 's'} from your last session
                </div>
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
              <div className="text-center">
                <Upload className="w-16 h-16 mx-auto mb-4" style={{ color: 'var(--accent-warm)' }} />
                <h2 className="text-2xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Upload Your Video</h2>
                <p className="mb-6" style={{ color: 'var(--text-dim)' }}>Maximum file size: 500 MB</p>
                <label className="inline-block px-8 py-4 btn-accent rounded-lg font-semibold cursor-pointer hover:scale-105 transition-transform">
                  Choose Video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* MEDIA CENTER - Collapsible */}
                <div className="panel rounded-none sm:rounded-xl mb-2 sm:mb-4 w-full border-0 sm:border">
                  <button
                    onClick={() => setMediaCenterCollapsed(!mediaCenterCollapsed)}
                    className="w-full flex items-center justify-between p-2 sm:p-4 hover:bg-slate-800/30 transition-colors rounded-t-xl"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                        🎬 Media Center
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
                          setMusic(null);
                          setMusicUrl(null);
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
                          <label className="block px-4 py-2 btn-secondary rounded-lg cursor-pointer text-center text-sm">
                            🎵 Add Music (Optional)
                            <input
                              type="file"
                              accept="audio/*"
                              onChange={handleMusicUpload}
                              className="hidden"
                            />
                          </label>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-300 truncate">🎵 {music.name}</span>
                              <button
                                onClick={() => {
                                  setMusic(null);
                                  setMusicUrl(null);
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
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-contain"
                      preload="auto"
                      playsInline
                      onTimeUpdate={handleTimeUpdate}
                      onLoadedMetadata={handleLoadedMetadata}
                      onEnded={() => setIsPlaying(false)}
                    />

                    {/* Play/Pause Overlay Button */}
                    <button
                      onClick={togglePlay}
                      className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                        isPlaying
                          ? 'bg-black/0 opacity-0 group-hover:opacity-100 group-hover:bg-black/20'
                          : 'bg-black/40 opacity-100'
                      }`}
                    >
                      <div className={`transition-all duration-300 ${
                        isPlaying
                          ? 'scale-75 opacity-60 group-hover:scale-100 group-hover:opacity-100'
                          : 'scale-100 opacity-100'
                      }`}>
                        {isPlaying ? (
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
                      💡 <strong>Get started:</strong> Double-tap the timeline below to mark moments you want to keep
                    </div>
                  )}
                  {anchors.length > 0 && anchors.length <= 3 && (!hasSeenDeleteHint || !hasSeenPrecisionHint) && (
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

                        {/* Precision Button - Updated icon and gradient */}
                        {selectedAnchor !== null && (
                          <button
                            onClick={() => {
                              const anchor = anchors.find(a => a.id === selectedAnchor);
                              if (anchor) {
                                const anchorIndex = anchors.findIndex(a => a.id === selectedAnchor);
                                const timelineOffset = anchors
                                  .slice(0, anchorIndex)
                                  .reduce((sum, a) => sum + (a.end - a.start), 0);

                                setPrecisionAnchor({ ...anchor, _index: anchorIndex, _timelineOffset: timelineOffset });
                                setPrecisionTime(anchor.end);
                                setSelectedHandle('end');
                                setShowPrecisionModal(true);
                                setHasSeenPrecisionHint(true); // Mark hint as seen
                              }
                            }}
                            className={`px-4 py-2 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 rounded-lg flex items-center gap-2 text-sm transition ${selectedAnchor && !hasSeenPrecisionHint ? 'precision-button-active' : ''}`}
                            title="Edit Current Anchor - Frame-perfect trimming"
                          >
                            <div className="relative">
                              <ZoomIn size={16} />
                              <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full" />
                            </div>
                            <span className="hidden sm:inline">Precision</span>
                          </button>
                        )}
                      </div>
                    ) : null}

                    {/* Clips Preview Bar - always visible */}
                    {anchors.length > 0 ? (
                      <div>
                        <div
                          className="relative h-20 bg-slate-800 rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-500/40 transition-all"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const percentage = clickX / rect.width;
                            const newTime = percentage * previewTotalDuration;
                            seekPreviewTime(newTime);
                            setPlaybackMode('clips');
                          }}
                        >
                          {/* Time Display - Top Left */}
                          {playbackMode === 'clips' && (
                            <div className="absolute top-1 left-2 text-xs font-semibold text-white bg-black/60 px-2 py-0.5 rounded z-20 pointer-events-none">
                              {formatTime(previewCurrentTime)} / {formatTime(previewTotalDuration)}
                            </div>
                          )}

                          {/* Clip Counter - Top Right */}
                          {playbackMode === 'clips' && (
                            <div className="absolute top-1 right-2 text-xs font-semibold text-white bg-black/60 px-2 py-0.5 rounded z-20 pointer-events-none">
                              Clip {previewAnchorIndex + 1} of {previewTimeline.length}
                            </div>
                          )}

                          {/* Render clip segments */}
                          {previewTimeline.map((segment, idx) => {
                            const segmentWidth = ((segment.duration / previewTotalDuration) * 100);
                            const segmentLeft = ((segment.previewStart / previewTotalDuration) * 100);
                            const isCurrentSegment = playbackMode === 'clips' && idx === previewAnchorIndex;
                            const colors = getAnchorColor(idx, isCurrentSegment);

                            return (
                              <div
                                key={idx}
                                className={`absolute top-0 bottom-0 transition-all rounded ${colors.bg} ${colors.border} border-2`}
                                style={{
                                  left: `${segmentLeft}%`,
                                  width: `${segmentWidth}%`
                                }}
                                title={`Clip ${idx + 1}: ${segment.duration.toFixed(1)}s`}
                              >
                                <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none">
                                  {idx + 1}
                                </div>
                              </div>
                            );
                          })}

                          {/* Playhead for clips timeline */}
                          {playbackMode === 'clips' && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
                              style={{
                                left: `${(previewCurrentTime / previewTotalDuration) * 100}%`
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

                  {/* Unified Layered Timeline - Option B */}
                  <div className="mb-1 sm:mb-4">
                    {/* Unified Timeline Container - Layered Design (Option B) */}
                    <div className="bg-slate-900/30 rounded-lg p-1 sm:p-3">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Timeline</h3>
                        <div className="text-xs text-gray-400">{formatTime(currentTime)} / {formatTime(duration)} • {anchors.length} clip{anchors.length === 1 ? '' : 's'} • {formatTime(anchorTime)}</div>
                      </div>

                      {/* Layered Timeline: Top = Playhead Track, Bottom = Clips Lane */}
                      <div className="relative bg-gradient-to-b from-slate-800/60 to-slate-900/80 rounded-lg border border-slate-700/50 overflow-hidden" style={{ height: '160px' }}>

                        {/* Top Layer: Playhead Track (30% height) - Click to seek */}
                        <div
                          ref={timelineRef}
                          onMouseDown={handleTimelineMouseDown}
                          onMouseMove={(e) => {
                            // Show hover preview tooltip
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const percent = Math.max(0, Math.min(1, x / rect.width));
                            const time = percent * duration;
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
                            <span>0:00</span>
                            <span>{formatTime(duration / 4)}</span>
                            <span>{formatTime(duration / 2)}</span>
                            <span>{formatTime(3 * duration / 4)}</span>
                            <span>{formatTime(duration)}</span>
                          </div>

                          {/* Playhead - spans full height of timeline */}
                          <div
                            className="absolute top-0 w-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(0,212,255,0.6)] pointer-events-none"
                            style={{ left: `${(currentTime / duration) * 100}%`, height: '160px', zIndex: 50 }}
                          >
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_8px_rgba(0,212,255,0.8)]" />
                          </div>

                          {/* Progress bar fill */}
                          <div
                            className="absolute bottom-0 left-0 h-1 bg-cyan-500/30 pointer-events-none"
                            style={{ width: `${(currentTime / duration) * 100}%` }}
                          />

                          {/* Hover preview tooltip */}
                          {hoverTime !== null && (
                            <div
                              className="absolute top-0 -translate-y-8 pointer-events-none z-30"
                              style={{ left: `${(hoverTime / duration) * 100}%`, transform: 'translateX(-50%) translateY(-100%)' }}
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
                            const x = e.clientX - rect.left;
                            const percent = Math.max(0, Math.min(1, x / rect.width));
                            const time = percent * duration;

                            const newAnchor = {
                              id: Date.now(),
                              start: time,
                              end: Math.min(time + 2, duration)
                            };

                            const hasOverlap = anchors.some(a =>
                              (newAnchor.start >= a.start && newAnchor.start < a.end) ||
                              (newAnchor.end > a.start && newAnchor.end <= a.end) ||
                              (newAnchor.start <= a.start && newAnchor.end >= a.end)
                            );

                            if (hasOverlap) {
                              alert('Clip overlaps with existing clip');
                              return;
                            }

                            const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
                            setAnchors(updated);
                            saveToHistory(updated);
                            setSelectedAnchor(newAnchor.id);
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
                              const x = tapPosition.x - rect.left;
                              const percent = Math.max(0, Math.min(1, x / rect.width));
                              const time = percent * duration;

                              const newAnchor = {
                                id: Date.now(),
                                start: time,
                                end: Math.min(time + 2, duration)
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
                                setHasCreatedFirstClip(true);
                              }

                              lastTapTimeRef.current = 0;
                            } else {
                              lastTapTimeRef.current = now;
                              lastTapPositionRef.current = tapPosition;
                            }
                          }}
                          className="absolute bottom-0 left-0 right-0 cursor-crosshair hover:bg-slate-800/20 transition-colors"
                          style={{ height: 'calc(160px - 48px)', top: '48px' }}
                          title="Double-click to create clip"
                        >
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
                                const width = ((anchor.end - anchor.start) / duration) * 100;

                                return (
                                  <div
                                    key={anchor.id}
                                    className="absolute top-0 bottom-0"
                                    style={{
                                      left: `${(anchor.start / duration) * 100}%`,
                                      width: `${width}%`,
                                      zIndex: isSelected ? 50 : 30
                                    }}
                                  >
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
                        </div>
                      </div>

                      {/* Helper text */}
                      <div className="text-xs text-gray-500 text-center mt-2">
                        {anchors.length > 0
                          ? 'Top: Click to seek • Bottom: Double-click to create • Drag clips to move • Drag handles to trim'
                          : 'Playhead above shows current position • Double-click below to create clips'}
                      </div>
                    </div>
                  </div>
                  {/* End Timeline Section */}

                  {/* Action Toolbar Section */}
                  <div className="bg-slate-900/30 rounded-lg p-2 sm:p-3">
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
                        onClick={() => setShowTrimModal(true)}
                        className="px-3 py-1.5 btn-secondary rounded-lg flex items-center gap-1 text-xs"
                      >
                        <Scissors size={14} />
                        <span>Trim</span>
                      </button>
                      <button
                        onClick={() => {
                          if (anchors.length > 0) {
                            if (confirm(`Remove all ${anchors.length} anchor${anchors.length === 1 ? '' : 's'}?`)) {
                              const emptyAnchors = [];
                              setAnchors(emptyAnchors);
                              saveToHistory(emptyAnchors);
                              setSelectedAnchor(null);
                              setPreviewAnchor(null);
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

                    {/* Auto-Generator Controls */}
                    <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
                      {/* Mode Selection + Beat-Sync */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="mode-quick"
                            name="autoGenMode"
                            value="quick"
                            checked={autoGenMode === 'quick'}
                            onChange={(e) => setAutoGenMode(e.target.value)}
                            className="w-3 h-3"
                          />
                          <label htmlFor="mode-quick" className="cursor-pointer text-gray-300">
                            Quick <span className="text-green-400">(FREE)</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="mode-smart"
                            name="autoGenMode"
                            value="smart"
                            checked={autoGenMode === 'smart'}
                            onChange={(e) => setAutoGenMode(e.target.value)}
                            className="w-3 h-3"
                          />
                          <label htmlFor="mode-smart" className="cursor-pointer text-gray-300">
                            Smart <span className="text-blue-400">($0.60)</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="mode-pro"
                            name="autoGenMode"
                            value="pro"
                            checked={autoGenMode === 'pro'}
                            onChange={(e) => setAutoGenMode(e.target.value)}
                            className="w-3 h-3"
                          />
                          <label htmlFor="mode-pro" className="cursor-pointer text-gray-300">
                            Pro <span className="text-purple-400">($1.20)</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-600">
                          <input
                            type="checkbox"
                            id="beat-sync-toggle"
                            checked={enableBeatSync}
                            onChange={(e) => setEnableBeatSync(e.target.checked)}
                            disabled={!music}
                            className="w-3 h-3 cursor-pointer"
                          />
                          <label htmlFor="beat-sync-toggle" className="cursor-pointer text-gray-300">
                            Beat-Sync
                          </label>
                        </div>
                      </div>

                      {/* Target Duration Slider */}
                      <div className="flex items-center gap-3 text-xs">
                        <label htmlFor="target-duration" className="text-gray-300 whitespace-nowrap">
                          Target: {targetDuration}s
                        </label>
                        <input
                          type="range"
                          id="target-duration"
                          min="15"
                          max="180"
                          step="1"
                          value={targetDuration}
                          onChange={(e) => setTargetDuration(parseInt(e.target.value))}
                          className="flex-1 h-1 rounded-lg appearance-none cursor-pointer bg-slate-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-amber-400 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
                        />
                        <span className="text-gray-500 text-xs">180s</span>
                      </div>

                      {/* Auto-Generate Button */}
                      <button
                        onClick={async () => {
                          if (!video || isAnalyzing) return;

                          try {
                            setIsAnalyzing(true);

                            console.log(`🎬 AUTO-GENERATE V3 STARTING - Mode: ${autoGenMode.toUpperCase()}`);

                            // === MODE 1: QUICK GEN (FREE - Motion Only) ===
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

                              // Step 2: Find high-motion moments
                              // Debug: log motion score distribution
                              if (videoAnalysisResult.length > 0) {
                                const scores = videoAnalysisResult.map(m => m.motionScore);
                                const maxScore = Math.max(...scores);
                                const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
                                const sceneChanges = videoAnalysisResult.filter(m => m.sceneChange).length;
                                console.log('📊 Motion analysis stats:', {
                                  totalFrames: videoAnalysisResult.length,
                                  maxScore: maxScore.toFixed(3),
                                  avgScore: avgScore.toFixed(3),
                                  sceneChanges
                                });
                              }

                              // Use adaptive threshold - take top moments by score rather than fixed threshold
                              const motionCuts = videoAnalysisResult
                                .filter(m => m.motionScore > 0.15 || m.sceneChange) // Lowered from 0.6 to 0.15
                                .sort((a, b) => b.motionScore - a.motionScore)
                                .slice(0, 12) // Get more candidates, then filter
                                .map((m, index) => ({
                                  start: Math.max(0, m.time - 1),
                                  end: Math.min(duration, m.time + 3),
                                  reason: m.sceneChange ? 'Scene change' : 'High motion',
                                  importance: m.motionScore
                                }));

                              // Step 3: Apply gentle beat-sync if enabled
                              let finalCuts = motionCuts;
                              if (enableBeatSync && musicAnalysis?.beatGrid && music) {
                                console.log('🎵 Applying gentle beat-sync...');
                                finalCuts = applyGentleBeatSync(motionCuts, musicAnalysis);
                              }

                              // Step 4: Create anchors
                              const newAnchors = finalCuts.map((cut, index) => ({
                                id: Date.now() + index,
                                start: Math.max(0, cut.start),
                                end: Math.min(duration, cut.end),
                                _narrativeReason: cut.reason,
                                _importance: cut.importance
                              }));

                              const finalAnchors = newAnchors.reduce((kept, anchor, index) => {
                                if (index === 0) {
                                  kept.push(anchor);
                                  return kept;
                                }
                                const lastKept = kept[kept.length - 1];
                                if (anchor.start >= lastKept.end) {
                                  kept.push(anchor);
                                }
                                return kept;
                              }, []);

                              console.log('✅ QUICK GEN COMPLETE:', {
                                anchorsCreated: finalAnchors.length,
                                totalDuration: finalAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1)
                              });

                              setAnchors(finalAnchors);
                              saveToHistory(finalAnchors);
                            }

                            // === MODE 2: SMART GEN (V5 - Five-Phase: Gather → Analyze → Seek → Supplement → Select) ===
                            else if (autoGenMode === 'smart') {
                              console.log('🧠 Smart Gen: Five-Phase Editorial Workflow (~$0.60-$1.50)');

                              // PHASE 1: Gather comprehensive frames
                              const { frames: allFrames, zones } = await gatherComprehensiveFrames(video, duration);

                              if (allFrames.length === 0) {
                                alert('Failed to extract any frames from video. Please try again.');
                                return;
                              }

                              // PHASE 2: Identify moments (no clip lengths yet)
                              const initialAnalysis = await analyzeNarrativeComprehensive(allFrames, targetDuration, zones);

                              if (!initialAnalysis) {
                                alert('Narrative analysis failed. Please try again.');
                                return;
                              }

                              // Build initial moment inventory with zone enrichment
                              const enrichMomentsWithZones = (moments, zones) => {
                                return moments.map(moment => {
                                  // Find which zone this timestamp falls into
                                  const zone = zones.find(z => moment.timestamp >= z.start && moment.timestamp <= z.end);
                                  return {
                                    ...moment,
                                    zone: zone?.name || 'unknown',
                                    zoneIndex: zones.indexOf(zone)
                                  };
                                });
                              };

                              let allMoments = enrichMomentsWithZones(initialAnalysis.keyMoments || [], zones);

                              // PHASE 3: Agentic seeking for missing moments
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
                              const finalSelection = await selectFinalClips(allMoments, targetDuration, zones);

                              if (!finalSelection || !finalSelection.selectedClips) {
                                alert('Final clip selection failed. Please try again.');
                                return;
                              }

                              // Apply beat-sync if enabled
                              let selectedClips = finalSelection.selectedClips;
                              if (enableBeatSync && musicAnalysis?.beatGrid && music) {
                                selectedClips = applyGentleBeatSync(selectedClips, musicAnalysis);
                              }

                              // Create anchors (Claude returns startTime/endTime, not start/end)
                              const newAnchors = selectedClips.map((clip, index) => ({
                                id: Date.now() + index,
                                start: Math.max(0, clip.startTime ?? clip.start ?? 0),
                                end: Math.min(duration, clip.endTime ?? clip.end ?? 0),
                                _narrativeReason: clip.description || clip.reason || 'Selected moment',
                                _importance: clip.importance || 0.5
                              }));

                              console.log('✅ SMART GEN COMPLETE:', {
                                anchorsCreated: newAnchors.length,
                                totalDuration: newAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1)
                              });

                              setAnchors(newAnchors);
                              saveToHistory(newAnchors);
                            }

                            // === MODE 3: PRO GEN (Full Narrative Analysis) ===
                            else if (autoGenMode === 'pro') {
                              console.log('💎 Pro Gen: Full Narrative Analysis (~$1.20-$2.00)');

                              // Similar to Smart Gen but with more comprehensive analysis
                              const { frames: allFrames, zones } = await gatherComprehensiveFrames(video, duration);

                              if (allFrames.length === 0) {
                                alert('Failed to extract any frames from video. Please try again.');
                                return;
                              }

                              // Run full narrative analysis with pro settings
                              const narrativeResult = await analyzeNarrativeComprehensive(allFrames, targetDuration, zones, { mode: 'pro' });

                              if (!narrativeResult) {
                                alert('Narrative analysis failed. Please try again.');
                                return;
                              }

                              const enrichMomentsWithZones = (moments, zones) => {
                                return moments.map(moment => {
                                  const zone = zones.find(z => moment.timestamp >= z.start && moment.timestamp <= z.end);
                                  return {
                                    ...moment,
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
                              const finalSelection = await selectFinalClips(allMoments, targetDuration, zones, { mode: 'pro' });

                              if (!finalSelection || !finalSelection.selectedClips) {
                                alert('Final clip selection failed. Please try again.');
                                return;
                              }

                              let selectedClips = finalSelection.selectedClips;
                              if (enableBeatSync && musicAnalysis?.beatGrid && music) {
                                selectedClips = applyGentleBeatSync(selectedClips, musicAnalysis);
                              }

                              const newAnchors = selectedClips.map((clip, index) => ({
                                id: Date.now() + index,
                                start: Math.max(0, clip.startTime ?? clip.start ?? 0),
                                end: Math.min(duration, clip.endTime ?? clip.end ?? 0),
                                _narrativeReason: clip.description || clip.reason || 'Selected moment',
                                _importance: clip.importance || 0.5
                              }));

                              console.log('✅ PRO GEN COMPLETE:', {
                                anchorsCreated: newAnchors.length,
                                totalDuration: newAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1)
                              });

                              setAnchors(newAnchors);
                              saveToHistory(newAnchors);
                            }

                          } catch (error) {
                            console.error('❌ Auto-generate error:', error);
                            alert(`Auto-generate failed: ${error.message}`);
                          } finally {
                            setIsAnalyzing(false);
                            setAnalysisProgress(0);
                            setAnalysisPhase('');
                          }
                        }}
                        disabled={!duration || isAnalyzing}
                        className="w-full px-4 py-2 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 hover:shadow-[0_0_25px_rgba(255,0,255,0.5)] rounded-xl flex items-center justify-center gap-2 font-bold uppercase shadow-lg transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02]"
                      >
                        <Sparkles size={18} className="animate-pulse" />
                        <span>{isAnalyzing ? 'ANALYZING...' : 'AUTO-GEN ✨'}</span>
                      </button>
                    </div>
                  </div>
                  {/* End Action Toolbar Section */}

                </div>
                {/* End Video Editor Unified Panel */}
              </div>
            )}
          </div>
        )}

        {/* OLD Timeline Section - TO BE REMOVED */}
        {false && (
          <div className="hidden space-y-4">
            {/* Connected Timelines Box */}
            <div className="panel rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Timelines</h3>

              {/* Clips Timeline - Sequential preview of final video */}
              {anchors.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-400 font-medium">Clips Timeline</label>
                    <span className="text-xs text-gray-500">
                      {anchors.length} clip{anchors.length !== 1 ? 's' : ''} • {previewTotalDuration.toFixed(1)}s total
                    </span>
                  </div>

                  <div
                    className="relative h-20 bg-slate-900 rounded-lg cursor-pointer hover:ring-2 hover:ring-blue-600/40 transition-all"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const percentage = clickX / rect.width;
                      const newTime = percentage * previewTotalDuration;
                      seekPreviewTime(newTime);
                      setPlaybackMode('clips');
                    }}
                  >
                    {/* Render clip segments */}
                    {previewTimeline.map((segment, idx) => {
                      const segmentWidth = ((segment.duration / previewTotalDuration) * 100);
                      const segmentLeft = ((segment.previewStart / previewTotalDuration) * 100);
                      const isCurrentSegment = idx === previewAnchorIndex;
                      const colors = getAnchorColor(idx, isCurrentSegment);

                      return (
                        <div
                          key={idx}
                          className={`absolute top-0 bottom-0 transition-all rounded ${colors.bg} ${colors.border} border-2`}
                          style={{
                            left: `${segmentLeft}%`,
                            width: `${segmentWidth}%`
                          }}
                          title={`Clip ${idx + 1}: ${segment.duration.toFixed(1)}s`}
                        >
                          <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none">
                            {idx + 1}
                          </div>
                        </div>
                      );
                    })}

                    {/* Playhead for clips timeline */}
                    {playbackMode === 'clips' && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-10"
                        style={{
                          left: `${(previewCurrentTime / previewTotalDuration) * 100}%`
                        }}
                      >
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-xl border-2 border-blue-500" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-gray-700 my-4"></div>

              {/* Main Timeline - Full video duration with anchors */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400 font-medium">Main Timeline</label>
                  <span className="text-xs text-gray-500">
                    {formatTime(duration)} • Double-click to add clip
                  </span>
                </div>

            {/* Timeline Panel - Moved toolbar below */}
            <div className="mb-4">

<div className="hidden">
  {/* Left Group: Undo/Redo/Trim/Clear */}
  <div className="flex gap-1 justify-between sm:flex-1 sm:justify-start">
  <button
    onClick={undo}
    disabled={historyIndex <= 0}
    className="px-2 py-1.5 btn-secondary rounded-lg flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm flex-shrink-0"
    title="Undo (Ctrl+Z)"
  >
    <RotateCcw size={16} />
    <span className="hidden sm:inline">Undo</span>
  </button>
  <button
    onClick={redo}
    disabled={historyIndex >= history.length - 1}
    className="px-3 py-2 btn-secondary rounded-lg flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
    title="Redo (Ctrl+Y)"
  >
    <RotateCw size={16} />
    <span className="hidden sm:inline">Redo</span>
  </button>
  <button
    onClick={() => setShowTrimModal(true)}
    className="px-3 py-2 btn-secondary rounded-lg flex items-center gap-2 text-sm"
  >
    <Scissors size={16} />
    <span className="hidden sm:inline">Trim</span>
  </button>
  <button
    onClick={() => {
      if (anchors.length > 0) {
        if (confirm(`Remove all ${anchors.length} anchor${anchors.length === 1 ? '' : 's'}?`)) {
          const emptyAnchors = [];
          setAnchors(emptyAnchors);
          saveToHistory(emptyAnchors);
          setSelectedAnchor(null);
          setPreviewAnchor(null);
        }
      }
    }}
    disabled={anchors.length === 0}
    className="px-3 py-2 btn-secondary rounded-lg flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
    style={{ borderColor: 'var(--accent-hot)' }}
  >
    <Trash2 size={16} />
    <span className="hidden sm:inline">Clear</span>
  </button>
</div>

{/* Right Group: Auto-Gen */}
<div className={`flex flex-col gap-2 w-full sm:w-auto sm:flex-1 sm:justify-end ${showPrecisionModal || previewAnchor ? 'invisible' : ''}`} style={{ zIndex: 1 }}>

  {/* Mode Selection */}
  <div className="flex items-center gap-3 text-xs">
    <div className="flex items-center gap-2">
      <input
        type="radio"
        id="mode-quick"
        name="autoGenMode"
        value="quick"
        checked={autoGenMode === 'quick'}
        onChange={(e) => setAutoGenMode(e.target.value)}
        className="w-3 h-3"
      />
      <label htmlFor="mode-quick" className="cursor-pointer text-stone-300">
        Quick <span className="text-green-400">(FREE)</span>
      </label>
    </div>

    <div className="flex items-center gap-2">
      <input
        type="radio"
        id="mode-smart"
        name="autoGenMode"
        value="smart"
        checked={autoGenMode === 'smart'}
        onChange={(e) => setAutoGenMode(e.target.value)}
        className="w-3 h-3"
      />
      <label htmlFor="mode-smart" className="cursor-pointer text-stone-300">
        Smart <span className="text-blue-400">($0.60)</span>
      </label>
    </div>

    <div className="flex items-center gap-2">
      <input
        type="radio"
        id="mode-pro"
        name="autoGenMode"
        value="pro"
        checked={autoGenMode === 'pro'}
        onChange={(e) => setAutoGenMode(e.target.value)}
        className="w-3 h-3"
      />
      <label htmlFor="mode-pro" className="cursor-pointer text-stone-300">
        Pro <span className="text-purple-400">($1.20)</span>
      </label>
    </div>

    <div className="flex items-center gap-2 ml-2 pl-2 border-l border-stone-700">
      <input
        type="checkbox"
        id="beat-sync-toggle"
        checked={enableBeatSync}
        onChange={(e) => setEnableBeatSync(e.target.checked)}
        disabled={!music}
        className="w-3 h-3 cursor-pointer"
      />
      <label htmlFor="beat-sync-toggle" className="cursor-pointer text-stone-300">
        Beat-Sync
      </label>
    </div>
  </div>

  {/* Target Duration Slider */}
  <div className="flex items-center gap-3 text-xs mt-2">
    <label htmlFor="target-duration" className="text-stone-300 whitespace-nowrap">
      Target: {targetDuration}s
    </label>
    <input
      type="range"
      id="target-duration"
      min="15"
      max="180"
      step="1"
      value={targetDuration}
      onChange={(e) => setTargetDuration(parseInt(e.target.value))}
      className="flex-1 h-1 rounded-lg appearance-none cursor-pointer bg-slate-600 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:hover:bg-amber-400 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0"
    />
    <span className="text-stone-500 text-xs">15s - 180s</span>
  </div>

  <button
      onClick={async () => {
        if (!video || isAnalyzing) return;

        try {
          setIsAnalyzing(true);

          console.log(`🎬 AUTO-GENERATE V3 STARTING - Mode: ${autoGenMode.toUpperCase()}`);

          // === MODE 1: QUICK GEN (FREE - Motion Only) ===
          if (autoGenMode === 'quick') {
            console.log('⚡ Quick Gen: Motion detection only (FREE)');

            // Step 1: Motion detection
            let videoAnalysisResult = videoAnalysis;
            if (!videoAnalysisResult || videoAnalysisResult.length === 0) {
              console.log('🎬 Running motion detection...');
              videoAnalysisResult = await analyzeVideo(video, motionSensitivity);
              setVideoAnalysis(videoAnalysisResult);
            } else {
              console.log('✅ Using cached motion analysis');
            }

            // Step 2: Find high-motion moments
            const motionCuts = videoAnalysisResult
              .filter(m => m.motionScore > 0.6 || m.sceneChange)
              .sort((a, b) => b.motionScore - a.motionScore)
              .slice(0, 8)
              .map((m, index) => ({
                start: Math.max(0, m.time - 1),
                end: Math.min(duration, m.time + 3),
                reason: m.sceneChange ? 'Scene change' : 'High motion',
                importance: m.motionScore
              }));

            // Step 3: Apply gentle beat-sync if enabled
            let finalCuts = motionCuts;
            if (enableBeatSync && musicAnalysis?.beatGrid && music) {
              console.log('🎵 Applying gentle beat-sync...');
              finalCuts = applyGentleBeatSync(motionCuts, musicAnalysis);
            }

            // Step 4: Create anchors
            const newAnchors = finalCuts.map((cut, index) => ({
              id: Date.now() + index,
              start: Math.max(0, cut.start),
              end: Math.min(duration, cut.end),
              _narrativeReason: cut.reason,
              _importance: cut.importance
            }));

            const finalAnchors = newAnchors.reduce((kept, anchor, index) => {
              if (index === 0) {
                kept.push(anchor);
                return kept;
              }
              const lastKept = kept[kept.length - 1];
              if (anchor.start >= lastKept.end) {
                kept.push(anchor);
              }
              return kept;
            }, []);

            console.log('✅ QUICK GEN COMPLETE:', {
              anchorsCreated: finalAnchors.length,
              totalDuration: finalAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1)
            });

            setAnchors(finalAnchors);
            saveToHistory(finalAnchors);
          }

          // === MODE 2: SMART GEN (V5 - Five-Phase: Gather → Analyze → Seek → Supplement → Select) ===
          else if (autoGenMode === 'smart') {
            console.log('🧠 Smart Gen: Five-Phase Editorial Workflow (~$0.60-$1.50)');

            // PHASE 1: Gather comprehensive frames
            const { frames: allFrames, zones } = await gatherComprehensiveFrames(video, duration);

            if (allFrames.length === 0) {
              alert('Failed to extract any frames from video. Please try again.');
              return;
            }

            // PHASE 2: Identify moments (no clip lengths yet)
            const initialAnalysis = await analyzeNarrativeComprehensive(allFrames, targetDuration, zones);

            if (!initialAnalysis) {
              alert('Narrative analysis failed. Please try again.');
              return;
            }

            // Build initial moment inventory with zone enrichment
            const enrichMomentsWithZones = (moments, zones) => {
              return moments.map(moment => {
                // Find which zone this timestamp falls into
                const zone = zones.find(z => moment.timestamp >= z.start && moment.timestamp <= z.end);
                return {
                  ...moment,
                  zone: zone?.name || 'unknown',
                  zoneIndex: zones.indexOf(zone)
                };
              });
            };

            let allMoments = enrichMomentsWithZones(initialAnalysis.keyMoments || [], zones);

            // PHASE 3: Agentic seeking for missing moments
            if (initialAnalysis.missingMoments && initialAnalysis.missingMoments.length > 0) {
              const { newFrames, searches } = await seekMissingMoments(
                video,
                duration,
                initialAnalysis.missingMoments,
                allFrames,
                zones
              );

              // PHASE 4: Analyze new frames (supplemental moments)
              if (newFrames.length > 0) {
                console.log(`🔄 Analyzing ${newFrames.length} new frames for supplemental moments...`);
                const supplemental = await analyzeNewFrames(
                  allFrames,
                  newFrames,
                  targetDuration,
                  zones,
                  initialAnalysis.missingMoments,
                  [] // No cuts yet, just moments
                );

                // Merge moments with zone enrichment
                const enrichedNewMoments = enrichMomentsWithZones(supplemental.newMoments || [], zones);
                allMoments = [
                  ...allMoments,
                  ...enrichedNewMoments
                ];

                console.log(`✅ Moment Inventory: ${initialAnalysis.keyMoments.length} original + ${supplemental.newMoments?.length || 0} new = ${allMoments.length} total moments`);

                // Log zone breakdown of all moments
                const allMomentsZoneBreakdown = {};
                allMoments.forEach(m => {
                  allMomentsZoneBreakdown[m.zone] = (allMomentsZoneBreakdown[m.zone] || 0) + 1;
                });
                console.log('📊 Complete Moment Inventory by Zone:', allMomentsZoneBreakdown);
              } else {
                console.log('⚠️ No new frames found - proceeding with existing moments');
              }
            } else {
              console.log('✅ No missing moments - proceeding with existing moments');
            }

            // PHASE 5: Select final clips with ALL moments known
            console.log(`📝 Now selecting clips from ${allMoments.length} total moments...`);

            // Debug: Log sample moments from each zone
            console.log('🔍 Sample moments by zone:');
            const zoneGroups = {};
            allMoments.forEach((m, idx) => {
              if (!zoneGroups[m.zone]) zoneGroups[m.zone] = [];
              zoneGroups[m.zone].push(`#${idx + 1}: ${m.description.substring(0, 30)}... [imp:${m.importance}]`);
            });
            Object.entries(zoneGroups).forEach(([zone, moments]) => {
              console.log(`  ${zone}: ${moments.slice(0, 2).join(', ')}`);
            });

            const clipSelection = await selectFinalClips(allMoments, targetDuration, initialAnalysis.storyType);

            // Map moment indices back to actual moments and create anchors
            console.log('🔧 Validating and mapping selected clips to anchors:');

            // Step 1: Sort clips by start time
            const sortedClips = [...clipSelection.selectedClips].sort((a, b) => a.startTime - b.startTime);

            // Step 2: Validate and fix overlaps + duration overruns
            const validatedClips = [];
            for (let i = 0; i < sortedClips.length; i++) {
              const clip = sortedClips[i];
              let { startTime, endTime, momentIndex } = clip;

              // Fix 1: Trim if exceeds video duration
              if (endTime > duration) {
                console.warn(`⚠️ Clip ${i+1} trimmed: ${formatTime(endTime)} → ${formatTime(duration)} (exceeded video duration)`);
                endTime = duration;
              }

              // Fix 2: Check overlap with previous clip
              if (i > 0) {
                const prevClip = validatedClips[validatedClips.length - 1];
                if (startTime < prevClip.endTime) {
                  const overlap = prevClip.endTime - startTime;
                  console.warn(`⚠️ Clip ${i+1} overlaps with previous by ${overlap.toFixed(1)}s - skipping`);
                  continue; // Skip this clip entirely
                }
              }

              // Ensure minimum clip length
              if (endTime - startTime < 1.5) {
                console.warn(`⚠️ Clip ${i+1} too short (${(endTime - startTime).toFixed(1)}s) - skipping`);
                continue;
              }

              validatedClips.push({ ...clip, startTime, endTime });
            }

            console.log(`✅ Validated: ${clipSelection.selectedClips.length} → ${validatedClips.length} clips (removed ${clipSelection.selectedClips.length - validatedClips.length} overlaps)`);

            // Step 3: Map to anchors
            const allAnchors = validatedClips.map((clip, index) => {
              const moment = allMoments[clip.momentIndex - 1];
              console.log(`  Clip ${index + 1}: Moment #${clip.momentIndex} [${moment.zone}] @ ${formatTime(moment.timestamp)} → Anchor ${formatTime(clip.startTime)}-${formatTime(clip.endTime)}`);
              return {
                id: Date.now() + index,
                start: clip.startTime,
                end: clip.endTime,
                _narrativeReason: moment.description,
                _importance: moment.importance
              };
            });

            console.log(`\n📍 Final anchor timestamps (sorted):`);
            allAnchors.forEach((anchor, idx) => {
              console.log(`  Anchor ${idx + 1}: ${formatTime(anchor.start)}-${formatTime(anchor.end)} (${(anchor.end - anchor.start).toFixed(1)}s)`);
            });

            // Enforce target duration - trim clips to fit within target (+10s tolerance)
            const targetLimit = targetDuration + 10;
            let runningTotal = 0;
            const newAnchors = [];

            for (const anchor of allAnchors) {
              const clipDuration = anchor.end - anchor.start;
              if (runningTotal + clipDuration <= targetLimit) {
                newAnchors.push(anchor);
                runningTotal += clipDuration;
              } else if (runningTotal < targetDuration) {
                // Partial clip to exactly hit target
                const remaining = targetDuration - runningTotal;
                if (remaining >= 2) { // Only add if at least 2 seconds
                  newAnchors.push({
                    ...anchor,
                    end: anchor.start + remaining
                  });
                  runningTotal += remaining;
                }
                break;
              } else {
                break; // Already at or past target
              }
            }

            const finalDuration = newAnchors.reduce((sum, a) => sum + (a.end - a.start), 0);
            const trimmedCount = allAnchors.length - newAnchors.length;

            console.log('✅ SMART GEN COMPLETE:', {
              storyType: initialAnalysis.storyType,
              momentsInventoried: allMoments.length,
              clipsSelected: allAnchors.length,
              anchorsCreated: newAnchors.length,
              trimmed: trimmedCount > 0 ? `${trimmedCount} clips to fit target` : 'none',
              totalDuration: finalDuration.toFixed(1) + 's',
              target: targetDuration + 's',
              workflow: '5-phase (gather→analyze→seek→supplement→select)'
            });

            setAnchors(newAnchors);
            saveToHistory(newAnchors);
          }

          // === MODE 3: PRO GEN (NEW - Vision + Audio) ===
          else if (autoGenMode === 'pro') {
            console.log('🎬 Pro Gen: Multi-modal analysis (Vision + Audio) (~$1.20)');

            // Step 1: Motion detection for smart sampling
            let videoAnalysisResult = videoAnalysis;
            if (!videoAnalysisResult || videoAnalysisResult.length === 0) {
              console.log('🎬 Running motion detection for smart sampling...');
              videoAnalysisResult = await analyzeVideo(video, motionSensitivity);
              setVideoAnalysis(videoAnalysisResult);
            } else {
              console.log('✅ Using cached motion analysis');
            }

            // Step 2: Transcribe audio
            console.log('🎤 Transcribing audio with Whisper...');
            const transcript = await transcribeVideo(video);

            if (!transcript) {
              alert('Audio transcription failed. Falling back to Smart Gen mode.');
              setAutoGenMode('smart');
              return;
            }

            console.log('✅ Transcription complete:', {
              duration: transcript.duration,
              segments: transcript.segments?.length,
              language: transcript.language
            });

            // Step 3: Analyze transcript for topics and quotes
            console.log('📊 Analyzing audio topics...');
            const audioTopics = analyzeTranscriptTopics(transcript);

            console.log('✅ Audio analysis complete:', {
              topics: audioTopics.topics?.length,
              keyQuotes: audioTopics.keyQuotes?.length,
              pauses: audioTopics.pauses?.length
            });

            // Step 4: Extract frames with smart sampling
            console.log('📸 Extracting frames with smart sampling...');
            const frames = await extractFramesForNarrative(video, videoAnalysisResult, 12);
            console.log(`✅ Extracted ${frames.length} frames`);

            // Step 5: Multi-modal analysis (vision + audio)
            console.log('🤖 Running multi-modal analysis...');
            const narrative = await analyzeMultiModal(frames, transcript, audioTopics, targetDuration);

            if (!narrative) {
              alert('Multi-modal analysis failed. Please try again.');
              return;
            }

            console.log('📖 Story Type:', narrative.storyType);
            console.log('📝 Narrative:', narrative.narrative);
            console.log('✂️ Suggested Cuts:', narrative.suggestedCuts.length);

            // Step 6: Refine with speech pauses
            console.log('🗣️ Refining with speech pauses...');
            let refinedCuts = refineWithSpeechPauses(
              narrative.suggestedCuts,
              audioTopics.pauses
            );

            // Step 7: Further refine with motion detection
            console.log('🔍 Refining with motion detection...');
            refinedCuts = refineWithMotionDetection(refinedCuts, videoAnalysisResult);

            // Step 8: Apply gentle beat-sync if enabled
            if (enableBeatSync && musicAnalysis?.beatGrid && music) {
              console.log('🎵 Applying gentle beat-sync...');
              refinedCuts = applyGentleBeatSync(refinedCuts, musicAnalysis);
            }

            // Step 9: Create anchors
            const newAnchors = refinedCuts.map((cut, index) => ({
              id: Date.now() + index,
              start: Math.max(0, cut.start || cut.startTime),
              end: Math.min(duration, cut.end || cut.endTime),
              _narrativeReason: cut.visualReason || cut.audioReason || cut.reason,
              _importance: cut.importance,
              _narrativeRole: cut.narrativeRole
            }));

            const finalAnchors = newAnchors.reduce((kept, anchor, index) => {
              if (index === 0) {
                kept.push(anchor);
                return kept;
              }
              const lastKept = kept[kept.length - 1];
              if (anchor.start >= lastKept.end) {
                kept.push(anchor);
              }
              return kept;
            }, []);

            console.log('✅ PRO GEN COMPLETE:', {
              storyType: narrative.storyType,
              anchorsCreated: finalAnchors.length,
              totalDuration: finalAnchors.reduce((sum, a) => sum + (a.end - a.start), 0).toFixed(1),
              confidence: narrative.confidence
            });

            setAnchors(finalAnchors);
            saveToHistory(finalAnchors);
          }

        } catch (error) {
          console.error('Auto-generate error:', error);
          alert('Error during generation: ' + error.message);
        } finally {
          setIsAnalyzing(false);
        }
      }}
      disabled={!duration || isAnalyzing}
      className="px-4 py-2 btn-accent rounded-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold shadow-md transition w-full sm:w-auto justify-center"
    >
      <Sparkles size={18} />
      <span className="hidden sm:inline">{isAnalyzing ? 'Analyzing Story...' : 'Auto-Generate'}</span>
      <span className="sm:hidden">{isAnalyzing ? 'Analyzing...' : 'Auto-Gen'}</span>
    </button>


  </div>
</div>
</div>
{/* End hidden old toolbar */}

{/* Timeline visualization - Main Timeline */}
<div
  ref={timelineRef}
  onMouseDown={handleTimelineMouseDown}
  onClick={(e) => {
    // Clicking main timeline switches to full video mode
    if (playbackMode === 'clips') {
      setPlaybackMode('full');
      stopEnhancedPreview();
    }
  }}
  onTouchStart={(e) => {
    e.preventDefault(); // Prevent scroll only
    const touch = e.touches[0];
    handleTimelineMouseDown({ ...e, clientX: touch.clientX });
  }}
  onTouchMove={(e) => {
    e.preventDefault(); // Prevent scroll only
  }}
  onTouchEnd={(e) => {
    e.preventDefault(); // Prevent scroll only

    // Double-tap detection for mobile
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    const touch = e.changedTouches[0];
    const tapPosition = { x: touch.clientX, y: touch.clientY };
    const distance = Math.sqrt(
      Math.pow(tapPosition.x - lastTapPositionRef.current.x, 2) +
      Math.pow(tapPosition.y - lastTapPositionRef.current.y, 2)
    );

    // If tapped within 300ms and within 30px of last tap, it's a double-tap
    if (timeSinceLastTap < 300 && distance < 30) {
      handleTimelineDoubleTap(e);
      lastTapTimeRef.current = 0; // Reset to prevent triple-tap
    } else {
      lastTapTimeRef.current = now;
      lastTapPositionRef.current = tapPosition;
    }
  }}
  onDoubleClick={(e) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * duration;
    
    const newAnchor = {
      id: Date.now(),
      start: time,
      end: Math.min(time + 2, duration)
    };

    const hasOverlap = anchors.some(a =>
      (newAnchor.start >= a.start && newAnchor.start < a.end) ||
      (newAnchor.end > a.start && newAnchor.end <= a.end) ||
      (newAnchor.start <= a.start && newAnchor.end >= a.end)
    );

    if (hasOverlap) {
      alert('Anchor overlaps with existing anchor');
      return;
    }

    const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
    setAnchors(updated);
    saveToHistory(updated);
    setSelectedAnchor(newAnchor.id);
  }}
  className="relative h-32 bg-slate-900 rounded-lg cursor-pointer mb-4 hover:ring-2 hover:ring-cyan-500/40 transition-all select-none"
  style={{ touchAction: 'none', position: 'relative', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none', zIndex: 1 }}
  title="Double-click to add anchor"
>
  {/* Current time indicator - Thin white line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/80 cursor-ew-resize z-20 pointer-events-none"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />

                {/* Anchors */}
                {anchors.map((anchor, index) => {
                  const isSelected = selectedAnchor === anchor.id;
                  const colors = getAnchorColor(index, isSelected);
                  const width = ((anchor.end - anchor.start) / duration) * 100;

                  return (
                    <div
                      key={anchor.id}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: `${(anchor.start / duration) * 100}%`,
                        width: `${width}%`,
                        zIndex: isSelected ? 50 : 30
                      }}
                    >
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

    // Record start position for detecting taps vs drags
    const touch = e.touches[0];
    anchorTapRef.current.startX = touch.clientX;
    anchorTapRef.current.startY = touch.clientY;
    anchorTapRef.current.hasMoved = false;

    setSelectedAnchor(anchor.id);
    handleAnchorTouchStart(e, anchor, 'anchor-move');
  }}
  onTouchMove={(e) => {
    // Check if finger moved significantly (indicates drag, not tap)
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - (anchorTapRef.current.startX || 0));
    const dy = Math.abs(touch.clientY - (anchorTapRef.current.startY || 0));
    if (dx > 10 || dy > 10) {
      anchorTapRef.current.hasMoved = true;
    }
  }}
  onTouchEnd={(e) => {
    e.stopPropagation();

    // Only count as tap if finger didn't move much
    if (anchorTapRef.current.hasMoved) {
      anchorTapRef.current = { anchorId: null, time: 0, hasMoved: false };
      return;
    }

    // Double-tap detection for deletion
    const now = Date.now();
    if (anchorTapRef.current.anchorId === anchor.id && now - anchorTapRef.current.time < 400) {
      // Double-tap detected - delete anchor
      deleteAnchor(anchor.id);
      anchorTapRef.current = { anchorId: null, time: 0, hasMoved: false };
      setHasSeenDeleteHint(true);
      return;
    }
    anchorTapRef.current = { anchorId: anchor.id, time: now, hasMoved: false };
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
  className={`absolute inset-0 ${colors.bg} border-2 ${colors.border} rounded cursor-move transition touch-manipulation`}
  style={{ touchAction: 'none', zIndex: 10 }}
>
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none">
                          {formatTime(anchor.end - anchor.start)}
                        </div>

                        {isSelected && (
                          <>
                            {/* Left handle - Green (Start) - Expanded touch target with visual handle */}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                // Select anchor and show start frame in preview
                                setSelectedAnchor(anchor.id);
                                setHoveredAnchor(null);
                                setPreviewAnchor(anchor);
                                setPreviewHandle('start');
                                if (previewVideoRef.current) {
                                  previewVideoRef.current.currentTime = anchor.start;
                                }
                              }}
                              className="absolute left-0 top-0 bottom-0 w-8 cursor-ew-resize touch-none -translate-x-1/2 flex items-center justify-center"
                              style={{ touchAction: 'none', zIndex: 100, pointerEvents: 'auto' }}
                              title="Drag to adjust start time"
                            >
                              {/* Visible pill-shaped grab handle */}
                              <div className="w-1 h-full bg-green-500 hover:bg-green-400 transition-all rounded-full relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-8 bg-green-400 rounded-full shadow-lg shadow-green-500/50 border-2 border-white/30" />
                              </div>
                            </div>
                            {/* Right handle - Red (End) - Expanded touch target with visual handle */}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                // Select anchor and show end frame in preview
                                setSelectedAnchor(anchor.id);
                                setHoveredAnchor(null);
                                setPreviewAnchor(anchor);
                                setPreviewHandle('end');
                                if (previewVideoRef.current) {
                                  previewVideoRef.current.currentTime = anchor.end;
                                }
                              }}
                              className="absolute right-0 top-0 bottom-0 w-8 cursor-ew-resize touch-none translate-x-1/2 flex items-center justify-center"
                              style={{ touchAction: 'none', zIndex: 100, pointerEvents: 'auto' }}
                              title="Drag to adjust end time"
                            >
                              {/* Visible pill-shaped grab handle */}
                              <div className="w-1 h-full bg-red-500 hover:bg-red-400 transition-all rounded-full relative">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-8 bg-red-400 rounded-full shadow-lg shadow-red-500/50 border-2 border-white/30" />
                              </div>
                            </div>
                            {/* Precision button */}
                            
                          </>
                        )}
                      </div>

{/* Preview/Hover Panel - Positioned to avoid control overlap */}
{(previewAnchor?.id === anchor.id || hoveredAnchor?.id === anchor.id) && (
  <div
    data-preview-panel="true"
    onClick={(e) => e.stopPropagation()}
    onMouseDown={(e) => e.stopPropagation()}
    onTouchStart={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
    title=""
    className={`absolute bottom-full mb-8 sm:mb-6 bg-slate-800 rounded-lg shadow-2xl border-2 ${
      previewAnchor?.id === anchor.id ? 'border-purple-500/80' : 'border-cyan-500/40'
    } p-2 w-80 sm:w-64 sm:p-3 ${
      (anchor.start / duration) < 0.3
        ? 'left-0'
        : (anchor.start / duration) > 0.7
          ? 'right-0'
          : 'left-1/2 -translate-x-1/2'
    }`}
    style={{ zIndex: 200 }}
  >
    <div className="flex justify-between items-center mb-2">
      <div className="text-xs font-semibold">
        Anchor {index + 1} {previewAnchor?.id === anchor.id ? 'Preview' : 'Hover'}
      </div>
                            <button
                              onClick={() => setPreviewAnchor(null)}
                              className="text-gray-400 hover:text-white transition-colors"
                              title="Close preview"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="bg-black rounded overflow-hidden mb-2">
                            <video
                              ref={previewVideoRef}
                              src={videoUrl}
                              className="w-full h-32 object-contain"
                              onTimeUpdate={handlePreviewTimeUpdate}
                              loop
                              muted={previewMuted}
                              playsInline
                            />
                          </div>

<div className="space-y-2">
  <div className="flex items-center gap-2">
    <button
      onClick={togglePreviewPlay}
      className="p-2 bg-gradient-to-br from-gray-700 to-gray-800 border border-cyan-500/30 rounded hover:border-cyan-500/40"
    >
      {previewVideoRef.current?.paused ? <Play size={14} /> : <Pause size={14} />}
    </button>
    <button
      onClick={() => setPreviewMuted(!previewMuted)}
      className="p-2 bg-slate-600 rounded hover:bg-slate-700"
      title={previewMuted ? "Unmute" : "Mute"}
    >
      {previewMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
    </button>
    <div className="text-xs text-gray-300">
      {formatTime(anchor.end - anchor.start)} loop
    </div>
  </div>
  
  <div className="flex gap-2">
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();

        // Detect mobile
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (isMobile) {
          openPrecisionModalMobile(anchor);
        } else {
          openPrecisionModal(anchor);
        }
      }}
      onTouchStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openPrecisionModalMobile(anchor);
      }}
      className="flex-1 px-3 py-2 btn-accent rounded-lg text-xs flex items-center justify-center gap-1.5 font-semibold"
      style={{ zIndex: 201 }}
    >
      <ZoomIn size={14} />
      Precision
    </button>
    <button
      onClick={(e) => {
        e.stopPropagation();
        deleteAnchor(anchor.id);
        setPreviewAnchor(null);
        setHoveredAnchor(null);
      }}
      className="px-3 py-2 btn-secondary rounded-lg text-xs flex items-center justify-center gap-1.5 font-semibold hover:bg-red-600/20"
      style={{ borderColor: 'var(--accent-hot)' }}
      title="Delete anchor"
    >
      <Trash2 size={14} />
    </button>
  </div>
</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-gray-400 text-center mt-4">
                {anchors.length === 0
                  ? '💡 Double-click timeline to add anchor'
                  : 'Click to preview • Double-click to delete • Drag handles to resize • Drag middle to move • Click "Precision" for zoom'}
              </div>
            </div>
            {/* End Main Timeline */}
          </div>
          {/* End Connected Timelines Box */}

          {/* Toolbar - Action Buttons */}
          <div className="panel rounded-lg sm:rounded-2xl p-1 sm:p-4 w-full">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
              {/* Left Group: Undo/Redo/Trim/Clear - moved from above */}
              <div className="flex gap-1 justify-between sm:flex-1 sm:justify-start">
                <button
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  className="px-2 py-1.5 btn-secondary rounded-lg flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed text-xs sm:text-sm flex-shrink-0"
                  title="Undo (Ctrl+Z)"
                >
                  <RotateCcw size={16} />
                  <span className="hidden sm:inline">Undo</span>
                </button>
                <button
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  className="px-3 py-2 btn-secondary rounded-lg flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                  title="Redo (Ctrl+Y)"
                >
                  <RotateCw size={16} />
                  <span className="hidden sm:inline">Redo</span>
                </button>
                <button
                  onClick={() => setShowTrimModal(true)}
                  className="px-3 py-2 btn-secondary rounded-lg flex items-center gap-2 text-sm"
                >
                  <Scissors size={16} />
                  <span className="hidden sm:inline">Trim</span>
                </button>
                <button
                  onClick={() => {
                    if (anchors.length > 0) {
                      if (confirm(`Remove all ${anchors.length} anchor${anchors.length === 1 ? '' : 's'}?`)) {
                        const emptyAnchors = [];
                        setAnchors(emptyAnchors);
                        saveToHistory(emptyAnchors);
                        setSelectedAnchor(null);
                        setPreviewAnchor(null);
                      }
                    }
                  }}
                  disabled={anchors.length === 0}
                  className="px-3 py-2 btn-secondary rounded-lg flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--accent-hot)' }}
                >
                  <Trash2 size={16} />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </div>

              {/* Right Group: Auto-Gen controls - keep existing from line 4652+ */}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                  <div className="text-gray-400 text-xs">Total Anchors</div>
                  <div className="text-lg font-semibold text-white">{formatTime(anchorTime)}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                  <div className="text-gray-400 text-xs">Video Duration</div>
                  <div className="text-lg font-semibold text-blue-400">{formatTime(duration)}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg text-center">
                  <div className="text-gray-400 text-xs">Selected</div>
                  <div className="text-lg font-semibold text-amber-400">
                    {selectedAnchor ? anchors.findIndex(a => a.id === selectedAnchor) + 1 : '-'}
                  </div>
                </div>
              </div>

              {/* Save/Load Anchor Config */}
              <div className="flex gap-2">
                <button
                  onClick={saveConfiguration}
                  disabled={anchors.length === 0}
                  className="flex-1 px-3 py-2 bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-cyan-500/30 hover:border-cyan-500/40 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                >
                  <Save size={16} />
                  <span className="hidden sm:inline">Save Anchor Config</span>
                  <span className="sm:hidden">Save</span>
                </button>
                <button
                  onClick={() => loadConfigInputRef.current?.click()}
                  className="flex-1 px-3 py-2 bg-gradient-to-br from-gray-700 to-gray-900 border-2 border-cyan-500/30 hover:border-cyan-500/40 rounded-lg transition flex items-center justify-center gap-2 text-sm"
                >
                  <FolderOpen size={16} />
                  <span className="hidden sm:inline">Load Anchor Config</span>
                  <span className="sm:hidden">Load</span>
                </button>
                <input
                  ref={loadConfigInputRef}
                  type="file"
                  accept=".json"
                  onChange={loadConfiguration}
                  className="hidden"
                />
              </div>
            </div>
            {/* Keyboard Shortcuts Help */}
            <div className="bg-slate-800/30 rounded-lg p-4 text-xs text-gray-400">
              <div className="font-semibold mb-2">Keyboard Shortcuts:</div>
              <div className="grid grid-cols-2 gap-2">
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">Space</kbd> Play/Pause</div>
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">←/→</kbd> Skip 1s (or frame in precision)</div>
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">Delete</kbd> Remove selected anchor</div>
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">Ctrl+Z</kbd> Undo</div>
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">Ctrl+Y</kbd> Redo</div>
             </div>
          </div>
        </div>
      )}

        {/* Trim Modal */}
        {showTrimModal && (
          <div className="fixed inset-0 glass-modal-overlay flex items-center justify-center z-50">
            <div className="glass-panel p-6 rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto">
             <div className="space-y-2 mb-3">
  {/* Top Row: Prev/Next Navigation */}
  <div className="flex items-center justify-center gap-4">
    <button
      onClick={goToPreviousAnchor}
      disabled={!precisionAnchor || precisionAnchor._index === 0}
      className="px-4 py-2 btn-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Previous Anchor"
    >
      ← Prev
    </button>

    <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
      Anchor {(precisionAnchor?._index || 0) + 1} of {anchors.length}
    </div>

    <button
      onClick={goToNextAnchor}
      disabled={!precisionAnchor || precisionAnchor._index >= anchors.length - 1}
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
{showPrecisionModal && precisionAnchor && (
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
  {/* Top Row: Prev/Next Navigation */}
  <div className="flex items-center justify-center gap-4">
    <button
      onClick={goToPreviousAnchor}
      disabled={!precisionAnchor || precisionAnchor._index === 0}
      className="px-4 py-2 btn-secondary rounded-lg disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Previous Anchor"
    >
      ← Prev
    </button>

    <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
      Anchor {(precisionAnchor?._index || 0) + 1} of {anchors.length}
    </div>

    <button
      onClick={goToNextAnchor}
      disabled={!precisionAnchor || precisionAnchor._index >= anchors.length - 1}
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
              <p style={{ color: 'var(--text-secondary)' }}>Select platforms and export your final video</p>
            </div>

            <div className="space-y-4 mb-6">
              <h3 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>Select Platforms:</h3>
              {Object.entries(platforms).map(([key, platform]) => (
                <label
                  key={key}
                  className="flex items-center gap-4 p-4 btn-secondary rounded-lg cursor-pointer"
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
                  <div className={`flex-1 px-4 py-3 bg-gradient-to-r ${platform.color} rounded-lg font-semibold text-center`}>
                    {platform.name}
                    {platform.subtitle && (
                      <div className="text-sm opacity-80">{platform.subtitle}</div>
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
      <h3 className="text-xl font-semibold mb-6 text-center">Select Export Platforms</h3>

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
            <div className={`flex-1 px-4 py-3 bg-gradient-to-r ${platform.color} rounded-lg font-semibold text-center`}>
              <div className="text-lg">{platform.name}</div>
              {platform.subtitle && (
                <div className="text-sm opacity-90 mt-1">{platform.subtitle}</div>
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
  </div>
  );
};

export default ReelForge;