import React, { useState, useEffect } from 'react';
import { StageKey, UserData } from '../types';
import { PHASE_ADVISOR_DATA, STAGE_NUTRITION_DATA, CycleSnackSuggestion } from '../constants';
import { formatHumanDate } from '../utils/cycleEngine';

interface NutritionCravingSupportCardProps {
  userData: UserData;
  selectedDateStr: string;
  currentStageKey: StageKey;
  cycleDay: number;
  onToggleSnackForDate: (dateStr: string, snackId: string, snackName: string) => void;
  onSelectCravingForDate: (dateStr: string, cravingLabel: string) => void;
}

const CRAVING_DECODER_OPTIONS: Array<{
  id: string;
  label: string;
  emoji: string;
  bodySignal: string;
  quickSwapByStage: Record<StageKey, string>;
}> = [
  {
    id: 'Chocolate & Sweets',
    label: 'Chocolate & Sweets',
    emoji: '🍫',
    bodySignal: 'Your body is signaling a need for Magnesium & Serotonin precursors.',
    quickSwapByStage: {
      MENSTRUATION: '70%+ Dark Chocolate + Roasted Pumpkin Seeds & Orange Slices (Snack #1)',
      FOLLICULAR: 'Greek Yogurt Parfait with Berries, Chia & Flaxseeds (Snack #1)',
      OVULATION: 'Crisp Apple Slices with Almond Butter & Sunflower Seeds (Snack #1)',
      LUTEAL: 'Walnuts, Dark Chocolate & Tart Cherry / Banana Trail Mix (Snack #2)',
    },
  },
  {
    id: 'Salty & Crunchy',
    label: 'Salty & Crunchy',
    emoji: '🥨',
    bodySignal: 'Aldosterone & progesterone shifts are increasing trace mineral and electrolyte needs.',
    quickSwapByStage: {
      MENSTRUATION: 'Soft-Boiled Eggs with Sea Salt & Baked Plantain Bites (Snack #3)',
      FOLLICULAR: 'Lightly Salted Edamame or Crispy Paprika Chickpeas (Snack #3)',
      OVULATION: 'Garlic Hummus with Cruciferous Veggie Sticks (Snack #2)',
      LUTEAL: 'Roasted Walnuts & Salted Pumpkin/Sunflower Seed Mix (Snack #2)',
    },
  },
  {
    id: 'Carbs & Pastries',
    label: 'Carbs & Pastries',
    emoji: '🥐',
    bodySignal: 'Progesterone or low estrogen is dipping blood glucose—your brain wants slow-release complex carbs + Vitamin B6.',
    quickSwapByStage: {
      MENSTRUATION: 'Warm Spiced Lentil & Black Bean Cup with Avocado (Snack #2)',
      FOLLICULAR: 'Avocado & Sprouted Pumpkin Seed Sourdough Toast (Snack #2)',
      OVULATION: 'Apple Slices with Almond Butter & Fiber-Rich Seeds (Snack #1)',
      LUTEAL: 'Warm Cinnamon Sweet Potato Wedges with Tahini Drizzle (Snack #1)',
    },
  },
  {
    id: 'Warm Comfort Food',
    label: 'Warm Comfort Food',
    emoji: '🍲',
    bodySignal: 'Uterine blood flow and vagus nerve relaxation respond best to warming, anti-inflammatory nutrients.',
    quickSwapByStage: {
      MENSTRUATION: 'Warm Spiced Lentil or Black Bean Bowl with Baby Spinach (Snack #2)',
      FOLLICULAR: 'Toasted Sourdough with Warm Seasoned Chickpeas (Snack #2 & #3)',
      OVULATION: 'Warm Roasted Broccoli & Bell Peppers with Hummus (Snack #2)',
      LUTEAL: 'Spiced Turmeric-Ginger Chia Oats with Sesame Seeds (Snack #3)',
    },
  },
];

