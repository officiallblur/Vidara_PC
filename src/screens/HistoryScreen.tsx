import React, { useEffect, useState } from 'react';
import { IoChevronBack, IoTimeOutline, IoPlayCircle } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { getWatchHistory } from '../services/video-db';
import { usePlayerStore } from '../services/store';

interface HistoryEntry {
  uri: string;
  filename: string;
  position: number;
  duration: number;
  thumbnail: string | null;
  last_watched: number;
}

export default function HistoryScreen() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const { setCurrentVideo } = usePlayerStore();
  const { colors } = useAppTheme();
  const navigate = useNavigate();

  useEffect(() => {
    getWatchHistory(40).then(setHistory);
  }, []);

  const formatRemaining = (duration: number, position: number) => {
    const remaining = Math.max(0, duration - position);
    const minutes = Math.round(remaining / 60);
    return `${minutes}m left`;
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}><IoChevronBack size={28} color={colors.text} /></button>
        <span style={{ ...s.title, color: colors.text }}>Watch History</span>
        <div style={s.backBtn} />
      </div>

      <div style={s.scroll}>
        {history.length === 0 ? (
          <div style={s.emptyState}>
            <IoTimeOutline size={54} color={colors.emptyIcon} />
            <span style={{ ...s.emptyTitle, color: colors.text }}>No watch history yet</span>
            <span style={{ ...s.emptyText, color: colors.mutedText }}>Start playing something and it will appear here.</span>
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={`${entry.uri}-${entry.last_watched}`}
              style={{ ...s.historyItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}
              onClick={() => {
                setCurrentVideo({
                  id: entry.uri,
                  uri: entry.uri,
                  filename: entry.filename,
                  duration: entry.duration,
                  width: 0,
                  height: 0,
                  thumbnail: entry.thumbnail,
                });
              }}
            >
              <img src={entry.thumbnail || '/icon.png'} style={s.thumb} alt="" />
              <div style={s.info}>
                <span style={{ ...s.itemTitle, color: colors.text }}>{entry.filename}</span>
                <span style={{ ...s.itemMeta, color: colors.mutedText }}>{new Date(entry.last_watched).toLocaleString()} • {formatRemaining(entry.duration, entry.position)}</span>
                <div style={{ ...s.progressTrack, backgroundColor: colors.progressTrack }}>
                  <div style={{ ...s.progressFill, backgroundColor: colors.accent, width: `${Math.min(100, (entry.position / Math.max(entry.duration, 1)) * 100)}%` }} />
                </div>
              </div>
              <IoPlayCircle size={32} color={colors.accent} />
            </div>
          ))
        )}
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' },
  backBtn: { width: 44, height: 44, background: 'none', border: 'none', cursor: 'pointer' },
  title: { fontSize: 22, fontWeight: 800 },
  scroll: { padding: 16, paddingBottom: 100, overflowY: 'auto', flex: 1 },
  emptyState: { flex: 1, minHeight: 400, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: 700 },
  emptyText: { fontSize: 14 },
  historyItem: { display: 'flex', alignItems: 'center', borderRadius: 18, padding: 12, border: '1px solid', marginBottom: 14, gap: 14, cursor: 'pointer' },
  thumb: { width: 96, height: 64, borderRadius: 10, objectFit: 'cover' },
  info: { flex: 1, display: 'flex', flexDirection: 'column', gap: 6 },
  itemTitle: { fontSize: 15, fontWeight: 700 },
  itemMeta: { fontSize: 12 },
  progressTrack: { height: 5, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
};
