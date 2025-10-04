import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Trash2, Sparkles, Music as MusicIcon, Download, Scissors, X, ZoomIn, RotateCcw, RotateCw, Save, FolderOpen } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ClipBoost = () => {
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

  // Music state
  const [music, setMusic] = useState(null);
  const [musicUrl, setMusicUrl] = useState(null);
  const [musicDuration, setMusicDuration] = useState(0);
  const [musicStartTime, setMusicStartTime] = useState(0);
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

  // Undo/Redo state
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Precision modal state
  const [showPrecisionModal, setShowPrecisionModal] = useState(false);
  const [precisionAnchor, setPrecisionAnchor] = useState(null);
  const [precisionTime, setPrecisionTime] = useState(0);
  const [precisionPlaying, setPrecisionPlaying] = useState(false);
  const [selectedHandle, setSelectedHandle] = useState('end'); // 'start' or 'end'

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
  const [targetDuration, setTargetDuration] = useState(60);
  const [musicAnalysis, setMusicAnalysis] = useState(null);
  const [useBeatSync, setUseBeatSync] = useState(false);
  // Auto-save state
  const [showRestoreToast, setShowRestoreToast] = useState(false);
  const [restoredAnchorCount, setRestoredAnchorCount] = useState(0);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);
  const [hoveredAnchor, setHoveredAnchor] = useState(null);
  // FFmpeg state
  const [ffmpeg, setFFmpeg] = useState(null);
  const [ffmpegLoaded, setFFmpegLoaded] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const precisionVideoRef = useRef(null);
  const musicRef = useRef(null);
  const timelineRef = useRef(null);
  const precisionTimelineRef = useRef(null);
  const loadConfigInputRef = useRef(null);

  // Platform configurations
const platforms = {
  vertical: { 
    name: '9:16 Vertical', 
    subtitle: 'TikTok • Reels • Shorts',
    aspect: '9:16', 
    color: 'from-black via-pink-500 to-red-600',
    width: 1080,
    height: 1920
  },
  instagram: { 
    name: '4:5 Instagram Feed', 
    aspect: '4:5', 
    color: 'from-pink-500 to-purple-600',
    width: 1080,
    height: 1350
  },
  horizontal: { 
    name: '16:9 Horizontal', 
    subtitle: 'Twitter/X',
    aspect: '16:9', 
    color: 'from-gray-900 to-gray-700',
    width: 1920,
    height: 1080
  },
  original: { 
    name: 'Original', 
    subtitle: 'No crop',
    aspect: 'original', 
    color: 'from-blue-600 to-blue-800'
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

  // Auto-save anchors when they change
  useEffect(() => {
    if (anchors.length > 0 && video) {
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
        setTimeout(() => setShowAutoSaveIndicator(false), 2000);
      } catch (error) {
        console.error('Error auto-saving:', error);
      }
    }
  }, [anchors, musicStartTime, audioBalance, video]);

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

  // Utility functions
  const formatTime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getAnchorColor = (index, isSelected) => {
    const colors = [
      { bg: 'bg-green-400/30', border: 'border-green-400', handle: 'bg-green-400' },
      { bg: 'bg-blue-400/30', border: 'border-blue-400', handle: 'bg-blue-400' },
      { bg: 'bg-red-400/30', border: 'border-red-400', handle: 'bg-red-400' },
      { bg: 'bg-purple-400/30', border: 'border-purple-400', handle: 'bg-purple-400' },
      { bg: 'bg-yellow-400/30', border: 'border-yellow-400', handle: 'bg-yellow-400' }
    ];
    const color = colors[index % colors.length];
    return isSelected ? { ...color, bg: color.bg.replace('/30', '/50') } : color;
  };

  // Undo/Redo functions
  const saveToHistory = (newAnchors) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newAnchors)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setAnchors(JSON.parse(JSON.stringify(prevState)));
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setAnchors(JSON.parse(JSON.stringify(nextState)));
      setHistoryIndex(historyIndex + 1);
    }
  };

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

        // Estimate BPM from peak intervals (guard against no peaks)
        let bpm = 0;
        let beatInterval = 0;
        if (peaks.length >= 2) {
          const intervals = [];
          for (let i = 1; i < peaks.length && i < 20; i++) {
            intervals.push(peaks[i].time - peaks[i - 1].time);
          }
          const avgInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length || 0.5;
          beatInterval = avgInterval;
          bpm = 60 / avgInterval;
        } else {
          // fallback defaults if detection fails
          beatInterval = 0.5;
          bpm = 120;
        }

