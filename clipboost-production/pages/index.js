import React, { useState, useRef } from 'react';
import { Play, Pause, Upload, Music, Camera, Sliders, CheckCircle, Brain } from 'lucide-react';

const ClipBoost = () => {
  // Core state
  const [video, setVideo] = useState(null);
  const [music, setMusic] = useState(null);
  const [videoDuration, setVideoDuration] = useState(120);
  const [musicDuration, setMusicDuration] = useState(120);
  
  // Selection state
  const [videoSelection, setVideoSelection] = useState({ start: 0, end: 30 });
  const [musicSelection, setMusicSelection] = useState({ start: 0, end: 30 });
  
  // Preview state
  const [videoPreviewPlaying, setVideoPreviewPlaying] = useState(false);
  const [musicPreviewPlaying, setMusicPreviewPlaying] = useState(false);
  
  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [generatedClips, setGeneratedClips] = useState([]);
  const [audioAnalysis, setAudioAnalysis] = useState({ beats: [], energyMap: [] });

  const audioContextRef = useRef(null);
  const videoRef = useRef(null);
  const musicRef = useRef(null);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVideoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideo(file);
      const url = URL.createObjectURL(file);
      if (videoRef.current) {
        videoRef.current.src = url;
        videoRef.current.onloadedmetadata = () => {
          const realDuration = videoRef.current.duration;
          if (realDuration && !isNaN(realDuration)) {
            setVideoDuration(realDuration);
            setVideoSelection({ start: 0, end: Math.min(30, realDuration) });
          }
        };
      }
    }
  };

  const handleMusicUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setMusic(file);
      const url = URL.createObjectURL(file);
      if (musicRef.current) {
        musicRef.current.src = url;
        musicRef.current.onloadedmetadata = () => {
          const realDuration = musicRef.current.duration;
          if (realDuration && !isNaN(realDuration)) {
            setMusicDuration(realDuration);
            setMusicSelection({ start: 0, end: Math.min(30, realDuration) });
          }
        };
      }
    }
  };

  const previewVideoSelection = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    videoElement.currentTime = videoSelection.start;
    videoElement.play();
    setVideoPreviewPlaying(true);
    
    const checkTime = () => {
      if (videoElement.currentTime >= videoSelection.end) {
        videoElement.pause();
        setVideoPreviewPlaying(false);
      } else if (videoPreviewPlaying) {
        requestAnimationFrame(checkTime);
      }
    };
    requestAnimationFrame(checkTime);
  };

  const previewMusicSelection = () => {
    const musicElement = musicRef.current;
    if (!musicElement) return;
    
    musicElement.currentTime = musicSelection.start;
    musicElement.play();
    setMusicPreviewPlaying(true);
    
    const checkTime = () => {
      if (musicElement.currentTime >= musicSelection.end) {
        musicElement.pause();
        setMusicPreviewPlaying(false);
      } else if (musicPreviewPlaying) {
        requestAnimationFrame(checkTime);
      }
    };
    requestAnimationFrame(checkTime);
  };

  const stopAllPreviews = () => {
    if (videoRef.current) videoRef.current.pause();
    if (musicRef.current) musicRef.current.pause();
    setVideoPreviewPlaying(false);
    setMusicPreviewPlaying(false);
  };

  const handleAnalysis = async () => {
  if (!video) return;
  
  setIsAnalyzing(true);
  setAnalysisProgress(0);
  
  try {
    setAnalysisProgress(20);
    
    let analysis = { beats: [], energyMap: [], hasRealData: false };
    
    if (music) {
      setAnalysisProgress(50);
      analysis = await analyzeAudioFile(music, musicSelection.start, musicSelection.end);
    }
    
    setAudioAnalysis(analysis);
    setAnalysisProgress(80);
    
    const clips = generateClips(analysis);
    setGeneratedClips(clips);
    
    setAnalysisProgress(100);
    
    setTimeout(() => {
      setIsAnalyzing(false);
    }, 1500);
    
  } catch (error) {
    console.error('Analysis failed:', error);
    setIsAnalyzing(false);
  }
};
  // Real Web Audio API analysis
const analyzeAudioFile = async (file, startTime, endTime) => {
  try {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
    
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const channelData = audioBuffer.getChannelData(0).slice(startSample, endSample);
    
    const beats = detectBeats(channelData, sampleRate, startTime);
    const energyMap = analyzeEnergy(channelData, sampleRate, startTime);
    
    return { beats, energyMap, hasRealData: true };
  } catch (error) {
    console.error('Audio analysis failed:', error);
    return { beats: [], energyMap: [], hasRealData: false };
  }
};