export const NutritionCravingSupportCard: React.FC<NutritionCravingSupportCardProps> = ({
  userData,
  selectedDateStr,
  currentStageKey,
  cycleDay,
  onToggleSnackForDate,
  onSelectCravingForDate,
}) => {
  const [selectedStage, setSelectedStage] = useState<StageKey>(currentStageKey);

  // Sync to current cycle stage whenever the user's active cycle stage changes
  useEffect(() => {
    setSelectedStage(currentStageKey);
  }, [currentStageKey]);

  const stageNutrition = STAGE_NUTRITION_DATA[selectedStage];
  const stageAdvisor = PHASE_ADVISOR_DATA[selectedStage];
  const isViewingCurrentStage = selectedStage === currentStageKey;

  const dayLog = userData.dailyLogs[selectedDateStr] || {
    mood: null,
    stageAtLog: null,
    symptoms: [],
    habits: [],
    notes: '',
    waterGlasses: 0,
    loggedSnacks: [],
    cravingLogged: null,
  };

  const loggedSnacksForDay = dayLog.loggedSnacks || [];
  const activeCravingId = dayLog.cravingLogged || null;
  const activeCravingObj = CRAVING_DECODER_OPTIONS.find((c) => c.id === activeCravingId) || null;

  const stageColorStyles: Record<
    StageKey,
    {
      cardBorder: string;
      headerBg: string;
      badgeBg: string;
      accentText: string;
      buttonActive: string;
    }
  > = {
    MENSTRUATION: {
      cardBorder: 'border-rose-200',
      headerBg: 'from-rose-50 via-peach-50/70 to-white',
      badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
      accentText: 'text-rose-800',
      buttonActive: 'bg-rose-600 text-white border-rose-700',
    },
    FOLLICULAR: {
      cardBorder: 'border-sage-200',
      headerBg: 'from-sage-50 via-lavender-50/50 to-white',
      badgeBg: 'bg-sage-100 text-sage-800 border-sage-300',
      accentText: 'text-sage-800',
      buttonActive: 'bg-sage-600 text-white border-sage-700',
    },
    OVULATION: {
      cardBorder: 'border-peach-200',
      headerBg: 'from-peach-50 via-rose-50/50 to-white',
      badgeBg: 'bg-peach-100 text-peach-800 border-peach-300',
      accentText: 'text-peach-800',
      buttonActive: 'bg-peach-600 text-white border-peach-700',
    },
    LUTEAL: {
      cardBorder: 'border-lavender-200',
      headerBg: 'from-lavender-50 via-peach-50/50 to-white',
      badgeBg: 'bg-lavender-100 text-lavender-900 border-lavender-300',
      accentText: 'text-lavender-900',
      buttonActive: 'bg-lavender-700 text-white border-lavender-900',
    },
  };

  const theme = stageColorStyles[selectedStage];

  return (
    <section
      aria-label="Nutrition & Craving Support"
      className={`bg-white rounded-3xl shadow-xs border-2 ${theme.cardBorder} overflow-hidden transition-all`}
    >
      {/* TOP HEADER BANNER */}
      <div className={`bg-gradient-to-r ${theme.headerBg} p-5 sm:p-6 border-b border-slate-100`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-peach-700">
                🥗 Cycle-Synced Fuel
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${theme.badgeBg}`}
              >
                <span>{stageAdvisor.emoji}</span>
                <span>{stageNutrition.focusBadge}</span>
              </span>
              {isViewingCurrentStage && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-slate-900 text-white">
                  🎯 Active Stage (Day {cycleDay})
                </span>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900">
              Nutrition &amp; Craving Support
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 max-w-3xl">
              3 nutrient-dense snacks specifically aligned with your{' '}
              <strong className={theme.accentText}>{stageAdvisor.shortName} Stage</strong> —{' '}
              <span className="font-semibold text-slate-700">{stageNutrition.focusTitle}</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!isViewingCurrentStage && (
              <button
                type="button"
                onClick={() => setSelectedStage(currentStageKey)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition-all cursor-pointer"
              >
                🎯 Sync to My Stage ({PHASE_ADVISOR_DATA[currentStageKey].shortName})
              </button>
            )}
            <div className="bg-white/90 border border-slate-200 rounded-2xl px-3.5 py-2 text-right">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Snacks Logged ({formatHumanDate(selectedDateStr)})
              </span>
              <span className="font-display font-extrabold text-sm text-slate-800 tabular-nums">
                🥗 {loggedSnacksForDay.length} / 3 Nutrient Snacks
              </span>
            </div>
          </div>
        </div>

        {/* STAGE SELECTOR TABS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {(
            [
              { key: 'MENSTRUATION', label: '🩸 Menstruation', sub: 'Iron-Rich & Mg' },
              { key: 'FOLLICULAR', label: '🌱 Follicular', sub: 'Prebiotic & Lignans' },
              { key: 'OVULATION', label: '🌸 Ovulation', sub: 'Antioxidant & DIM' },
              { key: 'LUTEAL', label: '🌙 Luteal', sub: 'Anti-Inflammatory & B6' },
            ] as Array<{ key: StageKey; label: string; sub: string }>
          ).map((tab) => {
            const active = selectedStage === tab.key;
            const isUserCurrent = currentStageKey === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSelectedStage(tab.key)}
                className={`p-2.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-white/80 hover:bg-white text-slate-700 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-extrabold">{tab.label}</span>
                  {isUserCurrent && (
                    <span
                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                        active ? 'bg-gold-500 text-plum-900' : 'bg-lavender-100 text-lavender-800'
                      }`}
                    >
                      Now
                    </span>
                  )}
                </div>
                <span
                  className={`block text-[10px] mt-0.5 font-medium ${
                    active ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {tab.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN BODY: 3 STAGE-ALIGNED NUTRIENT-DENSE SNACKS */}
      <div className="p-5 sm:p-6 space-y-5">
        {/* Hormone & Metabolic Context Strip */}
        <div className="rounded-2xl bg-cream border border-slate-200/80 p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>🧬</span>
              <span>Why {stageAdvisor.shortName} Stage Needs {stageNutrition.focusTitle}:</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {stageNutrition.hormoneNutritionNote}
            </p>
          </div>
          <div className="md:max-w-xs shrink-0 bg-sage-50/90 border border-sage-200 rounded-xl p-3 text-xs text-sage-900">
            <span className="font-extrabold block mb-0.5">💧 Absorption &amp; Hydration Tip:</span>
            <span className="text-[11px] leading-snug block">
              {stageNutrition.hydrationSynergyTip}
            </span>
          </div>
        </div>

        {/* 3 NUTRIENT-DENSE SNACK CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stageNutrition.snacks.map((snack: CycleSnackSuggestion, idx: number) => {
            const isEaten = loggedSnacksForDay.includes(snack.id);
            return (
              <div
                key={snack.id}
                className={`rounded-2xl border-2 p-4 flex flex-col justify-between transition-all ${
                  isEaten
                    ? 'bg-sage-50/70 border-sage-500 shadow-xs'
                    : 'bg-white hover:border-lavender-300 border-slate-200/90'
                }`}
              >
                <div>
                  {/* Top Badge Row */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                      Snack #{idx + 1}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${theme.badgeBg}`}
                    >
                      {snack.categoryBadge}
                    </span>
                  </div>

                  {/* Snack Title & Emoji */}
                  <div className="flex items-start gap-2.5 mb-3">
                    <div className="w-10 h-10 rounded-2xl bg-cream border border-slate-200 flex items-center justify-center text-2xl shrink-0">
                      {snack.emoji}
                    </div>
                    <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 leading-snug">
                      {snack.name}
                    </h3>
                  </div>

                  {/* Key Nutrient Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {snack.keyNutrients.map((nut) => (
                      <span
                        key={nut}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-lavender-50 text-lavender-800 border border-lavender-200/70"
                      >
                        ✦ {nut}
                      </span>
                    ))}
                  </div>

                  {/* Why It Works */}
                  <p className="text-xs text-slate-600 leading-relaxed mb-3">
                    {snack.whyItWorks}
                  </p>

                  {/* Craving Target & Prep Tip */}
                  <div className="space-y-1.5 bg-cream/90 rounded-xl p-2.5 border border-slate-200/60 text-[11px] mb-4">
                    <div className="text-slate-700">
                      <strong className="text-rose-700">🎯 Craving Target:</strong>{' '}
                      {snack.cravingTarget}
                    </div>
                    <div className="text-slate-600">
                      <strong className="text-sage-800">🎒 Campus Tip:</strong> {snack.prepTip}
                    </div>
                  </div>
                </div>

                {/* Log Snack Action Button */}
                <button
                  type="button"
                  onClick={() => onToggleSnackForDate(selectedDateStr, snack.id, snack.name)}
                  className={`w-full py-2.5 px-3 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isEaten
                      ? 'bg-sage-600 hover:bg-sage-700 text-white shadow-2xs'
                      : 'bg-slate-900 hover:bg-lavender-800 text-white'
                  }`}
                >
                  <span>{isEaten ? '✅' : '➕'}</span>
                  <span>
                    {isEaten ? 'Logged in Today’s Fuel (Tap to Undo)' : 'Log This Snack Today'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* INTERACTIVE CRAVING DECODER & INSTANT STAGE SWAP */}
        <div className="rounded-2xl bg-gradient-to-r from-peach-50/90 via-lavender-50/70 to-rose-50/80 border border-peach-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-1.5">
                <span>🍫</span>
                <span>Craving Decoder: What Are You Craving Right Now?</span>
              </h3>
              <p className="text-xs text-slate-600">
                Tap a craving below to decode what your hormones are asking for during{' '}
                <strong>{stageAdvisor.shortName}</strong> and log it for {formatHumanDate(selectedDateStr)}:
              </p>
            </div>
            {activeCravingId && (
              <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-white text-peach-800 border border-peach-300 shrink-0 self-start sm:self-center">
                Logged Craving: {activeCravingId}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CRAVING_DECODER_OPTIONS.map((option) => {
              const isSelected = activeCravingId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectCravingForDate(selectedDateStr, option.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-peach-600 text-white border-peach-700 font-extrabold shadow-xs'
                      : 'bg-white hover:bg-peach-50/80 text-slate-800 border-peach-200 font-bold'
                  }`}
                >
                  <span className="text-lg">{option.emoji}</span>
                  <span className="text-xs leading-tight">{option.label}</span>
                </button>
              );
            })}
          </div>

          {activeCravingObj && (
            <div className="mt-3 bg-white/95 rounded-xl p-3.5 border border-peach-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 text-xs">
                <div className="font-extrabold text-slate-900">
                  {activeCravingObj.emoji} Craving {activeCravingObj.label} in {stageAdvisor.shortName}:
                </div>
                <p className="text-slate-600">{activeCravingObj.bodySignal}</p>
              </div>
              <div className="sm:max-w-sm bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-2 text-xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-sage-800 block">
                  ✨ Best {stageAdvisor.shortName} Nutrient Swap:
                </span>
                <span className="font-bold text-slate-900">
                  {activeCravingObj.quickSwapByStage[selectedStage]}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
