import React, { useEffect, useMemo, useRef, useState } from 'react';
import { IoChevronBack } from 'react-icons/io5';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { IMDBApi, type ImdbTitleDetails } from '../services/imdb-api';

const FALLBACK_POSTER = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800';

export default function MovieDetailsScreen() {
  const { colors, accentColor } = useAppTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const title = params.get('title') ?? 'Movie';
  const releaseYear = params.get('year') ?? '';
  const rawPoster = params.get('posterUri') ?? '';
  let initialPoster = '';
  try {
    initialPoster = rawPoster ? decodeURIComponent(rawPoster) : '';
  } catch {
    initialPoster = rawPoster;
  }
  const initialGenre = params.get('genre') ?? '';
  const initialMatch = params.get('matchScore') ?? '';

  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<ImdbTitleDetails | null>(null);
  const [errorText, setErrorText] = useState('');
  const [posterSrc, setPosterSrc] = useState(FALLBACK_POSTER);
  const imageAnimRef = useRef(1);

  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      setLoading(true);
      setErrorText('');
      try {
        const imdb = await IMDBApi.getTitleDetails(title, releaseYear || undefined);
        if (cancelled) return;
        setDetails(imdb);
        if (!imdb) setErrorText('No IMDb details found for this title yet.');
      } catch (error: any) {
        if (!cancelled) setErrorText(error?.message || 'Unable to fetch movie details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadDetails();
    return () => { cancelled = true; };
  }, [releaseYear, title]);

  const posterUri = useMemo(() => {
    if (details?.poster && details.poster.startsWith('http')) return details.poster;
    if (initialPoster && (initialPoster.startsWith('http') || initialPoster.startsWith('data:') || initialPoster.startsWith('blob:'))) {
      return initialPoster;
    }
    return FALLBACK_POSTER;
  }, [details?.poster, initialPoster]);

  useEffect(() => {
    setPosterSrc(posterUri || FALLBACK_POSTER);
  }, [posterUri]);

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}><IoChevronBack size={26} color={colors.text} /></button>
        <span style={{ ...s.headerTitle, color: colors.text }}>About {title}</span>
        <div style={s.rightSpacer} />
      </div>

      <div style={s.scroll}>
        <div style={{ ...s.posterWrap, transform: `scale(${imageAnimRef.current})` }}>
          <span style={s.posterBackdropTitle}>{details?.title || title}</span>
          <img
            src={posterSrc}
            style={s.posterImage}
            alt=""
            onError={() => setPosterSrc(FALLBACK_POSTER)}
          />
        </div>

        <div style={s.metaTopRow}>
          <div style={{ ...s.badge, backgroundColor: `${accentColor}33`, borderColor: `${accentColor}77` }}>
            <span style={{ ...s.badgeText, color: accentColor }}>{initialMatch ? `${initialMatch}% Match` : 'Discovery'}</span>
          </div>
          {releaseYear && (
            <div style={{ ...s.badge, backgroundColor: colors.secondarySurface, borderColor: colors.border }}>
              <span style={{ ...s.badgeText, color: colors.text }}>{releaseYear}</span>
            </div>
          )}
        </div>

        {loading ? (
          <div style={s.loadingState}>
            <span style={{ color: accentColor }}>Loading IMDb details...</span>
          </div>
        ) : (
          <div style={s.infoSection}>
            {errorText && <span style={{ ...s.errorText, color: '#FF8A8A' }}>{errorText}</span>}
            <span style={{ ...s.titleText, color: colors.text }}>{details?.title || title}</span>
            <span style={{ ...s.metaLine, color: colors.mutedText }}>
              {[details?.year || releaseYear, details?.runtime, details?.type].filter(Boolean).join(' • ') || 'Movie details'}
            </span>
            <span style={{ ...s.genreText, color: colors.text }}>{details?.genre || initialGenre || 'Genre unavailable'}</span>

            <div style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <span style={{ ...s.cardTitle, color: colors.text }}>Plot</span>
              <span style={{ ...s.cardBody, color: colors.mutedText }}>{details?.plot || 'Plot summary is unavailable for this title right now.'}</span>
            </div>

            <div style={{ ...s.card, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
              <span style={{ ...s.cardTitle, color: colors.text }}>IMDb Stats</span>
              <span style={{ ...s.cardBody, color: colors.mutedText }}>Rating: {details?.imdbRating || 'N/A'}</span>
              <span style={{ ...s.cardBody, color: colors.mutedText }}>Votes: {details?.imdbVotes || 'N/A'}</span>
              <span style={{ ...s.cardBody, color: colors.mutedText }}>Director: {details?.director || 'N/A'}</span>
              <span style={{ ...s.cardBody, color: colors.mutedText }}>Cast: {details?.actors || 'N/A'}</span>
            </div>
          </div>
        )}
      </div>
    </ThemedView>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  header: { padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  backBtn: { width: 40, height: 40, background: 'none', border: 'none', cursor: 'pointer' },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 800 },
  rightSpacer: { width: 32 },
  scroll: { padding: '0 16px 44px', overflowY: 'auto', flex: 1 },
  posterWrap: {
    width: '100%',
    height: 'min(46vh, 420px)',
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#0B0B0D',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  posterBackdropTitle: {
    position: 'absolute',
    left: '50%',
    bottom: 14,
    transform: 'translateX(-50%)',
    zIndex: 1,
    fontSize: 'clamp(24px, 5vw, 52px)',
    fontWeight: 900,
    letterSpacing: 1,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    maxWidth: '92%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.14)',
    pointerEvents: 'none',
  },
  posterImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    position: 'relative',
    zIndex: 2,
  },
  metaTopRow: { display: 'flex', gap: 10, marginBottom: 14 },
  badge: { border: '1px solid', borderRadius: 999, padding: '6px 10px' },
  badgeText: { fontSize: 12, fontWeight: 700 },
  loadingState: { marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 },
  infoSection: { display: 'flex', flexDirection: 'column', gap: 12 },
  errorText: { fontSize: 13, fontWeight: 600 },
  titleText: { fontSize: 26, fontWeight: 800 },
  metaLine: { fontSize: 13, fontWeight: 600 },
  genreText: { fontSize: 14, fontWeight: 700 },
  card: { border: '1px solid', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: 800 },
  cardBody: { fontSize: 13, lineHeight: '20px' },
};
