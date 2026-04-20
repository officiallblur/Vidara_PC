import React, { useCallback, useState } from 'react';
import { IoPlayCircleOutline, IoFilmOutline, IoChatbubbleEllipsesOutline } from 'react-icons/io5';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { generateAISubtitlesForVideo, getAISubtitleJobs } from '../services/ai-subtitles';
import type { VideoAsset } from '../services/media-scanner';
import { usePlayerStore } from '../services/store';
import { getLastPlayedVideo } from '../services/video-db';

export default function AIFeaturesScreen() {
  const { currentVideo, isPlaying, allVideos, setCurrentVideo, setActiveSubtitleTrack, setSubtitlesEnabled } = usePlayerStore();
  const { colors, accentColor } = useAppTheme();
  const [jobs, setJobs] = useState<Awaited<ReturnType<typeof getAISubtitleJobs>>>([]);
  const [loading, setLoading] = useState(true);
  const [busyVideoUri, setBusyVideoUri] = useState<string | null>(null);
  const [recentlyPlayedVideo, setRecentlyPlayedVideo] = useState<VideoAsset | null>(null);

  const refreshJobs = useCallback(async () => {
    setLoading(true);
    try {
      setJobs(await getAISubtitleJobs(20));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshRecentlyPlayed = useCallback(async () => {
    const lastPlayed = await getLastPlayedVideo();
    if (!lastPlayed) {
      setRecentlyPlayedVideo(null);
      return;
    }
    setRecentlyPlayedVideo({
      id: lastPlayed.id ?? lastPlayed.uri,
      uri: lastPlayed.uri,
      filename: lastPlayed.filename,
      duration: lastPlayed.duration,
      thumbnail: lastPlayed.thumbnail ?? null,
      folder: lastPlayed.folder ?? undefined,
      sourceType: lastPlayed.sourceType ?? undefined,
      sourceId: lastPlayed.sourceId ?? undefined,
      sourceName: lastPlayed.sourceName ?? undefined,
      streamContentType: lastPlayed.streamContentType ?? undefined,
      width: 0,
      height: 0,
      creationTime: lastPlayed.lastWatched,
    });
  }, []);

  React.useEffect(() => {
    refreshJobs();
    refreshRecentlyPlayed();
  }, [refreshJobs, refreshRecentlyPlayed]);

  const suggestedVideos = allVideos.slice(0, 6);
  const nowPlayingVideo = isPlaying && currentVideo ? currentVideo : recentlyPlayedVideo;

  const handleGenerate = async (video: VideoAsset) => {
    setBusyVideoUri(video.uri);
    try {
      const track = await generateAISubtitlesForVideo(video);
      if (currentVideo?.uri === video.uri) {
        setActiveSubtitleTrack(track);
        setSubtitlesEnabled(true);
      }
      await refreshJobs();
      alert('Subtitles ready.');
    } catch (error: any) {
      alert(error?.message || 'Unable to generate subtitles.');
    } finally {
      setBusyVideoUri(null);
    }
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <img src="/Vidara-logo.png" style={s.logoSmall} alt="Vidara logo" />
          <span style={s.headerTitle}>Vidara AI</span>
        </div>
      </div>

      <div style={s.content}>
        <div style={{ ...s.heroCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <span style={{ ...s.heroEyebrow, color: accentColor }}> SUBTITLE RETRIEVAL</span>
          <span style={{ ...s.heroTitle, color: colors.text }}>Fetch exact subtitles from Vidara subtitle AI for what people are watching.</span>
          <span style={{ ...s.heroCopy, color: colors.mutedText }}>
            Vidara handles subtitle retrieval in the background so people can focus on picking something to watch.
          </span>
        </div>

        <div style={s.section}>
          <span style={{ ...s.sectionTitle, color: colors.text }}>Now Playing</span>
          {!nowPlayingVideo ? (
            <div style={{ ...s.emptyCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <IoPlayCircleOutline size={44} color={colors.emptyIcon} />
              <span style={{ ...s.emptyTitle, color: colors.text }}>Nothing played yet</span>
              <span style={{ ...s.emptyBody, color: colors.mutedText }}>Play a movie or series and the most recent title will appear here.</span>
            </div>
          ) : (
            <div style={{ ...s.videoCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <div style={s.videoMeta}>
                <span style={{ ...s.videoTitle, color: colors.text }}>{nowPlayingVideo.filename}</span>
                <span style={{ ...s.videoDetails, color: colors.mutedText }}>
                  {nowPlayingVideo.folder ?? 'Library'} • {Math.max(1, Math.round(nowPlayingVideo.duration / 60))} mins
                </span>
                <span style={{ ...s.videoDetails, color: colors.mutedText }}>Retrieved subtitles appear directly inside the player overlay.</span>
              </div>
              <button
                style={{ ...s.primaryButton, backgroundColor: accentColor }}
                disabled={busyVideoUri === nowPlayingVideo.uri}
                onClick={() => handleGenerate(nowPlayingVideo)}
              >
                {busyVideoUri === nowPlayingVideo.uri ? 'Working...' : 'Retrieve Subtitles'}
              </button>
            </div>
          )}
        </div>

        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={{ ...s.sectionTitle, color: colors.text }}>Library Suggestions</span>
            <span style={{ ...s.sectionMeta, color: colors.mutedText }}>{suggestedVideos.length} ready</span>
          </div>
          {suggestedVideos.length === 0 ? (
            <div style={{ ...s.emptyCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <IoFilmOutline size={40} color={colors.emptyIcon} />
              <span style={{ ...s.emptyTitle, color: colors.text }}>No indexed videos yet</span>
              <span style={{ ...s.emptyBody, color: colors.mutedText }}>Connect local, Plex, NAS, or Drive sources so AI subtitle generation has media to work with.</span>
            </div>
          ) : (
            suggestedVideos.map((video) => (
              <div key={video.id} style={{ ...s.queueItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
                <div style={s.queueInfo}>
                  <span style={{ ...s.queueTitle, color: colors.text }}>{video.filename}</span>
                  <span style={{ ...s.queueSubtitle, color: colors.mutedText }}>{video.sourceName ?? 'Library'} • {video.folder ?? 'Media'}</span>
                </div>
                <div style={s.queueActions}>
                  <button style={{ ...s.secondaryButton, backgroundColor: colors.surface, borderColor: colors.borderStrong }} onClick={() => setCurrentVideo(video)}>Watch</button>
                  <button style={{ ...s.primaryInlineButton, backgroundColor: accentColor }} disabled={busyVideoUri === video.uri} onClick={() => handleGenerate(video)}>
                    {busyVideoUri === video.uri ? 'Working...' : 'Fetch Subs'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={{ ...s.sectionTitle, color: colors.text }}>Subtitle Jobs</span>
            <button onClick={refreshJobs} style={{ ...s.sectionAction, color: accentColor }}>REFRESH</button>
          </div>
          {loading ? (
            <div style={{ ...s.emptyCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>Loading...</div>
          ) : jobs.length === 0 ? (
            <div style={{ ...s.emptyCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <IoChatbubbleEllipsesOutline size={40} color={colors.emptyIcon} />
              <span style={{ ...s.emptyTitle, color: colors.text }}>No subtitle jobs yet</span>
              <span style={{ ...s.emptyBody, color: colors.mutedText }}>Fetch subtitles from the player or this screen and they’ll show up here.</span>
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job.videoUri} style={{ ...s.jobItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
                <div style={s.jobInfo}>
                  <span style={{ ...s.queueTitle, color: colors.text }}>{job.filename}</span>
                  <span style={{ ...s.queueSubtitle, color: colors.mutedText }}>{job.status.toUpperCase()} • {job.language} • {job.provider}</span>
                </div>
                <div style={{ ...s.statusPill }}>
                  <span style={{ ...s.statusPillText, color: colors.text }}>{job.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logoSmall: { width: 46, height: 46, borderRadius: 12, objectFit: 'contain', display: 'block' },
  headerTitle: { fontSize: 24, fontWeight: 800 },
  content: { flex: 1, overflowY: 'auto' },
  heroCard: { margin: '8px 16px 0', borderRadius: 24, padding: 22, border: '1px solid' },
  heroEyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, marginBottom: 12, display: 'block' },
  heroTitle: { fontSize: 28, fontWeight: 800, lineHeight: '34px', marginBottom: 12, display: 'block' },
  heroCopy: { fontSize: 15, lineHeight: '22px', display: 'block' },
  section: { marginTop: 28, padding: '0 16px' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 700, marginBottom: 16 },
  sectionMeta: { fontSize: 12, fontWeight: 700 },
  sectionAction: { fontSize: 12, fontWeight: 800, letterSpacing: 1, background: 'none', border: 'none', cursor: 'pointer' },
  emptyCard: { borderRadius: 18, padding: 22, alignItems: 'center', border: '1px solid', display: 'flex', flexDirection: 'column', gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: 700 },
  emptyBody: { fontSize: 14, lineHeight: '21px', textAlign: 'center' },
  videoCard: { borderRadius: 18, padding: 18, border: '1px solid' },
  videoMeta: { marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  videoTitle: { fontSize: 20, fontWeight: 700 },
  videoDetails: { fontSize: 13 },
  primaryButton: { borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', fontWeight: 800 },
  queueItem: { borderRadius: 16, padding: 14, border: '1px solid', marginBottom: 12 },
  queueInfo: { marginBottom: 12 },
  queueTitle: { fontSize: 15, fontWeight: 700, marginBottom: 4, display: 'block' },
  queueSubtitle: { fontSize: 12 },
  queueActions: { display: 'flex', gap: 10 },
  secondaryButton: { flex: 1, height: 42, borderRadius: 12, border: '1px solid', cursor: 'pointer' },
  primaryInlineButton: { flex: 1, height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800 },
  jobItem: { borderRadius: 16, padding: 14, border: '1px solid', marginBottom: 12, display: 'flex', alignItems: 'center' },
  jobInfo: { flex: 1, marginRight: 12 },
  statusPill: { padding: '6px 10px', borderRadius: 999, backgroundColor: 'rgba(124, 157, 255, 0.16)' },
  statusPillText: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as any },
};
