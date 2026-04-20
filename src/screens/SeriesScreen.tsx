import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IoChevronBack, IoTrashOutline } from 'react-icons/io5';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { deleteVideoByUri, getVideosFromDB, getWatchHistory } from '../services/video-db';
import { TMDBApi } from '../services/tmdb-api';
import type { VideoAsset } from '../services/media-scanner';
import { usePlayerStore } from '../services/store';
import { getAllSettings } from '../services/database';

type DisplayMode = 'grid' | 'list';

const DISPLAY_MODE_KEY = 'libraryDisplayMode';

const parseSeasonEpisode = (filename: string) => {
  const source = filename || '';
  const compactMatch = source.match(/S(\d{1,2})\s*E(\d{1,3})/i);
  if (compactMatch) return { season: Number(compactMatch[1]), episode: Number(compactMatch[2]) };
  const longMatch = source.match(/Season\s*(\d{1,2})\D+Episode\s*(\d{1,3})/i);
  if (longMatch) return { season: Number(longMatch[1]), episode: Number(longMatch[2]) };
  const xMatch = source.match(/(\d{1,2})x(\d{1,3})/i);
  if (xMatch) return { season: Number(xMatch[1]), episode: Number(xMatch[2]) };
  const episodeOnly = source.match(/(?:Episode|Ep)\s*(\d{1,3})/i);
  if (episodeOnly) return { season: null, episode: Number(episodeOnly[1]) };
  return { season: null, episode: null };
};

