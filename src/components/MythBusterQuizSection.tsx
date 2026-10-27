import React, { useState } from 'react';
import {
  Sparkles,
  RotateCcw,
  Award,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  ArrowLeft,
  Layers,
  LayoutGrid,
} from 'lucide-react';
import { UserData } from '../types';

export interface MythBusterItem {
  id: string;
  category: string;
  statement: string;
  correctAnswer: 'myth' | 'fact';
  mythHeadline: string;
  factExplanation: string;
  campusTakeaway: string;
}

export const MYTH_BUSTER_QUIZ_ITEMS: MythBusterItem[] = [
  {
    id: 'mb-1',
    category: 'Fertility & Ovulation',
    statement: '"You cannot get pregnant if you have unprotected sex during your period."',
    correctAnswer: 'myth',
    mythHeadline: '❌ MYTH: Period Sex Is 100% Safe From Pregnancy',
    factExplanation:
      '✅ FACT: Sperm can survive inside the reproductive tract for up to 5 days. If you have a shorter cycle (e.g., 21–24 days) or ovulate early, sperm from period sex can still fertilize an egg days later!',
    campusTakeaway:
      'Always check your Fertile Window on the BloomCampus calendar and use protection during any phase if you are avoiding pregnancy.',
  },
  {
    id: 'mb-2',
    category: 'Emergency Contraception',
    statement: '"Taking one Emergency Pill protects you from pregnancy for the rest of the month."',
    correctAnswer: 'myth',
    mythHeadline: '❌ MYTH: One Emergency Pill Covers the Entire Cycle',
    factExplanation:
      '✅ FACT: An emergency contraceptive pill (like Postinor-2 or Plan B) works by delaying ovulation for that single incident only. Unprotected sex later in the same cycle still carries high pregnancy risk.',
    campusTakeaway:
      'Note down the exact date & time in the Emergency Pill Logger above and update your LMP when your next period starts.',
  },
  {
    id: 'mb-3',
    category: 'Clinical Pain & Red Flags',
    statement: '"Extreme period pain that makes you miss college lectures is just normal for women."',
    correctAnswer: 'myth',
    mythHeadline: '❌ MYTH: Missing Class From Severe Cramps Is "Normal"',
    factExplanation:
      '✅ FACT: Debilitating menstrual pain that does not respond to standard care is a clinical red flag for conditions like Endometriosis, Adenomyosis, or Fibroids. You deserve medical evaluation and support.',
    campusTakeaway:
      'Log your pain severity (1–5) and hours in your Daily Check-In and export your Doctor & Clinic Summary PDF for your physician.',
  },
  {
    id: 'mb-4',
    category: 'Hormones & Smartwatch HRV',
    statement: '"If my smartwatch says my HRV recovery is lower before my period, I am losing fitness."',
    correctAnswer: 'myth',
    mythHeadline: '❌ MYTH: Lower Luteal HRV Means You Are Out of Shape',
    factExplanation:
      '✅ FACT: During the Luteal Stage, rising progesterone naturally increases your core body temperature and resting heart rate while lowering Heart Rate Variability (HRV). It is healthy hormone physiology—not lost fitness!',
    campusTakeaway:
      'Swap high-strain workouts for restorative walks, yoga poses, and extra hydration during your late Luteal days.',
  },
  {
    id: 'mb-5',
    category: 'Hormonal Contraception & Brain',
    statement: '"Hormonal birth control pills have zero effect on mood, energy, or attraction."',
    correctAnswer: 'myth',
    mythHeadline: '❌ MYTH: Synthetic Hormones Only Affect the Uterus',
    factExplanation:
      '✅ FACT: Clinical research (including Dr. Sarah Hill’s studies) shows synthetic progestins suppress the natural ovulatory estrogen surge and lower free testosterone, which can noticeably shift mood, stress response, and energy.',
    campusTakeaway:
      'Track your daily mood and stage patterns in BloomCampus so you have objective data on how your body feels each week.',
  },
  {
    id: 'mb-6',
    category: 'Sidratu Skincare & Luteal Sebum',
    statement: '"Pre-period breakouts happen because progesterone stimulates oil (sebum) production in your pores."',
    correctAnswer: 'fact',
    mythHeadline: '✅ FACT: Luteal Progesterone Ramps Up Sebum Production',
    factExplanation:
      '✅ FACT: After ovulation, rising progesterone stimulates sebaceous glands, making skin oilier and pores more prone to congestion—which is why hormonal breakouts peak 5–7 days before bleeding starts.',
    campusTakeaway:
      'Book an Anti-Dark Spot or Hormonal Acne consultation at Sidratu Beauty Therapy Skin Care (101 Jomo Kenyatta Rd, Freetown).',
  },
  {
    id: 'mb-7',
    category: 'Study Sync & Follicular Estrogen',
    statement: '"Your brain’s verbal memory and focus for learning new material peak as estrogen rises in the Follicular & Ovulation stages."',
    correctAnswer: 'fact',
    mythHeadline: '✅ FACT: Rising Estrogen Boosts Synaptic Energy & Verbal Recall',
    factExplanation:
      '✅ FACT: Estrogen increases hippocampal connectivity and dopamine/serotonin activity during the Follicular and Ovulation phases, making it an ideal biological window for tackling complex coursework and presentations.',
    campusTakeaway:
      'Use the Study & Exam Sync Planner to schedule heavy exam prep during your high-estrogen Follicular days.',
  },
];