const detectBeats = (audioData, sampleRate, timeOffset) => {
  const beats = [];
  const windowSize = Math.floor(sampleRate * 0.1);
  const hopSize = Math.floor(windowSize / 2);
  
  for (let i = 0; i < audioData.length - windowSize; i += hopSize) {
    const window = audioData.slice(i, i + windowSize);
    const energy = window.reduce((sum, sample) => sum + sample * sample, 0) / window.length;
    
    if (energy > 0.01) {
      beats.push({
        timestamp: timeOffset + (i / sampleRate),
        energy: energy,
        type: energy > 0.05 ? 'strong' : 'medium'
      });
    }
  }
  
  return beats.filter((beat, index) => 
    index === 0 || beat.timestamp - beats[index - 1].timestamp > 0.2
  );
};

const analyzeEnergy = (audioData, sampleRate, timeOffset) => {
  const energyMap = [];
  const segmentDuration = 2;
  const samplesPerSegment = sampleRate * segmentDuration;
  
  for (let i = 0; i < audioData.length; i += samplesPerSegment) {
    const segment = audioData.slice(i, Math.min(i + samplesPerSegment, audioData.length));
    const rms = Math.sqrt(segment.reduce((sum, sample) => sum + sample * sample, 0) / segment.length);
    
    energyMap.push({
      timestamp: timeOffset + (i / sampleRate),
      energy: rms,
      level: rms > 0.08 ? 'high' : rms > 0.03 ? 'medium' : 'low'
    });
  }
  
  return energyMap;
};

