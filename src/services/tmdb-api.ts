export interface MovieRelease {
  id: string;
  title: string;
  genre: string;
  releaseYear: number;
  matchScore: number;
  posterUri: string;
}

const API_KEY = 'ce1a0db13c99a45fd7effb86ab82f78f';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

const GENRE_MAP: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
  10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News', 10764: 'Reality',
  10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

export const TMDBApi = {
  getLatestReleases: async (): Promise<MovieRelease[]> => {
    try {
      const [movieRes, tvRes] = await Promise.all([
        fetch(`${BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=en-US&page=1`),
        fetch(`${BASE_URL}/tv/on_the_air?api_key=${API_KEY}&language=en-US&page=1`),
      ]);
      const movieData = await movieRes.json();
      const tvData = await tvRes.json();

      const movies: MovieRelease[] = (movieData.results || []).slice(0, 7).map((m: any) => ({
        id: `tmdb-m-${m.id}`,
        title: m.title,
        genre: m.genre_ids.map((id: number) => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', '),
        releaseYear: parseInt(m.release_date?.substring(0, 4)) || 2024,
        matchScore: Math.round(m.vote_average * 10),
        posterUri: m.poster_path ? `${IMAGE_BASE_URL}${m.poster_path}` : 'https://images.unsplash.com/photo-1635805737707-575885ab0820?w=400',
      }));

      const series: MovieRelease[] = (tvData.results || []).slice(0, 7).map((s: any) => ({
        id: `tmdb-s-${s.id}`,
        title: s.name,
        genre: s.genre_ids.map((id: number) => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', '),
        releaseYear: parseInt(s.first_air_date?.substring(0, 4)) || 2024,
        matchScore: Math.round(s.vote_average * 10),
        posterUri: s.poster_path ? `${IMAGE_BASE_URL}${s.poster_path}` : 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?w=400',
      }));

      return [...movies, ...series].sort(() => Math.random() - 0.5);
    } catch (e) {
      console.warn('TMDB API fetch failed:', e);
      return [];
    }
  },

  searchPoster: async (filename: string): Promise<string | null> => {
    try {
      let query = filename
        .replace(/\.(mp4|mkv|avi|mov|wmv|flv)$/i, '')
        .replace(/\.(1080p|720p|4k|2160p|h264|x264|x265|brrip|webrip|bluray|aac|ac3|dts|web-dl).*/i, '')
        .replace(/[._\-]/g, ' ')
        .trim();

      const searchRes = await fetch(`${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`);
      const searchData = await searchRes.json();
      if (searchData.results?.length > 0) {
        const top = searchData.results[0];
        return top.poster_path ? `${IMAGE_BASE_URL}${top.poster_path}` : null;
      }

      const tvRes = await fetch(`${BASE_URL}/search/tv?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`);
      const tvData = await tvRes.json();
      if (tvData.results?.length > 0) {
        const top = tvData.results[0];
        return top.poster_path ? `${IMAGE_BASE_URL}${top.poster_path}` : null;
      }
      return null;
    } catch {
      return null;
    }
  },
};