export default function SeriesScreen() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [progressByUri, setProgressByUri] = useState<Record<string, { position: number; duration: number; thumbnail: string | null }>>({});
  const [posterByUri, setPosterByUri] = useState<Record<string, string | null>>({});
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; video: VideoAsset } | null>(null);
  const [detailsVideo, setDetailsVideo] = useState<VideoAsset | null>(null);
  const { setCurrentVideo, currentVideo } = usePlayerStore();
  const { colors } = useAppTheme();
  const longPressTimerRef = useRef<number | null>(null);

  const load = async () => {
    const [data, history] = await Promise.all([getVideosFromDB('Series'), getWatchHistory(500)]);
    const progressMap = history.reduce<Record<string, { position: number; duration: number; thumbnail: string | null }>>((acc, item) => {
      acc[item.uri] = { position: item.position, duration: item.duration, thumbnail: item.thumbnail ?? null };
      return acc;
    }, {});
    setVideos(data);
    setProgressByUri(progressMap);
  };

  const handleDelete = async (video: VideoAsset) => {
    if (!confirm(`Remove "${video.filename}" from Series?`)) return;
    await deleteVideoByUri(video.uri);
    if (currentVideo?.uri === video.uri) {
      setCurrentVideo(null);
    }
    await load();
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [currentVideo?.uri]);

  useEffect(() => {
    let active = true;
    const loadDisplayMode = async () => {
      const settings = await getAllSettings();
      if (!active) return;
      const savedDisplay = settings[DISPLAY_MODE_KEY];
      if (savedDisplay === 'grid' || savedDisplay === 'list') {
        setDisplayMode(savedDisplay);
      }
    };
    loadDisplayMode().catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPosters = async () => {
      const missing = videos.filter((video) => !progressByUri[video.uri]?.thumbnail && !video.thumbnail);
      const posters = await Promise.all(
        missing.map(async (video) => [video.uri, await TMDBApi.searchPoster(video.filename)] as const)
      );
      if (cancelled) return;
      setPosterByUri((prev) => {
        const next = { ...prev };
        for (const [uri, poster] of posters) next[uri] = poster;
        return next;
      });
    };
    if (videos.length > 0) {
      loadPosters().catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [progressByUri, videos]);

  const formatProgress = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  };

  const formatResolution = (video: VideoAsset) => {
    if (video.width > 0 && video.height > 0) return `${video.width} x ${video.height}`;
    return 'Unknown';
  };

  const closeContextMenu = () => setContextMenu(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => closeContextMenu();
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [contextMenu]);

  const openContextMenu = (video: VideoAsset, x: number, y: number) => {
    setContextMenu({ video, x, y });
  };

  const startLongPress = (video: VideoAsset, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    const rect = event.currentTarget.getBoundingClientRect();
    longPressTimerRef.current = window.setTimeout(() => {
      openContextMenu(video, rect.left + rect.width - 12, rect.top + 12);
    }, 500);
  };

  const clearLongPress = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const getThumbSrc = (video: VideoAsset) => progressByUri[video.uri]?.thumbnail || video.thumbnail || posterByUri[video.uri] || '/icon.png';

  const gridTemplate = useMemo(
    () => (displayMode === 'grid' ? 'repeat(5, minmax(0, 1fr))' : '1fr'),
    [displayMode]
  );

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => window.history.back()}><IoChevronBack size={28} color={colors.text} /></button>
        <span style={{ ...s.headerTitle, color: colors.text }}>Series</span>
        <div style={s.headerBtn} />
      </div>

      <div style={s.scroll}>
        <div style={{ ...s.grid, gridTemplateColumns: gridTemplate }}>
          {videos.map((video) => {
            const progress = progressByUri[video.uri];
            const progressRatio = progress ? Math.min(1, progress.position / Math.max(progress.duration, 1)) : 0;
            const thumbSrc = getThumbSrc(video);
            const { season, episode } = parseSeasonEpisode(video.filename);
            const badgeLabel = season !== null && episode !== null ? `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}` : episode !== null ? `EP ${episode}` : 'SERIES';
            const baseMetaLabel = season !== null && episode !== null ? `Season ${season} • Episode ${episode}` : episode !== null ? `Episode ${episode}` : 'Series title';
            const metaLabel = progress && progress.position > 0 ? `Continue from ${formatProgress(progress.position)}` : baseMetaLabel;
            return (
              <div
                key={video.id}
                style={{ ...s.card, ...(displayMode === 'list' ? s.cardList : {}) }}
                onClick={() => setCurrentVideo(video)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openContextMenu(video, event.clientX, event.clientY);
                }}
                onPointerDown={(event) => startLongPress(video, event)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setCurrentVideo(video);
                  }
                }}
              >
                <div style={{ ...s.thumbWrapper, ...(displayMode === 'list' ? s.thumbWrapperList : {}), backgroundColor: colors.thumbnailFallback }}>
                  <img src={thumbSrc} style={s.thumb} alt="" />
                  <div style={{ ...s.durationBadge, backgroundColor: colors.accent }}>
                    <span style={s.durationText}>{badgeLabel}</span>
                  </div>
                  <button
                    style={s.deleteBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(video);
                    }}
                    aria-label="Delete series"
                  >
                    <IoTrashOutline size={14} color="#fff" />
                  </button>
                </div>
                <div style={{ ...(displayMode === 'list' ? s.infoColumn : {}) }}>
                  <span style={{ ...s.title, color: colors.text }}>{video.filename}</span>
                  <span style={{ ...s.meta, color: colors.mutedText }}>{metaLabel}</span>
                  <div style={{ ...s.progressTrack, backgroundColor: colors.progressTrack }}>
                    <div style={{ ...s.progressFill, backgroundColor: colors.accent, width: `${progressRatio * 100}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {contextMenu && (
        <div
          style={{
            ...s.contextMenu,
            backgroundColor: colors.elevatedSurface,
            borderColor: colors.border,
            left: Math.min(contextMenu.x, window.innerWidth - 196),
            top: Math.min(contextMenu.y, window.innerHeight - 156),
          }}
        >
          <button style={{ ...s.contextAction, color: colors.text }} onClick={() => { setCurrentVideo(contextMenu.video); closeContextMenu(); }}>
            Play
          </button>
          <button style={{ ...s.contextAction, color: colors.text }} onClick={() => { setDetailsVideo(contextMenu.video); closeContextMenu(); }}>
            About Series
          </button>
          <button style={{ ...s.contextAction, color: '#ff7b7b' }} onClick={() => { void handleDelete(contextMenu.video); closeContextMenu(); }}>
            Delete
          </button>
        </div>
      )}
      {detailsVideo && (
        <div style={s.detailsOverlay} onClick={() => setDetailsVideo(null)}>
          <div
            style={{ ...s.detailsCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={s.detailsHeader}>
              <div style={s.detailsHeaderCopy}>
                <span style={{ ...s.detailsEyebrow, color: colors.accent }}>ABOUT SERIES</span>
                <span style={{ ...s.detailsTitle, color: colors.text }}>{detailsVideo.filename}</span>
              </div>
              <button style={{ ...s.detailsClose, color: colors.mutedText }} onClick={() => setDetailsVideo(null)}>Close</button>
            </div>
            <div style={s.detailsGrid}>
              {[
                ['Duration', formatDuration(detailsVideo.duration)],
                ['Resolution', formatResolution(detailsVideo)],
                ['Folder', detailsVideo.folder || 'Uncategorized'],
                ['Source', detailsVideo.sourceName || detailsVideo.sourceType || 'Library'],
                ['Added', detailsVideo.creationTime ? new Date(detailsVideo.creationTime).toLocaleString() : 'Unknown'],
                ['Playback Type', detailsVideo.streamContentType || 'auto'],
                ['Location', detailsVideo.sourceId || detailsVideo.uri],
              ].map(([label, value]) => (
                <div key={label} style={{ ...s.detailRow, borderColor: colors.border }}>
                  <span style={{ ...s.detailLabel, color: colors.mutedText }}>{label}</span>
                  <span style={{ ...s.detailValue, color: colors.text }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' },
  backBtn: { width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer' },
  headerTitle: { fontSize: 20, fontWeight: 700 },
  headerBtn: { width: 44, height: 44 },
  scroll: { padding: '0 16px', overflowY: 'auto', flex: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 },
  card: { cursor: 'pointer' },
  cardList: { display: 'flex', alignItems: 'center', gap: 14, borderRadius: 14, padding: 10 },
  thumbWrapper: { width: '100%', aspectRatio: '16/10', borderRadius: 12, overflow: 'hidden', marginBottom: 8, position: 'relative' },
  thumbWrapperList: { width: 180, flexShrink: 0, marginBottom: 0 },
  thumb: { width: '100%', height: '100%', objectFit: 'cover' },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, padding: '2px 6px', borderRadius: 4 },
  durationText: { color: '#000', fontSize: 10, fontWeight: 800 },
  title: { fontSize: 14, fontWeight: 600, marginBottom: 2, display: 'block' },
  meta: { fontSize: 11 },
  infoColumn: { flex: 1, minWidth: 0 },
  deleteBtn: { position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  progressTrack: { height: 4, borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  contextMenu: { position: 'fixed', minWidth: 180, borderRadius: 14, borderWidth: 1, borderStyle: 'solid', padding: 6, zIndex: 30, boxShadow: '0 24px 48px rgba(0,0,0,0.24)' },
  contextAction: { width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  detailsOverlay: { position: 'fixed', inset: 0, background: 'rgba(3, 6, 10, 0.58)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 40 },
  detailsCard: { width: 'min(720px, 100%)', borderRadius: 24, border: '1px solid', padding: 24, boxShadow: '0 30px 70px rgba(0,0,0,0.32)' },
  detailsHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 },
  detailsHeaderCopy: { display: 'flex', flexDirection: 'column', gap: 6 },
  detailsEyebrow: { fontSize: 11, fontWeight: 800, letterSpacing: 1.2 },
  detailsTitle: { fontSize: 24, fontWeight: 800, lineHeight: '30px' },
  detailsClose: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  detailsGrid: { display: 'grid', gap: 12 },
  detailRow: { border: '1px solid', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 },
  detailLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.8 },
  detailValue: { fontSize: 14, fontWeight: 600, wordBreak: 'break-word' },
};
