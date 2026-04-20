import { getAllSettings, saveSetting } from './database';
import { VideoAsset } from './media-scanner';

const OPEN_SUBTITLES_BASE_URL = 'https://api.opensubtitles.com/api/v1';
const DEFAULT_USER_AGENT = 'Vidara v1.0';
const DEFAULT_API_KEY = 'aADMln5JIXAd88xrzDFrWuzr900gCV6b';

export interface OpenSubtitlesConfig {
  apiKey: string;
  userAgent: string;
  language: string;
}

interface OpenSubtitlesSearchResult {
  id: string;
  attributes?: {
    language?: string;
    download_count?: number;
    hearing_impaired?: boolean;
    files?: Array<{
      file_id?: number;
      file_name?: string;
    }>;
    feature_details?: {
      feature_type?: string;
      movie_name?: string;
      parent_title?: string;
      title?: string;
      year?: number;
      season_number?: number;
      episode_number?: number;
    };
    release?: string;
  };
}

interface OpenSubtitlesSearchResponse {
  data?: OpenSubtitlesSearchResult[];
}

interface OpenSubtitlesDownloadResponse {
  link?: string;
  file_name?: string;
}

interface SeriesMetadata {
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  compactEpisodeTag: string;
  verboseEpisodeTag: string;
}

interface SearchAttempt {
  query: string;
  seriesMetadata?: SeriesMetadata | null;
  label: string;
}

const SETTINGS_KEYS = {
  apiKey: 'opensubtitlesApiKey',
  userAgent: 'opensubtitlesUserAgent',
  language: 'opensubtitlesLanguage',
} as const;

