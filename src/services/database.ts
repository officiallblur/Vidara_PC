import Dexie, { type Table } from 'dexie';

export interface VideoRow {
  id: string;
  uri: string;
  filename: string;
  duration: number;
  folder: string;
  thumbnail: string | null;
  date_added: number;
  play_count: number;
  source_type: string | null;
  source_id: string | null;
  source_name: string | null;
}

export interface WatchHistoryRow {
  id?: number;
  uri: string;
  filename: string;
  duration: number;
  position: number;
  thumbnail: string | null;
  last_watched: number;
}

export interface AnalyticsRow {
  id?: number;
  date: string;
  watch_time_seconds: number;
  category: string;
}

export interface SettingRow {
  key: string;
  value: string;
}

export interface AISubtitleTrackRow {
  video_uri: string;
  video_id: string | null;
  filename: string;
  language: string;
  status: string;
  subtitle_srt: string | null;
  provider: string;
  generated_at: number | null;
  last_requested_at: number | null;
  error: string | null;
}

class VidaraDB extends Dexie {
  videos!: Table<VideoRow, string>;
  watch_history!: Table<WatchHistoryRow, number>;
  analytics!: Table<AnalyticsRow, number>;
  settings!: Table<SettingRow, string>;
  ai_subtitle_tracks!: Table<AISubtitleTrackRow, string>;

  constructor() {
    super('vidara');
    this.version(1).stores({
      videos: 'id, uri, filename, folder, source_type, source_id, date_added',
      watch_history: '++id, &uri, last_watched',
      analytics: '++id, date',
      settings: 'key',
      ai_subtitle_tracks: 'video_uri, video_id',
    });
  }
}

const db = new VidaraDB();

export const openDatabase = () => db;

export const initDatabase = async () => {
  // Dexie auto-creates tables; nothing else needed
  await db.open();
};

export const resetDatabase = async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table) => table.clear()));
  });
};

export const saveSetting = async (key: string, value: string) => {
  await db.settings.put({ key, value });
};

export const getAllSettings = async (): Promise<Record<string, string>> => {
  const rows = await db.settings.toArray();
  return rows.reduce((acc, row) => ({ ...acc, [row.key]: row.value }), {} as Record<string, string>);
};

export const saveProgress = async (entry: {
  uri: string;
  filename: string;
  duration: number;
  position: number;
  thumbnail: string | null;
}) => {
  const existing = await db.watch_history.where('uri').equals(entry.uri).first();
  if (existing) {
    await db.watch_history.update(existing.id!, {
      ...entry,
      last_watched: Date.now(),
    });
  } else {
    await db.watch_history.add({
      ...entry,
      last_watched: Date.now(),
    });
  }
};

export default db;
