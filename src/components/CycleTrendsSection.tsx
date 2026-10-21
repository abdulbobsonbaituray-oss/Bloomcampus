import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Activity,
  CalendarRange,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { PeriodRecord } from '../types';
import { diffDays, getSortedPeriods, parseDateISO } from '../utils/cycleEngine';

interface CycleTrendsSectionProps {
  periods: PeriodRecord[];
  avgCycleLength: number;
  avgPeriodDuration: number;
}

interface SixMonthPoint {
  monthKey: string;
  monthLabel: string;
  cycleLength: number;
  periodDuration: number;
  isLogged: boolean;
  startDateLabel: string;
}

interface CycleHealthInsight {
  headline: string;
  insightMessage: string;
  irregularityFlag: boolean;
  actionTip: string;
}

export const CycleTrendsSection: React.FC<CycleTrendsSectionProps> = ({
  periods,
  avgCycleLength,
  avgPeriodDuration,
}) => {
  const [chartView, setChartView] = useState<'both' | 'cycle' | 'duration'>('both');
  const [insight, setInsight] = useState<CycleHealthInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState<boolean>(false);

  const { chartData, stats } = useMemo(() => {
    const sorted = getSortedPeriods(periods);

    const loggedEntries: Array<{
      startDate: string;
      monthKey: string;
      monthShort: string;
      cycleLength: number;
      periodDuration: number;
    }> = sorted.map((p, idx) => {
      const d = parseDateISO(p.startDate);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthShort = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      let duration = avgPeriodDuration;
      if (p.endDate && p.endDate >= p.startDate) {
        const rawDur = diffDays(p.startDate, p.endDate) + 1;
        if (rawDur >= 1 && rawDur <= 16) {
          duration = rawDur;
        }
      }

      let cLen = avgCycleLength;
      if (idx + 1 < sorted.length) {
        const gap = diffDays(p.startDate, sorted[idx + 1].startDate);
        if (gap >= 15 && gap <= 65) {
          cLen = gap;
        }
      } else if (idx > 0) {
        const prevGap = diffDays(sorted[idx - 1].startDate, p.startDate);
        if (prevGap >= 15 && prevGap <= 65) {
          cLen = prevGap;
        }
      }

      return {
        startDate: p.startDate,
        monthKey,
        monthShort,
        cycleLength: cLen,
        periodDuration: duration,
      };
    });

    const now = new Date();
    const sixMonths: SixMonthPoint[] = [];

    for (let offset = 5; offset >= 0; offset--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const mKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}`;
      const mLabel = mDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      const match = loggedEntries.find((e) => e.monthKey === mKey);
      if (match) {
        const startObj = parseDateISO(match.startDate);
        sixMonths.push({
          monthKey: mKey,
          monthLabel: mLabel,
          cycleLength: match.cycleLength,
          periodDuration: match.periodDuration,
          isLogged: true,
          startDateLabel: startObj.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
        });
      } else {
        sixMonths.push({
          monthKey: mKey,
          monthLabel: mLabel,
          cycleLength: avgCycleLength,
          periodDuration: avgPeriodDuration,
          isLogged: false,
          startDateLabel: 'Baseline avg',
        });
      }
    }

    const cycleValues = sixMonths.map((d) => d.cycleLength);
    const durationValues = sixMonths.map((d) => d.periodDuration);
    const minCycle = Math.min(...cycleValues);
    const maxCycle = Math.max(...cycleValues);
    const cycleVariation = maxCycle - minCycle;
    const minDuration = Math.min(...durationValues);
    const maxDuration = Math.max(...durationValues);
    const loggedMonthsCount = sixMonths.filter((d) => d.isLogged).length;
    const isRegular =
      cycleVariation <= 7 &&
      avgCycleLength >= 25 &&
      avgCycleLength <= 35 &&
      maxDuration <= 7 &&
      minDuration >= 2;

    return {
      chartData: sixMonths,
      stats: {
        minCycle,
        maxCycle,
        cycleVariation,
        minDuration,
        maxDuration,
        loggedMonthsCount,
        isRegular,
      },
    };
  }, [periods, avgCycleLength, avgPeriodDuration]);

  const buildLocalFallbackInsight = useCallback((): CycleHealthInsight => {
    const irregularMonths = chartData.filter(
      (d) => d.cycleLength < 25 || d.cycleLength > 35 || d.periodDuration > 7 || d.periodDuration < 2
    );
    if (!stats.isRegular || irregularMonths.length > 0) {
      const flaggedLabels = irregularMonths.map((m) => m.monthLabel).join(', ');
      return {
        headline: 'Irregular Cycle Variation Detected',
        insightMessage: `Over the last 6 months, your cycle ranged from ${stats.minCycle} to ${stats.maxCycle} days (±${stats.cycleVariation}d variation) with bleeding lasting ${stats.minDuration}–${stats.maxDuration} days${
          flaggedLabels ? ` (notably in ${flaggedLabels})` : ''
        }. Shifts larger than 7 days or outside the 25–35 day window can be triggered by college exam stress, sleep changes, emergency contraception, or hormonal imbalances.`,
        irregularityFlag: true,
        actionTip:
          'Share your Clinic Summary card (🩺) with a campus doctor or healthcare provider if irregular intervals continue for 3+ cycles.',
      };
    }

    return {
      headline: `Consistent ${avgCycleLength}-Day Cycle Rhythm`,
      insightMessage: `Your 6-month history shows a steady cycle between ${stats.minCycle} and ${stats.maxCycle} days (±${stats.cycleVariation}d variation) and a healthy ${avgPeriodDuration}-day average period duration. Both your cycle length and bleeding duration fall well within normal clinical guidelines (25–35d cycle, 3–7d bleed).`,
      irregularityFlag: false,
      actionTip:
        'Keep logging your period start and end dates each month to maintain accurate ovulation and exam-sync predictions.',
    };
  }, [chartData, stats, avgCycleLength, avgPeriodDuration]);

  const analyzeCycleTrendsWithGemini = useCallback(async () => {
    setInsightLoading(true);
    try {
      const response = await fetch('/api/ai/cycle-health-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sixMonthData: chartData,
          avgCycleLength,
          avgPeriodDuration,
          cycleVariation: stats.cycleVariation,
        }),
      });
      const data = await response.json();
      if (response.ok && data && data.insightMessage) {
        setInsight({
          headline: data.headline || '6-Month Cycle Health Insight',
          insightMessage: data.insightMessage,
          irregularityFlag: Boolean(data.irregularityFlag),
          actionTip:
            data.actionTip ||
            'Continue tracking your start and end dates to keep predictions accurate.',
        });
      } else {
        setInsight(buildLocalFallbackInsight());
      }
    } catch {
      setInsight(buildLocalFallbackInsight());
    } finally {
      setInsightLoading(false);
    }
  }, [chartData, avgCycleLength, avgPeriodDuration, stats.cycleVariation, buildLocalFallbackInsight]);

  // Automatically analyze whenever logged period history changes
  useEffect(() => {
    analyzeCycleTrendsWithGemini();
  }, [analyzeCycleTrendsWithGemini]);

  return (
    <section className="bg-white rounded-3xl shadow-xs border border-lavender-200 p-5 sm:p-6">
      {/* Header & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-lavender-700 block mb-1">
            6-Month Pattern Analytics
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lavender-700" />
            <span>Cycle Trends (Last 6 Months)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Track how your cycle length and bleeding duration shift across semesters to spot stress, sleep, or hormonal patterns early.
          </p>
        </div>

        {/* Interactive Filter Controls */}
        <div className="flex items-center gap-1 p-1 bg-lavender-50 rounded-2xl border border-lavender-100 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setChartView('both')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              chartView === 'both'
                ? 'bg-white text-lavender-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Combined View
          </button>
          <button
            type="button"
            onClick={() => setChartView('cycle')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              chartView === 'cycle'
                ? 'bg-white text-lavender-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Cycle Length
          </button>
          <button
            type="button"
            onClick={() => setChartView('duration')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              chartView === 'duration'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Period Duration
          </button>
        </div>
      </div>

      {/* 3 Trend Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-2xl bg-lavender-50/70 border border-lavender-100 p-3.5 flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              6-Mo Cycle Range
            </span>
            <span className="font-display font-extrabold text-lg sm:text-xl text-lavender-900 mt-0.5 block tabular-nums">
              {stats.minCycle === stats.maxCycle
                ? `${stats.minCycle} Days`
                : `${stats.minCycle}–${stats.maxCycle} Days`}
            </span>
            <span className="text-[11px] text-lavender-700 font-medium block tabular-nums">
              Variation: ±{stats.cycleVariation}d · Avg {avgCycleLength}d
            </span>
          </div>
          <CalendarRange className="w-5 h-5 text-lavender-500 shrink-0 mt-1" />
        </div>

        <div className="rounded-2xl bg-rose-50/70 border border-rose-100 p-3.5 flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              6-Mo Bleed Duration
            </span>
            <span className="font-display font-extrabold text-lg sm:text-xl text-rose-700 mt-0.5 block tabular-nums">
              {stats.minDuration === stats.maxDuration
                ? `${stats.minDuration} Days`
                : `${stats.minDuration}–${stats.maxDuration} Days`}
            </span>
            <span className="text-[11px] text-rose-600 font-medium block tabular-nums">
              Avg Period: {avgPeriodDuration} days
            </span>
          </div>
          <Activity className="w-5 h-5 text-rose-500 shrink-0 mt-1" />
        </div>

        <div
          className={`rounded-2xl p-3.5 border flex items-start justify-between gap-3 ${
            stats.isRegular
              ? 'bg-sage-50/80 border-sage-200'
              : 'bg-peach-50/80 border-peach-200'
          }`}
        >
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
              Pattern Stability
            </span>
            <span
              className={`font-display font-extrabold text-base sm:text-lg mt-0.5 block ${
                stats.isRegular ? 'text-sage-800' : 'text-peach-700'
              }`}
            >
              {stats.isRegular ? 'Consistent Rhythm' : 'Variable Cycle'}
            </span>
            <span className="text-[11px] text-slate-600 font-medium block tabular-nums">
              {stats.loggedMonthsCount} of 6 months directly logged
            </span>
          </div>
          {stats.isRegular ? (
            <CheckCircle2 className="w-5 h-5 text-sage-600 shrink-0 mt-1" />
          ) : (
            <AlertCircle className="w-5 h-5 text-peach-500 shrink-0 mt-1" />
          )}
        </div>
      </div>

      {/* Recharts 6-Month Visualization */}
      <div className="bg-cream rounded-2xl border border-slate-200/80 p-4">
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 12, right: 16, left: -8, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="monthLabel"
                tick={{ fill: '#475569', fontSize: 12, fontWeight: 600 }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              {(chartView === 'both' || chartView === 'cycle') && (
                <YAxis
                  yAxisId="cycleAxis"
                  orientation="left"
                  domain={[18, 40]}
                  tick={{ fill: '#5639CC', fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  unit="d"
                />
              )}
              {(chartView === 'both' || chartView === 'duration') && (
                <YAxis
                  yAxisId="durationAxis"
                  orientation={chartView === 'duration' ? 'left' : 'right'}
                  domain={[0, 12]}
                  tick={{ fill: '#BE344D', fontSize: 11, fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  unit="d"
                />
              )}

              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #DDD2FD',
                  boxShadow: '0 8px 20px rgba(46, 27, 122, 0.08)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
                formatter={(
                  value: unknown,
                  name: unknown,
                  props: { payload?: SixMonthPoint }
                ) => {
                  const tag = props?.payload?.isLogged ? 'Logged' : 'Avg Baseline';
                  return [`${value ?? 0} days (${tag})`, String(name ?? '')];
                }}
                labelFormatter={(
                  label: unknown,
                  payload: readonly { payload?: SixMonthPoint }[]
                ) => {
                  const pt = payload?.[0]?.payload;
                  const labelText = String(label ?? '');
                  return pt ? `${labelText} · Start: ${pt.startDateLabel}` : labelText;
                }}
              />

              <Legend
                wrapperStyle={{ fontSize: '12px', fontWeight: 600, paddingTop: '8px' }}
              />

              {(chartView === 'both' || chartView === 'cycle') && (
                <ReferenceLine
                  yAxisId="cycleAxis"
                  y={28}
                  stroke="#7C5CFA"
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              )}

              {(chartView === 'both' || chartView === 'duration') && (
                <Bar
                  yAxisId="durationAxis"
                  dataKey="periodDuration"
                  name="Period Duration (Bleed Days)"
                  fill="#E85D75"
                  radius={[8, 8, 0, 0]}
                  barSize={28}
                />
              )}

              {(chartView === 'both' || chartView === 'cycle') && (
                <Line
                  yAxisId="cycleAxis"
                  type="monotone"
                  dataKey="cycleLength"
                  name="Cycle Length (Days)"
                  stroke="#5639CC"
                  strokeWidth={3}
                  dot={{ r: 5, fill: '#5639CC', strokeWidth: 2, stroke: '#FFFFFF' }}
                  activeDot={{ r: 7, fill: '#2E1B7A' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Footer Caption */}
        <div className="mt-3 pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
          <span>
            💡 <strong>Clinical Reference:</strong> Typical college cycles range from{' '}
            <strong className="tabular-nums">25–35 days</strong> with{' '}
            <strong className="tabular-nums">3–7 days</strong> of menstrual bleeding.
          </span>
          <span className="text-[11px] text-slate-500">
            Exam stress or emergency pills can temporarily shift a month by 3–7 days.
          </span>
        </div>
      </div>

      {/* GEMINI AI CYCLE HEALTH INSIGHT BANNER BELOW THE CHART */}
      <div
        className={`mt-5 rounded-2xl p-4 sm:p-5 border-2 transition-all ${
          insight?.irregularityFlag
            ? 'bg-rose-50/90 border-rose-300'
            : 'bg-gradient-to-r from-lavender-50 via-cream to-sage-50 border-lavender-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Sparkles
                className={`w-4 h-4 shrink-0 ${
                  insight?.irregularityFlag ? 'text-rose-600' : 'text-lavender-700'
                }`}
              />
              <span
                className={`text-xs font-extrabold uppercase tracking-wider ${
                  insight?.irregularityFlag ? 'text-rose-700' : 'text-lavender-800'
                }`}
              >
                Cycle Health Insight · 6-Month AI Pattern Analysis
              </span>
            </div>

            {insightLoading && !insight ? (
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Analyzing your last 6 months of logged cycle lengths and period durations...
              </p>
            ) : insight ? (
              <>
                <h3
                  className={`font-display font-extrabold text-base sm:text-lg ${
                    insight.irregularityFlag ? 'text-rose-900' : 'text-slate-900'
                  }`}
                >
                  {insight.irregularityFlag ? '⚠️ ' : '✅ '}
                  {insight.headline}
                </h3>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  {insight.insightMessage}
                </p>
                <p
                  className={`text-xs font-semibold pt-1 ${
                    insight.irregularityFlag ? 'text-rose-800' : 'text-sage-800'
                  }`}
                >
                  🩺 <strong>Next Step:</strong> {insight.actionTip}
                </p>
              </>
            ) : null}
          </div>

          <button
            type="button"
            onClick={analyzeCycleTrendsWithGemini}
            disabled={insightLoading}
            className="self-start px-3 py-1.5 rounded-xl bg-white hover:bg-lavender-50 text-lavender-800 font-bold text-xs border border-lavender-200 flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-50"
            title="Re-analyze 6-month cycle trends with Gemini"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${insightLoading ? 'animate-spin' : ''}`} />
            <span>{insightLoading ? 'Analyzing...' : 'Refresh Insight'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
