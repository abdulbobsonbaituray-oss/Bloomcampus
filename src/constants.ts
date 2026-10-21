import { StageKey } from './types';

export const STORAGE_USERS_KEY = 'bloomcampus_users_v1';
export const STORAGE_SESSION_KEY = 'bloomcampus_current_user_v1';
export const STORAGE_ADMIN_CONFIG_KEY = 'bloomcampus_admin_config_v1';
export const STORAGE_ADMIN_SESSION_KEY = 'bloomcampus_admin_session_v1';
export const STORAGE_THEME_KEY = 'bloomcampus_theme_mode_v1';
export const STORAGE_LMP_MEMORY_KEY = 'bloomcampus_lmp_memory_v1';

export const OWNER_ADMIN_EMAIL = 'abdulbobsonbaituray@gmail.com';
export const DEFAULT_ADMIN_PASSWORD = '@Haizen565.';
export const DEFAULT_FREE_ACCESS_PASSWORD = 'Bobson@565';
export const SECRET_VIP_PASSWORDS = ['Bobson@565', 'Bobson@565.'];
export const FREE_TRIAL_DAYS = 14; // 2 Weeks Free Access

export const CREATOR_NAME = 'ABDUL BOBSON TURAY';
export const CREATOR_EMAIL = 'abdulbobsonbaituray@gmail.com';

export const MOOD_CATEGORIES = [
  { id: 'Energized', emoji: '⚡', tone: 'positive' },
  { id: 'Calm',      emoji: '🌿', tone: 'positive' },
  { id: 'Focused',   emoji: '🎯', tone: 'positive' },
  { id: 'Creative',  emoji: '🎨', tone: 'positive' },
  { id: 'Irritable', emoji: '😤', tone: 'challenge' },
  { id: 'Fatigued',  emoji: '🥱', tone: 'challenge' },
  { id: 'Sad',       emoji: '😢', tone: 'challenge' },
  { id: 'Anxious',   emoji: '😰', tone: 'challenge' },
  { id: 'Numb',      emoji: '😶‍🌫️', tone: 'challenge' },
];

export const SYMPTOM_ITEMS = [
  { id: 'Mild Cramps',       emoji: '🌸', redFlag: false },
  { id: 'Severe Pain',       emoji: '🚨', redFlag: true },
  { id: 'Headache',          emoji: '🤕', redFlag: false },
  { id: 'Bloating',          emoji: '🎈', redFlag: false },
  { id: 'Breast Tenderness', emoji: '💗', redFlag: false },
  { id: 'Acne / Breakout',   emoji: '✨', redFlag: false },
];

export const HABIT_ITEMS = [
  { id: 'Slept 7+ Hours',      emoji: '😴' },
  { id: 'Hydrated',            emoji: '💧' },
  { id: 'Moved My Body',       emoji: '🏃‍♀️' },
  { id: 'Ate Something Green', emoji: '🥦' },
];

export const PHASE_ADVISOR_DATA: Record<
  StageKey,
  {
    name: string;
    shortName: string;
    emoji: string;
    bannerGradient: string;
    hormoneSummary: string;
    pregnancy: string;
    body: string;
    mind: string;
    study: string;
    craving: string;
    skincareSync: string;
  }
