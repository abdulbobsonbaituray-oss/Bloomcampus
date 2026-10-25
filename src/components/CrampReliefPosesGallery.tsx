import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ExternalLink,
  Youtube,
  Sparkles,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface CrampReliefPose {
  id: string;
  number: number;
  name: string;
  sanskritName: string;
  category: 'lower-back' | 'uterine-belly' | 'bed-friendly';
  categoryLabel: string;
  durationSeconds: number;
  durationLabel: string;
  breathPattern: string;
  targetArea: string;
  steps: string[];
  physiologicalBenefit: string;
  dormTip: string;
}

export const CRAMP_RELIEF_POSES_DATA: CrampReliefPose[] = [
  {
    id: 'childs-pose',
    number: 1,
    name: "Child's Pose",
    sanskritName: 'Balasana',
    category: 'lower-back',
    categoryLabel: 'Lower Back & Pelvic Release',
    durationSeconds: 120,
    durationLabel: '2 Mins · 12 Slow Breaths',
    breathPattern: 'Inhale 4s into lower back · Exhale 6s softening hips',
    targetArea: 'Lumbar Spine, Sacrum & Pelvic Floor',
    steps: [
      'Kneel on your bed or yoga mat, bring your big toes together, and widen your knees slightly wider than your hips.',
      'Exhale and fold your torso forward between your thighs, resting your forehead on a pillow or stacked hands.',
      'Reach your arms softly forward or rest them alongside your shins, letting your lower back expand with every inhale.',
    ],
    physiologicalBenefit:
      'Passively lengthens tight lumbar fascia and decompresses sacral nerves where uterine prostaglandin pain radiates.',
    dormTip: 'Place a warm pillow or folded blanket lengthwise under your chest and belly for effortless support in bed.',
  },
  {
    id: 'reclined-butterfly',
    number: 2,
    name: 'Reclined Bound Angle',
    sanskritName: 'Supta Baddha Konasana',
    category: 'uterine-belly',
    categoryLabel: 'Uterine & Pelvic Circulation',
    durationSeconds: 180,
    durationLabel: '3 Mins · Deep Belly Breathing',
    breathPattern: 'Inhale 4s expanding belly · Exhale 6s releasing groin',
    targetArea: 'Uterus, Ovaries, Inner Thighs & Psoas',
    steps: [
      'Lie gently on your back and bring the soles of your feet together so your knees open wide like butterfly wings.',
      'Tuck a pillow or rolled towel underneath each knee so your inner thighs aren’t straining.',
      'Rest one warm hand over your heart and one hand over your lower abdomen, breathing warmth into your pelvis.',
    ],
    physiologicalBenefit:
      'Widens the pelvic bowl and boosts oxygenated blood flow to ischemic uterine smooth muscle, easing cramp spasms.',
    dormTip: 'Pair this pose with a warm water bottle or heating pad resting directly on your lower abdomen.',
  },
  {
    id: 'knees-to-chest',
    number: 3,
    name: 'Knees-to-Chest Hug',
    sanskritName: 'Apanasana',
    category: 'bed-friendly',
    categoryLabel: 'Bed-Friendly Cramp & Bloat Relief',
    durationSeconds: 90,
    durationLabel: '90 Secs · Gentle Side Rock',
    breathPattern: 'Inhale 4s · Exhale 4s drawing knees softly inward',
    targetArea: 'Lower Abdomen, Sacrum & Digestive Tract',
    steps: [
      'Lie flat on your back with your head supported on a soft pillow.',
      'Draw both knees gently toward your chest and clasp your hands around your shins or behind your thighs.',
      'Slowly rock a few inches left and right to massage your sacrum against the mattress while breathing slowly.',
    ],
    physiologicalBenefit:
      'Creates gentle abdominal compression that soothes uterine cramping and releases prostaglandin-triggered gas or bloating.',
    dormTip: 'Easy to do right under your covers when waking up with morning period cramps before class.',
  },
  {
    id: 'cat-cow',
    number: 4,
    name: 'Cat-Cow Pelvic Tilts',
    sanskritName: 'Marjaryasana – Bitilasana',
    category: 'lower-back',
    categoryLabel: 'Dynamic Spinal & Pelvic Flow',
    durationSeconds: 90,
    durationLabel: '90 Secs · 10 Flowing Rounds',
    breathPattern: 'Inhale 4s (Cow Tilt) · Exhale 5s (Cat Arch)',
    targetArea: 'Entire Spine, Uterine Ligaments & Core',
    steps: [
      'Come onto your hands and knees with wrists aligned under shoulders and knees padded under hips.',
      'Inhale (Cow): Gently dip your belly toward the mat, lift your chin slightly, and widen your sit bones.',
      'Exhale (Cat): Press through your palms, round your upper and lower back toward the ceiling, and tuck your tailbone.',
    ],
    physiologicalBenefit:
      'Rhythmically alternates stretch and release across the uterosacral ligaments and lower back erector muscles.',
    dormTip: 'Keep movements slow and fluid—never force the arch if your lower belly feels tender.',
  },
  {
    id: 'supine-twist',
    number: 5,
    name: 'Supine Belly Twist',
    sanskritName: 'Supta Matsyendrasana',
    category: 'uterine-belly',
    categoryLabel: 'Deep Hip & Lumbar Decompression',
    durationSeconds: 120,
    durationLabel: '2 Mins · 60s Per Side',
    breathPattern: 'Inhale 4s lengthening spine · Exhale 6s melting shoulders',
    targetArea: 'Lower Back, Obliques, Glutes & Pelvic Nerves',
    steps: [
      'Lie on your back, bend both knees into your chest, and extend your arms out in a T-shape.',
      'Exhale and let both knees slowly fall together to the left side, resting them on a pillow.',
      'Keep both shoulders heavy on the bed, breathe for 60 seconds, then gently switch to the right side.',
    ],
    physiologicalBenefit:
      'Releases deep rotational tension in the thoracolumbar fascia and stimulates fresh blood flow to abdominal organs on release.',
    dormTip: 'Place a pillow between your knees so your hips and lower back stay aligned and relaxed.',
  },
  {
    id: 'legs-up-wall',
    number: 6,
    name: 'Legs Up the Wall',
    sanskritName: 'Viparita Karani',
    category: 'bed-friendly',
    categoryLabel: 'Restorative Nervous System Reset',
    durationSeconds: 180,
    durationLabel: '3 Mins · Restorative Inversion',
    breathPattern: 'Inhale 4s · Exhale 7s (Parasympathetic Calm)',
    targetArea: 'Pelvic Venous Return, Legs & Vagus Nerve',
    steps: [
      'Sit sideways right next to your dorm wall or bed headboard with a folded blanket under your hips.',
      'Swing your legs up against the wall as you lower your back and head comfortably onto the mattress or floor.',
      'Let your arms rest open by your sides with palms facing up and close your eyes.',
    ],
    physiologicalBenefit:
      'Uses gravity to drain pelvic congestion and heavy leg edema while activating the vagus nerve to lower pain perception.',
    dormTip: 'Swing your legs up against your dorm wall right after lectures to erase both cramps and study fatigue.',
  },
];

