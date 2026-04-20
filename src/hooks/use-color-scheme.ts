import { usePlayerStore } from '../services/store';

export function useColorScheme() {
  const preferredTheme = usePlayerStore((state) => state.config.theme);
  // On web, check system preference
  if (preferredTheme === 'system') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preferredTheme;
}
