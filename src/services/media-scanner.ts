export interface VideoAsset {
  id: string;
  filename: string;
  uri: string;
  duration: number;
  creationTime?: number;
  width: number;
  height: number;
  folder?: string;
  thumbnail?: string | null;
  sourceType?: 'local' | 'plex' | 'nas';
  sourceId?: string;
  sourceName?: string;
  streamContentType?: 'auto' | 'progressive' | 'hls' | 'dash';
}
