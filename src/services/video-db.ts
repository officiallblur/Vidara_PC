import db from './database';
import { getAllSettings, saveSetting } from './database';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { VideoAsset } from './media-scanner';

const LAST_PLAYED_VIDEO_KEY = 'lastPlayedVideo';

const resolveUri = (row: { uri: string; source_type: string | null; source_id: string | null }) => {
  if (row.source_type === 'local' && row.source_id) {
    try {
      return convertFileSrc(row.source_id);
    } catch {
      return row.uri;
    }
  }
  return row.uri;
};

const resolveSourceBackfill = async (row: {
  id: string;
  uri: string;
  filename: string;
  duration: number;
  folder: string;
  thumbnail: string | null;
  date_added: number;
  source_type: string | null;
  source_id: string | null;
  source_name: string | null;
}) => {
  if (row.source_type && row.source_id) {
    return row;
  }

  const canonicalMatches = await db.videos
    .where('filename')
    .equals(row.filename)
    .filter((candidate) => Boolean(candidate.source_type && candidate.source_id))
    .toArray();

  if (canonicalMatches.length !== 1) {
    return row;
  }

  const canonical = canonicalMatches[0];

  const next = {
    ...row,
    source_type: canonical.source_type,
    source_id: canonical.source_id,
    source_name: canonical.source_name,
  };

  await db.videos.update(row.id, {
    source_type: next.source_type,
    source_id: next.source_id,
    source_name: next.source_name,
  });

  return next;
};

const resolveThumbnailFallback = async (entry: {
  uri: string;
  filename: string;
  thumbnail: string | null;
}) => {
  if (entry.thumbnail) return entry.thumbnail;

  const byUri = await db.videos.where('uri').equals(entry.uri).first();
  if (byUri?.thumbnail) return byUri.thumbnail;

  const byFilename = await db.videos.where('filename').equals(entry.filename).first();
  if (byFilename?.thumbnail) return byFilename.thumbnail;

  return null;
};

export const getVideosFromDB = async (category: string = ''): Promise<VideoAsset[]> => {
  let rows;
  if (category) {
    rows = await db.videos.where('folder').equals(category).reverse().sortBy('date_added');
  } else {
    rows = await db.videos.reverse().sortBy('date_added');
  }
  const hydratedRows = await Promise.all(rows.map(resolveSourceBackfill));
  return hydratedRows.map((r) => ({
    id: r.id,
    uri: resolveUri(r),
    filename: r.filename,
    duration: r.duration,
    folder: r.folder,
    thumbnail: r.thumbnail,
    width: 0,
    height: 0,
    creationTime: r.date_added,
    sourceType: (r.source_type as VideoAsset['sourceType']) ?? undefined,
    sourceId: r.source_id ?? undefined,
    sourceName: r.source_name ?? undefined,
  }));
};

const isSeriesFilename = (filename: string) =>
  /S\d{1,2}\s*E\d{1,3}|Season\s*\d+\D+Episode\s*\d+|\d{1,2}x\d{1,3}/i.test(filename);

const resolveCategory = (video: VideoAsset) => {
  if ((video.folder ?? '').toLowerCase().includes('series')) return 'Series';
  if ((video.folder ?? '').toLowerCase().includes('movie')) return 'Movies';
  return isSeriesFilename(video.filename) ? 'Series' : 'Movies';
};

export const ensureVideoInLibrary = async (video: VideoAsset) => {
  const category = resolveCategory(video);
  if (video.sourceId) {
    const sourceMatch = await db.videos.where('source_id').equals(video.sourceId).first();
    if (sourceMatch) {
      await db.videos.update(sourceMatch.id, {
        uri: video.uri,
        folder: category,
        source_type: sourceMatch.source_type ?? video.sourceType ?? null,
        source_id: sourceMatch.source_id ?? video.sourceId ?? null,
        source_name: sourceMatch.source_name ?? video.sourceName ?? null,
        thumbnail: video.thumbnail ?? sourceMatch.thumbnail ?? null,
      });
      return;
    }
  }

  const existing = await db.videos.where('uri').equals(video.uri).first();
  if (existing) {
    await db.videos.update(existing.id, {
      folder: category,
      source_type: existing.source_type ?? video.sourceType ?? null,
      source_id: existing.source_id ?? video.sourceId ?? null,
      source_name: existing.source_name ?? video.sourceName ?? null,
      thumbnail: video.thumbnail ?? existing.thumbnail ?? null,
    });
    return;
  }

  const filenameMatches = await db.videos.where('filename').equals(video.filename).toArray();
  if (filenameMatches.length === 1) {
    const filenameMatch = filenameMatches[0];
    await db.videos.update(filenameMatch.id, {
      uri: video.uri,
      folder: category,
      source_type: filenameMatch.source_type ?? video.sourceType ?? null,
      source_id: filenameMatch.source_id ?? video.sourceId ?? null,
      source_name: filenameMatch.source_name ?? video.sourceName ?? null,
      thumbnail: video.thumbnail ?? filenameMatch.thumbnail ?? null,
    });
    return;
  }

  await db.videos.put({
    id: video.id,
    uri: video.uri,
    filename: video.filename,
    duration: video.duration ?? 0,
    folder: category,
    thumbnail: video.thumbnail ?? null,
    date_added: video.creationTime ?? Date.now(),
    play_count: 0,
    source_type: video.sourceType ?? null,
    source_id: video.sourceId ?? null,
    source_name: video.sourceName ?? null,
  });
};

