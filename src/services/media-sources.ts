import db from './database';
import { getVideosFromDB } from './video-db';
import { usePlayerStore } from './store';
import type { VideoAsset } from './media-scanner';

export type SourceType = 'local' | 'plex' | 'nas' | 'gdrive';
export type SourceStatus = 'connected' | 'disconnected' | 'error' | 'scanning';
export type NasMode = 'direct' | 'webdav';

interface BaseSourceConfig {
  id: string;
  type: SourceType;
  name: string;
  enabled: boolean;
  lastSyncedAt?: number;
  status?: SourceStatus;
  error?: string;
}

export interface LocalSourceConfig extends BaseSourceConfig { type: 'local'; }

export interface PlexSourceConfig extends BaseSourceConfig {
  type: 'plex';
  serverUrl: string;
  token: string;
  librarySectionId?: string;
}

export interface NasSourceConfig extends BaseSourceConfig {
  type: 'nas';
  mode: NasMode;
  url: string;
  username?: string;
  password?: string;
}

export interface GoogleDriveSourceConfig extends BaseSourceConfig {
  type: 'gdrive';
  clientId: string;
  folderId?: string;
  accountEmail?: string;
}

export type MediaSourceConfig = LocalSourceConfig | PlexSourceConfig | NasSourceConfig | GoogleDriveSourceConfig;

const MEDIA_SOURCES_KEY = 'mediaSources';
const LOCAL_SOURCE: LocalSourceConfig = {
  id: 'local-device',
  type: 'local',
  name: 'Local Device',
  enabled: true,
  status: 'connected',
};

import { getAllSettings, saveSetting } from './database';

const uniqueById = <T extends { id: string }>(items: T[]) => {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return Array.from(map.values());
};

export const loadMediaSources = async (): Promise<MediaSourceConfig[]> => {
  const settings = await getAllSettings();
  const raw = settings[MEDIA_SOURCES_KEY];
  if (!raw) return [LOCAL_SOURCE];
  try {
    const parsed = JSON.parse(raw) as MediaSourceConfig[];
    const remoteSources = parsed.filter((s) => s.type !== 'local');
    return [LOCAL_SOURCE, ...uniqueById(remoteSources)];
  } catch {
    return [LOCAL_SOURCE];
  }
};

const saveRemoteSources = async (sources: MediaSourceConfig[]) => {
  await saveSetting(MEDIA_SOURCES_KEY, JSON.stringify(sources.filter((s) => s.type !== 'local')));
};

export const upsertMediaSource = async (source: PlexSourceConfig | NasSourceConfig | GoogleDriveSourceConfig) => {
  const current = await loadMediaSources();
  const next = current.filter((item) => item.id !== source.id && item.type !== 'local');
  next.push(source);
  await saveRemoteSources(next);
  return loadMediaSources();
};

export const removeMediaSource = async (sourceId: string) => {
  const current = await loadMediaSources();
  const next = current.filter((s) => s.id !== sourceId && s.type !== 'local');
  await saveRemoteSources(next);
  await db.videos.where('source_id').equals(sourceId).delete();
  await refreshLibrary();
  return loadMediaSources();
};

export const refreshLibrary = async () => {
  const videos = await getVideosFromDB();
  usePlayerStore.getState().setAllVideos(videos);
  return videos;
};

export const syncLocalSource = async () => {
  // On desktop, "local source" is imported via file picker
  await refreshLibrary();
};

const normaliseUrl = (value: string) => value.trim().replace(/\/+$/, '');

