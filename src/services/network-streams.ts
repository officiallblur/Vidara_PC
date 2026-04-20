import { getAllSettings, saveSetting } from './database';
import type { VideoAsset } from './media-scanner';

const NETWORK_STREAMS_KEY = 'recentNetworkStreams';
const MAX_RECENT_STREAMS = 10;

export interface RecentNetworkStream {
  id: string;
  title: string;
  url: string;
  contentType: 'auto' | 'progressive' | 'hls' | 'dash';
  lastOpenedAt: number;
}

const hasSupportedScheme = (value: string) => /^(https?:\/\/)/i.test(value);

export const normalizeNetworkUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (hasSupportedScheme(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
};

export const inferStreamContentType = (url: string): RecentNetworkStream['contentType'] => {
  const cleanUrl = url.toLowerCase().split('?')[0];
  if (cleanUrl.endsWith('.m3u8')) return 'hls';
  if (cleanUrl.endsWith('.mpd')) return 'dash';
  if (/\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(cleanUrl)) return 'progressive';
  return 'auto';
};

export const guessStreamTitle = (url: string) => {
  try {
    const parsed = new URL(url);
    const lastSegment = parsed.pathname.split('/').filter(Boolean).pop();
    if (lastSegment) return decodeURIComponent(lastSegment);
    return parsed.hostname;
  } catch {
    return 'Network Stream';
  }
};

export const isValidNetworkUrl = (url: string) => /^https?:\/\/\S+/i.test(url);

export const makeNetworkVideoAsset = (url: string, title?: string): VideoAsset => ({
  id: `network:${url}`,
  uri: url,
  filename: title?.trim() || guessStreamTitle(url),
  duration: 0,
  width: 0,
  height: 0,
  folder: 'Network',
  sourceType: 'local',
  sourceId: 'network-stream',
  sourceName: 'Network Stream',
  streamContentType: inferStreamContentType(url),
});

export const getRecentNetworkStreams = async (): Promise<RecentNetworkStream[]> => {
  const settings = await getAllSettings();
  const raw = settings[NETWORK_STREAMS_KEY];
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as RecentNetworkStream[]).slice(0, MAX_RECENT_STREAMS);
  } catch {
    return [];
  }
};

export const saveRecentNetworkStream = async (stream: Omit<RecentNetworkStream, 'lastOpenedAt' | 'id'>) => {
  const current = await getRecentNetworkStreams();
  const normalizedUrl = normalizeNetworkUrl(stream.url);
  const nextItem: RecentNetworkStream = {
    id: `recent:${normalizedUrl}`,
    url: normalizedUrl,
    title: stream.title.trim() || guessStreamTitle(normalizedUrl),
    contentType: stream.contentType,
    lastOpenedAt: Date.now(),
  };
  const deduped = current.filter((item) => item.url !== normalizedUrl);
  const next = [nextItem, ...deduped].slice(0, MAX_RECENT_STREAMS);
  await saveSetting(NETWORK_STREAMS_KEY, JSON.stringify(next));
  return next;
};