export const searchVideos = async (query: string): Promise<VideoAsset[]> => {
  const q = query.trim().toLowerCase();
  const rows = await db.videos.toArray();
  return rows
    .filter((r) =>
      (r.folder === 'Movies' || r.folder === 'Series') &&
      (r.filename.toLowerCase().includes(q) || (r.folder ?? '').toLowerCase().includes(q) || (r.source_name ?? '').toLowerCase().includes(q))
    )
    .map((r) => ({
      id: r.id,
      uri: resolveUri(r),
      filename: r.filename,
      duration: r.duration,
      folder: r.folder,
      thumbnail: r.thumbnail,
      width: 0,
      height: 0,
      creationTime: r.date_added,
      sourceType: (r.source_type as VideoAsset['sourceType']) ?? undefined,
      sourceId: r.source_id ?? undefined,
      sourceName: r.source_name ?? undefined,
    }));
};

export const getVideoByUri = async (uri: string): Promise<VideoAsset | null> => {
  const row = await db.videos.where('uri').equals(uri).first();
  if (!row) return null;
  return {
    id: row.id, uri: resolveUri(row), filename: row.filename, duration: row.duration,
    folder: row.folder, thumbnail: row.thumbnail, width: 0, height: 0,
    creationTime: row.date_added,
    sourceType: (row.source_type as VideoAsset['sourceType']) ?? undefined,
    sourceId: row.source_id ?? undefined, sourceName: row.source_name ?? undefined,
  };
};

export const getVideoByFilename = async (filename: string): Promise<VideoAsset | null> => {
  const rows = await db.videos.where('filename').equals(filename).toArray();
  if (rows.length !== 1) return null;
  const row = rows[0];
  return {
    id: row.id, uri: resolveUri(row), filename: row.filename, duration: row.duration,
    folder: row.folder, thumbnail: row.thumbnail, width: 0, height: 0,
    creationTime: row.date_added,
    sourceType: (row.source_type as VideoAsset['sourceType']) ?? undefined,
    sourceId: row.source_id ?? undefined, sourceName: row.source_name ?? undefined,
  };
};

export const updateVideoUriById = async (id: string, uri: string) => {
  await db.videos.update(id, { uri });
};

export const updateVideoThumbnailByUri = async (uri: string, thumbnail: string | null) => {
  const row = await db.videos.where('uri').equals(uri).first();
  if (row) {
    await db.videos.update(row.id, { thumbnail });
  }
};

export const updateVideoThumbnail = async (video: VideoAsset, thumbnail: string | null) => {
  if (video.id) {
    const byId = await db.videos.get(video.id);
    if (byId) {
      await db.videos.update(byId.id, { thumbnail });
      return;
    }
  }

  if (video.sourceId) {
    const bySource = await db.videos.where('source_id').equals(video.sourceId).first();
    if (bySource) {
      await db.videos.update(bySource.id, { thumbnail });
      return;
    }
  }

  const byUri = await db.videos.where('uri').equals(video.uri).first();
  if (byUri) {
    await db.videos.update(byUri.id, { thumbnail });
    return;
  }

  const filenameMatches = await db.videos.where('filename').equals(video.filename).toArray();
  if (filenameMatches.length === 1) {
    await db.videos.update(filenameMatches[0].id, { thumbnail });
  }
};

export const deleteVideoByUri = async (uri: string) => {
  const row = await db.videos.where('uri').equals(uri).first();
  if (row) {
    await db.videos.delete(row.id);
  }
  await db.watch_history.where('uri').equals(uri).delete();
  await db.ai_subtitle_tracks.where('video_uri').equals(uri).delete();
};

export const getVideoById = async (id: string): Promise<VideoAsset | null> => {
  const row = await db.videos.get(id);
  if (!row) return null;
  return {
    id: row.id, uri: resolveUri(row), filename: row.filename, duration: row.duration,
    folder: row.folder, thumbnail: row.thumbnail, width: 0, height: 0,
    creationTime: row.date_added,
    sourceType: (row.source_type as VideoAsset['sourceType']) ?? undefined,
    sourceId: row.source_id ?? undefined, sourceName: row.source_name ?? undefined,
  };
};

export const getVideoBySourceId = async (sourceId: string): Promise<VideoAsset | null> => {
  const row = await db.videos.where('source_id').equals(sourceId).first();
  if (!row) return null;
  return {
    id: row.id, uri: resolveUri(row), filename: row.filename, duration: row.duration,
    folder: row.folder, thumbnail: row.thumbnail, width: 0, height: 0,
    creationTime: row.date_added,
    sourceType: (row.source_type as VideoAsset['sourceType']) ?? undefined,
    sourceId: row.source_id ?? undefined, sourceName: row.source_name ?? undefined,
  };
};

