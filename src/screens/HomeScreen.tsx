import React, { useCallback, useEffect, useState } from 'react';
import { IoSearch, IoEllipsisVertical, IoAddCircle, IoPhonePortrait, IoFilm, IoTv, IoAdd, IoCloudOutline, IoServerOutline, IoLogoGoogle, IoPlayCircle } from 'react-icons/io5';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { usePlayerStore } from '../services/store';
import { useAppTheme } from '../hooks/use-app-theme';
import { TMDBApi } from '../services/tmdb-api';
import type { MovieRelease } from '../services/ai-provider';
import { getLastPlayedVideo, getLatestWatchHistory, getMostPlayedVideos, getVideoByFilename, getVideoById, getVideoBySourceId, getVideoByUri, updateVideoUriById } from '../services/video-db';
import type { VideoAsset } from '../services/media-scanner';
import { getSourceStats, loadMediaSources, type MediaSourceConfig, refreshLibrary, syncLocalSource } from '../services/media-sources';
import { inferStreamContentType } from '../services/network-streams';
import { useNavigate } from 'react-router-dom';
import db from '../services/database';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';

export default function HomeScreen() {
  const { setCurrentVideo, allVideos, currentVideo } = usePlayerStore();
  const { colors, isLight, accentColor } = useAppTheme();
  const navigate = useNavigate();
  const [mostPlayed, setMostPlayed] = useState<(VideoAsset & { play_count: number })[]>([]);
  const [heroVideo, setHeroVideo] = useState<any>(null);
  const [discoveryMovies, setDiscoveryMovies] = useState<MovieRelease[]>([]);
  const [sources, setSources] = useState<MediaSourceConfig[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});

  const refreshHeroVideo = useCallback(async () => {
    const latestHistory = await getLastPlayedVideo();
    const fallbackHistory = latestHistory ?? await getLatestWatchHistory();
    if (!fallbackHistory) {
      setHeroVideo(null);
      return;
    }

    let libraryMatch: VideoAsset | null = null;
    try {
      if (fallbackHistory.id) {
        libraryMatch = await getVideoById(fallbackHistory.id);
      }
      if (!libraryMatch && latestHistory?.sourceId) {
        libraryMatch = await getVideoBySourceId(latestHistory.sourceId);
      }
      if (!libraryMatch) {
        libraryMatch = await getVideoByUri(fallbackHistory.uri);
      }
      if (!libraryMatch && fallbackHistory.filename) {
        libraryMatch = await getVideoByFilename(fallbackHistory.filename);
      }
    } catch {
      libraryMatch = null;
    }

    const thumbnail = fallbackHistory.thumbnail ?? libraryMatch?.thumbnail ?? null;
    const posterUri = thumbnail ? null : await TMDBApi.searchPoster(fallbackHistory.filename);

    setHeroVideo({
      ...fallbackHistory,
      thumbnail,
      posterUri,
      sourceId: latestHistory?.sourceId ?? libraryMatch?.sourceId ?? null,
      sourceType: latestHistory?.sourceType ?? libraryMatch?.sourceType ?? null,
      sourceName: latestHistory?.sourceName ?? libraryMatch?.sourceName ?? null,
    });
  }, []);

  const loadData = useCallback(async () => {
    const [played, trending, loadedSources, stats] = await Promise.all([
      getMostPlayedVideos(100),
      TMDBApi.getLatestReleases(),
      loadMediaSources(),
      getSourceStats(),
    ]);
    await refreshHeroVideo();
    setMostPlayed(played);
    setDiscoveryMovies(trending);
    setSources(loadedSources);
    setSourceCounts({
      local: stats.get('local')?.count ?? 0,
      plex: stats.get('plex')?.count ?? 0,
      nas: stats.get('nas')?.count ?? 0,
      gdrive: stats.get('gdrive')?.count ?? 0,
    });
  }, [refreshHeroVideo]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshHeroVideo]);

  useEffect(() => {
    refreshHeroVideo();
  }, [currentVideo?.uri, refreshHeroVideo]);

  const handlePickFile = async () => {
    const selection = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'mov', 'm4v', 'avi', 'webm'] }],
    });
    if (!selection || Array.isArray(selection)) return;
    const path = selection;
    const url = convertFileSrc(path);

    const existing = await getVideoBySourceId(path) || await getVideoByFilename(path.split('/').pop() || path);
    if (existing && existing.sourceType === 'local') {
      await updateVideoUriById(existing.id, url);
      setCurrentVideo({ ...existing, uri: url });
      return;
    }

    const filename = path.split('/').pop() || 'Local Video';
    const importedVideo: VideoAsset = {
      id: `imported:${Date.now()}`,
      uri: url,
      filename,
      duration: 0,
      width: 0,
      height: 0,
      folder: 'Local',
      sourceType: 'local',
      sourceId: path,
      sourceName: 'File Manager',
    };
    await db.videos.put({
      id: importedVideo.id, uri: importedVideo.uri, filename: importedVideo.filename,
      duration: 0, folder: 'Local', thumbnail: null, date_added: Date.now(), play_count: 0,
      source_type: 'local', source_id: path, source_name: 'File Manager',
    });
    await refreshLibrary();
    setCurrentVideo(importedVideo);
  };

  const getCount = (folder: string) => allVideos.filter((v) => v.folder === folder).length;
  const getSourceStatus = (type: string) => sources.find((s) => s.type === type)?.status ?? (type === 'local' ? 'connected' : 'disconnected');
  const getSourceLabel = (type: string) => {
    const count = sourceCounts[type] ?? 0;
    const status = getSourceStatus(type);
    if (type === 'local') return `${count} INDEXED`;
    if (status === 'connected') return `${count} INDEXED`;
    if (status === 'error') return 'CHECK CONFIG';
    return 'NOT CONNECTED';
  };

  const handleLocalRefresh = async () => {
    await syncLocalSource();
    const stats = await getSourceStats();
    setSourceCounts((prev) => ({ ...prev, local: stats.get('local')?.count ?? 0 }));
  };

  const handleHeroOpen = async () => {
    if (!heroVideo) return;
    const fallbackVideo: VideoAsset = {
      id: heroVideo.id ?? heroVideo.uri,
      uri: heroVideo.uri, filename: heroVideo.filename, duration: heroVideo.duration,
      width: 0, height: 0, thumbnail: heroVideo.thumbnail,
      folder: heroVideo.folder ?? undefined,
      sourceType: heroVideo.sourceType ?? undefined,
      sourceId: heroVideo.sourceId ?? undefined,
      sourceName: heroVideo.sourceName ?? undefined,
      streamContentType: heroVideo.streamContentType ?? inferStreamContentType(heroVideo.uri),
    };
    let resolved: VideoAsset | null = null;
    try {
      if (heroVideo.id) resolved = await getVideoById(heroVideo.id);
      if (!resolved) resolved = await getVideoByUri(heroVideo.uri);
    } catch {}
    setCurrentVideo(resolved ?? allVideos.find((v) => v.uri === heroVideo.uri) ?? fallbackVideo);
  };

  const renderFolderCard = (title: string, count: string | null, Icon: any, desc: string, onPress?: () => void) => (
    <div onClick={onPress} style={{ ...s.folderCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border, cursor: 'pointer' }}>
      <div style={{ ...s.folderIconContainer, backgroundColor: colors.accentSoft }}>
        <Icon size={24} color={accentColor} />
      </div>
      {count && <span style={{ ...s.folderCount, color: colors.subtleText }}>{count}</span>}
      <span style={{ ...s.folderTitle, color: colors.text }}>{title}</span>
      <span style={{ ...s.folderDesc, color: colors.mutedText }}>{desc}</span>
    </div>
  );

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <img src="/Vidara-logo.png" style={s.logoSmall} alt="Vidara logo" />
          <ThemedText style={s.headerTitle}>Vidara</ThemedText>
        </div>
        <div style={s.headerIcons}>
          <button style={s.headerBtn} onClick={() => navigate('/search')}><IoSearch size={24} color={colors.text} /></button>
          <button style={s.headerBtn} onClick={() => navigate('/modal')}><IoEllipsisVertical size={24} color={colors.text} /></button>
        </div>
      </div>

      <div style={s.content}>
        <div style={s.sectionHeader}>
          <span style={{ ...s.sectionTitle, color: colors.text }}>Recently Watched</span>
          <button style={{ ...s.viewHistory, color: accentColor, background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/history')}>VIEW HISTORY</button>
        </div>

        {heroVideo && (
          <div style={s.heroCard} onClick={handleHeroOpen}>
            <img
              src={heroVideo.thumbnail || heroVideo.posterUri || '/icon.png'}
              style={s.heroImage}
              alt=""
            />
            <div style={{ ...s.heroGradient, background: `linear-gradient(transparent, ${isLight ? 'rgba(255,255,255,0.96)' : 'rgba(4,4,5,0.95)'})` }} />
            <div style={s.heroContent}>
              <div style={s.badgeContainer}>
                <div style={{ ...s.newBadge, backgroundColor: accentColor }}>
                  <span style={s.badgeText}>RESUME</span>
                </div>
                <span style={{ ...s.timeRemaining, color: colors.mutedText }}>
                  {Math.round((heroVideo.duration - heroVideo.position) / 60)}m remaining
                </span>
              </div>
              <span style={{ ...s.heroTitle, color: colors.text }}>{heroVideo.filename}</span>
              <div style={{ ...s.heroProgressBar, backgroundColor: colors.progressTrack }}>
                <div style={{ ...s.heroProgressFill, width: `${(heroVideo.position / heroVideo.duration) * 100}%`, backgroundColor: accentColor }} />
              </div>
            </div>
          </div>
        )}

        <span style={{ ...s.sectionTitleMargin, color: colors.text }}>Local Folders</span>
        <div style={s.folderGrid}>
          {renderFolderCard('Local Device', null, IoPhonePortrait, 'Videos found on this device', handlePickFile)}
          {renderFolderCard('Movies', `${getCount('Movies')} FILES`, IoFilm, 'Auto-filled from what you watch', () => navigate('/movies'))}
          {renderFolderCard('Series', `${getCount('Series')} VIDEOS`, IoTv, 'Auto-filled from Season/Episode titles', () => navigate('/series'))}
          <div onClick={() => navigate('/add-source')} style={{ ...s.folderCard, ...s.addFolderCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border, cursor: 'pointer' }}>
            <div style={{ ...s.addIconContainer, backgroundColor: colors.surface }}>
              <IoAdd size={28} color={accentColor} />
            </div>
            <span style={{ ...s.folderTitle, color: colors.text }}>Cloud Source</span>
            <span style={{ ...s.folderDesc, color: colors.mutedText }}>Connect NAS, Plex or Google Drive</span>
          </div>
        </div>

        <div style={s.sectionHeader}>
          <span style={{ ...s.sectionTitle, color: colors.text }}>Media Sources</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => navigate('/add-source')}>
            <IoAddCircle size={24} color={accentColor} />
          </button>
        </div>
        <div style={s.sourcesScroll}>
          {[
            { icon: IoPhonePortrait, label: 'LOCAL', color: accentColor, type: 'local' as const, onPress: handleLocalRefresh },
            { icon: IoServerOutline, label: 'PLEX', color: '#F9A825', type: 'plex' as const, onPress: () => navigate('/add-source') },
            { icon: IoCloudOutline, label: 'NAS', color: '#AAA', type: 'nas' as const, onPress: () => navigate('/add-source') },
            { icon: IoLogoGoogle, label: 'DRIVE', color: '#7CE0B8', type: 'gdrive' as const, onPress: () => navigate('/add-source') },
          ].map((item) => (
            <div key={item.label} style={s.sourceCard} onClick={item.onPress}>
              <div style={{ ...s.sourceGradient, background: isLight ? colors.elevatedSurface : colors.surface, borderColor: colors.border }}>
                <item.icon size={20} color={item.color} />
                <span style={{ ...s.sourceLabel, color: colors.text }}>{item.label}</span>
                <span style={{ ...s.sourceStatus, color: colors.mutedText }}>{getSourceLabel(item.type)}</span>
              </div>
            </div>
          ))}
        </div>

        <span style={{ ...s.sectionTitleMargin, color: colors.text }}>Most Played</span>
        <div style={s.mostPlayedList}>
          {mostPlayed.map((video) => (
            <div key={video.id} style={{ ...s.playedItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }} onClick={() => setCurrentVideo(video)}>
              <img src={video.thumbnail || '/icon.png'} style={{ ...s.playedThumb, backgroundColor: colors.thumbnailFallback }} alt="" />
              <div style={s.playedInfo}>
                <span style={{ ...s.playedTitle, color: colors.text }}>{video.filename}</span>
                <span style={{ ...s.playedCount, color: colors.mutedText }}>Watched {video.play_count} {video.play_count === 1 ? 'time' : 'times'}</span>
              </div>
              <IoPlayCircle size={32} color={accentColor} />
            </div>
          ))}
          {mostPlayed.length === 0 && (
            <div style={s.emptyPlayed}>
              <span style={{ color: colors.mutedText }}>Watch videos to see your most played here.</span>
            </div>
          )}
        </div>

        <span style={{ ...s.sectionTitleMargin, color: colors.text }}>Discovery</span>
        <div style={s.posterGrid}>
          {discoveryMovies.slice(0, 14).map((item) => (
            <div key={item.id} style={s.posterItem} onClick={() => navigate(`/movie-details?title=${encodeURIComponent(item.title)}&year=${item.releaseYear}&posterUri=${encodeURIComponent(item.posterUri)}&genre=${encodeURIComponent(item.genre)}&matchScore=${item.matchScore}`)}>
              <div style={s.posterWrapper}>
                <img src={item.posterUri} style={s.posterImage} alt="" />
                <div style={{ ...s.matchBadge, backgroundColor: `${accentColor}CC` }}>
                  <span style={s.matchText}>{item.matchScore}% MATCH</span>
                </div>
              </div>
              <span style={{ ...s.posterTitle, color: colors.text }}>{item.title}</span>
              <span style={{ ...s.posterGenre, color: colors.mutedText }}>{item.genre} • {item.releaseYear}</span>
            </div>
          ))}
        </div>

        <div style={{ height: 100 }} />
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 16px 16px 16px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logoSmall: { width: 46, height: 46, borderRadius: 12, objectFit: 'contain', display: 'block' },
  headerTitle: { fontSize: 24, fontWeight: 800 },
  headerIcons: { display: 'flex', gap: 16 },
  headerBtn: { padding: 4, background: 'none', border: 'none', cursor: 'pointer' },
  content: { flex: 1, overflowY: 'auto', paddingBottom: 20 },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: 20, marginTop: 10 },
  sectionTitle: { fontSize: 22, fontWeight: 700 },
  sectionTitleMargin: { fontSize: 22, fontWeight: 700, padding: '0 16px', marginTop: 32, marginBottom: 20, display: 'block' },
  viewHistory: { fontSize: 12, fontWeight: 700, letterSpacing: 1 },
  heroCard: { margin: '0 16px', height: 480, borderRadius: 24, overflow: 'hidden', position: 'relative', cursor: 'pointer' },
  heroImage: { width: '100%', height: '100%', objectFit: 'cover' },
  heroGradient: { position: 'absolute', inset: 0 },
  heroContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  badgeContainer: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 },
  newBadge: { padding: '4px 8px', borderRadius: 4 },
  badgeText: { color: '#000', fontSize: 10, fontWeight: 700 },
  timeRemaining: { fontSize: 12 },
  heroTitle: { fontSize: 28, fontWeight: 700, marginBottom: 16, display: 'block' },
  heroProgressBar: { height: 4, borderRadius: 2 },
  heroProgressFill: { height: '100%', borderRadius: 2 },
  folderGrid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', padding: '0 16px', gap: 12 },
  folderCard: { borderRadius: 16, padding: 14, borderWidth: 1, borderStyle: 'solid', display: 'flex', flexDirection: 'column' },
  addFolderCard: {},
  folderIconContainer: { width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  addIconContainer: { width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  folderCount: { fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8 },
  folderTitle: { fontSize: 16, fontWeight: 600, marginBottom: 4 },
  folderDesc: { fontSize: 12 },
  sourcesScroll: { display: 'flex', gap: 12, padding: '0 16px', overflowX: 'auto' },
  sourceCard: { cursor: 'pointer', flexShrink: 0 },
  sourceGradient: { padding: 16, borderRadius: 16, borderWidth: 1, borderStyle: 'solid', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 100 },
  sourceLabel: { fontSize: 12, fontWeight: 700 },
  sourceStatus: { fontSize: 10, fontWeight: 600 },
  mostPlayedList: { padding: '0 16px' },
  playedItem: { display: 'flex', alignItems: 'center', borderRadius: 18, padding: 12, borderWidth: 1, borderStyle: 'solid', marginBottom: 14, cursor: 'pointer', gap: 14 },
  playedThumb: { width: 80, height: 52, borderRadius: 10, objectFit: 'cover' },
  playedInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  playedTitle: { fontSize: 15, fontWeight: 700 },
  playedCount: { fontSize: 12 },
  emptyPlayed: { padding: 20, textAlign: 'center' },
  posterGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', padding: '0 16px', gap: 10 },
  posterItem: { cursor: 'pointer' },
  posterWrapper: { position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 6 },
  posterImage: { width: '100%', aspectRatio: '2/3', objectFit: 'cover', display: 'block' },
  matchBadge: { position: 'absolute', bottom: 8, left: 8, padding: '4px 8px', borderRadius: 6 },
  matchText: { color: '#fff', fontSize: 10, fontWeight: 700 },
  posterTitle: { fontSize: 12, fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  posterGenre: { fontSize: 10, display: 'block' },
};
