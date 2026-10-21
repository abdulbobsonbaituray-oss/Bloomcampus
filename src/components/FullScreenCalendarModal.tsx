import React, { useState, useMemo } from 'react';
import {
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Sparkles,
  Columns3,
  Maximize2,
} from 'lucide-react';
import { CycleMetrics, UserData } from '../types';
import { MOOD_CATEGORIES, PHASE_ADVISOR_DATA } from '../constants';
import {
  addDaysISO,
  calculateCycleMetrics,
  formatDateISO,
  formatHumanDate,
  formatShortMonthDay,
  getFertileStatusForDate,
  getLockedTodayISO,
  isDateInLoggedPeriod,
  isDateInPredictedPeriod,
  parseDateISO,
} from '../utils/cycleEngine';

interface FullScreenCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: UserData;
  todayMetrics: CycleMetrics;
  calendarMonth: number;
  calendarYear: number;
  selectedDateStr: string;
  onChangeMonth: (delta: number) => void;
  onJumpToMonthYear: (month: number, year: number) => void;
  onJumpToToday: () => void;
  onSelectDate: (dateStr: string) => void;
  onSetAsPeriodStart: (dateStr: string) => void;
  onSetAsPeriodEnd: (dateStr: string) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const FullScreenCalendarModal: React.FC<FullScreenCalendarModalProps> = ({
  isOpen,
  onClose,
  userData,
  todayMetrics,
  calendarMonth,
  calendarYear,
  selectedDateStr,
  onChangeMonth,
  onJumpToMonthYear,
  onJumpToToday,
  onSelectDate,
  onSetAsPeriodStart,
  onSetAsPeriodEnd,
}) => {
  const [viewMode, setViewMode] = useState<'single' | 'threeMonth'>('single');
  const [showStageLabels, setShowStageLabels] = useState<boolean>(true);

  const todayStr = getLockedTodayISO();

  const pillDatesSet = useMemo(() => {
    const s = new Set<string>();
    (userData.emergencyPills || []).forEach((p) => {
      if (p.dateStr) s.add(p.dateStr);
    });
    return s;
  }, [userData.emergencyPills]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, string[]> = {};
    (userData.academicTasks || []).forEach((t) => {
      if (!t.dueDate) return;
      if (!map[t.dueDate]) map[t.dueDate] = [];
      map[t.dueDate].push(t.title);
    });
    return map;
  }, [userData.academicTasks]);

  const appointmentsByDate = useMemo(() => {
    const map: Record<string, string[]> = {};
    (userData.appointments || []).forEach((a) => {
      if (!a.requestedDate) return;
      if (!map[a.requestedDate]) map[a.requestedDate] = [];
      map[a.requestedDate].push(a.treatmentType);
    });
    return map;
  }, [userData.appointments]);

  // Build current + next 5 predicted period & ovulation windows anchored on the entered period
  const upcomingCycleWindows = useMemo(() => {
    const baseStart = todayMetrics.activePeriodStartStr || todayMetrics.nextPeriodDateStr;
    if (!baseStart) return [];
    const bleedDays = todayMetrics.activePeriodDuration || todayMetrics.avgPeriodDuration || 5;
    const list: Array<{
      cycleNumber: number;
      periodStart: string;
      periodEnd: string;
      ovulationStart: string;
      ovulationPeak: string;
      ovulationEnd: string;
      month: number;
      year: number;
    }> = [];

    for (let i = 0; i < 6; i++) {
      const pStart = addDaysISO(baseStart, i * todayMetrics.avgCycleLength);
      const pEnd = addDaysISO(pStart, bleedDays - 1);
      const ovPeak = addDaysISO(pStart, todayMetrics.ovulationDay - 1);
      const ovStart = addDaysISO(pStart, todayMetrics.ovStart - 1);
      const ovEnd = addDaysISO(pStart, todayMetrics.ovEnd - 1);
      const pDateObj = parseDateISO(pStart);

      list.push({
        cycleNumber: i + 1,
        periodStart: pStart,
        periodEnd: pEnd,
        ovulationStart: ovStart,
        ovulationPeak: ovPeak,
        ovulationEnd: ovEnd,
        month: pDateObj.getMonth(),
        year: pDateObj.getFullYear(),
      });
    }
    return list;
  }, [todayMetrics]);

  const selectedDayMetrics = useMemo(
    () => calculateCycleMetrics(userData, selectedDateStr),
    [userData, selectedDateStr]
  );

  if (!isOpen) return null;

  const renderMonthGrid = (targetMonth: number, targetYear: number, compact = false) => {
    const firstDayIdx = new Date(targetYear, targetMonth, 1).getDay();
    const totalDays = new Date(targetYear, targetMonth + 1, 0).getDate();

    return (
      <div
        key={`${targetYear}-${targetMonth}`}
        className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col"
      >
        {compact && (
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
            <h4 className="font-display font-extrabold text-base text-slate-900">
              {MONTH_NAMES[targetMonth]} {targetYear}
            </h4>
            <span className="text-[11px] font-bold text-lavender-700">
              {totalDays} days
            </span>
          </div>
        )}

        <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">
          {DAY_HEADERS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5 flex-1">
          {Array.from({ length: firstDayIdx }).map((_, i) => (
            <div
              key={`empty-${targetMonth}-${i}`}
              className={compact ? 'h-16 rounded-xl bg-slate-50/40' : 'h-24 sm:h-28 rounded-2xl bg-slate-50/40'}
            />
          ))}

          {Array.from({ length: totalDays }).map((_, idx) => {
            const day = idx + 1;
            const dObj = new Date(targetYear, targetMonth, day);
            const dStr = formatDateISO(dObj);
            const dayMetrics = calculateCycleMetrics(userData, dStr);
            const isLoggedPeriod = isDateInLoggedPeriod(userData, dStr);
            const isPredPeriod =
              !isLoggedPeriod && isDateInPredictedPeriod(dStr, todayMetrics);
            const fertileInfo = getFertileStatusForDate(userData, dStr, todayMetrics);
            const isOvulationWindow =
              !isLoggedPeriod && !isPredPeriod && fertileInfo.isFertileWindow;
            const isPeakOvulation =
              isOvulationWindow && fertileInfo.isPeakOvulation;
            const isSelected = dStr === selectedDateStr;
            const isToday = dStr === todayStr;

            const dayLog = userData.dailyLogs?.[dStr];
            const hasPill = pillDatesSet.has(dStr);
            const moodObj =
              dayLog && dayLog.mood
                ? MOOD_CATEGORIES.find((m) => m.id === dayLog.mood)
                : null;
            const dayTasks = tasksByDate[dStr] || [];
            const dayAppts = appointmentsByDate[dStr] || [];

            let cellStyle =
              'bg-white hover:bg-lavender-50/60 text-slate-800 border border-slate-200/80';
            let markerBadge: { text: string; className: string } | null = null;

            if (isLoggedPeriod) {
              cellStyle = 'bg-rose-500 text-white font-bold border-2 border-rose-600 shadow-2xs';
              markerBadge = {
                text: '🩸 Logged Period',
                className: 'bg-white/20 text-white border border-white/30',
              };
            } else if (isPredPeriod) {
              cellStyle =
                'bg-rose-100/95 text-rose-950 border-2 border-dashed border-rose-500 font-semibold';
              markerBadge = {
                text: dayMetrics.cycleDay === 1 ? '🩸 Day 1 Pred.' : '🩸 Pred. Period',
                className: 'bg-rose-500 text-white',
              };
            } else if (isPeakOvulation) {
              cellStyle =
                'bg-sage-600 text-white font-bold border-2 border-sage-800 shadow-2xs';
              markerBadge = {
                text: '⭐ Peak Ovulation',
                className: 'bg-white/20 text-white border border-white/30',
              };
            } else if (isOvulationWindow) {
              cellStyle =
                'bg-sage-100/90 text-sage-900 border-2 border-sage-500/80 font-semibold';
              markerBadge = {
                text: '🌸 Fertile Window',
                className: 'bg-sage-200 text-sage-900',
              };
            } else if (showStageLabels) {
              if (dayMetrics.stageKey === 'FOLLICULAR') {
                markerBadge = {
                  text: '🌱 Follicular',
                  className: 'bg-lavender-50 text-lavender-700 border border-lavender-200/70',
                };
              } else if (dayMetrics.stageKey === 'LUTEAL') {
                markerBadge = {
                  text: '🌙 Luteal',
                  className: 'bg-peach-50 text-peach-800 border border-peach-200/70',
                };
              }
            }

            return (
              <button
                key={dStr}
                type="button"
                onClick={() => onSelectDate(dStr)}
                className={`${
                  compact ? 'h-16 p-1.5 rounded-xl' : 'h-24 sm:h-28 p-2 rounded-2xl'
                } flex flex-col justify-between text-left transition-all cursor-pointer tabular-nums ${cellStyle} ${
                  isSelected ? 'ring-2 ring-slate-900 ring-offset-1 scale-[1.01]' : ''
                }`}
              >
                {/* Top Row: Day Number + Cycle Day */}
                <div className="w-full flex items-center justify-between gap-1">
                  <span
                    className={`text-xs sm:text-sm font-extrabold leading-none ${
                      isToday && !isLoggedPeriod && !isPeakOvulation
                        ? 'px-1.5 py-0.5 rounded-md bg-lavender-700 text-white'
                        : ''
                    }`}
                  >
                    {day}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold ${
                      isLoggedPeriod || isPeakOvulation ? 'text-white/85' : 'text-slate-400'
                    }`}
                  >
                    D{dayMetrics.cycleDay}
                  </span>
                </div>

                {/* Middle Row: Color-Coded Window Marker */}
                {markerBadge && (
                  <div className="w-full my-0.5">
                    <span
                      className={`block truncate text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded-md text-center ${markerBadge.className}`}
                    >
                      {compact ? markerBadge.text.split(' ')[0] : markerBadge.text}
                    </span>
                  </div>
                )}

                {/* Bottom Row: Mood, Pill, Water, Exam & Clinic Icons */}
                <div className="w-full flex items-center justify-between gap-1 text-[10px] leading-none">
                  <div className="flex items-center gap-0.5 truncate">
                    {moodObj && <span title={`Mood: ${moodObj.id}`}>{moodObj.emoji}</span>}
                    {hasPill && <span title="Emergency Pill Logged">💊</span>}
                    {dayTasks.length > 0 && (
                      <span title={`Academic Task: ${dayTasks.join(', ')}`}>📚</span>
                    )}
                    {dayAppts.length > 0 && (
                      <span title={`Sidratu Appointment: ${dayAppts.join(', ')}`}>✨</span>
                    )}
                  </div>
                  {!compact && dayLog?.waterGlasses ? (
                    <span
                      className={`text-[9px] font-mono font-bold ${
                        isLoggedPeriod || isPeakOvulation ? 'text-white/90' : 'text-sage-700'
                      }`}
                    >
                      {dayLog.waterGlasses}💧
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Compute 3 consecutive months for 3-Month Horizon mode
  const threeMonthsList = [0, 1, 2].map((offset) => {
    const d = new Date(calendarYear, calendarMonth + offset, 1);
    return { month: d.getMonth(), year: d.getFullYear() };
  });

  return (
    <div className="fixed inset-0 z-50 bg-cream/98 backdrop-blur-md flex flex-col overflow-hidden">
      {/* Top Sticky Full-Screen Header */}
      <header className="bg-white border-b border-lavender-200 px-4 sm:px-6 py-3.5 shadow-2xs shrink-0">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-lavender-700 to-rose-500 text-white flex items-center justify-center shadow-xs">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-lavender-700 block">
                Long-Term Hormonal &amp; Academic Planner
              </span>
              <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                Full-Screen Cycle &amp; Ovulation Calendar
              </h2>
            </div>
          </div>

          {/* Month Navigation Controls */}
          <div className="flex items-center gap-2 bg-cream px-2.5 py-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => onChangeMonth(-1)}
              className="w-8 h-8 rounded-xl bg-white hover:bg-lavender-50 border border-slate-200 flex items-center justify-center text-slate-700 font-bold"
              title="Previous Month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-display font-extrabold text-sm sm:text-base text-slate-900 min-w-[145px] text-center">
              {MONTH_NAMES[calendarMonth]} {calendarYear}
            </span>
            <button
              type="button"
              onClick={() => onChangeMonth(1)}
              className="w-8 h-8 rounded-xl bg-white hover:bg-lavender-50 border border-slate-200 flex items-center justify-center text-slate-700 font-bold"
              title="Next Month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onJumpToToday}
              className="px-3 py-1.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-800 text-xs font-extrabold transition-all"
            >
              Today
            </button>
          </div>

          {/* View Mode & Minimize Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-cream p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('single')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'single'
                    ? 'bg-lavender-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>1-Month Detail</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('threeMonth')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  viewMode === 'threeMonth'
                    ? 'bg-lavender-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>3-Month Horizon</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowStageLabels((prev) => !prev)}
              className={`hidden md:inline-flex px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                showStageLabels
                  ? 'bg-lavender-50 text-lavender-900 border-lavender-200'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {showStageLabels ? 'Stage Labels: ON' : 'Stage Labels: OFF'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Exit Full Screen</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Full-Screen Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-7xl mx-auto space-y-5">
          {/* Color-Coded Legend & Next 6 Cycles Quick-Jump Strip */}
          <div className="bg-white rounded-2xl border border-lavender-200 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-rose-500 inline-block" />
                  <span>🩸 Logged Period</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-rose-100 border-2 border-dashed border-rose-500 inline-block" />
                  <span>🩸 Predicted Period Window</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-sage-600 inline-block" />
                  <span>⭐ Peak Ovulation Date</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded-md bg-sage-100 border-2 border-sage-500 inline-block" />
                  <span>🌸 Fertile Ovulation Window</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span>📚 Exam / Study</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span>✨ Sidratu Session</span>
                </span>
              </div>

              <span className="text-[11px] font-bold text-slate-500 font-mono">
                Based on {todayMetrics.avgCycleLength}d avg cycle · {todayMetrics.avgPeriodDuration}d avg bleed
              </span>
            </div>

            {/* Upcoming 6 Predicted Cycles Horizontal Forecast Strip */}
            {upcomingCycleWindows.length > 0 && (
              <div className="pt-2.5 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-lavender-700 mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Upcoming 6-Month Predicted Period &amp; Ovulation Windows (Tap to Jump)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {upcomingCycleWindows.map((win) => (
                    <button
                      key={win.periodStart}
                      type="button"
                      onClick={() => {
                        onJumpToMonthYear(win.month, win.year);
                        onSelectDate(win.periodStart);
                      }}
                      className="rounded-xl p-2.5 bg-cream hover:bg-lavender-50 border border-slate-200 hover:border-lavender-300 text-left transition-all cursor-pointer"
                    >
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                        Cycle +{win.cycleNumber}
                      </span>
                      <div className="text-xs font-extrabold text-rose-700 mt-0.5 tabular-nums">
                        🩸 {formatShortMonthDay(win.periodStart)} – {formatShortMonthDay(win.periodEnd)}
                      </div>
                      <div className="text-[10px] font-bold text-sage-800 mt-0.5 tabular-nums">
                        🌸 Ov: {formatShortMonthDay(win.ovulationStart)}–{formatShortMonthDay(win.ovulationEnd)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Calendar Grid(s) */}
          {viewMode === 'single' ? (
            renderMonthGrid(calendarMonth, calendarYear, false)
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {threeMonthsList.map((m) => renderMonthGrid(m.month, m.year, true))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Selected Date Quick-Action Footer */}
      <footer className="bg-white border-t border-lavender-200 px-4 sm:px-6 py-3 shadow-sm shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-3 py-1 rounded-xl bg-lavender-100 text-lavender-900 font-display font-extrabold text-xs sm:text-sm tabular-nums">
              Selected: {formatHumanDate(selectedDateStr)}
            </span>
            <span className="text-xs font-bold text-slate-700">
              {PHASE_ADVISOR_DATA[selectedDayMetrics.stageKey].emoji}{' '}
              {PHASE_ADVISOR_DATA[selectedDayMetrics.stageKey].shortName} (Cycle Day{' '}
              {selectedDayMetrics.cycleDay})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onSetAsPeriodStart(selectedDateStr)}
              className="px-3.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-xs transition-all cursor-pointer"
            >
              🩸 Set as Period Start Date
            </button>
            <button
              type="button"
              onClick={() => onSetAsPeriodEnd(selectedDateStr)}
              className="px-3.5 py-2 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-800 font-extrabold text-xs transition-all cursor-pointer"
            >
              ✨ Set as Period End Date
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs transition-all cursor-pointer"
            >
              Done &amp; View Day Details →
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