export const CRAMP_RELIEF_VIDEO_URL = 'https://youtu.be/Hp-bXOTuQck?si=A_T0dngDLV8ZYBlq';
export const CRAMP_RELIEF_EMBED_URL = 'https://www.youtube.com/embed/Hp-bXOTuQck';

/**
 * Custom animated SVG illustration for each of the 6 cramp-relief yoga poses.
 * Uses smooth CSS keyframe/SMIL-compatible motion and highlights target relief zones.
 */
const PoseIllustrationSVG: React.FC<{ poseId: string; isActiveTimer: boolean }> = ({
  poseId,
  isActiveTimer,
}) => {
  const pulseClass = isActiveTimer ? 'animate-pulse' : '';

  switch (poseId) {
    case 'childs-pose':
      return (
        <svg
          viewBox="0 0 260 150"
          className="w-full h-36 sm:h-40 select-none"
          role="img"
          aria-label="Illustrated Child's Pose showing folded torso and lower back cramp relief glow"
        >
          <defs>
            <radialGradient id="reliefGlow1" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="matGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#C81D77" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3B0944" stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {/* Yoga Mat */}
          <rect x="20" y="122" width="220" height="8" rx="4" fill="url(#matGrad1)" />
          {/* Bolster / Pillow under chest */}
          <ellipse cx="145" cy="114" rx="34" ry="10" fill="#FDE68A" opacity="0.85" />
          {/* Target Relief Glow on Lower Back / Pelvis */}
          <circle cx="88" cy="82" r="32" fill="url(#reliefGlow1)" className="animate-pulse" />
          {/* Animated Breathing Group */}
          <g className={pulseClass}>
            {/* Folded Legs (Thighs & Shins) */}
            <path
              d="M 65 118 Q 52 104 68 95 L 112 115 L 65 120 Z"
              fill="#3B0944"
            />
            {/* Curved Torso & Lower Back */}
            <path
              d="M 66 96 Q 92 64 148 92 L 142 110 Q 98 92 72 112 Z"
              fill="#C81D77"
            />
            {/* Head resting forward */}
            <circle cx="164" cy="98" r="13" fill="#3B0944" />
            {/* Extended Arms */}
            <path
              d="M 145 96 Q 182 108 214 118"
              stroke="#C81D77"
              strokeWidth="8"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          {/* Breath & Relief Callout */}
          <text x="28" y="34" fontSize="10" fontWeight="700" fill="#881337">
            ✨ Lumbar &amp; Pelvic Decompression
          </text>
        </svg>
      );

    case 'reclined-butterfly':
      return (
        <svg
          viewBox="0 0 260 150"
          className="w-full h-36 sm:h-40 select-none"
          role="img"
          aria-label="Illustrated Reclined Bound Angle pose with butterfly knees and pelvic glow"
        >
          <defs>
            <radialGradient id="reliefGlow2" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#EC4899" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#EC4899" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Yoga Mat */}
          <rect x="18" y="122" width="224" height="8" rx="4" fill="#E9D5FF" />
          {/* Head Pillow */}
          <rect x="28" y="108" width="36" height="14" rx="7" fill="#FDE68A" />
          {/* Knee Support Cushions */}
          <ellipse cx="168" cy="112" rx="18" ry="8" fill="#FDE68A" opacity="0.85" />
          {/* Pelvic Warmth Glow */}
          <circle cx="128" cy="98" r="34" fill="url(#reliefGlow2)" className="animate-pulse" />
          <g className={pulseClass}>
            {/* Head */}
            <circle cx="48" cy="98" r="13" fill="#3B0944" />
            {/* Reclined Torso */}
            <path
              d="M 62 102 Q 96 96 130 104 L 130 118 L 62 118 Z"
              fill="#C81D77"
            />
            {/* Butterfly Open Knees (Diamond Perspective) */}
            <path
              d="M 128 108 Q 162 78 198 114 Q 164 122 128 116 Z"
              fill="#3B0944"
            />
            <path
              d="M 128 108 Q 165 92 200 114"
              stroke="#D4AF37"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
            />
            {/* Hand resting on lower belly */}
            <path
              d="M 82 98 Q 108 86 124 102"
              stroke="#F43F5E"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          <text x="28" y="34" fontSize="10" fontWeight="700" fill="#881337">
            🦋 Opens Pelvic Bowl &amp; Uterine Flow
          </text>
        </svg>
      );

    case 'knees-to-chest':
      return (
        <svg
          viewBox="0 0 260 150"
          className="w-full h-36 sm:h-40 select-none"
          role="img"
          aria-label="Illustrated Knees-to-Chest Hug pose massaging lower spine and abdomen"
        >
          <defs>
            <radialGradient id="reliefGlow3" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Mat */}
          <rect x="20" y="122" width="220" height="8" rx="4" fill="#FBCFE8" />
          {/* Head Cushion */}
          <rect x="34" y="110" width="34" height="12" rx="6" fill="#FDE68A" />
          {/* Lower Back & Belly Relief Glow */}
          <circle cx="132" cy="96" r="35" fill="url(#reliefGlow3)" className="animate-pulse" />
          <g className={pulseClass}>
            {/* Head */}
            <circle cx="54" cy="98" r="13" fill="#3B0944" />
            {/* Supine Torso */}
            <rect x="68" y="100" width="68" height="20" rx="10" fill="#C81D77" />
            {/* Bent Thighs & Shins Hugged to Chest */}
            <path
              d="M 130 112 Q 112 72 136 66 Q 166 64 176 94"
              stroke="#3B0944"
              strokeWidth="14"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Arms Hugging Shins */}
            <path
              d="M 88 102 Q 116 68 148 76"
              stroke="#D4AF37"
              strokeWidth="6"
              strokeLinecap="round"
              fill="none"
            />
          </g>
          <text x="28" y="34" fontSize="10" fontWeight="700" fill="#881337">
            🤗 Sacral Massage &amp; Bloat Release
          </text>
        </svg>
      );

    case 'cat-cow':
      return (
        <svg
          viewBox="0 0 260 150"
          className="w-full h-36 sm:h-40 select-none"
          role="img"
          aria-label="Illustrated Cat-Cow pelvic tilt pose showing arched and dipped spine"
        >
          <defs>
            <radialGradient id="reliefGlow4" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#D946EF" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#D946EF" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Mat */}
          <rect x="20" y="124" width="220" height="8" rx="4" fill="#E9D5FF" />
          {/* Spine & Pelvis Glow */}
          <circle cx="126" cy="74" r="36" fill="url(#reliefGlow4)" className="animate-pulse" />
          <g className={pulseClass}>
            {/* Knees & Lower Legs */}
            <path
              d="M 56 122 L 82 122 L 82 78"
              stroke="#3B0944"
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            {/* Rounded Cat Spine */}
            <path
              d="M 82 78 Q 124 44 166 78"
              stroke="#C81D77"
              strokeWidth="14"
              strokeLinecap="round"
              fill="none"
            />
            {/* Dotted Cow Belly Dip Indicator */}
            <path
              d="M 82 78 Q 124 102 166 78"
              stroke="#D4AF37"
              strokeWidth="4"
              strokeDasharray="5 5"
              strokeLinecap="round"
              fill="none"
            />
            {/* Arms Posted on Mat */}
            <line
              x1="166"
              y1="78"
              x2="166"
              y2="122"
              stroke="#3B0944"
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Head */}
            <circle cx="182" cy="82" r="12" fill="#3B0944" />
          </g>
          <text x="28" y="32" fontSize="10" fontWeight="700" fill="#6B21A8">
            🐈 Rhythmic Pelvic &amp; Spinal Wave
          </text>
        </svg>
      );

    case 'supine-twist':
      return (
        <svg
          viewBox="0 0 260 150"
          className="w-full h-36 sm:h-40 select-none"
          role="img"
          aria-label="Illustrated Supine Belly Twist pose decompressing lower back and hips"
        >
          <defs>
            <radialGradient id="reliefGlow5" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Mat */}
          <rect x="20" y="122" width="220" height="8" rx="4" fill="#FCE7F3" />
          {/* Knee Bolster */}
          <ellipse cx="176" cy="112" rx="26" ry="9" fill="#FDE68A" />
          {/* Oblique & Lumbar Glow */}
          <circle cx="126" cy="96" r="34" fill="url(#reliefGlow5)" className="animate-pulse" />
          <g className={pulseClass}>
            {/* Head */}
            <circle cx="52" cy="98" r="13" fill="#3B0944" />
            {/* Outstretched T-Arm */}
            <line
              x1="68"
              y1="108"
              x2="34"
              y2="116"
              stroke="#D4AF37"
              strokeWidth="7"
              strokeLinecap="round"
            />
            {/* Torso */}
            <path
              d="M 66 96 L 132 100 L 128 118 L 66 116 Z"
              fill="#C81D77"
            />
            {/* Twisted Stacked Knees */}
            <path
              d="M 128 106 Q 160 78 186 108 Q 160 120 130 116 Z"
              fill="#3B0944"
            />
          </g>
          <text x="28" y="34" fontSize="10" fontWeight="700" fill="#881337">
            🌀 Gentle Lumbar &amp; Hip Unwind
          </text>
        </svg>
      );

    case 'legs-up-wall':
    default:
      return (
        <svg
          viewBox="0 0 260 150"
          className="w-full h-36 sm:h-40 select-none"
          role="img"
          aria-label="Illustrated Legs Up the Wall pose resting pelvis and elevating legs against wall"
        >
          <defs>
            <radialGradient id="reliefGlow6" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Floor Mat & Wall */}
          <rect x="24" y="122" width="176" height="8" rx="4" fill="#E9D5FF" />
          <rect x="196" y="18" width="10" height="112" rx="4" fill="#CBD5E1" />
          {/* Hips Bolster */}
          <rect x="158" y="110" width="34" height="12" rx="6" fill="#FDE68A" />
          {/* Pelvic Restorative Glow */}
          <circle cx="172" cy="100" r="32" fill="url(#reliefGlow6)" className="animate-pulse" />
          <g className={pulseClass}>
            {/* Head */}
            <circle cx="72" cy="106" r="12" fill="#3B0944" />
            {/* Supine Torso */}
            <rect x="86" y="102" width="88" height="16" rx="8" fill="#C81D77" />
            {/* Vertical Legs Resting Up the Wall */}
            <line
              x1="184"
              y1="108"
              x2="184"
              y2="30"
              stroke="#3B0944"
              strokeWidth="14"
              strokeLinecap="round"
            />
            {/* Downward Circulation Arrows */}
            <path
              d="M 166 44 L 166 78 M 162 72 L 166 78 L 170 72"
              stroke="#059669"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </g>
          <text x="26" y="34" fontSize="10" fontWeight="700" fill="#065F46">
            🦵 Drains Pelvic Congestion &amp; Calms Nerves
          </text>
        </svg>
      );
  }
};

