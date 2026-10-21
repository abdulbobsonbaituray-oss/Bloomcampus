import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Sparkles,
  HeartHandshake,
  BarChart3,
  Layers,
  Calendar,
  Activity,
  Grid,
  Zap,
} from 'lucide-react';
import { StageKey, UserData } from '../types';
import { MOOD_CATEGORIES, SYMPTOM_ITEMS, PHASE_ADVISOR_DATA } from '../constants';
import { calculateCycleMetrics, formatShortMonthDay } from '../utils/cycleEngine';

interface MoodStageCorrelationSectionProps {
  userData: UserData;
  currentStageKey: StageKey;
  onSelectDate?: (dateStr: string) => void;
}

const STAGE_ORDER: StageKey[] = ['MENSTRUATION', 'FOLLICULAR', 'OVULATION', 'LUTEAL'];

const STAGE_META: Record<
  StageKey,
  {
    label: string;
    shortLabel: string;
    daysRange: string;
    emoji: string;
    accentBg: string;
    accentBorder: string;
    accentText: string;
    badgeBg: string;
    barColor: string;
    heatRgb: string;
  }
> = {
  MENSTRUATION: {
    label: 'Menstruation Stage',
    shortLabel: 'Menstruation',
    daysRange: 'Days 1–5',
    emoji: '🩸',
    accentBg: 'bg-rose-50/70',
    accentBorder: 'border-rose-200',
    accentText: 'text-rose-800',
    badgeBg: 'bg-rose-100 text-rose-800',
    barColor: '#E85D75',
    heatRgb: '232, 93, 117',
  },
  FOLLICULAR: {
    label: 'Follicular Stage',
    shortLabel: 'Follicular',
    daysRange: 'Days 6–11',
    emoji: '🌱',
    accentBg: 'bg-lavender-50/70',
    accentBorder: 'border-lavender-200',
    accentText: 'text-lavender-900',
    badgeBg: 'bg-lavender-100 text-lavender-800',
    barColor: '#7C5CFA',
    heatRgb: '124, 92, 250',
  },
  OVULATION: {
    label: 'Ovulation Stage',
    shortLabel: 'Ovulation',
    daysRange: 'Days 12–16',
    emoji: '🌸',
    accentBg: 'bg-sage-50/70',
    accentBorder: 'border-sage-200',
    accentText: 'text-sage-800',
    badgeBg: 'bg-sage-100 text-sage-800',
    barColor: '#2E6B56',
    heatRgb: '46, 107, 86',
  },
  LUTEAL: {
    label: 'Luteal Stage',
    shortLabel: 'Luteal',
    daysRange: 'Days 17–28',
    emoji: '🌙',
    accentBg: 'bg-peach-50/70',
    accentBorder: 'border-peach-200',
    accentText: 'text-peach-800',
    badgeBg: 'bg-peach-100 text-peach-800',
    barColor: '#D97757',
    heatRgb: '217, 119, 87',
  },
};

const EMOTIONAL_CLUSTERS = [
  {
    key: 'highPositive',
    name: 'Energized, Focused & Creative',
    moods: ['Energized', 'Focused', 'Creative', 'Happy'],
    color: '#2E6B56',
  },
  {
    key: 'calmGrounded',
    name: 'Calm & Balanced',
    moods: ['Calm'],
    color: '#7C5CFA',
  },
  {
    key: 'lowEnergyRest',
    name: 'Fatigued, Sad & Numb',
    moods: ['Fatigued', 'Sad', 'Numb'],
    color: '#E85D75',
  },
  {
    key: 'highSensitivity',
    name: 'Anxious & Irritable',
    moods: ['Anxious', 'Irritable'],
    color: '#D97757',
  },
] as const;

const SYMPTOM_PALETTE: Record<string, string> = {
  'Mild Cramps': '#E85D75',
  'Severe Pain': '#BE123C',
  Headache: '#7C5CFA',
  Bloating: '#D97757',
  'Breast Tenderness': '#EC4899',
  'Acne / Breakout': '#2E6B56',
};

