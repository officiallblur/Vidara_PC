import React, { useEffect, useState } from 'react';
import { IoChevronBack, IoSearch, IoCloseCircle, IoTimeOutline, IoArrowUpOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { getRecentLibrarySuggestions, getWatchHistory, searchVideos } from '../services/video-db';
import type { VideoAsset } from '../services/media-scanner';
import { usePlayerStore } from '../services/store';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<VideoAsset[]>([]);
  const [recentHistory, setRecentHistory] = useState<{ filename: string; uri: string }[]>([]);
  const [librarySuggestions, setLibrarySuggestions] = useState<VideoAsset[]>([]);
  const [progressByUri, setProgressByUri] = useState<Record<string, { position: number; duration: number }>>({});
  const { setCurrentVideo, currentVideo } = usePlayerStore();
  const { colors } = useAppTheme();
  const navigate = useNavigate();

  useEffect(() => {
    async function loadInitialData() {
      const [history, suggestions] = await Promise.all([getWatchHistory(500), getRecentLibrarySuggestions(8)]);
      setRecentHistory(history.map((item) => ({ filename: item.filename, uri: item.uri })));
      setProgressByUri(history.reduce<Record<string, { position: number; duration: number }>>((acc, item) => {
        acc[item.uri] = { position: item.position, duration: item.duration };
        return acc;
      }, {}));
      setLibrarySuggestions(suggestions);
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!query) {
        setResults([]);
        return;
      }
      const data = await searchVideos(query);
      setResults(data);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const formatTime = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const getDurationLabel = (video: VideoAsset) => {
    const duration = progressByUri[video.uri]?.duration || video.duration || 0;
    if (!duration) return '0 mins';
    const mins = Math.max(1, Math.round(duration / 60));
    return `${mins} mins`;
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}><IoChevronBack size={28} color={colors.text} /></button>
        <div style={{ ...s.searchBar, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <IoSearch size={20} color={colors.subtleText} />
          <input style={{ ...s.input, color: colors.text }} placeholder="Search movies, series, files..." value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          {query.length > 0 && (
            <button style={s.clearBtn} onClick={() => setQuery('')}><IoCloseCircle size={20} color={colors.subtleText} /></button>
          )}
        </div>
      </div>

      <div style={s.scroll}>
        {query.length === 0 ? (
          <div style={s.placeholder}>
            <span style={{ ...s.sectionLabel, color: colors.subtleText }}>RECENT SEARCHES</span>
            {recentHistory.length === 0 ? (
              <span style={{ ...s.emptyHint, color: colors.mutedText }}>Your recently watched titles will appear here.</span>
            ) : recentHistory.map((item, i) => (
              <div key={`${item.uri}-${i}`} style={{ ...s.historyItem, borderBottomColor: colors.secondarySurface }} onClick={() => setQuery(item.filename)}>
                <IoTimeOutline size={20} color={colors.icon} />
                <span style={{ ...s.historyText, color: colors.text }}>{item.filename}</span>
                <IoArrowUpOutline size={16} color={colors.icon} style={{ transform: 'rotate(-45deg)' }} />
              </div>
            ))}

            <span style={{ ...s.sectionLabel, marginTop: 32, color: colors.subtleText }}>RECENTLY ADDED</span>
            {librarySuggestions.length === 0 ? (
              <span style={{ ...s.emptyHint, color: colors.mutedText }}>Your indexed library will show up here once media is scanned.</span>
            ) : (
              <div style={s.trendingContainer}>
                {librarySuggestions.map((video) => (
                  <button key={video.id} style={{ ...s.tag, backgroundColor: colors.elevatedSurface, borderColor: colors.border }} onClick={() => setQuery(video.filename)}>
                    <span style={{ ...s.tagText, color: colors.accent }}>{video.filename}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={s.resultsContainer}>
            <span style={{ ...s.sectionLabel, color: colors.subtleText }}>{results.length} RESULTS FOUND</span>
            {results.map((video) => (
              <div key={video.id} style={{ ...s.resultItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
                <div style={{ ...s.thumbWrapper, backgroundColor: colors.thumbnailFallback }}>
                  <img src={video.uri} style={s.thumb} alt="" />
                  <button style={s.playOverlay} onClick={() => setCurrentVideo(video)}>▶</button>
                </div>
                <div style={s.info}>
                  <span style={{ ...s.title, color: colors.text }}>{video.filename}</span>
                  {currentVideo?.uri === video.uri ? (
                    <span style={{ ...s.meta, color: colors.accent }}>NOW PLAYING • {formatTime(progressByUri[video.uri]?.position ?? 0)}</span>
                  ) : (
                    <span style={{ ...s.meta, color: colors.mutedText }}>{getDurationLabel(video)} • {video.folder}</span>
                  )}
                </div>
                <button
                  style={{ ...s.playBtn, color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }}
                  onClick={() => setCurrentVideo(video)}
                >
                  Play
                </button>
              </div>
            ))}
            {results.length === 0 && (
              <div style={s.noResults}>
                <IoSearch size={64} color={colors.emptyIcon} />
                <span style={{ ...s.noResultsText, color: colors.mutedText }}>No matches found for "{query}"</span>
              </div>
            )}
          </div>
        )}
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', padding: '16px', gap: 12 },
  backBtn: { width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer' },
  searchBar: { flex: 1, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 12px', border: '1px solid', gap: 10 },
  input: { flex: 1, fontSize: 16, background: 'none', border: 'none', outline: 'none' },
  clearBtn: { background: 'none', border: 'none', cursor: 'pointer' },
  scroll: { padding: '0 16px', overflowY: 'auto', flex: 1 },
  placeholder: { marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, marginBottom: 16, display: 'block' },
  historyItem: { display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid', gap: 12, cursor: 'pointer' },
  historyText: { flex: 1, fontSize: 15 },
  emptyHint: { fontSize: 14, lineHeight: '20px' },
  trendingContainer: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  tag: { padding: '8px 16px', borderRadius: 20, border: '1px solid', background: 'none', cursor: 'pointer' },
  tagText: { fontSize: 13, fontWeight: 600 },
  resultsContainer: { marginTop: 24 },
  resultItem: { display: 'flex', alignItems: 'center', marginBottom: 16, padding: 12, borderRadius: 16, border: '1px solid' },
  thumbWrapper: { width: 64, height: 44, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  thumb: { width: '100%', height: '100%', objectFit: 'cover' },
  playOverlay: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', border: 'none', cursor: 'pointer' },
  info: { flex: 1, marginLeft: 16 },
  title: { fontSize: 15, fontWeight: 600, marginBottom: 4, display: 'block' },
  meta: { fontSize: 11, fontWeight: 600 },
  playBtn: { padding: '6px 12px', borderRadius: 999, border: '1px solid', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  noResults: { alignItems: 'center', marginTop: 100, display: 'flex', flexDirection: 'column', gap: 16 },
  noResultsText: { fontSize: 15 },
};
