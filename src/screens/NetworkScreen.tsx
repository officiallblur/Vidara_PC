import React, { useEffect, useState } from 'react';
import { IoCloudDownloadOutline, IoPlay, IoRadioOutline, IoLayersOutline, IoLinkOutline, IoPlayCircle, IoTimeOutline } from 'react-icons/io5';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { usePlayerStore } from '../services/store';
import { useAppTheme } from '../hooks/use-app-theme';
import { getRecentNetworkStreams, isValidNetworkUrl, makeNetworkVideoAsset, normalizeNetworkUrl, saveRecentNetworkStream, inferStreamContentType, guessStreamTitle, type RecentNetworkStream } from '../services/network-streams';

export default function NetworkScreen() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [recentStreams, setRecentStreams] = useState<RecentNetworkStream[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { setCurrentVideo } = usePlayerStore();
  const { colors } = useAppTheme();

  useEffect(() => {
    getRecentNetworkStreams().then(setRecentStreams);
  }, []);

  const openStream = async (rawUrl: string, rawTitle?: string) => {
    const normalizedUrl = normalizeNetworkUrl(rawUrl);
    if (!isValidNetworkUrl(normalizedUrl)) {
      alert('Invalid stream link. Enter a valid http or https media URL.');
      return;
    }
    setSubmitting(true);
    try {
      const streamTitle = rawTitle?.trim() || guessStreamTitle(normalizedUrl);
      setCurrentVideo(makeNetworkVideoAsset(normalizedUrl, streamTitle));
      const updated = await saveRecentNetworkStream({ url: normalizedUrl, title: streamTitle, contentType: inferStreamContentType(normalizedUrl) });
      setRecentStreams(updated);
      setUrl(normalizedUrl);
      if (!title.trim()) setTitle(streamTitle);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <img src="/Vidara-logo.png" style={{ width: 46, height: 46, borderRadius: 12, objectFit: 'contain', display: 'block' }} alt="Vidara logo" />
          <ThemedText style={s.headerTitle}>Flux</ThemedText>
        </div>
      </div>

      <div style={s.scroll}>
        <IoCloudDownloadOutline size={80} color={colors.accent} style={{ marginBottom: 20 }} />
        <span style={{ ...s.title, color: colors.text }}>Network Flux</span>
        <span style={{ ...s.subtitle, color: colors.mutedText }}>
          Paste a direct stream link and start watching instantly. Best supported formats are MP4, HLS .m3u8, and DASH .mpd.
        </span>

        <div style={{ ...s.inputContainer, backgroundColor: colors.surface, borderColor: colors.borderStrong }}>
          <input style={{ ...s.input, color: colors.text }} placeholder="https://example.com/video.m3u8" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>

        <div style={{ ...s.inputContainer, backgroundColor: colors.surface, borderColor: colors.borderStrong }}>
          <input style={{ ...s.input, color: colors.text }} placeholder="Optional title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <button
          style={{ ...s.button, backgroundColor: (url.trim().length === 0 || submitting) ? '#666' : colors.accent }}
          onClick={() => openStream(url, title)}
          disabled={url.trim().length === 0 || submitting}
        >
          <IoPlay size={20} color="#000" style={{ marginRight: 8 }} />
          <span style={s.buttonText}>{submitting ? 'Opening Stream...' : 'Start Streaming'}</span>
        </button>

        <div style={{ ...s.tipCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <span style={{ ...s.tipTitle, color: colors.text }}>Accepted links</span>
          <span style={{ ...s.tipText, color: colors.mutedText }}>Direct files: https://.../movie.mp4</span>
          <span style={{ ...s.tipText, color: colors.mutedText }}>HLS playlists: https://.../stream.m3u8</span>
          <span style={{ ...s.tipText, color: colors.mutedText }}>DASH manifests: https://.../stream.mpd</span>
        </div>

        <div style={s.recentHeader}>
          <span style={{ ...s.recentTitle, color: colors.text }}>Recent Streams</span>
        </div>

        {recentStreams.length === 0 ? (
          <div style={{ ...s.emptyState, borderColor: colors.border, backgroundColor: colors.elevatedSurface }}>
            <IoTimeOutline size={28} color={colors.emptyIcon} />
            <span style={{ ...s.emptyText, color: colors.mutedText }}>Streams you open here will be saved for one-tap replay.</span>
          </div>
        ) : (
          recentStreams.map((stream) => (
            <div key={stream.id} style={{ ...s.recentCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }} onClick={() => openStream(stream.url, stream.title)}>
              <div style={s.recentIcon}>
                {stream.contentType === 'hls' ? <IoRadioOutline size={20} color={colors.accent} /> :
                 stream.contentType === 'dash' ? <IoLayersOutline size={20} color={colors.accent} /> :
                 <IoLinkOutline size={20} color={colors.accent} />}
              </div>
              <div style={s.recentInfo}>
                <span style={{ ...s.recentItemTitle, color: colors.text }}>{stream.title}</span>
                <span style={{ color: colors.mutedText, fontSize: 12 }}>{stream.url}</span>
              </div>
              <IoPlayCircle size={30} color={colors.accent} />
            </div>
          ))
        )}
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px 16px 20px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 24, fontWeight: 800 },
  scroll: { padding: 24, paddingBottom: 80, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', marginBottom: 12, textAlign: 'center', display: 'block' },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: '22px', display: 'block' },
  inputContainer: { width: '100%', maxWidth: 500, borderRadius: 12, border: '1px solid', padding: '0 16px', marginBottom: 24 },
  input: { height: 56, fontSize: 16, width: '100%', background: 'none', border: 'none', outline: 'none' },
  button: { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 500, height: 56, borderRadius: 12, border: 'none', cursor: 'pointer' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 700 },
  tipCard: { width: '100%', maxWidth: 500, marginTop: 24, padding: 16, borderRadius: 16, border: '1px solid', display: 'flex', flexDirection: 'column', gap: 4 },
  tipTitle: { fontSize: 15, fontWeight: 700, marginBottom: 10 },
  tipText: { fontSize: 13, lineHeight: '20px' },
  recentHeader: { width: '100%', maxWidth: 500, marginTop: 28, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  recentTitle: { fontSize: 18, fontWeight: 700 },
  emptyState: { width: '100%', maxWidth: 500, padding: 22, borderRadius: 16, border: '1px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: '20px' },
  recentCard: { width: '100%', maxWidth: 500, display: 'flex', alignItems: 'center', borderRadius: 16, border: '1px solid', padding: 14, marginBottom: 12, cursor: 'pointer', gap: 12 },
  recentIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(124, 157, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  recentInfo: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  recentItemTitle: { fontSize: 14, fontWeight: 700, marginBottom: 4 },
};
