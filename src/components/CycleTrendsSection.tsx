import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import * as d3 from 'd3';
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
  deviationFromAvg: number;
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
  const [chartView, setChartView] = useState<'d3_variability' | 'both' | 'duration'>('d3_variability');
  const [hoveredPoint, setHoveredPoint] = useState<SixMonthPoint | null>(null);
  const [insight, setInsight] = useState<CycleHealthInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState<boolean>(false);

  // Cache insights by data signature so background user syncs never re-trigger API calls
  const insightCacheRef = useRef<Record<string, CycleHealthInsight>>({});
  const lastFetchedSignatureRef = useRef<string>('');

  // Stable string signature of logged periods + averages
  const periodsSignature = useMemo(() => {
    const sorted = getSortedPeriods(periods);
    const serialized = sorted.map((p) => `${p.startDate}:${p.endDate || ''}`).join(',');
    return `${serialized}|c:${avgCycleLength}|p:${avgPeriodDuration}`;
  }, [periods, avgCycleLength, avgPeriodDuration]);

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
          deviationFromAvg: match.cycleLength - avgCycleLength,
        });
      } else {
        sixMonths.push({
          monthKey: mKey,
          monthLabel: mLabel,
          cycleLength: avgCycleLength,
          periodDuration: avgPeriodDuration,
          isLogged: false,
          startDateLabel: 'Baseline avg',
          deviationFromAvg: 0,
        });
      }
    }

    const cycleValues = sixMonths.map((d) => d.cycleLength);
    const durationValues = sixMonths.map((d) => d.periodDuration);
    const minCycle = Math.min(...cycleValues);
    const maxCycle = Math.max(...cycleValues);
    const cycleVariation = maxCycle - minCycle;
    const stdDev = Math.round((d3.deviation(cycleValues) || 0) * 10) / 10;
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
        stdDev,
        minDuration,
        maxDuration,
        loggedMonthsCount,
        isRegular,
      },
    };
    // Depend on periodsSignature so array reference changes don't recompute unnecessarily
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodsSignature, avgCycleLength, avgPeriodDuration]);

  // D3 Line & Variability Geometry Calculations
  const d3Geometry = useMemo(() => {
    const width = 680;
    const height = 260;
    const margin = { top: 24, right: 28, bottom: 36, left: 44 };

    const yMin = Math.min(18, stats.minCycle - 3);
    const yMax = Math.max(40, stats.maxCycle + 3);

    const xScale = d3
      .scalePoint<string>()
      .domain(chartData.map((d) => d.monthLabel))
      .range([margin.left, width - margin.right])
      .padding(0.2);

    const yScale = d3
      .scaleLinear()
      .domain([yMin, yMax])
      .range([height - margin.bottom, margin.top]);

    const lineGenerator = d3
      .line<SixMonthPoint>()
      .x((d) => xScale(d.monthLabel) ?? margin.left)
      .y((d) => yScale(d.cycleLength))
      .curve(d3.curveMonotoneX);

    const areaGenerator = d3
      .area<SixMonthPoint>()
      .x((d) => xScale(d.monthLabel) ?? margin.left)
      .y0(height - margin.bottom)
      .y1((d) => yScale(d.cycleLength))
      .curve(d3.curveMonotoneX);

    // Variability envelope around user's average cycle length (±max(2, stdDev))
    const bandHalf = Math.max(2, Math.round(stats.cycleVariation / 2));
    const variabilityBandGenerator = d3
      .area<SixMonthPoint>()
      .x((d) => xScale(d.monthLabel) ?? margin.left)
      .y0(() => yScale(Math.max(yMin, avgCycleLength - bandHalf)))
      .y1(() => yScale(Math.min(yMax, avgCycleLength + bandHalf)))
      .curve(d3.curveMonotoneX);

    const linePath = lineGenerator(chartData) || '';
    const areaPath = areaGenerator(chartData) || '';
    const variabilityBandPath = variabilityBandGenerator(chartData) || '';

    const yTicks = yScale.ticks(6);
    const normalZoneTop = yScale(Math.min(yMax, 35));
    const normalZoneBottom = yScale(Math.max(yMin, 25));

    return {
      width,
      height,
      margin,
      xScale,
      yScale,
      linePath,
      areaPath,
      variabilityBandPath,
      yTicks,
      normalZoneTop,
      normalZoneBottom,
      avgY: yScale(avgCycleLength),
    };
  }, [chartData, stats.minCycle, stats.maxCycle, stats.cycleVariation, avgCycleLength]);

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

  const analyzeCycleTrendsWithGemini = useCallback(
    async (forceRefresh = false) => {
      if (!forceRefresh && insightCacheRef.current[periodsSignature]) {
        setInsight(insightCacheRef.current[periodsSignature]);
        return;
      }

      // Immediately show local clinical insight while loading or if offline
      const fallback = buildLocalFallbackInsight();
      if (!insight) {
        setInsight(fallback);
      }

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
          const resolved: CycleHealthInsight = {
            headline: data.headline || '6-Month Cycle Health Insight',
            insightMessage: data.insightMessage,
            irregularityFlag: Boolean(data.irregularityFlag),
            actionTip:
              data.actionTip ||
              'Continue tracking your start and end dates to keep predictions accurate.',
          };
          insightCacheRef.current[periodsSignature] = resolved;
          setInsight(resolved);
        } else {
          insightCacheRef.current[periodsSignature] = fallback;
          setInsight(fallback);
        }
      } catch {
        insightCacheRef.current[periodsSignature] = fallback;
        setInsight(fallback);
      } finally {
        setInsightLoading(false);
      }
    },
    [
      periodsSignature,
      chartData,
      avgCycleLength,
      avgPeriodDuration,
      stats.cycleVariation,
      buildLocalFallbackInsight,
      insight,
    ]
  );

  // Only analyze when the actual logged period signature changes
  useEffect(() => {
    if (lastFetchedSignatureRef.current === periodsSignature) {
      return;
    }
    lastFetchedSignatureRef.current = periodsSignature;
    analyzeCycleTrendsWithGemini(false);
  }, [periodsSignature, analyzeCycleTrendsWithGemini]);

  return (
    <section className="bg-white rounded-3xl shadow-xs border border-lavender-200 p-5 sm:p-6">
      {/* Header & View Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-lavender-700 block mb-1">
            6-Month Pattern Analytics · D3 Variability Engine
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lavender-700" />
            <span>Cycle Trends & Variability (Last 6 Months)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Visualize your 6-month cycle length variability and bleeding duration to spot exam stress, sleep, or hormonal shifts early.
          </p>
        </div>

        {/* Interactive Filter Controls */}
        <div className="flex items-center gap-1 p-1 bg-lavender-50 rounded-2xl border border-lavender-100 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setChartView('d3_variability')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 ${
              chartView === 'd3_variability'
                ? 'bg-white text-lavender-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            D3 Variability Line
          </button>
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
              Variability: ±{stats.cycleVariation}d (SD {stats.stdDev}d) · Avg {avgCycleLength}d
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

      {/* Chart Container */}
      <div className="bg-cream rounded-2xl border border-slate-200/80 p-4">
        {chartView === 'd3_variability' ? (
          <div className="relative">
            {/* D3 Legend & Active Point Readout */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 font-bold text-lavender-900">
                  <span className="w-3 h-0.5 bg-lavender-700 inline-block rounded-full" />
                  D3 Cycle Length Curve
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-sage-700">
                  <span className="w-3 h-2.5 bg-emerald-500/15 border border-emerald-500/40 inline-block rounded-xs" />
                  Clinical Normal Window (25–35d)
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-lavender-700">
                  <span className="w-3 h-2.5 bg-lavender-500/15 border border-lavender-400/40 inline-block rounded-xs" />
                  Personal Variability Band
                </span>
              </div>
              {hoveredPoint ? (
                <div className="px-2.5 py-1 rounded-xl bg-white border border-lavender-200 shadow-2xs text-slate-800 font-semibold tabular-nums">
                  {hoveredPoint.monthLabel}:{' '}
                  <strong className="text-lavender-800">{hoveredPoint.cycleLength}d cycle</strong> (
                  {hoveredPoint.deviationFromAvg === 0
                    ? 'On avg'
                    : `${hoveredPoint.deviationFromAvg > 0 ? '+' : ''}${hoveredPoint.deviationFromAvg}d vs avg`}
                  ) · Bleed: {hoveredPoint.periodDuration}d ({hoveredPoint.startDateLabel})
                </div>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Hover or tap any month node to inspect cycle deviation
                </span>
              )}
            </div>

            {/* Responsive D3 SVG Chart */}
            <div className="w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${d3Geometry.width} ${d3Geometry.height}`}
                className="w-full h-64 sm:h-72 select-none overflow-visible"
                role="img"
                aria-label="D3 6-Month Cycle Length Variability Line Chart"
              >
                <defs>
                  <linearGradient id="d3CycleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5639CC" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="#5639CC" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                {/* Clinical Normal Reference Band (25–35 days) */}
                <rect
                  x={d3Geometry.margin.left}
                  y={d3Geometry.normalZoneTop}
                  width={d3Geometry.width - d3Geometry.margin.left - d3Geometry.margin.right}
                  height={Math.max(0, d3Geometry.normalZoneBottom - d3Geometry.normalZoneTop)}
                  fill="#10B981"
                  fillOpacity={0.07}
                  rx={6}
                />

                {/* Horizontal Grid Lines & Y-Axis Labels */}
                {d3Geometry.yTicks.map((tickVal) => {
                  const yPos = d3Geometry.yScale(tickVal);
                  return (
                    <g key={tickVal}>
                      <line
                        x1={d3Geometry.margin.left}
                        x2={d3Geometry.width - d3Geometry.margin.right}
                        y1={yPos}
                        y2={yPos}
                        stroke="#E2E8F0"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={d3Geometry.margin.left - 8}
                        y={yPos + 4}
                        textAnchor="end"
                        className="fill-slate-500 text-[11px] font-semibold"
                      >
                        {tickVal}d
                      </text>
                    </g>
                  );
                })}

                {/* User's Personal Variability Band around Mean */}
                <path
                  d={d3Geometry.variabilityBandPath}
                  fill="#7C5CFA"
                  fillOpacity={0.12}
                />

                {/* Mean Cycle Length Reference Line */}
                <line
                  x1={d3Geometry.margin.left}
                  x2={d3Geometry.width - d3Geometry.margin.right}
                  y1={d3Geometry.avgY}
                  y2={d3Geometry.avgY}
                  stroke="#7C5CFA"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
                <text
                  x={d3Geometry.width - d3Geometry.margin.right - 4}
                  y={d3Geometry.avgY - 6}
                  textAnchor="end"
                  className="fill-lavender-700 text-[10px] font-bold"
                >
                  Mean {avgCycleLength}d
                </text>

                {/* Shaded Area Under D3 Monotone Curve */}
                <path d={d3Geometry.areaPath} fill="url(#d3CycleAreaGrad)" />

                {/* Smooth D3 Cycle Length Line */}
                <path
                  d={d3Geometry.linePath}
                  fill="none"
                  stroke="#5639CC"
                  strokeWidth={3.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Nodes, Deviation Connectors & X-Axis Labels */}
                {chartData.map((pt) => {
                  const cx = d3Geometry.xScale(pt.monthLabel) ?? d3Geometry.margin.left;
                  const cy = d3Geometry.yScale(pt.cycleLength);
                  const isOutlier = pt.cycleLength < 25 || pt.cycleLength > 35;
                  const isHovered = hoveredPoint?.monthKey === pt.monthKey;

                  return (
                    <g
                      key={pt.monthKey}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredPoint(pt)}
                      onMouseLeave={() => setHoveredPoint(null)}
                      onClick={() => setHoveredPoint(pt)}
                    >
                      {/* Vertical deviation stem from mean line */}
                      <line
                        x1={cx}
                        x2={cx}
                        y1={d3Geometry.avgY}
                        y2={cy}
                        stroke={isOutlier ? '#E11D48' : '#7C5CFA'}
                        strokeWidth={1.5}
                        strokeDasharray="2 2"
                        strokeOpacity={0.65}
                      />

                      {/* Outer halo on hover or outlier */}
                      {(isHovered || isOutlier) && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isHovered ? 10 : 8}
                          fill={isOutlier ? '#F43F5E' : '#5639CC'}
                          fillOpacity={0.2}
                        />
                      )}

                      {/* Main Data Point Circle */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6.5 : 5}
                        fill={isOutlier ? '#E11D48' : pt.isLogged ? '#5639CC' : '#94A3B8'}
                        stroke="#FFFFFF"
                        strokeWidth={2}
                      />

                      {/* Value Pill Above Node */}
                      <text
                        x={cx}
                        y={cy - 10}
                        textAnchor="middle"
                        className={`text-[11px] font-extrabold ${
                          isOutlier ? 'fill-rose-700' : 'fill-lavender-900'
                        }`}
                      >
                        {pt.cycleLength}d
                      </text>

                      {/* X-Axis Month Label */}
                      <text
                        x={cx}
                        y={d3Geometry.height - 10}
                        textAnchor="middle"
                        className="fill-slate-600 text-[11px] font-bold"
                      >
                        {pt.monthLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        ) : (
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
                {chartView === 'both' && (
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

                {chartView === 'both' && (
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

                {chartView === 'both' && (
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
        )}

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
                Cycle Health Insight · 6-Month Pattern Analysis
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
            onClick={() => analyzeCycleTrendsWithGemini(true)}
            disabled={insightLoading}
            className="self-start px-3 py-1.5 rounded-xl bg-white hover:bg-lavender-50 text-lavender-800 font-bold text-xs border border-lavender-200 flex items-center gap-1.5 shrink-0 transition-all disabled:opacity-50"
            title="Re-analyze 6-month cycle trends"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${insightLoading ? 'animate-spin' : ''}`} />
            <span>{insightLoading ? 'Analyzing...' : 'Refresh Insight'}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