> = {
  MENSTRUATION: {
    name: 'MENSTRUATION STAGE',
    shortName: 'Menstruation',
    emoji: '🩸',
    bannerGradient: 'from-rose-900 via-rose-700 to-lavender-900',
    hormoneSummary: 'Estrogen & Progesterone at Lowest Baselines',
    pregnancy:
      '🤰 Pregnancy Risk is LOWEST right now. Your uterine lining is shedding, making conception biologically very unlikely.',
    body: '💪 Energy is typically lower as iron and blood loss occur. Prioritize warm fluids, gentle stretching, and adequate rest. Smartwatch HRV might dip slightly.',
    mind: '🧠 Reflective and inward-focused. Emotional processing is high; give yourself grace if your social battery is drained.',
    study:
      '📚 Great time for low-stress tasks like organizing notes, reviewing flashcards in bed, or proofreading. Avoid pulling all-nighters.',
    craving:
      '🍫 Craving chocolate or sweets? Your body is asking for magnesium to relax uterine muscles (opt for dark chocolate, nuts, or bananas). Add iron-rich foods (eggs, beans, leafy greens, meat) with Vitamin C to fight period fatigue.',
    skincareSync:
      '✨ Skin barrier is more sensitive and dry as estrogen is low. Skip harsh exfoliants and focus on soothing hydration or a gentle Calming Facial at Sidratu.',
  },
  FOLLICULAR: {
    name: 'FOLLICULAR STAGE',
    shortName: 'Follicular',
    emoji: '🌱',
    bannerGradient: 'from-sage-800 via-sage-600 to-lavender-700',
    hormoneSummary: 'Estrogen Rising Steadily',
    pregnancy:
      '🤰 Pregnancy Risk INCREASES day by day as estrogen rises and an egg matures inside the ovary.',
    body: '💪 Energy is climbing fast! Stamina is building, making this an ideal window for cardio, running, and fitness goals.',
    mind: '🧠 Optimism and social energy return. Brain fog lifts as neurotransmitters respond to rising estrogen.',
    study:
      '📚 Peak time for heavy memorization, starting big research papers, learning complex math/science concepts, and brainstorming.',
    craving:
      '🥗 Your metabolism is steady and efficient. Focus on fresh vegetables, vibrant fruits, and healthy proteins to sustain your rising energy.',
    skincareSync:
      '✨ Rising estrogen boosts collagen and natural glow! Best window for active treatments like PRP Therapy, Chemical Peels, or Anti-Dark Spot sessions.',
  },
  OVULATION: {
    name: 'OVULATION STAGE',
    shortName: 'Ovulation',
    emoji: '🌸',
    bannerGradient: 'from-peach-700 via-rose-600 to-lavender-700',
    hormoneSummary: 'Estrogen Peaking & LH Surge',
    pregnancy:
      '⚠️ PEAK PREGNANCY RISK: Highest chance of conceiving quickly right now. Sperm can survive up to 5 days.',
    body: '💪 Peak physical power, coordination, and strength! Your body is primed for high-intensity workouts and weight lifting.',
    mind: '🧠 High confidence, sharp verbal skills, and vibrant social magnetism. You feel talkative and outgoing.',
    study:
      '📚 Perfect window for group projects, class presentations, public speaking, and leading team discussions.',
    craving:
      '💧 Energy is at its absolute maximum. Keep hydrated with water and fresh juices to support natural metabolic peak.',
    skincareSync:
      '✨ Skin looks plump and radiant, though oil production starts rising near peak LH. Double-cleanse after campus classes and wear lightweight SPF.',
  },
  LUTEAL: {
    name: 'LUTEAL STAGE',
    shortName: 'Luteal',
    emoji: '🌙',
    bannerGradient: 'from-lavender-900 via-lavender-700 to-peach-700',
    hormoneSummary: 'Progesterone Dominant then Declining',
    pregnancy:
      '🤰 Pregnancy Risk decreases after ovulation, dropping to near zero just before your period starts.',
    body: '💪 Progesterone raises your core body temperature and resting heart rate while lowering HRV. Fatigue is normal as your body works hard.',
    mind: '🧠 Nesting instinct is high. You might feel more sensitive, introspective, or easily overwhelmed by social noise.',
    study:
      '📚 Good for deep focus on independent tasks or editing. If brain fog hits, take short movement breaks in your dorm.',
    craving:
      '🍪 Progesterone naturally triggers carb and sugar cravings. Choose complex carbs (oats, sweet potatoes) and magnesium snacks to stay balanced.',
    skincareSync:
      '✨ Progesterone increases sebum (oil) and pore congestion, triggering pre-period breakouts. Ideal time for Acne & Hormonal Breakout Control at Sidratu.',
  },
};

