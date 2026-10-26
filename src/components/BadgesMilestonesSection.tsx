import React, { useState, useMemo } from 'react';
import {
  Award,
  Flame,
  CalendarCheck2,
  Droplets,
  Sparkles,
  BookOpenCheck,
  Compass,
  Trophy,
  CheckCircle2,
  Lock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { UserData } from '../types';
import { diffDays, getSortedPeriods } from '../utils/cycleEngine';
import { CoreNavSection } from './BottomNavBar';

export interface BadgeMilestone {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: 'Streak' | 'Cycle' | 'Wellness' | 'Mindfulness';
  emoji: string;
  currentValue: number;
  targetValue: number;
  unitLabel: string;
  isUnlocked: boolean;
  unlockedAtIso?: string;
  actionLabel: string;
  targetSection: CoreNavSection;
  accentColor: 'amber' | 'rose' | 'lavender' | 'sage' | 'sky';
}

export interface BadgeEvaluationResult {
  badges: BadgeMilestone[];
  unlockedCount: number;
  totalCount: number;
  currentStreakDays: number;
  longestStreakDays: number;
  consecutiveCyclesCount: number;
  totalLoggedDays: number;
  masteryPercent: number;
}

function hasMeaningfulDailyLog(entry: UserData['dailyLogs'][string] | undefined): boolean {
  if (!entry) return false;
  return Boolean(
    entry.mood ||
      (entry.symptoms && entry.symptoms.length > 0) ||
      (entry.habits && entry.habits.length > 0) ||
      (entry.notes && entry.notes.trim().length > 0) ||
      (entry.waterGlasses && entry.waterGlasses > 0) ||
      (entry.loggedSnacks && entry.loggedSnacks.length > 0) ||
      entry.cravingLogged
  );
}

export function evaluateUserBadges(userData: UserData): BadgeEvaluationResult {
  const dailyLogs = userData.dailyLogs || {};
  const activeDates = Object.keys(dailyLogs)
    .filter((dStr) => /^\d{4}-\d{2}-\d{2}$/.test(dStr) && hasMeaningfulDailyLog(dailyLogs[dStr]))
    .sort();

  // Compute longest consecutive daily streak and current consecutive streak
  let longestStreakDays = 0;
  let runningStreak = 0;

  for (let i = 0; i < activeDates.length; i++) {
    if (i === 0) {
      runningStreak = 1;
    } else {
      const gap = diffDays(activeDates[i - 1], activeDates[i]);
      if (gap === 1) {
        runningStreak += 1;
      } else if (gap > 1) {
        runningStreak = 1;
      }
    }
    if (runningStreak > longestStreakDays) {
      longestStreakDays = runningStreak;
    }
  }

  // Compute latest streak ending on the most recent logged date
  let currentStreakDays = 0;
  if (activeDates.length > 0) {
    currentStreakDays = 1;
    for (let i = activeDates.length - 1; i > 0; i--) {
      const gap = diffDays(activeDates[i - 1], activeDates[i]);
      if (gap === 1) {
        currentStreakDays += 1;
      } else {
        break;
      }
    }
  }

  const effectiveBestStreak = Math.max(longestStreakDays, currentStreakDays);

  // Compute consecutive cycles logged
  const sortedPeriods = getSortedPeriods(userData.periods || []);
  let longestConsecutiveCycles = sortedPeriods.length > 0 ? 1 : 0;
  let runningCycles = sortedPeriods.length > 0 ? 1 : 0;

  for (let i = 1; i < sortedPeriods.length; i++) {
    const cycleGap = diffDays(sortedPeriods[i - 1].startDate, sortedPeriods[i].startDate);
    // Consecutive cycles typically fall within 15 to 50 days of each other
    if (cycleGap >= 15 && cycleGap <= 50) {
      runningCycles += 1;
    } else {
      runningCycles = 1;
    }
    if (runningCycles > longestConsecutiveCycles) {
      longestConsecutiveCycles = runningCycles;
    }
  }

  const totalPeriodsCount = sortedPeriods.length;
  const consecutiveCyclesCount = Math.max(longestConsecutiveCycles, Math.min(totalPeriodsCount, 1));

  // Hydration days (6+ glasses)
  const hydrationHeroDays = activeDates.filter(
    (d) => (dailyLogs[d]?.waterGlasses || 0) >= 6
  ).length;

  // Distinct cycle stages with logged moods
  const stagesLoggedSet = new Set<string>();
  activeDates.forEach((d) => {
    const st = dailyLogs[d]?.stageAtLog;
    if (st) {
      stagesLoggedSet.add(st.toUpperCase());
    }
  });
  const distinctStagesCount = Math.min(4, stagesLoggedSet.size);

  // Journal reflections count
  const journalCount = (userData.journalEntries || []).length;

  // Myth Buster correct guesses count
  const mythBusterCorrectCount = Array.isArray(userData.mythBusterCorrectIds)
    ? userData.mythBusterCorrectIds.length
    : 0;

  // First check-in (any period or daily log)
  const firstCheckInProgress = activeDates.length > 0 || totalPeriodsCount > 0 ? 1 : 0;

  const unlockedMap = userData.unlockedBadges || {};

  const badges: BadgeMilestone[] = [
    {
      id: 'myth-buster',
      title: 'Myth Buster',
      subtitle: '5 Campus Myths & Facts Mastered',
      description:
        'Test your campus reproductive & hormonal science knowledge in the interactive Myth Buster Quiz and get 5 correct guesses!',
      category: 'Mindfulness',
      emoji: '🧠',
      currentValue: Math.min(5, mythBusterCorrectCount),
      targetValue: 5,
      unitLabel: 'correct guesses',
      isUnlocked: mythBusterCorrectCount >= 5 || Boolean(unlockedMap['myth-buster']),
      unlockedAtIso: unlockedMap['myth-buster'],
      actionLabel: 'Play Myth Buster Quiz',
      targetSection: 'guide',
      accentColor: 'lavender',
    },
    {
      id: 'streak-7',
      title: '1-Week Streak',
      subtitle: '7 Consecutive Days Logged',
      description:
        'Log your mood, symptoms, hydration, or daily wins for 7 consecutive days without missing a beat.',
      category: 'Streak',
      emoji: '🔥',
      currentValue: Math.min(7, effectiveBestStreak),
      targetValue: 7,
      unitLabel: 'consecutive days',
      isUnlocked: effectiveBestStreak >= 7 || Boolean(unlockedMap['streak-7']),
      unlockedAtIso: unlockedMap['streak-7'],
      actionLabel: 'Log Today’s Check-In',
      targetSection: 'checkin',
      accentColor: 'amber',
    },
    {
      id: 'cycle-master',
      title: 'Cycle Master',
      subtitle: '3 Consecutive Cycles Logged',
      description:
        'Record 3 consecutive menstrual cycles so BloomCampus can lock in your personal ovulation and rhythm patterns.',
      category: 'Cycle',
      emoji: '👑',
      currentValue: Math.min(3, consecutiveCyclesCount),
      targetValue: 3,
      unitLabel: 'consecutive cycles',
      isUnlocked: consecutiveCyclesCount >= 3 || Boolean(unlockedMap['cycle-master']),
      unlockedAtIso: unlockedMap['cycle-master'],
      actionLabel: 'Log Period Dates',
      targetSection: 'tracker',
      accentColor: 'rose',
    },
    {
      id: 'streak-3',
      title: '3-Day Momentum',
      subtitle: '3 Consecutive Days Logged',
      description:
        'Build your campus wellness habit by checking in with your body for 3 days in a row.',
      category: 'Streak',
      emoji: '⚡',
      currentValue: Math.min(3, effectiveBestStreak),
      targetValue: 3,
      unitLabel: 'consecutive days',
      isUnlocked: effectiveBestStreak >= 3 || Boolean(unlockedMap['streak-3']),
      unlockedAtIso: unlockedMap['streak-3'],
      actionLabel: 'Keep Streak Going',
      targetSection: 'checkin',
      accentColor: 'amber',
    },
    {
      id: 'first-checkin',
      title: 'First Bloom',
      subtitle: 'First Cycle or Daily Check-In',
      description:
        'Start your body-literacy journey by logging your first period start date or daily mood check-in.',
      category: 'Cycle',
      emoji: '🌸',
      currentValue: firstCheckInProgress,
      targetValue: 1,
      unitLabel: 'check-in',
      isUnlocked: firstCheckInProgress >= 1 || Boolean(unlockedMap['first-checkin']),
      unlockedAtIso: unlockedMap['first-checkin'],
      actionLabel: 'Start Tracking',
      targetSection: 'tracker',
      accentColor: 'rose',
    },
    {
      id: 'cycle-historian',
      title: '6-Month Historian',
      subtitle: '6 Menstrual Cycles Logged',
      description:
        'Track 6 full cycles across the semester to unlock clinical-grade 6-month trend insights.',
      category: 'Cycle',
      emoji: '📊',
      currentValue: Math.min(6, totalPeriodsCount),
      targetValue: 6,
      unitLabel: 'cycles logged',
      isUnlocked: totalPeriodsCount >= 6 || Boolean(unlockedMap['cycle-historian']),
      unlockedAtIso: unlockedMap['cycle-historian'],
      actionLabel: 'View 6-Mo Trends',
      targetSection: 'analytics',
      accentColor: 'lavender',
    },
    {
      id: 'hydration-hero',
      title: 'Hydration Hero',
      subtitle: '5 Days of 6+ Water Glasses',
      description:
        'Reach at least 6 glasses (1.5L) of water on 5 different days to fight cramps, bloating, and study fatigue.',
      category: 'Wellness',
      emoji: '💧',
      currentValue: Math.min(5, hydrationHeroDays),
      targetValue: 5,
      unitLabel: 'hydrated days',
      isUnlocked: hydrationHeroDays >= 5 || Boolean(unlockedMap['hydration-hero']),
      unlockedAtIso: unlockedMap['hydration-hero'],
      actionLabel: 'Log Water Glasses',
      targetSection: 'analytics',
      accentColor: 'sky',
    },
    {
      id: 'phase-mindful',
      title: 'Four-Phase Explorer',
      subtitle: 'Mood Logged in All 4 Stages',
      description:
        'Check in with your mood across Menstruation, Follicular, Ovulation, and Luteal stages.',
      category: 'Mindfulness',
      emoji: '🧭',
      currentValue: distinctStagesCount,
      targetValue: 4,
      unitLabel: 'cycle stages',
      isUnlocked: distinctStagesCount >= 4 || Boolean(unlockedMap['phase-mindful']),
      unlockedAtIso: unlockedMap['phase-mindful'],
      actionLabel: 'Log Today’s Mood',
      targetSection: 'checkin',
      accentColor: 'lavender',
    },
    {
      id: 'journal-scholar',
      title: 'Reflection Scholar',
      subtitle: '2+ Cycle Journal Reflections',
      description:
        'Write at least 2 personal reflections in your Cycle-Stage Journal Prompts to track your emotional growth.',
      category: 'Mindfulness',
      emoji: '📓',
      currentValue: Math.min(2, journalCount),
      targetValue: 2,
      unitLabel: 'reflections',
      isUnlocked: journalCount >= 2 || Boolean(unlockedMap['journal-scholar']),
      unlockedAtIso: unlockedMap['journal-scholar'],
      actionLabel: 'Write Reflection',
      targetSection: 'checkin',
      accentColor: 'sage',
    },
  ];

  const unlockedCount = badges.filter((b) => b.isUnlocked).length;
  const totalCount = badges.length;
  const masteryPercent = Math.round((unlockedCount / totalCount) * 100);

  return {
    badges,
    unlockedCount,
    totalCount,
    currentStreakDays: effectiveBestStreak,
    longestStreakDays: effectiveBestStreak,
    consecutiveCyclesCount,
    totalLoggedDays: activeDates.length,
    masteryPercent,
  };
}

interface BadgesMilestonesSectionProps {
  userData: UserData;
  onNavigateSection: (section: CoreNavSection, subAction?: 'hydration' | 'trends') => void;
  onSimulateStreakDemo?: () => void;
  defaultExpanded?: boolean;
}

export const BadgesMilestonesSection: React.FC<BadgesMilestonesSectionProps> = ({
  userData,
  onNavigateSection,
  onSimulateStreakDemo,
  defaultExpanded = false,
}) => {
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  const evaluation = useMemo(() => evaluateUserBadges(userData), [userData]);

  const filteredBadges = useMemo(() => {
    if (filter === 'unlocked') {
      return evaluation.badges.filter((b) => b.isUnlocked);
    }
    if (filter === 'locked') {
      return evaluation.badges.filter((b) => !b.isUnlocked);
    }
    return evaluation.badges;
  }, [evaluation.badges, filter]);

  const getBadgeCategoryIcon = (category: BadgeMilestone['category']) => {
    switch (category) {
      case 'Streak':
        return <Flame className="w-3.5 h-3.5 text-amber-500" />;
      case 'Cycle':
        return <CalendarCheck2 className="w-3.5 h-3.5 text-rose-500" />;
      case 'Wellness':
        return <Droplets className="w-3.5 h-3.5 text-sky-500" />;
      case 'Mindfulness':
        return <BookOpenCheck className="w-3.5 h-3.5 text-lavender-600" />;
    }
  };

  return (
    <section
      id="badges-milestones-section"
      className="bg-white rounded-3xl shadow-xs border-2 border-amber-200/90 p-5 sm:p-6 space-y-5 transition-all duration-300"
    >
      {/* Top Hero Banner & Interactive Button for Consistency Badges & Cycle Mastery */}
      <div className="rounded-3xl bg-gradient-to-r from-plum-900 via-lavender-900 to-rose-900 text-white p-5 sm:p-6 shadow-md border border-gold-500/40">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500 text-plum-900 text-[11px] font-extrabold uppercase tracking-wider">
                <Trophy className="w-3.5 h-3.5" />
                <span>Virtual Milestones &amp; Rewards</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-amber-200 text-[11px] font-bold tabular-nums">
                🏅 {evaluation.unlockedCount} of {evaluation.totalCount} Badges Unlocked ({evaluation.masteryPercent}%)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              className="group text-left font-display font-extrabold text-xl sm:text-2xl text-white hover:text-amber-300 transition-colors flex flex-wrap items-center gap-2.5 cursor-pointer"
            >
              <span>Consistency Badges &amp; Cycle Mastery</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/15 group-hover:bg-white/25 text-amber-200 text-xs font-extrabold border border-white/20">
                {isExpanded ? (
                  <>
                    <span>Hide Badges</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>Open Badges</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </span>
            </button>

            <p className="text-xs sm:text-sm text-lavender-100 max-w-2xl">
              Tap the button to view or tuck away your <strong>1-Week Streak</strong>,{' '}
              <strong>Cycle Master</strong>, and wellness consistency rewards.
            </p>
          </div>

          {/* 3 Live Streak & Cycle Counters + Toggle Button */}
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 px-3.5 py-2.5 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center justify-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Best Streak</span>
                </div>
                <div className="font-display font-extrabold text-lg sm:text-xl text-white tabular-nums mt-0.5">
                  {evaluation.currentStreakDays}d
                </div>
                <div className="text-[10px] text-lavender-200 font-semibold">
                  {evaluation.currentStreakDays >= 7 ? '🔥 1-Week Unlocked!' : 'Target: 7d'}
                </div>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 px-3.5 py-2.5 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-200 flex items-center justify-center gap-1">
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  <span>Cycles</span>
                </div>
                <div className="font-display font-extrabold text-lg sm:text-xl text-white tabular-nums mt-0.5">
                  {evaluation.consecutiveCyclesCount}
                </div>
                <div className="text-[10px] text-lavender-200 font-semibold">
                  {evaluation.consecutiveCyclesCount >= 3 ? '👑 Cycle Master!' : 'Target: 3'}
                </div>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 px-3.5 py-2.5 text-center">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200 flex items-center justify-center gap-1">
                  <Award className="w-3.5 h-3.5" />
                  <span>Unlocked</span>
                </div>
                <div className="font-display font-extrabold text-lg sm:text-xl text-emerald-300 tabular-nums mt-0.5">
                  {evaluation.unlockedCount}/{evaluation.totalCount}
                </div>
                <div className="text-[10px] text-lavender-200 font-semibold">
                  {evaluation.totalLoggedDays} days logged
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              aria-expanded={isExpanded}
              className={`px-4 py-3 rounded-2xl font-display font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 border-2 ${
                isExpanded
                  ? 'bg-white/15 hover:bg-white/25 text-white border-white/30'
                  : 'bg-gold-500 hover:bg-amber-400 text-plum-900 border-white'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>
                {isExpanded
                  ? 'Hide Consistency Badges ▲'
                  : `Consistency Badges & Cycle Mastery (${evaluation.unlockedCount}/${evaluation.totalCount}) ▼`}
              </span>
            </button>
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="mt-4 pt-3.5 border-t border-white/15">
          <div className="flex items-center justify-between text-xs font-bold text-lavender-100 mb-1.5">
            <span>Overall Milestone Mastery</span>
            <span className="tabular-nums text-amber-300">{evaluation.masteryPercent}% Complete</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 via-gold-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max(6, evaluation.masteryPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Collapsible Filter Bar & Badges Grid */}
      {isExpanded && (
        <div className="space-y-5 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-cream rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  filter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Badges ({evaluation.totalCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('unlocked')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  filter === 'unlocked'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unlocked ({evaluation.unlockedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('locked')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  filter === 'locked'
                    ? 'bg-lavender-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                In Progress ({evaluation.totalCount - evaluation.unlockedCount})
              </button>
            </div>

            {onSimulateStreakDemo && (
              <button
                type="button"
                onClick={onSimulateStreakDemo}
                className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Boost Sample 7-Day Streak &amp; 3 Cycles</span>
              </button>
            )}
          </div>

          {/* Badges Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {filteredBadges.map((badge) => {
          const pct = Math.min(100, Math.round((badge.currentValue / badge.targetValue) * 100));

          return (
            <div
              key={badge.id}
              className={`rounded-2xl p-4 border-2 flex flex-col justify-between gap-3 transition-all ${
                badge.isUnlocked
                  ? 'bg-gradient-to-br from-amber-50/90 via-white to-lavender-50/60 border-amber-300 shadow-xs'
                  : 'bg-cream/60 border-slate-200/90 opacity-95'
              }`}
            >
              <div className="space-y-2.5">
                {/* Top Row: Emoji Medallion + Status Pill */}
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border shadow-2xs shrink-0 ${
                      badge.isUnlocked
                        ? 'bg-gradient-to-tr from-amber-100 to-rose-100 border-amber-300'
                        : 'bg-slate-100 border-slate-200 grayscale opacity-75'
                    }`}
                  >
                    <span>{badge.emoji}</span>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {badge.isUnlocked ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Unlocked</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                        <Lock className="w-3 h-3" />
                        <span>In Progress</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      {getBadgeCategoryIcon(badge.category)}
                      <span>{badge.category}</span>
                    </span>
                  </div>
                </div>

                {/* Title & Description */}
                <div>
                  <h3 className="font-display font-extrabold text-base text-slate-900 leading-snug">
                    {badge.title}
                  </h3>
                  <div className="text-[11px] font-bold text-lavender-700 mt-0.5">
                    {badge.subtitle}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed mt-1.5">
                    {badge.description}
                  </p>
                </div>
              </div>

              {/* Bottom Progress Bar & Action Button */}
              <div className="pt-2 border-t border-slate-200/70 space-y-2.5">
                <div>
                  <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                    <span className="text-slate-600 tabular-nums">
                      {badge.currentValue} / {badge.targetValue} {badge.unitLabel}
                    </span>
                    <span
                      className={`tabular-nums ${
                        badge.isUnlocked ? 'text-emerald-700 font-extrabold' : 'text-lavender-700'
                      }`}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        badge.isUnlocked
                          ? 'bg-gradient-to-r from-amber-500 to-emerald-500'
                          : 'bg-lavender-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (badge.id === 'hydration-hero') {
                      onNavigateSection('analytics', 'hydration');
                    } else if (badge.id === 'cycle-historian') {
                      onNavigateSection('analytics', 'trends');
                    } else {
                      onNavigateSection(badge.targetSection);
                    }
                  }}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-between transition-all cursor-pointer ${
                    badge.isUnlocked
                      ? 'bg-amber-100/80 hover:bg-amber-200/80 text-amber-950 border border-amber-300'
                      : 'bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200'
                  }`}
                >
                  <span>{badge.isUnlocked ? '✨ View Tracker' : badge.actionLabel}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
          </div>
        </div>
      )}
    </section>
  );
};
