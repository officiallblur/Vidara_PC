import React, { useEffect, useState } from 'react';
import { IoSearch, IoGrid, IoList } from 'react-icons/io5';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { getVideosFromDB } from '../services/video-db';
import type { VideoAsset } from '../services/media-scanner';
import { usePlayerStore } from '../services/store';
import { useAppTheme } from '../hooks/use-app-theme';

export default function ExploreScreen() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { setCurrentVideo } = usePlayerStore();
  const { colors } = useAppTheme();

  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const assets = await getVideosFromDB(searchQuery);
        setVideos(assets);
      } finally {
        setLoading(false);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  if (loading && videos.length === 0) {
    return (
      <ThemedView style={s.centerContainer}>
        <span style={{ color: colors.accent }}>Loading...</span>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/Vidara-logo.png" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'contain', display: 'block' }} alt="Vidara logo" />
          <ThemedText type="title" style={{ fontSize: 24 }}>Vidara Library</ThemedText>
        </div>
        <button onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')} style={s.iconBtn}>
          {viewMode === 'grid' ? <IoList size={24} color={colors.text} /> : <IoGrid size={24} color={colors.text} />}
        </button>
      </div>

      <div style={{ ...s.searchContainer, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
        <IoSearch size={20} color={colors.subtleText} />
        <input
          style={{ ...s.searchInput, color: colors.text }}
          placeholder="Search videos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {videos.length === 0 ? (
        <ThemedView style={s.centerContainer}>
          <ThemedText>No videos found.</ThemedText>
        </ThemedView>
      ) : (
        <div style={{ ...s.list, ...(viewMode === 'grid' ? s.grid : {}) }}>
          {videos.map((item) => (
            <div
              key={item.id}
              style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border, ...(viewMode === 'list' ? s.cardList : {}) }}
              onClick={() => setCurrentVideo(item)}
            >
              <div style={{ ...s.thumbnailPlaceholder, backgroundColor: colors.thumbnailFallback, ...(viewMode === 'list' ? s.thumbnailList : {}) }}>
                <img src={item.uri} style={s.thumbnail} alt="" />
                <div style={s.durationBadge}>
                  <span style={s.durationText}>{formatDuration(item.duration)}</span>
                </div>
              </div>
              <div style={{ ...(viewMode === 'list' ? s.infoList : {}) }}>
                <span style={{ ...s.title, color: colors.text }}>{item.filename}</span>
                {item.folder && <span style={{ ...s.folderText, color: colors.mutedText }}>📁 {item.folder}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  centerContainer: { display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%' },
  header: { padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { padding: 8, background: 'none', border: 'none', cursor: 'pointer' },
  searchContainer: { display: 'flex', alignItems: 'center', margin: '0 16px 16px', borderRadius: 8, border: '1px solid', padding: '0 12px', height: 48, gap: 8 },
  searchInput: { flex: 1, fontSize: 16, background: 'none', border: 'none', outline: 'none' },
  list: { padding: 8, overflowY: 'auto', flex: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, padding: 16 },
  card: { borderRadius: 12, overflow: 'hidden', border: '1px solid', cursor: 'pointer', marginBottom: 16 },
  cardList: { display: 'flex', flexDirection: 'row', borderRadius: 12 },
  thumbnailPlaceholder: { width: '100%', aspectRatio: '16/9', position: 'relative' },
  thumbnailList: { width: 120, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', flexShrink: 0 },
  thumbnail: { width: '100%', height: '100%', objectFit: 'cover' },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: 4 },
  durationText: { fontSize: 12, color: '#fff' },
  infoList: { paddingLeft: 12, display: 'flex', flexDirection: 'column', justifyContent: 'center' },
  title: { fontSize: 14, padding: '8px 8px 4px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  folderText: { fontSize: 12, padding: '0 8px 8px', display: 'block' },
};
