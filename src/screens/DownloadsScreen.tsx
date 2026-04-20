import React, { useEffect, useState } from 'react';
import { IoChevronBack, IoDownloadOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { getVideosFromDB } from '../services/video-db';
import type { VideoAsset } from '../services/media-scanner';
import { usePlayerStore } from '../services/store';
import { openPath } from '@tauri-apps/plugin-opener';
import { downloadDir } from '@tauri-apps/api/path';

export default function DownloadsScreen() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const { setCurrentVideo } = usePlayerStore();
  const { colors } = useAppTheme();
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const allVideos = await getVideosFromDB();
      const downloadsOnly = allVideos.filter((v) => (v.folder ?? '').toLowerCase().includes('download'));
      setVideos(downloadsOnly);
    }
    load();
  }, []);

  const handleOpenDownloads = async () => {
    try {
      const dir = await downloadDir();
      await openPath(dir);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to open Downloads folder.');
    }
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}><IoChevronBack size={28} color={colors.text} /></button>
        <span style={{ ...s.headerTitle, color: colors.text }}>Downloads</span>
        <button style={s.headerBtn} onClick={handleOpenDownloads}>
          <IoDownloadOutline size={22} color={colors.text} />
        </button>
      </div>

      <div style={s.scroll}>
        <div style={s.grid}>
          {videos.map((video) => (
            <div key={video.id} style={s.card} onClick={() => { setCurrentVideo(video); navigate(-1); }}>
              <div style={{ ...s.thumbWrapper, backgroundColor: colors.thumbnailFallback }}>
                <img src={video.uri} style={s.thumb} alt="" />
                <div style={s.durationBadge}>
                  <span style={{ ...s.durationText, color: colors.text }}>{(video.duration / 60).toFixed(0)}:00</span>
                </div>
              </div>
              <span style={{ ...s.title, color: colors.text }}>{video.filename}</span>
              <span style={{ ...s.meta, color: colors.mutedText }}>Added 2 days ago</span>
            </div>
          ))}
        </div>

        {videos.length === 0 && (
          <div style={s.empty}>
            <IoDownloadOutline size={64} color={colors.emptyIcon} />
            <span style={{ ...s.emptyText, color: colors.mutedText }}>No downloaded files yet.</span>
          </div>
        )}
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' },
  backBtn: { width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer' },
  headerTitle: { fontSize: 20, fontWeight: 700 },
  headerBtn: { width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer' },
  scroll: { padding: '0 16px', overflowY: 'auto', flex: 1 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 },
  card: { cursor: 'pointer' },
  thumbWrapper: { width: '100%', aspectRatio: '16/10', borderRadius: 12, overflow: 'hidden', marginBottom: 8, position: 'relative' },
  thumb: { width: '100%', height: '100%', objectFit: 'cover' },
  durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.8)', padding: '2px 6px', borderRadius: 4 },
  durationText: { fontSize: 10, fontWeight: 700 },
  title: { fontSize: 14, fontWeight: 600, marginBottom: 2, display: 'block' },
  meta: { fontSize: 11 },
  empty: { alignItems: 'center', marginTop: 100, display: 'flex', flexDirection: 'column', gap: 16 },
  emptyText: { fontSize: 16 },
};