export const CAMPUS_MYTHS = [
  {
    myth: '❌ MYTH: "You cannot get pregnant if you have unprotected sex during your period."',
    fact: '✅ FACT: Sperm can live inside the reproductive tract for up to 5 days. If you have a shorter cycle or ovulate early, sperm from period sex can still fertilize the egg!',
  },
  {
    myth: '❌ MYTH: "Taking one Emergency Pill protects you for the rest of the month."',
    fact: '✅ FACT: An emergency pill only works to delay ovulation for that single incident. If you have unprotected sex again later in the same cycle, you can still get pregnant.',
  },
  {
    myth: '❌ MYTH: "Extreme period pain that makes you miss class is just normal for women."',
    fact: '✅ FACT: Debilitating pain is a clinical red flag for conditions like Endometriosis or Adenomyosis. You deserve medical support—never let anyone dismiss severe pain.',
  },
  {
    myth: '❌ MYTH: "If my smartwatch says my HRV recovery is poor before my period, I\'m out of shape."',
    fact: '✅ FACT: During the Luteal Stage, progesterone naturally raises your resting heart rate and lowers HRV. It\'s healthy hormone physiology, not lost fitness!',
  },
  {
    myth: '❌ MYTH: "Hormonal birth control pills have zero effect on mood or attraction."',
    fact: '✅ FACT: As Dr. Sarah Hill\'s research shows, synthetic progestin pauses the ovulation estrogen surge and lowers free testosterone, which can shift mood, energy, and attraction.',
  },
];

export const SIDRATU_TREATMENTS = [
  'PRP (Platelet-Rich Plasma) Therapy',
  'Deep Cleansing & Glow Facial Treatment',
  'Anti-Dark Spot & Hyperpigmentation Treatment',
  'Stretch Marks Reduction Therapy',
  'Skin Tag & Blemish Removal',
  'Hormonal Acne & Breakout Control',
  'Gentle Chemical Peel & Skin Renewal',
  'Body Contouring & Weight Loss Support',
  'Laser Skin Rejuvenation',
  'Dental Clinic Whitening & Aesthetics',
  'Holistic Dermatology & Skincare Consultation',
];

export const SKINCARE_GOALS: Record<
  string,
  {
    label: string;
    recommendedTreatments: string[];
    routineTip: string;
    bestCycleStage: string;
  }
> = {
  'Even Skin Tone & Clear Dark Spots': {
    label: 'Even Skin Tone & Clear Dark Spots',
    recommendedTreatments: [
      'Anti-Dark Spot & Hyperpigmentation Treatment',
      'Deep Cleansing & Glow Facial Treatment',
      'Gentle Chemical Peel & Skin Renewal',
    ],
    routineTip:
      'Pair daily broad-spectrum SPF 50 with targeted brightening serums. Schedule fading treatments during your Follicular Stage when skin regeneration is fastest.',
    bestCycleStage: 'Follicular Stage (Days 6–11)',
  },
  'Stop Hormonal Luteal Breakouts': {
    label: 'Stop Hormonal Luteal Breakouts',
    recommendedTreatments: [
      'Hormonal Acne & Breakout Control',
      'Deep Cleansing & Glow Facial Treatment',
    ],
    routineTip:
      'Progesterone spikes oil production 7–10 days before your period. Switch to salicylic acid or niacinamide in your Luteal Stage and avoid heavy oils.',
    bestCycleStage: 'Early Luteal Stage (Days 17–22)',
  },
  'Skin Rejuvenation & Collagen Glow': {
    label: 'Skin Rejuvenation & Collagen Glow',
    recommendedTreatments: [
      'PRP (Platelet-Rich Plasma) Therapy',
      'Laser Skin Rejuvenation',
      'Deep Cleansing & Glow Facial Treatment',
    ],
    routineTip:
      'PRP uses your body’s natural growth factors to boost collagen and heal acne scars. Best scheduled right after your period ends.',
    bestCycleStage: 'Follicular or Ovulation Stage',
  },
  'Stretch Marks & Body Confidence': {
    label: 'Stretch Marks & Body Confidence',
    recommendedTreatments: [
      'Stretch Marks Reduction Therapy',
      'Body Contouring & Weight Loss Support',
      'PRP (Platelet-Rich Plasma) Therapy',
    ],
    routineTip:
      'Consistent collagen remodeling sessions combined with hydration and protein intake during your high-energy Follicular phase deliver the smoothest results.',
    bestCycleStage: 'Follicular Stage (Days 6–11)',
  },
  'Smooth Skin Tags & Smile Aesthetics': {
    label: 'Smooth Skin Tags & Smile Aesthetics',
    recommendedTreatments: [
      'Skin Tag & Blemish Removal',
      'Dental Clinic Whitening & Aesthetics',
      'Holistic Dermatology & Skincare Consultation',
    ],
    routineTip:
      'Avoid scheduling minor skin tag procedures during Menstruation when pain sensitivity is higher—opt for your Follicular window.',
    bestCycleStage: 'Follicular Stage (Days 6–11)',
  },
};