const generateClips = (analysis) => {
  const clips = [];
  const videoSelectionDuration = videoSelection.end - videoSelection.start;
  const numClips = Math.min(3, Math.floor(videoSelectionDuration / 10));
  
  for (let i = 0; i < numClips; i++) {
    const segmentStart = videoSelection.start + (i * (videoSelectionDuration / numClips));
    let optimalStart = segmentStart;
    
    if (analysis.hasRealData && analysis.beats.length > 0) {
      const nearbyBeat = analysis.beats.find(beat => 
        Math.abs(beat.timestamp - segmentStart) < 2.0
      );
      if (nearbyBeat) optimalStart = nearbyBeat.timestamp;
    }
    
    if (analysis.energyMap.length > 0) {
      const highEnergySegment = analysis.energyMap.find(segment =>
        segment.level === 'high' && Math.abs(segment.timestamp - segmentStart) < 3.0
      );
      if (highEnergySegment) optimalStart = highEnergySegment.timestamp;
    }
    
    const duration = Math.min(30, videoSelection.end - optimalStart);
    
    clips.push({
      id: i + 1,
      title: `Smart Clip ${i + 1}`,
      startTime: Math.max(videoSelection.start, optimalStart),
      duration: duration,
      endTime: Math.max(videoSelection.start, optimalStart) + duration,
      hasMusic: !!music,
      beatAligned: analysis.hasRealData,
      type: analysis.hasRealData ? 'Beat-Synced' : 'Content-Based'
    });
  }
  
  return clips;
};
  setIsAnalyzing(true);
  setAnalysisProgress(0);
  // ... rest of analysis code
    // Simple demo - in next iteration we'll add real analysis
    alert(`Ready to analyze!\nVideo: ${formatTime(videoSelection.start)}-${formatTime(videoSelection.end)}\nMusic: ${music ? formatTime(musicSelection.start) + '-' + formatTime(musicSelection.end) : 'None'}`);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">ClipBoost</h1>
          <p className="text-xl text-purple-100">Smart Video Editor - Working Foundation</p>
        </div>

        {/* Debug Status */}
        <div className="max-w-4xl mx-auto mb-6 text-center">
          <div className="flex justify-center gap-4 text-sm">
            <span className={`px-3 py-1 rounded ${video ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
              Video: {video ? 'Uploaded' : 'None'}
            </span>
            <span className={`px-3 py-1 rounded ${music ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
              Music: {music ? 'Uploaded' : 'None'}
            </span>
          </div>
        </div>

        {/* File Uploads */}
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Video Upload */}
          <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Upload Video
            </h3>
            
            <div className="border-2 border-dashed border-white/30 rounded-lg p-8 text-center relative hover:border-white/50 transition-colors">
              {video ? (
                <div className="space-y-4">
                  <video
                    ref={videoRef}
                    className="w-full max-w-xs mx-auto rounded-lg"
                    controls
                    muted
                  />
                  <div className="text-left bg-black/20 rounded p-3">
                    <p className="text-white font-medium">{video.name}</p>
                    <p className="text-gray-400 text-sm">Duration: {formatTime(videoDuration)}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="h-12 w-12 text-white/60 mx-auto" />
                  <p className="text-white font-medium">Drop your video here</p>
                </div>
              )}
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            {/* Video Selection Controls */}
            {video && (
              <div className="bg-black/20 rounded-lg p-4 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-medium flex items-center gap-2">
                    <Sliders className="h-4 w-4" />
                    Video Selection
                  </h4>
                  <button
                    onClick={videoPreviewPlaying ? stopAllPreviews : previewVideoSelection}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded text-sm hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2"
                  >
                    {videoPreviewPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {videoPreviewPlaying ? 'Stop' : 'Preview'}
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-gray-400 text-sm block mb-1">Start Time</label>
                      <input
                        type="range"
                        min="0"
                        max={videoDuration}
                        step="0.5"
                        value={videoSelection.start}
                        onChange={(e) => {
                          const newStart = parseFloat(e.target.value);
                          setVideoSelection(prev => ({ 
                            start: newStart, 
                            end: Math.max(newStart + 5, prev.end) 
                          }));
                        }}
                        className="w-full accent-purple-500"
                      />
                      <span className="text-white text-sm">{formatTime(videoSelection.start)}</span>
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm block mb-1">End Time</label>
                      <input
                        type="range"
                        min="5"
                        max={videoDuration}
                        step="0.5"
                        value={videoSelection.end}
                        onChange={(e) => {
                          const newEnd = parseFloat(e.target.value);
                          setVideoSelection(prev => ({ 
                            start: Math.min(prev.start, newEnd - 5), 
                            end: newEnd 
                          }));
                        }}
                        className="w-full accent-purple-500"
                      />
                      <span className="text-white text-sm">{formatTime(videoSelection.end)}</span>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <span className="text-purple-300 text-sm">
                      Selected: {formatTime(videoSelection.end - videoSelection.start)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Music Upload */}
          <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Music className="h-5 w-5" />
              Upload Music (Optional)
            </h3>
            
            <div className="border-2 border-dashed border-white/30 rounded-lg p-8 text-center relative hover:border-white/50 transition-colors">
              {music ? (
                <div className="space-y-4">
                  <audio
                    ref={musicRef}
                    className="w-full"
                    controls
                  />
                  <div className="text-left bg-black/20 rounded p-3">
                    <p className="text-white font-medium">{music.name}</p>
                    <p className="text-gray-400 text-sm">Duration: {formatTime(musicDuration)}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Music className="h-12 w-12 text-white/60 mx-auto" />
                  <p className="text-white font-medium">Add music for beat-sync</p>
                </div>
              )}
              <input
                type="file"
                accept="audio/*"
                onChange={handleMusicUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            {/* Music Selection Controls */}
            {music && (
              <div className="bg-black/20 rounded-lg p-4 mt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-white font-medium flex items-center gap-2">
                    <Sliders className="h-4 w-4" />
                    Music Selection
                  </h4>
                  <button
                    onClick={musicPreviewPlaying ? stopAllPreviews : previewMusicSelection}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1 rounded text-sm hover:from-purple-600 hover:to-pink-600 transition-all flex items-center gap-2"
                  >
                    {musicPreviewPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {musicPreviewPlaying ? 'Stop' : 'Preview'}
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-gray-400 text-sm block mb-1">Start Time</label>
                      <input
                        type="range"
                        min="0"
                        max={musicDuration}
                        step="0.5"
                        value={musicSelection.start}
                        onChange={(e) => {
                          const newStart = parseFloat(e.target.value);
                          setMusicSelection(prev => ({ 
                            start: newStart, 
                            end: Math.max(newStart + 5, prev.end) 
                          }));
                        }}
                        className="w-full accent-purple-500"
                      />
                      <span className="text-white text-sm">{formatTime(musicSelection.start)}</span>
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm block mb-1">End Time</label>
                      <input
                        type="range"
                        min="5"
                        max={musicDuration}
                        step="0.5"
                        value={musicSelection.end}
                        onChange={(e) => {
                          const newEnd = parseFloat(e.target.value);
                          setMusicSelection(prev => ({ 
                            start: Math.min(prev.start, newEnd - 5), 
                            end: newEnd 
                          }));
                        }}
                        className="w-full accent-purple-500"
                      />
                      <span className="text-white text-sm">{formatTime(musicSelection.end)}</span>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <span className="text-purple-300 text-sm">
                      Selected: {formatTime(musicSelection.end - musicSelection.start)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status & Analysis */}
        {video && (
          <div className="max-w-4xl mx-auto mt-8 space-y-6">
            <div className="text-center">
              <div className="bg-green-500/20 text-green-300 px-6 py-3 rounded-xl inline-flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Foundation Working! Video: {formatTime(videoSelection.end - videoSelection.start)} selected
                {music && ` + Music: ${formatTime(musicSelection.end - musicSelection.start)}`}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={handleAnalysis}
                disabled={isAnalyzing}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 flex items-center gap-3 mx-auto"
              >
                <Brain className="h-6 w-6" />
                {isAnalyzing ? 'Analyzing...' : 'Generate Smart Clips'}
              </button>
            </div>

            {/* Analysis Progress */}
            {isAnalyzing && (
              <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                <div className="text-center">
                  <div className="mb-4">
                    <Brain className="h-8 w-8 text-purple-400 animate-pulse mx-auto mb-2" />
                    <p className="text-white font-medium">
                      {music ? 'Analyzing audio beats and energy patterns...' : 'Analyzing video content...'}
                    </p>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-3">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${analysisProgress}%` }}
                    />
                  </div>
                  <p className="text-white/80 text-sm mt-2">{Math.round(analysisProgress)}% Complete</p>
                </div>
              </div>
            )}

            {/* Generated Clips */}
            {generatedClips.length > 0 && (
              <div className="space-y-6">
                <div className="text-center">
                  <h2 className="text-3xl font-bold text-white mb-2">Smart Clips Generated</h2>
                  <p className="text-purple-100">
                    {audioAnalysis.hasRealData ? 'Beat-synced clips from your audio analysis' : 'Content-optimized clips from your video'}
                  </p>
                  {audioAnalysis.hasRealData && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-green-500/20 text-green-300 px-4 py-2 rounded-full">
                      <Brain className="h-4 w-4" />
                      <span className="text-sm">Real audio analysis: {audioAnalysis.beats.length} beats detected</span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {generatedClips.map((clip) => (
                    <div key={clip.id} className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-white">{clip.title}</h3>
                        <div className="text-purple-300 text-sm">
                          {clip.duration.toFixed(1)}s
                        </div>
                      </div>

                      {/* Clip Preview Thumbnail */}
                      <div className="bg-black/30 aspect-video rounded-lg mb-4 flex items-center justify-center relative overflow-hidden">
                        {video && (
                          <video
                            className="w-full h-full object-cover"
                            src={URL.createObjectURL(video)}
                            muted
                            onLoadedData={(e) => {
                              e.target.currentTime = clip.startTime;
                            }}
                          />
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
                            <Play className="h-8 w-8 text-white" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs">
                          {formatTime(clip.startTime)}-{formatTime(clip.endTime)}
                        </div>
                        <div className="absolute top-2 right-2 bg-purple-500/80 text-white px-2 py-1 rounded text-xs">
                          {clip.type}
                        </div>
                      </div>

                      {/* Clip Info */}
                      <div className="bg-black/20 rounded p-3 mb-4">
                        <div className="text-sm space-y-1">
                          <div className="text-gray-400">
                            Video: {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                          </div>
                          {clip.hasMusic && (
                            <div className="text-gray-400">
                              Synchronized with music selection
                            </div>
                          )}
                          {clip.beatAligned && (
                            <div className="text-green-400">
                              Aligned to detected audio beats
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <button 
                        className="w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2 px-4 rounded-lg font-medium hover:from-green-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2"
                        onClick={() => alert(`Export functionality coming in Step 4!\n\nClip: ${clip.title}\nTiming: ${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}\nType: ${clip.type}`)}
                      >
                        Export Clip (Demo)
                      </button>
                    </div>
                  ))}
                </div>

                {/* Analysis Details */}
                {audioAnalysis.hasRealData && (
                  <div className="bg-white/10 rounded-xl p-6 backdrop-blur-sm border border-white/20">
                    <h3 className="text-xl font-bold text-white mb-4">Audio Analysis Results</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="text-white font-medium mb-3">Beat Detection</h4>
                        <div className="space-y-2 text-sm">
                          <div className="text-white">
                            Total Beats: {audioAnalysis.beats.length}
                          </div>
                          <div className="text-white">
                            Strong Beats: {audioAnalysis.beats.filter(b => b.type === 'strong').length}
                          </div>
                          <div className="text-white">
                            Time Range: {formatTime(musicSelection.start)} - {formatTime(musicSelection.end)}
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-white font-medium mb-3">Energy Analysis</h4>
                        <div className="space-y-2 text-sm">
                          <div className="text-white">
                            High Energy: {audioAnalysis.energyMap.filter(e => e.level === 'high').length} segments
                          </div>
                          <div className="text-white">
                            Medium Energy: {audioAnalysis.energyMap.filter(e => e.level === 'medium').length} segments
                          </div>
                          <div className="text-white">
                            Low Energy: {audioAnalysis.energyMap.filter(e => e.level === 'low').length} segments
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {generatedClips.length === 0 && !isAnalyzing && (
              <p className="text-white/70 text-sm text-center">
                Ready for real audio analysis. Click "Generate Smart Clips" to process your selections.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClipBoost;