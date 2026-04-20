import React, { useCallback, useEffect, useState } from 'react';
import { IoClose, IoPhonePortraitOutline, IoRefresh, IoTrashOutline, IoBulbOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { loadMediaSources, type MediaSourceConfig, removeMediaSource, syncLocalSource, syncNasSource, syncPlexSource, upsertMediaSource, type NasMode } from '../services/media-sources';

export default function AddSourceScreen() {
  const { colors, accentColor } = useAppTheme();
  const navigate = useNavigate();
  const [sources, setSources] = useState<MediaSourceConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'local' | 'plex' | 'nas' | 'gdrive' | null>(null);
  const [plexName, setPlexName] = useState('Plex Media Server');
  const [plexServerUrl, setPlexServerUrl] = useState('');
  const [plexToken, setPlexToken] = useState('');
  const [plexLibraryId, setPlexLibraryId] = useState('');
  const [nasName, setNasName] = useState('My NAS');
  const [nasMode, setNasMode] = useState<NasMode>('webdav');
  const [nasUrl, setNasUrl] = useState('');
  const [nasUsername, setNasUsername] = useState('');
  const [nasPassword, setNasPassword] = useState('');
  const [driveName, setDriveName] = useState('Google Drive');
  const [driveClientId, setDriveClientId] = useState('');
  const [driveFolderId, setDriveFolderId] = useState('');

  const loadSources = useCallback(async () => {
    setLoading(true);
    try {
      setSources(await loadMediaSources());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  const handleLocalScan = async () => {
    setSaving('local');
    try {
      await syncLocalSource();
      await loadSources();
      alert('Local media ready');
    } catch (error: any) {
      alert(error?.message || 'Unable to scan local media.');
    } finally {
      setSaving(null);
    }
  };

  const handlePlexConnect = async () => {
    if (!plexServerUrl.trim() || !plexToken.trim()) {
      alert('Add your Plex server URL and token first.');
      return;
    }
    setSaving('plex');
    try {
      const source = {
        id: 'plex-main', type: 'plex' as const, name: plexName.trim() || 'Plex Media Server', enabled: true,
        serverUrl: plexServerUrl.trim(), token: plexToken.trim(), librarySectionId: plexLibraryId.trim() || undefined,
      };
      await upsertMediaSource(source);
      const videos = await syncPlexSource(source);
      await loadSources();
      alert(`Plex connected. Indexed ${videos.length} item(s).`);
    } catch (error: any) {
      alert(error?.message || 'Unable to connect to Plex.');
    } finally {
      setSaving(null);
    }
  };

  const handleNasConnect = async () => {
    if (!nasUrl.trim()) {
      alert('Add a direct media URL or a WebDAV folder URL.');
      return;
    }
    setSaving('nas');
    try {
      const source = {
        id: 'nas-main', type: 'nas' as const, name: nasName.trim() || 'My NAS', enabled: true,
        mode: nasMode, url: nasUrl.trim(), username: nasUsername.trim() || undefined, password: nasPassword || undefined,
      };
      await upsertMediaSource(source);
      const videos = await syncNasSource(source);
      await loadSources();
      alert(`NAS connected. Indexed ${videos.length} item(s).`);
    } catch (error: any) {
      alert(error?.message || 'Unable to connect to the NAS source.');
    } finally {
      setSaving(null);
    }
  };

  const handleRemove = async (sourceId: string) => {
    await removeMediaSource(sourceId);
    await loadSources();
  };

  const handleGoogleDriveConnect = async () => {
    if (!driveClientId.trim()) {
      alert('Add the OAuth client ID from Google Cloud first.');
      return;
    }
    alert('Google Drive OAuth flow is not wired in the desktop build yet.');
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <span style={{ ...s.headerTitle, color: colors.text }}>Add Media Source</span>
        <button style={{ ...s.closeBtn, backgroundColor: colors.surface, borderColor: colors.border }} onClick={() => navigate(-1)}>
          <IoClose size={24} color={colors.text} />
        </button>
      </div>

      <div style={s.scroll}>
        <span style={{ ...s.sectionLabel, color: colors.subtleText }}>MEDIA SOURCES</span>
        <div style={{ ...s.sourceItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }} onClick={handleLocalScan}>
          <div style={{ ...s.iconContainer, backgroundColor: colors.accentSoft }}>
            <IoPhonePortraitOutline size={24} color={accentColor} />
          </div>
          <div style={s.info}>
            <span style={{ ...s.title, color: colors.text }}>Local Device Storage</span>
            <span style={{ ...s.desc, color: colors.mutedText }}>Scan internal storage and refresh the on-device library.</span>
          </div>
          {saving === 'local' ? <span>...</span> : <IoRefresh size={20} color={accentColor} />}
        </div>

        <div style={{ ...s.formCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <span style={{ ...s.cardTitle, color: colors.text }}>Plex Media Server</span>
          <span style={{ ...s.cardHint, color: colors.mutedText }}>Connect with your server URL, Plex token, and an optional library section ID.</span>
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Display name" value={plexName} onChange={(e) => setPlexName(e.target.value)} />
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="https://plex.example.com:32400" value={plexServerUrl} onChange={(e) => setPlexServerUrl(e.target.value)} />
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Plex token" value={plexToken} onChange={(e) => setPlexToken(e.target.value)} />
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Library section ID (optional)" value={plexLibraryId} onChange={(e) => setPlexLibraryId(e.target.value)} />
          <button style={{ ...s.primaryButton, backgroundColor: accentColor }} onClick={handlePlexConnect} disabled={saving === 'plex'}>{saving === 'plex' ? 'Connecting...' : 'Connect Plex'}</button>
        </div>

        <div style={{ ...s.formCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <span style={{ ...s.cardTitle, color: colors.text }}>NAS</span>
          <span style={{ ...s.cardHint, color: colors.mutedText }}>Use Direct URL for a single playable file or WebDAV to index a NAS folder.</span>
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Display name" value={nasName} onChange={(e) => setNasName(e.target.value)} />
          <div style={s.modeRow}>
            {(['webdav', 'direct'] as NasMode[]).map((mode) => (
              <button key={mode} style={{ ...s.modeChip, borderColor: colors.borderStrong, backgroundColor: colors.surface, ...(nasMode === mode ? { borderColor: accentColor, backgroundColor: colors.accentSoft } : {}) }} onClick={() => setNasMode(mode)}>
                <span style={{ ...s.modeChipText, color: nasMode === mode ? colors.text : colors.mutedText }}>{mode === 'webdav' ? 'WebDAV Folder' : 'Direct URL'}</span>
              </button>
            ))}
          </div>
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder={nasMode === 'webdav' ? 'https://nas.example.com:5006/webdav/Movies/' : 'https://nas.example.com/media/movie.mp4'} value={nasUrl} onChange={(e) => setNasUrl(e.target.value)} />
          {nasMode === 'webdav' && (
            <>
              <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Username (optional)" value={nasUsername} onChange={(e) => setNasUsername(e.target.value)} />
              <input type="password" style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Password (optional)" value={nasPassword} onChange={(e) => setNasPassword(e.target.value)} />
            </>
          )}
          <button style={{ ...s.primaryButton, backgroundColor: accentColor }} onClick={handleNasConnect} disabled={saving === 'nas'}>{saving === 'nas' ? 'Connecting...' : 'Connect NAS'}</button>
        </div>

        <div style={{ ...s.formCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <span style={{ ...s.cardTitle, color: colors.text }}>Google Drive</span>
          <span style={{ ...s.cardHint, color: colors.mutedText }}>Sign in with Google and index Drive videos. Folder ID is optional.</span>
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Display name" value={driveName} onChange={(e) => setDriveName(e.target.value)} />
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Google OAuth Client ID" value={driveClientId} onChange={(e) => setDriveClientId(e.target.value)} />
          <input style={{ ...s.input, backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }} placeholder="Folder ID (optional)" value={driveFolderId} onChange={(e) => setDriveFolderId(e.target.value)} />
          <button style={{ ...s.primaryButton, backgroundColor: accentColor }} onClick={handleGoogleDriveConnect} disabled={saving === 'gdrive'}>{saving === 'gdrive' ? 'Connecting...' : 'Sign In With Google'}</button>
        </div>

        <span style={{ ...s.sectionLabel, marginTop: 28, color: colors.subtleText }}>CONNECTED</span>
        {loading ? (
          <span style={{ color: accentColor, marginTop: 20 }}>Loading...</span>
        ) : (
          sources.map((source) => (
            <div key={source.id} style={{ ...s.connectedItem, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <div style={s.connectedInfo}>
                <span style={{ ...s.title, color: colors.text }}>{source.name}</span>
                <span style={{ ...s.desc, color: colors.mutedText }}>
                  {source.type.toUpperCase()} • {source.status ?? 'connected'}
                </span>
              </div>
              {source.type !== 'local' && (
                <button style={{ ...s.removeBtn, backgroundColor: colors.surface }} onClick={() => handleRemove(source.id)}>
                  <IoTrashOutline size={18} color="#FF7A7A" />
                </button>
              )}
            </div>
          ))
        )}

        <div style={{ ...s.proTip, backgroundColor: 'rgba(249, 168, 37, 0.12)', borderColor: 'rgba(249, 168, 37, 0.28)' }}>
          <IoBulbOutline size={20} color="#F9A825" />
          <span style={s.proTipText}>Plex uses your server URL plus token. NAS supports direct links and WebDAV. Google Drive uses OAuth from Google Cloud plus optional folder-based indexing.</span>
        </div>
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 24px' },
  headerTitle: { fontSize: 22, fontWeight: 700 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', cursor: 'pointer' },
  scroll: { padding: '0 20px', overflowY: 'auto', flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 1.5, marginBottom: 20, display: 'block' },
  sourceItem: { display: 'flex', alignItems: 'center', padding: 16, borderRadius: 16, marginBottom: 12, border: '1px solid', gap: 16, cursor: 'pointer' },
  iconContainer: { width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: 600, marginBottom: 4, display: 'block' },
  desc: { fontSize: 12 },
  formCard: { borderRadius: 18, padding: 16, marginTop: 12, border: '1px solid', display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: 700 },
  cardHint: { fontSize: 13, lineHeight: '20px', marginBottom: 6 },
  input: { borderRadius: 12, border: '1px solid', padding: '14px', marginBottom: 6, background: 'none' },
  primaryButton: { height: 52, borderRadius: 14, border: 'none', cursor: 'pointer', fontWeight: 800, color: '#000' },
  modeRow: { display: 'flex', gap: 10, marginBottom: 6 },
  modeChip: { flex: 1, borderRadius: 12, border: '1px solid', padding: '12px', cursor: 'pointer', background: 'none' },
  modeChipText: { fontSize: 12, fontWeight: 700 },
  connectedItem: { display: 'flex', alignItems: 'center', borderRadius: 16, padding: 16, marginBottom: 12, border: '1px solid', gap: 12 },
  connectedInfo: { flex: 1 },
  removeBtn: { width: 36, height: 36, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' },
  proTip: { display: 'flex', padding: 16, borderRadius: 16, marginTop: 24, gap: 12, border: '1px solid' },
  proTipText: { flex: 1, color: '#F9A825', fontSize: 13, lineHeight: '20px' },
};
