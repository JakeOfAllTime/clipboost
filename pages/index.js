import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Trash2, Sparkles, Music as MusicIcon, X, Download, ZoomIn, Scissors } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

const ClipBoost = () => {
  // Core state
  const [video, setVideo] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [music, setMusic] = useState(null);
  const [musicUrl, setMusicUrl] = useState(null);
  const [audioBalance, setAudioBalance] = useState(70);
  const [musicStartTime, setMusicStartTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  
  const musicRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedPlatform, setSelectedPlatform] = useState('tiktok');
  const [customDuration, setCustomDuration] = useState(null);
  
    // Trim feature state
  const [showTrimInterface, setShowTrimInterface] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isTrimming, setIsTrimming] = useState(false);
  const [originalVideo, setOriginalVideo] = useState(null);
  const [originalVideoUrl, setOriginalVideoUrl] = useState(null);
  const [originalDuration, setOriginalDuration] = useState(0);
  // FFmpeg state
  const [ffmpeg, setFFmpeg] = useState(null);
  const [ffmpegLoaded, setFFmpegLoaded] = useState(false);
  const [loadingFFmpeg, setLoadingFFmpeg] = useState(true);
  
  // Anchor state
  const [anchors, setAnchors] = useState([]);
  const [selectedAnchor, setSelectedAnchor] = useState(null);
  const [previewAnchor, setPreviewAnchor] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTime, setDragStartTime] = useState(0);
  const [dragStartAnchor, setDragStartAnchor] = useState(null);
  
  // Timeline interaction
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  
  // Preview player state
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  
  // Generated clips state
  const [generatedClips, setGeneratedClips] = useState([]);
  const [expandedClip, setExpandedClip] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [exportingClip, setExportingClip] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  
  // Precision Timeline Modal state
  const [showPrecisionModal, setShowPrecisionModal] = useState(false);
  const [precisionAnchor, setPrecisionAnchor] = useState(null);
  const [precisionTime, setPrecisionTime] = useState(0);
  const [isDraggingPrecision, setIsDraggingPrecision] = useState(false);
  const [precisionPlaying, setPrecisionPlaying] = useState(false);
  const videoRef = useRef(null);
  const previewVideoRef = useRef(null);
  const precisionVideoRef = useRef(null);
  const timelineRef = useRef(null);
  const precisionTimelineRef = useRef(null);
  const ffmpegRef = useRef(null);
  const [precisionDragType, setPrecisionDragType] = useState(null); // 'handle' or 'timeline'
  const platforms = {
    original: { name: 'Original', duration: 90, minDuration: 15, aspect: 'original', color: 'from-slate-700 to-slate-900' },
    tiktok: { name: 'TikTok', duration: 60, minDuration: 15, aspect: '9:16', color: 'from-black to-gray-800' },
    instagram: { name: 'Instagram Reels', duration: 90, minDuration: 15, aspect: '9:16', color: 'from-pink-500 to-purple-600' },
    youtube: { name: 'YouTube Shorts', duration: 60, minDuration: 15, aspect: '16:9', color: 'from-red-500 to-red-700' }
  };

  // Load FFmpeg on component mount
  useEffect(() => {
    const loadFFmpeg = async () => {
      try {
        const ffmpegInstance = new FFmpeg();
        ffmpegRef.current = ffmpegInstance;
        
        ffmpegInstance.on('log', ({ message }) => {
          console.log(message);
        });
        
        ffmpegInstance.on('progress', ({ progress: prog }) => {
          setProgress(Math.min(100, Math.round(prog * 100)));
        });

        await ffmpegInstance.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        });
        
        setFFmpeg(ffmpegInstance);
        setFFmpegLoaded(true);
        setLoadingFFmpeg(false);
        console.log('FFmpeg loaded successfully');
      } catch (error) {
        console.error('Failed to load FFmpeg:', error);
        setLoadingFFmpeg(false);
      }
    };

    loadFFmpeg();
  }, []);

  const getTargetDuration = () => {
    const targetDur = customDuration !== null ? customDuration : platforms[selectedPlatform].duration;
    return Math.min(targetDur, duration || targetDur);
  };

  const handleVideoUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const maxSize = 500 * 1024 * 1024;
  if (file.size > maxSize) {
    alert(`File too large! Maximum size is 500 MB. Your file is ${(file.size / 1024 / 1024).toFixed(2)} MB.`);
    return;
  }
  
  // Store original video
  setOriginalVideo(file);
  const url = URL.createObjectURL(file);
  setOriginalVideoUrl(url);
  setVideoUrl(url);
  setVideo(file);
  
  // Reset state
  setAnchors([]);
  setSelectedAnchor(null);
  setPreviewAnchor(null);
  setCurrentTime(0);
  setCustomDuration(null);
  setMusic(null);
  setMusicUrl(null);
  setAudioBalance(70);
  setMusicStartTime(0);
  setShowTrimInterface(false);
  setTrimStart(0);
  setTrimEnd(0);
};

  const handleChangeVideo = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    if (musicUrl) {
      URL.revokeObjectURL(musicUrl);
    }
    setVideo(null);
    setVideoUrl(null);
    setAnchors([]);
    setSelectedAnchor(null);
    setPreviewAnchor(null);
    setCurrentTime(0);
    setDuration(0);
    setCustomDuration(null);
    setMusic(null);
    setMusicUrl(null);
    setAudioBalance(70);
    setMusicStartTime(0);
    setIsPlaying(false);
  };

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

  const handleMusicScrub = (e) => {
    if (!musicRef.current || !musicDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const time = percent * musicDuration;
    setMusicStartTime(time);
    if (musicRef.current) {
      musicRef.current.currentTime = time;
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

const handleLoadedMetadata = () => {
  if (videoRef.current) {
    const dur = videoRef.current.duration;
    setDuration(dur);
    setOriginalDuration(dur);
    setTrimStart(0);
    setTrimEnd(dur);
  }
};

  const handleTimelineMouseDown = (e) => {
    if (!timelineRef.current || !videoRef.current) return;
    setIsTimelineDragging(true);
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

  useEffect(() => {
    if (!isTimelineDragging) return;

    const handleMouseMove = (e) => {
      seekToPosition(e);
    };

    const handleMouseUp = () => {
      setIsTimelineDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isTimelineDragging, duration]);

  const handleTimelineMouseMove = (e) => {
    if (!timelineRef.current || isDragging || isTimelineDragging || previewAnchor) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration;
    setHoverTime(time);
  };

  const handleTimelineMouseLeave = () => {
    setHoverTime(null);
  };

  const reassignAnchorTypes = (anchorList) => {
    if (anchorList.length === 0) return [];
    if (anchorList.length === 1) return [{ ...anchorList[0], type: 'start' }];
    
    return anchorList.map((anchor, idx) => {
      if (idx === 0) return { ...anchor, type: 'start' };
      if (idx === anchorList.length - 1) return { ...anchor, type: 'end' };
      return { ...anchor, type: 'middle', middleIndex: idx };
    });
  };

  const addAnchor = () => {
    if (!duration) return;
    
    const newAnchorId = Date.now();
    const newAnchor = {
      id: newAnchorId,
      type: 'start',
      start: currentTime,
      end: Math.min(currentTime + 1, duration),
    };
    
    const hasOverlap = anchors.some(a => 
      (newAnchor.start >= a.start && newAnchor.start < a.end) ||
      (newAnchor.end > a.start && newAnchor.end <= a.end) ||
      (newAnchor.start <= a.start && newAnchor.end >= a.end)
    );
    
    if (hasOverlap) {
      alert('Anchor overlaps with existing anchor. Please choose a different position.');
      return;
    }
    
    const updated = [...anchors, newAnchor].sort((a, b) => a.start - b.start);
    setAnchors(reassignAnchorTypes(updated));
    setSelectedAnchor(newAnchorId);
  };

  const handleAnchorClick = (e, anchor) => {
    e.stopPropagation();
    setSelectedAnchor(anchor.id);
    setPreviewAnchor(anchor);
    setPreviewTime(0);
    setPreviewPlaying(false);
  };

  const handleAnchorDoubleClick = (e, anchor) => {
    e.stopPropagation();
    
    if (anchor.type === 'start' && anchors.length > 1) {
      const hasEnd = anchors.some(a => a.type === 'end');
      if (hasEnd) {
        alert('Cannot delete START anchor while END anchor exists. Delete END first.');
        return;
      }
    }
    
    const updated = anchors.filter(a => a.id !== anchor.id);
    setAnchors(reassignAnchorTypes(updated));
    setSelectedAnchor(null);
    setPreviewAnchor(null);
  };

  const clearAllAnchors = () => {
    if (anchors.length > 0 && confirm('Remove all anchors?')) {
      setAnchors([]);
      setSelectedAnchor(null);
      setPreviewAnchor(null);
    }
  };

  const handleHandleClick = (e, anchor, edge) => {
    e.stopPropagation();
    if (videoRef.current) {
      const time = edge === 'left' ? anchor.start : anchor.end;
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleMouseDown = (e, anchor, dragMode) => {
    e.stopPropagation();
    setIsDragging(true);
    setDragType(dragMode);
    setDragStartX(e.clientX);
    setSelectedAnchor(anchor.id);
    
    if (dragMode === 'move') {
      setDragStartAnchor({ start: anchor.start, end: anchor.end });
    } else {
      setDragStartTime(dragMode === 'left' ? anchor.start : anchor.end);
    }
  };

  useEffect(() => {
    if (!isDragging || !timelineRef.current || !selectedAnchor) return;

    const handleMouseMove = (e) => {
      const rect = timelineRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartX;
      const deltaTime = (deltaX / rect.width) * duration;
      
      const anchor = anchors.find(a => a.id === selectedAnchor);
      if (!anchor) return;

      let newStart = anchor.start;
      let newEnd = anchor.end;

      if (dragType === 'move') {
        const anchorDuration = dragStartAnchor.end - dragStartAnchor.start;
        newStart = Math.max(0, Math.min(duration - anchorDuration, dragStartAnchor.start + deltaTime));
        newEnd = newStart + anchorDuration;

        const otherAnchors = anchors.filter(a => a.id !== selectedAnchor);
        for (const other of otherAnchors) {
          if (newStart < other.end && newEnd > other.start) {
            if (deltaTime > 0) {
              newStart = other.start - anchorDuration;
              newEnd = other.start;
            } else {
              newStart = other.end;
              newEnd = other.end + anchorDuration;
            }
            break;
          }
        }
      } else if (dragType === 'left') {
        newStart = Math.max(0, Math.min(duration, dragStartTime + deltaTime));
        if (newEnd - newStart < 1) newStart = newEnd - 1;
      } else if (dragType === 'right') {
        newEnd = Math.max(0, Math.min(duration, dragStartTime + deltaTime));
        if (newEnd - newStart < 1) newEnd = newStart + 1;
      }

      if (dragType !== 'move') {
        const otherAnchors = anchors.filter(a => a.id !== selectedAnchor);
        const wouldOverlap = otherAnchors.some(a => 
          (newStart >= a.start && newStart < a.end) ||
          (newEnd > a.start && newEnd <= a.end) ||
          (newStart <= a.start && newEnd >= a.end)
        );
        if (wouldOverlap) return;
      }

      const updated = anchors.map(a => 
        a.id === selectedAnchor 
          ? { ...a, start: newStart, end: newEnd }
          : a
      ).sort((a, b) => a.start - b.start);

      setAnchors(reassignAnchorTypes(updated));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragType(null);
      setDragStartAnchor(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragType, dragStartX, dragStartTime, dragStartAnchor, selectedAnchor, anchors, duration]);

  // Precision Timeline Functions
  const openPrecisionModal = (anchor) => {
    setPrecisionAnchor({ ...anchor });
    setPrecisionTime(anchor.start);
    setShowPrecisionModal(true);
  };

const handlePrecisionTimelineMouseDown = (e) => {
  if (!precisionTimelineRef.current) return;
  setPrecisionDragType('timeline');
  setIsDraggingPrecision(true);
  seekToPrecisionPosition(e);
};
  const seekToPrecisionPosition = (e) => {
    if (!precisionTimelineRef.current || !precisionAnchor) return;
    const rect = precisionTimelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    
    const detailRange = getPrecisionRange(precisionAnchor);
    const time = detailRange.start + (percent * (detailRange.end - detailRange.start));
    
    setPrecisionTime(time);
    if (precisionVideoRef.current) {
      precisionVideoRef.current.currentTime = time;
    }
  };

  const getPrecisionRange = (anchor) => {
    const bufferTime = 30;
    return {
      start: Math.max(0, anchor.start - bufferTime),
      end: Math.min(duration, anchor.start + bufferTime)
    };
  };

const handlePrecisionHandleMouseDown = (e, handleType) => {
  console.log('Handle mousedown triggered!', handleType); // ADD THIS
  e.stopPropagation();
  setPrecisionDragType('handle');
  setIsDraggingPrecision(true);
  
  const updatePrecisionAnchor = (e) => {
    console.log('Updating anchor position'); // ADD THIS TOO
    if (!precisionTimelineRef.current) return;
    const rect = precisionTimelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    
    const detailRange = getPrecisionRange(precisionAnchor);
    const time = detailRange.start + (percent * (detailRange.end - detailRange.start));
    
    if (handleType === 'start') {
      const newStart = Math.max(0, Math.min(time, precisionAnchor.end - 1));
      setPrecisionAnchor(prev => ({ ...prev, start: newStart }));
    } else {
      const newEnd = Math.max(precisionAnchor.start + 1, Math.min(duration, time));
      setPrecisionAnchor(prev => ({ ...prev, end: newEnd }));
    }
  };

  const handleMouseMove = (e) => updatePrecisionAnchor(e);
  const handleMouseUp = () => {
    setIsDraggingPrecision(false);
    setPrecisionDragType(null);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
};

useEffect(() => {
  if (!isDraggingPrecision || precisionDragType !== 'timeline') return;

  const handleMouseMove = (e) => {
    seekToPrecisionPosition(e);
  };

  const handleMouseUp = () => {
    setIsDraggingPrecision(false);
    setPrecisionDragType(null);
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);

  return () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
}, [isDraggingPrecision, precisionDragType, precisionAnchor]);
  const applyPrecisionChanges = () => {
    const updated = anchors.map(a => 
      a.id === precisionAnchor.id 
        ? { ...a, start: precisionAnchor.start, end: precisionAnchor.end }
        : a
    ).sort((a, b) => a.start - b.start);

    setAnchors(reassignAnchorTypes(updated));
    setShowPrecisionModal(false);
    setPrecisionAnchor(null);
  };

  const togglePreviewPlay = () => {
    if (previewVideoRef.current && previewAnchor) {
      if (previewPlaying) {
        previewVideoRef.current.pause();
      } else {
        previewVideoRef.current.currentTime = previewAnchor.start + previewTime;
        previewVideoRef.current.play();
      }
      setPreviewPlaying(!previewPlaying);
    }
  };

  const handlePreviewTimeUpdate = () => {
    if (previewVideoRef.current && previewAnchor) {
      const absoluteTime = previewVideoRef.current.currentTime;
      const relativeTime = absoluteTime - previewAnchor.start;
      
      if (absoluteTime >= previewAnchor.end) {
        previewVideoRef.current.currentTime = previewAnchor.start;
        setPreviewTime(0);
        if (!previewPlaying) {
          previewVideoRef.current.pause();
        }
      } else {
        setPreviewTime(relativeTime);
      }
    }
  };

  const handlePreviewScrub = (e) => {
    if (!previewAnchor || !previewVideoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    const anchorDuration = previewAnchor.end - previewAnchor.start;
    const newTime = percent * anchorDuration;
    setPreviewTime(newTime);
    previewVideoRef.current.currentTime = previewAnchor.start + newTime;
  };

  useEffect(() => {
    if (!isDraggingPreview) return;

    const handleMouseMove = (e) => {
      const scrubBar = document.getElementById('preview-scrub-bar');
      if (!scrubBar || !previewAnchor || !previewVideoRef.current) return;
      
      const rect = scrubBar.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percent = x / rect.width;
      const anchorDuration = previewAnchor.end - previewAnchor.start;
      const newTime = percent * anchorDuration;
      setPreviewTime(newTime);
      previewVideoRef.current.currentTime = previewAnchor.start + newTime;
    };

    const handleMouseUp = () => {
      setIsDraggingPreview(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPreview, previewAnchor]);
  // Auto-update preview when anchors change
  useEffect(() => {
    if (previewAnchor && selectedAnchor) {
      const updatedAnchor = anchors.find(a => a.id === selectedAnchor);
      if (updatedAnchor && (
        updatedAnchor.start !== previewAnchor.start || 
        updatedAnchor.end !== previewAnchor.end
      )) {
        setPreviewAnchor(updatedAnchor);
        setPreviewTime(0);
        if (previewVideoRef.current) {
          previewVideoRef.current.currentTime = updatedAnchor.start;
        }
      }
    }
  }, [anchors, selectedAnchor, previewAnchor]);


  // Precision modal play/pause with loop
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
      
      // Loop back to start when reaching the end
      if (currentTime >= precisionAnchor.end) {
        precisionVideoRef.current.currentTime = precisionAnchor.start;
        setPrecisionTime(precisionAnchor.start);
        
        // Continue playing if it was playing
        if (precisionPlaying) {
          precisionVideoRef.current.play();
        }
      } else {
        setPrecisionTime(currentTime);
      }
    }
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!video) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 1);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 1);
        }
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && selectedAnchor) {
        e.preventDefault();
        const anchor = anchors.find(a => a.id === selectedAnchor);
        if (anchor) {
          if (anchor.type === 'start' && anchors.length > 1) {
            const hasEnd = anchors.some(a => a.type === 'end');
            if (hasEnd) {
              alert('Cannot delete START anchor while END anchor exists. Delete END first.');
              return;
            }
          }
          const updated = anchors.filter(a => a.id !== selectedAnchor);
          setAnchors(reassignAnchorTypes(updated));
          setSelectedAnchor(null);
          setPreviewAnchor(null);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [video, selectedAnchor, anchors, duration, isPlaying]);

  const getAnchorColor = (type, isSelected) => {
    const colors = {
      start: isSelected ? 'bg-green-400/40 border-green-400' : 'bg-green-400/20 border-green-400/70',
      end: isSelected ? 'bg-red-400/40 border-red-400' : 'bg-red-400/20 border-red-400/70',
      middle: isSelected ? 'bg-blue-400/40 border-blue-400' : 'bg-blue-400/20 border-blue-400/70',
    };
    return colors[type] || 'bg-gray-400/20 border-gray-400';
  };

  const getHandleColor = (type) => {
    const colors = {
      start: 'bg-green-400',
      end: 'bg-red-400',
      middle: 'bg-blue-400',
    };
    return colors[type] || 'bg-gray-400';
  };

  const getLineColor = (type) => {
    const colors = {
      start: 'border-green-400',
      end: 'border-red-400',
      middle: 'border-blue-400',
    };
    return colors[type] || 'border-gray-400';
  };

  const getAnchorLabel = (anchor) => {
    if (anchor.type === 'start') return 'START';
    if (anchor.type === 'end') return 'END';
    return `MID ${anchor.middleIndex}`;
  };

  const canAddAnchor = () => {
    if (!duration) return false;
    const usedTime = anchors.reduce((sum, a) => sum + (a.end - a.start), 0);
    const available = duration - usedTime;
    return available >= 2;
  };

  const formatTime = (seconds) => {
    if (seconds == null || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStats = () => {
    const anchorTime = anchors.reduce((sum, a) => sum + (a.end - a.start), 0);
    const targetDuration = getTargetDuration();
    const remaining = Math.max(0, targetDuration - anchorTime);
    return { anchorTime, targetDuration, remaining };
  };

  const stats = getStats();

  const generateClipPlan = () => {
    const targetDuration = getTargetDuration();
    const BUFFER_SECONDS = 2;
    
    if (anchors.length === 0) {
      const availableTime = Math.min(duration, targetDuration);
      const clipLengths = [2, 3, 4];
      const clips = [];
      let totalTime = 0;
      let position = 0;
      
      while (totalTime < availableTime && position < duration) {
        const clipLength = clipLengths[Math.floor(Math.random() * clipLengths.length)];
        const actualLength = Math.min(clipLength, availableTime - totalTime, duration - position);
        
        if (actualLength < 1) break;
        
        clips.push({ 
          start: position, 
          end: position + actualLength, 
          type: 'generated' 
        });
        
        totalTime += actualLength;
        position += actualLength;
      }
      
      if (clips.length > 0 && totalTime < availableTime) {
        const shortfall = availableTime - totalTime;
        clips[clips.length - 1].end += Math.min(shortfall, duration - clips[clips.length - 1].end);
      }
      
      return clips;
    }
    
    const sortedAnchors = [...anchors].sort((a, b) => a.start - b.start);
    const anchorTime = sortedAnchors.reduce((sum, a) => sum + (a.end - a.start), 0);
    const timeToFill = Math.max(0, targetDuration - anchorTime);
    
    if (timeToFill === 0) {
      return sortedAnchors.map(a => ({ ...a, type: 'anchor' }));
    }
    
    const availableZones = [];
    
    for (let i = 0; i < sortedAnchors.length - 1; i++) {
      const gapStart = sortedAnchors[i].end + BUFFER_SECONDS;
      const gapEnd = sortedAnchors[i + 1].start - BUFFER_SECONDS;
      
      if (gapEnd - gapStart >= 2) {
        availableZones.push({ start: gapStart, end: gapEnd });
      }
    }
    
    const lastAnchor = sortedAnchors[sortedAnchors.length - 1];
    if (lastAnchor.type !== 'end' && lastAnchor.end + BUFFER_SECONDS < duration) {
      availableZones.push({ 
        start: lastAnchor.end + BUFFER_SECONDS, 
        end: duration 
      });
    }
    
    const generatedClips = [];
    let remainingTime = timeToFill;
    const clipLengths = [2, 3, 4];
    let attempts = 0;
    const maxAttempts = availableZones.length * 50;
    
    while (remainingTime > 1 && availableZones.length > 0 && attempts < maxAttempts) {
      attempts++;
      const zone = availableZones[Math.floor(Math.random() * availableZones.length)];
      const zoneDuration = zone.end - zone.start;
      
      if (zoneDuration >= 2) {
        const clipLength = clipLengths[Math.floor(Math.random() * clipLengths.length)];
        const actualLength = Math.min(clipLength, remainingTime, zoneDuration);
        
        const maxStartPos = zone.end - actualLength;
        const clipStart = zone.start + Math.random() * Math.max(0, maxStartPos - zone.start);
        
        const wouldOverlap = generatedClips.some(c => 
          (clipStart >= c.start && clipStart < c.end) ||
          (clipStart + actualLength > c.start && clipStart + actualLength <= c.end) ||
          (clipStart <= c.start && clipStart + actualLength >= c.end)
        );
        
        if (!wouldOverlap) {
          generatedClips.push({
            start: clipStart,
            end: clipStart + actualLength,
            type: 'generated'
          });
          
          remainingTime -= actualLength;
        }
      }
    }
    
    if (generatedClips.length > 0 && remainingTime > 0.5) {
      const lastClip = generatedClips[generatedClips.length - 1];
      const lastClipZone = availableZones.find(z => lastClip.start >= z.start && lastClip.end <= z.end);
      if (lastClipZone) {
        const possibleExtension = Math.min(remainingTime, lastClipZone.end - lastClip.end);
        lastClip.end += possibleExtension;
      }
    }
    
    const allClips = [
      ...sortedAnchors.map(a => ({ ...a, type: 'anchor' })),
      ...generatedClips
    ].sort((a, b) => a.start - b.start);
    
    return allClips;
  };

  const processVideo = async () => {
    if (!ffmpegLoaded) {
      alert('Video processor is still loading. Please wait a moment and try again.');
      return;
    }

    if (generatedClips.length >= 12) {
      setShowConfirmDialog(true);
      return;
    }

    await executeProcessing();
  };

  const executeProcessing = async () => {
    setIsProcessing(true);
    setProgress(0);
    
    try {
      const clipPlan = generateClipPlan();
      console.log('Processing clip plan:', clipPlan);
      
      setProgress(5);
      await ffmpeg.writeFile('input.mp4', await fetchFile(video));
      
      const clipFiles = [];
      for (let i = 0; i < clipPlan.length; i++) {
        const clip = clipPlan[i];
        const outputName = `clip_${i}.mp4`;
        
        await ffmpeg.exec([
          '-i', 'input.mp4',
          '-ss', clip.start.toFixed(3),
          '-to', clip.end.toFixed(3),
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-c:a', 'aac',
          '-avoid_negative_ts', 'make_zero',
          outputName
        ]);
        
        clipFiles.push(outputName);
        const clipProgress = Math.round(5 + ((i + 1) / clipPlan.length) * 45);
        setProgress(clipProgress);
      }
      
      const concatList = clipFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatList));
      
      setProgress(55);
      
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 85) return prev + 1;
          return prev;
        });
      }, 100);
      
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
          '-c', 'copy',
          'output.mp4'
        ]);
      }
      
      clearInterval(progressInterval);
      setProgress(90);
      
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const actualDuration = clipPlan.reduce((sum, c) => sum + (c.end - c.start), 0);
      
      const newClip = {
        id: Date.now(),
        blob: blob,
        url: url,
        platform: selectedPlatform,
        platformName: platforms[selectedPlatform].name,
        duration: actualDuration,
        timestamp: new Date().toLocaleTimeString(),
        clipCount: clipPlan.length
      };
      
      setGeneratedClips(prev => {
        const updated = [...prev, newClip];
        if (updated.length > 12) {
          URL.revokeObjectURL(updated[0].url);
          return updated.slice(1);
        }
        return updated;
      });
      
      setProgress(100);
      
    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing video: ' + (error.message || 'Unknown error occurred'));
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const downloadClip = (clip) => {
    setExportingClip(clip);
    setShowExportModal(true);
  };

  const exportToPlatform = async (clip, targetPlatform) => {
    setExportProgress(0);
    
    try {
      const platform = platforms[targetPlatform];
      
      await ffmpeg.writeFile('original.mp4', await fetchFile(clip.url));
      
      if (platform.aspect === 'original') {
        const a = document.createElement('a');
        a.href = clip.url;
        a.download = `clipboost_original_${clip.id}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setShowExportModal(false);
        setExportingClip(null);
        return;
      }
      
      setExportProgress(20);
      
      let scaleFilter = '';
      if (platform.aspect === '9:16') {
        scaleFilter = 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
      } else if (platform.aspect === '16:9') {
        scaleFilter = 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2';
      }
      
      setExportProgress(40);
      
      await ffmpeg.exec([
        '-i', 'original.mp4',
        '-vf', scaleFilter,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-c:a', 'copy',
        'exported.mp4'
      ]);
      
      setExportProgress(80);
      
      const data = await ffmpeg.readFile('exported.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `clipboost_${targetPlatform}_${clip.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExportProgress(100);
      setTimeout(() => {
        setShowExportModal(false);
        setExportingClip(null);
        setExportProgress(0);
      }, 500);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting video: ' + (error.message || 'Unknown error occurred'));
      setShowExportModal(false);
      setExportingClip(null);
      setExportProgress(0);
    }
  };

  const deleteClip = (clipId) => {
    setGeneratedClips(prev => {
      const clip = prev.find(c => c.id === clipId);
      if (clip) {
        URL.revokeObjectURL(clip.url);
      }
      return prev.filter(c => c.id !== clipId);
    });
    if (expandedClip === clipId) {
      setExpandedClip(null);
    }
  };

  const canGenerate = video !== null && ffmpegLoaded;

  const handleDurationEdit = () => {
    const newDuration = prompt(
      `Enter target duration (${platforms[selectedPlatform].minDuration}s - ${Math.min(platforms[selectedPlatform].duration, duration)}s):`,
      getTargetDuration()
    );
    
    if (newDuration !== null) {
      const parsed = parseInt(newDuration);
      const min = platforms[selectedPlatform].minDuration;
      const max = Math.min(platforms[selectedPlatform].duration, duration);
      
      if (parsed >= min && parsed <= max) {
        setCustomDuration(parsed);
      } else {
        alert(`Duration must be between ${min}s and ${max}s`);
      }
    }
  };
const openTrimInterface = () => {
  setShowTrimInterface(true);
  setTrimStart(0);
  setTrimEnd(duration);
};

const applyTrim = async () => {
  if (!ffmpegLoaded || !originalVideo) {
    alert('Video processor not ready');
    return;
  }

  if (trimEnd - trimStart < 2) {
    alert('Trimmed video must be at least 2 seconds long');
    return;
  }

  setIsTrimming(true);
  setProgress(0);

  try {
    await ffmpeg.writeFile('original.mp4', await fetchFile(originalVideo));
    
    setProgress(30);
    
    await ffmpeg.exec([
      '-i', 'original.mp4',
      '-ss', trimStart.toFixed(3),
      '-to', trimEnd.toFixed(3),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      'trimmed.mp4'
    ]);
    
    setProgress(70);
    
    const data = await ffmpeg.readFile('trimmed.mp4');
    const blob = new Blob([data.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    
    // Clean up old trimmed video URL if it exists
    if (videoUrl && videoUrl !== originalVideoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setVideo(blob);
    setVideoUrl(url);
    setShowTrimInterface(false);
    setCurrentTime(0);
    
    setProgress(100);
    setTimeout(() => setProgress(0), 500);
    
  } catch (error) {
    console.error('Trim error:', error);
    alert('Error trimming video: ' + (error.message || 'Unknown error'));
  } finally {
    setIsTrimming(false);
  }
};

const cancelTrim = () => {
  setShowTrimInterface(false);
  setTrimStart(0);
  setTrimEnd(duration);
};

const resetToOriginal = () => {
  if (videoUrl && videoUrl !== originalVideoUrl) {
    URL.revokeObjectURL(videoUrl);
  }
  setVideo(originalVideo);
  setVideoUrl(originalVideoUrl);
  setDuration(originalDuration);
  setAnchors([]);
  setSelectedAnchor(null);
  setPreviewAnchor(null);
  setCurrentTime(0);
  setShowTrimInterface(false);
};
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            ClipBoost
          </h1>
          <p className="text-gray-300">AI-Powered Video Editor for Social Media</p>
          {loadingFFmpeg && (
            <p className="text-sm text-yellow-400 mt-2">Loading video processor...</p>
          )}
          {!loadingFFmpeg && !ffmpegLoaded && (
            <p className="text-sm text-red-400 mt-2">Failed to load video processor. Please refresh.</p>
          )}
        </div>

        <div className="flex gap-4 justify-center mb-8">
          {Object.entries(platforms).map(([key, platform]) => (
            <button
              key={key}
              onClick={() => {
                setSelectedPlatform(key);
                setCustomDuration(null);
              }}
              className={`px-6 py-3 rounded-lg font-semibold transition-all ${
                selectedPlatform === key
                  ? `bg-gradient-to-r ${platform.color} shadow-lg scale-105`
                  : 'bg-slate-800 hover:bg-slate-700'
              }`}
            >
              {platform.name}
              <div className="text-xs text-gray-300">{platform.duration}s max</div>
            </button>
          ))}
        </div>

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

        {video && (
          <div className="space-y-6">
            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-semibold">Video Preview</h3>
                  <div className="flex gap-2">
                    {videoUrl !== originalVideoUrl && (
                      <button
                        onClick={resetToOriginal}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-2 text-sm"
                      >
                        Reset to Original
                      </button>
                    )}
                    <button
                      onClick={openTrimInterface}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-2 text-sm"
                    >
                      <Scissors size={16} />
                      Trim Video
                    </button>
                    <button
                      onClick={handleChangeVideo}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-2 text-sm"
                    >
                      <Upload size={16} />
                      Change Video
                    </button>
                  </div>
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

            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Timeline</h3>
                <div className="flex gap-2">
                  <button
                    onClick={addAnchor}
                    disabled={!canAddAnchor()}
                    className={`px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2 ${
                      canAddAnchor()
                        ? 'bg-purple-600 hover:bg-purple-700'
                        : 'bg-slate-700 text-gray-500 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles size={16} />
                    Add Anchor
                  </button>
                  {anchors.length > 0 && (
                    <button
                      onClick={clearAllAnchors}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <div
                  ref={timelineRef}
                  onMouseDown={handleTimelineMouseDown}
                  onMouseMove={handleTimelineMouseMove}
                  onMouseLeave={handleTimelineMouseLeave}
                  className="relative h-24 bg-slate-900 rounded-lg cursor-pointer overflow-visible mb-2"
                >
                  {hoverTime !== null && (
                    <div
                      className="absolute -top-8 transform -translate-x-1/2 bg-slate-700 px-2 py-1 rounded text-xs pointer-events-none z-30"
                      style={{ left: `${(hoverTime / duration) * 100}%` }}
                    >
                      {formatTime(hoverTime)}
                    </div>
                  )}

                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                    style={{ left: `${(currentTime / duration) * 100}%` }}
                  >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
                  </div>

                  {anchors.map(anchor => {
                    const isSelected = selectedAnchor === anchor.id;
                    const anchorWidth = ((anchor.end - anchor.start) / duration) * 100;
                    
                    return (
                      <div key={anchor.id} className="absolute top-0 bottom-0 z-10" style={{ left: `${(anchor.start / duration) * 100}%`, width: `${anchorWidth}%` }}>
                        <div
                          onClick={(e) => handleAnchorClick(e, anchor)}
                          onDoubleClick={(e) => handleAnchorDoubleClick(e, anchor)}
                          onMouseDown={(e) => handleMouseDown(e, anchor, 'move')}
                          className={`absolute inset-0 border-2 rounded ${getAnchorColor(anchor.type, isSelected)} cursor-move transition ${
                            isSelected ? 'shadow-lg' : 'hover:opacity-80'
                          }`}
                        >
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-xs font-semibold pointer-events-none">
                            <div>{getAnchorLabel(anchor)}</div>
                            <div className="text-[10px] opacity-70">
                              {formatTime(anchor.end - anchor.start)}
                            </div>
                          </div>

                          {isSelected && (
                            <>
                              <div className="absolute left-0 top-0 bottom-0 -translate-x-full flex items-center pointer-events-none">
                                <div
                                  onClick={(e) => handleHandleClick(e, anchor, 'left')}
                                  onMouseDown={(e) => handleMouseDown(e, anchor, 'left')}
                                  className={`w-4 h-4 ${getHandleColor(anchor.type)} rounded-full cursor-ew-resize hover:scale-125 transition shadow-lg pointer-events-auto z-30`}
                                />
                                <div className={`w-3 h-0.5 ${getLineColor(anchor.type)}`} style={{ borderTopWidth: '2px' }} />
                              </div>

                              <div className="absolute right-0 top-0 bottom-0 translate-x-full flex items-center pointer-events-none">
                                <div className={`w-3 h-0.5 ${getLineColor(anchor.type)}`} style={{ borderTopWidth: '2px' }} />
                                <div
                                  onClick={(e) => handleHandleClick(e, anchor, 'right')}
                                  onMouseDown={(e) => handleMouseDown(e, anchor, 'right')}
                                  className={`w-4 h-4 ${getHandleColor(anchor.type)} rounded-full cursor-ew-resize hover:scale-125 transition shadow-lg pointer-events-auto z-30`}
                                />
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPrecisionModal(anchor);
                                }}
                                className="absolute -top-8 left-1/2 -translate-x-1/2 bg-purple-600 hover:bg-purple-700 rounded px-2 py-1 text-xs flex items-center gap-1 transition"
                              >
                                <ZoomIn size={12} />
                                Precision
                              </button>
                            </>
                          )}
                        </div>

                        {previewAnchor?.id === anchor.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="absolute bottom-full mb-6 left-1/2 -translate-x-1/2 bg-slate-800 rounded-lg shadow-2xl border-2 border-purple-500 p-3 z-50 w-64"
                          >
                            <div className="flex justify-between items-center mb-2">
                              <div className="text-xs font-semibold">{getAnchorLabel(anchor)} Preview</div>
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
                              />
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                              <button
                                onClick={togglePreviewPlay}
                                className="p-2 bg-purple-600 rounded hover:bg-purple-700"
                              >
                                {previewPlaying ? <Pause size={14} /> : <Play size={14} />}
                              </button>
                              <div className="text-xs text-gray-300">
                                {formatTime(previewTime)} / {formatTime(anchor.end - anchor.start)}
                              </div>
                            </div>

                            <div
                              id="preview-scrub-bar"
                              onMouseDown={(e) => {
                                e.stopPropagation();
                                setIsDraggingPreview(true);
                                handlePreviewScrub(e);
                              }}
                              className="h-2 bg-slate-700 rounded cursor-pointer relative"
                            >
                              <div
                                className="absolute top-0 left-0 h-full bg-purple-500 rounded pointer-events-none"
                                style={{ width: `${(previewTime / (anchor.end - anchor.start)) * 100}%` }}
                              />
                              <div
                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg pointer-events-none"
                                style={{ left: `${(previewTime / (anchor.end - anchor.start)) * 100}%`, marginLeft: '-6px' }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-xs text-gray-400 text-center">
                  {anchors.length === 0 
                    ? 'No anchors: ClipBoost will generate from entire video' 
                    : 'Click anchor for preview • Double-click to delete • Drag handles to resize • Drag middle to move • Click "Precision" for exact timing'}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
                {selectedAnchor && anchors.find(a => a.id === selectedAnchor) && (() => {
                  const anchor = anchors.find(a => a.id === selectedAnchor);
                  const colorClass = anchor.type === 'start' ? 'text-green-400' : anchor.type === 'end' ? 'text-red-400' : 'text-blue-400';
                  return (
                    <div className="bg-slate-900/50 p-3 rounded-lg">
                      <div className="text-gray-400 text-xs">{getAnchorLabel(anchor)}</div>
                      <div className={`text-lg font-semibold ${colorClass}`}>{formatTime(anchor.end - anchor.start)}</div>
                    </div>
                  );
                })()}
                
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-gray-400 text-xs">Total Anchors</div>
                  <div className="text-lg font-semibold text-white">{formatTime(stats.anchorTime)}</div>
                </div>
                
                <div className="bg-slate-900/50 p-3 rounded-lg cursor-pointer hover:bg-slate-900" onClick={handleDurationEdit}>
                  <div className="text-gray-400 text-xs">Target Duration ✏️</div>
                  <div className="text-lg font-semibold text-blue-400">{formatTime(stats.targetDuration)}</div>
                </div>
                
                <div className="bg-slate-900/50 p-3 rounded-lg">
                  <div className="text-gray-400 text-xs">To Fill</div>
                  <div className="text-lg font-semibold text-purple-400">{formatTime(stats.remaining)}</div>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <MusicIcon size={20} />
                Music (Optional)
              </h3>
              
              <label className="inline-block px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg cursor-pointer transition mb-4">
                {music ? `📁 ${music.name}` : '🎵 Choose Music Track'}
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMusicUpload}
                  className="hidden"
                />
              </label>

              {music && (
                <div className="mt-4 space-y-4">
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
                    <div className="relative">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={audioBalance}
                        onChange={(e) => setAudioBalance(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, 
                            rgba(139, 92, 246, 0.7) 0%, 
                            rgba(139, 92, 246, 0.7) ${audioBalance}%, 
                            rgba(236, 72, 153, 0.7) ${audioBalance}%, 
                            rgba(236, 72, 153, 0.7) 100%)`
                        }}
                      />
                      <div className="flex justify-between text-xs text-gray-400 mt-1">
                        <span>Original Audio</span>
                        <span>Music</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-gray-300">Music Start Position</label>
                      <span className="text-xs text-gray-400">{formatTime(musicStartTime)}</span>
                    </div>
                    <div
                      onClick={handleMusicScrub}
                      className="h-12 bg-slate-700 rounded-lg cursor-pointer relative overflow-hidden"
                    >
                      <div
                        className="absolute top-0 left-0 h-full bg-purple-500/30"
                        style={{ width: `${(musicStartTime / musicDuration) * 100}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-1 h-8 bg-purple-400"
                        style={{ left: `${(musicStartTime / musicDuration) * 100}%` }}
                      />
                    </div>
                    <button
                      onClick={toggleMusicPreview}
                      className="mt-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition flex items-center gap-2"
                    >
                      {isMusicPlaying ? <Pause size={16} /> : <Play size={16} />}
                      {isMusicPlaying ? 'Pause Preview' : 'Preview Music'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={processVideo}
              disabled={!canGenerate || isProcessing}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all overflow-hidden relative ${
                !canGenerate || isProcessing
                  ? 'bg-slate-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 shadow-lg'
              }`}
            >
              {isProcessing && (
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              )}
              <span className="relative z-10">
                {isProcessing 
                  ? (
                    <div className="flex flex-col items-center gap-1">
                      <span>{processingStage || 'Processing...'}</span>
                      <span className="text-sm">{progress}%</span>
                    </div>
                  )
                  : canGenerate 
                    ? 'Generate ClipBoost Video' 
                    : 'Upload a video to begin'}
              </span>
            </button>

            {generatedClips.length > 0 && (
              <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 border border-slate-700">
                <h3 className="text-xl font-semibold mb-4">Generated Clips ({generatedClips.length}/12)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {generatedClips.map(clip => (
                    <div key={clip.id} className="relative">
                      {expandedClip === clip.id ? (
                        <div className="bg-slate-900 rounded-lg p-4 border-2 border-purple-500">
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-sm font-semibold">{clip.platformName}</div>
                            <button
                              onClick={() => setExpandedClip(null)}
                              className="text-gray-400 hover:text-white"
                            >
                              <X size={16} />
                            </button>
                          </div>
                          
                          <div className="bg-black rounded overflow-hidden mb-3">
                            <video
                              src={clip.url}
                              controls
                              className="w-full"
                            />
                          </div>

                          <div className="text-xs text-gray-400 mb-3">
                            <div>Duration: {formatTime(clip.duration)}</div>
                            <div>Clips: {clip.clipCount}</div>
                            <div>Generated: {clip.timestamp}</div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => downloadClip(clip)}
                              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg hover:scale-105 transition flex items-center justify-center gap-2"
                            >
                              <Download size={16} />
                              Export
                            </button>
                            <button
                              onClick={() => deleteClip(clip.id)}
                              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => setExpandedClip(clip.id)}
                          className="bg-slate-900 rounded-lg overflow-hidden cursor-pointer hover:border-purple-500 border-2 border-transparent transition"
                        >
                          <div className="aspect-video bg-black relative">
                            <video src={clip.url} className="w-full h-full object-contain" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Play size={48} className="text-white opacity-80" />
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-semibold mb-1">{clip.platformName}</div>
                            <div className="text-xs text-gray-400">{formatTime(clip.duration)} • {clip.timestamp}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Precision Timeline Modal */}
        {showPrecisionModal && precisionAnchor && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-slate-800/95 to-purple-900/95 p-8 rounded-2xl border border-purple-500/50 max-w-4xl mx-4 shadow-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold flex items-center gap-3">
                  <ZoomIn size={24} />
                  Precision Timeline - {getAnchorLabel(precisionAnchor)}
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

              {/* Video Controls */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <button
                  onClick={togglePrecisionPlay}
                  className="p-3 bg-purple-600 rounded-full hover:bg-purple-700 transition"
                >
                  {precisionPlaying ? <Pause size={20} /> : <Play size={20} />}
                </button>
                <div className="text-sm text-gray-300">
                  {precisionPlaying ? 'Playing' : 'Paused'} • Loop: {getAnchorLabel(precisionAnchor)}
                </div>
              </div>

              {/* Time Display */}
              <div className="text-center mb-4">
                <div className="text-2xl font-mono bg-slate-800 rounded-lg px-4 py-2 inline-block">
                  {formatTime(precisionTime)}
                </div>
                <div className="text-sm text-gray-400 mt-1">
                  Range: {formatTime(getPrecisionRange(precisionAnchor).start)} - {formatTime(getPrecisionRange(precisionAnchor).end)}
                </div>
              </div>

              {/* Precision Timeline */}
              <div className="relative mb-6">
                <div className="text-sm text-gray-400 mb-2">
                  Precision Timeline (±30 seconds around anchor)
                </div>
                <div
                  ref={precisionTimelineRef}
                  onMouseDown={handlePrecisionTimelineMouseDown}
                  className="relative h-20 bg-slate-900 rounded-lg cursor-pointer mb-4"
                >
                  {/* Timeline background */}
                  <div className="absolute inset-0 rounded-lg border border-slate-600" />
                  
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
                      className="absolute left-0 top-0 bottom-0 w-2 bg-green-500 cursor-ew-resize hover:bg-green-400 transition"
                      style={{ marginLeft: '-4px' }}
                    />
                    
                    {/* End handle */}
                    <div
                      onMouseDown={(e) => handlePrecisionHandleMouseDown(e, 'end')}
                      className="absolute right-0 top-0 bottom-0 w-2 bg-red-500 cursor-ew-resize hover:bg-red-400 transition"
                      style={{ marginRight: '-4px' }}
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
                  <span>{formatTime(getPrecisionRange(precisionAnchor).start + (getPrecisionRange(precisionAnchor).end - getPrecisionRange(precisionAnchor).start) / 2)}</span>
                  <span>{formatTime(getPrecisionRange(precisionAnchor).end)}</span>
                </div>
              </div>

              {/* Anchor Details */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">Start Time</div>
                  <div className="text-lg font-mono text-green-400">{formatTime(precisionAnchor.start)}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">End Time</div>
                  <div className="text-lg font-mono text-red-400">{formatTime(precisionAnchor.end)}</div>
                </div>
              </div>

              {/* Controls */}
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

        {/* Export Modal */}
        {showExportModal && exportingClip && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-slate-800/95 to-purple-900/95 p-8 rounded-2xl border border-purple-500/50 max-w-md mx-4 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4">Export Video</h3>
              
              {exportProgress > 0 ? (
                <div className="text-center">
                  <p className="text-gray-300 mb-4">Exporting... {exportProgress}%</p>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                      style={{ width: `${exportProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => exportToPlatform(exportingClip, 'tiktok')}
                    className="w-full px-6 py-3 bg-gradient-to-r from-black to-gray-800 rounded-lg font-semibold hover:scale-105 transition"
                  >
                    TikTok (9:16)
                  </button>
                  <button
                    onClick={() => exportToPlatform(exportingClip, 'instagram')}
                    className="w-full px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 rounded-lg font-semibold hover:scale-105 transition"
                  >
                    Instagram Reels (9:16)
                  </button>
                  <button
                    onClick={() => exportToPlatform(exportingClip, 'youtube')}
                    className="w-full px-6 py-3 bg-gradient-to-r from-red-500 to-red-700 rounded-lg font-semibold hover:scale-105 transition"
                  >
                    YouTube Shorts (16:9)
                  </button>
                  <button
                    onClick={() => exportToPlatform(exportingClip, 'original')}
                    className="w-full px-6 py-3 bg-gradient-to-r from-slate-700 to-slate-900 rounded-lg font-semibold hover:scale-105 transition"
                  >
                    Original (No conversion)
                  </button>
                  <button
                    onClick={() => {
                      setShowExportModal(false);
                      setExportingClip(null);
                    }}
                    className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-slate-800/95 to-purple-900/95 p-8 rounded-2xl border border-purple-500/50 max-w-md mx-4 shadow-2xl">
              <h3 className="text-xl font-semibold mb-4">12 Clips Generated</h3>
              <p className="text-gray-300 mb-6">
                You have 12 clips loaded. Generating a new clip will remove the oldest one. Continue?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmDialog(false);
                    executeProcessing();
                  }}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-semibold hover:scale-105 transition"
                >
                  Continue
                </button>
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Trim Interface Modal */}
        {showTrimInterface && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-slate-800/95 to-purple-900/95 p-8 rounded-2xl border border-purple-500/50 max-w-4xl mx-4 shadow-2xl w-full">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold flex items-center gap-3">
                  <Scissors size={24} />
                  Trim Video
                </h3>
                <button
                  onClick={cancelTrim}
                  className="text-gray-400 hover:text-white p-2"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Video Preview */}
              <div className="bg-black rounded-lg overflow-hidden mb-6">
                <video
                  src={originalVideoUrl}
                  className="w-full h-64 object-contain"
                />
              </div>

              {/* Trim Range Display */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">Start Time</div>
                  <div className="text-2xl font-mono text-green-400">{formatTime(trimStart)}</div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <div className="text-sm text-gray-400 mb-1">End Time</div>
                  <div className="text-2xl font-mono text-red-400">{formatTime(trimEnd)}</div>
                </div>
              </div>

              {/* Trim Duration Display */}
              <div className="bg-slate-800/50 p-4 rounded-lg mb-6 text-center">
                <div className="text-sm text-gray-400 mb-1">Trimmed Duration</div>
                <div className="text-3xl font-bold text-purple-400">{formatTime(trimEnd - trimStart)}</div>
              </div>

              {/* Range Sliders */}
              <div className="space-y-6 mb-6">
                <div>
                  <label className="text-sm text-gray-300 mb-2 block">Start Position</label>
                  <input
                    type="range"
                    min="0"
                    max={originalDuration}
                    step="0.1"
                    value={trimStart}
                    onChange={(e) => {
                      const newStart = parseFloat(e.target.value);
                      if (newStart < trimEnd - 2) {
                        setTrimStart(newStart);
                      }
                    }}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-300 mb-2 block">End Position</label>
                  <input
                    type="range"
                    min="0"
                    max={originalDuration}
                    step="0.1"
                    value={trimEnd}
                    onChange={(e) => {
                      const newEnd = parseFloat(e.target.value);
                      if (newEnd > trimStart + 2) {
                        setTrimEnd(newEnd);
                      }
                    }}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Progress Bar */}
              {isTrimming && (
                <div className="mb-6">
                  <div className="text-sm text-gray-300 mb-2">Processing... {progress}%</div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={cancelTrim}
                  disabled={isTrimming}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={applyTrim}
                  disabled={isTrimming || (trimEnd - trimStart) < 2}
                  className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {isTrimming ? 'Processing...' : 'Apply Trim'}
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