export interface CycleSnackSuggestion {
  id: string;
  name: string;
  emoji: string;
  categoryBadge: string;
  keyNutrients: string[];
  whyItWorks: string;
  cravingTarget: string;
  prepTip: string;
}

export interface StageNutritionSupport {
  stageKey: StageKey;
  stageLabel: string;
  focusTitle: string;
  focusBadge: string;
  hormoneNutritionNote: string;
  hydrationSynergyTip: string;
  snacks: [CycleSnackSuggestion, CycleSnackSuggestion, CycleSnackSuggestion];
}

export const STAGE_NUTRITION_DATA: Record<StageKey, StageNutritionSupport> = {
  MENSTRUATION: {
    stageKey: 'MENSTRUATION',
    stageLabel: 'Menstruation (Days 1–5)',
    focusTitle: 'Iron-Rich & Muscle-Soothing Snacks',
    focusBadge: '🩸 Iron Replenishment & Cramp Relief',
    hormoneNutritionNote:
      'During menstruation, blood loss lowers ferritin/iron stores while prostaglandins trigger uterine contractions. Pairing iron-rich foods with Vitamin C boosts iron absorption by up to 3x, and magnesium relaxes smooth muscle cramps.',
    hydrationSynergyTip:
      'Sip warm ginger or hibiscus tea alongside iron snacks—avoid heavy coffee/black tea within 45 minutes of iron-rich meals as tannins can reduce iron absorption.',
    snacks: [
      {
        id: 'menstruation-snack-1',
        name: 'Roasted Pumpkin Seeds, 70%+ Dark Chocolate & Orange Slices',
        emoji: '🍫',
        categoryBadge: 'Iron + Magnesium + Vit C',
        keyNutrients: ['Non-Heme Iron', 'Magnesium', 'Vitamin C', 'Zinc'],
        whyItWorks:
          'Replenishes iron lost during bleeding while citrus Vitamin C triples iron absorption and magnesium calms uterine muscle cramps.',
        cravingTarget: 'Satisfies intense chocolate & sweet cravings without a blood sugar crash',
        prepTip: 'Keep a small jar of pumpkin seeds & dark chocolate squares in your campus bag.',
      },
      {
        id: 'menstruation-snack-2',
        name: 'Warm Spiced Lentil or Black Bean Cup with Baby Spinach & Avocado',
        emoji: '🥣',
        categoryBadge: 'Iron-Rich & Warming',
        keyNutrients: ['Heme/Plant Iron', 'Folate (Vitamin B9)', 'Potassium', 'Healthy Fats'],
        whyItWorks:
          'Restores red blood cell oxygenation to fight period fatigue and brain fog when estrogen and progesterone are at their lowest baseline.',
        cravingTarget: 'Curbs salty, warm comfort-food cravings during heavy flow days',
        prepTip: 'Squeeze fresh lime juice on top right before eating to unlock maximum iron uptake.',
      },
      {
        id: 'menstruation-snack-3',
        name: 'Soft-Boiled Eggs with Baked Plantain or Oat Bites & Ginger Tea',
        emoji: '🥚',
        categoryBadge: 'Bioavailable Iron & Anti-Cramp',
        keyNutrients: ['Bioavailable Iron', 'Vitamin B12', 'Choline', 'Gingerols'],
        whyItWorks:
          'Provides highly absorbable iron and B12 for cellular energy while ginger compounds naturally inhibit pain-causing prostaglandins.',
        cravingTarget: 'Soothes savory & starchy comfort cravings between classes',
        prepTip: 'Prep 2 boiled eggs in the morning with a pinch of sea salt for quick dorm fuel.',
      },
    ],
  },
  FOLLICULAR: {
    stageKey: 'FOLLICULAR',
    stageLabel: 'Follicular (Days 6–11)',
    focusTitle: 'Estrogen-Balancing & Prebiotic Energy Snacks',
    focusBadge: '🌱 Follicle Fuel & Gut-Hormone Support',
    hormoneNutritionNote:
      'As estrogen steadily climbs and an ovarian follicle matures, your insulin sensitivity is high. Prebiotic fibers, phytoestrogens (flax/pumpkin seeds), and lean proteins fuel neurotransmitters and steady academic stamina.',
    hydrationSynergyTip:
      'Infuse your water bottle with lemon and cucumber to support gentle liver & gut clearance as estrogen rises.',
    snacks: [
      {
        id: 'follicular-snack-1',
        name: 'Greek Yogurt Parfait with Ground Flaxseeds, Chia & Fresh Berries',
        emoji: '🫐',
        categoryBadge: 'Probiotic + Phytoestrogen',
        keyNutrients: ['Probiotics', 'Flax Lignans', 'Zinc', 'Polyphenols'],
        whyItWorks:
          'Supports the gut estrobolome to balance rising estrogen smoothly while fueling ovarian follicle maturation.',
        cravingTarget: 'Satisfies light, creamy & refreshing fruity cravings',
        prepTip: 'Use ground flaxseeds (1 tbsp) as part of natural seed-cycling for days 1–14.',
      },
      {
        id: 'follicular-snack-2',
        name: 'Avocado & Sprouted Pumpkin Seed Toast with Lemon Zest',
        emoji: '🥑',
        categoryBadge: 'Follicle-Nourishing Fats',
        keyNutrients: ['Monounsaturated Fats', 'Vitamin E', 'Folate', 'Selenium'],
        whyItWorks:
          'Provides healthy cholesterol building blocks for hormone synthesis and sharpens memory & focus for heavy study blocks.',
        cravingTarget: 'Hits crunchy, savory mid-morning snack cravings',
        prepTip: 'Top whole-grain or sourdough toast with mashed avocado, hemp/pumpkin seeds, and lemon.',
      },
      {
        id: 'follicular-snack-3',
        name: 'Lightly Salted Edamame or Crispy Roasted Chickpeas',
        emoji: '🫛',
        categoryBadge: 'Clean Protein & Study Stamina',
        keyNutrients: ['Complete Plant Protein', 'Folate', 'Iron', 'B-Vitamins'],
        whyItWorks:
          'Delivers sustained dopamine and acetylcholine support for fast learning without weighing down your digestion.',
        cravingTarget: 'Replaces processed chips during library study sessions',
        prepTip: 'Toss roasted chickpeas with a pinch of paprika and olive oil for a crunchy desk snack.',
      },
    ],
  },
  OVULATION: {
    stageKey: 'OVULATION',
    stageLabel: 'Ovulation (Days 12–16)',
    focusTitle: 'Antioxidant & Estrogen-Detox Snacks',
    focusBadge: '🌸 Antioxidant Peak & Liver Support',
    hormoneNutritionNote:
      'Estrogen peaks and luteinizing hormone (LH) surges to release the egg. Cruciferous compounds, glutathione precursors, and fiber help your liver metabolize excess estrogen so you avoid post-ovulation breakouts or mood dips.',
    hydrationSynergyTip:
      'Your basal temperature is about to shift—add electrolytes or coconut water on high-energy campus days.',
    snacks: [
      {
        id: 'ovulation-snack-1',
        name: 'Crisp Apple Slices with Almond Butter & Sunflower Seeds',
        emoji: '🍎',
        categoryBadge: 'Estrogen Clearance + Vitamin E',
        keyNutrients: ['Calcium-D-Glucarate', 'Vitamin E', 'Pectin Fiber', 'Magnesium'],
        whyItWorks:
          'Apples contain calcium-d-glucarate to aid liver estrogen clearance while sunflower seeds supply Vitamin E to support the corpus luteum.',
        cravingTarget: 'Balances sweet, crisp & nutty afternoon cravings',
        prepTip: 'Slice an apple before lectures and pack 2 tbsp almond butter + sunflower seeds.',
      },
      {
        id: 'ovulation-snack-2',
        name: 'Hummus with Cruciferous Veggie Sticks (Broccoli, Bell Peppers & Carrots)',
        emoji: '🥕',
        categoryBadge: 'DIM Estrogen Balance + Vit C',
        keyNutrients: ['Indole-3-Carbinol (DIM)', 'Sulforaphane', 'Vitamin C', 'Prebiotic Fiber'],
        whyItWorks:
          'Cruciferous veggies provide natural DIM to flush excess estrogen metabolites and prevent hormonal jawline breakouts.',
        cravingTarget: 'Satisfies savory, crunchy dip cravings while keeping energy light',
        prepTip: 'Pair red bell peppers (3x more Vitamin C than oranges) with garlic hummus.',
      },
      {
        id: 'ovulation-snack-3',
        name: 'Antioxidant Berry, Spinach & Brazil Nut Smoothie Bite',
        emoji: '🍓',
        categoryBadge: 'Glutathione & Cellular Glow',
        keyNutrients: ['Selenium (Brazil Nuts)', 'Glutathione Precursors', 'Anthocyanins', 'Folate'],
        whyItWorks:
          'Protects ovarian cells from oxidative stress during peak LH surge and supports radiant skin collagen.',
        cravingTarget: 'Refreshes cold, sweet & fruity cravings on warm days',
        prepTip: 'Just 2 Brazil nuts per day provide 100% of your daily selenium for thyroid & hormone health.',
      },
    ],
  },
  LUTEAL: {
    stageKey: 'LUTEAL',
    stageLabel: 'Luteal (Days 17–28)',
    focusTitle: 'Anti-Inflammatory & Serotonin-Supporting Snacks',
    focusBadge: '🌙 Anti-Inflammatory & Craving Balance',
    hormoneNutritionNote:
      'Progesterone dominates and raises your resting metabolic rate (burning ~100–250 extra kcal/day) while increasing insulin resistance. Anti-inflammatory omega-3s, Vitamin B6, magnesium, and slow-release complex carbs prevent sugar crashes and PMS mood swings.',
    hydrationSynergyTip:
      'Extra water + potassium-rich snacks help flush out progesterone-related water retention and bloating.',
    snacks: [
      {
        id: 'luteal-snack-1',
        name: 'Warm Cinnamon Sweet Potato Wedges with Tahini or Almond Drizzle',
        emoji: '🍠',
        categoryBadge: 'Anti-Inflammatory Complex Carb',
        keyNutrients: ['Slow-Release Complex Carbs', 'Vitamin B6', 'Beta-Carotene', 'Calcium'],
        whyItWorks:
          'Stabilizes blood sugar to stop progesterone-triggered sugar binges and supplies Vitamin B6 to synthesize calming serotonin and GABA.',
        cravingTarget: 'Tames intense carb, pastry & sweet comfort cravings',
        prepTip: 'Sprinkle Ceylon cinnamon on roasted sweet potato to naturally improve insulin sensitivity.',
      },
      {
        id: 'luteal-snack-2',
        name: 'Walnuts, Dark Chocolate & Banana / Tart Cherry Trail Mix',
        emoji: '🥜',
        categoryBadge: 'Omega-3 Anti-Inflammatory + Magnesium',
        keyNutrients: ['Plant Omega-3 (ALA)', 'Magnesium', 'Tryptophan', 'Potassium'],
        whyItWorks:
          'Omega-3 fatty acids and magnesium lower inflammatory prostaglandins before your period starts, reducing breast tenderness, bloating, and luteal anxiety.',
        cravingTarget: 'Satisfies late-night chocolate, salty-sweet & crunchy cravings',
        prepTip: 'Eat 30–45 minutes before bed to support deeper sleep when progesterone raises body temp.',
      },
      {
        id: 'luteal-snack-3',
        name: 'Spiced Turmeric-Ginger Chia Oats with Sesame & Sunflower Seeds',
        emoji: '🍯',
        categoryBadge: 'Anti-Bloating & Progesterone Support',
        keyNutrients: ['Curcumin (Anti-Inflammatory)', 'Soluble Fiber', 'Zinc', 'Vitamin B6'],
        whyItWorks:
          'Curcumin and ginger calm systemic pre-menstrual inflammation while sesame and sunflower seeds support healthy progesterone-to-estrogen ratios.',
        cravingTarget: 'Comforts cozy, creamy & sweet cravings during PMS days',
        prepTip: 'Add a pinch of black pepper with turmeric to boost anti-inflammatory absorption.',
      },
    ],
  },
};