interface CrampReliefPosesGalleryProps {
  defaultExpanded?: boolean;
  onLogCrampReliefSession?: (poseName: string) => void;
}

export const CrampReliefPosesGallery: React.FC<CrampReliefPosesGalleryProps> = ({
  defaultExpanded = false,
  onLogCrampReliefSession,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(defaultExpanded);
  const [activePoseId, setActivePoseId] = useState<string>(CRAMP_RELIEF_POSES_DATA[0].id);
  const [showInlineVideo, setShowInlineVideo] = useState<boolean>(false);

  // Interactive Pose Hold Timer
  const activePoseIndex = Math.max(
    0,
    CRAMP_RELIEF_POSES_DATA.findIndex((p) => p.id === activePoseId)
  );
  const activePose = CRAMP_RELIEF_POSES_DATA[activePoseIndex] || CRAMP_RELIEF_POSES_DATA[0];
  const [secondsLeft, setSecondsLeft] = useState<number>(activePose.durationSeconds);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [completedPoseIds, setCompletedPoseIds] = useState<string[]>([]);

  useEffect(() => {
    setSecondsLeft(activePose.durationSeconds);
    setIsTimerRunning(false);
  }, [activePoseId, activePose.durationSeconds]);

  // Close modal on Escape key
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsTimerRunning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          setCompletedPoseIds((curr) =>
            curr.includes(activePose.id) ? curr : [...curr, activePose.id]
          );
          if (onLogCrampReliefSession) {
            onLogCrampReliefSession(activePose.name);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTimerRunning, activePose.id, activePose.name, onLogCrampReliefSession]);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePrevPose = () => {
    const prevIdx =
      (activePoseIndex - 1 + CRAMP_RELIEF_POSES_DATA.length) % CRAMP_RELIEF_POSES_DATA.length;
    setActivePoseId(CRAMP_RELIEF_POSES_DATA[prevIdx].id);
  };

  const handleNextPose = () => {
    const nextIdx = (activePoseIndex + 1) % CRAMP_RELIEF_POSES_DATA.length;
    setActivePoseId(CRAMP_RELIEF_POSES_DATA[nextIdx].id);
  };

  const breathPhaseLabel = isTimerRunning
    ? secondsLeft % 10 >= 6
      ? '🌬️ Inhale Slowly Into Belly (4s)...'
      : '😮‍💨 Exhale & Soften Pelvic Tension (6s)...'
    : 'Tap Start Timer for guided cramp-relief breathing';

  return (
    <div className="mt-4">
      {/* SINGLE TRIGGER BUTTON UNDER SAVED REFLECTIONS & SELF-AWARENESS */}
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={isModalOpen}
        className="w-full rounded-3xl p-5 sm:p-6 border-2 transition-all cursor-pointer text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md active:scale-[0.99] bg-gradient-to-r from-rose-50 via-peach-50/80 to-lavender-50 hover:from-rose-100 hover:to-lavender-100 text-slate-900 border-rose-300"
      >
        <div className="flex items-start sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-xs border bg-white border-rose-200 text-rose-700">
            🧘‍♀️
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold mb-1 text-rose-800">
              <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-extrabold uppercase tracking-wider">
                Yoga Routine Modal
              </span>
              <span>6 Animated Cramp-Relief Poses</span>
              <span aria-hidden="true">·</span>
              <span>▶️ Cramp Relief Video Inside</span>
            </div>
            <h3 className="font-display font-extrabold text-lg sm:text-xl leading-snug text-slate-900">
              Yoga Routine: Poses to Relieve Period Cramps &amp; Pelvic Tension
            </h3>
            <p className="text-xs sm:text-sm mt-0.5 text-slate-600">
              Tap to launch the interactive Yoga Routine modal with animated poses, breath timer &amp; direct cramp relief video player
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end shrink-0">
          <span className="px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition-all bg-[#3B0944] hover:bg-rose-900 text-[#D4AF37]">
            <span>🧘‍♀️ Open Yoga Routine</span>
          </span>
        </div>
      </button>

      {/* YOGA ROUTINE MODAL */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="yoga-routine-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
              setIsTimerRunning(false);
            }
          }}
        >
          <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl bg-cream border-2 border-rose-200 shadow-2xl flex flex-col">
            {/* Sticky Modal Header */}
            <div className="sticky top-0 z-20 bg-gradient-to-r from-[#3B0944] via-rose-900 to-slate-900 text-white px-5 py-4 sm:px-6 sm:py-4 border-b border-rose-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-white/15 border border-white/25 flex items-center justify-center text-2xl shrink-0">
                  🧘‍♀️
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-[#3B0944]">
                      Guided Yoga Routine
                    </span>
                    <span className="text-xs text-rose-200 font-semibold">
                      {completedPoseIds.length} of {CRAMP_RELIEF_POSES_DATA.length} Poses Completed
                    </span>
                  </div>
                  <h2
                    id="yoga-routine-modal-title"
                    className="font-display font-extrabold text-base sm:text-xl text-white leading-tight mt-0.5"
                  >
                    Period Cramp Relief Yoga Routine &amp; Animated Pose Gallery
                  </h2>
                </div>
              </div>

              {/* Direct Video Play Button + External Link + Close Button */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowInlineVideo((prev) => !prev)}
                  className={`px-3.5 py-2 rounded-xl font-display font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${
                    showInlineVideo
                      ? 'bg-[#D4AF37] text-[#3B0944]'
                      : 'bg-rose-600 hover:bg-rose-500 text-white'
                  }`}
                >
                  <Youtube className="w-4 h-4" />
                  <span>
                    {showInlineVideo ? '▼ Hide Video Player' : '▶️ Play Cramp Relief Video'}
                  </span>
                </button>

                <a
                  href={CRAMP_RELIEF_VIDEO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/25 font-bold text-xs transition-all inline-flex items-center gap-1.5"
                  title="Watch Cramp Relief Video on YouTube"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>YouTube</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsTimerRunning(false);
                  }}
                  aria-label="Close Yoga Routine Modal"
                  className="p-2 rounded-xl bg-white/10 hover:bg-white/25 text-white border border-white/20 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-6">
              {/* Direct Embedded Cramp Relief Video Player (Plays directly inside modal) */}
              {showInlineVideo && (
                <div className="rounded-2xl bg-slate-950 p-3 sm:p-4 border-2 border-rose-300 shadow-lg space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-white">
                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                      <Youtube className="w-4 h-4 text-rose-400" />
                      <span>Guided Period Cramp Relief Yoga Routine Video</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={CRAMP_RELIEF_VIDEO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-[#D4AF37] hover:underline inline-flex items-center gap-1"
                      >
                        <span>Open in YouTube App</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setShowInlineVideo(false)}
                        className="text-xs text-slate-300 hover:text-white px-2 py-0.5 rounded bg-white/10 cursor-pointer"
                      >
                        Close Video
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl overflow-hidden aspect-video w-full max-w-3xl mx-auto bg-black border border-white/15">
                    <iframe
                      src={`${CRAMP_RELIEF_EMBED_URL}&autoplay=1`}
                      title="Guided Yoga Poses to Relieve Period Cramps"
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}

              {/* Active Pose Routine Spotlight (Animated SVG + Timer + Step-by-Step) */}
              <div className="rounded-3xl bg-gradient-to-br from-rose-50/90 via-white to-lavender-50/80 border-2 border-rose-200 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-rose-200/70">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-[#3B0944] text-[#D4AF37] font-display font-extrabold text-xs">
                      Active Pose {activePose.number} of {CRAMP_RELIEF_POSES_DATA.length}
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold text-slate-800">
                      {activePose.name} ({activePose.sanskritName})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handlePrevPose}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-800 border border-rose-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev Pose</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleNextPose}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-800 border border-rose-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>Next Pose</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                  {/* Left: Animated SVG Illustration & Guided Breath Timer */}
                  <div className="lg:col-span-5 bg-white rounded-2xl border border-rose-200 p-3.5 flex flex-col justify-between gap-3 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                      <span className="text-rose-800 font-extrabold">
                        {activePose.categoryLabel}
                      </span>
                      <span className="font-mono text-rose-700 font-extrabold">
                        {activePose.durationLabel}
                      </span>
                    </div>

                    <div className="bg-gradient-to-b from-rose-50/50 to-lavender-50/40 rounded-xl p-2 border border-rose-100">
                      <PoseIllustrationSVG
                        poseId={activePose.id}
                        isActiveTimer={isTimerRunning}
                      />
                    </div>

                    {/* Guided Hold & Breathing Timer Controls */}
                    <div className="rounded-xl bg-cream border border-slate-200/90 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
                            Guided Pose Hold Timer
                          </span>
                          <span className="font-mono font-extrabold text-xl text-slate-900 tabular-nums">
                            {formatTimer(secondsLeft)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setIsTimerRunning((prev) => !prev)}
                            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                              isTimerRunning
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-rose-600 hover:bg-rose-700 text-white'
                            }`}
                          >
                            {isTimerRunning ? (
                              <>
                                <Pause className="w-3.5 h-3.5" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5" />
                                <span>Start Timer</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsTimerRunning(false);
                              setSecondsLeft(activePose.durationSeconds);
                            }}
                            title="Reset Timer"
                            aria-label="Reset Timer"
                            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="text-xs font-bold text-rose-800 bg-rose-50/80 px-2.5 py-1.5 rounded-lg border border-rose-200/60">
                        {breathPhaseLabel}
                      </div>
                    </div>
                  </div>

                  {/* Right: Step-by-Step Instructions, Anatomy Target & Dorm Comfort Tip */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-rose-700">
                          Target Area: {activePose.targetArea}
                        </div>
                        <h3 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 mt-0.5">
                          {activePose.number}. {activePose.name} ({activePose.sanskritName})
                        </h3>
                        <p className="text-xs text-slate-600 font-semibold mt-0.5">
                          🌬️ Breathing Rhythm: {activePose.breathPattern}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCompletedPoseIds((curr) =>
                            curr.includes(activePose.id)
                              ? curr.filter((id) => id !== activePose.id)
                              : [...curr, activePose.id]
                          );
                          if (onLogCrampReliefSession && !completedPoseIds.includes(activePose.id)) {
                            onLogCrampReliefSession(activePose.name);
                          }
                        }}
                        className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-all cursor-pointer ${
                          completedPoseIds.includes(activePose.id)
                            ? 'bg-sage-700 text-white border-sage-800'
                            : 'bg-white hover:bg-sage-50 text-sage-900 border-sage-300'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {completedPoseIds.includes(activePose.id)
                            ? '✓ Practiced Today'
                            : 'Mark Practiced'}
                        </span>
                      </button>
                    </div>

                    <div className="bg-white rounded-2xl p-3.5 border border-rose-200/80 space-y-1.5">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 block">
                        Step-by-Step Alignment
                      </span>
                      <ol className="space-y-1 text-xs sm:text-sm text-slate-700 list-decimal list-inside leading-relaxed">
                        {activePose.steps.map((step, idx) => (
                          <li key={idx} className="font-medium">
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="rounded-2xl bg-sage-50/90 border border-sage-200 p-3 text-xs text-sage-950 leading-relaxed">
                        <strong className="block text-sage-800 uppercase tracking-wider text-[10px] mb-0.5">
                          🧬 Why It Relieves Cramps
                        </strong>
                        {activePose.physiologicalBenefit}
                      </div>
                      <div className="rounded-2xl bg-peach-50/90 border border-peach-200 p-3 text-xs text-slate-800 leading-relaxed">
                        <strong className="block text-peach-800 uppercase tracking-wider text-[10px] mb-0.5">
                          🛏️ Dorm &amp; Bed Comfort Tip
                        </strong>
                        {activePose.dormTip}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Animated Visual Gallery of All 6 Cramp-Relief Yoga Poses */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                      🎨 Animated Cramp-Relief Yoga Pose Gallery (All 6 Poses)
                    </h3>
                    <p className="text-xs text-slate-600">
                      Click any animated pose card below to load its step-by-step guide and start its hold timer above:
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowInlineVideo(true)}
                    className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Youtube className="w-4 h-4 text-rose-600" />
                    <span>▶️ Watch Full Routine Video</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {CRAMP_RELIEF_POSES_DATA.map((pose) => {
                    const isSelected = pose.id === activePoseId;
                    const isDone = completedPoseIds.includes(pose.id);
                    return (
                      <div
                        key={pose.id}
                        onClick={() => setActivePoseId(pose.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActivePoseId(pose.id);
                          }
                        }}
                        className={`rounded-2xl p-3.5 border-2 transition-all cursor-pointer flex flex-col justify-between gap-2.5 text-left ${
                          isSelected
                            ? 'bg-rose-50/90 border-[#3B0944] shadow-md ring-2 ring-[#D4AF37]/50'
                            : 'bg-white hover:bg-rose-50/40 border-rose-200/80 shadow-2xs'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span
                              className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg ${
                                isSelected
                                  ? 'bg-[#3B0944] text-[#D4AF37]'
                                  : 'bg-rose-100 text-rose-900'
                              }`}
                            >
                              Pose {pose.number} · {pose.sanskritName}
                            </span>
                            {isDone ? (
                              <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                                ✓ Practiced
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono font-bold text-slate-500">
                                {Math.floor(pose.durationSeconds / 60)}m hold
                              </span>
                            )}
                          </div>

                          <div className="rounded-xl bg-gradient-to-b from-rose-50/60 to-lavender-50/40 border border-rose-100 p-1.5 mb-2">
                            <PoseIllustrationSVG
                              poseId={pose.id}
                              isActiveTimer={isSelected && isTimerRunning}
                            />
                          </div>

                          <h4 className="font-display font-extrabold text-sm text-slate-900">
                            {pose.name}
                          </h4>
                          <p className="text-[11px] text-rose-800 font-semibold mt-0.5">
                            Target: {pose.targetArea}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-rose-100 flex items-center justify-between text-[11px] font-bold">
                          <span className="text-slate-600">{pose.categoryLabel}</span>
                          <span className="text-rose-700 font-extrabold">
                            {isSelected ? '● Active Pose' : 'Practice Pose →'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
