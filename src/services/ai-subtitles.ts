export interface SubtitleCue {
  index: number;
  start: number;
  end: number;
  text: string;
}

export interface AISubtitleTrack {
  videoUri: string;
  videoId?: string | null;
  filename: string;
  language: string;
  status: 'idle' | 'generating' | 'ready' | 'error';
  provider: string;
  generatedAt?: number | null;
  lastRequestedAt?: number | null;
  subtitleSrt?: string | null;
  error?: string | null;
}


const parseSrtTime = (input: string) => {
  const match = input.match(/(\d+):(\d+):(\d+),(\d+)/);
  if (!match) return 0;
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
};

export const parseSrt = (srt: string): SubtitleCue[] =>
  srt
    .trim()
    .split(/\n\s*\n/)
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (lines.length < 3) return null;
      const index = Number(lines[0]);
      const [startRaw, endRaw] = lines[1].split('-->').map((l) => l.trim());
      return { index, start: parseSrtTime(startRaw), end: parseSrtTime(endRaw), text: lines.slice(2).join(' ') };
    })
    .filter((cue): cue is SubtitleCue => Boolean(cue));

export const getSubtitleCueAtTime = (cues: SubtitleCue[], seconds: number) => {
  return cues.find((cue) => seconds >= cue.start && seconds <= cue.end) ?? null;
};

import db, { type AISubtitleTrackRow } from './database';
import type { VideoAsset } from './media-scanner';
import { fetchSubtitleFromOpenSubtitles } from './open-subs';

const mapRowToTrack = (row: AISubtitleTrackRow): AISubtitleTrack => ({
  videoUri: row.video_uri,
  videoId: row.video_id,
  filename: row.filename,
  language: row.language,
  status: row.status as AISubtitleTrack['status'],
  provider: row.provider,
  generatedAt: row.generated_at,
  lastRequestedAt: row.last_requested_at,
  subtitleSrt: row.subtitle_srt,
  error: row.error,
});

export const getAISubtitleTrack = async (videoUri: string): Promise<AISubtitleTrack | null> => {
  const row = await db.ai_subtitle_tracks.get(videoUri);
  return row ? mapRowToTrack(row) : null;
};

export const saveAISubtitleTrack = async (track: AISubtitleTrack) => {
  await db.ai_subtitle_tracks.put({
    video_uri: track.videoUri,
    video_id: track.videoId ?? null,
    filename: track.filename,
    language: track.language,
    status: track.status,
    subtitle_srt: track.subtitleSrt ?? null,
    provider: track.provider,
    generated_at: track.generatedAt ?? null,
    last_requested_at: track.lastRequestedAt ?? null,
    error: track.error ?? null,
  });
};

export const generateAISubtitlesForVideo = async (video: VideoAsset, language: string = 'English') => {
  await saveAISubtitleTrack({
    videoUri: video.uri,
    videoId: video.id,
    filename: video.filename,
    language,
    status: 'generating',
    provider: 'OpenSubtitles',
    lastRequestedAt: Date.now(),
    subtitleSrt: null,
    generatedAt: null,
    error: null,
  });

  try {
    const result = await fetchSubtitleFromOpenSubtitles(video);
    const track: AISubtitleTrack = {
      videoUri: video.uri,
      videoId: video.id,
      filename: video.filename,
      language: result.language || language,
      status: 'ready',
      provider: result.provider || 'OpenSubtitles',
      generatedAt: Date.now(),
      lastRequestedAt: Date.now(),
      subtitleSrt: result.subtitleSrt,
      error: null,
    };
    await saveAISubtitleTrack(track);
    return track;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenSubtitles request failed.';
    await saveAISubtitleTrack({
      videoUri: video.uri,
      videoId: video.id,
      filename: video.filename,
      language,
      status: 'error',
      provider: 'OpenSubtitles',
      generatedAt: null,
      lastRequestedAt: Date.now(),
      subtitleSrt: null,
      error: message,
    });
    throw new Error(message);
  }
};

export const getAISubtitleJobs = async (limit: number = 12): Promise<AISubtitleTrack[]> => {
  const rows = await db.ai_subtitle_tracks
    .orderBy('last_requested_at')
    .reverse()
    .limit(limit)
    .toArray();
  return rows.map(mapRowToTrack);
};
