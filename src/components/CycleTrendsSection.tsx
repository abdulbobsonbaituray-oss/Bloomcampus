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

  // D3 Cycle Wheel (Radial 360° Cycle Length & Phase Wheel) Geometry Calculations
  const d3WheelGeometry = useMemo(() => {
    const cx = 195;
    const cy = 170;
    const innerHubR = 46;
    const maxDataR = 116;
    const phaseRingInnerR = 124;
    const phaseRingOuterR = 138;

    const rMinVal = Math.min(18, stats.minCycle - 3);
    const rMaxVal = Math.max(40, stats.maxCycle + 3);

    const rScale = d3
      .scaleLinear()
      .domain([rMinVal, rMaxVal])
      .range([innerHubR + 10, maxDataR])
      .clamp(true);

    // 4 Hormonal Cycle Phase Arcs around the outer wheel
    const totalRefDays = Math.max(21, avgCycleLength || 28);
    const bleedDays = Math.min(8, Math.max(3, avgPeriodDuration || 5));
    const ovulStart = Math.max(bleedDays + 4, totalRefDays - 16);
    const ovulEnd = Math.min(totalRefDays - 4, ovulStart + 4);

    const rawPhases = [
      {
        id: 'MENSTRUATION',
        label: '🩸 Menstruation',
        startDay: 0,
        endDay: bleedDays,
        color: '#F43F5E',
      },
      {
        id: 'FOLLICULAR',
        label: '🌱 Follicular',
        startDay: bleedDays,
        endDay: ovulStart,
        color: '#8B5CF6',
      },
      {
        id: 'OVULATION',
        label: '🌸 Ovulation',
        startDay: ovulStart,
        endDay: ovulEnd,
        color: '#10B981',
      },
      {
        id: 'LUTEAL',
        label: '🌙 Luteal',
        startDay: ovulEnd,
        endDay: totalRefDays,
        color: '#F59E0B',
      },
    ];

    const arcGen = d3
      .arc<{ startAngle: number; endAngle: number }>()
      .innerRadius(phaseRingInnerR)
      .outerRadius(phaseRingOuterR)
      .padAngle(0.025)
      .cornerRadius(5);

    const phaseArcs = rawPhases.map((p) => {
      const startAngle = (p.startDay / totalRefDays) * Math.PI * 2;
      const endAngle = (p.endDay / totalRefDays) * Math.PI * 2;
      return {
        ...p,
        path: arcGen({ startAngle, endAngle }) || '',
      };
    });

    // Normal clinical window annulus (25d to 35d)
    const normalInnerR = rScale(Math.max(rMinVal, 25));
    const normalOuterR = rScale(Math.min(rMaxVal, 35));
    const normalRingPath =
      d3
        .arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(normalInnerR)
        .outerRadius(normalOuterR)({ startAngle: 0, endAngle: Math.PI * 2 }) || '';

    // 6-Month Radial Nodes positioned evenly around the 360° wheel
    const count = Math.max(1, chartData.length);
    const wheelNodes = chartData.map((pt, idx) => {
      // D3 radial angle where 0 is 12 o'clock
      const d3Angle = (idx / count) * Math.PI * 2;
      // Standard trig angle where -PI/2 is 12 o'clock
      const trigAngle = d3Angle - Math.PI / 2;
      const r = rScale(pt.cycleLength);
      const meanR = rScale(avgCycleLength);
      const x = cx + r * Math.cos(trigAngle);
      const y = cy + r * Math.sin(trigAngle);
      const meanX = cx + meanR * Math.cos(trigAngle);
      const meanY = cy + meanR * Math.sin(trigAngle);
      const spokeOuterX = cx + (phaseRingInnerR - 4) * Math.cos(trigAngle);
      const spokeOuterY = cy + (phaseRingInnerR - 4) * Math.sin(trigAngle);
      const labelR = phaseRingOuterR + 17;
      const labelX = cx + labelR * Math.cos(trigAngle);
      const labelY = cy + labelR * Math.sin(trigAngle);

      return {
        ...pt,
        idx,
        d3Angle,
        trigAngle,
        r,
        x,
        y,
        meanX,
        meanY,
        spokeOuterX,
        spokeOuterY,
        labelX,
        labelY,
      };
    });

    // Closed D3 radial curve connecting all 6 months in a smooth wheel loop
    const radialLineGen = d3
      .lineRadial<{ d3Angle: number; r: number }>()
      .angle((d) => d.d3Angle)
      .radius((d) => d.r)
      .curve(d3.curveCardinalClosed.tension(0.55));

    const radialAreaGen = d3
      .areaRadial<{ d3Angle: number; r: number }>()
      .angle((d) => d.d3Angle)
      .innerRadius(innerHubR)
      .outerRadius((d) => d.r)
      .curve(d3.curveCardinalClosed.tension(0.55));

    const radialCurvePath = radialLineGen(wheelNodes) || '';
    const radialAreaPath = radialAreaGen(wheelNodes) || '';

    return {
      cx,
      cy,
      innerHubR,
      maxDataR,
      phaseRingInnerR,
      phaseRingOuterR,
      avgR: rScale(avgCycleLength),
      normalInnerR,
      normalOuterR,
      normalRingPath,
      phaseArcs,
      wheelNodes,
      radialCurvePath,
      radialAreaPath,
    };
  }, [chartData, stats.minCycle, stats.maxCycle, avgCycleLength, avgPeriodDuration]);

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
            6-Month Pattern Analytics · D3 Cycle Wheel Engine
          </span>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lavender-700" />
            <span>Cycle Trends &amp; Variability (Last 6 Months)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Explore your 6-month cycle length wheel and bleeding duration to spot exam stress, sleep, or hormonal shifts early.
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
            🎡 D3 Cycle Wheel
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
            {/* D3 Cycle Wheel Legend & Active Point Readout */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 font-bold text-lavender-900">
                  <span className="w-3 h-3 rounded-full border-2 border-lavender-700 bg-lavender-200 inline-block" />
                  D3 Cycle Length Wheel
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-sage-700">
                  <span className="w-3 h-2.5 bg-emerald-500/15 border border-emerald-500/40 inline-block rounded-xs" />
                  Clinical Normal Ring (25–35d)
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                  <span className="w-3 h-2.5 bg-gradient-to-r from-rose-500 via-violet-500 to-amber-500 inline-block rounded-full" />
                  4-Phase Outer Wheel
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
                  Tap or hover any month on the wheel to inspect cycle length &amp; bleed days
                </span>
              )}
            </div>

            {/* Interactive D3 Radial Cycle Wheel + 6-Month Wheel Selector Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              <div className="lg:col-span-7 flex items-center justify-center">
                <svg
                  viewBox="0 0 390 340"
                  className="w-full max-w-[380px] h-72 sm:h-80 select-none overflow-visible"
                  role="img"
                  aria-label="D3 6-Month Cycle Length Wheel"
                >
                  <defs>
                    <radialGradient id="d3CycleWheelGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="20%" stopColor="#7C5CFA" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#5639CC" stopOpacity={0.32} />
                    </radialGradient>
                  </defs>

                  {/* Translated Group to Wheel Center */}
                  <g transform={`translate(${d3WheelGeometry.cx}, ${d3WheelGeometry.cy})`}>
                    {/* Outer 4-Phase Hormonal Ring */}
                    {d3WheelGeometry.phaseArcs.map((arc) => (
                      <path
                        key={arc.id}
                        d={arc.path}
                        fill={arc.color}
                        fillOpacity={0.85}
                      />
                    ))}

                    {/* Clinical Normal Reference Ring (25–35 days) */}
                    <path
                      d={d3WheelGeometry.normalRingPath}
                      fill="#10B981"
                      fillOpacity={0.1}
                    />
                    <circle
                      r={d3WheelGeometry.normalInnerR}
                      fill="none"
                      stroke="#10B981"
                      strokeOpacity={0.35}
                      strokeDasharray="2 3"
                    />
                    <circle
                      r={d3WheelGeometry.normalOuterR}
                      fill="none"
                      stroke="#10B981"
                      strokeOpacity={0.35}
                      strokeDasharray="2 3"
                    />

                    {/* Personal Mean Cycle Length Ring */}
                    <circle
                      r={d3WheelGeometry.avgR}
                      fill="none"
                      stroke="#7C5CFA"
                      strokeWidth={1.6}
                      strokeDasharray="5 4"
                    />

                    {/* Shaded D3 Radial Cycle Area */}
                    <path
                      d={d3WheelGeometry.radialAreaPath}
                      fill="url(#d3CycleWheelGrad)"
                    />

                    {/* Closed D3 Radial Cycle Length Curve */}
                    <path
                      d={d3WheelGeometry.radialCurvePath}
                      fill="none"
                      stroke="#5639CC"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Center Hub Readout Circle */}
                    <circle
                      r={d3WheelGeometry.innerHubR}
                      fill="#FFFFFF"
                      stroke="#DDD2FD"
                      strokeWidth={2.5}
                    />
                    <text
                      x={0}
                      y={-12}
                      textAnchor="middle"
                      className="fill-slate-400 text-[9px] font-extrabold uppercase tracking-wider"
                    >
                      {hoveredPoint ? hoveredPoint.monthLabel : '6-Mo Avg'}
                    </text>
                    <text
                      x={0}
                      y={8}
                      textAnchor="middle"
                      className="fill-lavender-950 text-[16px] font-extrabold"
                    >
                      {hoveredPoint ? `${hoveredPoint.cycleLength}d` : `${avgCycleLength}d`}
                    </text>
                    <text
                      x={0}
                      y={23}
                      textAnchor="middle"
                      className="fill-rose-600 text-[9.5px] font-bold"
                    >
                      {hoveredPoint
                        ? `🩸 ${hoveredPoint.periodDuration}d bleed`
                        : `🩸 ${avgPeriodDuration}d avg`}
                    </text>
                  </g>

                  {/* Radial Spokes, Month Nodes & Perimeter Labels */}
                  {d3WheelGeometry.wheelNodes.map((node) => {
                    const isOutlier = node.cycleLength < 25 || node.cycleLength > 35;
                    const isHovered = hoveredPoint?.monthKey === node.monthKey;

                    return (
                      <g
                        key={node.monthKey}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPoint(node)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        onClick={() => setHoveredPoint(node)}
                      >
                        {/* Radial spoke guide */}
                        <line
                          x1={
                            d3WheelGeometry.cx +
                            d3WheelGeometry.innerHubR * Math.cos(node.trigAngle)
                          }
                          y1={
                            d3WheelGeometry.cy +
                            d3WheelGeometry.innerHubR * Math.sin(node.trigAngle)
                          }
                          x2={node.spokeOuterX}
                          y2={node.spokeOuterY}
                          stroke="#CBD5E1"
                          strokeWidth={1}
                          strokeDasharray="2 3"
                        />

                        {/* Deviation stem from personal mean ring to month node */}
                        <line
                          x1={node.meanX}
                          y1={node.meanY}
                          x2={node.x}
                          y2={node.y}
                          stroke={isOutlier ? '#E11D48' : '#7C5CFA'}
                          strokeWidth={2}
                        />

                        {/* Halo on hover or outlier */}
                        {(isHovered || isOutlier) && (
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={isHovered ? 11 : 8.5}
                            fill={isOutlier ? '#F43F5E' : '#5639CC'}
                            fillOpacity={0.22}
                          />
                        )}

                        {/* Month Data Point Circle */}
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isHovered ? 7 : 5.5}
                          fill={isOutlier ? '#E11D48' : node.isLogged ? '#5639CC' : '#94A3B8'}
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />

                        {/* Outer Wheel Month & Cycle Length Badge */}
                        <text
                          x={node.labelX}
                          y={node.labelY - 3}
                          textAnchor="middle"
                          className={`text-[10.5px] font-extrabold ${
                            isHovered ? 'fill-lavender-900' : 'fill-slate-700'
                          }`}
                        >
                          {node.monthLabel}
                        </text>
                        <text
                          x={node.labelX}
                          y={node.labelY + 9}
                          textAnchor="middle"
                          className={`text-[10px] font-bold ${
                            isOutlier ? 'fill-rose-600' : 'fill-lavender-700'
                          }`}
                        >
                          {node.cycleLength}d
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              {/* Right Column: Interactive 6-Month Wheel Spokes & Phase Key */}
              <div className="lg:col-span-5 space-y-2.5">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Tap Any Month Spoke on the Wheel:
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {chartData.map((pt) => {
                    const isSelected = hoveredPoint?.monthKey === pt.monthKey;
                    const isOutlier = pt.cycleLength < 25 || pt.cycleLength > 35;
                    return (
                      <button
                        key={pt.monthKey}
                        type="button"
                        onClick={() =>
                          setHoveredPoint((prev) =>
                            prev?.monthKey === pt.monthKey ? null : pt
                          )
                        }
                        className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-lavender-700 text-white border-lavender-900 shadow-xs'
                            : 'bg-white hover:bg-lavender-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold">{pt.monthLabel}</span>
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md tabular-nums ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : isOutlier
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-lavender-50 text-lavender-800'
                            }`}
                          >
                            {pt.cycleLength}d
                          </span>
                        </div>
                        <div
                          className={`text-[10px] mt-1 font-medium tabular-nums ${
                            isSelected ? 'text-lavender-100' : 'text-slate-500'
                          }`}
                        >
                          🩸 {pt.periodDuration}d bleed · {pt.startDateLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 4-Phase Outer Ring Legend */}
                <div className="rounded-2xl bg-white border border-slate-200/90 p-3">
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                    Outer Wheel 4 Hormonal Stages:
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                    <span className="flex items-center gap-1.5 text-rose-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                      🩸 Menstruation
                    </span>
                    <span className="flex items-center gap-1.5 text-violet-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />
                      🌱 Follicular
                    </span>
                    <span className="flex items-center gap-1.5 text-emerald-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                      🌸 Ovulation
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-700">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                      🌙 Luteal
                    </span>
                  </div>
                </div>
              </div>
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