export const resolvePlaybackVideo = async (video: VideoAsset): Promise<VideoAsset> => {
  const candidates: Array<() => Promise<VideoAsset | null>> = [];

  if (video.sourceId) {
    candidates.push(() => getVideoBySourceId(video.sourceId!));
  }

  if (video.id) {
    candidates.push(() => getVideoById(video.id));
  }

  if (video.uri) {
    candidates.push(() => getVideoByUri(video.uri));
  }

  if (video.filename) {
    candidates.push(() => getVideoByFilename(video.filename));
  }

  for (const loadCandidate of candidates) {
    try {
      const candidate = await loadCandidate();
      if (!candidate) continue;
      if (video.sourceType === 'local' && candidate.sourceType === 'local' && candidate.sourceId) {
        return candidate;
      }
      if (!video.sourceType || candidate.sourceType === video.sourceType) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return video;
};

export const getLatestWatchHistory = async () => {
  const row = await db.watch_history.orderBy('last_watched').reverse().first();
  if (!row) return null;
  const thumbnail = await resolveThumbnailFallback(row);
  return {
    id: null as string | null,
    uri: row.uri,
    filename: row.filename,
    position: row.position,
    duration: row.duration,
    thumbnail,
    folder: null as string | null,
    source_type: null as string | null,
    source_id: null as string | null,
    source_name: null as string | null,
  };
};

export const saveLastPlayedVideo = async (
  video: VideoAsset,
  position: number,
  thumbnail?: string | null,
  durationOverride?: number
) => {
  await saveSetting(
    LAST_PLAYED_VIDEO_KEY,
    JSON.stringify({
      id: video.id,
      uri: video.uri,
      filename: video.filename,
      duration: durationOverride ?? video.duration,
      thumbnail: thumbnail ?? video.thumbnail ?? null,
      folder: video.folder ?? null,
      sourceType: video.sourceType ?? null,
      sourceId: video.sourceId ?? null,
      sourceName: video.sourceName ?? null,
      streamContentType: video.streamContentType ?? 'auto',
      position,
      lastWatched: Date.now(),
    })
  );
};

export const getLastPlayedVideo = async (): Promise<{
  id: string | null;
  uri: string;
  filename: string;
  duration: number;
  thumbnail: string | null;
  folder: string | null;
  sourceType: 'local' | 'plex' | 'nas' | null;
  sourceId: string | null;
  sourceName: string | null;
  streamContentType: 'auto' | 'progressive' | 'hls' | 'dash';
  position: number;
  lastWatched: number;
} | null> => {
  const settings = await getAllSettings();
  const raw = settings[LAST_PLAYED_VIDEO_KEY];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.uri || !parsed?.filename) return null;
    const thumbnail = await resolveThumbnailFallback({
      uri: parsed.uri,
      filename: parsed.filename,
      thumbnail: parsed.thumbnail ?? null,
    });
    return {
      ...parsed,
      thumbnail,
    };
  } catch {
    return null;
  }
};

export const getWatchHistory = async (limit: number = 20) => {
  const rows = await db.watch_history.orderBy('last_watched').reverse().limit(limit).toArray();
  return Promise.all(rows.map(async (r) => ({
    uri: r.uri,
    filename: r.filename,
    position: r.position,
    duration: r.duration,
    thumbnail: await resolveThumbnailFallback(r),
    last_watched: r.last_watched,
  })));
};

export const getWatchProgressByUri = async (uri: string) => {
  const row = await db.watch_history.where('uri').equals(uri).first();
  if (!row) return null;
  return {
    position: row.position,
    duration: row.duration,
    thumbnail: await resolveThumbnailFallback(row),
    last_watched: row.last_watched,
  };
};

export const getRecentLibrarySuggestions = async (limit: number = 8): Promise<VideoAsset[]> => {
  const rows = await db.videos.orderBy('date_added').reverse().limit(limit).toArray();
  return rows.map((r) => ({
    id: r.id, uri: resolveUri(r), filename: r.filename, duration: r.duration,
    folder: r.folder, thumbnail: r.thumbnail, width: 0, height: 0,
    creationTime: r.date_added,
    sourceType: (r.source_type as VideoAsset['sourceType']) ?? undefined,
    sourceId: r.source_id ?? undefined, sourceName: r.source_name ?? undefined,
  }));
};

export const getMostPlayedVideos = async (limit: number = 10) => {
  const rows = await db.videos.toArray();
  return rows
    .filter((r) => (r.play_count ?? 0) > 0)
    .sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0))
    .slice(0, limit)
    .map((r) => ({
      id: r.id, uri: resolveUri(r), filename: r.filename, duration: r.duration,
      folder: r.folder, thumbnail: r.thumbnail, width: 0, height: 0,
      creationTime: r.date_added, play_count: r.play_count ?? 0,
      sourceType: (r.source_type as VideoAsset['sourceType']) ?? undefined,
      sourceId: r.source_id ?? undefined, sourceName: r.source_name ?? undefined,
    }));
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