// Generate beat grid as video-relative timestamps
const beatGrid = [];
const endTime = duration !== null ? Math.min(startTime + duration, audioDuration) : audioDuration;
let videoTime = 0; // Start from video beginning
for (let time = startTime; time < endTime; time += beatInterval) {
  beatGrid.push(videoTime);
  videoTime += beatInterval;
}

        // Score musical moments
        const musicalMoments = [];
        for (let i = 0; i < beatGrid.length; i++) {
          const time = beatGrid[i];
          const isPhraseBoundary = i % 8 === 0; // Every 8th beat

          const energyIndex = Math.floor((time / audioDuration) * energyData.length);
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
              time,
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

// Motion Detection / Video Analysis System
const analyzeVideo = async (videoFile) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    video.src = URL.createObjectURL(videoFile);
    video.muted = true;

    const results = [];
    let previousFrame = null;
    let frameCount = 0;

    video.onloadedmetadata = () => {
      canvas.width = 320; // reduced size for speed
      canvas.height = 180;
      const videoDuration = video.duration;

// Adaptive sampling
let sampleInterval;
if (videoDuration < 300) sampleInterval = 0.5;
else if (videoDuration < 1800) sampleInterval = 2;
else if (videoDuration < 3600) sampleInterval = 5;
else sampleInterval = 10;

const totalSamples = Math.floor(videoDuration / sampleInterval);
let currentSample = 0;

      const processFrame = () => {
  if (currentSample >= totalSamples) {
    URL.revokeObjectURL(video.src);
    resolve(results);
    return;
  }
  const timestamp = currentSample * sampleInterval;
  video.currentTime = timestamp;
};

      // Use onseeked to capture frames after seeking
      video.onseeked = () => {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

          if (previousFrame) {
  let diffSum = 0;
  const totalPixels = currentFrame.data.length / 4;

  for (let i = 0; i < currentFrame.data.length; i += 4) {
    const rDiff = Math.abs(currentFrame.data[i] - previousFrame.data[i]);
    const gDiff = Math.abs(currentFrame.data[i + 1] - previousFrame.data[i + 1]);
    const bDiff = Math.abs(currentFrame.data[i + 2] - previousFrame.data[i + 2]);
    diffSum += (rDiff + gDiff + bDiff) / 3;
  }

  const motionScore = diffSum / totalPixels / 255;
  const isSceneChange = motionScore > 0.4;

if (motionScore > 0.15) {
  results.push({
    time: video.currentTime,
    motionScore,
    sceneChange: isSceneChange,
  });
}
} // <-- This closing brace for if (previousFrame) was missing

          previousFrame = currentFrame;
          currentSample++;
          frameCount++;

          // yield a tick to avoid locking the UI on very long videos
          if (currentSample % 5 === 0) {
            setTimeout(processFrame, 0);
          } else {
            processFrame();
          }
        } catch (err) {
          // If reading pixels fails for any reason, continue gracefully
          currentSample++;
         if (currentSample < totalSamples) processFrame();
          else {
            URL.revokeObjectURL(video.src);
            resolve(results);
          }
        }
      };

      // start processing
      processFrame();
    };

    video.onerror = () => reject(new Error("Error loading video for analysis"));
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
    
    if (music && musicRef.current) {
      musicRef.current.currentTime = musicStartTime;
      musicRef.current.volume = audioBalance / 100;
      musicRef.current.play();
    }

    if (videoRef.current) {
      videoRef.current.volume = 0;
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
      videoRef.current.volume = (100 - audioBalance) / 100;
      videoRef.current.pause();
    }

    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
  };

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
      setMusicDuration(musicRef.current.duration);
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

  // Timeline interaction
  const handleTimelineMouseDown = (e) => {
    if (!timelineRef.current || !videoRef.current) return;
    setDragState({
      active: true,
      type: 'timeline',
      startX: e.clientX,
      anchorSnapshot: null
    });
    seekToPosition(e);
  };

  const seekToPosition = (e) => {
    if (!timelineRef.current || !videoRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    const time = percent * duration;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Anchor management
  const addAnchor = () => {
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
  };

  const deleteAnchor = (anchorId) => {
    const updated = anchors.filter(a => a.id !== anchorId);
    setAnchors(updated);
    saveToHistory(updated);
    if (selectedAnchor === anchorId) {
      setSelectedAnchor(null);
    }
    if (previewAnchor?.id === anchorId) {
      setPreviewAnchor(null);
    }
  };

  const handleAnchorClick = (e, anchor) => {
    e.stopPropagation();
    setSelectedAnchor(anchor.id);
    setPreviewAnchor(anchor);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = anchor.start;
    }
  };

  const handleAnchorMouseDown = (e, anchor, dragType) => {
    e.stopPropagation();
    setSelectedAnchor(anchor.id);
    setDragState({
      active: true,
      type: dragType,
      startX: e.clientX || e.touches?.[0]?.clientX || 0,
      anchorSnapshot: { ...anchor }
    });
  };

  const handleAnchorTouchStart = (e, anchor, dragType) => {
    e.stopPropagation();
    setSelectedAnchor(anchor.id);
    setDragState({
      active: true,
      type: dragType,
      startX: e.touches[0].clientX,
      anchorSnapshot: { ...anchor }
    });
  };

  // Unified drag effect
  useEffect(() => {
    if (!dragState.active) return;

    let rafId = null;
    let lastClientX = dragState.startX;

    const handleMouseMove = (e) => {
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      if (!clientX) return;
      lastClientX = clientX;

      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(() => {
        processMouseMove(lastClientX);
      });
    };

    const processMouseMove = (clientX) => {
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
        } else if (dragState.type === 'anchor-right') {
          newEnd = Math.max(snapshot.start + 1, Math.min(duration, snapshot.end + deltaTime));
        } else if (dragState.type === 'anchor-move') {
          const anchorDuration = snapshot.end - snapshot.start;
          newStart = Math.max(0, Math.min(duration - anchorDuration, snapshot.start + deltaTime));
          newEnd = newStart + anchorDuration;
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
        }
      }
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      handleMouseMove(e);
    };

    const handleMouseUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (dragState.type.startsWith('anchor-')) {
        saveToHistory(anchors);
      }
      setDragState({ active: false, type: null, startX: 0, anchorSnapshot: null });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragState, anchors, duration, selectedAnchor]);

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
        previewVideoRef.current.play();
      } else {
        previewVideoRef.current.pause();
      }
    }
  };

  const handlePreviewTimeUpdate = () => {
    if (previewVideoRef.current && previewAnchor) {
      const currentTime = previewVideoRef.current.currentTime;
      if (currentTime >= previewAnchor.end) {
        previewVideoRef.current.currentTime = previewAnchor.start;
      }
    }
  };

  // Precision modal handlers
  const openPrecisionModal = (anchor) => {
  const anchorIndex = anchors.findIndex(a => a.id === anchor.id);
  setPrecisionAnchor({ ...anchor, _index: anchorIndex });
  setPrecisionTime(anchor.end);
  setSelectedHandle('end');
  setShowPrecisionModal(true);
  if (precisionVideoRef.current) {
    precisionVideoRef.current.currentTime = anchor.end;
  }
};
const goToPreviousAnchor = () => {
  if (!precisionAnchor || precisionAnchor._index <= 0) return;
  const prevAnchor = anchors[precisionAnchor._index - 1];
  setPrecisionAnchor({ ...prevAnchor, _index: precisionAnchor._index - 1 });
  setPrecisionTime(prevAnchor.end);
  setSelectedHandle('end');
  if (precisionVideoRef.current) {
    precisionVideoRef.current.currentTime = prevAnchor.end;
  }
};

