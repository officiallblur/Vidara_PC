import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { initDatabase } from './services/database';
import { usePlayerStore } from './services/store';
import { useAppTheme } from './hooks/use-app-theme';
import HomeScreen from './screens/HomeScreen';
import ExploreScreen from './screens/ExploreScreen';
import NetworkScreen from './screens/NetworkScreen';
import AIFeaturesScreen from './screens/AIFeaturesScreen';
import SettingsScreen from './screens/SettingsScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import SearchScreen from './screens/SearchScreen';
import ModalScreen from './screens/ModalScreen';
import MovieDetailsScreen from './screens/MovieDetailsScreen';
import HistoryScreen from './screens/HistoryScreen';
import DownloadsScreen from './screens/DownloadsScreen';
import MoviesScreen from './screens/MoviesScreen';
import SeriesScreen from './screens/SeriesScreen';
import AddSourceScreen from './screens/AddSourceScreen';
import VideoPlayer from './components/VideoPlayer';
import { refreshLibrary } from './services/media-sources';
import './App.css';

export default function App() {
  const loadConfig = usePlayerStore((state) => state.loadConfig);
  const { colors, accentColor } = useAppTheme();

  useEffect(() => {
    initDatabase()
      .then(async () => {
        await loadConfig();
        await refreshLibrary();
      })
      .catch(() => undefined);
  }, [loadConfig]);

  return (
    <BrowserRouter>
      <div className="app-root" style={{ backgroundColor: colors.background, color: colors.text }}>
        <div className="app-content">
          <Routes>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/explore" element={<ExploreScreen />} />
            <Route path="/network" element={<NetworkScreen />} />
            <Route path="/ai-features" element={<AIFeaturesScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/analytics" element={<AnalyticsScreen />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/modal" element={<ModalScreen />} />
            <Route path="/movie-details" element={<MovieDetailsScreen />} />
            <Route path="/history" element={<HistoryScreen />} />
            <Route path="/downloads" element={<DownloadsScreen />} />
            <Route path="/movies" element={<MoviesScreen />} />
            <Route path="/series" element={<SeriesScreen />} />
            <Route path="/add-source" element={<AddSourceScreen />} />
          </Routes>
          <VideoPlayer />
        </div>
        <nav className="tab-bar" style={{ borderTopColor: colors.border, backgroundColor: colors.background }}>
          {[
            { to: '/', label: 'Library', icon: '▶' },
            { to: '/explore', label: 'Explore', icon: '🧭' },
            { to: '/network', label: 'Network', icon: '☁️' },
            { to: '/ai-features', label: 'AI Features', icon: '✨' },
            { to: '/settings', label: 'Settings', icon: '⚙️' },
          ].map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}
              style={({ isActive }) => ({ color: isActive ? accentColor : colors.icon })}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </BrowserRouter>
  );
}
