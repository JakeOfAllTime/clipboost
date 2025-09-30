import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Trash2, Sparkles, Music as MusicIcon, Download, Scissors, X, ZoomIn } from 'lucide-react';
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

  // Precision modal state
  const [showPrecisionModal, setShowPrecisionModal] = useState(false);
  const [precisionAnchor, setPrecisionAnchor] = useState(null);
  const [precisionTime, setPrecisionTime] = useState(0);
  const [precisionPlaying, setPrecisionPlaying] = useState(false);

  // Unified drag state
  const [dragState, setDragState] = useState({
    active: false,
    type: null,
    startX: 0,
    anchorSnapshot: null
  });

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);

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

  // Platform configurations
  const platforms = {
    original: { name: 'Original', aspect: 'original', color: 'from-slate-700 to-slate-900' },
    tiktok: { name: 'TikTok', aspect: '9:16', color: 'from-black to-gray-800' },
    instagram: { name: 'Instagram Reels', aspect: '9:16', color: 'from-pink-500 to-purple-600' },
    youtube: { name: 'YouTube Shorts', aspect: '9:16', color: 'from-red-500 to-red-700' }
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
    setSelectedAnchor(null);
    setPreviewAnchor(null);
    setCurrentTime(0);
    setMusic(null);
    setMusicUrl(null);
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
    
    // Start music if available
    if (music && musicRef.current) {
      musicRef.current.currentTime = musicStartTime;
      musicRef.current.volume = audioBalance / 100;
      musicRef.current.play();
    }

    // Start video at first anchor, mute original audio
    if (videoRef.current) {
      videoRef.current.volume = 0; // Mute original video audio during preview
      videoRef.current.currentTime = anchors[0].start;
      videoRef.current.play();
    }
  };

  const stopPreviewMode = () => {
    setIsPreviewMode(false);
    setPreviewAnchorIndex(0);
    
    // Stop music
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.currentTime = musicStartTime;
    }

    // Restore video audio
    if (videoRef.current) {
      videoRef.current.volume = (100 - audioBalance) / 100;
      videoRef.current.pause();
    }

    if (previewIntervalRef.current) {
      clearInterval(previewIntervalRef.current);
      previewIntervalRef.current = null;
    }
  };

  // Preview mode effect - handles anchor jumping
  useEffect(() => {
    if (!isPreviewMode || anchors.length === 0) return;

    const checkAndJump = () => {
      if (!videoRef.current) return;
      
      const currentAnchor = anchors[previewAnchorIndex];
      if (!currentAnchor) return;

      const currentTime = videoRef.current.currentTime;

      // If we've reached the end of current anchor
      if (currentTime >= currentAnchor.end) {
        const nextIndex = previewAnchorIndex + 1;
        
        // If there's another anchor, jump to it
        if (nextIndex < anchors.length) {
          setPreviewAnchorIndex(nextIndex);
          videoRef.current.currentTime = anchors[nextIndex].start;
        } else {
          // Finished all anchors, stop preview
          stopPreviewMode();
        }
      }
    };

    // Check every 100ms for smooth transitions
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

  // Timeline interaction - FIXED drag calculation
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
    setSelectedAnchor(newAnchor.id);
  };

  const deleteAnchor = (anchorId) => {
    setAnchors(anchors.filter(a => a.id !== anchorId));
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

  // FIXED: Unified drag effect with requestAnimationFrame for smooth performance
  useEffect(() => {
    if (!dragState.active) return;

    let rafId = null;
    let lastClientX = dragState.startX;

    const handleMouseMove = (e) => {
      const clientX = e.clientX || e.touches?.[0]?.clientX;
      if (!clientX) return;
      lastClientX = clientX;

      // Cancel previous frame request
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      // Schedule update for next frame
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
      } else if (dragState.type === 'precision-timeline') {
        if (precisionTimelineRef.current && precisionAnchor) {
          const rect = precisionTimelineRef.current.getBoundingClientRect();
          const x = clientX - rect.left;
          const percent = Math.max(0, Math.min(1, x / rect.width));
          const range = getPrecisionRange(precisionAnchor);
          const time = range.start + (percent * (range.end - range.start));
          setPrecisionTime(time);
          if (precisionVideoRef.current) {
            precisionVideoRef.current.currentTime = time;
          }
        }
      } else if (dragState.type.startsWith('anchor-')) {
        const snapshot = dragState.anchorSnapshot;
        if (!snapshot) return;

        const isPrecision = showPrecisionModal;
        const rect = isPrecision 
          ? precisionTimelineRef.current?.getBoundingClientRect()
          : timelineRef.current?.getBoundingClientRect();
        
        if (!rect) return;

        const deltaX = clientX - dragState.startX;
        
        let deltaTime;
        if (isPrecision) {
          const range = getPrecisionRange(snapshot);
          deltaTime = (deltaX / rect.width) * (range.end - range.start);
        } else {
          deltaTime = (deltaX / rect.width) * duration;
        }

        let newStart = snapshot.start;
        let newEnd = snapshot.end;

        if (dragState.type === 'anchor-left') {
          newStart = Math.max(0, Math.min(snapshot.end - 1, snapshot.start + deltaTime));
          if (isPrecision) {
            const range = getPrecisionRange(snapshot);
            newStart = Math.max(range.start, newStart);
          }
        } else if (dragState.type === 'anchor-right') {
          newEnd = Math.max(snapshot.start + 1, Math.min(duration, snapshot.end + deltaTime));
          if (isPrecision) {
            const range = getPrecisionRange(snapshot);
            newEnd = Math.min(range.end, newEnd);
          }
        } else if (dragState.type === 'anchor-move') {
          const anchorDuration = snapshot.end - snapshot.start;
          newStart = Math.max(0, Math.min(duration - anchorDuration, snapshot.start + deltaTime));
          newEnd = newStart + anchorDuration;
        }

        if (isPrecision) {
          if (dragState.type === 'anchor-left') {
            // Directly update the actual anchor in main array
            const updated = anchors.map(a =>
              a.id === selectedAnchor ? { ...a, start: newStart } : a
            );
            setAnchors(updated);
          } else if (dragState.type === 'anchor-right') {
            // Directly update the actual anchor in main array
            const updated = anchors.map(a =>
              a.id === selectedAnchor ? { ...a, end: newEnd } : a
            );
            setAnchors(updated);
          }
        } else {
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
  }, [dragState, anchors, duration, selectedAnchor, showPrecisionModal, precisionAnchor]);

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

  // Precision modal handlers - isolated state
  const openPrecisionModal = (anchor) => {
    setPrecisionAnchor({ ...anchor }); // Create isolated copy
    setPrecisionTime(anchor.start);
    setShowPrecisionModal(true);
  };

  const getPrecisionRange = (anchor) => {
    // Fixed 60-second viewport centered on anchor
    const viewportDuration = 60;
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

  // Separate precision drag state - completely isolated
  const [precisionDragState, setPrecisionDragState] = useState({
    active: false,
    type: null,
    startX: 0,
    startAnchor: null
  });

  const handlePrecisionHandleMouseDown = (e, handleType) => {
    e.stopPropagation();
    const clientX = e.clientX || e.touches?.[0]?.clientX || 0;
    setPrecisionDragState({
      active: true,
      type: handleType, // 'start' or 'end'
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

    } catch (error) {
      console.error('Trim error:', error);
      alert('Error trimming video');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // Export processing
  const exportVideo = async (platformKey) => {
    if (!ffmpegLoaded || !video) return;

    setIsProcessing(true);
    setProgress(0);
    setShowExportModal(false);

    try {
      await ffmpeg.writeFile('input.mp4', await fetchFile(video));

      // Generate clip plan
      let clips = [];
      if (anchors.length > 0) {
        clips = anchors.map(a => ({ start: a.start, end: a.end }));
      } else {
        clips = [{ start: 0, end: Math.min(60, duration) }];
      }

      // Extract clips - OPTIMIZED: seek before input for speed
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

      // Mix with music if present
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

      // Apply platform formatting
      const platform = platforms[platformKey];
      let finalFile = 'output.mp4';

      if (platform.aspect === '9:16') {
        await ffmpeg.exec([
          '-i', 'output.mp4',
          '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'copy',
          'formatted.mp4'
        ]);
        finalFile = 'formatted.mp4';
      }

      // Download
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

      setProgress(100);
      setTimeout(() => setProgress(0), 1000);

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
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [video, selectedAnchor, currentTime, duration, isPlaying]);

  // Calculate stats
  const anchorTime = anchors.reduce((sum, a) => sum + (a.end - a.start), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            ClipBoost
          </h1>
          <p className="text-gray-300">AI-Powered Video Editor</p>
          {!ffmpegLoaded && (
            <p className="text-sm text-yellow-400 mt-2">Loading video processor...</p>
          )}
        </div>

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
            {/* Video Preview */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Video Preview</h3>
                <button
                  onClick={() => {
                    if (videoUrl) URL.revokeObjectURL(videoUrl);
                    setVideo(null);
                    setVideoUrl(null);
                    setAnchors([]);
                    setMusic(null);
                    setMusicUrl(null);
                  }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
                >
                  Change Video
                </button>
              </div>

              <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={handleLoadedMetadata}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlay}
                  className="p-3 bg-purple-600 rounded-full hover:bg-purple-700 transition"
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>
                <div className="text-sm text-gray-300">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Timeline</h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowTrimModal(true)}
                    className="px-3 py-2 md:px-4 bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2 text-sm"
                  >
                    <Scissors size={16} />
                    <span className="hidden sm:inline">Trim</span>
                  </button>
                  <button
                    onClick={addAnchor}
                    disabled={!duration}
                    className="px-3 py-2 md:px-4 bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    <Sparkles size={16} />
                    <span className="hidden sm:inline">Add Anchor</span>
                  </button>
                  {anchors.length > 0 && (
                    <button
                      onClick={() => {
                        if (confirm('Remove all anchors?')) {
                          setAnchors([]);
                          setSelectedAnchor(null);
                          setPreviewAnchor(null);
                        }
                      }}
                      className="px-3 py-2 md:px-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-2 text-sm"
                    >
                      <Trash2 size={16} />
                      <span className="hidden sm:inline">Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Timeline visualization */}
              <div
                ref={timelineRef}
                onMouseDown={handleTimelineMouseDown}
                className="relative h-24 bg-slate-900 rounded-lg cursor-pointer mb-4"
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
                            {/* Precision button - smart positioning to avoid overlap */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openPrecisionModal(anchor);
                              }}
                              className={`absolute ${anchor.start / duration > 0.8 ? 'top-full mt-2' : 'bottom-full mb-2'} left-1/2 -translate-x-1/2 bg-purple-600 hover:bg-purple-700 rounded px-2 py-1 text-xs flex items-center gap-1 transition z-30 whitespace-nowrap`}
                            >
                              <ZoomIn size={12} />
                              Precision
                            </button>
                          </>
                        )}
                      </div>

                      {/* Preview Panel */}
                      {previewAnchor?.id === anchor.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 bg-slate-800 rounded-lg shadow-2xl border-2 border-purple-500 p-3 z-50 w-64"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-xs font-semibold">Anchor {index + 1} Preview</div>
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
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-gray-400 text-xs">Total Anchors</div>
                  <div className="text-lg font-semibold text-white">{formatTime(anchorTime)}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-gray-400 text-xs">Video Duration</div>
                  <div className="text-lg font-semibold text-blue-400">{formatTime(duration)}</div>
                </div>
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-gray-400 text-xs">Selected</div>
                  <div className="text-lg font-semibold text-purple-400">
                    {selectedAnchor ? anchors.findIndex(a => a.id === selectedAnchor) + 1 : '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Music */}
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <MusicIcon size={20} />
                Music (Optional)
              </h3>

              <label className="inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition mb-4">
                {music ? `📁 ${music.name}` : '🎵 Choose Music'}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMusicUpload}
                  className="hidden"
                />
              </label>

              {music && (
                <div className="space-y-4">
                  <audio
                    ref={musicRef}
                    src={musicUrl}
                    onLoadedMetadata={handleMusicLoadedMetadata}
                    onEnded={() => setIsMusicPlaying(false)}
                    className="hidden"
                  />

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300">Audio Balance</label>
                      <span className="text-xs text-gray-400">
                        Video: {100 - audioBalance}% • Music: {audioBalance}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={audioBalance}
                      onChange={(e) => setAudioBalance(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300">Music Start Position</label>
                      <span className="text-xs text-gray-400">{formatTime(musicStartTime)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={musicDuration}
                      step="0.1"
                      value={musicStartTime}
                      onChange={(e) => setMusicStartTime(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <button
                      onClick={toggleMusicPreview}
                      className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-2"
                    >
                      {isMusicPlaying ? <Pause size={16} /> : <Play size={16} />}
                      {isMusicPlaying ? 'Pause' : 'Preview'} Music
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Export Button */}
            <div className="flex flex-col sm:flex-row gap-3">
              {anchors.length > 0 && (
                <button
                  onClick={isPreviewMode ? stopPreviewMode : startPreviewMode}
                  disabled={isProcessing}
                  className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all ${
                    isPreviewMode 
                      ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:scale-105'
                      : 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:scale-105'
                  } shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                >
                  <span className="flex items-center justify-center gap-2">
                    {isPreviewMode ? (
                      <>
                        <Pause size={20} />
                        <span className="hidden sm:inline">Stop Preview</span>
                        <span className="sm:hidden">Stop</span>
                        <span className="text-sm">{previewAnchorIndex + 1}/{anchors.length}</span>
                      </>
                    ) : (
                      <>
                        <Play size={20} />
                        <span className="hidden sm:inline">Preview Mode</span>
                        <span className="sm:hidden">Preview</span>
                      </>
                    )}
                  </span>
                </button>
              )}

              <button
                onClick={() => setShowExportModal(true)}
                disabled={!ffmpegLoaded || isProcessing || isPreviewMode}
                className={`${anchors.length > 0 ? 'flex-1' : 'w-full'} py-4 rounded-xl font-bold text-lg transition-all relative overflow-hidden bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-1">
                    <span>Processing...</span>
                    <span className="text-sm">{progress}%</span>
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Download size={20} />
                    <span className="hidden sm:inline">Export Video</span>
                    <span className="sm:inline md:hidden">Export</span>
                  </span>
                )}
              </button>
            </div>

            {/* Keyboard Shortcuts Help */}
            <div className="bg-slate-800/30 rounded-lg p-4 text-xs text-gray-400">
              <div className="font-semibold mb-2">Keyboard Shortcuts:</div>
              <div className="grid grid-cols-2 gap-2">
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">Space</kbd> Play/Pause</div>
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">←/→</kbd> Skip 1s</div>
                <div><kbd className="bg-slate-700 px-2 py-1 rounded">Delete</kbd> Remove selected anchor</div>
              </div>
            </div>
          </div>
        )}

        {/* Trim Modal */}
        {showTrimModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-2xl w-full mx-4">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold flex items-center gap-2">
                  <Scissors size={24} />
                  Trim Video
                </h3>
                <button
                  onClick={() => setShowTrimModal(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={24} />
                </button>
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
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold flex items-center gap-3">
                  <ZoomIn size={24} />
                  Precision Timeline
                </h3>
                <button
                  onClick={() => setShowPrecisionModal(false)}
                  className="text-gray-400 hover:text-white p-2"
                >
                  <X size={24} />
                </button>
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
              <div className="flex items-center justify-center gap-4 mb-4">
                <button
                  onMouseDown={() => {
                    if (!precisionVideoRef.current) return;
                    precisionVideoRef.current.currentTime -= 1/30;
                    setPrecisionTime(precisionVideoRef.current.currentTime);
                    
                    const interval = setInterval(() => {
                      if (precisionVideoRef.current) {
                        precisionVideoRef.current.currentTime -= 1/30;
                        setPrecisionTime(precisionVideoRef.current.currentTime);
                      }
                    }, 100);
                    
                    const cleanup = () => clearInterval(interval);
                    document.addEventListener('mouseup', cleanup, { once: true });
                  }}
                  className="p-2 bg-slate-700 rounded hover:bg-slate-600 transition"
                >
                  ← Frame
                </button>

                <button
                  onClick={togglePrecisionPlay}
                  className="p-3 bg-purple-600 rounded-full hover:bg-purple-700 transition"
                >
                  {precisionPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>

                <button
                  onMouseDown={() => {
                    if (!precisionVideoRef.current) return;
                    precisionVideoRef.current.currentTime += 1/30;
                    setPrecisionTime(precisionVideoRef.current.currentTime);
                    
                    const interval = setInterval(() => {
                      if (precisionVideoRef.current) {
                        precisionVideoRef.current.currentTime += 1/30;
                        setPrecisionTime(precisionVideoRef.current.currentTime);
                      }
                    }, 100);
                    
                    const cleanup = () => clearInterval(interval);
                    document.addEventListener('mouseup', cleanup, { once: true });
                  }}
                  className="p-2 bg-slate-700 rounded hover:bg-slate-600 transition"
                >
                  Frame →
                </button>

                <div className="text-sm text-gray-300">
                  {precisionPlaying ? 'Playing' : 'Paused'} • Loops anchor segment
                </div>
              </div>

              {/* Time Display */}
              <div className="text-center mb-4">
                <div className="text-2xl font-mono bg-slate-900 rounded-lg px-4 py-2 inline-block">
                  {formatTime(precisionTime)}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Showing ±30s around anchor
                </div>
              </div>

              {/* Precision Timeline */}
              <div className="relative mb-6">
                <div
                  ref={precisionTimelineRef}
                  onMouseDown={handlePrecisionTimelineMouseDown}
                  className="relative h-20 bg-slate-900 rounded-lg cursor-pointer mb-4 border border-slate-600"
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
                      className="absolute left-0 top-0 bottom-0 w-2 bg-green-500 cursor-ew-resize hover:bg-green-400 transition -ml-1 z-30"
                      onClick={(e) => e.stopPropagation()}
                    />

                    {/* End handle */}
                    <div
                      onMouseDown={(e) => handlePrecisionHandleMouseDown(e, 'end')}
                      onTouchStart={(e) => handlePrecisionHandleTouchStart(e, 'end')}
                      className="absolute right-0 top-0 bottom-0 w-2 bg-red-500 cursor-ew-resize hover:bg-red-400 transition -mr-1 z-30"
                      onClick={(e) => e.stopPropagation()}
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
        {showExportModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 max-w-md mx-4">
              <h3 className="text-xl font-semibold mb-4">Choose Platform</h3>

              <div className="space-y-3 mb-4">
                {Object.entries(platforms).map(([key, platform]) => (
                  <button
                    key={key}
                    onClick={() => exportVideo(key)}
                    className={`w-full px-6 py-4 bg-gradient-to-r ${platform.color} rounded-lg font-semibold hover:scale-105 transition text-center`}
                  >
                    <div className="text-lg">{platform.name}</div>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setShowExportModal(false)}
                className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClipBoost;