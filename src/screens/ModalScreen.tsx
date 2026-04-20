import React, { useEffect, useState } from 'react';
import { IoClose, IoCheckmarkCircleOutline, IoGridOutline, IoSwapVerticalOutline, IoSearchOutline, IoTimeOutline, IoAddCircleOutline, IoSettingsOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { getAllSettings, saveSetting } from '../services/database';

type DisplayMode = 'grid' | 'list';
type SortMode = 'recent' | 'name' | 'duration';

const DISPLAY_MODE_KEY = 'libraryDisplayMode';
const SORT_MODE_KEY = 'librarySortMode';

export default function ModalScreen() {
  const { colors, accentColor } = useAppTheme();
  const navigate = useNavigate();
  const [displayMode, setDisplayMode] = useState<DisplayMode>('grid');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  useEffect(() => {
    let active = true;
    async function loadMenuState() {
      const settings = await getAllSettings();
      if (!active) return;
      const savedDisplay = settings[DISPLAY_MODE_KEY];
      const savedSort = settings[SORT_MODE_KEY];
      if (savedDisplay === 'grid' || savedDisplay === 'list') setDisplayMode(savedDisplay);
      if (savedSort === 'recent' || savedSort === 'name' || savedSort === 'duration') setSortMode(savedSort);
    }
    loadMenuState();
    return () => { active = false; };
  }, []);

  const setDisplay = async (next: DisplayMode) => {
    setDisplayMode(next);
    await saveSetting(DISPLAY_MODE_KEY, next);
  };

  const setSort = async (next: SortMode) => {
    setSortMode(next);
    await saveSetting(SORT_MODE_KEY, next);
  };

  const quickActions = [
    { label: 'Search Library', icon: <IoSearchOutline size={17} color={accentColor} />, route: '/search' },
    { label: 'Watch History', icon: <IoTimeOutline size={17} color={accentColor} />, route: '/history' },
    { label: 'Add Media Source', icon: <IoAddCircleOutline size={17} color={accentColor} />, route: '/add-source' },
    { label: 'Settings', icon: <IoSettingsOutline size={17} color={accentColor} />, route: '/settings' },
  ];

  const handleQuickAction = (route: string) => {
    navigate(route);
  };

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <span style={{ ...s.title, color: colors.text }}>Library Options</span>
        <button style={s.closeBtn} onClick={() => navigate(-1)}><IoClose size={22} color={colors.text} /></button>
      </div>

      <div style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
        <div style={s.rowHeader}>
          <IoCheckmarkCircleOutline size={18} color={accentColor} />
          <span style={{ ...s.rowTitle, color: colors.text }}>Select</span>
        </div>
        <span style={{ ...s.rowSubtitle, color: colors.mutedText }}>Long-press videos in the library to start multi-select.</span>
      </div>

      <div style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
        <div style={s.rowHeader}>
          <IoGridOutline size={18} color={accentColor} />
          <span style={{ ...s.rowTitle, color: colors.text }}>Display As</span>
        </div>
        <div style={s.optionRow}>
          <button style={{ ...s.optionChip, borderColor: colors.border, backgroundColor: displayMode === 'grid' ? `${accentColor}20` : colors.surface }} onClick={() => setDisplay('grid')}>
            <span style={{ ...s.optionText, color: displayMode === 'grid' ? accentColor : colors.text }}>Grid</span>
          </button>
          <button style={{ ...s.optionChip, borderColor: colors.border, backgroundColor: displayMode === 'list' ? `${accentColor}20` : colors.surface }} onClick={() => setDisplay('list')}>
            <span style={{ ...s.optionText, color: displayMode === 'list' ? accentColor : colors.text }}>List</span>
          </button>
        </div>
      </div>

      <div style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
        <div style={s.rowHeader}>
          <IoSwapVerticalOutline size={18} color={accentColor} />
          <span style={{ ...s.rowTitle, color: colors.text }}>Sort By</span>
        </div>
        <div style={s.optionRow}>
          {(['recent', 'name', 'duration'] as SortMode[]).map((mode) => (
            <button key={mode} style={{ ...s.optionChip, borderColor: colors.border, backgroundColor: sortMode === mode ? `${accentColor}20` : colors.surface }} onClick={() => setSort(mode)}>
              <span style={{ ...s.optionText, color: sortMode === mode ? accentColor : colors.text }}>{mode === 'recent' ? 'Recently Added' : mode === 'name' ? 'Name' : 'Duration'}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
        <div style={s.rowHeader}>
          <span style={{ ...s.rowTitle, color: colors.text }}>Quick Actions</span>
        </div>
        <div style={s.quickList}>
          {quickActions.map((action) => (
            <button key={action.label} style={{ ...s.quickItem, borderColor: colors.border }} onClick={() => handleQuickAction(action.route)}>
              {action.icon}
              <span style={{ ...s.quickItemText, color: colors.text }}>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', padding: 16, gap: 12 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 24, fontWeight: 800 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, border: 'none', background: 'none', cursor: 'pointer' },
  card: { border: '1px solid', borderRadius: 16, padding: 14, gap: 10, display: 'flex', flexDirection: 'column' },
  rowHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: 700 },
  rowSubtitle: { fontSize: 13, lineHeight: '18px' },
  optionRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  optionChip: { border: '1px solid', borderRadius: 999, padding: '8px 12px', cursor: 'pointer', background: 'none' },
  optionText: { fontSize: 13, fontWeight: 700 },
  quickList: { display: 'flex', flexDirection: 'column', gap: 8 },
  quickItem: { border: '1px solid', borderRadius: 12, padding: '10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: 'none' },
  quickItemText: { fontSize: 14, fontWeight: 600 },
};
