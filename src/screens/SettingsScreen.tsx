import React, { useCallback, useMemo, useState } from 'react';
import { IoChevronForward, IoChevronUp, IoPlayOutline, IoCopyOutline, IoSpeedometerOutline, IoMoonOutline, IoSparklesOutline, IoColorPaletteOutline, IoCloudOutline, IoWifiOutline, IoTrashOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { applyVideoCacheSize, clearAppCache, formatBytes, getCacheStats } from '../services/app-settings';
import { loadMediaSources, refreshLibrary } from '../services/media-sources';
import { usePlayerStore, type ConfigState } from '../services/store';

const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2] as const;
const CACHE_OPTIONS = [25, 50, 100, 200] as const;
const THEME_OPTIONS: { value: ConfigState['theme']; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];
const ACCENT_OPTIONS = [
  { value: '#7C9DFF', label: 'Cinematic Blue' },
  { value: '#7CE0B8', label: 'Mint Glow' },
  { value: '#F9A825', label: 'Amber Gold' },
  { value: '#FF7A7A', label: 'Coral Red' },
  { value: '#A78BFA', label: 'Lavender' },
] as const;

type ExpandableSetting = 'speed' | 'theme' | 'accent' | 'cache' | null;

export default function SettingsScreen() {
  const { config, updateConfig, setCurrentVideo } = usePlayerStore();
  const { colors } = useAppTheme();
  const navigate = useNavigate();
  const [expandedSetting, setExpandedSetting] = useState<ExpandableSetting>(null);
  const [cacheSummary, setCacheSummary] = useState({ bytes: 0, files: 0 });
  const [sourceCount, setSourceCount] = useState(1);
  const [connectedSourceCount, setConnectedSourceCount] = useState(1);
  const [clearingCache, setClearingCache] = useState(false);

  const loadScreenData = useCallback(async () => {
    const [cacheStats, sources] = await Promise.all([getCacheStats(), loadMediaSources()]);
    setCacheSummary(cacheStats);
    setSourceCount(sources.length);
    setConnectedSourceCount(sources.filter((source) => source.enabled && source.status !== 'error').length);
  }, []);

  React.useEffect(() => {
    loadScreenData();
  }, [loadScreenData]);

  const themeLabel = useMemo(
    () => THEME_OPTIONS.find((option) => option.value === config.theme)?.label ?? 'Dark',
    [config.theme]
  );
  const accentLabel = useMemo(
    () => ACCENT_OPTIONS.find((option) => option.value === config.accentColor)?.label ?? 'Custom Accent',
    [config.accentColor]
  );

  const toggleExpanded = (setting: ExpandableSetting) => {
    setExpandedSetting((current) => (current === setting ? null : setting));
  };

  const handleClearCache = () => {
    if (!confirm('Clear cache? This will remove cached thumbnails and temporary media files.')) return;
    setClearingCache(true);
    setCurrentVideo(null);
    clearAppCache().then(async () => {
      await refreshLibrary();
      await loadScreenData();
      alert('Cache cleared');
      setClearingCache(false);
    }).catch((error) => {
      alert(error?.message || 'Unable to clear cache.');
      setClearingCache(false);
    });
  };

  const renderSettingItem = (icon: React.ReactNode, title: string, subtitle: string, options?: { onPress?: () => void; rightElement?: React.ReactNode; expanded?: boolean; accentColor?: string }) => (
    <div style={s.settingItem} onClick={options?.onPress}>
      <div style={s.settingLeft}>
        <div style={{ ...s.settingIcon, backgroundColor: colors.surface, borderColor: colors.border, ...(options?.accentColor ? { borderColor: `${options.accentColor}45` } : {}) }}>
          {icon}
        </div>
        <div style={s.settingCopy}>
          <span style={{ ...s.settingTitle, color: colors.text }}>{title}</span>
          <span style={{ ...s.settingSubtitle, color: colors.mutedText }}>{subtitle}</span>
        </div>
      </div>
      {options?.rightElement ?? (options?.expanded ? <IoChevronUp size={18} color={colors.subtleText} /> : <IoChevronForward size={18} color={colors.subtleText} />)}
    </div>
  );

  const renderOptionChips = (values: { label: string; selected: boolean; onPress: () => void; swatch?: string }[]) => (
    <div style={s.optionRow}>
      {values.map((item) => (
        <button
          key={item.label}
          style={{ ...s.optionChip, borderColor: colors.border, backgroundColor: colors.elevatedSurface, ...(item.selected ? { borderColor: config.accentColor, backgroundColor: `${config.accentColor}22` } : {}) }}
          onClick={item.onPress}
        >
          {item.swatch ? <div style={{ ...s.swatch, backgroundColor: item.swatch }} /> : null}
          <span style={{ ...s.optionChipText, color: item.selected ? colors.text : colors.mutedText }}>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <span style={{ ...s.headerTitle, color: colors.text }}>Settings</span>
      </div>

      <div style={s.scroll}>
        <div style={s.section}>
          <span style={{ ...s.sectionTitle, color: colors.mutedText }}>PLAYBACK</span>
          {renderSettingItem(<IoPlayOutline size={22} color={config.accentColor} />, 'Hardware Acceleration', config.hwAcceleration ? 'GPU decoding is enabled when available' : 'Software decoding only', {
            rightElement: <input type="checkbox" checked={config.hwAcceleration} onChange={(e) => updateConfig('hwAcceleration', e.target.checked)} />,
          })}
          {renderSettingItem(<IoCopyOutline size={22} color={config.accentColor} />, 'Picture-in-Picture', config.pipEnabled ? 'Floating playback is allowed' : 'PiP is disabled', {
            rightElement: <input type="checkbox" checked={config.pipEnabled} onChange={(e) => updateConfig('pipEnabled', e.target.checked)} />,
          })}
          {renderSettingItem(<IoSpeedometerOutline size={22} color={config.accentColor} />, 'Default Speed', `${config.defaultPlaybackSpeed}x playback when a video starts`, { onPress: () => toggleExpanded('speed'), expanded: expandedSetting === 'speed' })}
          {expandedSetting === 'speed' && renderOptionChips(SPEED_OPTIONS.map((speed) => ({
            label: `${speed}x`, selected: config.defaultPlaybackSpeed === speed, onPress: () => { updateConfig('defaultPlaybackSpeed', speed); setExpandedSetting(null); },
          })))}
        </div>

        <div style={s.section}>
          <span style={{ ...s.sectionTitle, color: colors.mutedText }}>INTERFACE</span>
          {renderSettingItem(<IoMoonOutline size={22} color={config.accentColor} />, 'Theme', `${themeLabel} appearance`, { onPress: () => toggleExpanded('theme'), expanded: expandedSetting === 'theme' })}
          {expandedSetting === 'theme' && renderOptionChips(THEME_OPTIONS.map((option) => ({
            label: option.label, selected: config.theme === option.value, onPress: () => { updateConfig('theme', option.value); setExpandedSetting(null); },
          })))}
          {renderSettingItem(<IoSparklesOutline size={22} color={config.accentColor} />, 'Haptic Feedback', config.hapticsEnabled ? 'Subtle feedback on taps and tab presses' : 'No vibration feedback', {
            rightElement: <input type="checkbox" checked={config.hapticsEnabled} onChange={(e) => updateConfig('hapticsEnabled', e.target.checked)} />,
          })}
          {renderSettingItem(<IoColorPaletteOutline size={22} color={config.accentColor} />, 'Accent Color', accentLabel, { onPress: () => toggleExpanded('accent'), expanded: expandedSetting === 'accent' })}
          {expandedSetting === 'accent' && renderOptionChips(ACCENT_OPTIONS.map((option) => ({
            label: option.label, selected: config.accentColor === option.value, swatch: option.value, onPress: () => updateConfig('accentColor', option.value),
          })))}
        </div>

        <div style={s.section}>
          <span style={{ ...s.sectionTitle, color: colors.mutedText }}>STORAGE & NETWORK</span>
          {renderSettingItem(<IoCloudOutline size={22} color={config.accentColor} />, 'Media Servers', `${connectedSourceCount}/${sourceCount} source${sourceCount === 1 ? '' : 's'} ready`, { onPress: () => navigate('/add-source') })}
          {renderSettingItem(<IoWifiOutline size={22} color={config.accentColor} />, 'Network Caching', `${config.networkCachingMb} MB buffer for streams`, { onPress: () => toggleExpanded('cache'), expanded: expandedSetting === 'cache' })}
          {expandedSetting === 'cache' && renderOptionChips(CACHE_OPTIONS.map((size) => ({
            label: `${size} MB`, selected: config.networkCachingMb === size, onPress: async () => {
              const appliedSize = await applyVideoCacheSize(size);
              await updateConfig('networkCachingMb', appliedSize);
              await loadScreenData();
              alert(`Streaming cache is now set to ${appliedSize} MB.`);
              setExpandedSetting(null);
            },
          })))}
          {renderSettingItem(<IoTrashOutline size={22} color={config.accentColor} />, 'Clear Cache', `${formatBytes(cacheSummary.bytes)} across ${cacheSummary.files} cached file${cacheSummary.files === 1 ? '' : 's'}`, {
            onPress: handleClearCache,
            rightElement: clearingCache ? <span>Clearing...</span> : <IoTrashOutline size={18} color={colors.mutedText} />,
            accentColor: '#FF7A7A',
          })}
        </div>

        <div style={s.aboutSection}>
          <img src="/Vidara-logo.png" style={s.aboutLogo} alt="Vidara logo" />
          <span style={{ ...s.appTitle, color: config.accentColor }}>Vidara Media Player</span>
          <span style={{ ...s.version, color: colors.mutedText }}>Configured for real playback, media sync, and subtitle retrieval</span>
        </div>
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px' },
  headerTitle: { fontSize: 24, fontWeight: 700 },
  scroll: { padding: '0 16px', overflowY: 'auto', flex: 1 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16, display: 'block' },
  settingItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginBottom: 8, cursor: 'pointer' },
  settingLeft: { display: 'flex', alignItems: 'center', gap: 16, flex: 1 },
  settingCopy: { flex: 1, display: 'flex', flexDirection: 'column' },
  settingIcon: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid' },
  settingTitle: { fontSize: 16, fontWeight: 600, marginBottom: 2 },
  settingSubtitle: { fontSize: 12, lineHeight: '18px' },
  optionRow: { display: 'flex', flexWrap: 'wrap', gap: 10, margin: '2px 0 14px 60px' },
  optionChip: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid', borderRadius: 999, padding: '10px 14px', background: 'transparent', cursor: 'pointer' },
  optionChipText: { fontSize: 13, fontWeight: 700 },
  swatch: { width: 12, height: 12, borderRadius: 999 },
  aboutSection: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 16, marginBottom: 40, gap: 6 },
  aboutLogo: { width: 92, height: 92, borderRadius: 22, objectFit: 'contain', display: 'block' },
  appTitle: { fontSize: 18, fontWeight: 700 },
  version: { fontSize: 12, textAlign: 'center' },
};
