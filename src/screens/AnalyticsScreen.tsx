import React, { useEffect, useState } from 'react';
import { IoCalendarOutline, IoCalendar } from 'react-icons/io5';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { useAppTheme } from '../hooks/use-app-theme';
import { getAnalyticsDashboard, shiftMonth, toLocalDateKey, type AnalyticsDashboard } from '../services/analytics';

const WEEKDAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function formatHours(seconds: number) {
  if (seconds <= 0) return '0h';
  const hours = seconds / 3600;
  return hours >= 10 ? `${Math.round(hours)}h` : `${hours.toFixed(1)}h`;
}

function formatMinutes(seconds: number) {
  if (seconds <= 0) return '0m';
  return `${Math.max(1, Math.round(seconds / 60))}m`;
}

export default function AnalyticsScreen() {
  const { colors, accentColor, isLight } = useAppTheme();
  const todayKey = toLocalDateKey(new Date());
  const [monthDateKey, setMonthDateKey] = useState(todayKey.slice(0, 8) + '01');
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [showCalendar, setShowCalendar] = useState(true);
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAnalyticsDashboard(monthDateKey, selectedDateKey).then((data) => {
      setDashboard(data);
      setLoading(false);
    });
  }, [monthDateKey, selectedDateKey]);

  const changeMonth = (delta: number) => {
    const nextMonthKey = shiftMonth(monthDateKey, delta);
    setMonthDateKey(nextMonthKey);
    setSelectedDateKey(nextMonthKey);
  };

  if (loading || !dashboard) {
    return (
      <ThemedView style={s.loadingState}>
        <span style={{ color: accentColor }}>Loading...</span>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={s.container}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <img src="/Vidara-logo.png" style={s.logoSmall} alt="Vidara logo" />
          <ThemedText style={s.headerTitle}>Analytics</ThemedText>
        </div>
        <button style={s.headerBtn} onClick={() => setShowCalendar((v) => !v)}>
          {showCalendar ? <IoCalendar size={24} color={colors.text} /> : <IoCalendarOutline size={24} color={colors.text} />}
        </button>
      </div>

      <div style={s.scroll}>
        <div style={s.statGrid}>
          {renderStatCard('Titles Started', dashboard.totalStarted, accentColor, colors)}
          {renderStatCard('Watch Time', formatHours(dashboard.totalWatchTimeSeconds), '#3B82F6', colors)}
        </div>

        <div style={s.statGrid}>
          {renderStatCard('Active Days', dashboard.activeDays, '#10B981', colors)}
          {renderStatCard('Completion Rate', `${dashboard.completionRate}%`, '#F59E0B', colors)}
        </div>

        <div style={{ ...s.chartCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <div style={s.cardHeader}>
            <span style={{ ...s.chartTitle, color: colors.text }}>Weekly Insights</span>
            <span style={{ ...s.cardMeta, color: colors.mutedText }}>{dashboard.streakDays} day streak • {dashboard.topCategory}</span>
          </div>
          <div style={s.barChart}>
            {dashboard.weekly.map((item) => {
              const maxSeconds = Math.max(1, ...dashboard.weekly.map((day) => day.seconds));
              const heightPercent = Math.max(8, (item.seconds / maxSeconds) * 100);
              const isToday = item.dateKey === todayKey;
              return (
                <div key={item.dateKey} style={s.barWrapper}>
                  <span style={{ ...s.barValue, color: colors.subtleText }}>{item.seconds > 0 ? formatMinutes(item.seconds) : ''}</span>
                  <div style={{ ...s.barFill, height: `${heightPercent}%`, backgroundColor: isToday ? accentColor : colors.secondarySurface, borderColor: isToday ? `${accentColor}55` : colors.border }} />
                  <span style={{ ...s.barDay, color: colors.subtleText }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {showCalendar && (
          <div style={{ ...s.calendarCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
            <div style={s.calendarHeader}>
              <button style={s.monthButton} onClick={() => changeMonth(-1)}>‹</button>
              <span style={{ ...s.chartTitle, color: colors.text }}>{dashboard.monthLabel}</span>
              <button style={s.monthButton} onClick={() => changeMonth(1)}>›</button>
            </div>

            <div style={s.weekdayRow}>
              {WEEKDAY_HEADERS.map((label, index) => (
                <span key={`${label}-${index}`} style={{ ...s.weekdayText, color: colors.subtleText }}>{label}</span>
              ))}
            </div>

            <div style={s.calendarGrid}>
              {Array.from({ length: dashboard.leadingBlankDays }).map((_, i) => (
                <div key={`blank-${i}`} style={s.blankDay} />
              ))}
              {dashboard.days.map((day) => {
                const isSelected = day.dateKey === dashboard.selectedDateKey;
                const cellColor =
                  day.seconds <= 0
                    ? colors.surface
                    : isLight
                      ? `rgba(124, 157, 255, ${Math.min(0.18 + day.intensity * 0.35, 0.52)})`
                      : `rgba(124, 157, 255, ${Math.min(0.14 + day.intensity * 0.5, 0.74)})`;
                return (
                  <button
                    key={day.dateKey}
                    style={{ ...s.dayCell, backgroundColor: cellColor, borderColor: isSelected ? accentColor : colors.border }}
                    onClick={() => setSelectedDateKey(day.dateKey)}
                  >
                    <span style={{ ...s.dayNumber, color: isSelected ? accentColor : colors.text }}>{day.dayNumber}</span>
                    <span style={{ ...s.dayMeta, color: colors.mutedText }}>{day.started > 0 ? day.started : ''}</span>
                  </button>
                );
              })}
            </div>

            <div style={s.legendRow}>
              <span style={{ ...s.legendText, color: colors.subtleText }}>Low</span>
              <div style={s.legendScale}>
                <div style={{ ...s.legendBox, backgroundColor: colors.surface, borderColor: colors.border }} />
                <div style={{ ...s.legendBox, backgroundColor: `${accentColor}44`, borderColor: colors.border }} />
                <div style={{ ...s.legendBox, backgroundColor: `${accentColor}AA`, borderColor: colors.border }} />
              </div>
              <span style={{ ...s.legendText, color: colors.subtleText }}>High</span>
            </div>
          </div>
        )}

        <div style={{ ...s.dayCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
          <div style={s.cardHeader}>
            <span style={{ ...s.chartTitle, color: colors.text }}>Day Snapshot</span>
            <span style={{ ...s.cardMeta, color: colors.mutedText }}>{dashboard.selectedDay.dateKey}</span>
          </div>
          <div style={s.dayMetrics}>
            <div style={{ ...s.dayMetricPill, backgroundColor: colors.surface, borderColor: colors.border }}>
              <span style={{ ...s.dayMetricLabel, color: colors.subtleText }}>Started</span>
              <span style={{ ...s.dayMetricValue, color: colors.text }}>{dashboard.selectedDay.started}</span>
            </div>
            <div style={{ ...s.dayMetricPill, backgroundColor: colors.surface, borderColor: colors.border }}>
              <span style={{ ...s.dayMetricLabel, color: colors.subtleText }}>Watch Time</span>
              <span style={{ ...s.dayMetricValue, color: colors.text }}>{formatMinutes(dashboard.selectedDay.watchTimeSeconds)}</span>
            </div>
            <div style={{ ...s.dayMetricPill, backgroundColor: colors.surface, borderColor: colors.border }}>
              <span style={{ ...s.dayMetricLabel, color: colors.subtleText }}>Top Category</span>
              <span style={{ ...s.dayMetricValue, color: colors.text }}>{dashboard.selectedDay.topCategory}</span>
            </div>
          </div>
          <div style={s.titleList}>
            {dashboard.selectedDay.recentTitles.length === 0 ? (
              <span style={{ ...s.emptyText, color: colors.mutedText }}>No watch activity recorded for this day yet.</span>
            ) : (
              dashboard.selectedDay.recentTitles.map((title, index) => (
                <div key={`recent-${index}`} style={s.titleRow}>
                  <span style={{ color: accentColor }}>▶</span>
                  <span style={{ ...s.titleRowText, color: colors.text }}>{title}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </ThemedView>
  );
}

function renderStatCard(label: string, value: string | number, color: string, colors: any) {
  return (
    <div style={{ ...s.statCard, backgroundColor: colors.elevatedSurface, borderColor: colors.border }}>
      <div style={{ ...s.statIcon, backgroundColor: `${color}20` }} />
      <span style={{ ...s.statLabel, color: colors.subtleText }}>{label}</span>
      <span style={{ ...s.statValue, color: colors.text }}>{value}</span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', height: '100%' },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center', display: 'flex' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logoSmall: { width: 46, height: 46, borderRadius: 12, objectFit: 'contain', display: 'block' },
  headerTitle: { fontSize: 24, fontWeight: 800 },
  headerBtn: { padding: 4, background: 'none', border: 'none', cursor: 'pointer' },
  scroll: { padding: '0 16px 16px', overflowY: 'auto', flex: 1 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  statCard: { borderRadius: 20, padding: 18, border: '1px solid' },
  statIcon: { width: 42, height: 42, borderRadius: 12, marginBottom: 14 },
  statLabel: { fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'block' },
  statValue: { fontSize: 24, fontWeight: 700 },
  chartCard: { borderRadius: 20, padding: 20, border: '1px solid', marginTop: 8, marginBottom: 20 },
  calendarCard: { borderRadius: 20, padding: 20, border: '1px solid', marginBottom: 20 },
  dayCard: { borderRadius: 20, padding: 20, border: '1px solid' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  chartTitle: { fontSize: 18, fontWeight: 700 },
  cardMeta: { fontSize: 12, fontWeight: 600 },
  barChart: { display: 'flex', height: 190, alignItems: 'flex-end', justifyContent: 'space-between' },
  barWrapper: { alignItems: 'center', flex: 1, height: '100%', display: 'flex', justifyContent: 'flex-end' },
  barValue: { fontSize: 10, marginBottom: 8, minHeight: 16 },
  barFill: { width: 28, borderRadius: 8, border: '1px solid', minHeight: 14 },
  barDay: { fontSize: 11, marginTop: 12, fontWeight: 600 },
  calendarHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthButton: { width: 36, height: 36, borderRadius: 18, border: 'none', cursor: 'pointer' },
  weekdayRow: { display: 'flex', marginBottom: 10 },
  weekdayText: { width: '14.2%', textAlign: 'center', fontSize: 11, fontWeight: 700 },
  calendarGrid: { display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 },
  blankDay: { aspectRatio: '1/1' },
  dayCell: { aspectRatio: '1/1', borderRadius: 12, border: '1px solid', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  dayNumber: { fontSize: 14, fontWeight: 700 },
  dayMeta: { fontSize: 10, marginTop: 4 },
  legendRow: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  legendText: { fontSize: 10, fontWeight: 600 },
  legendScale: { display: 'flex', gap: 4 },
  legendBox: { width: 16, height: 16, borderRadius: 4, border: '1px solid' },
  dayMetrics: { display: 'flex', gap: 10, marginBottom: 18 },
  dayMetricPill: { flex: 1, borderRadius: 14, border: '1px solid', padding: 12 },
  dayMetricLabel: { fontSize: 11, fontWeight: 700, marginBottom: 6, display: 'block' },
  dayMetricValue: { fontSize: 15, fontWeight: 700 },
  titleList: { display: 'flex', flexDirection: 'column', gap: 10 },
  titleRow: { display: 'flex', alignItems: 'center', gap: 10 },
  titleRowText: { flex: 1, fontSize: 14, fontWeight: 600 },
  emptyText: { fontSize: 14, lineHeight: '20px' },
};