const goToNextAnchor = () => {
  if (!precisionAnchor || precisionAnchor._index >= anchors.length - 1) return;
  const nextAnchor = anchors[precisionAnchor._index + 1];
  setPrecisionAnchor({ ...nextAnchor, _index: precisionAnchor._index + 1 });
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
    setPrecisionDragState({
      active: true,
      type: handleType,
      startX: e.touches[0].clientX,
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
          const newStart = Math.max(
            range.start,
            Math.min(snapshot.end - 1, snapshot.start + deltaTime)
          );
          setPrecisionAnchor(prev => ({ ...snapshot, start: newStart }));
        } else if (precisionDragState.type === 'end') {
          const newEnd = Math.max(
            snapshot.start + 1,
            Math.min(range.end, snapshot.end + deltaTime)
          );
          setPrecisionAnchor(prev => ({ ...snapshot, end: newEnd }));
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
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      if (!clientX) return;

      if (dragState.type === 'precision-timeline') {
        seekToPrecisionPosition(e);
      }
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      handleMouseMove(e);
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
      } else {
        precisionVideoRef.current.currentTime = precisionTime;
        precisionVideoRef.current.play();
      }
      setPrecisionPlaying(!precisionPlaying);
    }
  };

  const handlePrecisionVideoTimeUpdate = () => {
    if (precisionVideoRef.current && precisionAnchor) {
      const currentTime = precisionVideoRef.current.currentTime;
      if (currentTime >= precisionAnchor.end) {
        precisionVideoRef.current.currentTime = precisionAnchor.start;
        setPrecisionTime(precisionAnchor.start);
        if (precisionPlaying) {
          precisionVideoRef.current.play();
        }
      } else {
        setPrecisionTime(currentTime);
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

    // Create clip files
    const clipFiles = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const outputName = `clip_${i}.mp4`;
      const clipDuration = clip.end - clip.start;

      await ffmpeg.exec([
        '-ss', clip.start.toFixed(3),
        '-i', 'input.mp4',
        '-t', clipDuration.toFixed(3),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        outputName
      ]);

      clipFiles.push(outputName);
    }

    // Concatenate clips
    const concatList = clipFiles.map(f => `file '${f}'`).join('\n');
    await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));

    // Add music if present
    if (music) {
      await ffmpeg.writeFile('music.mp3', await fetchFile(music));

      const videoVolume = (100 - audioBalance) / 100;
      const musicVolume = audioBalance / 100;

      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-ss', musicStartTime.toFixed(3),
        '-i', 'music.mp3',
        '-filter_complex',
        `[0:a]volume=${videoVolume}[a0];[1:a]volume=${musicVolume}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        'output.mp4'
      ]);
    } else {
      await ffmpeg.exec([
        '-f', 'concat',
        '-safe', '0',
        '-i', 'concat.txt',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        'output.mp4'
      ]);
    }

    // Export for each selected platform
    for (let i = 0; i < selectedPlatforms.length; i++) {
      const platformKey = selectedPlatforms[i];
      const platform = platforms[platformKey];
      
      setProgress(Math.round(((i + 1) / selectedPlatforms.length) * 100));

      let finalFile = 'output.mp4';

      if (platform.aspect !== 'original') {
        const outputName = `formatted_${platformKey}.mp4`;
        await ffmpeg.exec([
          '-i', 'output.mp4',
          '-vf', `scale=${platform.width}:${platform.height}:force_original_aspect_ratio=decrease,pad=${platform.width}:${platform.height}:(ow-iw)/2:(oh-ih)/2`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'copy',
          outputName
        ]);
        finalFile = outputName;
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
<div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
       <div className="text-center mb-8">
  <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(219,39,119,0.8)] drop-shadow-[0_0_30px_rgba(219,39,119,0.6)] drop-shadow-[0_0_45px_rgba(219,39,119,0.4)]">
    ClipBoost
  </h1>
  <p className="text-gray-300">AI-Powered Video Editor</p>
          {!ffmpegLoaded && (
            <p className="text-sm text-yellow-400 mt-2">Loading video processor...</p>
          )}
          
          {/* Auto-save indicator */}
          {showAutoSaveIndicator && (
            <div className="fixed top-20 right-4 px-3 py-1... z-50">
              ✓ Auto-saved
            </div>
          )}
        </div>
{/* Restore Toast Notification */}
        {showRestoreToast && (
          <div className="fixed top-4 right-4 bg-slate-800 border-2 border-purple-500 rounded-lg shadow-2xl p-4 z-50 max-w-sm">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <div className="font-semibold mb-1">Previous Work Found</div>
                <div className="text-sm text-gray-300 mb-3">
                  Found {restoredAnchorCount} anchor{restoredAnchorCount === 1 ? '' : 's'} from your last session
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={restoreAutoSave}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded text-sm font-semibold transition"
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
        {/* Upload */}
        {!video && (
          <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-12 text-center border border-slate-700">
            <Upload className="w-16 h-16 mx-auto mb-4 text-purple-400" />
            <h2 className="text-2xl font-semibold mb-2">Upload Your Video</h2>
            <p className="text-gray-400 mb-6">Maximum file size: 500 MB</p>
            <label className="inline-block px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold cursor-pointer hover:scale-105 transition-transform">
              Choose Video
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Main Interface */}
        {video && (
          <div className="space-y-6">
            {/* Top Controls - Music & Change Video */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                {/* Music Section */}
                <div className="flex-1 w-full">
                  {!music ? (
                    <div>
                      <label className="block px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition text-center text-sm">
                        🎵 Add Music (Optional)
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={handleMusicUpload}
                          className="hidden"
                        />
                      </label>
                      <p className="text-xs text-gray-400 text-center mt-2">Add music to access volume and timing controls</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">🎵 {music.name}</span>
                        <button
                          onClick={() => {
                            setMusic(null);
                            setMusicUrl(null);
                          }}
                          className="text-gray-400 hover:text-white"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <audio
                        ref={musicRef}
                        src={musicUrl}
                        onLoadedMetadata={handleMusicLoadedMetadata}
                        onEnded={() => setIsMusicPlaying(false)}
                        className="hidden"
                      />
<div>
  <div className="flex justify-between items-center mb-1">
    <label className="text-xs text-gray-300">Audio Balance</label>
    <span className="text-xs flex items-center gap-2">
      <span className="text-blue-400">Video: {100 - audioBalance}%</span>
      <span className="text-gray-500">•</span>
      <span className="text-green-400">Music: {audioBalance}%</span>
    </span>
  </div>
<div className="relative">
  <input
    type="range"
    min="0"
    max="100"
    value={audioBalance}
    onChange={(e) => setAudioBalance(parseInt(e.target.value))}
    className="w-full h-2 rounded-lg appearance-none cursor-pointer"
    style={{
     background: `linear-gradient(to right, rgb(74, 222, 128) 0%, rgb(74, 222, 128) ${audioBalance}%, rgb(96, 165, 250) ${audioBalance}%, rgb(96, 165, 250) 100%)`
    }}
  />
</div>
</div>
                      <div>
  <div className="flex justify-between items-center mb-1">
    <label className="text-xs text-gray-300">Music Start Position</label>
    <span className="text-xs text-gray-400">{formatTime(musicStartTime)}</span>
  </div>
  <div className="relative">
    <input
      type="range"
      min="0"
      max={musicDuration}
      step="0.1"
      value={musicStartTime}
      onChange={(e) => setMusicStartTime(parseFloat(e.target.value))}
      className="w-full h-2 rounded-lg appearance-none cursor-pointer"
      style={{
        background: `linear-gradient(to right, rgb(96, 165, 250) 0%, rgb(96, 165, 250) ${(musicStartTime / musicDuration) * 100}%, rgb(71, 85, 105) ${(musicStartTime / musicDuration) * 100}%, rgb(71, 85, 105) 100%)`
      }}
    />
  </div>
</div>

                      <div className="flex justify-center">
                        <button
                          onClick={toggleMusicPreview}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-2 text-sm"
                        >
                          {isMusicPlaying ? <Pause size={16} /> : <Play size={16} />}
                          {isMusicPlaying ? 'Pause' : 'Preview'} Music
                        </button>
                      </div>
                    </div>
                  )}
                </div>

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
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition text-sm whitespace-nowrap"
                >
                  Change Video
                </button>
              </div>
            </div>

            {/* Video Preview */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
            {/* Preview/Export Buttons - NOW AT TOP */}
  <div className="flex flex-col sm:flex-row gap-3 mb-4">
    <button
      onClick={isPreviewMode ? stopPreviewMode : startPreviewMode}
      disabled={isProcessing || anchors.length === 0}
      className={`flex-1 py-3 rounded-xl font-semibold text-base transition-all ${
        anchors.length === 0
          ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
          : isPreviewMode 
            ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:scale-105'
            : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:scale-105'
      } shadow-lg disabled:hover:scale-100`}
    >
      <span className="flex items-center justify-center gap-2">
        {isPreviewMode ? (
          <>
            <Pause size={18} />
            <span className="hidden sm:inline">Stop Preview</span>
            <span className="sm:hidden">Stop</span>
            <span className="text-sm">{previewAnchorIndex + 1}/{anchors.length}</span>
          </>
        ) : (
          <>
            <Play size={18} />
            <span className="hidden sm:inline">Preview Mode</span>
            <span className="sm:hidden">Preview</span>
          </>
        )}
      </span>
    </button>

    <button
      onClick={() => setShowExportModal(true)}
      disabled={!ffmpegLoaded || isProcessing || isPreviewMode}
      className="flex-1 py-3 rounded-xl font-semibold text-base transition-all relative overflow-hidden bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
    >
{isProcessing ? (
  <div className="flex flex-col items-center gap-1">
    <span>Processing...</span>
    <span className="text-sm">{progress}%</span>
  </div>
) : (
        <span className="flex items-center justify-center gap-2">
          <Download size={18} />
          <span className="hidden sm:inline">Export Video</span>
          <span className="sm:inline md:hidden">Export</span>
        </span>
      )}
    </button>
  </div>
{/* Video Player */}
<div className="aspect-video bg-black rounded-lg overflow-hidden mb-4 relative group w-full">
  <video
    ref={videoRef}
    src={videoUrl}
    className="w-full h-full object-cover"
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
  
{/* Video Scrub Bar with Handle - Hidden during preview */}
{!isPreviewMode && (
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
      const touch = e.touches[0];

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
        scrubVideo(moveEvent.touches[0].clientX);
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
      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all relative pointer-events-none"
      style={{ width: `${(currentTime / duration) * 100}%` }}
    >
      {/* Scrubber Handle */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  </div>
)}
</div>

 {/* Playback Info */}
<div className="text-sm text-gray-300 text-center">
  {formatTime(currentTime)} / {formatTime(duration)}
</div>
            </div>

{/* Timeline */}
<div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
  
<div className="flex flex-wrap items-center gap-3 justify-between mb-4 touch-manipulation">
  {/* Left Group: Undo/Redo/Clear */}
  <div className="flex gap-2">
  <button
    onClick={undo}
    disabled={historyIndex <= 0}
    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
    title="Undo (Ctrl+Z)"
  >
    <RotateCcw size={16} />
    <span className="hidden sm:inline">Undo</span>
  </button>
  <button
    onClick={redo}
    disabled={historyIndex >= history.length - 1}
    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
    title="Redo (Ctrl+Y)"
  >
    <RotateCw size={16} />
    <span className="hidden sm:inline">Redo</span>
  </button>
  <button
    onClick={() => setShowTrimModal(true)}
    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2 text-sm"
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
    className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition flex items-center gap-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
  >
    <Trash2 size={16} />
    <span className="hidden sm:inline">Clear</span>
  </button>
</div>

 {/* Center: DROP ANCHOR - Hero Button */}
<div className="flex justify-center flex-1">
  <button
    onClick={addAnchor}
    disabled={!duration}
    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-xl transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed text-lg font-bold shadow-lg hover:shadow-purple-500/50 hover:scale-105"
    title="Add anchor at current time (Double-click timeline)"
  >
    <Sparkles size={24} />
    <span>Drop Anchor</span>
  </button>
</div>

  {/* Right Group: Target/Auto-Gen/Beat-Sync */}
  <div className="flex items-center gap-3">
    <div className="flex items-center gap-2 bg-slate-700/50 px-3 py-2 rounded-lg">
      <label className="text-sm text-gray-300 whitespace-nowrap">Target:</label>
      <input
        type="range"
        min="15"
        max="120"
        step="5"
        value={targetDuration}
        onChange={(e) => setTargetDuration(parseInt(e.target.value))}
        className="w-24 h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
      />
      <span className="text-sm text-gray-400 w-10">{targetDuration}s</span>
    </div>

    <button
      onClick={async () => {
        if (!video || isAnalyzing) return;
        
        try {
          setIsAnalyzing(true);
          
          // Analyze audio FIRST if beat-sync is enabled
          let musicAnalysisResult = null;
          if (useBeatSync) {
            if (music) {
              musicAnalysisResult = await analyzeMusicStructure(music, musicStartTime, targetDuration);
              setMusicAnalysis(musicAnalysisResult);
            } else if (video) {
              if (!ffmpegLoaded) {
                alert('Video processor not ready yet');
                setIsAnalyzing(false);
                return;
              }
              
              try {
                await ffmpeg.writeFile('temp_video.mp4', await fetchFile(video));
                await ffmpeg.exec(['-i', 'temp_video.mp4', '-vn', '-acodec', 'mp3', 'extracted_audio.mp3']);
                const audioData = await ffmpeg.readFile('extracted_audio.mp3');
                const audioBlob = new Blob([audioData.buffer], { type: 'audio/mp3' });
                
                musicAnalysisResult = await analyzeMusicStructure(audioBlob);
                setMusicAnalysis(musicAnalysisResult);
              } catch (error) {
                console.error('Failed to extract video audio:', error);
                alert('Could not extract audio from video for beat-sync');
                setIsAnalyzing(false);
                return;
              }
            }
          }
          
          const videoAnalysisResult = await analyzeVideo(video);
          setVideoAnalysis(videoAnalysisResult);
          
          let sortedMoments;

          if (musicAnalysisResult?.beatGrid) {
            sortedMoments = videoAnalysisResult.map((moment, index) => ({
              ...moment,
              score: 1.0 - (index * 0.01)
            }));
          } else {
            const scoredMoments = [];
            
            for (const moment of videoAnalysisResult) {
              let score = moment.motionScore * 0.8;
              if (moment.sceneChange) score += 0.6;
              scoredMoments.push({ ...moment, score });
            }
            
            sortedMoments = scoredMoments.sort((a, b) => b.score - a.score);
          }

          const newAnchors = [];
          let totalDuration = 0;

          for (let i = 0; i < sortedMoments.length && totalDuration < targetDuration; i++) {
            const moment = sortedMoments[i];
            
            let clipLength = 2.5;
            
            if (musicAnalysisResult) {
              const nearbyBeat = musicAnalysisResult.moments.find(
                m => Math.abs(m.time - moment.time) < 0.5
              );
              
              if (nearbyBeat?.onPhraseBoundary) {
                clipLength = 4;
              } else if (nearbyBeat && nearbyBeat.strength > 0.7) {
                clipLength = 3;
              }
            }
              
            const start = Math.max(0, moment.time - 0.5);
            const end = Math.min(duration, start + clipLength);
            
            const hasOverlap = newAnchors.some(a =>
              (start >= a.start && start < a.end) ||
              (end > a.start && end <= a.end) ||
              (start <= a.start && end >= a.end)
            );
            
            if (!hasOverlap) {
              newAnchors.push({
                id: Date.now() + i,
                start: start,
                end: end
              });
              totalDuration += (end - start);
            }
          }
          
          let finalAnchors = newAnchors.sort((a, b) => a.start - b.start);

          if (musicAnalysisResult?.beatGrid && finalAnchors.length > 0) {
            const beatGrid = musicAnalysisResult.beatGrid;
            
            finalAnchors = finalAnchors.map(anchor => {
              let nearestStartBeat = beatGrid[0];
              let minStartDiff = Math.abs(anchor.start - beatGrid[0]);
              
              for (const beat of beatGrid) {
                const diff = Math.abs(anchor.start - beat);
                if (diff < minStartDiff) {
                  minStartDiff = diff;
                  nearestStartBeat = beat;
                }
              }
              
              let nearestEndBeat = nearestStartBeat + 2;
              for (const beat of beatGrid) {
                if (beat > nearestStartBeat + 1.5) {
                  const diff = Math.abs(anchor.end - beat);
                  if (diff < Math.abs(anchor.end - nearestEndBeat)) {
                    nearestEndBeat = beat;
                  }
                }
              }
              
              const beatsSpanned = beatGrid.filter(b => b >= nearestStartBeat && b <= nearestEndBeat).length;
              
              if (beatsSpanned >= 6 && beatsSpanned < 8) {
                const targetBeatIndex = beatGrid.indexOf(nearestStartBeat) + 8;
                if (targetBeatIndex < beatGrid.length) {
                  nearestEndBeat = beatGrid[targetBeatIndex];
                }
              }
              
              return {
                ...anchor,
                start: nearestStartBeat,
                end: Math.min(nearestEndBeat, duration)
              };
            });
            
            finalAnchors = finalAnchors.filter((anchor, index) => {
              if (index === 0) return true;
              return anchor.start >= finalAnchors[index - 1].end;
            });
          }

          setAnchors(finalAnchors);
          saveToHistory(finalAnchors);
        } catch (error) {
          console.error('Auto-generate error:', error);
          alert('Error analyzing video');
        } finally {
          setIsAnalyzing(false);
        }
      }}
      disabled={!duration || isAnalyzing}
      className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 rounded-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold shadow-md"
    >
      <Sparkles size={18} />
      <span>{isAnalyzing ? 'Analyzing...' : 'Auto-Generate'}</span>
    </button>

 {music && (
  <label className="flex items-center gap-2 cursor-pointer bg-slate-700/50 px-3 py-2 rounded-lg">
    <input
      type="checkbox"
      checked={useBeatSync}
      onChange={(e) => setUseBeatSync(e.target.checked)}
      className="w-4 h-4 rounded cursor-pointer accent-green-500"
      style={{
        accentColor: 'rgb(34, 197, 94)'
      }}
    />
    <span className="text-sm text-gray-300 whitespace-nowrap">Beat-Sync</span>
  </label>
)}
  </div>
</div>
{/* Timeline visualization */}
<div
  ref={timelineRef}
  onMouseDown={handleTimelineMouseDown}
  onTouchStart={(e) => {
    const touch = e.touches[0];
    handleTimelineMouseDown({ ...e, clientX: touch.clientX });
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
  className="relative h-24 bg-slate-900 rounded-lg cursor-pointer mb-4 hover:ring-2 hover:ring-purple-500/50 transition-all"
  title="Double-click to drop anchor"
>
  {/* Current time indicator */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
                </div>

                {/* Anchors */}
                {anchors.map((anchor, index) => {
                  const isSelected = selectedAnchor === anchor.id;
                  const colors = getAnchorColor(index, isSelected);
                  const width = ((anchor.end - anchor.start) / duration) * 100;

                  return (
                    <div
                      key={anchor.id}
                      className="absolute top-0 bottom-0 z-10"
                      style={{
                        left: `${(anchor.start / duration) * 100}%`,
                        width: `${width}%`
                      }}
                    >
                   <div
  onClick={(e) => handleAnchorClick(e, anchor)}
  onDoubleClick={() => deleteAnchor(anchor.id)}
  onMouseDown={(e) => handleAnchorMouseDown(e, anchor, 'anchor-move')}
  onMouseEnter={() => setHoveredAnchor(anchor)}
  onMouseLeave={() => setHoveredAnchor(null)}
  className={`absolute inset-0 ${colors.bg} border-2 ${colors.border} rounded cursor-move transition`}
>
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold pointer-events-none">
                          {formatTime(anchor.end - anchor.start)}
                        </div>

                        {isSelected && (
                          <>
                            {/* Left handle */}
                            <div
                              onMouseDown={(e) => handleAnchorMouseDown(e, anchor, 'anchor-left')}
                              onTouchStart={(e) => handleAnchorTouchStart(e, anchor, 'anchor-left')}
                              className={`absolute left-0 top-0 bottom-0 w-2 ${colors.handle} cursor-ew-resize hover:opacity-80 -ml-1 z-30`}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {/* Right handle */}
                            <div
                              onMouseDown={(e) => handleAnchorMouseDown(e, anchor, 'anchor-right')}
                              onTouchStart={(e) => handleAnchorTouchStart(e, anchor, 'anchor-right')}
                              className={`absolute right-0 top-0 bottom-0 w-2 ${colors.handle} cursor-ew-resize hover:opacity-80 -mr-1 z-30`}
                              onClick={(e) => e.stopPropagation()}
                            />
                            {/* Precision button */}
                            
                          </>
                        )}
                      </div>

{/* Preview/Hover Panel */}
{(previewAnchor?.id === anchor.id || hoveredAnchor?.id === anchor.id) && (
  <div
    onClick={(e) => e.stopPropagation()}
    onMouseDown={(e) => e.stopPropagation()}
    className="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 bg-slate-800 rounded-lg shadow-2xl border-2 border-purple-500 p-3 z-50 w-64"
  >
    <div className="flex justify-between items-center mb-2">
      <div className="text-xs font-semibold">
        Anchor {index + 1} {previewAnchor?.id === anchor.id ? 'Preview' : 'Hover'}
      </div>
                            <button
                              onClick={() => setPreviewAnchor(null)}
                              className="text-gray-400 hover:text-white"
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
                            />
                          </div>

<div className="space-y-2">
  <div className="flex items-center gap-2">
    <button
      onClick={togglePreviewPlay}
      className="p-2 bg-purple-600 rounded hover:bg-purple-700"
    >
      {previewVideoRef.current?.paused ? <Play size={14} /> : <Pause size={14} />}
    </button>
    <div className="text-xs text-gray-300">
      {formatTime(anchor.end - anchor.start)} loop
    </div>
  </div>
  
  <button
    onClick={(e) => {
      e.stopPropagation();
      openPrecisionModal(anchor);
    }}
    className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-xs flex items-center justify-center gap-2 transition font-semibold"
  >
    <ZoomIn size={14} />
    Open Precision Editor
  </button>
</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="text-xs text-gray-400 text-center mb-4">
                {anchors.length === 0
                  ? 'No anchors: Export will use full video (up to 60s)'
                  : 'Click to preview • Double-click to delete • Drag handles to resize • Drag middle to move • Click "Precision" for zoom'}
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
                  <div className="text-lg font-semibold text-purple-400">
                    {selectedAnchor ? anchors.findIndex(a => a.id === selectedAnchor) + 1 : '-'}
                  </div>
                </div>
              </div>

              {/* Save/Load Anchor Config */}
              <div className="flex gap-2">
                <button
                  onClick={saveConfiguration}
                  disabled={anchors.length === 0}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed text-sm"
                >
                  <Save size={16} />
                  <span className="hidden sm:inline">Save Anchor Config</span>
                  <span className="sm:hidden">Save</span>
                </button>
                <button
                  onClick={() => loadConfigInputRef.current?.click()}
                  className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center justify-center gap-2 text-sm"
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 max-w-6xl w-full max-h-[95vh] overflow-y-auto">
             <div className="space-y-3 mb-4">
  {/* Top Row: Prev/Next Navigation */}
  <div className="flex items-center justify-center gap-4">
    <button
      onClick={goToPreviousAnchor}
      disabled={!precisionAnchor || precisionAnchor._index === 0}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Previous Anchor"
    >
      ← Prev
    </button>
    
    <div className="text-lg font-semibold text-gray-300">
      Anchor {(precisionAnchor?._index || 0) + 1} of {anchors.length}
    </div>
    
    <button
      onClick={goToNextAnchor}
      disabled={!precisionAnchor || precisionAnchor._index >= anchors.length - 1}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
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
                  <div className="text-3xl font-bold text-purple-400">{formatTime(trimEnd - trimStart)}</div>
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
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setShowTrimModal(false)}
                    disabled={isProcessing}
                    className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyTrim}
                    disabled={isProcessing || (trimEnd - trimStart) < 2}
                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 rounded-lg font-semibold transition disabled:opacity-50 disabled:hover:scale-100"
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="space-y-4 mb-6">
  {/* Top Row: Prev/Next Navigation */}
  <div className="flex items-center justify-center gap-4">
    <button
      onClick={goToPreviousAnchor}
      disabled={!precisionAnchor || precisionAnchor._index === 0}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
      title="Previous Anchor"
    >
      ← Prev
    </button>
    
    <div className="text-lg font-semibold text-gray-300">
      Anchor {(precisionAnchor?._index || 0) + 1} of {anchors.length}
    </div>
    
    <button
      onClick={goToNextAnchor}
      disabled={!precisionAnchor || precisionAnchor._index >= anchors.length - 1}
      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
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

              {/* Video Preview */}
              <div className="bg-black rounded-lg overflow-hidden mb-4">
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
    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-white font-semibold shadow-md"
  >
    ← Frame
  </button>

  <button
    onClick={togglePrecisionPlay}
    className="p-4 bg-purple-600 rounded-full hover:bg-purple-700 transition shadow-lg"
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
    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition text-white font-semibold shadow-md"
  >
    Frame →
  </button>
</div>

<p className="text-xs text-gray-400 text-center mb-4">
  Click START or END to switch • Hold frame buttons to scrub quickly
</p>

              {/* Time Display */}
              <div className="text-center mb-4">
                <div className="text-2xl font-mono bg-slate-900 rounded-lg px-4 py-2 inline-block">
                  {formatTime(precisionTime)}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Dynamic viewport based on anchor length
                </div>
              </div>

{/* Precision Timeline */}
<div className="relative mb-6">
  <div
    ref={precisionTimelineRef}
    onMouseDown={handlePrecisionTimelineMouseDown}
    className="relative h-24 bg-slate-900 rounded-lg cursor-pointer border-2 border-slate-600"
  >
                  {/* Current time indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                    style={{
                      left: `${((precisionTime - getPrecisionRange(precisionAnchor).start) / (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start)) * 100}%`
                    }}
                  >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
                  </div>

                  {/* Anchor visualization */}
                  <div
                    className="absolute top-2 bottom-2 bg-purple-500/30 border-2 border-purple-500 rounded z-10"
                    style={{
                      left: `${((precisionAnchor.start - getPrecisionRange(precisionAnchor).start) / (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start)) * 100}%`,
                      width: `${((precisionAnchor.end - precisionAnchor.start) / (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start)) * 100}%`
                    }}
                  >
                    {/* Start handle */}
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
                      className={`absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize transition -ml-1 z-30 ${
                        selectedHandle === 'start' 
                          ? 'bg-green-400 shadow-lg shadow-green-400/50' 
                          : 'bg-green-500 hover:bg-green-400'
                      }`}
                    />

                    {/* End handle */}
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
                      className={`absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize transition -mr-1 z-30 ${
                        selectedHandle === 'end' 
                          ? 'bg-red-400 shadow-lg shadow-red-400/50' 
                          : 'bg-red-500 hover:bg-red-400'
                      }`}
                    />

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

              {/* Anchor Details */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">Start Time</div>
                  <div className="text-lg font-mono text-green-400">{formatTime(precisionAnchor.start)}</div>
                </div>
                <div className="bg-slate-900/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">End Time</div>
                  <div className="text-lg font-mono text-red-400">{formatTime(precisionAnchor.end)}</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowPrecisionModal(false)}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={applyPrecisionChanges}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 rounded-lg font-semibold transition"
                >
                  Apply Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Platform Modal */}
{/* Export Platform Modal */}
{showExportModal && (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-lg w-full mx-4">
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
            className="w-5 h-5 rounded border-2 border-purple-500 bg-slate-800 checked:bg-white checked:border-purple-500 focus:ring-2 focus:ring-purple-500 cursor-pointer"/>
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
          className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 rounded-lg font-semibold transition disabled:opacity-50 disabled:hover:scale-100"
        >
          Export {selectedPlatforms.length > 1 ? `(${selectedPlatforms.length})` : ''}
        </button>
      </div>
    </div>
  </div>
)}
      </div>
    </div>
  );
};

export default ClipBoost;