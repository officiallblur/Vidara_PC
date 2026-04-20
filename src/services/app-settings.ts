export const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
};

export const getCacheStats = async () => ({ bytes: 0, files: 0 });

export const applyVideoCacheSize = async (sizeMb: number) => {
  return Math.min(2048, Math.max(8, Math.round(sizeMb)));
};

export const clearAppCache = async () => {
  // On web/desktop, clearing cache is handled differently
};
