import db from './database';

export interface AnalyticsDay {
  dateKey: string;
  dayNumber: number;
  seconds: number;
  started: number;
  intensity: number;
}

export interface AnalyticsDayDetails {
  dateKey: string;
  started: number;
  watchTimeSeconds: number;
  topCategory: string;
  recentTitles: string[];
}

export interface AnalyticsDashboard {
  totalStarted: number;
  totalWatchTimeSeconds: number;
  activeDays: number;
  streakDays: number;
  completionRate: number;
  topCategory: string;
  selectedDateKey: string;
  monthLabel: string;
  leadingBlankDays: number;
  days: AnalyticsDay[];
  weekly: { label: string; dateKey: string; seconds: number }[];
  selectedDay: AnalyticsDayDetails;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function shiftMonth(dateKey: string, delta: number) {
  const date = fromDateKey(dateKey);
  return toLocalDateKey(new Date(date.getFullYear(), date.getMonth() + delta, 1));
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function weekdayLabel(dateKey: string) {
  return fromDateKey(dateKey).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
}

function buildDateKeys(start: Date, end: Date) {
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (cursor <= end) {
    keys.push(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function computeStreak(activeDateKeys: Set<string>) {
  let streak = 0;
  const cursor = new Date();
  while (activeDateKeys.has(toLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function getAnalyticsDashboard(monthDateKey: string, selectedDateKey: string): Promise<AnalyticsDashboard> {
  const monthDate = fromDateKey(monthDateKey);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

  const sevenDayStart = new Date();
  sevenDayStart.setDate(sevenDayStart.getDate() - 6);

  // Get all watch history
  const allHistory = await db.watch_history.toArray();
  const allVideos = await db.videos.toArray();
  const videoFolderMap = new Map(allVideos.map((v) => [v.uri, v.folder]));

  const totalStarted = allHistory.length;
  const totalWatchTimeSeconds = allHistory.reduce((sum, h) => sum + h.position, 0);
  const completionCount = allHistory.filter(
    (h) => h.duration > 0 && h.position >= h.duration * 0.9
  ).length;
  const completionRate = totalStarted > 0 ? Math.round((completionCount / totalStarted) * 100) : 0;

  // Build date-based maps
  const dateMap = new Map<string, { started: number; seconds: number; titles: string[] }>();
  for (const h of allHistory) {
    const dk = toLocalDateKey(new Date(h.last_watched));
    const existing = dateMap.get(dk) ?? { started: 0, seconds: 0, titles: [] };
    existing.started += 1;
    existing.seconds += h.position;
    existing.titles.push(h.filename);
    dateMap.set(dk, existing);
  }

  const activeDateKeys = new Set(Array.from(dateMap.keys()).filter((k) => (dateMap.get(k)?.seconds ?? 0) > 0));
  const activeDays = activeDateKeys.size;
  const streakDays = computeStreak(activeDateKeys);

  // Top category
  const categoryCount = new Map<string, number>();
  for (const h of allHistory) {
    const cat = videoFolderMap.get(h.uri) ?? 'Library';
    categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);
  }
  const topCategory = Array.from(categoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Library';

  // Month days
  const monthKeys = buildDateKeys(monthStart, monthEnd);
  const monthMax = Math.max(1, ...monthKeys.map((k) => dateMap.get(k)?.seconds ?? 0));
  const days: AnalyticsDay[] = monthKeys.map((dk) => {
    const d = dateMap.get(dk);
    const seconds = d?.seconds ?? 0;
    return {
      dateKey: dk,
      dayNumber: fromDateKey(dk).getDate(),
      seconds,
      started: d?.started ?? 0,
      intensity: seconds > 0 ? Math.max(0.2, seconds / monthMax) : 0,
    };
  });

  // Weekly
  const weeklyKeys = buildDateKeys(sevenDayStart, new Date());
  const weekly = weeklyKeys.map((dk) => ({
    dateKey: dk,
    label: weekdayLabel(dk),
    seconds: dateMap.get(dk)?.seconds ?? 0,
  }));

  // Selected day
  const selectedData = dateMap.get(selectedDateKey);
  const selectedDayCategoryCount = new Map<string, number>();
  if (selectedData) {
    for (const h of allHistory) {
      const hdk = toLocalDateKey(new Date(h.last_watched));
      if (hdk !== selectedDateKey) continue;
      const cat = videoFolderMap.get(h.uri) ?? 'Library';
      selectedDayCategoryCount.set(cat, (selectedDayCategoryCount.get(cat) ?? 0) + 1);
    }
  }
  const selectedDayTopCategory =
    Array.from(selectedDayCategoryCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Library';

  return {
    totalStarted,
    totalWatchTimeSeconds,
    activeDays,
    streakDays,
    completionRate,
    topCategory,
    selectedDateKey,
    monthLabel: formatMonthLabel(monthStart),
    leadingBlankDays: monthStart.getDay(),
    days,
    weekly,
    selectedDay: {
      dateKey: selectedDateKey,
      started: selectedData?.started ?? 0,
      watchTimeSeconds: selectedData?.seconds ?? 0,
      topCategory: selectedDayTopCategory,
      recentTitles: (selectedData?.titles ?? []).slice(0, 4),
    },
  };
}
