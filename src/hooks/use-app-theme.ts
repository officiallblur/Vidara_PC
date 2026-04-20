import { Colors } from '../constants/theme';
import { useColorScheme } from './use-color-scheme';
import { usePlayerStore } from '../services/store';

export function useAppTheme() {
  const colorScheme = useColorScheme() ?? 'dark';
  const palette = Colors[colorScheme];
  const accentColor = usePlayerStore((state) => state.config.accentColor);
  const isLight = colorScheme === 'light';

  return {
    colorScheme,
    isLight,
    accentColor,
    colors: {
      background: palette.background,
      surface: palette.surface,
      elevatedSurface: isLight ? '#FFFFFF' : '#0F0F11',
      secondarySurface: isLight ? '#F3F4F6' : ('secondarySurface' in palette ? (palette as any).secondarySurface : palette.surface),
      border: isLight ? '#E5E7EB' : '#1C1C1E',
      borderStrong: isLight ? '#D1D5DB' : '#2A2A2D',
      text: palette.text,
      mutedText: isLight ? '#6B7280' : '#777',
      subtleText: isLight ? '#9CA3AF' : '#555',
      icon: palette.icon,
      accent: accentColor,
      accentSoft: `${accentColor}22`,
      accentBorder: `${accentColor}55`,
      cardOverlay: isLight ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.3)',
      thumbnailFallback: isLight ? '#E5E7EB' : '#222',
      badgeBg: isLight ? 'rgba(17,24,39,0.82)' : 'rgba(0,0,0,0.8)',
      progressTrack: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
      emptyIcon: isLight ? '#CBD5E1' : '#444',
    },
  };
}
