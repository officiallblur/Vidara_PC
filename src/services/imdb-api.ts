export interface ImdbTitleDetails {
  imdbID: string;
  title: string;
  year: string;
  rated: string;
  released: string;
  runtime: string;
  genre: string;
  director: string;
  writer: string;
  actors: string;
  plot: string;
  language: string;
  country: string;
  awards: string;
  poster: string;
  metascore: string;
  imdbRating: string;
  imdbVotes: string;
  type: string;
  totalSeasons?: string;
}

const OMDB_API_KEY = 'thewdb';
const OMDB_BASE_URL = 'https://www.omdbapi.com/';

const normalizeField = (v: string | undefined) => (!v || v === 'N/A' ? '' : v);

const mapOmdbPayload = (p: Record<string, string>): ImdbTitleDetails => ({
  imdbID: p.imdbID, title: p.Title, year: p.Year,
  rated: normalizeField(p.Rated), released: normalizeField(p.Released),
  runtime: normalizeField(p.Runtime), genre: normalizeField(p.Genre),
  director: normalizeField(p.Director), writer: normalizeField(p.Writer),
  actors: normalizeField(p.Actors), plot: normalizeField(p.Plot),
  language: normalizeField(p.Language), country: normalizeField(p.Country),
  awards: normalizeField(p.Awards), poster: normalizeField(p.Poster),
  metascore: normalizeField(p.Metascore), imdbRating: normalizeField(p.imdbRating),
  imdbVotes: normalizeField(p.imdbVotes), type: normalizeField(p.Type),
  totalSeasons: normalizeField(p.totalSeasons),
});

const sanitizeTitle = (title: string) =>
  title
    .replace(/\.(mkv|mp4|avi|mov|wmv|flv|webm)$/i, '')
    .replace(/\b(1080p|720p|2160p|4k|x264|x265|h264|h265|webrip|brrip|bluray|web-dl|aac|ac3|dts)\b/gi, ' ')
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const IMDBApi = {
  getTitleDetails: async (rawTitle: string, year?: string): Promise<ImdbTitleDetails | null> => {
    const title = sanitizeTitle(rawTitle);
    try {
      const params = new URLSearchParams({ apikey: OMDB_API_KEY, plot: 'full', t: title });
      if (year) params.set('y', year);
      const res = await fetch(`${OMDB_BASE_URL}?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.Response === 'True') return mapOmdbPayload(data);

      // Fallback search
      const sp = new URLSearchParams({ apikey: OMDB_API_KEY, s: title, type: 'movie' });
      if (year) sp.set('y', year);
      const sr = await fetch(`${OMDB_BASE_URL}?${sp.toString()}`);
      const sd = await sr.json();
      if (sd.Search?.length > 0) {
        const detailRes = await fetch(`${OMDB_BASE_URL}?${new URLSearchParams({ apikey: OMDB_API_KEY, plot: 'full', i: sd.Search[0].imdbID }).toString()}`);
        const dd = await detailRes.json();
        if (dd.Response === 'True') return mapOmdbPayload(dd);
      }
      return null;
    } catch {
      return null;
    }
  },
};