const stripReleaseNoise = (value: string) =>
  value
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[._-]+/g, ' ')
    .replace(/\b\d{3,4}p\b/gi, ' ')
    .replace(/\bWEB[- ]?DL\b/gi, ' ')
    .replace(/\bWEB[- ]?RIP\b/gi, ' ')
    .replace(/\bHDTV\b/gi, ' ')
    .replace(/\bBluRay\b/gi, ' ')
    .replace(/\bREMUX\b/gi, ' ')
    .replace(/\bPROPER\b/gi, ' ')
    .replace(/\bREPACK\b/gi, ' ')
    .replace(/\bNF\b/gi, ' ')
    .replace(/\b[xX]264\b/gi, ' ')
    .replace(/\b[xX]265\b/gi, ' ')
    .replace(/\bH\.?264\b/gi, ' ')
    .replace(/\bH\.?265\b/gi, ' ')
    .replace(/\bAAC\b/gi, ' ')
    .replace(/\bDDP?\d\.\d\b/gi, ' ')
    .replace(/\bEAC3\b/gi, ' ')
    .replace(/\bAMZN\b/gi, ' ')
    .replace(/\bDSNP\b/gi, ' ')
    .replace(/\bHMAX\b/gi, ' ')
    .replace(/\bYIFY\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeQuery = (value: string) =>
  stripReleaseNoise(value)
    .replace(/\bS\d{1,2}E\d{1,2}\b/gi, ' ')
    .replace(/\b\d{1,2}x\d{1,2}\b/gi, ' ')
    .replace(/\bSeason\s?\d+\b/gi, ' ')
    .replace(/\bEpisode\s?\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanSeriesTitle = (value: string) =>
  stripReleaseNoise(value)
    .replace(/\bS\d{1,2}E\d{1,2}\b.*$/gi, ' ')
    .replace(/\b\d{1,2}x\d{1,2}\b.*$/gi, ' ')
    .replace(/\bSeason\s?\d+\b.*$/gi, ' ')
    .replace(/\bEpisode\s?\d+\b.*$/gi, ' ')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseSeriesMetadata = (value: string): SeriesMetadata | null => {
  const cleaned = value.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[._-]+/g, ' ');
  const patterns = [
    /\bS(?<season>\d{1,2})E(?<episode>\d{1,2})\b/i,
    /\b(?<season>\d{1,2})x(?<episode>\d{1,2})\b/i,
    /\bSeason\s?(?<season>\d{1,2})\s*Episode\s?(?<episode>\d{1,2})\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    const seasonNumber = Number(match?.groups?.season);
    const episodeNumber = Number(match?.groups?.episode);
    if (!match || !Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) continue;

    const title = cleanSeriesTitle(cleaned.slice(0, match.index ?? cleaned.length));
    if (!title) continue;

    return {
      title,
      seasonNumber,
      episodeNumber,
      compactEpisodeTag: `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`,
      verboseEpisodeTag: `Season ${seasonNumber} Episode ${episodeNumber}`,
    };
  }

  return null;
};

const buildQueryVariants = (video: VideoAsset, seriesMetadata?: SeriesMetadata | null) => {
  const normalized = normalizeQuery(video.filename);
  const withoutBrackets = normalized.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const beforeDash = withoutBrackets.split(' - ')[0]?.trim() || withoutBrackets;
  const beforeColon = withoutBrackets.split(':')[0]?.trim() || withoutBrackets;
  const baseVariants = [normalized, withoutBrackets, beforeDash, beforeColon];

  if (!seriesMetadata) {
    return Array.from(new Set(baseVariants.filter(Boolean)));
  }

  return Array.from(
    new Set(
      [
        `${seriesMetadata.title} ${seriesMetadata.compactEpisodeTag}`,
        `${seriesMetadata.title} ${seriesMetadata.verboseEpisodeTag}`,
        seriesMetadata.title,
        ...baseVariants,
      ].filter(Boolean)
    )
  );
};

const buildSearchAttempts = (video: VideoAsset, seriesMetadata?: SeriesMetadata | null): SearchAttempt[] => {
  const attempts: SearchAttempt[] = [];
  const seen = new Set<string>();

  const pushAttempt = (query: string, metadata: SeriesMetadata | null | undefined, label: string) => {
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    const key = `${cleanQuery}::${metadata ? `${metadata.seasonNumber}-${metadata.episodeNumber}` : 'no-meta'}::${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    attempts.push({ query: cleanQuery, seriesMetadata: metadata, label });
  };

  for (const query of buildQueryVariants(video, seriesMetadata)) {
    pushAttempt(query, seriesMetadata, 'primary');
  }

  if (seriesMetadata) {
    pushAttempt(seriesMetadata.title, seriesMetadata, 'series-title-with-episode-hints');
    pushAttempt(seriesMetadata.title, null, 'series-title-without-episode-hints');
    pushAttempt(`${seriesMetadata.title} ${seriesMetadata.compactEpisodeTag}`, null, 'series-tag-without-episode-hints');
    pushAttempt(`${seriesMetadata.title} ${seriesMetadata.verboseEpisodeTag}`, null, 'series-verbose-without-episode-hints');
  }

  pushAttempt(normalizeQuery(video.filename), null, 'normalized-fallback');

  return attempts;
};

export const loadOpenSubtitlesConfig = async (): Promise<OpenSubtitlesConfig> => {
  const settings = await getAllSettings();
  return {
    apiKey: settings[SETTINGS_KEYS.apiKey] ?? DEFAULT_API_KEY,
    userAgent: settings[SETTINGS_KEYS.userAgent] ?? DEFAULT_USER_AGENT,
    language: settings[SETTINGS_KEYS.language] ?? 'en',
  };
};

export const saveOpenSubtitlesConfig = async (config: OpenSubtitlesConfig) => {
  await Promise.all([
    saveSetting(SETTINGS_KEYS.apiKey, config.apiKey),
    saveSetting(SETTINGS_KEYS.userAgent, config.userAgent || DEFAULT_USER_AGENT),
    saveSetting(SETTINGS_KEYS.language, config.language || 'en'),
  ]);
};

const buildHeaders = (config: OpenSubtitlesConfig) => ({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'Api-Key': config.apiKey,
  'User-Agent': config.userAgent || DEFAULT_USER_AGENT,
});

const requireConfig = (config: OpenSubtitlesConfig) => {
  if (!config.apiKey) {
    throw new Error('OpenSubtitles API key is missing.');
  }
};

const searchSubtitles = async (
  query: string,
  config: OpenSubtitlesConfig,
  seriesMetadata?: SeriesMetadata | null
) => {
  const params = new URLSearchParams({
    query,
    languages: config.language || 'en',
    order_by: 'download_count',
    order_direction: 'desc',
  });

  if (seriesMetadata) {
    params.set('season_number', String(seriesMetadata.seasonNumber));
    params.set('episode_number', String(seriesMetadata.episodeNumber));
  }

  const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/subtitles?${params.toString()}`, {
    headers: buildHeaders(config),
  });

  if (!response.ok) {
    throw new Error(`OpenSubtitles search failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenSubtitlesSearchResponse;
  return payload.data ?? [];
};

const getResolutionTagFromFilename = (value: string) => {
  if (/\b(4k|uhd)\b/i.test(value)) return '2160';
  const match = value.match(/\b(2160|1440|1080|720|480|360)p?\b/i);
  return match ? match[1] : null;
};

const getResolutionTagFromVideo = (video: VideoAsset) => {
  const height = Number(video.height || 0);
  const width = Number(video.width || 0);
  if (height >= 2000 || width >= 3800) return '2160';
  if (height >= 1400 || width >= 2500) return '1440';
  if (height >= 1000 || width >= 1800) return '1080';
  if (height >= 700 || width >= 1200) return '720';
  if (height >= 430 || width >= 720) return '480';
  if (height >= 330 || width >= 600) return '360';
  return getResolutionTagFromFilename(video.filename);
};

const resolutionTokens: Record<string, string[]> = {
  '2160': ['2160', '2160p', '4k', 'uhd'],
  '1440': ['1440', '1440p'],
  '1080': ['1080', '1080p'],
  '720': ['720', '720p'],
  '480': ['480', '480p'],
  '360': ['360', '360p'],
};

const hasResolutionToken = (haystack: string, tag: string) =>
  (resolutionTokens[tag] ?? []).some((token) => haystack.includes(token));

const hasAnyResolutionToken = (haystack: string) =>
  Object.values(resolutionTokens).some((tokens) => tokens.some((token) => haystack.includes(token)));

const pickBestFileId = (results: OpenSubtitlesSearchResult[], video: VideoAsset, seriesMetadata?: SeriesMetadata | null) => {
  const normalizedFilename = normalizeQuery(video.filename).toLowerCase();
  const normalizedSeriesTitle = seriesMetadata?.title.toLowerCase();
  const preferredLanguage = 'en';
  const preferredResolution = getResolutionTagFromVideo(video);

  const scoreResult = (item: OpenSubtitlesSearchResult) => {
    const release = normalizeQuery(item.attributes?.release || '').toLowerCase();
    const title = normalizeQuery(
      item.attributes?.feature_details?.movie_name ||
      item.attributes?.feature_details?.parent_title ||
      item.attributes?.feature_details?.title ||
      ''
    ).toLowerCase();
    const parentTitle = normalizeQuery(item.attributes?.feature_details?.parent_title || '').toLowerCase();
    const fileNames = (item.attributes?.files ?? [])
      .map((entry) => normalizeQuery(entry.file_name || '').toLowerCase())
      .join(' ');
    const haystack = `${title} ${release} ${fileNames}`.trim();

    let score = item.attributes?.download_count ?? 0;
    if (item.attributes?.language?.toLowerCase() === preferredLanguage) score += 2500;
    if (item.attributes?.hearing_impaired === false) score += 150;
    if (!haystack) return score;

    if (normalizedFilename && (haystack.includes(normalizedFilename) || normalizedFilename.includes(haystack))) {
      score += 5000;
    }

    if (normalizedSeriesTitle && haystack.includes(normalizedSeriesTitle)) {
      score += 3000;
    }

    if (normalizedSeriesTitle && parentTitle.includes(normalizedSeriesTitle)) {
      score += 4500;
    }

    if (preferredResolution) {
      const matchesResolution = hasResolutionToken(haystack, preferredResolution);
      if (matchesResolution) score += 3500;
      if (!matchesResolution && hasAnyResolutionToken(haystack)) score -= 1500;
    }

    if (seriesMetadata) {
      const compactTag = seriesMetadata.compactEpisodeTag.toLowerCase();
      const looseTag = `${seriesMetadata.seasonNumber}x${seriesMetadata.episodeNumber}`.toLowerCase();
      if (haystack.includes(compactTag)) score += 8000;
      if (haystack.includes(looseTag)) score += 7000;
      if (haystack.includes(`season ${seriesMetadata.seasonNumber}`) && haystack.includes(`episode ${seriesMetadata.episodeNumber}`)) {
        score += 6000;
      }
      if (item.attributes?.feature_details?.season_number === seriesMetadata.seasonNumber) score += 5000;
      if (item.attributes?.feature_details?.episode_number === seriesMetadata.episodeNumber) score += 5000;
      if (item.attributes?.feature_details?.feature_type?.toLowerCase() === 'episode') score += 2000;
    }

    return score;
  };

  const ranked = [...results].sort((a, b) => scoreResult(b) - scoreResult(a));

  for (const item of ranked) {
    const candidateTitle = normalizeQuery(
      item.attributes?.feature_details?.movie_name ||
      item.attributes?.feature_details?.title ||
      item.attributes?.release ||
      ''
    ).toLowerCase();

    const file = item.attributes?.files?.find((entry) => typeof entry.file_id === 'number');
    if (!file?.file_id) continue;
    if (
      !candidateTitle ||
      normalizedFilename.includes(candidateTitle) ||
      candidateTitle.includes(normalizedFilename) ||
      (normalizedSeriesTitle ? candidateTitle.includes(normalizedSeriesTitle) || normalizedSeriesTitle.includes(candidateTitle) : false)
    ) {
      return file.file_id;
    }
  }

  return ranked[0]?.attributes?.files?.find((entry) => typeof entry.file_id === 'number')?.file_id ?? null;
};

const downloadSubtitle = async (fileId: number, config: OpenSubtitlesConfig) => {
  const response = await fetch(`${OPEN_SUBTITLES_BASE_URL}/download`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      file_id: fileId,
      sub_format: 'srt',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenSubtitles download lookup failed with ${response.status}`);
  }

  const payload = (await response.json()) as OpenSubtitlesDownloadResponse;
  if (!payload.link) {
    throw new Error('OpenSubtitles did not return a subtitle download link.');
  }

  const subtitleResponse = await fetch(payload.link, {
    headers: {
      'Api-Key': config.apiKey,
      'User-Agent': config.userAgent || DEFAULT_USER_AGENT,
      Accept: '*/*',
    },
  });

  if (!subtitleResponse.ok) {
    throw new Error(`Subtitle file download failed with ${subtitleResponse.status}`);
  }

  return subtitleResponse.text();
};

export const fetchSubtitleFromOpenSubtitles = async (video: VideoAsset, config?: OpenSubtitlesConfig) => {
  const resolvedConfig = config ?? (await loadOpenSubtitlesConfig());
  requireConfig(resolvedConfig);
  const seriesMetadata = parseSeriesMetadata(video.filename);
  const attempts = buildSearchAttempts(video, seriesMetadata);
  let results: OpenSubtitlesSearchResult[] = [];
  let winningAttempt: SearchAttempt | null = null;

  for (const attempt of attempts) {
    try {
      results = await searchSubtitles(attempt.query, resolvedConfig, attempt.seriesMetadata);
      console.log(
        `[OpenSubtitles] ${video.filename} :: ${attempt.label} :: "${attempt.query}" -> ${results.length} result(s)`
      );
      if (results.length > 0) {
        winningAttempt = attempt;
        break;
      }
    } catch (error) {
      console.warn(
        `[OpenSubtitles] search failed for "${video.filename}" using ${attempt.label} :: "${attempt.query}"`,
        error
      );
    }
  }

  const fileId = pickBestFileId(results, video, seriesMetadata);

  if (!fileId) {
    console.warn(
      `[OpenSubtitles] no subtitle match for "${video.filename}" after ${attempts.length} search attempt(s)`
    );
    throw new Error(`No matching subtitle file was found on OpenSubtitles for "${video.filename}".`);
  }

  console.log(
    `[OpenSubtitles] downloading subtitle for "${video.filename}" with file id ${fileId}` +
      (winningAttempt ? ` via ${winningAttempt.label} ("${winningAttempt.query}")` : '')
  );
  const subtitleSrt = await downloadSubtitle(fileId, resolvedConfig);
  return {
    subtitleSrt,
    language: resolvedConfig.language || 'en',
    provider: 'OpenSubtitles',
  };
};