const BADGE_TARGET_CORRECT = 5;

interface MythBusterQuizSectionProps {
  userData: UserData;
  onUpdateUser: (updater: (prev: UserData) => UserData) => void;
  onOpenBadgesModal?: () => void;
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const MythBusterQuizSection: React.FC<MythBusterQuizSectionProps> = ({
  userData,
  onUpdateUser,
  onOpenBadgesModal,
  showToast,
}) => {
  const [viewMode, setViewMode] = useState<'deck' | 'grid'>('deck');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [flippedMap, setFlippedMap] = useState<Record<string, boolean>>({});
  const [sessionGuesses, setSessionGuesses] = useState<
    Record<string, 'myth' | 'fact' | 'tap_reveal'>
  >({});

  const correctIds = Array.isArray(userData.mythBusterCorrectIds)
    ? userData.mythBusterCorrectIds
    : [];
  const attemptsMap = userData.mythBusterAttempts || {};
  const correctCount = correctIds.length;
  const isBadgeUnlocked =
    correctCount >= BADGE_TARGET_CORRECT ||
    Boolean(userData.unlockedBadges && userData.unlockedBadges['myth-buster']);
  const progressPercent = Math.min(100, Math.round((correctCount / BADGE_TARGET_CORRECT) * 100));

  const currentItem = MYTH_BUSTER_QUIZ_ITEMS[activeIndex] || MYTH_BUSTER_QUIZ_ITEMS[0];

  const handleGuessOrTapReveal = (
    item: MythBusterItem,
    userChoice: 'myth' | 'fact' | 'tap_reveal'
  ) => {
    const isAlreadyFlipped = Boolean(flippedMap[item.id]);
    if (userChoice === 'tap_reveal' && isAlreadyFlipped) {
      // Flip back to front
      setFlippedMap((prev) => ({ ...prev, [item.id]: false }));
      return;
    }

    // Flip card to reveal the back fact face
    setFlippedMap((prev) => ({ ...prev, [item.id]: true }));
    setSessionGuesses((prev) => ({ ...prev, [item.id]: userChoice }));

    // Determine if guess counts as a correct bust:
    // Either the user explicitly chose the right answer ('myth' or 'fact'),
    // OR they tapped the myth directly to bust & reveal the fact!
    const isCorrect =
      userChoice === 'tap_reveal' ? true : userChoice === item.correctAnswer;

    const alreadyCorrect = correctIds.includes(item.id);
    const nextCorrectIds =
      isCorrect && !alreadyCorrect ? [...correctIds, item.id] : correctIds;
    const nextCorrectCount = nextCorrectIds.length;
    const justUnlockedBadge =
      !isBadgeUnlocked && nextCorrectCount >= BADGE_TARGET_CORRECT;

    const nowIso = new Date().toISOString();

    onUpdateUser((prev) => {
      const prevCorrect = Array.isArray(prev.mythBusterCorrectIds)
        ? prev.mythBusterCorrectIds
        : [];
      const mergedCorrect =
        isCorrect && !prevCorrect.includes(item.id)
          ? [...prevCorrect, item.id]
          : prevCorrect;
      const nextBadges = { ...(prev.unlockedBadges || {}) };
      if (mergedCorrect.length >= BADGE_TARGET_CORRECT && !nextBadges['myth-buster']) {
        nextBadges['myth-buster'] = nowIso;
      }
      return {
        ...prev,
        mythBusterCorrectIds: mergedCorrect,
        mythBusterAttempts: {
          ...(prev.mythBusterAttempts || {}),
          [item.id]: isCorrect ? 'correct' : 'incorrect',
        },
        unlockedBadges: nextBadges,
      };
    });

    if (justUnlockedBadge) {
      showToast(
        '🏅 Badge Unlocked: "Myth Buster"! You mastered 5 Campus Myths vs. Facts!',
        'success'
      );
    } else if (userChoice === 'tap_reveal') {
      showToast(
        !alreadyCorrect
          ? `💡 Myth Flipped & Fact Revealed! (+1 Myth Buster Progress: ${nextCorrectCount}/${BADGE_TARGET_CORRECT})`
          : '💡 Flipped card to reveal the clinical Fact!',
        'info'
      );
    } else if (isCorrect) {
      showToast(
        `🎉 Spot on! That statement is a ${item.correctAnswer.toUpperCase()}! (${nextCorrectCount}/${BADGE_TARGET_CORRECT} toward Myth Buster Badge)`,
        'success'
      );
    } else {
      showToast(
        `💡 Plot twist: That statement is actually a ${item.correctAnswer.toUpperCase()}! Check the flipped card for the clinical truth.`,
        'warning'
      );
    }
  };

  const handleResetQuizCards = () => {
    setFlippedMap({});
    setSessionGuesses({});
    setActiveIndex(0);
    showToast('🔄 All Myth Buster cards flipped back to front — ready for a fresh round!', 'info');
  };

  const renderFlipCard = (item: MythBusterItem, indexLabel: string, compact = false) => {
    const isFlipped = Boolean(flippedMap[item.id]);
    const isMastered = correctIds.includes(item.id);
    const attemptStatus = attemptsMap[item.id];
    const lastChoice = sessionGuesses[item.id];
    const wasCorrectGuess =
      lastChoice === 'tap_reveal'
        ? true
        : lastChoice
        ? lastChoice === item.correctAnswer
        : attemptStatus === 'correct';

    return (
      <div
        key={item.id}
        className="w-full myth-flip-scene"
      >
        <div
          className={`myth-flip-card-inner ${isFlipped ? 'is-flipped' : ''} ${
            compact ? 'min-h-[300px]' : 'min-h-[310px] sm:min-h-[290px]'
          }`}
        >
          {/* ================= FRONT FACE (MYTH / STATEMENT TO BUST) ================= */}
          <div
            onClick={() => {
              if (!isFlipped) {
                handleGuessOrTapReveal(item, 'tap_reveal');
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Myth Buster Card ${indexLabel}: ${item.statement}. Tap to flip and reveal fact.`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleGuessOrTapReveal(item, 'tap_reveal');
              }
            }}
            className={`myth-flip-card-face rounded-3xl p-5 sm:p-6 border-2 flex flex-col justify-between gap-4 cursor-pointer transition-shadow hover:shadow-lg ${
              isMastered
                ? 'bg-gradient-to-br from-white via-lavender-50/70 to-emerald-50/60 border-emerald-300 shadow-xs'
                : 'bg-gradient-to-br from-white via-lavender-50/80 to-rose-50/60 border-lavender-300 shadow-xs'
            }`}
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-slate-600 font-bold">
                  <span className="text-lavender-800 font-extrabold">{indexLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{item.category}</span>
                </div>
                <span className="text-[11px] font-extrabold text-lavender-700 flex items-center gap-1">
                  {isMastered ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-800">Busted ✓</span>
                    </>
                  ) : (
                    <>
                      <HelpCircle className="w-3.5 h-3.5 text-lavender-600" />
                      <span>Tap Myth or Guess Below to Flip</span>
                    </>
                  )}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-white/95 border border-lavender-200 shadow-2xs">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 mb-1">
                  🗣️ Campus Statement — Myth or Fact?
                </div>
                <p className="font-display font-extrabold text-sm sm:text-base md:text-lg text-slate-900 leading-snug">
                  {item.statement}
                </p>
              </div>
            </div>

            <div
              className="space-y-2.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleGuessOrTapReveal(item, 'myth')}
                  className="py-2.5 px-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-display font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>Guess: ❌ MYTH</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleGuessOrTapReveal(item, 'fact')}
                  className="py-2.5 px-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-display font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Guess: ✅ FACT</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleGuessOrTapReveal(item, 'tap_reveal')}
                className="w-full py-2 px-3 rounded-xl bg-lavender-100/90 hover:bg-lavender-200/90 text-lavender-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <span>🔄 Tap to Flip Card &amp; Reveal Clinical Fact</span>
              </button>
            </div>
          </div>

          {/* ================= BACK FACE (ANIMATED FLIP REVEAL OF FACT) ================= */}
          <div
            onClick={() => setFlippedMap((prev) => ({ ...prev, [item.id]: false }))}
            role="button"
            tabIndex={0}
            aria-label={`Fact Revealed for ${indexLabel}: ${item.factExplanation}. Tap to flip back.`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setFlippedMap((prev) => ({ ...prev, [item.id]: false }));
              }
            }}
            className="myth-flip-card-back rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-plum-900 via-lavender-900 to-slate-900 text-white border-2 border-gold-500 shadow-xl flex flex-col justify-between gap-3 cursor-pointer overflow-y-auto"
          >
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span
                  className={`font-extrabold uppercase tracking-wider ${
                    wasCorrectGuess ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {lastChoice === 'tap_reveal'
                    ? '✨ Fact Revealed (+1 Myth Buster Point)'
                    : wasCorrectGuess
                    ? '🎉 Correct Guess! (+1 Myth Buster Point)'
                    : `💡 Good Try! Answer: ${item.correctAnswer.toUpperCase()}`}
                </span>
                <span className="text-[11px] font-bold text-lavender-200">
                  {indexLabel} · {item.category}
                </span>
              </div>

              <h4 className="font-display font-extrabold text-sm sm:text-base text-gold-400">
                {item.mythHeadline}
              </h4>

              <p className="text-xs sm:text-sm text-white/95 leading-relaxed bg-white/10 rounded-2xl p-3 border border-white/15">
                {item.factExplanation}
              </p>

              <div className="text-[11px] sm:text-xs text-emerald-200 font-medium">
                <strong className="text-gold-400">🎓 Campus Action Tip:</strong>{' '}
                {item.campusTakeaway}
              </div>
            </div>

            <div
              className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/15"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setFlippedMap((prev) => ({ ...prev, [item.id]: false }))}
                className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Flip Back to Myth</span>
              </button>

              {viewMode === 'deck' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveIndex((prev) => (prev + 1) % MYTH_BUSTER_QUIZ_ITEMS.length);
                  }}
                  className="px-4 py-2 rounded-xl bg-gold-500 hover:bg-amber-400 text-plum-900 font-display font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span>Next Myth Card</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-3xl bg-gradient-to-br from-lavender-50/90 via-cream to-rose-50/70 border-2 border-lavender-200 p-4 sm:p-6 space-y-5 shadow-xs">
      {/* Header & Scoreboard */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-lavender-800">
            <span>🧠 Interactive Campus Myth Buster Quiz</span>
            <span aria-hidden="true">·</span>
            <span>3D Flip Fact Reveal</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-800">
              {correctCount}/{MYTH_BUSTER_QUIZ_ITEMS.length} Myths Busted
            </span>
          </div>
          <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 flex items-center gap-2">
            <span>Campus Myth vs. Fact — Interactive Flip Quiz</span>
          </h3>
          <p className="text-xs sm:text-sm text-slate-600">
            Tap any myth card (or guess <strong>❌ MYTH</strong> vs. <strong>✅ FACT</strong>) to flip the card in 3D and reveal the clinical truth. Bust <strong>{BADGE_TARGET_CORRECT} myths</strong> to unlock the <strong>🏅 Myth Buster Badge</strong>!
          </p>
        </div>

        {/* Mode Switcher & Reset */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex p-1 rounded-xl bg-white border border-lavender-200">
            <button
              type="button"
              onClick={() => setViewMode('deck')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'deck'
                  ? 'bg-lavender-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Flip Deck ({activeIndex + 1}/{MYTH_BUSTER_QUIZ_ITEMS.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-lavender-700 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>All {MYTH_BUSTER_QUIZ_ITEMS.length} Cards</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetQuizCards}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
            title="Flip all cards back to the front"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Flip</span>
          </button>
        </div>
      </div>

      {/* Myth Buster Badge Progress & Reward Banner */}
      <div
        className={`rounded-2xl p-4 border transition-all ${
          isBadgeUnlocked
            ? 'bg-gradient-to-r from-plum-900 via-lavender-900 to-emerald-900 text-white border-gold-500 shadow-md'
            : 'bg-white border-lavender-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 border ${
                isBadgeUnlocked
                  ? 'bg-gold-500 text-plum-900 border-amber-300 shadow-sm'
                  : 'bg-lavender-100 text-lavender-800 border-lavender-200'
              }`}
            >
              {isBadgeUnlocked ? '🏅' : '🧠'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`font-display font-extrabold text-sm sm:text-base ${
                    isBadgeUnlocked ? 'text-gold-400' : 'text-slate-900'
                  }`}
                >
                  {isBadgeUnlocked
                    ? '🎉 "Myth Buster" Badge Unlocked!'
                    : `Myth Buster Badge Progress: ${Math.min(
                        BADGE_TARGET_CORRECT,
                        correctCount
                      )} / ${BADGE_TARGET_CORRECT} Correct`}
                </span>
                <span
                  className={`text-xs font-bold ${
                    isBadgeUnlocked ? 'text-emerald-300' : 'text-slate-500'
                  }`}
                >
                  · Total Score: {correctCount}/{MYTH_BUSTER_QUIZ_ITEMS.length}
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 ${
                  isBadgeUnlocked ? 'text-lavender-100' : 'text-slate-600'
                }`}
              >
                {isBadgeUnlocked
                  ? 'You earned the official Myth Buster badge for mastering campus reproductive & hormonal facts!'
                  : `Get ${Math.max(
                      0,
                      BADGE_TARGET_CORRECT - correctCount
                    )} more correct ${
                      BADGE_TARGET_CORRECT - correctCount === 1 ? 'guess' : 'guesses'
                    } (or tap cards to bust myths) to unlock your Myth Buster badge!`}
              </p>
            </div>
          </div>

          {onOpenBadgesModal && (
            <button
              type="button"
              onClick={onOpenBadgesModal}
              className={`px-3.5 py-2 rounded-xl font-display font-extrabold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition-all ${
                isBadgeUnlocked
                  ? 'bg-gold-500 hover:bg-amber-400 text-plum-900 shadow-xs'
                  : 'bg-lavender-100 hover:bg-lavender-200 text-lavender-900'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>{isBadgeUnlocked ? 'View Myth Buster Badge' : 'Badge Showcase'}</span>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mt-3 w-full h-2.5 rounded-full bg-slate-200/80 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isBadgeUnlocked
                ? 'bg-gradient-to-r from-gold-400 via-amber-400 to-emerald-400'
                : 'bg-gradient-to-r from-lavender-600 to-rose-500'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* QUIZ DECK VIEW OR ALL-CARDS GRID VIEW */}
      {viewMode === 'deck' ? (
        <div className="space-y-4">
          {/* Card Selector Dots / Numbers */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {MYTH_BUSTER_QUIZ_ITEMS.map((item, idx) => {
                const isDone = correctIds.includes(item.id);
                const isCurr = idx === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`w-8 h-8 rounded-xl font-mono font-extrabold text-xs flex items-center justify-center transition-all cursor-pointer border ${
                      isCurr
                        ? 'bg-plum-900 text-gold-400 border-plum-900 shadow-xs scale-105'
                        : isDone
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-lavender-50'
                    }`}
                    title={`Jump to Myth Card #${idx + 1}`}
                  >
                    {isDone ? '✓' : idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setActiveIndex(
                    (prev) =>
                      (prev - 1 + MYTH_BUSTER_QUIZ_ITEMS.length) %
                      MYTH_BUSTER_QUIZ_ITEMS.length
                  )
                }
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setActiveIndex((prev) => (prev + 1) % MYTH_BUSTER_QUIZ_ITEMS.length)
                }
                className="px-3.5 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-800 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Active 3D Flip Card */}
          {renderFlipCard(
            currentItem,
            `Card ${activeIndex + 1} of ${MYTH_BUSTER_QUIZ_ITEMS.length}`,
            false
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MYTH_BUSTER_QUIZ_ITEMS.map((item, idx) =>
            renderFlipCard(item, `Card #${idx + 1}`, true)
          )}
        </div>
      )}
    </div>
  );
};
