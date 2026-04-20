import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../services/store';
import { useAppTheme } from '../hooks/use-app-theme';
import { generateAISubtitlesForVideo, getAISubtitleTrack } from '../services/ai-subtitles';
import { ensureVideoInLibrary, getWatchProgressByUri, resolvePlaybackVideo, saveLastPlayedVideo, updateVideoThumbnail } from '../services/video-db';
import { saveProgress } from '../services/database';
import { refreshLibrary } from '../services/media-sources';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { readFile, stat } from '@tauri-apps/plugin-fs';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IoOptionsOutline, IoSunnyOutline, IoVolumeHighOutline } from 'react-icons/io5';
import type { VideoAsset } from '../services/media-scanner';

export default function VideoPlayer() {
  const {
    currentVideo,
    setCurrentVideo,
    setIsPlaying,
    setActiveSubtitleTrack,
    setSubtitlesEnabled,
    subtitleOffsetSeconds,
    setSubtitleOffsetSeconds,
    config,
  } = usePlayerStore();
  const { colors, accentColor } = useAppTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [brightness, setBrightness] = useState(1);
  const [volume, setVolume] = useState(1);
  const [audioBoost, setAudioBoost] = useState(1);
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  const [showSubtitleSyncPanel, setShowSubtitleSyncPanel] = useState(false);
  const [dialogueFocus, setDialogueFocus] = useState(false);
  const [peakProtection, setPeakProtection] = useState(true);
  const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
  const [subtitleSourceSrt, setSubtitleSourceSrt] = useState<string | null>(null);
  const [subtitleLabel, setSubtitleLabel] = useState('Subtitles');
  const [subtitleRemoved, setSubtitleRemoved] = useState(false);
  const [subtitleBusy, setSubtitleBusy] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [seekLeftText, setSeekLeftText] = useState<string | null>(null);
  const [seekRightText, setSeekRightText] = useState<string | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isVideoPaused, setIsVideoPaused] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  const [playbackVideo, setPlaybackVideo] = useState<VideoAsset | null>(null);
  const [localStreamUrl, setLocalStreamUrl] = useState<string>('');
  const [isPreparingPlayback, setIsPreparingPlayback] = useState(false);
  const seekLeftTimerRef = useRef<number | null>(null);
  const seekRightTimerRef = useRef<number | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(0);
  const resumeTimeRef = useRef<number | null>(null);
  const lastThumbnailRef = useRef<string | null>(null);
  const didRetryWithBlobUrlRef = useRef(false);
  const blobSourceUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const audioPresenceFilterRef = useRef<BiquadFilterNode | null>(null);
  const audioLowShelfFilterRef = useRef<BiquadFilterNode | null>(null);

  const reportPlaybackError = (reason: string, mediaError?: MediaError | null) => {
    const video = videoRef.current;
    const source = playbackVideo?.uri ?? currentVideo?.uri ?? '';
    const payload = {
      at: new Date().toISOString(),
      reason,
      mediaErrorCode: mediaError?.code ?? null,
      mediaErrorMessage: mediaError?.message ?? null,
      videoNetworkState: video?.networkState ?? null,
      videoReadyState: video?.readyState ?? null,
      currentSrc: video?.currentSrc ?? '',
      source,
      filename: playbackVideo?.filename ?? currentVideo?.filename ?? '',
      sourceType: playbackVideo?.sourceType ?? currentVideo?.sourceType ?? null,
      sourceId: playbackVideo?.sourceId ?? currentVideo?.sourceId ?? null,
      streamContentType: playbackVideo?.streamContentType ?? currentVideo?.streamContentType ?? null,
      canPlayMp4: video?.canPlayType('video/mp4') ?? '',
      canPlayWebm: video?.canPlayType('video/webm') ?? '',
      canPlayHls: video?.canPlayType('application/vnd.apple.mpegurl') ?? '',
      canPlayDash: video?.canPlayType('application/dash+xml') ?? '',
      userAgent: navigator.userAgent,
    };

    console.error('[player-error]', payload);
    void invoke('log_player_error', { payload: JSON.stringify(payload) }).catch((err) => {
      console.error('[player-error] failed to report to tauri:', err);
    });
  };

  const resetBlobSourceUrl = () => {
    if (blobSourceUrlRef.current) {
      URL.revokeObjectURL(blobSourceUrlRef.current);
      blobSourceUrlRef.current = null;
    }
  };

  const teardownAudioGraph = () => {
    audioSourceRef.current?.disconnect();
    audioLowShelfFilterRef.current?.disconnect();
    audioPresenceFilterRef.current?.disconnect();
    audioCompressorRef.current?.disconnect();
    audioGainRef.current?.disconnect();
    void audioContextRef.current?.close().catch(() => undefined);
    audioSourceRef.current = null;
    audioLowShelfFilterRef.current = null;
    audioPresenceFilterRef.current = null;
    audioCompressorRef.current = null;
    audioGainRef.current = null;
    audioContextRef.current = null;
  };

  const stopPlaybackCompletely = () => {
    const video = videoRef.current;
    if (video) {
      try {
        video.pause();
      } catch {}
      try {
        video.muted = true;
      } catch {}
      try {
        video.removeAttribute('src');
        video.load();
      } catch {}
    }
    teardownAudioGraph();
    resetBlobSourceUrl();
    setIsPlaying(false);
    setIsVideoPaused(true);
    setAutoplayMuted(false);
  };

  const ensureAudioGraph = async () => {
    const video = videoRef.current;
    if (!video) return null;

    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return null;

      if (!audioContextRef.current) {
        const context = new AudioContextCtor();
        const source = context.createMediaElementSource(video);
        const lowShelf = context.createBiquadFilter();
        lowShelf.type = 'lowshelf';
        lowShelf.frequency.value = 180;
        lowShelf.gain.value = 0;

        const presence = context.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2800;
        presence.Q.value = 1;
        presence.gain.value = 0;

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 24;
        compressor.ratio.value = 12;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.18;

        const gain = context.createGain();
        gain.gain.value = Math.max(0, volume * audioBoost);

        source.connect(lowShelf);
        lowShelf.connect(presence);
        presence.connect(compressor);
        compressor.connect(gain);
        gain.connect(context.destination);

        audioContextRef.current = context;
        audioSourceRef.current = source;
        audioLowShelfFilterRef.current = lowShelf;
        audioPresenceFilterRef.current = presence;
        audioCompressorRef.current = compressor;
        audioGainRef.current = gain;
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      return audioContextRef.current;
    } catch (error) {
      reportPlaybackError(`Advanced audio unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const clearControlsHideTimer = () => {
    if (controlsHideTimerRef.current) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  };

  const revealControls = () => {
    setShowControls(true);
    clearControlsHideTimer();
  };

  const scheduleControlsHide = () => {
    clearControlsHideTimer();
    controlsHideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 2200);
  };

  const playVideo = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setPlaybackError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isAbort =
        (error instanceof DOMException && error.name === 'AbortError') ||
        message.toLowerCase().includes('operation was aborted');
      if (isAbort) return;
      const isPermissionIssue =
        (error instanceof DOMException && error.name === 'NotAllowedError') ||
        message.toLowerCase().includes('not allowed by the user agent') ||
        message.toLowerCase().includes('user denied permission') ||
        message.toLowerCase().includes('denied permission');
      if (isPermissionIssue && !video.muted) {
        try {
          video.muted = true;
          setAutoplayMuted(true);
          await video.play();
          setPlaybackError(null);
          return;
        } catch {
          // Fall through to the generic error below if muted autoplay also fails.
        }
      }
      setPlaybackError(error instanceof Error ? error.message : 'Playback failed.');
      reportPlaybackError(message);
    }
  };

  const pauseVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (autoplayMuted) {
      video.muted = false;
      setAutoplayMuted(false);
    }
    if (video.paused) {
      void playVideo();
      return;
    }
    pauseVideo();
  };

  const restoreAudioOutput = () => {
    const video = videoRef.current;
    if (!video) return;

    if (autoplayMuted && volume > 0) {
      video.muted = false;
      setAutoplayMuted(false);
    }

    if (video.volume === 0 && volume > 0) {
      video.volume = volume;
    }

    void ensureAudioGraph();
  };

  useEffect(() => {
    if (!videoRef.current) return;
    if (currentVideo) {
      let cancelled = false;
      stopPlaybackCompletely();
      ensureVideoInLibrary(currentVideo)
        .then(() => refreshLibrary())
        .catch(() => undefined);
      setSubtitleUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setSubtitleSourceSrt(null);
      setSubtitleLabel('Subtitles');
      setSubtitleRemoved(false);
      setActiveSubtitleTrack(null);
      setSubtitlesEnabled(false);
      setShowResumePrompt(false);
      setResumeSeconds(0);
      setPlaybackError(null);
      setIsVideoPaused(false);
      setShowControls(true);
      setVolume(1);
      setAutoplayMuted(false);
      setShowSubtitleSyncPanel(false);
      setPlaybackVideo(null);
      setLocalStreamUrl('');
      setIsPreparingPlayback(true);
      setShowOptionsPanel(false);
      didRetryWithBlobUrlRef.current = false;
      resetBlobSourceUrl();
      lastProgressRef.current = 0;
      lastThumbnailRef.current = currentVideo.thumbnail ?? null;
      const video = videoRef.current;
      resumeTimeRef.current = null;
      getWatchProgressByUri(currentVideo.uri)
        .then((progress) => {
          if (!progress) return;
          const maxResume = Math.max(0, progress.duration - 5);
          if (progress.position > 1 && progress.position < maxResume) {
            resumeTimeRef.current = progress.position;
            setResumeSeconds(progress.position);
            if (!config.autoResume) {
              setShowResumePrompt(true);
            }
          }
        })
        .catch(() => undefined)
        .finally(() => {
          const applyResumeTime = () => {
            const resumeTime = resumeTimeRef.current;
            if (resumeTime && Number.isFinite(resumeTime)) {
              try {
                video.currentTime = resumeTime;
              } catch {}
            }
          };

          if (video.readyState >= 1) {
            applyResumeTime();
          } else {
            video.addEventListener('loadedmetadata', applyResumeTime, { once: true });
          }
        });
      resolvePlaybackVideo(currentVideo)
        .then((resolved) => {
          if (cancelled) return;
          setPlaybackVideo(resolved);
        })
        .catch(() => {
          if (cancelled) return;
          setPlaybackVideo(currentVideo);
        })
        .finally(() => {
          if (cancelled) return;
          setIsPreparingPlayback(false);
        });

      return () => {
        cancelled = true;
        stopPlaybackCompletely();
      };
    }
  }, [currentVideo?.uri]);

  const handleResumePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (autoplayMuted) {
      video.muted = false;
      setAutoplayMuted(false);
    }
    setShowResumePrompt(false);
    const resumeTime = resumeTimeRef.current ?? resumeSeconds;
    if (resumeTime && Number.isFinite(resumeTime)) {
      try {
        video.currentTime = resumeTime;
      } catch {}
    }
    void playVideo();
  };

  const handleRetryPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    setPlaybackError(null);
    void playVideo();
  };

  const handleRestartPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (autoplayMuted) {
      video.muted = false;
      setAutoplayMuted(false);
    }
    setShowResumePrompt(false);
    try {
      video.currentTime = 0;
    } catch {}
    void playVideo();
  };

  const handleOpenOptionsPanel = () => {
    void ensureAudioGraph();
    setShowOptionsPanel((prev) => {
      const next = !prev;
      if (next) setShowSubtitleSyncPanel(false);
      return next;
    });
  };

  const handleResetAudioControls = () => {
    void ensureAudioGraph();
    setVolume(1);
    setAudioBoost(1);
    setDialogueFocus(false);
    setPeakProtection(true);
  };

  const handleToggleSubtitleSyncPanel = () => {
    setShowSubtitleSyncPanel((prev) => {
      const next = !prev;
      if (next) setShowOptionsPanel(false);
      return next;
    });
  };

  useEffect(() => {
    if (!currentVideo || subtitleRemoved) return;
    let canceled = false;
    const loadSaved = async () => {
      const track = await getAISubtitleTrack(currentVideo.uri);
      if (canceled || !track?.subtitleSrt || track.status !== 'ready') return;
      setActiveSubtitleTrack(track);
      setSubtitlesEnabled(true);
      setSubtitleSourceSrt(track.subtitleSrt);
      applySubtitleSrt(track.subtitleSrt, subtitleOffsetSeconds);
      setSubtitleLabel(`${track.provider} (${track.language})`);
      requestAnimationFrame(() => {
        const tracks = videoRef.current?.textTracks;
        if (tracks && tracks.length > 0) {
          tracks[0].mode = 'showing';
        }
      });
    };
    loadSaved().catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [currentVideo?.uri, subtitleOffsetSeconds, subtitleRemoved, setActiveSubtitleTrack, setSubtitlesEnabled]);

  useEffect(() => {
    if (!currentVideo) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const video = videoRef.current;
      if (!video) return;

      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
        setSeekLeftText('< 10s');
        if (seekLeftTimerRef.current) window.clearTimeout(seekLeftTimerRef.current);
        seekLeftTimerRef.current = window.setTimeout(() => setSeekLeftText(null), 900);
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault();
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10);
        setSeekRightText('10s >');
        if (seekRightTimerRef.current) window.clearTimeout(seekRightTimerRef.current);
        seekRightTimerRef.current = window.setTimeout(() => setSeekRightText(null), 900);
      }

      if (event.code === 'ArrowUp') {
        event.preventDefault();
        restoreAudioOutput();
        revealControls();
        setVolume((current) => clamp(current + 0.05, 0, 1));
      }

      if (event.code === 'ArrowDown') {
        event.preventDefault();
        restoreAudioOutput();
        revealControls();
        setVolume((current) => clamp(current - 0.05, 0, 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentVideo]);

  useEffect(() => {
    const shouldPinControls =
      isVideoPaused ||
      showResumePrompt ||
      Boolean(playbackError) ||
      isPreparingPlayback ||
      showOptionsPanel ||
      showSubtitleSyncPanel;

    if (shouldPinControls) {
      revealControls();
      return;
    }

    scheduleControlsHide();

    return () => {
      clearControlsHideTimer();
    };
  }, [
    isPreparingPlayback,
    isVideoPaused,
    playbackError,
    showOptionsPanel,
    showResumePrompt,
    showSubtitleSyncPanel,
  ]);

  useEffect(() => () => {
    clearControlsHideTimer();
    stopPlaybackCompletely();
    setSubtitleUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const getMimeType = (filename: string): string | undefined => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    return undefined;
  };

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume;
    if (audioGainRef.current) {
      audioGainRef.current.gain.value = Math.max(0, volume * audioBoost);
    }
    if (volume > 0 && autoplayMuted) {
      videoRef.current.muted = false;
      setAutoplayMuted(false);
    }
  }, [audioBoost, volume]);

  useEffect(() => {
    if (!audioContextRef.current && audioBoost === 1) return;
    void ensureAudioGraph().then(() => {
      if (!audioGainRef.current) return;
      audioGainRef.current.gain.value = Math.max(0, volume * audioBoost);
    });
  }, [audioBoost, volume]);

  useEffect(() => {
    if (!audioContextRef.current && !dialogueFocus) return;
    void ensureAudioGraph().then(() => {
      if (audioLowShelfFilterRef.current) {
        audioLowShelfFilterRef.current.gain.value = dialogueFocus ? -2 : 0;
      }
      if (audioPresenceFilterRef.current) {
        audioPresenceFilterRef.current.gain.value = dialogueFocus ? 4 : 0;
      }
    });
  }, [dialogueFocus]);

  useEffect(() => {
    if (!audioContextRef.current && peakProtection) return;
    void ensureAudioGraph().then(() => {
      if (!audioCompressorRef.current) return;
      audioCompressorRef.current.threshold.value = peakProtection ? -24 : -8;
      audioCompressorRef.current.knee.value = peakProtection ? 24 : 8;
      audioCompressorRef.current.ratio.value = peakProtection ? 12 : 1.5;
      audioCompressorRef.current.attack.value = peakProtection ? 0.003 : 0.02;
      audioCompressorRef.current.release.value = peakProtection ? 0.18 : 0.08;
    });
  }, [peakProtection]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = autoplayMuted;
  }, [autoplayMuted]);

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const getSourceMimeType = () => {
    if (!playbackVideo) return undefined;
    if (playbackVideo.streamContentType === 'hls') return 'application/vnd.apple.mpegurl';
    if (playbackVideo.streamContentType === 'dash') return 'application/dash+xml';
    return getMimeType(playbackVideo.filename);
  };

  const isNativeLocalPlayback = (video: VideoAsset | null) => {
    if (!video) return false;
    const sourceId = video.sourceId ?? '';
    const isLocalPath = sourceId.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(sourceId);
    return video.sourceType === 'local' && isLocalPath;
  };

  const getPlaybackSource = () => {
    if (!playbackVideo) return '';
    if (isNativeLocalPlayback(playbackVideo)) {
      return localStreamUrl;
    }
    if (localStreamUrl) return localStreamUrl;
    if (playbackVideo.sourceType === 'local' && playbackVideo.sourceId) {
      try {
        return convertFileSrc(playbackVideo.sourceId);
      } catch {
        return playbackVideo.uri;
      }
    }
    return playbackVideo.uri;
  };

  useEffect(() => {
    if (!playbackVideo) {
      setLocalStreamUrl('');
      return;
    }

    const sourceId = playbackVideo.sourceId ?? '';
    const shouldUseNativeStream = isNativeLocalPlayback(playbackVideo);

    if (!shouldUseNativeStream) {
      setLocalStreamUrl('');
      return;
    }

    let cancelled = false;
    void invoke<string>('get_local_stream_url', { path: sourceId })
      .then((url) => {
        if (cancelled) return;
        setLocalStreamUrl(url);
        reportPlaybackError(`Using native local stream URL: ${url}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setLocalStreamUrl('');
        reportPlaybackError(
          `Failed to resolve native local stream URL: ${error instanceof Error ? error.message : String(error)}`
        );
      });

    return () => {
      cancelled = true;
    };
  }, [playbackVideo?.id, playbackVideo?.sourceId, playbackVideo?.sourceType]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackVideo) return;
    const source = getPlaybackSource();
    if (!source) return;
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch {}
    video.src = source;
    video.load();
  }, [playbackVideo?.id, playbackVideo?.sourceId, playbackVideo?.uri, playbackVideo?.sourceType, localStreamUrl]);

  const handleFullscreen = async () => {
    try {
      const appWindow = getCurrentWindow();
      const isFullscreen = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!isFullscreen);
      setCinemaMode(!isFullscreen);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Fullscreen unavailable.');
    }
  };

  useEffect(() => () => {
    if (seekLeftTimerRef.current) {
      window.clearTimeout(seekLeftTimerRef.current);
    }
    if (seekRightTimerRef.current) {
      window.clearTimeout(seekRightTimerRef.current);
    }
  }, []);

  const toVtt = (srt: string) => {
    const cleaned = srt.replace(/\r/g, '').trim();
    const withHeader = cleaned.startsWith('WEBVTT') ? cleaned : `WEBVTT\n\n${cleaned}`;
    return withHeader.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  };

  const toSeconds = (time: string) => {
    const match = time.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
    if (!match) return 0;
    const [, hh, mm, ss, ms] = match;
    return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
  };

  const fromSeconds = (seconds: number) => {
    const safe = Math.max(0, seconds);
    const hrs = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    const ms = Math.round((safe - Math.floor(safe)) * 1000);
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  const shiftSrt = (srt: string, offsetSeconds: number) =>
    srt.replace(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/g,
      (_, start, end) => `${fromSeconds(toSeconds(start) + offsetSeconds)} --> ${fromSeconds(toSeconds(end) + offsetSeconds)}`
    );

  const applySubtitleSrt = (srt: string, offsetSeconds: number) => {
    const shifted = shiftSrt(srt, offsetSeconds);
    const vtt = toVtt(shifted);
    const blob = new Blob([vtt], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);
    setSubtitleUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  };

  const captureFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  };

  const savePlaybackProgress = async (captureThumbnail: boolean = false) => {
    if (!currentVideo || !videoRef.current) return;
    const currentTime = Math.max(0, videoRef.current.currentTime || 0);
    const duration = Math.max(currentVideo.duration || 0, videoRef.current.duration || 0);
    if (captureThumbnail) {
      const capturedFrame = captureFrame();
      if (capturedFrame) {
        lastThumbnailRef.current = capturedFrame;
      }
    }
    if (lastThumbnailRef.current) {
      await updateVideoThumbnail(currentVideo, lastThumbnailRef.current);
    }
    await saveProgress({
      uri: currentVideo.uri,
      filename: currentVideo.filename,
      duration: Math.round(duration),
      position: currentTime,
      thumbnail: lastThumbnailRef.current ?? currentVideo.thumbnail ?? null,
    });
    await saveLastPlayedVideo(
      currentVideo,
      currentTime,
      lastThumbnailRef.current ?? currentVideo.thumbnail ?? null,
      Math.round(duration)
    );
  };

  const handleClosePlayer = async () => {
    try {
      await savePlaybackProgress(true);
    } catch {}
    stopPlaybackCompletely();
    setCurrentVideo(null);
  };

  useEffect(() => {
    if (!currentVideo) return;

    const persistPlaybackSnapshot = () => {
      savePlaybackProgress(true).catch(() => undefined);
    };

    window.addEventListener('pagehide', persistPlaybackSnapshot);
    window.addEventListener('beforeunload', persistPlaybackSnapshot);
    return () => {
      window.removeEventListener('pagehide', persistPlaybackSnapshot);
      window.removeEventListener('beforeunload', persistPlaybackSnapshot);
    };
  }, [currentVideo?.uri]);

  const clearSubtitles = () => {
    setShowSubtitleSyncPanel(false);
    setSubtitleUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSubtitleSourceSrt(null);
    setSubtitleLabel('Subtitles');
    setActiveSubtitleTrack(null);
    setSubtitlesEnabled(false);
    setSubtitleRemoved(true);
    requestAnimationFrame(() => {
      const tracks = videoRef.current?.textTracks;
      if (tracks && tracks.length > 0) {
        tracks[0].mode = 'disabled';
      }
    });
  };

  const handleFetchSubtitles = async () => {
    if (!currentVideo) return;
    setSubtitleBusy(true);
    try {
      const track = await generateAISubtitlesForVideo(currentVideo);
      setActiveSubtitleTrack(track);
      setSubtitlesEnabled(true);
      if (track.subtitleSrt) {
        setSubtitleRemoved(false);
        setSubtitleSourceSrt(track.subtitleSrt);
        applySubtitleSrt(track.subtitleSrt, subtitleOffsetSeconds);
        setSubtitleLabel(`${track.provider} (${track.language})`);
        requestAnimationFrame(() => {
          const tracks = videoRef.current?.textTracks;
          if (tracks && tracks.length > 0) {
            tracks[0].mode = 'showing';
          }
        });
        alert('Subtitles added successfully.');
      } else {
        alert('No subtitle track returned.');
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to fetch subtitles.');
    } finally {
      setSubtitleBusy(false);
    }
  };

  useEffect(() => {
    if (!subtitleSourceSrt) return;
    applySubtitleSrt(subtitleSourceSrt, subtitleOffsetSeconds);
  }, [subtitleSourceSrt, subtitleOffsetSeconds]);

  if (!currentVideo) return null;

  const subtitlesActive = Boolean(subtitleSourceSrt && subtitleUrl);
  const videoMimeType = getSourceMimeType();
  const playbackSource = getPlaybackSource();
  const menusVisible =
    showControls ||
    isVideoPaused ||
    showResumePrompt ||
    Boolean(playbackError) ||
    isPreparingPlayback ||
    showOptionsPanel ||
    showSubtitleSyncPanel;
  const effectiveVolume = Math.round(volume * audioBoost * 100);

  return (
    <div
      className="player-overlay"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      onPointerDownCapture={() => {
        restoreAudioOutput();
      }}
      onMouseMove={() => {
        revealControls();
        if (!isVideoPaused && !showResumePrompt && !playbackError && !isPreparingPlayback && !showOptionsPanel && !showSubtitleSyncPanel) {
          scheduleControlsHide();
        }
      }}
    >
      <div
        ref={cardRef}
        className={`player-card fullscreen${cinemaMode ? ' cinema' : ''}${menusVisible ? ' show-controls' : ' hide-controls'}`}
        style={{ backgroundColor: cinemaMode ? 'transparent' : colors.surface }}
      >
        <div className="player-header">
          <span className="player-title" style={{ color: colors.text }}>{currentVideo.filename}</span>
          <div className="player-actions">
            <button className="player-play-toggle" onClick={togglePlayback} style={{ color: colors.text }}>
              {isVideoPaused ? '▶' : '❚❚'}
            </button>
            <button
              className="player-subtitles"
              onClick={subtitlesActive ? clearSubtitles : handleFetchSubtitles}
              style={{ color: colors.text }}
              disabled={subtitleBusy}
            >
              {subtitleBusy ? 'Fetching...' : subtitlesActive ? 'Remove Subs' : 'Fetch Subs'}
            </button>
            {subtitlesActive && (
              <button
                className={`player-subtitles${showSubtitleSyncPanel ? ' active' : ''}`}
                onClick={handleToggleSubtitleSyncPanel}
                style={{ color: colors.text }}
              >
                Subtitle Sync
              </button>
            )}
            <button
              className={`player-subtitles${showOptionsPanel ? ' active' : ''}`}
              onClick={handleOpenOptionsPanel}
              style={{ color: colors.text }}
            >
              <IoOptionsOutline size={15} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
              Options
            </button>
            <button className="player-fullscreen" onClick={handleFullscreen} style={{ color: colors.text }}>
              ⤢
            </button>
            <button className="player-close" onClick={() => { void handleClosePlayer(); }} style={{ color: colors.text }}>
              ✕
            </button>
          </div>
        </div>
        <div
          className={`player-advanced-panel${showOptionsPanel ? ' open' : ''}`}
          style={{ borderColor: colors.border, color: colors.text }}
        >
            <div className="player-advanced-header">
              <div className="player-advanced-copy">
                <span className="player-option-title">Advanced Audio</span>
                <span className="player-advanced-meta" style={{ color: colors.mutedText }}>
                  Effective output {effectiveVolume}% with extra gain up to 300%.
                </span>
              </div>
              <button className="player-reset-audio" onClick={handleResetAudioControls}>
                Reset
              </button>
            </div>
            <div className="player-advanced-grid">
              <label className="player-audio-control">
                <span className="player-audio-label">Base volume</span>
                <div className="player-audio-range-row">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => {
                      void ensureAudioGraph();
                      setVolume(clamp(Number(e.target.value), 0, 1));
                    }}
                  />
                  <strong>{Math.round(volume * 100)}%</strong>
                </div>
              </label>
              <label className="player-audio-control">
                <span className="player-audio-label">Boost</span>
                <div className="player-audio-range-row">
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={audioBoost}
                    onChange={(e) => {
                      void ensureAudioGraph();
                      setAudioBoost(clamp(Number(e.target.value), 1, 3));
                    }}
                  />
                  <strong>{audioBoost.toFixed(1)}x</strong>
                </div>
              </label>
              <label className="player-toggle-row">
                <div className="player-advanced-copy">
                  <span className="player-audio-label">Dialogue focus</span>
                  <span className="player-advanced-meta" style={{ color: colors.mutedText }}>
                    Brings speech forward and softens muddy low frequencies.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={dialogueFocus}
                  onChange={(e) => {
                    void ensureAudioGraph();
                    setDialogueFocus(e.target.checked);
                  }}
                />
              </label>
              <label className="player-toggle-row">
                <div className="player-advanced-copy">
                  <span className="player-audio-label">Peak protection</span>
                  <span className="player-advanced-meta" style={{ color: colors.mutedText }}>
                    Keeps boosted playback cleaner by controlling sudden spikes.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={peakProtection}
                  onChange={(e) => {
                    void ensureAudioGraph();
                    setPeakProtection(e.target.checked);
                  }}
                />
              </label>
            </div>
          </div>
        <div
          className={`player-subtitle-sync-panel${showSubtitleSyncPanel ? ' open' : ''}`}
          style={{ borderColor: colors.border, color: colors.text }}
        >
          <div className="player-subtitle-row">
            <span className="player-option-title" style={{ color: colors.text }}>Subtitle Sync</span>
            <div className="player-subtitle-controls">
              <button
                className="player-subtitle-btn"
                onClick={() => setSubtitleOffsetSeconds(Math.max(-5, subtitleOffsetSeconds - 0.25))}
              >
                -0.25s
              </button>
              <span style={{ color: colors.mutedText }}>{subtitleOffsetSeconds.toFixed(2)}s</span>
              <button
                className="player-subtitle-btn"
                onClick={() => setSubtitleOffsetSeconds(Math.min(5, subtitleOffsetSeconds + 0.25))}
              >
                +0.25s
              </button>
            </div>
          </div>
          <input
            type="range"
            min={-5}
            max={5}
            step={0.25}
            value={subtitleOffsetSeconds}
            onChange={(e) => setSubtitleOffsetSeconds(Number(e.target.value))}
          />
        </div>
        <div className="player-video-wrap">
          {isPreparingPlayback ? (
            <div className="player-resume" style={{ position: 'absolute', inset: 0 }}>
              <div className="player-resume-card" style={{ borderColor: colors.border }}>
                <span className="player-resume-title" style={{ color: colors.text }}>Preparing video...</span>
                <span className="player-resume-sub" style={{ color: colors.mutedText }}>
                  Resolving the correct playback source inside Vidara.
                </span>
              </div>
            </div>
          ) : (
            <video
              ref={videoRef}
              key={`${playbackVideo?.id ?? currentVideo.id}:${playbackSource}`}
              className="player-video"
              autoPlay
              playsInline
              preload="metadata"
              crossOrigin="anonymous"
              data-source-type={videoMimeType}
              controls={menusVisible}
              src={playbackSource || undefined}
              onLoadedMetadata={() => {
                const video = videoRef.current;
                if (!video) return;
                const resumeTime = resumeTimeRef.current;
                if (resumeTime && Number.isFinite(resumeTime)) {
                  try {
                    video.currentTime = resumeTime;
                  } catch {}
                }
              }}
              onCanPlay={() => {
                if (showResumePrompt) return;
                void playVideo();
              }}
              onLoadedData={() => {
                setPlaybackError(null);
                if (!lastThumbnailRef.current && !currentVideo.thumbnail) {
                  requestAnimationFrame(() => {
                    const frame = captureFrame();
                    if (!frame || !currentVideo) return;
                    lastThumbnailRef.current = frame;
                    void updateVideoThumbnail(currentVideo, frame).catch(() => undefined);
                    void saveLastPlayedVideo(
                      currentVideo,
                      videoRef.current?.currentTime ?? 0,
                      frame,
                      Math.round(videoRef.current?.duration || currentVideo.duration || 0)
                    ).catch(() => undefined);
                  });
                }
              }}
              onError={() => {
                const error = videoRef.current?.error;
                const message = error?.message || `Playback error (code ${error?.code ?? 'unknown'})`;
                const sourceId = playbackVideo?.sourceId ?? currentVideo?.sourceId ?? '';
                const canRetryWithBlobUrl =
                  error?.code === 4 &&
                  !didRetryWithBlobUrlRef.current &&
                  Boolean(sourceId) &&
                  (playbackVideo?.sourceType === 'local' || currentVideo?.sourceType === 'local') &&
                  (sourceId.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(sourceId));

                if (canRetryWithBlobUrl && videoRef.current) {
                  didRetryWithBlobUrlRef.current = true;
                  reportPlaybackError(`${message} :: retrying with in-memory blob source`, error);
                  setPlaybackError('Retrying playback with local blob source...');
                  void (async () => {
                    try {
                      const info = await stat(sourceId);
                      const fileSize = Number(info.size || 0);
                      if (fileSize > 300 * 1024 * 1024) {
                        const sizeMsg = `Blob retry skipped: file too large (${Math.round(fileSize / (1024 * 1024))} MB).`;
                        setPlaybackError(sizeMsg);
                        reportPlaybackError(sizeMsg);
                        return;
                      }

                      const bytes = await readFile(sourceId);
                      resetBlobSourceUrl();
                      const mime = getSourceMimeType() || 'video/mp4';
                      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
                      blobSourceUrlRef.current = blobUrl;
                      reportPlaybackError(`Blob retry prepared (${Math.round(bytes.byteLength / (1024 * 1024))} MB)`);
                      if (!videoRef.current) return;
                      videoRef.current.pause();
                      videoRef.current.src = blobUrl;
                      videoRef.current.load();
                      void playVideo();
                    } catch (blobError) {
                      const blobMessage = blobError instanceof Error ? blobError.message : String(blobError);
                      setPlaybackError(`Blob retry failed: ${blobMessage}`);
                      reportPlaybackError(`Blob retry failed: ${blobMessage}`);
                    }
                  })();
                  return;
                }

                setPlaybackError(message);
                reportPlaybackError(message, error);
              }}
              onTimeUpdate={() => {
                const video = videoRef.current;
                if (!video || !currentVideo) return;
                if (video.currentTime - lastProgressRef.current < 5) return;
                lastProgressRef.current = video.currentTime;
                savePlaybackProgress().catch(() => undefined);
              }}
              onPlay={() => {
                setIsVideoPaused(false);
                setIsPlaying(true);
              }}
              onPause={() => {
                setIsVideoPaused(true);
                setIsPlaying(false);
                savePlaybackProgress(true).catch(() => undefined);
              }}
              onEnded={() => {
                setIsVideoPaused(true);
                setIsPlaying(false);
                savePlaybackProgress(true).catch(() => undefined);
              }}
              style={{ borderColor: colors.border, filter: `brightness(${brightness})` }}
              muted={autoplayMuted}
            >
              {playbackSource && videoMimeType && (
                <source src={playbackSource} type={videoMimeType} />
              )}
              {subtitleUrl && (
                <track
                  key={subtitleUrl}
                  kind="subtitles"
                  label={subtitleLabel}
                  srcLang="en"
                  src={subtitleUrl}
                  default
                />
              )}
            </video>
          )}
        </div>
        {menusVisible && (
          <div className="player-options-row">
            <div className="player-option-card" style={{ borderColor: colors.border }}>
              <IoSunnyOutline className="player-option-icon" color={colors.text} size={18} />
              <input
                className="player-slider vertical"
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={brightness}
                onChange={(e) => setBrightness(clamp(Number(e.target.value), 0.5, 2))}
              />
            </div>
            <div className="player-option-card" style={{ borderColor: colors.border }}>
              <IoVolumeHighOutline className="player-option-icon" color={colors.text} size={18} />
              <input
                className="player-slider vertical"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => {
                  void ensureAudioGraph();
                  setVolume(clamp(Number(e.target.value), 0, 1));
                }}
              />
            </div>
          </div>
        )}
        <div className="player-footer" style={{ color: colors.mutedText }}>
          <span>Playback controls are available on the video.</span>
          <span style={{ color: accentColor }}>HD</span>
        </div>
        {showResumePrompt && (
          <div className="player-resume">
            <div className="player-resume-card" style={{ borderColor: colors.border }}>
              <span className="player-resume-title" style={{ color: colors.text }}>Resume playback?</span>
              <span className="player-resume-sub" style={{ color: colors.mutedText }}>
                Continue from {Math.floor(resumeSeconds / 60)}:{String(Math.floor(resumeSeconds % 60)).padStart(2, '0')}
              </span>
              <div className="player-resume-actions">
                <button className="player-resume-btn" onClick={handleRestartPlayback}>Start Over</button>
                <button className="player-resume-btn primary" onClick={handleResumePlayback}>Resume</button>
              </div>
            </div>
          </div>
        )}
        {seekLeftText && <div className="player-seek-indicator left">{seekLeftText}</div>}
        {seekRightText && <div className="player-seek-indicator right">{seekRightText}</div>}
        {playbackError && (
          <div className="player-resume">
            <div className="player-resume-card" style={{ borderColor: colors.border }}>
              <span className="player-resume-title" style={{ color: colors.text }}>Playback failed</span>
              <span className="player-resume-sub" style={{ color: colors.mutedText }}>{playbackError}</span>
              <div className="player-resume-actions">
                <button className="player-resume-btn primary" onClick={handleRetryPlayback}>Retry</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
