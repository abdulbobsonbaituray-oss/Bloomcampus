import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Stethoscope,
  AlertTriangle,
  CalendarCheck2,
  FileText,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  ArrowDownRight,
  ArrowUpRight,
  Minus,
} from 'lucide-react';
import { UserData } from '../types';
import { SYMPTOM_ITEMS } from '../constants';
import {
  addDaysISO,
  analyzeSixMonthCycleInsights,
  formatShortMonthDay,
  getSortedPeriods,
  parseDateISO,
} from '../utils/cycleEngine';

interface CycleInsightsPanelProps {
  userData: UserData;
  todayStr: string;
  onOpenClinicSummary?: () => void;
  onJumpToPeriodEditor?: () => void;
  onOpenTrendsChart?: () => void;
}

export const CycleInsightsPanel: React.FC<CycleInsightsPanelProps> = ({
  userData,
  todayStr,
  onOpenClinicSummary,
  onJumpToPeriodEditor,
  onOpenTrendsChart,
}) => {
  const [showMeasuredCycles, setShowMeasuredCycles] = useState(false);

  const insights = useMemo(
    () => analyzeSixMonthCycleInsights(userData, todayStr),
    [userData, todayStr]
  );

  // Build list of available cycle months (YYYY-MM) from logged periods, dailyLogs, and last 6 calendar months
  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>();
    const todayDate = parseDateISO(todayStr);

    // Always include last 6 calendar months ending in today's month
    for (let offset = 0; offset < 6; offset++) {
      const d = new Date(todayDate.getFullYear(), todayDate.getMonth() - offset, 1, 12, 0, 0);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(ym);
    }

    // Include any historical months from dailyLogs or periods
    Object.keys(userData.dailyLogs || {}).forEach((dStr) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
        monthSet.add(dStr.slice(0, 7));
      }
    });
    const sortedPeriods = getSortedPeriods(userData.periods);
    sortedPeriods.forEach((p) => {
      if (p.startDate && p.startDate.length >= 7) {
        monthSet.add(p.startDate.slice(0, 7));
      }
    });

    const periodStartByMonth: Record<string, string> = {};
    sortedPeriods.forEach((p) => {
      const ym = p.startDate.slice(0, 7);
      if (!periodStartByMonth[ym]) {
        periodStartByMonth[ym] = p.startDate;
      }
    });

    // Count days with physical symptoms per month
    const symptomDaysByMonth: Record<string, number> = {};
    Object.entries(userData.dailyLogs || {}).forEach(([dStr, entry]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr) || !entry) return;
      if (Array.isArray(entry.symptoms) && entry.symptoms.length > 0) {
        const ym = dStr.slice(0, 7);
        symptomDaysByMonth[ym] = (symptomDaysByMonth[ym] || 0) + 1;
      }
    });

    // Sort descending (newest first)
    const sortedYms = Array.from(monthSet).sort((a, b) => b.localeCompare(a));

    return sortedYms.map((ym) => {
      const [yStr, mStr] = ym.split('-');
      const d = new Date(Number(yStr), Number(mStr) - 1, 1, 12, 0, 0);
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const shortMonth = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      const symptomDays = symptomDaysByMonth[ym] || 0;
      const periodStart = periodStartByMonth[ym] || null;
      const periodNote = periodStart ? ` · Period ${formatShortMonthDay(periodStart)}` : '';
      const logNote =
        symptomDays > 0
          ? ` (${symptomDays} symptom day${symptomDays === 1 ? '' : 's'})`
          : ' (No symptom logs)';
      return {
        ym,
        monthName,
        shortMonth,
        symptomDays,
        periodStart,
        optionLabel: `${monthName}${periodNote}${logNote}`,
      };
    });
  }, [userData.dailyLogs, userData.periods, todayStr]);

  // Smart defaults: pick two distinct months (preferring two months that actually have symptom logs)
  const defaultMonths = useMemo(() => {
    const withSymptoms = monthOptions.filter((m) => m.symptomDays > 0);
    if (withSymptoms.length >= 2) {
      return { a: withSymptoms[1].ym, b: withSymptoms[0].ym };
    }
    if (monthOptions.length >= 2) {
      return { a: monthOptions[1].ym, b: monthOptions[0].ym };
    }
    const fallbackToday = todayStr.slice(0, 7);
    const prevMonth = addDaysISO(`${fallbackToday}-01`, -5).slice(0, 7);
    return { a: prevMonth, b: fallbackToday };
  }, [monthOptions, todayStr]);

  const [monthA, setMonthA] = useState<string>('');
  const [monthB, setMonthB] = useState<string>('');

  const activeMonthA =
    monthA && monthOptions.some((m) => m.ym === monthA) ? monthA : defaultMonths.a;
  const activeMonthB =
    monthB && monthOptions.some((m) => m.ym === monthB) ? monthB : defaultMonths.b;

  const monthAMeta = useMemo(
    () => monthOptions.find((m) => m.ym === activeMonthA) || monthOptions[1] || monthOptions[0],
    [monthOptions, activeMonthA]
  );
  const monthBMeta = useMemo(
    () => monthOptions.find((m) => m.ym === activeMonthB) || monthOptions[0],
    [monthOptions, activeMonthB]
  );

  // Aggregate physical symptom intensity (1-3) for Month A vs Month B
  const symptomComparison = useMemo(() => {
    const emojiLookup: Record<string, string> = {};
    SYMPTOM_ITEMS.forEach((s) => {
      emojiLookup[s.id] = s.emoji;
    });

    const intensityText: Record<number, string> = {
      1: 'Mild',
      2: 'Moderate',
      3: 'Strong',
    };

    const collectStats = (targetYm: string) => {
      const map: Record<string, { sum: number; count: number; max: number }> = {};
      Object.entries(userData.dailyLogs || {}).forEach(([dStr, entry]) => {
        if (!dStr.startsWith(targetYm) || !entry || !Array.isArray(entry.symptoms)) return;
        entry.symptoms.forEach((symId) => {
          const rawLvl = entry.intensity?.[symId];
          const lvl = typeof rawLvl === 'number' && rawLvl >= 1 && rawLvl <= 3 ? rawLvl : 1;
          if (!map[symId]) {
            map[symId] = { sum: 0, count: 0, max: 0 };
          }
          map[symId].sum += lvl;
          map[symId].count += 1;
          if (lvl > map[symId].max) map[symId].max = lvl;
        });
      });
      return map;
    };

    const statsA = collectStats(activeMonthA);
    const statsB = collectStats(activeMonthB);
    const allSymptoms = Array.from(new Set([...Object.keys(statsA), ...Object.keys(statsB)]));

    const rows = allSymptoms.map((symId) => {
      const a = statsA[symId] || null;
      const b = statsB[symId] || null;
      const avgA = a ? Number((a.sum / a.count).toFixed(1)) : null;
      const avgB = b ? Number((b.sum / b.count).toFixed(1)) : null;
      const valA = avgA ?? 0;
      const valB = avgB ?? 0;
      const diff = Number((valB - valA).toFixed(1));
      const roundedA = avgA !== null ? Math.min(3, Math.max(1, Math.round(avgA))) : null;
      const roundedB = avgB !== null ? Math.min(3, Math.max(1, Math.round(avgB))) : null;

      return {
        symptom: symId,
        emoji: emojiLookup[symId] || '•',
        daysA: a?.count || 0,
        daysB: b?.count || 0,
        avgA,
        avgB,
        labelA: roundedA !== null ? intensityText[roundedA] : null,
        labelB: roundedB !== null ? intensityText[roundedB] : null,
        diff,
      };
    });

    // Sort by largest absolute difference first, then alphabetically
    rows.sort((x, y) => {
      const absDiff = Math.abs(y.diff) - Math.abs(x.diff);
      if (absDiff !== 0) return absDiff;
      return x.symptom.localeCompare(y.symptom);
    });

    const improvedCount = rows.filter((r) => r.diff < 0).length;
    const worsenedCount = rows.filter((r) => r.diff > 0).length;
    const unchangedCount = rows.filter((r) => r.diff === 0).length;

    return { rows, improvedCount, worsenedCount, unchangedCount };
  }, [userData.dailyLogs, activeMonthA, activeMonthB]);

  const toneConfig = useMemo(() => {
    switch (insights.status) {
      case 'consult_doctor':
        return {
          cardBorder: 'border-rose-300',
          bannerBg: 'bg-rose-50 border-rose-200',
          titleColor: 'text-rose-950',
          verdictText: 'text-rose-800',
          iconWrap: 'bg-rose-100 text-rose-700',
          Icon: Stethoscope,
        };
      case 'mild_variation':
        return {
          cardBorder: 'border-amber-300',
          bannerBg: 'bg-amber-50/90 border-amber-200',
          titleColor: 'text-amber-950',
          verdictText: 'text-amber-800',
          iconWrap: 'bg-amber-100 text-amber-800',
          Icon: AlertTriangle,
        };
      case 'consistent':
        return {
          cardBorder: 'border-emerald-200',
          bannerBg: 'bg-emerald-50/80 border-emerald-200',
          titleColor: 'text-emerald-950',
          verdictText: 'text-emerald-800',
          iconWrap: 'bg-emerald-100 text-emerald-700',
          Icon: CheckCircle2,
        };
      default:
        return {
          cardBorder: 'border-lavender-200',
          bannerBg: 'bg-lavender-50/70 border-lavender-200',
          titleColor: 'text-slate-900',
          verdictText: 'text-lavender-800',
          iconWrap: 'bg-lavender-100 text-lavender-800',
          Icon: CalendarCheck2,
        };
    }
  }, [insights.status]);

  const StatusIcon = toneConfig.Icon;

  return (
    <section
      id="cycle-insights-panel"
      aria-labelledby="cycle-insights-heading"
      className={`bg-white rounded-3xl shadow-xs border ${toneConfig.cardBorder} p-5 sm:p-6 space-y-5`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-xs font-semibold text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
            <span>Last 6 Months Analysis</span>
            <span aria-hidden="true">·</span>
            <span>
              {formatShortMonthDay(insights.windowStartISO)} –{' '}
              {formatShortMonthDay(insights.windowEndISO)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {insights.loggedCyclesCount} logged period
              {insights.loggedCyclesCount === 1 ? '' : 's'}
              {insights.autoCyclesCount > 0
                ? `, ${insights.autoCyclesCount} auto-updated`
                : ''}
            </span>
          </div>
          <h2
            id="cycle-insights-heading"
            className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight"
          >
            Cycle Insights
          </h2>
        </div>

        <div className={`text-xs font-extrabold ${toneConfig.verdictText} flex items-center gap-1.5 shrink-0`}>
          <StatusIcon className="w-4 h-4 shrink-0" />
          <span>{insights.statusLabel}</span>
        </div>
      </div>

      {/* Main Verdict & Explanation */}
      <div className={`rounded-2xl border ${toneConfig.bannerBg} p-4 sm:p-5 space-y-3`}>
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl ${toneConfig.iconWrap} flex items-center justify-center shrink-0`}
          >
            <StatusIcon className="w-5 h-5" />
          </div>
          <div className="space-y-1.5 min-w-0">
            <h3
              className={`font-display font-extrabold text-base sm:text-lg ${toneConfig.titleColor}`}
            >
              {insights.headline}
            </h3>
            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
              {insights.summaryText}
            </p>
          </div>
        </div>

        {/* Specific Reasons (when flagged or mild variation) */}
        {insights.reasons.length > 0 && (
          <div className="pt-2 border-t border-black/10 space-y-1.5">
            <div className="text-xs font-extrabold text-slate-800">
              What we noticed in your 6-month dates:
            </div>
            <ul className="space-y-1 text-xs text-slate-700 list-disc pl-5 tabular-nums">
              {insights.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Doctor Consultation Guidance */}
        <div className="pt-2 border-t border-black/10">
          <div className="text-xs font-extrabold text-slate-900">
            {insights.shouldConsultDoctor
              ? 'Should You See a Doctor? Yes — Recommended'
              : 'Doctor Check-In Guidance'}
          </div>
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed mt-0.5">
            {insights.doctorGuidance}
          </p>
        </div>
      </div>

      {/* 4 Key 6-Month Measurements */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-cream border border-slate-200 p-3.5">
          <span className="text-[11px] font-bold text-slate-500 block">
            6-Month Cycle Range
          </span>
          <span className="font-display font-extrabold text-base sm:text-lg text-slate-900 mt-0.5 block tabular-nums">
            {insights.minCycleLength === insights.maxCycleLength
              ? `${insights.avgCycleLength} days`
              : `${insights.minCycleLength}–${insights.maxCycleLength} days`}
          </span>
          <span className="text-[11px] text-slate-600 font-medium block mt-0.5 tabular-nums">
            Healthy guide: 21–35 days
          </span>
        </div>

        <div className="rounded-2xl bg-cream border border-slate-200 p-3.5">
          <span className="text-[11px] font-bold text-slate-500 block">
            Month-to-Month Shift
          </span>
          <span className="font-display font-extrabold text-base sm:text-lg text-slate-900 mt-0.5 block tabular-nums">
            {insights.confirmedIntervalsCount >= 2
              ? `±${insights.cycleVariationDays} days`
              : insights.confirmedIntervalsCount === 1
              ? '1 cycle measured'
              : 'Waiting for 2+ logs'}
          </span>
          <span className="text-[11px] text-slate-600 font-medium block mt-0.5">
            Steady range: 7 days or less
          </span>
        </div>

        <div className="rounded-2xl bg-cream border border-slate-200 p-3.5">
          <span className="text-[11px] font-bold text-slate-500 block">
            Bleeding Length
          </span>
          <span className="font-display font-extrabold text-base sm:text-lg text-slate-900 mt-0.5 block tabular-nums">
            {insights.minBleedDays === insights.maxBleedDays
              ? `${insights.avgBleedDays} days`
              : `${insights.minBleedDays}–${insights.maxBleedDays} days`}
          </span>
          <span className="text-[11px] text-slate-600 font-medium block mt-0.5">
            Healthy guide: 2–7 days
          </span>
        </div>

        <div className="rounded-2xl bg-cream border border-slate-200 p-3.5">
          <span className="text-[11px] font-bold text-slate-500 block">
            Doctor Check-In
          </span>
          <span
            className={`font-display font-extrabold text-base sm:text-lg mt-0.5 block ${
              insights.shouldConsultDoctor ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {insights.shouldConsultDoctor ? 'Recommended' : 'Not Needed Now'}
          </span>
          <span className="text-[11px] text-slate-600 font-medium block mt-0.5">
            {insights.shouldConsultDoctor
              ? 'Bring summary to clinic'
              : 'Keep logging monthly'}
          </span>
        </div>
      </div>

      {/* Cycle-by-Cycle History Breakdown (Last 6 Months) */}
      {insights.intervals.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-cream/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowMeasuredCycles((prev) => !prev)}
            aria-expanded={showMeasuredCycles}
            className="w-full min-h-[44px] px-4 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-lavender-50/70 transition-colors cursor-pointer"
          >
            <span className="text-xs font-extrabold text-slate-800 tabular-nums">
              Measured Cycles in the Last 6 Months ({insights.intervals.length})
            </span>
            {showMeasuredCycles ? (
              <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
            )}
          </button>

          {showMeasuredCycles && (
            <div className="px-4 pb-4 pt-2 border-t border-slate-200/80 bg-white">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {insights.intervals.map((item) => (
                  <div
                    key={`${item.fromStartDate}-${item.toStartDate}`}
                    className="rounded-2xl border border-slate-200 bg-cream/60 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs tabular-nums"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {formatShortMonthDay(item.fromStartDate)} →{' '}
                        {formatShortMonthDay(item.toStartDate)}
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {item.bleedDays}d bleed
                        {item.isAutoProjected ? ' · Auto-updated' : ' · Confirmed'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className={`font-display font-extrabold text-sm ${
                          item.isWithinNormalLength ? 'text-lavender-900' : 'text-rose-700'
                        }`}
                      >
                        {item.cycleLengthDays} days
                      </div>
                      <div
                        className={`text-[10px] font-bold ${
                          item.isWithinNormalLength ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {item.isWithinNormalLength ? 'Normal' : 'Outside 21–35d'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Side-by-Side Symptom Intensity Month Comparison */}
      <div className="rounded-2xl border border-lavender-200 bg-cream/60 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
              📊 Compare Symptom Intensity Between Two Months
            </h3>
            <p className="text-xs text-slate-600">
              Pick two cycle months below to see side-by-side average intensity levels (1 Mild – 3 Strong) and what improved or increased.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const prevA = activeMonthA;
              const prevB = activeMonthB;
              setMonthA(prevB);
              setMonthB(prevA);
            }}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white hover:bg-lavender-50 border border-lavender-200 text-lavender-900 text-xs font-extrabold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
            title="Swap baseline month and comparison month"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Swap Months</span>
          </button>
        </div>

        {/* Month A & Month B Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label
              htmlFor="compare-month-a"
              className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600"
            >
              Earlier / Baseline Month (Month A)
            </label>
            <select
              id="compare-month-a"
              value={activeMonthA}
              onChange={(e) => setMonthA(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-lavender-500"
            >
              {monthOptions.map((opt) => (
                <option key={opt.ym} value={opt.ym}>
                  {opt.optionLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="compare-month-b"
              className="block text-[11px] font-extrabold uppercase tracking-wider text-lavender-800"
            >
              Comparison Month (Month B)
            </label>
            <select
              id="compare-month-b"
              value={activeMonthB}
              onChange={(e) => setMonthB(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-lavender-300 bg-white text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-lavender-500"
            >
              {monthOptions.map((opt) => (
                <option key={opt.ym} value={opt.ym}>
                  {opt.optionLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {activeMonthA === activeMonthB && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold">
            Select two different months above to compare changes over time.
          </div>
        )}

        {/* Quick Summary Row when symptoms exist */}
        {symptomComparison.rows.length > 0 && activeMonthA !== activeMonthB && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 tabular-nums">
              ↓ {symptomComparison.improvedCount} Lighter / Cleared
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 tabular-nums">
              ↑ {symptomComparison.worsenedCount} Stronger / New
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 tabular-nums">
              • {symptomComparison.unchangedCount} Same Intensity
            </span>
          </div>
        )}

        {/* Side-by-Side Comparison Table */}
        {symptomComparison.rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-4 text-xs text-slate-600 text-center space-y-1">
            <div className="font-bold text-slate-800">
              No physical symptoms logged in {monthAMeta?.shortMonth || activeMonthA} or{' '}
              {monthBMeta?.shortMonth || activeMonthB} yet.
            </div>
            <p>
              Head to <strong>Daily Log → Mood &amp; Symptoms</strong> and select symptoms with levels 1–3 to compare months side by side.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-lavender-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 px-3.5">Symptom</th>
                  <th className="py-2.5 px-3 text-center">
                    {monthAMeta?.shortMonth || activeMonthA}
                  </th>
                  <th className="py-2.5 px-3 text-center">
                    {monthBMeta?.shortMonth || activeMonthB}
                  </th>
                  <th className="py-2.5 px-3.5 text-right">Difference (B − A)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {symptomComparison.rows.map((row) => {
                  const isLower = row.diff < 0;
                  const isHigher = row.diff > 0;
                  const cleared = row.avgA !== null && row.avgB === null;
                  const newlyAppeared = row.avgA === null && row.avgB !== null;

                  return (
                    <tr key={row.symptom} className="hover:bg-cream/60 transition-colors">
                      <td className="py-2.5 px-3.5 font-bold text-slate-900">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{row.emoji}</span>
                          <span>{row.symptom}</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-center tabular-nums">
                        {row.avgA !== null ? (
                          <div>
                            <span
                              className={`inline-block font-mono font-extrabold px-2 py-0.5 rounded-lg border ${
                                row.avgA >= 2.5
                                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                                  : row.avgA >= 1.5
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              {row.avgA}/3 · {row.labelA}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {row.daysA} day{row.daysA === 1 ? '' : 's'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold">— Not logged</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center tabular-nums">
                        {row.avgB !== null ? (
                          <div>
                            <span
                              className={`inline-block font-mono font-extrabold px-2 py-0.5 rounded-lg border ${
                                row.avgB >= 2.5
                                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                                  : row.avgB >= 1.5
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            >
                              {row.avgB}/3 · {row.labelB}
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {row.daysB} day{row.daysB === 1 ? '' : 's'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-semibold">— Not logged</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 text-right tabular-nums">
                        {isLower ? (
                          <span className="inline-flex items-center gap-1 font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                            <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {row.diff.toFixed(1)} {cleared ? 'Cleared' : 'Lighter'}
                            </span>
                          </span>
                        ) : isHigher ? (
                          <span className="inline-flex items-center gap-1 font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              +{row.diff.toFixed(1)} {newlyAppeared ? 'New' : 'Stronger'}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                            <Minus className="w-3 h-3 shrink-0" />
                            <span>0.0 Same</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Next Steps & Quick Actions */}
      <div className="pt-3 border-t border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-extrabold text-slate-800">Helpful Next Steps</div>
          <ul className="space-y-1 text-xs text-slate-600 list-disc pl-4">
            {insights.actionChecklist.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenClinicSummary && (
            <button
              type="button"
              onClick={onOpenClinicSummary}
              className={`min-h-[44px] px-4 py-2 rounded-xl font-bold text-xs whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                insights.shouldConsultDoctor
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
                  : 'bg-lavender-700 hover:bg-lavender-900 text-white shadow-xs'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Open Clinic Summary</span>
            </button>
          )}
          {onJumpToPeriodEditor && (
            <button
              type="button"
              onClick={onJumpToPeriodEditor}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-lavender-50 text-slate-800 border border-slate-300 font-bold text-xs whitespace-nowrap transition-all cursor-pointer"
            >
              Update Period Dates
            </button>
          )}
          {onOpenTrendsChart && (
            <button
              type="button"
              onClick={onOpenTrendsChart}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-white hover:bg-lavender-50 text-lavender-900 border border-lavender-300 font-bold text-xs whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>View 6-Mo Chart</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