function resolveStageKeyFromLog(
  userData: UserData,
  dateStr: string,
  stageAtLog: string | null
): StageKey {
  if (stageAtLog) {
    const upper = stageAtLog.toUpperCase();
    if (upper.includes('MENSTRUATION')) return 'MENSTRUATION';
    if (upper.includes('FOLLICULAR')) return 'FOLLICULAR';
    if (upper.includes('OVULATION')) return 'OVULATION';
    if (upper.includes('LUTEAL')) return 'LUTEAL';
  }
  return calculateCycleMetrics(userData, dateStr).stageKey;
}

function getMoodEmoji(moodId: string): string {
  return MOOD_CATEGORIES.find((m) => m.id === moodId)?.emoji || '✨';
}

function getSymptomEmoji(symptomId: string): string {
  return SYMPTOM_ITEMS.find((s) => s.id === symptomId)?.emoji || '🩺';
}

function normalizeSymptomName(sym: string): string {
  if (sym === 'Acne Flare') return 'Acne / Breakout';
  return sym;
}

export const MoodStageCorrelationSection: React.FC<MoodStageCorrelationSectionProps> = ({
  userData,
  currentStageKey,
  onSelectDate,
}) => {
  const [visualMode, setVisualMode] = useState<'heatmap' | 'symptoms' | 'spectrum' | 'topMoods'>(
    'spectrum'
  );
  const [selectedStageFilter, setSelectedStageFilter] = useState<StageKey | 'ALL'>('ALL');

  const correlationData = useMemo(() => {
    const logs = userData.dailyLogs || {};
    const stageMap: Record<
      StageKey,
      {
        totalDaysLogged: number;
        totalMoodLogs: number;
        totalSymptomMentions: number;
        moodCounts: Record<string, number>;
        symptomCounts: Record<string, number>;
        entries: Array<{
          dateStr: string;
          mood: string | null;
          emoji: string;
          symptoms: string[];
          notes: string;
        }>;
      }
    > = {
      MENSTRUATION: {
        totalDaysLogged: 0,
        totalMoodLogs: 0,
        totalSymptomMentions: 0,
        moodCounts: {},
        symptomCounts: {},
        entries: [],
      },
      FOLLICULAR: {
        totalDaysLogged: 0,
        totalMoodLogs: 0,
        totalSymptomMentions: 0,
        moodCounts: {},
        symptomCounts: {},
        entries: [],
      },
      OVULATION: {
        totalDaysLogged: 0,
        totalMoodLogs: 0,
        totalSymptomMentions: 0,
        moodCounts: {},
        symptomCounts: {},
        entries: [],
      },
      LUTEAL: {
        totalDaysLogged: 0,
        totalMoodLogs: 0,
        totalSymptomMentions: 0,
        moodCounts: {},
        symptomCounts: {},
        entries: [],
      },
    };

    const overallMoodCounts: Record<string, number> = {};
    const overallSymptomCounts: Record<string, number> = {};
    const pairCounts: Record<
      string,
      { mood: string; symptom: string; stageKey: StageKey; count: number }
    > = {};

    let totalCheckIns = 0;
    let totalSymptomEvents = 0;

    Object.entries(logs).forEach(([dateStr, entry]) => {
      if (!entry) return;
      const hasMood = Boolean(entry.mood);
      const rawSymptoms = Array.isArray(entry.symptoms) ? entry.symptoms : [];
      const normalizedSymptoms = rawSymptoms.map(normalizeSymptomName);
      if (!hasMood && normalizedSymptoms.length === 0) return;

      const stageKey = resolveStageKeyFromLog(userData, dateStr, entry.stageAtLog);
      const bucket = stageMap[stageKey];
      bucket.totalDaysLogged += 1;
      totalCheckIns += 1;

      if (entry.mood) {
        bucket.totalMoodLogs += 1;
        bucket.moodCounts[entry.mood] = (bucket.moodCounts[entry.mood] || 0) + 1;
        overallMoodCounts[entry.mood] = (overallMoodCounts[entry.mood] || 0) + 1;
      }

      normalizedSymptoms.forEach((sym) => {
        bucket.totalSymptomMentions += 1;
        totalSymptomEvents += 1;
        bucket.symptomCounts[sym] = (bucket.symptomCounts[sym] || 0) + 1;
        overallSymptomCounts[sym] = (overallSymptomCounts[sym] || 0) + 1;

        if (entry.mood) {
          const pairKey = `${stageKey}__${entry.mood}__${sym}`;
          if (!pairCounts[pairKey]) {
            pairCounts[pairKey] = {
              mood: entry.mood,
              symptom: sym,
              stageKey,
              count: 0,
            };
          }
          pairCounts[pairKey].count += 1;
        }
      });

      bucket.entries.push({
        dateStr,
        mood: entry.mood,
        emoji: entry.mood ? getMoodEmoji(entry.mood) : '🩺',
        symptoms: normalizedSymptoms,
        notes: entry.notes || '',
      });
    });

    // Sort entries newest first
    STAGE_ORDER.forEach((st) => {
      stageMap[st].entries.sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1));
    });

    // Build per-stage summaries with ranked moods & ranked symptoms
    const stageSummaries = STAGE_ORDER.map((stKey) => {
      const meta = STAGE_META[stKey];
      const bucket = stageMap[stKey];

      const rankedMoods = Object.entries(bucket.moodCounts)
        .map(([mood, count]) => ({
          mood,
          emoji: getMoodEmoji(mood),
          count,
          pct:
            bucket.totalMoodLogs > 0
              ? Math.round((count / bucket.totalMoodLogs) * 100)
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const rankedSymptoms = Object.entries(bucket.symptomCounts)
        .map(([symptom, count]) => ({
          symptom,
          emoji: getSymptomEmoji(symptom),
          count,
          pct:
            bucket.totalDaysLogged > 0
              ? Math.round((count / bucket.totalDaysLogged) * 100)
              : 0,
        }))
        .sort((a, b) => b.count - a.count);

      const clusterCounts: Record<string, number> = {
        highPositive: 0,
        calmGrounded: 0,
        lowEnergyRest: 0,
        highSensitivity: 0,
      };

      EMOTIONAL_CLUSTERS.forEach((cluster) => {
        cluster.moods.forEach((mId) => {
          clusterCounts[cluster.key] += bucket.moodCounts[mId] || 0;
        });
      });

      return {
        stageKey: stKey,
        meta,
        totalDaysLogged: bucket.totalDaysLogged,
        totalMoodLogs: bucket.totalMoodLogs,
        totalSymptomMentions: bucket.totalSymptomMentions,
        rankedMoods,
        rankedSymptoms,
        topMood: rankedMoods[0] || null,
        topSymptom: rankedSymptoms[0] || null,
        entries: bucket.entries,
        clusterCounts,
        moodCounts: bucket.moodCounts,
        symptomCounts: bucket.symptomCounts,
      };
    });

    // Top 4 moods overall
    const topOverallMoods = Object.entries(overallMoodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([mood]) => mood);

    // Top co-occurring Mood + Symptom pairs
    const topCoOccurrences = Object.values(pairCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // Peak Symptom Stage & Peak Positive Energy Stage
    const peakSymptomStage = [...stageSummaries].sort(
      (a, b) => b.totalSymptomMentions - a.totalSymptomMentions
    )[0];
    const peakPositiveStage = [...stageSummaries].sort(
      (a, b) => b.clusterCounts.highPositive - a.clusterCounts.highPositive
    )[0];

    // Build Recharts rows for Mood & Symptom charts
    const chartRows = stageSummaries.map((s) => {
      const row: Record<string, string | number> = {
        stageName: `${s.meta.emoji} ${s.meta.shortLabel}`,
        stageKey: s.stageKey,
        totalLogs: s.totalDaysLogged,
        totalSymptoms: s.totalSymptomMentions,
        highPositive: s.clusterCounts.highPositive,
        calmGrounded: s.clusterCounts.calmGrounded,
        lowEnergyRest: s.clusterCounts.lowEnergyRest,
        highSensitivity: s.clusterCounts.highSensitivity,
      };
      MOOD_CATEGORIES.forEach((m) => {
        row[m.id] = s.moodCounts[m.id] || 0;
      });
      SYMPTOM_ITEMS.forEach((sym) => {
        row[sym.id] = s.symptomCounts[sym.id] || 0;
      });
      return row;
    });

    return {
      stageSummaries,
      totalCheckIns,
      totalSymptomEvents,
      topOverallMoods,
      topCoOccurrences,
      peakSymptomStage,
      peakPositiveStage,
      chartRows,
    };
  }, [userData]);

  const currentStageSummary = correlationData.stageSummaries.find(
    (s) => s.stageKey === currentStageKey
  );

  const filteredEntries = useMemo(() => {
    if (selectedStageFilter === 'ALL') {
      return correlationData.stageSummaries
        .flatMap((s) =>
          s.entries.map((e) => ({
            ...e,
            stageKey: s.stageKey,
            stageMeta: s.meta,
          }))
        )
        .sort((a, b) => (a.dateStr < b.dateStr ? 1 : -1))
        .slice(0, 6);
    }
    const found = correlationData.stageSummaries.find((s) => s.stageKey === selectedStageFilter);
    if (!found) return [];
    return found.entries.slice(0, 6).map((e) => ({
      ...e,
      stageKey: found.stageKey,
      stageMeta: found.meta,
    }));
  }, [correlationData, selectedStageFilter]);

  const topMoodPalette = ['#5639CC', '#E85D75', '#2E6B56', '#D97757'];

  return (
    <section className="bg-white rounded-3xl shadow-xs border border-lavender-200 p-5 sm:p-6">
      {/* Header & Visual Pattern Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-lavender-700 mb-1">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>Cycle Pattern Intelligence</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800">
            Symptom &amp; Mood × Cycle Stage Visual Patterns
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            Analyzes the frequency of specific physical symptoms and moods across Menstruation, Follicular, Ovulation, and Luteal stages to reveal your body&apos;s recurring patterns.
          </p>
        </div>

        {/* 4-Way Visualization Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 bg-cream p-1.5 rounded-2xl border border-slate-200/80 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setVisualMode('heatmap')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              visualMode === 'heatmap'
                ? 'bg-lavender-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-lavender-50'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Pattern Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => setVisualMode('symptoms')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              visualMode === 'symptoms'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-rose-50'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Symptom Frequency</span>
          </button>
          <button
            type="button"
            onClick={() => setVisualMode('spectrum')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              visualMode === 'spectrum'
                ? 'bg-lavender-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-lavender-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Mood Spectrum</span>
          </button>
          <button
            type="button"
            onClick={() => setVisualMode('topMoods')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              visualMode === 'topMoods'
                ? 'bg-lavender-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-lavender-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>Top Moods</span>
          </button>
        </div>
      </div>

      {/* Automated Visual Pattern Insights Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-6">
        {/* Insight 1: Active Stage Spotlight */}
        <div className="rounded-2xl bg-gradient-to-br from-lavender-50 to-white border border-lavender-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-lavender-700 text-white">
              Active Stage Pattern
            </span>
            <span className="text-xs font-bold text-slate-600">
              {currentStageSummary?.meta.emoji} {currentStageSummary?.meta.shortLabel}
            </span>
          </div>
          <p className="text-xs text-slate-800 font-semibold leading-relaxed">
            {currentStageSummary?.topMood || currentStageSummary?.topSymptom ? (
              <>
                In <strong>{currentStageSummary.meta.shortLabel}</strong>, your top mood is{' '}
                <strong className="text-lavender-900">
                  {currentStageSummary.topMood
                    ? `${currentStageSummary.topMood.emoji} ${currentStageSummary.topMood.mood} (${currentStageSummary.topMood.pct}%)`
                    : 'None yet'}
                </strong>{' '}
                and top symptom is{' '}
                <strong className="text-rose-700">
                  {currentStageSummary.topSymptom
                    ? `${currentStageSummary.topSymptom.emoji} ${currentStageSummary.topSymptom.symptom} (${currentStageSummary.topSymptom.pct}%)`
                    : 'Symptom-free ✨'}
                </strong>
                .
              </>
            ) : (
              <>
                Log moods and symptoms during your{' '}
                <strong>{currentStageSummary?.meta.shortLabel}</strong> stage to unlock personalized pattern insights.
              </>
            )}
          </p>
        </div>

        {/* Insight 2: Peak Symptom Burden Window */}
        <div className="rounded-2xl bg-gradient-to-br from-rose-50/80 to-white border border-rose-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-600 text-white">
              Peak Symptom Window
            </span>
            <span className="text-xs font-bold font-mono text-rose-800 tabular-nums">
              {correlationData.totalSymptomEvents} Total Symptoms
            </span>
          </div>
          <p className="text-xs text-slate-800 font-semibold leading-relaxed">
            {correlationData.peakSymptomStage &&
            correlationData.peakSymptomStage.totalSymptomMentions > 0 ? (
              <>
                Physical symptoms cluster highest in{' '}
                <strong className="text-rose-800">
                  {correlationData.peakSymptomStage.meta.emoji}{' '}
                  {correlationData.peakSymptomStage.meta.shortLabel}
                </strong>{' '}
                ({correlationData.peakSymptomStage.totalSymptomMentions} logged), led by{' '}
                <strong>
                  {correlationData.peakSymptomStage.topSymptom?.emoji}{' '}
                  {correlationData.peakSymptomStage.topSymptom?.symptom}
                </strong>
                .
              </>
            ) : (
              'No physical symptoms logged yet — check off symptoms below to track stage correlations.'
            )}
          </p>
        </div>

        {/* Insight 3: Strongest Mood + Symptom Co-Occurrence */}
        <div className="rounded-2xl bg-gradient-to-br from-sage-50/80 to-white border border-sage-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-sage-700 text-white">
              Top Co-Occurring Pair
            </span>
            <Zap className="w-3.5 h-3.5 text-sage-700" />
          </div>
          {correlationData.topCoOccurrences.length > 0 ? (
            <div className="space-y-1">
              {correlationData.topCoOccurrences.slice(0, 2).map((pair, idx) => (
                <div
                  key={`${pair.stageKey}-${pair.mood}-${pair.symptom}-${idx}`}
                  className="text-xs text-slate-800 font-semibold flex items-center justify-between gap-1"
                >
                  <span className="truncate">
                    {getMoodEmoji(pair.mood)} <strong>{pair.mood}</strong> +{' '}
                    {getSymptomEmoji(pair.symptom)} <strong>{pair.symptom}</strong>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-sage-200 text-sage-800 shrink-0">
                    {STAGE_META[pair.stageKey].emoji} {STAGE_META[pair.stageKey].shortLabel} ({pair.count}×)
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-600">
              Log both a mood and a symptom on the same day to spot co-occurring body-mind patterns.
            </p>
          )}
        </div>
      </div>

      {/* 4-Stage Dual Mood & Symptom Pattern Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-6">
        {correlationData.stageSummaries.map((stage) => {
          const isCurrent = stage.stageKey === currentStageKey;
          const isSelectedFilter = selectedStageFilter === stage.stageKey;

          return (
            <div
              key={stage.stageKey}
              onClick={() =>
                setSelectedStageFilter((prev) =>
                  prev === stage.stageKey ? 'ALL' : stage.stageKey
                )
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedStageFilter((prev) =>
                    prev === stage.stageKey ? 'ALL' : stage.stageKey
                  );
                }
              }}
              className={`rounded-2xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                stage.meta.accentBg
              } ${
                isSelectedFilter
                  ? 'border-2 border-slate-900 ring-2 ring-lavender-200 shadow-sm'
                  : isCurrent
                  ? 'border-2 border-lavender-500 shadow-xs'
                  : stage.meta.accentBorder
              }`}
            >
              <div>
                {/* Stage Header */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-lg">{stage.meta.emoji}</span>
                    <div>
                      <h3 className="font-display font-extrabold text-sm text-slate-900 leading-tight">
                        {stage.meta.shortLabel}
                      </h3>
                      <span className="text-[10px] font-bold text-slate-500 block">
                        {stage.meta.daysRange}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {isCurrent && (
                      <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-lavender-700 text-white">
                        Active
                      </span>
                    )}
                    <span className="text-[10px] font-bold font-mono tabular-nums text-slate-600">
                      {stage.totalDaysLogged}d logged
                    </span>
                  </div>
                </div>

                {/* Top Mood + Top Symptom Dual Badges */}
                <div className="space-y-2 mb-3">
                  <div className="bg-white/90 rounded-xl p-2.5 border border-white shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      #1 Dominant Mood
                    </span>
                    {stage.topMood ? (
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-display font-extrabold text-xs sm:text-sm text-slate-900 flex items-center gap-1">
                          <span>{stage.topMood.emoji}</span>
                          <span>{stage.topMood.mood}</span>
                        </span>
                        <span className="text-xs font-extrabold font-mono tabular-nums text-lavender-700">
                          {stage.topMood.pct}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">No mood logged</span>
                    )}
                  </div>

                  <div className="bg-white/90 rounded-xl p-2.5 border border-white shadow-2xs">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      #1 Frequent Symptom
                    </span>
                    {stage.topSymptom ? (
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="font-display font-extrabold text-xs sm:text-sm text-rose-900 flex items-center gap-1">
                          <span>{stage.topSymptom.emoji}</span>
                          <span>{stage.topSymptom.symptom}</span>
                        </span>
                        <span className="text-xs font-extrabold font-mono tabular-nums text-rose-700">
                          {stage.topSymptom.pct}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-sage-700 font-semibold">
                        ✨ Symptom-free stage
                      </span>
                    )}
                  </div>
                </div>

                {/* Frequency Bars for Moods & Symptoms in Stage */}
                <div className="space-y-1.5">
                  {stage.rankedMoods.slice(0, 2).map((m) => (
                    <div key={`m-${m.mood}`} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-slate-700">
                          {m.emoji} {m.mood}
                        </span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {m.count}× ({m.pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white/80 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(m.pct, 8)}%`,
                            backgroundColor: stage.meta.barColor,
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {stage.rankedSymptoms.slice(0, 2).map((sym) => (
                    <div key={`s-${sym.symptom}`} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold text-rose-800">
                          {sym.emoji} {sym.symptom}
                        </span>
                        <span className="font-mono tabular-nums text-rose-700">
                          {sym.count}× ({sym.pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-white/80 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-500 transition-all duration-500"
                          style={{ width: `${Math.max(sym.pct, 8)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] font-bold text-slate-500">
                <span>{isSelectedFilter ? 'Filtered below' : 'Tap to inspect logs'}</span>
                <span>{isSelectedFilter ? '✓ Active' : '→'}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Visual Pattern Area */}
      <div className="rounded-2xl bg-cream border border-slate-200/80 p-4 sm:p-5 mb-5">
        {visualMode === 'heatmap' ? (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-display font-bold text-sm sm:text-base text-slate-800">
                  Symptom &amp; Mood × Cycle Stage Visual Frequency Heatmap
                </h3>
                <p className="text-xs text-slate-500">
                  Color intensity shows how frequently each physical symptom and mood appears in each cycle stage (% of logged days in that stage).
                </p>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-xs bg-slate-100 border border-slate-300 inline-block" />{' '}
                  0%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-xs bg-rose-200 inline-block" /> Low
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" /> High Peak
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 pr-3 w-48">Symptom / Mood</th>
                    {correlationData.stageSummaries.map((st) => (
                      <th key={st.stageKey} className="py-2.5 px-2 text-center">
                        <div className="inline-flex items-center gap-1 text-slate-800">
                          <span>{st.meta.emoji}</span>
                          <span>{st.meta.shortLabel}</span>
                        </div>
                        <span className="block text-[9px] font-mono text-slate-400 font-normal">
                          {st.totalDaysLogged}d logged
                        </span>
                      </th>
                    ))}
                    <th className="py-2.5 pl-3 text-right">Peak Stage Pattern</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 text-xs">
                  {/* Group 1: Physical Symptoms */}
                  <tr className="bg-rose-50/60">
                    <td
                      colSpan={6}
                      className="py-1.5 px-2 text-[10px] font-extrabold uppercase tracking-wider text-rose-800"
                    >
                      🩺 Physical Symptoms Frequency by Stage
                    </td>
                  </tr>
                  {SYMPTOM_ITEMS.map((sym) => {
                    const stageStats = correlationData.stageSummaries.map((st) => {
                      const count = st.symptomCounts[sym.id] || 0;
                      const pct =
                        st.totalDaysLogged > 0
                          ? Math.round((count / st.totalDaysLogged) * 100)
                          : 0;
                      return { stageKey: st.stageKey, meta: st.meta, count, pct };
                    });
                    const maxStat = [...stageStats].sort((a, b) => b.count - a.count)[0];

                    return (
                      <tr key={sym.id} className="hover:bg-white/80 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{sym.emoji}</span>
                          <span>{sym.id}</span>
                        </td>
                        {stageStats.map((cell) => {
                          const alpha =
                            cell.pct > 0 ? Math.max(0.16, Math.min(0.88, cell.pct / 100)) : 0;
                          return (
                            <td key={cell.stageKey} className="py-1.5 px-1.5 text-center">
                              <div
                                className={`rounded-xl py-1.5 px-2 font-mono text-[11px] tabular-nums transition-all ${
                                  cell.count > 0
                                    ? 'font-extrabold text-slate-900 border border-rose-300/80 shadow-2xs'
                                    : 'text-slate-400 bg-white/60 border border-slate-200/50'
                                }`}
                                style={
                                  cell.count > 0
                                    ? {
                                        backgroundColor: `rgba(${cell.meta.heatRgb}, ${alpha})`,
                                      }
                                    : undefined
                                }
                              >
                                {cell.count > 0 ? `${cell.count}× (${cell.pct}%)` : '—'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-2 pl-3 text-right">
                          {maxStat && maxStat.count > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${maxStat.meta.badgeBg}`}
                            >
                              ★ {maxStat.meta.emoji} {maxStat.meta.shortLabel}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Not logged</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {/* Group 2: Moods */}
                  <tr className="bg-lavender-50/60">
                    <td
                      colSpan={6}
                      className="py-1.5 px-2 text-[10px] font-extrabold uppercase tracking-wider text-lavender-900"
                    >
                      🧠 Emotional Moods Frequency by Stage
                    </td>
                  </tr>
                  {MOOD_CATEGORIES.map((m) => {
                    const stageStats = correlationData.stageSummaries.map((st) => {
                      const count = st.moodCounts[m.id] || 0;
                      const pct =
                        st.totalMoodLogs > 0
                          ? Math.round((count / st.totalMoodLogs) * 100)
                          : 0;
                      return { stageKey: st.stageKey, meta: st.meta, count, pct };
                    });
                    const maxStat = [...stageStats].sort((a, b) => b.count - a.count)[0];

                    return (
                      <tr key={m.id} className="hover:bg-white/80 transition-colors">
                        <td className="py-2 pr-3 font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{m.emoji}</span>
                          <span>{m.id}</span>
                        </td>
                        {stageStats.map((cell) => {
                          const alpha =
                            cell.pct > 0 ? Math.max(0.16, Math.min(0.88, cell.pct / 100)) : 0;
                          return (
                            <td key={cell.stageKey} className="py-1.5 px-1.5 text-center">
                              <div
                                className={`rounded-xl py-1.5 px-2 font-mono text-[11px] tabular-nums transition-all ${
                                  cell.count > 0
                                    ? 'font-extrabold text-slate-900 border border-lavender-300/80 shadow-2xs'
                                    : 'text-slate-400 bg-white/60 border border-slate-200/50'
                                }`}
                                style={
                                  cell.count > 0
                                    ? {
                                        backgroundColor: `rgba(${cell.meta.heatRgb}, ${alpha})`,
                                      }
                                    : undefined
                                }
                              >
                                {cell.count > 0 ? `${cell.count}× (${cell.pct}%)` : '—'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-2 pl-3 text-right">
                          {maxStat && maxStat.count > 0 ? (
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md ${maxStat.meta.badgeBg}`}
                            >
                              ★ {maxStat.meta.emoji} {maxStat.meta.shortLabel}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Not logged</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="font-display font-bold text-sm sm:text-base text-slate-800">
                  {visualMode === 'symptoms'
                    ? 'Physical Symptom Frequency Distribution Across Cycle Stages'
                    : visualMode === 'spectrum'
                    ? 'Emotional Energy & Sensitivity Distribution Across Cycle Stages'
                    : 'Most Frequent Individual Moods Logged per Cycle Stage'}
                </h3>
                <p className="text-xs text-slate-500">
                  {visualMode === 'symptoms'
                    ? 'Compares how often Cramps, Bloating, Headache, Breast Tenderness, and Breakouts occur in each stage.'
                    : visualMode === 'spectrum'
                    ? 'Stacked check-ins grouped by emotional energy cluster across Menstruation, Follicular, Ovulation, and Luteal stages.'
                    : 'Direct comparison of your top logged moods across each hormonal stage.'}
                </p>
              </div>
              <span className="text-[11px] font-bold text-lavender-700 bg-lavender-50 border border-lavender-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                Updates live as you log symptoms &amp; moods
              </span>
            </div>

            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                {visualMode === 'symptoms' ? (
                  <BarChart
                    data={correlationData.chartRows}
                    margin={{ top: 10, right: 16, left: -12, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="stageName"
                      tick={{ fill: '#334155', fontSize: 12, fontWeight: 700 }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: 'Symptom Logs',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fill: '#64748B', fontSize: 11, fontWeight: 600 },
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #FECDD3',
                        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontWeight: 600 }}
                    />
                    {SYMPTOM_ITEMS.map((sym) => (
                      <Bar
                        key={sym.id}
                        dataKey={sym.id}
                        name={`${sym.emoji} ${sym.id}`}
                        stackId="symptomStack"
                        fill={SYMPTOM_PALETTE[sym.id] || '#E85D75'}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={54}
                      />
                    ))}
                  </BarChart>
                ) : visualMode === 'spectrum' ? (
                  <BarChart
                    data={correlationData.chartRows}
                    margin={{ top: 10, right: 16, left: -12, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="stageName"
                      tick={{ fill: '#334155', fontSize: 12, fontWeight: 700 }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      label={{
                        value: 'Mood Logs',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fill: '#64748B', fontSize: 11, fontWeight: 600 },
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E9E2FF',
                        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontWeight: 600 }}
                    />
                    {EMOTIONAL_CLUSTERS.map((cluster) => (
                      <Bar
                        key={cluster.key}
                        dataKey={cluster.key}
                        name={cluster.name}
                        stackId="emotionalSpectrum"
                        fill={cluster.color}
                        radius={[4, 4, 0, 0]}
                        maxBarSize={54}
                      />
                    ))}
                  </BarChart>
                ) : (
                  <BarChart
                    data={correlationData.chartRows}
                    margin={{ top: 10, right: 16, left: -12, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="stageName"
                      tick={{ fill: '#334155', fontSize: 12, fontWeight: 700 }}
                      axisLine={{ stroke: '#CBD5E1' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E9E2FF',
                        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
                        fontSize: '12px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '8px', fontWeight: 600 }}
                    />
                    {(correlationData.topOverallMoods.length > 0
                      ? correlationData.topOverallMoods
                      : ['Energized', 'Calm', 'Fatigued', 'Anxious']
                    ).map((moodId, index) => (
                      <Bar
                        key={moodId}
                        dataKey={moodId}
                        name={`${getMoodEmoji(moodId)} ${moodId}`}
                        fill={topMoodPalette[index % topMoodPalette.length]}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={32}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Stage-Filtered Symptom & Mood Check-In Log Explorer */}
      <div className="rounded-2xl bg-lavender-50/50 border border-lavender-100 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-lavender-700" />
            <h3 className="font-display font-bold text-xs sm:text-sm text-slate-800 uppercase tracking-wider">
              {selectedStageFilter === 'ALL'
                ? 'Recent Symptom & Mood Check-Ins by Stage'
                : `Check-Ins Logged in ${STAGE_META[selectedStageFilter].label}`}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedStageFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                selectedStageFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-lavender-50'
              }`}
            >
              All Stages ({correlationData.totalCheckIns})
            </button>
            {STAGE_ORDER.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStageFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  selectedStageFilter === st
                    ? 'bg-lavender-700 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-lavender-50'
                }`}
              >
                {STAGE_META[st].emoji} {STAGE_META[st].shortLabel}
              </button>
            ))}
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <p className="text-xs text-slate-500 italic bg-white rounded-xl p-3 border border-lavender-100">
            No symptom or mood logs recorded for this stage filter yet. Select a date on the calendar and log your mood or symptoms to build your visual pattern history!
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {filteredEntries.map((item) => (
              <div
                key={`${item.dateStr}-${item.mood || 'sym'}`}
                onClick={() => onSelectDate && onSelectDate(item.dateStr)}
                className="bg-white rounded-xl p-3 border border-lavender-100 hover:border-lavender-300 transition-all cursor-pointer flex items-start justify-between gap-2"
                title="Tap to inspect this date"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base">{item.emoji}</span>
                    <span className="font-display font-extrabold text-xs text-slate-900">
                      {item.mood || 'Symptoms Logged'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${item.stageMeta.badgeBg}`}
                    >
                      {item.stageMeta.emoji} {item.stageMeta.shortLabel}
                    </span>
                  </div>
                  {item.symptoms.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {item.symptoms.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200/70"
                        >
                          {getSymptomEmoji(s)} {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.notes && (
                    <p className="text-[11px] text-slate-600 italic line-clamp-1">
                      &ldquo;{item.notes}&rdquo;
                    </p>
                  )}
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-500 shrink-0 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-lavender-600" />
                  {formatShortMonthDay(item.dateStr)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
