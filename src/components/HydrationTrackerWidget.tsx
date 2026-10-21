import React, { useMemo } from 'react';
import { Droplets, Plus, Minus, Sparkles, CheckCircle2, Flame } from 'lucide-react';
import { StageKey, UserData } from '../types';
import { addDaysISO, formatHumanDate, formatShortMonthDay, parseDateISO } from '../utils/cycleEngine';

interface HydrationTrackerWidgetProps {
  userData: UserData;
  selectedDateStr: string;
  currentStageKey: StageKey;
  onLogWaterForDate: (dateStr: string, nextGlasses: number) => void;
  onSelectDate: (dateStr: string) => void;
}

const DAILY_GOAL_GLASSES = 8; // 8 glasses (2.0L) per day
const WEEKLY_GOAL_GLASSES = DAILY_GOAL_GLASSES * 7; // 56 glasses (14.0L) per week
const ML_PER_GLASS = 250;

const STAGE_HYDRATION_TIPS: Record<StageKey, string> = {
  MENSTRUATION:
    '🩸 Menstruation Hydration Tip: Warm water & herbal teas help relax uterine muscles, ease cramps, and replenish fluids.',
  FOLLICULAR:
    '🌱 Follicular Hydration Tip: Consistent hydration supports rising estrogen, plump skin barrier recovery, and sharp lecture focus.',
  OVULATION:
    '🌸 Ovulation Hydration Tip: Body temperature rises slightly around ovulation — add an extra glass of water after campus walks or workouts!',
  LUTEAL:
    '🌙 Luteal Hydration Tip: Drinking 8+ glasses flushes excess sodium, reduces pre-period bloating, and prevents luteal headaches.',
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const HydrationTrackerWidget: React.FC<HydrationTrackerWidgetProps> = ({
  userData,
  selectedDateStr,
  currentStageKey,
  onLogWaterForDate,
  onSelectDate,
}) => {
  const currentDayGlasses = userData.dailyLogs?.[selectedDateStr]?.waterGlasses || 0;

  // Build 7-day window ending on selectedDateStr
  const weeklyStats = useMemo(() => {
    const days: Array<{
      dateStr: string;
      dayLabel: string;
      shortDate: string;
      glasses: number;
      pctOfDaily: number;
      goalMet: boolean;
    }> = [];

    let totalWeeklyGlasses = 0;
    let daysMetGoal = 0;

    for (let offset = -6; offset <= 0; offset++) {
      const dStr = addDaysISO(selectedDateStr, offset);
      const dObj = parseDateISO(dStr) || new Date();
      const glasses = userData.dailyLogs?.[dStr]?.waterGlasses || 0;
      const pctOfDaily = Math.min(100, Math.round((glasses / DAILY_GOAL_GLASSES) * 100));
      const goalMet = glasses >= DAILY_GOAL_GLASSES;

      totalWeeklyGlasses += glasses;
      if (goalMet) daysMetGoal += 1;

      days.push({
        dateStr: dStr,
        dayLabel: offset === 0 ? 'Selected' : DAY_NAMES_SHORT[dObj.getDay()],
        shortDate: formatShortMonthDay(dStr),
        glasses,
        pctOfDaily,
        goalMet,
      });
    }

    const weeklyProgressPct = Math.min(
      100,
      Math.round((totalWeeklyGlasses / WEEKLY_GOAL_GLASSES) * 100)
    );
    const totalLiters = ((totalWeeklyGlasses * ML_PER_GLASS) / 1000).toFixed(1);

    return {
      days,
      totalWeeklyGlasses,
      weeklyProgressPct,
      totalLiters,
      daysMetGoal,
    };
  }, [userData.dailyLogs, selectedDateStr]);

  const dailyProgressPct = Math.min(
    100,
    Math.round((currentDayGlasses / DAILY_GOAL_GLASSES) * 100)
  );

  const handleQuickAdd = (delta: number) => {
    const next = Math.max(0, Math.min(16, currentDayGlasses + delta));
    onLogWaterForDate(selectedDateStr, next);
  };

  const handleSetExactGlasses = (targetCount: number) => {
    // If tapping the currently filled glass, toggle down by 1; otherwise set to targetCount
    const next = currentDayGlasses === targetCount ? targetCount - 1 : targetCount;
    onLogWaterForDate(selectedDateStr, Math.max(0, next));
  };

  return (
    <section className="bg-white rounded-3xl shadow-xs border-2 border-sage-200 p-5 sm:p-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sage-800 mb-1">
            <Droplets className="w-4 h-4 text-sage-600" />
            <span>Campus Hydration & Skin Glow Tracker</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">
            Hydration Tracker & Weekly Goal
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            One-tap water logging for{' '}
            <span className="font-bold text-slate-800">{formatHumanDate(selectedDateStr)}</span>{' '}
            with your 7-day hydration goal progress.
          </p>
        </div>

        {/* One-Tap Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleQuickAdd(-1)}
            disabled={currentDayGlasses <= 0}
            className="w-10 h-10 rounded-2xl bg-cream hover:bg-slate-100 disabled:opacity-40 text-slate-700 border border-slate-200 flex items-center justify-center font-bold transition-all active:scale-95"
            title="Remove 1 glass"
          >
            <Minus className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => handleQuickAdd(1)}
            className="px-4 py-2.5 rounded-2xl bg-sage-600 hover:bg-sage-800 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>💧 +1 Glass (250ml)</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickAdd(2)}
            className="px-3.5 py-2.5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            title="Log a 500ml campus water bottle (2 glasses)"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>🍼 +1 Bottle (500ml)</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Weekly Goal Progress Card + Daily One-Tap Interactive Glasses */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left 7 Cols: Weekly Goal Progress Bar & 7-Day Mini Breakdown */}
        <div className="lg:col-span-7 rounded-2xl bg-gradient-to-br from-sage-50/90 via-cream to-lavender-50/60 border border-sage-200 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-sage-800 block">
                  7-Day Weekly Hydration Goal
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 font-mono tabular-nums">
                    {weeklyStats.totalWeeklyGlasses} / {WEEKLY_GOAL_GLASSES}
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    glasses ({weeklyStats.totalLiters}L / 14.0L)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-white border border-sage-200 text-xs font-extrabold text-sage-800 font-mono tabular-nums shadow-2xs">
                  {weeklyStats.weeklyProgressPct}% of Weekly Goal
                </span>
              </div>
            </div>

            {/* Weekly Goal Progress Bar */}
            <div className="w-full h-4 bg-white rounded-full border border-sage-200 overflow-hidden p-0.5 shadow-inner mb-4">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sage-600 via-teal-500 to-lavender-700 transition-all duration-500"
                style={{ width: `${Math.max(weeklyStats.weeklyProgressPct, 3)}%` }}
                role="progressbar"
                aria-valuenow={weeklyStats.totalWeeklyGlasses}
                aria-valuemin={0}
                aria-valuemax={WEEKLY_GOAL_GLASSES}
              />
            </div>

            {/* 7-Day Daily Bars Strip */}
            <div className="grid grid-cols-7 gap-2 pt-1">
              {weeklyStats.days.map((d) => {
                const isSelected = d.dateStr === selectedDateStr;
                return (
                  <button
                    key={d.dateStr}
                    type="button"
                    onClick={() => onSelectDate(d.dateStr)}
                    className={`rounded-xl p-2 border flex flex-col items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-white border-2 border-slate-900 shadow-xs'
                        : 'bg-white/70 hover:bg-white border-slate-200/80'
                    }`}
                    title={`${d.shortDate}: ${d.glasses}/${DAILY_GOAL_GLASSES} glasses`}
                  >
                    <span className="text-[10px] font-extrabold uppercase text-slate-500">
                      {d.dayLabel}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 mb-1.5">
                      {d.shortDate}
                    </span>

                    <div className="w-3.5 h-14 bg-sage-100/80 rounded-full overflow-hidden flex items-end p-0.5">
                      <div
                        className={`w-full rounded-full transition-all duration-300 ${
                          d.goalMet ? 'bg-sage-600' : 'bg-lavender-500'
                        }`}
                        style={{ height: `${Math.max(d.pctOfDaily, d.glasses > 0 ? 15 : 0)}%` }}
                      />
                    </div>

                    <span className="mt-1.5 text-[11px] font-mono font-extrabold text-slate-800 tabular-nums">
                      {d.glasses}💧
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-sage-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-600 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-peach-600" />
              <span>
                Daily Target Hit:{' '}
                <strong className="text-slate-900">
                  {weeklyStats.daysMetGoal} of 7 days
                </strong>{' '}
                (8+ glasses/day)
              </span>
            </span>
            <span className="text-[11px] font-bold text-sage-800">
              Tap any day bar above to edit its water log
            </span>
          </div>
        </div>

        {/* Right 5 Cols: Selected Day One-Tap Glass Grid */}
        <div className="lg:col-span-5 rounded-2xl bg-cream border border-slate-200/80 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-700 block">
                  Daily Intake ({formatShortMonthDay(selectedDateStr)})
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-display font-extrabold text-2xl text-slate-900 font-mono tabular-nums">
                    {currentDayGlasses} / {DAILY_GOAL_GLASSES}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    glasses ({((currentDayGlasses * ML_PER_GLASS) / 1000).toFixed(2)}L)
                  </span>
                </div>
              </div>

              {currentDayGlasses >= DAILY_GOAL_GLASSES ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-sage-100 text-sage-800 text-xs font-extrabold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Goal Met!
                </span>
              ) : (
                <span className="text-xs font-bold font-mono text-slate-600">
                  {dailyProgressPct}% today
                </span>
              )}
            </div>

            {/* Daily Progress Bar */}
            <div className="w-full h-2.5 bg-slate-200/80 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-sage-600 rounded-full transition-all duration-300"
                style={{ width: `${dailyProgressPct}%` }}
              />
            </div>

            {/* Interactive 8-Glass Tap Grid */}
            <p className="text-[11px] font-bold text-slate-500 mb-2">
              Tap any cup below to set your glasses instantly:
            </p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {Array.from({ length: DAILY_GOAL_GLASSES }).map((_, idx) => {
                const cupNum = idx + 1;
                const isFilled = currentDayGlasses >= cupNum;
                return (
                  <button
                    key={cupNum}
                    type="button"
                    onClick={() => handleSetExactGlasses(cupNum)}
                    className={`py-2.5 px-2 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer active:scale-95 ${
                      isFilled
                        ? 'bg-sage-600 text-white border-sage-700 shadow-2xs font-extrabold'
                        : 'bg-white hover:bg-sage-50 text-slate-600 border-slate-200 font-semibold'
                    }`}
                  >
                    <span className="text-base">{isFilled ? '💧' : '🥛'}</span>
                    <span className="text-[10px] font-mono tabular-nums">#{cupNum}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cycle Stage Hydration Insight */}
          <div className="rounded-xl bg-white border border-lavender-100 p-3 text-xs text-slate-700 leading-relaxed flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-lavender-700 shrink-0 mt-0.5" />
            <span>{STAGE_HYDRATION_TIPS[currentStageKey]}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