export const syncPlexSource = async (source: PlexSourceConfig) => {
  // Fetch Plex library
  const sectionsRes = await fetch(
    `${normaliseUrl(source.serverUrl)}/library/sections?X-Plex-Token=${encodeURIComponent(source.token)}`,
    { headers: { Accept: 'application/json' } }
  );
  if (!sectionsRes.ok) throw new Error(`Plex returned ${sectionsRes.status}`);
  const payload = await sectionsRes.json();
  const directories = payload?.MediaContainer?.Directory ?? [];
  const sectionIds = source.librarySectionId
    ? [source.librarySectionId]
    : directories.filter((d: any) => d.type === 'movie' || d.type === 'show').map((d: any) => String(d.key));

  const allVideos: VideoAsset[] = [];
  for (const sectionId of sectionIds) {
    const res = await fetch(
      `${normaliseUrl(source.serverUrl)}/library/sections/${sectionId}/all?X-Plex-Token=${encodeURIComponent(source.token)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) continue;
    const data = await res.json();
    const items = data?.MediaContainer?.Metadata ?? [];
    for (const item of items) {
      const part = item?.Media?.[0]?.Part?.[0];
      if (!part?.key) continue;
      const rawDuration = Number(item.duration ?? 0);
      allVideos.push({
        id: `${source.id}:${item.ratingKey ?? part.key}`,
        filename: String(item.title ?? 'Plex Item'),
        uri: `${normaliseUrl(source.serverUrl)}${part.key}${part.key.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(source.token)}`,
        duration: rawDuration > 10000 ? Math.round(rawDuration / 1000) : rawDuration,
        width: Number(part.width ?? 0),
        height: Number(part.height ?? 0),
        creationTime: Number(item.addedAt ?? Date.now()) * 1000 || Date.now(),
        folder: item.type === 'episode' ? 'Series' : 'Movies',
        thumbnail: item.thumb ? `${normaliseUrl(source.serverUrl)}${item.thumb}?X-Plex-Token=${encodeURIComponent(source.token)}` : null,
        sourceType: 'plex',
        sourceId: source.id,
        sourceName: source.name,
      });
    }
  }

  // Sync to DB
  await db.videos.where('source_id').equals(source.id).delete();
  for (const v of allVideos) {
    await db.videos.put({
      id: v.id, uri: v.uri, filename: v.filename, duration: v.duration,
      folder: v.folder ?? 'Movies', thumbnail: v.thumbnail ?? null,
      date_added: v.creationTime ?? Date.now(), play_count: 0,
      source_type: 'plex', source_id: source.id, source_name: source.name,
    });
  }
  await refreshLibrary();
  return allVideos;
};

export const syncNasSource = async (source: NasSourceConfig) => {
  let videos: VideoAsset[] = [];
  if (source.mode === 'direct') {
    videos = [{
      id: `${source.id}:${source.url}`,
      filename: source.url.split('/').filter(Boolean).pop() || source.name,
      uri: source.url.trim(),
      duration: 0, width: 0, height: 0,
      creationTime: Date.now(), folder: 'NAS', thumbnail: null,
      sourceType: 'nas', sourceId: source.id, sourceName: source.name,
    }];
  } else {
    const authHeader = source.username ? `Basic ${btoa(`${source.username}:${source.password ?? ''}`)}` : undefined;
    const res = await fetch(source.url, {
      method: 'PROPFIND',
      headers: {
        Depth: '1', 'Content-Type': 'application/xml',
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body: '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><displayname/><getcontenttype/><getcontentlength/></prop></propfind>',
    });
    if (!res.ok) throw new Error(`NAS returned ${res.status}`);
    // Simple XML parsing for WebDAV
    const xml = await res.text();
    const blocks = xml.match(/<(?:[A-Za-z0-9]+:)?response\b[\s\S]*?<\/(?:[A-Za-z0-9]+:)?response>/gi) ?? [];
    for (const block of blocks) {
      const hrefMatch = block.match(/<(?:[A-Za-z0-9]+:)?href[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9]+:)?href>/i);
      const href = hrefMatch ? decodeURIComponent(hrefMatch[1].trim()) : '';
      if (!href || href.endsWith('/')) continue;
      const ext = href.toLowerCase();
      if (!['.mp4', '.mkv', '.mov', '.m4v', '.avi', '.webm'].some((e) => ext.includes(e))) continue;
      const fn = href.split('/').filter(Boolean).pop() || 'NAS Video';
      const uri = /^https?:\/\//i.test(href) ? href : `${normaliseUrl(source.url)}${href.startsWith('/') ? href : `/${href}`}`;
      videos.push({
        id: `${source.id}:${href}`, filename: fn, uri, duration: 0, width: 0, height: 0,
        creationTime: Date.now(), folder: 'NAS', thumbnail: null,
        sourceType: 'nas', sourceId: source.id, sourceName: source.name,
      });
    }
  }

  await db.videos.where('source_id').equals(source.id).delete();
  for (const v of videos) {
    await db.videos.put({
      id: v.id, uri: v.uri, filename: v.filename, duration: v.duration,
      folder: v.folder ?? 'NAS', thumbnail: v.thumbnail ?? null,
      date_added: v.creationTime ?? Date.now(), play_count: 0,
      source_type: 'nas', source_id: source.id, source_name: source.name,
    });
  }
  await refreshLibrary();
  return videos;
};

export const syncGoogleDriveSource = async (_source: GoogleDriveSourceConfig) => {
  // Google Drive OAuth on desktop would need a different flow
  // For now this is a placeholder
  await refreshLibrary();
  return [] as VideoAsset[];
};

export const saveGoogleDriveToken = async (_sourceId: string, _token: any) => {
  // placeholder
};

export const getSourceStats = async () => {
  const rows = await db.videos.toArray();
  const map = new Map<string, { count: number }>();
  for (const r of rows) {
    const key = r.source_type ?? 'local';
    const existing = map.get(key);
    map.set(key, { count: (existing?.count ?? 0) + 1 });
  }
  return map;
};
