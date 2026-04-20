import { create } from 'zustand';
import type { VideoAsset } from './media-scanner';
import type { AISubtitleTrack } from './ai-subtitles';
import { saveSetting, getAllSettings } from './database';

export interface ConfigState {
  hwAcceleration: boolean;
  pipEnabled: boolean;
  hapticsEnabled: boolean;
  autoResume: boolean;
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  defaultPlaybackSpeed: number;
  networkCachingMb: number;
}

interface PlayerState {
  currentVideo: VideoAsset | null;
  isPlaying: boolean;
  queue: VideoAsset[];
  allVideos: VideoAsset[];
  activeSubtitleTrack: AISubtitleTrack | null;
  subtitlesEnabled: boolean;
  subtitleOffsetSeconds: number;
  config: ConfigState;

  setCurrentVideo: (video: VideoAsset | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setQueue: (queue: VideoAsset[]) => void;
  setAllVideos: (videos: VideoAsset[]) => void;
  setActiveSubtitleTrack: (track: AISubtitleTrack | null) => void;
  setSubtitlesEnabled: (enabled: boolean) => void;
  setSubtitleOffsetSeconds: (seconds: number) => void;
  updateConfig: (key: keyof ConfigState, value: any) => void;
  loadConfig: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentVideo: null,
  isPlaying: false,
  queue: [],
  allVideos: [],
  activeSubtitleTrack: null,
  subtitlesEnabled: false,
  subtitleOffsetSeconds: 0,
  config: {
    hwAcceleration: true,
    pipEnabled: true,
    hapticsEnabled: true,
    autoResume: true,
    theme: 'dark',
    accentColor: '#7C9DFF',
    defaultPlaybackSpeed: 1,
    networkCachingMb: 50,
  },

  setCurrentVideo: (video) => set({ currentVideo: video }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setQueue: (queue) => set({ queue }),
  setAllVideos: (videos) => set({ allVideos: videos }),
  setActiveSubtitleTrack: (track) => set({ activeSubtitleTrack: track }),
  setSubtitlesEnabled: (enabled) => set({ subtitlesEnabled: enabled }),
  setSubtitleOffsetSeconds: (seconds) => set({ subtitleOffsetSeconds: seconds }),

  updateConfig: async (key, value) => {
    set((state) => ({ config: { ...state.config, [key]: value } }));
    await saveSetting(key, String(value));
  },

  loadConfig: async () => {
    const settings = await getAllSettings();
    if (Object.keys(settings).length > 0) {
      const config = { ...get().config };
      if (settings.hwAcceleration) config.hwAcceleration = settings.hwAcceleration === 'true';
      if (settings.pipEnabled) config.pipEnabled = settings.pipEnabled === 'true';
      if (settings.hapticsEnabled) config.hapticsEnabled = settings.hapticsEnabled === 'true';
      if (settings.autoResume) config.autoResume = settings.autoResume === 'true';
      if (settings.theme) config.theme = settings.theme as ConfigState['theme'];
      if (settings.accentColor) config.accentColor = settings.accentColor;
      if (settings.defaultPlaybackSpeed) config.defaultPlaybackSpeed = Number(settings.defaultPlaybackSpeed) || 1;
      if (settings.networkCachingMb) config.networkCachingMb = Number(settings.networkCachingMb) || 50;
      set({ config });
    }
  },
}));
