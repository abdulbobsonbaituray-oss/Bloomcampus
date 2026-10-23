import React, { useState, useEffect, useCallback } from 'react';
import { StageKey } from '../types';
import { CREATOR_NAME, CREATOR_EMAIL } from '../constants';

interface BioscienceReproductiveEducationCenterProps {
  currentStageKey: StageKey;
  cycleDay: number;
  avgCycleLength: number;
  onNavigateToUpdateLmp?: () => void;
  onNavigateToEmergencyPillLogger?: () => void;
}

/**
 * Exponential backoff helper for scientific REST APIs (Science Skill specification)
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 3,
  baseDelayMs = 600
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delay =
        !Number.isNaN(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    const errorBody = await response.text().catch(() => '');
    throw new Error(
      `HTTP ${response.status} (${response.statusText}) from ${url}: ${errorBody.slice(0, 300)}`
    );
  }
  throw new Error(`Exhausted retries for ${url}`);
}

interface CyclePhaseBioscienceDetail {
  stageKey: StageKey;
  phaseTitle: string;
  typicalDays: string;
  dominantHormones: string;
  ovarianEvent: string;
  endometrialEvent: string;
  cervicalMucusProfile: string;
  basalBodyTempProfile: string;
  fertilityStatus: string;
  clinicalSummary: string;
}

const MENSTRUAL_BIOSCIENCE_PHASES: CyclePhaseBioscienceDetail[] = [
  {
    stageKey: 'MENSTRUATION',
    phaseTitle: '1. Menstruation (Early Follicular / Menses)',
    typicalDays: 'Days 1–5',
    dominantHormones: 'Low Estradiol (E2) & Low Progesterone (P4); rising pituitary FSH',
    ovarianEvent:
      'Corpus luteum regression (luteolysis) from the prior cycle removes negative feedback on the hypothalamus and anterior pituitary, initiating a cohort of antral follicles via FSH recruitment.',
    endometrialEvent:
      'Progesterone withdrawal triggers spiral artery vasoconstriction, prostaglandin (PGF2α & PGE2) release, matrix metalloproteinase activation, and shedding of the functionalis layer.',
    cervicalMucusProfile:
      'Obscured by menstrual flow; cervical os is slightly open to allow menstrual efflux.',
    basalBodyTempProfile:
      'Drops back to lower pre-ovulatory baseline (~36.1°C–36.4°C / 97.0°F–97.5°F) following progesterone withdrawal.',
    fertilityStatus:
      'Low (though short cycles <23 days with prolonged 6–7 day bleeding can overlap with early fertile sperm survival).',
    clinicalSummary:
      'Day 1 is defined clinically as the first day of full bright-red menstrual bleeding (not pre-menstrual spotting). Cramps (primary dysmenorrhea) are mediated by uterine prostaglandins.',
  },
  {
    stageKey: 'FOLLICULAR',
    phaseTitle: '2. Proliferative / Late Follicular Phase',
    typicalDays: 'Days 6–11',
    dominantHormones: 'Rising 17β-Estradiol (E2) & Follicle-Stimulating Hormone (FSH); Inhibin B',
    ovarianEvent:
      'Selection of a single dominant Graafian follicle. Granulosa cells express aromatase (CYP19A1), converting theca-derived androgens into 17β-estradiol.',
    endometrialEvent:
      'Estrogen-driven mitotic proliferation of endometrial stroma, glands, and spiral vasculature (building thickness from ~2 mm to 8–12 mm).',
    cervicalMucusProfile:
      'Transitions from dry/scant to cloudy, sticky, or creamy/lotion-like as rising estradiol stimulates cervical crypt hydration.',
    basalBodyTempProfile:
      'Remains in the lower follicular follicular range prior to ovulation.',
    fertilityStatus:
      'Transitioning from Low to Moderate/High as the 6-day biological fertile window opens (5 days before ovulation).',
    clinicalSummary:
      'The follicular phase is the most variable segment of the menstrual cycle; stress, illness, or travel during this window can delay dominant follicle maturation and shift the ovulation date.',
  },
  {
    stageKey: 'OVULATION',
    phaseTitle: '3. Periovulatory / Ovulation Phase',
    typicalDays: 'Days 12–16 (Mid-Cycle)',
    dominantHormones:
      'Peak 17β-Estradiol (>200 pg/mL for >48h) switches HPO feedback to positive → Pituitary LH Surge & FSH peak',
    ovarianEvent:
      'The mid-cycle Luteinizing Hormone (LH) surge resumes meiosis I in the primary oocyte, increases intrafollicular prostaglandins and proteolytic enzymes, and ruptures the follicular wall ~34–36 hours after LH surge onset (10–12 hours after LH peak).',
    endometrialEvent:
      'Trilaminar ("triple-line") receptive endometriumprimed with progesterone receptors.',
    cervicalMucusProfile:
      'Peak E-type (estrogenic) mucus: abundant, clear, slippery, and elastic ("egg-white" Spinnbarkeit stretching 5–10+ cm) with alkaline pH (~7.0–8.5) that nourishes and filters capacitated sperm.',
    basalBodyTempProfile:
      'Nadir or final low reading immediately preceding the post-ovulatory thermal shift.',
    fertilityStatus:
      'Peak Fertility (Highest probability of conception occurs in the 2 days leading up to ovulation and the day of ovulation itself).',
    clinicalSummary:
      'Once extruded into the fallopian tube ampulla, the secondary oocyte remains viable for only 12–24 hours unless fertilized, whereas sperm survive up to 5 days in estrogenic cervical mucus.',
  },
  {
    stageKey: 'LUTEAL',
    phaseTitle: '4. Secretory / Luteal Phase',
    typicalDays: 'Days 17–28 (Fixed ~12–14 Days)',
    dominantHormones:
      'High Progesterone (P4 peak ~7 days post-ovulation) + secondary Estradiol plateau',
    ovarianEvent:
      'The ruptured follicle luteinizes into the endocrine Corpus Luteum, secreting progesterone. If no hCG signal arrives from an implanting blastocyst by ~Day 24–26, luteolysis occurs.',
    endometrialEvent:
      'Secretory transformation: tortuous glycogen-rich glands, stromal decidualization, and spiral artery coiling during the "Window of Implantation" (6–10 days post-ovulation).',
    cervicalMucusProfile:
      'Abruptly shifts to G-type (gestagenic) mucus under progesterone influence: thick, opaque, cellular, and acidic, forming a physical barrier plug at the cervix.',
    basalBodyTempProfile:
      'Sustained biphasic elevation (+0.2°C to +0.5°C / +0.4°F to +1.0°F) driven by progesterone acting on thermoregulatory neurons in the preoptic anterior hypothalamus.',
    fertilityStatus:
      'Very Low / Infertile once 24–48 hours have elapsed after confirmed ovulation and cervical mucus has dried up.',
    clinicalSummary:
      'Allopregnanolone (a neurosteroid metabolite of progesterone) modulates GABA-A receptors; rapid late-luteal decline can trigger PMS symptoms, bloating, and luteal mood shifts.',
  },
];

interface FertilityBiomarkerCard {
  id: string;
  name: string;
  badge: string;
  mechanism: string;
  fertileSign: string;
  nonFertileSign: string;
  clinicalNote: string;
}

const FERTILITY_BIOMARKERS: FertilityBiomarkerCard[] = [
  {
    id: 'mucus',
    name: 'Cervical Mucus (Spinnbarkeit & Hydration)',
    badge: 'Prospective Marker (Signals Opening of Fertile Window)',
    mechanism:
      'Rising follicular 17β-estradiol stimulates endocervical crypts to secrete mucin-5B hydrogels with 96–98% water content and parallel glycoprotein channels.',
    fertileSign:
      'Clear, stretchy, lubricative ("raw egg-white") consistency, alkaline pH (7.0–8.5), extends sperm survival up to 5 days.',
    nonFertileSign:
      'Dry, scant, or thick/tacky opaque G-type mucus controlled by progesterone that blocks sperm penetration.',
    clinicalNote:
      'Because cervical mucus changes 4–6 days before ovulation, it is the primary prospective biological indicator that the fertile window has opened.',
  },
  {
    id: 'lh',
    name: 'Urinary Luteinizing Hormone (LH Surge)',
    badge: 'Imminent Ovulation Marker (24–36h Window)',
    mechanism:
      'Sustained high estradiol (>200 pg/mL) switches GnRH/pituitary feedback from negative to positive, triggering a 10-to-20-fold surge in pituitary LH secretion.',
    fertileSign:
      'Positive urinary LH test (test line as dark or darker than control), indicating ovulation will typically occur within 24–36 hours.',
    nonFertileSign:
      'Low tonic baseline LH levels throughout most of the follicular and luteal phases.',
    clinicalNote:
      'Patients with Polycystic Ovary Syndrome (PCOS) may have chronically elevated baseline LH, which can cause false-positive urinary ovulation strips.',
  },
  {
    id: 'bbt',
    name: 'Basal Body Temperature (BBT Thermal Shift)',
    badge: 'Retrospective Confirmation (Confirms Ovulation Occurred)',
    mechanism:
      'Progesterone secreted by the post-ovulatory corpus luteum acts on the preoptic area of the hypothalamus to raise the body’s resting thermoregulatory set-point.',
    fertileSign:
      '3 consecutive morning waking temperatures at least +0.2°C (+0.4°F) higher than the preceding 6 follicular readings confirm ovulation has completed.',
    nonFertileSign:
      'Monophasic temperature curve throughout the cycle suggests an anovulatory cycle.',
    clinicalNote:
      'BBT rises AFTER ovulation has already occurred; therefore, BBT alone cannot predict the start of the fertile window in advance.',
  },
  {
    id: 'cervix',
    name: 'Cervical Position, Firmness & Opening (SHOW)',
    badge: 'Anatomical Biomarker',
    mechanism:
      'High estrogen relaxes smooth muscle and increases vascularity/edema in the uterine cervix, whereas progesterone restores cervical rigidity.',
    fertileSign:
      'SHOW: Soft (like lips), High in the vaginal canal, Open os, and Wet with clear mucus.',
    nonFertileSign:
      'Firm (like the tip of the nose), Low/easily reached, Closed os, and Dry.',
    clinicalNote:
      'Best assessed at the same time each day with clean hands in a consistent posture.',
  },
];

export type ContraceptiveCategory =
  | 'ALL'
  | 'LARC'
  | 'HORMONAL_SHORT'
  | 'BARRIER_NON_HORMONAL'
  | 'EMERGENCY';

interface ContraceptiveMethodItem {
  id: string;
  name: string;
  category: Exclude<ContraceptiveCategory, 'ALL'>;
  categoryLabel: string;
  perfectUseEfficacy: string;
  typicalUseEfficacy: string;
  typicalNumeric: number;
  hormoneContent: string;
  mechanismOfAction: string;
  stiProtection: string;
  durationAndFrequency: string;
  returnToFertility: string;
  pubchemCompoundName: string;
  pubchemCid: number;
  clinicalNotes: string;
}

const CONTRACEPTIVE_METHODS: ContraceptiveMethodItem[] = [
  {
    id: 'implant',
    name: 'Contraceptive Subdermal Implant (Nexplanon / Jadelle)',
    category: 'LARC',
    categoryLabel: 'LARC (Long-Acting Reversible)',
    perfectUseEfficacy: '99.95%',
    typicalUseEfficacy: '99.95%',
    typicalNumeric: 99.95,
    hormoneContent: 'Progestin-only (Etonogestrel 68 mg or Levonorgestrel rods)',
    mechanismOfAction:
      'Suppresses the hypothalamic-pituitary LH surge to inhibit ovulation and thickens cervical mucus to block sperm transit.',
    stiProtection: 'None (Use condoms for STI/HIV protection)',
    durationAndFrequency: '3 to 5 years (Single subdermal placement in upper arm)',
    returnToFertility: 'Rapid (Ovulation typically resumes within 2–4 weeks of removal)',
    pubchemCompoundName: 'Etonogestrel',
    pubchemCid: 6917715,
    clinicalNotes:
      'Most effective reversible contraceptive available. May cause unscheduled spotting or amenorrhea.',
  },
  {
    id: 'lng-iud',
    name: 'Hormonal Intrauterine System (LNG-IUD: Mirena, Kyleena)',
    category: 'LARC',
    categoryLabel: 'LARC (Long-Acting Reversible)',
    perfectUseEfficacy: '99.8%',
    typicalUseEfficacy: '99.8%',
    typicalNumeric: 99.8,
    hormoneContent: 'Localized Progestin (Levonorgestrel 13.5 mg–52 mg)',
    mechanismOfAction:
      'Thickens endocervical mucus into an impenetrable barrier, induces endometrial decidualization/atrophy, impairs sperm motility, and partially inhibits ovulation.',
    stiProtection: 'None (Use condoms for STI/HIV protection)',
    durationAndFrequency: '3 to 8 years depending on dose model',
    returnToFertility: 'Immediate upon clinician removal',
    pubchemCompoundName: 'Levonorgestrel',
    pubchemCid: 13109,
    clinicalNotes:
      'Significantly reduces heavy menstrual bleeding (menorrhagia) and primary dysmenorrhea (cramps).',
  },
  {
    id: 'copper-iud',
    name: 'Copper Intrauterine Device (Cu-IUD: Paragard / TCu380A)',
    category: 'LARC',
    categoryLabel: 'LARC (Non-Hormonal)',
    perfectUseEfficacy: '99.4%',
    typicalUseEfficacy: '99.2%',
    typicalNumeric: 99.2,
    hormoneContent: '100% Hormone-Free (Copper ions Cu²⁺)',
    mechanismOfAction:
      'Released copper ions create a sterile inflammatory cascade and spermicidal intrauterine environment that disrupts sperm head-tail motility and capacitation, preventing fertilization.',
    stiProtection: 'None (Use condoms for STI/HIV protection)',
    durationAndFrequency: 'Up to 10–12 years (Also >99.9% effective as Emergency Contraception within 5 days)',
    returnToFertility: 'Immediate upon clinician removal; natural hormonal ovulatory cycles continue uninterrupted',
    pubchemCompoundName: 'Progesterone',
    pubchemCid: 5994,
    clinicalNotes:
      'Ideal for individuals who prefer non-hormonal contraception or have medical contraindications to estrogen/progestin. May increase menstrual flow/cramping in the first 3–6 months.',
  },
  {
    id: 'injectable',
    name: 'Contraceptive Injection (Depo-Provera / Sayana Press DMPA)',
    category: 'HORMONAL_SHORT',
    categoryLabel: 'Short-Acting Hormonal',
    perfectUseEfficacy: '99.8%',
    typicalUseEfficacy: '94%–96%',
    typicalNumeric: 95,
    hormoneContent: 'Progestin-only (Medroxyprogesterone Acetate 150 mg IM or 104 mg SC)',
    mechanismOfAction:
      'Potently inhibits pituitary gonadotropin (FSH/LH) secretion, completely suppressing follicular maturation and ovulation, while thickening cervical mucus.',
    stiProtection: 'None (Use condoms for STI/HIV protection)',
    durationAndFrequency: '1 injection every 12–13 weeks (3 months)',
    returnToFertility: 'Delayed (Can take 6–10 months after the last injection for ovulation to resume)',
    pubchemCompoundName: 'Medroxyprogesterone Acetate',
    pubchemCid: 6279,
    clinicalNotes:
      'Discreet 3-month dosing; reversible decreases in bone mineral density with long-term use warrant adequate calcium and Vitamin D intake.',
  },
  {
    id: 'cocp',
    name: 'Combined Oral Contraceptive Pill (COCP: Estrogen + Progestin)',
    category: 'HORMONAL_SHORT',
    categoryLabel: 'Short-Acting Hormonal',
    perfectUseEfficacy: '99.7%',
    typicalUseEfficacy: '91%–93%',
    typicalNumeric: 92,
    hormoneContent: 'Ethinylestradiol (10–35 mcg) + Progestin (e.g., Levonorgestrel, Drospirenone, Norgestimate)',
    mechanismOfAction:
      'Estrogen suppresses FSH (preventing dominant follicle selection) and stabilizes the endometrium; progestin suppresses the mid-cycle LH surge (preventing ovulation) and thickens cervical mucus.',
    stiProtection: 'None (Use condoms for STI/HIV protection)',
    durationAndFrequency: 'Taken orally once daily',
    returnToFertility: 'Rapid (Typically within 1–3 months after discontinuation)',
    pubchemCompoundName: 'Ethinylestradiol',
    pubchemCid: 5991,
    clinicalNotes:
      'Can regulate bleeding, reduce acne/hirsutism, and lower ovarian/endometrial cancer risk. Contraindicated in migraine with aura, history of VTE/thrombosis, or smokers ≥35 years (consult WHO MEC).',
  },
  {
    id: 'pop',
    name: 'Progestin-Only Pill (POP / Mini-Pill)',
    category: 'HORMONAL_SHORT',
    categoryLabel: 'Short-Acting Hormonal',
    perfectUseEfficacy: '99.5%',
    typicalUseEfficacy: '91%–93%',
    typicalNumeric: 92,
    hormoneContent: 'Progestin-only (Norethindrone, Desogestrel, or Drospirenone — Estrogen-Free)',
    mechanismOfAction:
      'Thickens cervical mucus to block sperm entry, thins the endometrium, and suppresses ovulation (especially Desogestrel and Drospirenone formulations).',
    stiProtection: 'None (Use condoms for STI/HIV protection)',
    durationAndFrequency: 'Taken orally at the same time every day (traditional POPs have a strict 3-hour window)',
    returnToFertility: 'Immediate upon discontinuation',
    pubchemCompoundName: 'Levonorgestrel',
    pubchemCid: 13109,
    clinicalNotes:
      'Safe option for individuals who are breastfeeding or have medical contraindications to exogenous estrogen.',
  },
  {
    id: 'condom',
    name: 'External (Male) & Internal (Female) Barrier Condoms',
    category: 'BARRIER_NON_HORMONAL',
    categoryLabel: 'Barrier & Non-Hormonal',
    perfectUseEfficacy: '98% (External) / 95% (Internal)',
    typicalUseEfficacy: '87% (External) / 79% (Internal)',
    typicalNumeric: 87,
    hormoneContent: '100% Hormone-Free (Latex, Polyurethane, Polyisoprene, or Nitrile)',
    mechanismOfAction:
      'Forms a physical barrier that prevents spermatozoa and genital secretions from entering the reproductive tract.',
    stiProtection: 'YES — Only contraceptive method providing dual protection against STIs (HIV, Gonorrhea, Chlamydia, Syphilis)',
    durationAndFrequency: 'Single-use with every act of intercourse',
    returnToFertility: 'Immediate (Zero hormonal effect on the HPO axis)',
    pubchemCompoundName: 'Estradiol',
    pubchemCid: 5757,
    clinicalNotes:
      'Can be combined with hormonal or LARC methods ("Dual Method Use") to maximize both pregnancy prevention and STI protection.',
  },
  {
    id: 'fabm',
    name: 'Sympto-Thermal Fertility Awareness-Based Method (FABM)',
    category: 'BARRIER_NON_HORMONAL',
    categoryLabel: 'Barrier & Non-Hormonal',
    perfectUseEfficacy: '98%–99.6%',
    typicalUseEfficacy: '76%–88%',
    typicalNumeric: 82,
    hormoneContent: '100% Hormone-Free (Behavioral & Biomarker Tracking)',
    mechanismOfAction:
      'Cross-checks daily waking Basal Body Temperature (BBT), cervical mucus observations, and cycle history to identify the fertile window and abstain or use barrier protection on fertile days.',
    stiProtection: 'None (Unless barrier condoms are used)',
    durationAndFrequency: 'Daily morning temperature & daytime cervical mucus observation',
    returnToFertility: 'Immediate (Can also be inverted to time intercourse for conception)',
    pubchemCompoundName: 'Progesterone',
    pubchemCid: 5994,
    clinicalNotes:
      'Requires high daily consistency, regular sleep for accurate BBT, and partner cooperation during the fertile phase.',
  },
  {
    id: 'ec-ulipristal',
    name: 'Emergency Contraception: Ulipristal Acetate 30 mg (ella)',
    category: 'EMERGENCY',
    categoryLabel: 'Emergency Contraception (Post-Coital)',
    perfectUseEfficacy: '~98%–99% (Reduces pregnancy risk by ~65%–85% per single exposure)',
    typicalUseEfficacy: 'Effective up to 120 hours (5 days) after unprotected sex',
    typicalNumeric: 98,
    hormoneContent: 'Selective Progesterone Receptor Modulator (SPRM: Ulipristal Acetate 30 mg)',
    mechanismOfAction:
      'Binds with high affinity to progesterone receptors to delay or inhibit follicular rupture even after the LH surge has begun (up to the LH peak). Does NOT interrupt an established pregnancy.',
    stiProtection: 'None',
    durationAndFrequency: 'Single oral dose within 120 hours (5 days) of unprotected intercourse',
    returnToFertility: 'Immediate (Next ovulation may be delayed by several days within the same cycle)',
    pubchemCompoundName: 'Ulipristal Acetate',
    pubchemCid: 130904,
    clinicalNotes:
      'More effective than Levonorgestrel in the late follicular phase (when ovulation is imminent) and within 72–120 hours. Taking an emergency pill in a month can lead to changes in how your period is found—note the exact date and time down and re-change your LMP (Last Menstrual Period) start date when you notice your period again.',
  },
  {
    id: 'ec-lng',
    name: 'Emergency Contraception: Levonorgestrel 1.5 mg (Postinor-2 / Plan B)',
    category: 'EMERGENCY',
    categoryLabel: 'Emergency Contraception (Post-Coital)',
    perfectUseEfficacy: '~97%–98% when taken within 24h (Reduces pregnancy risk by ~50%–85%)',
    typicalUseEfficacy: 'Effective up to 72 hours (3 days) after unprotected sex',
    typicalNumeric: 95,
    hormoneContent: 'High-dose Progestin (Levonorgestrel 1.5 mg single dose or two 0.75 mg doses)',
    mechanismOfAction:
      'Provides negative feedback prior to the LH surge to blunt or delay ovulation. Ineffective if taken after the LH surge has already peaked or ovulation has occurred. Does NOT cause abortion.',
    stiProtection: 'None',
    durationAndFrequency: 'Single oral dose as soon as possible within 72 hours of unprotected intercourse',
    returnToFertility: 'Immediate (Take a follow-up urine pregnancy test 21 days later if period is delayed)',
    pubchemCompoundName: 'Levonorgestrel',
    pubchemCid: 13109,
    clinicalNotes:
      'Widely available over-the-counter. Taking an emergency pill in a month can lead to changes in how your period is found (arriving a few days early or late)—always note the date and time down and re-change your LMP (Last Menstrual Period) start date when you notice your period again.',
  },
];

interface BioTargetExample {
  id: string;
  label: string;
  type: 'compound' | 'protein';
  identifier: string;
  cid?: number;
  uniprotId?: string;
  roleSummary: string;
}

const BIOSCIENCE_QUICK_EXAMPLES: BioTargetExample[] = [
  {
    id: 'levonorgestrel',
    label: '💊 Levonorgestrel (CID 13109)',
    type: 'compound',
    identifier: 'Levonorgestrel',
    cid: 13109,
    roleSummary: 'Synthetic progestin agonist at PGR; used in Emergency Contraception (Postinor-2/Plan B), LNG-IUDs, and COCPs.',
  },
  {
    id: 'ulipristal',
    label: '💊 Ulipristal Acetate (CID 130904)',
    type: 'compound',
    identifier: 'Ulipristal Acetate',
    cid: 130904,
    roleSummary: 'Selective Progesterone Receptor Modulator (SPRM); delays follicular rupture up to 120h post-intercourse.',
  },
  {
    id: 'ethinylestradiol',
    label: '🧪 Ethinylestradiol (CID 5991)',
    type: 'compound',
    identifier: 'Ethinylestradiol',
    cid: 5991,
    roleSummary: 'Orally bioavailable 17α-ethinyl analog of estradiol used in combined oral contraceptives, patches, and rings.',
  },
  {
    id: 'progesterone',
    label: '🌙 Progesterone (CID 5994)',
    type: 'compound',
    identifier: 'Progesterone',
    cid: 5994,
    roleSummary: 'Endogenous C21 corpus luteum steroid hormone; prepares secretory endometrium and elevates BBT.',
  },
  {
    id: 'estradiol',
    label: '🌸 17β-Estradiol (CID 5757)',
    type: 'compound',
    identifier: 'Estradiol',
    cid: 5757,
    roleSummary: 'Primary follicular estrogen produced by granulosa aromatase; drives endometrial proliferation and fertile cervical mucus.',
  },
  {
    id: 'lhb',
    label: '🧬 Luteinizing Hormone LHB (P01229)',
    type: 'protein',
    identifier: 'P01229',
    uniprotId: 'P01229',
    roleSummary: 'Pituitary glycoprotein hormone beta chain; the mid-cycle LH surge triggers oocyte meiosis resumption and ovulation.',
  },
  {
    id: 'fshb',
    label: '🧬 Follicle-Stimulating Hormone FSHB (P01225)',
    type: 'protein',
    identifier: 'P01225',
    uniprotId: 'P01225',
    roleSummary: 'Pituitary hormone beta subunit; stimulates ovarian follicular recruitment and granulosa cell aromatase expression.',
  },
  {
    id: 'pgr',
    label: '🧬 Progesterone Receptor PGR (P06401)',
    type: 'protein',
    identifier: 'P06401',
    uniprotId: 'P06401',
    roleSummary: 'Nuclear steroid hormone receptor targeted by endogenous progesterone, progestin contraceptives, and ulipristal.',
  },
];

interface PubChemCompoundData {
  cid: number;
  name: string;
  formula: string;
  molecularWeight: string;
  canonicalSmiles: string;
  inChIKey: string;
  xLogP: number | null;
  tpsa: number | null;
  hBondDonor: number;
  hBondAcceptor: number;
  rotatableBonds: number;
  fdaIndicationSnippet?: string;
}

interface UniProtProteinData {
  accession: string;
  geneName: string;
  proteinName: string;
  organism: string;
  sequenceLength: number;
  functionText: string;
  alphafoldEntryId?: string;
  alphafoldCifUrl?: string;
  alphafoldPaeImageUrl?: string;
}

interface EuropePmcArticle {
  id: string;
  pmid?: string;
  doi?: string;
  title: string;
  authorString: string;
  journalTitle: string;
  pubYear: string;
  citedByCount: number;
  isOpenAccess: boolean;
}

export const BioscienceReproductiveEducationCenter: React.FC<
  BioscienceReproductiveEducationCenterProps
> = ({
  currentStageKey,
  cycleDay,
  avgCycleLength,
  onNavigateToUpdateLmp,
  onNavigateToEmergencyPillLogger,
}) => {
  // Active Top-Level Module Tab
  const [activeModule, setActiveModule] = useState<
    'reproductive_center' | 'contraceptive_guide' | 'bioscience_workbench'
  >('reproductive_center');

  // Selected Menstrual Phase in Reproductive Health Education Center
  const [selectedEduStage, setSelectedEduStage] = useState<StageKey>(currentStageKey);

  // Contraceptive Guide Filter
  const [contraceptiveFilter, setContraceptiveFilter] = useState<ContraceptiveCategory>('ALL');

  // Live Bioscience Workbench State (PubChem / openFDA / UniProt / AlphaFold / Europe PMC)
  const [selectedExample, setSelectedExample] = useState<BioTargetExample>(
    BIOSCIENCE_QUICK_EXAMPLES[0]
  );
  const [compoundData, setCompoundData] = useState<PubChemCompoundData | null>(null);
  const [proteinData, setProteinData] = useState<UniProtProteinData | null>(null);
  const [bioLoading, setBioLoading] = useState<boolean>(false);
  const [bioError, setBioError] = useState<string | null>(null);

  // Live Europe PMC Literature Search State
  const [litQuery, setLitQuery] = useState<string>(
    'menstrual cycle ovulation fertility biomarkers'
  );
  const [litArticles, setLitArticles] = useState<EuropePmcArticle[]>([]);
  const [litLoading, setLitLoading] = useState<boolean>(false);

  const loadBioTargetDetails = useCallback(async (target: BioTargetExample) => {
    setSelectedExample(target);
    setBioLoading(true);
    setBioError(null);

    try {
      if (target.type === 'compound' && target.cid) {
        const propUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${target.cid}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,IsomericSMILES,InChIKey,XLogP,TPSA,HBondDonorCount,HBondAcceptorCount,RotatableBondCount/JSON`;
        const res = await fetchWithRetry(propUrl);
        const json = await res.json();
        const prop = json?.PropertyTable?.Properties?.[0];

        let fdaSnippet = '';
        try {
          const fdaRes = await fetch(
            `https://api.fda.gov/drug/label.json?search=openfda.generic_name:"${encodeURIComponent(
              target.identifier
            )}"&limit=1`
          );
          if (fdaRes.ok) {
            const fdaJson = await fdaRes.json();
            const firstLabel = fdaJson?.results?.[0];
            const rawInd =
              firstLabel?.indications_and_usage?.[0] ||
              firstLabel?.mechanism_of_action?.[0] ||
              firstLabel?.clinical_pharmacology?.[0] ||
              '';
            if (rawInd) {
              fdaSnippet = String(rawInd).replace(/\s+/g, ' ').slice(0, 320) + '...';
            }
          }
        } catch {
          // Optional openFDA enrichment
        }

        if (prop) {
          setCompoundData({
            cid: target.cid,
            name: target.identifier,
            formula: prop.MolecularFormula || 'N/A',
            molecularWeight: String(prop.MolecularWeight || 'N/A'),
            canonicalSmiles: prop.CanonicalSMILES || prop.IsomericSMILES || 'N/A',
            inChIKey: prop.InChIKey || 'N/A',
            xLogP: typeof prop.XLogP === 'number' ? prop.XLogP : null,
            tpsa: typeof prop.TPSA === 'number' ? prop.TPSA : null,
            hBondDonor: Number(prop.HBondDonorCount ?? 0),
            hBondAcceptor: Number(prop.HBondAcceptorCount ?? 0),
            rotatableBonds: Number(prop.RotatableBondCount ?? 0),
            fdaIndicationSnippet: fdaSnippet,
          });
          setProteinData(null);
        }
      } else if (target.type === 'protein' && target.uniprotId) {
        const uniprotUrl = `https://rest.uniprot.org/uniprotkb/${target.uniprotId}.json`;
        const res = await fetchWithRetry(uniprotUrl);
        const uJson = await res.json();

        const geneName =
          uJson?.genes?.[0]?.geneName?.value || target.uniprotId;
        const proteinName =
          uJson?.proteinDescription?.recommendedName?.fullName?.value ||
          target.label;
        const organism =
          uJson?.organism?.scientificName || 'Homo sapiens';
        const sequenceLength = Number(uJson?.sequence?.length || 0);
        const fnComment = (uJson?.comments || []).find(
          (c: { commentType?: string }) => c.commentType === 'FUNCTION'
        );
        const functionText =
          fnComment?.texts?.[0]?.value || target.roleSummary;

        let afEntryId: string | undefined;
        let afCifUrl: string | undefined;
        let afPaeImg: string | undefined;
        try {
          const afRes = await fetch(
            `https://alphafold.ebi.ac.uk/api/prediction/${target.uniprotId}`
          );
          if (afRes.ok) {
            const afArr = await afRes.json();
            if (Array.isArray(afArr) && afArr[0]) {
              afEntryId = afArr[0].entryId;
              afCifUrl = afArr[0].cifUrl;
              afPaeImg = afArr[0].paeImageUrl;
            }
          }
        } catch {
          // Optional AlphaFold metadata enrichment
        }

        setProteinData({
          accession: target.uniprotId,
          geneName,
          proteinName,
          organism,
          sequenceLength,
          functionText,
          alphafoldEntryId: afEntryId,
          alphafoldCifUrl: afCifUrl,
          alphafoldPaeImageUrl: afPaeImg,
        });
        setCompoundData(null);
      }
    } catch (err) {
      setBioError(
        err instanceof Error ? err.message : 'Unable to fetch live molecular record.'
      );
    } finally {
      setBioLoading(false);
    }
  }, []);

  const searchEuropePmcLiterature = useCallback(async (queryStr: string) => {
    const cleanQ = queryStr.trim();
    if (!cleanQ) return;
    setLitLoading(true);
    try {
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(
        cleanQ
      )}&format=json&pageSize=4`;
      const res = await fetchWithRetry(url);
      const data = await res.json();
      const results = Array.isArray(data?.resultList?.result)
        ? data.resultList.result
        : [];
      setLitArticles(
        results.map((r: Record<string, unknown>) => ({
          id: String(r.id || r.pmid || Math.random()),
          pmid: r.pmid ? String(r.pmid) : undefined,
          doi: r.doi ? String(r.doi) : undefined,
          title: String(r.title || 'Untitled Biomedical Study'),
          authorString: String(r.authorString || 'Clinical Investigators'),
          journalTitle: String(r.journalTitle || r.source || 'Biomedical Journal'),
          pubYear: String(r.pubYear || ''),
          citedByCount: Number(r.citedByCount || 0),
          isOpenAccess: r.isOpenAccess === 'Y',
        }))
      );
    } catch {
      setLitArticles([]);
    } finally {
      setLitLoading(false);
    }
  }, []);

  // Auto-load default example on initial mount so user never lands on an empty state (Science Skill Rule)
  useEffect(() => {
    loadBioTargetDetails(BIOSCIENCE_QUICK_EXAMPLES[0]);
    searchEuropePmcLiterature('menstrual cycle ovulation fertility biomarkers');
  }, [loadBioTargetDetails, searchEuropePmcLiterature]);

  const activePhaseBio =
    MENSTRUAL_BIOSCIENCE_PHASES.find((p) => p.stageKey === selectedEduStage) ||
    MENSTRUAL_BIOSCIENCE_PHASES[0];

  const filteredContraceptives =
    contraceptiveFilter === 'ALL'
      ? CONTRACEPTIVE_METHODS
      : CONTRACEPTIVE_METHODS.filter((m) => m.category === contraceptiveFilter);

  const inspectContraceptiveMolecule = (method: ContraceptiveMethodItem) => {
    const found = BIOSCIENCE_QUICK_EXAMPLES.find((ex) => ex.cid === method.pubchemCid);
    const target: BioTargetExample = found || {
      id: method.id,
      label: `💊 ${method.pubchemCompoundName} (CID ${method.pubchemCid})`,
      type: 'compound',
      identifier: method.pubchemCompoundName,
      cid: method.pubchemCid,
      roleSummary: `${method.name}: ${method.mechanismOfAction}`,
    };
    setActiveModule('bioscience_workbench');
    loadBioTargetDetails(target);
  };

  // Lipinski Rule of Five evaluation for active compound
  const lipinskiViolations = compoundData
    ? [
        Number(compoundData.molecularWeight) > 500,
        compoundData.xLogP !== null && compoundData.xLogP > 5,
        compoundData.hBondDonor > 5,
        compoundData.hBondAcceptor > 10,
      ].filter(Boolean).length
    : 0;

  return (
    <section
      id="educational-resources-center"
      className="bg-[#F8FAFC] rounded-3xl shadow-xs border-2 border-[#E2E8F0] p-5 sm:p-6 space-y-6"
    >
      {/* HEADER BANNER */}
      <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-[#0B57D0] text-white text-[11px] font-extrabold uppercase tracking-wider">
              🧬 Educational Resources · Bioscience &amp; Reproductive Health Center
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-[#007B83]/10 text-[#007B83] border border-[#007B83]/30 text-[11px] font-bold">
              [Literature Curated &amp; Public Science APIs]
            </span>
          </div>
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
            Reproductive Health Education Center &amp; Contraceptive Guide
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 max-w-3xl leading-relaxed">
            Evidence-based reproductive endocrinology, biological indicators of fertility and ovulation, objective contraceptive efficacy comparisons, and live molecular pharmacology data from <strong>PubChem</strong>, <strong>UniProtKB</strong>, <strong>AlphaFold DB</strong>, <strong>openFDA</strong>, and <strong>Europe PMC</strong>.
          </p>
        </div>

        {/* 3 CORE EDUCATIONAL MODULE TABS */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveModule('reproductive_center')}
            className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer border ${
              activeModule === 'reproductive_center'
                ? 'bg-[#0B57D0] text-white border-[#0B57D0] shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E2E8F0]'
            }`}
          >
            🩸 1. Cycle, Fertility &amp; Ovulation
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('contraceptive_guide')}
            className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer border ${
              activeModule === 'contraceptive_guide'
                ? 'bg-[#007B83] text-white border-[#007B83] shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E2E8F0]'
            }`}
          >
            🛡️ 2. Contraceptive Information Guide
          </button>
          <button
            type="button"
            onClick={() => setActiveModule('bioscience_workbench')}
            className={`px-3.5 py-2.5 rounded-xl font-extrabold text-xs transition-all cursor-pointer border ${
              activeModule === 'bioscience_workbench'
                ? 'bg-[#9334E6] text-white border-[#9334E6] shadow-xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E2E8F0]'
            }`}
          >
            🔬 3. Live Molecular &amp; Literature Lab
          </button>
        </div>
      </div>

      {/* =====================================================================
          MODULE 1: REPRODUCTIVE HEALTH EDUCATION CENTER
          (Menstrual Cycle Endocrinology, Biological Indicators of Fertility, Ovulation)
         ===================================================================== */}
      {activeModule === 'reproductive_center' && (
        <div className="space-y-6">
          {/* Sub-section A: Hypothalamic-Pituitary-Ovarian (HPO) Axis & 4 Cycle Phases */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B57D0] block">
                  Endocrine Physiology · HPO Axis Synchronization
                </span>
                <h3 className="font-display font-extrabold text-lg text-slate-900">
                  The 4 Menstrual Cycle Phases: Ovarian, Endometrial &amp; Hormonal Dynamics
                </h3>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-800 self-start sm:self-auto">
                Your Active Tracker: Day {cycleDay} of {avgCycleLength}
              </span>
            </div>

            {/* Phase Selector Pills */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {MENSTRUAL_BIOSCIENCE_PHASES.map((phase) => {
                const isSelected = phase.stageKey === selectedEduStage;
                const isUserCurrent = phase.stageKey === currentStageKey;
                return (
                  <button
                    key={phase.stageKey}
                    type="button"
                    onClick={() => setSelectedEduStage(phase.stageKey)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#0B57D0] text-white border-[#0B57D0] shadow-xs'
                        : 'bg-[#F8FAFC] hover:bg-slate-100 text-slate-800 border-[#E2E8F0]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] font-mono font-bold opacity-90">
                        {phase.typicalDays}
                      </span>
                      {isUserCurrent && (
                        <span
                          className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            isSelected
                              ? 'bg-white text-[#0B57D0]'
                              : 'bg-[#0B57D0]/10 text-[#0B57D0]'
                          }`}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    <div className="font-display font-extrabold text-xs sm:text-sm mt-1">
                      {phase.phaseTitle}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Phase Detailed Scientific Breakdown */}
            <div className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8F0] pb-3">
                <div>
                  <h4 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    {activePhaseBio.phaseTitle} ({activePhaseBio.typicalDays})
                  </h4>
                  <p className="text-xs font-mono text-[#0B57D0] font-semibold mt-0.5">
                    Dominant Endocrine Profile: {activePhaseBio.dominantHormones}
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#059669]/10 text-[#059669] border border-[#059669]/30 text-[11px] font-extrabold">
                  [Experimentally Determined Physiology]
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs sm:text-sm">
                <div className="bg-white rounded-xl p-3.5 border border-[#E2E8F0]">
                  <div className="font-extrabold text-slate-900 mb-1">
                    🔬 Ovarian &amp; Follicular Event
                  </div>
                  <p className="text-slate-700 leading-relaxed">{activePhaseBio.ovarianEvent}</p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-[#E2E8F0]">
                  <div className="font-extrabold text-slate-900 mb-1">
                    🩸 Endometrial (Uterine Lining) Remodeling
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {activePhaseBio.endometrialEvent}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-[#E2E8F0]">
                  <div className="font-extrabold text-slate-900 mb-1">
                    💧 Cervical Mucus &amp; Basal Body Temperature (BBT)
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    <strong>Mucus:</strong> {activePhaseBio.cervicalMucusProfile}
                    <br />
                    <strong>BBT:</strong> {activePhaseBio.basalBodyTempProfile}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-3.5 border border-[#E2E8F0]">
                  <div className="font-extrabold text-slate-900 mb-1">
                    🤰 Biological Fertility Window &amp; Clinical Pearl
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    <strong>Fertility Probability:</strong> {activePhaseBio.fertilityStatus}
                    <br />
                    <strong>Clinical Note:</strong> {activePhaseBio.clinicalSummary}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-section B: Biological Indicators of Fertility & Ovulation */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#007B83] block">
                  Evidence-Based Ovulation &amp; Fertility Biomarkers
                </span>
                <h3 className="font-display font-extrabold text-lg text-slate-900">
                  Biological Indicators of Fertility &amp; The 6-Day Fertile Window
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Conception is biologically possible during a <strong>6-day window</strong> each cycle: the <strong>5 days prior to ovulation</strong> (determined by sperm survival in estrogenic cervical mucus) plus the <strong>24 hours following ovulation</strong> (determined by oocyte lifespan).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FERTILITY_BIOMARKERS.map((bio) => (
                <div
                  key={bio.id}
                  className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 space-y-2.5 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                        {bio.name}
                      </h4>
                      <span className="px-2 py-0.5 rounded bg-[#0B57D0]/10 text-[#0B57D0] font-bold text-[10px] shrink-0">
                        {bio.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <strong>Physiological Mechanism:</strong> {bio.mechanism}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-950">
                        <strong className="block text-[10px] uppercase tracking-wider text-emerald-800">
                          Peak / Fertile Indicator:
                        </strong>
                        {bio.fertileSign}
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800">
                        <strong className="block text-[10px] uppercase tracking-wider text-slate-600">
                          Baseline / Non-Fertile:
                        </strong>
                        {bio.nonFertileSign}
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#E2E8F0] text-[11px] text-slate-600">
                    <strong>Clinical Interpretation:</strong> {bio.clinicalNote}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 2: CONTRACEPTIVE INFORMATION GUIDE
          (Methods, Mechanism of Action, Perfect vs. Typical Efficacy & Medical Disclaimer)
         ===================================================================== */}
      {activeModule === 'contraceptive_guide' && (
        <div className="space-y-5">
          {/* Mandatory Healthcare Professional Recommendation Banner */}
          <div className="rounded-2xl bg-amber-50 border-2 border-[#D97706] p-4 sm:p-5 flex items-start gap-3.5">
            <span className="text-2xl shrink-0">🩺</span>
            <div className="space-y-1">
              <div className="font-display font-extrabold text-sm sm:text-base text-amber-950">
                Medical Advisory: Always Consult a Licensed Healthcare Professional
              </div>
              <p className="text-xs sm:text-sm text-amber-900 leading-relaxed">
                This Contraceptive Information Guide provides objective, evidence-based scientific information on contraceptive mechanisms and general population efficacy (based on WHO &amp; CDC Trussell Contraceptive Failure tables). Choosing a contraceptive method depends on your individual medical history, blood pressure, migraine status, and reproductive goals. <strong>Always consult a licensed physician, gynecologist, midwife, or qualified campus healthcare provider for personalized medical advice and prescriptions.</strong>
              </p>
            </div>
          </div>

          {/* Contraceptive Mood & Emergency Pill Monthly Period Shift + Update LMP Callout Banner */}
          <div className="rounded-2xl bg-gradient-to-r from-rose-50 via-peach-50 to-lavender-50 border-2 border-rose-400 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3.5">
              <span className="text-2xl shrink-0">💊</span>
              <div className="space-y-1">
                <div className="font-display font-extrabold text-sm sm:text-base text-rose-950">
                  Contraceptive Mood State &amp; Emergency Pill Monthly Period Shift Notice
                </div>
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                  <strong>Important:</strong> If you take an <strong>emergency contraceptive pill in a month</strong>, it can lead to changes in how your period is found and calculated (delaying ovulation and shifting your next bleed earlier or later, alongside temporary hormone and mood changes). You must <strong>note the exact date and time down</strong> when you take it, and <strong>re-change your LMP (Last Menstrual Period) start date when you notice your period again</strong> so your cycle predictions stay accurate.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {onNavigateToUpdateLmp && (
                <button
                  type="button"
                  onClick={onNavigateToUpdateLmp}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>🩸</span>
                  <span>Back to Update LMP Start Date →</span>
                </button>
              )}
              {onNavigateToEmergencyPillLogger && (
                <button
                  type="button"
                  onClick={onNavigateToEmergencyPillLogger}
                  className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-peach-50 text-slate-800 border border-peach-300 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>⏱️</span>
                  <span>Note Pill Date &amp; Time</span>
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#007B83] block">
                  Evidence-Based Contraceptive Comparison
                </span>
                <h3 className="font-display font-extrabold text-lg text-slate-900">
                  Contraceptive Methods: Mechanism of Action &amp; General Efficacy
                </h3>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'All Methods (10)' },
                    { id: 'LARC', label: 'LARC (>99% Efficacy)' },
                    { id: 'HORMONAL_SHORT', label: 'Short-Acting Hormonal' },
                    { id: 'BARRIER_NON_HORMONAL', label: 'Barrier & Non-Hormonal' },
                    { id: 'EMERGENCY', label: 'Emergency Contraception' },
                  ] as Array<{ id: ContraceptiveCategory; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setContraceptiveFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                      contraceptiveFilter === tab.id
                        ? 'bg-[#007B83] text-white border-[#007B83]'
                        : 'bg-[#F8FAFC] hover:bg-slate-100 text-slate-700 border-[#E2E8F0]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Contraceptive Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredContraceptives.map((method) => (
                <div
                  key={method.id}
                  className="rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#007B83]/10 text-[#007B83]">
                          {method.categoryLabel}
                        </span>
                        <h4 className="font-display font-extrabold text-sm sm:text-base text-slate-900 mt-1">
                          {method.name}
                        </h4>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-[#059669]/15 text-[#059669] font-mono font-extrabold text-xs shrink-0">
                        Typical: {method.typicalUseEfficacy}
                      </span>
                    </div>

                    {/* Visual Efficacy Bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>Perfect Use: {method.perfectUseEfficacy}</span>
                        <span>Typical Use: {method.typicalUseEfficacy}</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#007B83]"
                          style={{ width: `${Math.min(100, Math.max(50, method.typicalNumeric))}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 space-y-1.5 leading-relaxed">
                      <div>
                        <strong>Active Hormone / Component:</strong> {method.hormoneContent}
                      </div>
                      <div>
                        <strong>Mechanism of Action:</strong> {method.mechanismOfAction}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div className="p-2 rounded-lg bg-white border border-[#E2E8F0]">
                          <span className="block text-[10px] font-bold uppercase text-slate-500">
                            Dosing / Duration
                          </span>
                          <span className="font-semibold text-slate-800">
                            {method.durationAndFrequency}
                          </span>
                        </div>
                        <div className="p-2 rounded-lg bg-white border border-[#E2E8F0]">
                          <span className="block text-[10px] font-bold uppercase text-slate-500">
                            STI Protection
                          </span>
                          <span className="font-semibold text-slate-800">
                            {method.stiProtection}
                          </span>
                        </div>
                      </div>
                      <div>
                        <strong>Return to Fertility:</strong> {method.returnToFertility}
                      </div>
                      <div className="text-slate-600">
                        <strong>Clinical Considerations:</strong> {method.clinicalNotes}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => inspectContraceptiveMolecule(method)}
                        className="px-3 py-1.5 rounded-lg bg-[#0B57D0] hover:bg-[#1A73E8] text-white font-bold text-[11px] transition-all cursor-pointer"
                      >
                        🔬 Inspect {method.pubchemCompoundName} (CID {method.pubchemCid}) in Molecular Lab →
                      </button>
                      {method.category === 'EMERGENCY' && onNavigateToUpdateLmp && (
                        <button
                          type="button"
                          onClick={onNavigateToUpdateLmp}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span>🩸</span>
                          <span>Update LMP Start Date →</span>
                        </button>
                      )}
                    </div>
                    <a
                      href={`https://pubchem.ncbi.nlm.nih.gov/compound/${method.pubchemCid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono font-bold text-[#0B57D0] hover:underline"
                    >
                      PubChem CID:{method.pubchemCid} ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODULE 3: LIVE MOLECULAR PHARMACOLOGY & LITERATURE WORKBENCH
          (Follows Science Skill Multi-Pane Workbench + Epistemic Provenance)
         ===================================================================== */}
      {activeModule === 'bioscience_workbench' && (
        <div className="space-y-5">
          {/* Top Quick-Try Example Pill Bar (Science Skill Mandatory Pattern) */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#9334E6] block">
                  Quick-Try Reproductive Hormones, Contraceptive Ligands &amp; Receptors
                </span>
                <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                  Select a Biological Identifier to Query Live PubChem, openFDA, UniProtKB &amp; AlphaFold DB
                </h3>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-mono text-[11px] font-bold">
                Active Target: {selectedExample.identifier}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {BIOSCIENCE_QUICK_EXAMPLES.map((ex) => {
                const isSelected = selectedExample.id === ex.id;
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => loadBioTargetDetails(ex)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-[#0B57D0] text-white border-[#0B57D0] shadow-2xs'
                        : 'bg-[#F8FAFC] hover:bg-slate-100 text-slate-800 border-[#E2E8F0]'
                    }`}
                  >
                    {ex.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split Interactive Canvas + Synchronized Data Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Pane: 2D Chemical Structure / AlphaFold Structural Preview */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E2E8F0] p-4 flex flex-col justify-between space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <span className="font-display font-extrabold text-sm text-slate-900">
                  {selectedExample.type === 'compound'
                    ? '🧪 PubChem 2D Chemical Structure'
                    : '🧬 AlphaFold DB / UniProt Structure'}
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0B57D0]/10 text-[#0B57D0] text-[10px] font-extrabold">
                  {selectedExample.type === 'compound'
                    ? '[Experimentally Determined]'
                    : '[Predicted by Model / Curated]'}
                </span>
              </div>

              {bioLoading ? (
                <div className="h-64 flex items-center justify-center text-xs font-bold text-slate-500">
                  Querying live scientific database for {selectedExample.identifier}...
                </div>
              ) : bioError ? (
                <div className="h-64 flex items-center justify-center text-xs text-rose-700 p-4 text-center">
                  {bioError}
                </div>
              ) : compoundData ? (
                <div className="flex flex-col items-center space-y-3">
                  <div className="w-full h-60 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center p-2">
                    <img
                      src={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${compoundData.cid}/PNG?image_size=300x300`}
                      alt={`${compoundData.name} 2D chemical structure`}
                      className="max-h-52 object-contain"
                    />
                  </div>
                  <div className="w-full text-xs text-slate-600 bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
                    <div className="font-bold text-slate-900 mb-0.5">
                      {compoundData.name} (PubChem CID: {compoundData.cid})
                    </div>
                    <p className="text-[11px]">{selectedExample.roleSummary}</p>
                  </div>
                </div>
              ) : proteinData ? (
                <div className="flex flex-col space-y-3">
                  {proteinData.alphafoldPaeImageUrl ? (
                    <div className="w-full rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 flex flex-col items-center">
                      <img
                        src={proteinData.alphafoldPaeImageUrl}
                        alt={`${proteinData.geneName} AlphaFold PAE matrix`}
                        className="max-h-48 object-contain rounded"
                      />
                      <span className="text-[10px] font-mono text-slate-500 mt-1.5">
                        AlphaFold Predicted Aligned Error (PAE) Matrix ({proteinData.alphafoldEntryId})
                      </span>
                    </div>
                  ) : null}

                  {/* Canonical 4-Band AlphaFold pLDDT Confidence Scale Legend */}
                  <div className="rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] p-3 space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">
                      AlphaFold pLDDT Confidence Scale
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-xs bg-[#0053D6] inline-block" />
                        Very High (&gt;90)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-xs bg-[#65CBF3] inline-block" />
                        Confident (70–90)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-xs bg-[#FFDB13] inline-block" />
                        Low (50–70)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-xs bg-[#FF7D45] inline-block" />
                        Very Low (&lt;50)
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Outbound Authoritative Source Citation Links */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                {compoundData ? (
                  <>
                    <a
                      href={`https://pubchem.ncbi.nlm.nih.gov/compound/${compoundData.cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-[#0B57D0] hover:underline"
                    >
                      Open in PubChem (CID {compoundData.cid}) ↗
                    </a>
                    <a
                      href={`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${compoundData.cid}/SDF?record_type=3d`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-[#007B83] hover:underline"
                    >
                      Download 3D SDF ↗
                    </a>
                  </>
                ) : proteinData ? (
                  <>
                    <a
                      href={`https://www.uniprot.org/uniprotkb/${proteinData.accession}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-[#0B57D0] hover:underline"
                    >
                      UniProtKB ({proteinData.accession}) ↗
                    </a>
                    <a
                      href={`https://alphafold.ebi.ac.uk/entry/${proteinData.accession}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-[#007B83] hover:underline"
                    >
                      AlphaFold 3D Structure ↗
                    </a>
                  </>
                ) : null}
              </div>
            </div>

            {/* Right Pane: Synchronized Physicochemical / Protein Metadata Inspector */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h4 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                  Synchronized Molecular &amp; Pharmacological Data Inspector
                </h4>
                <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-[#059669] border border-emerald-200 text-[10px] font-extrabold">
                  Live REST API Response
                </span>
              </div>

              {compoundData && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Molecular Formula
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {compoundData.formula}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Molecular Weight
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {compoundData.molecularWeight} Da
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Lipophilicity (XLogP)
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {compoundData.xLogP !== null ? compoundData.xLogP : 'N/A'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Polar Surface (TPSA)
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {compoundData.tpsa !== null ? `${compoundData.tpsa} Å²` : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Lipinski Rule of Five & Veber Oral Bioavailability Assessment */}
                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">
                        Lipinski&apos;s Rule of Five &amp; Veber Bioavailability Profile
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                          lipinskiViolations <= 1
                            ? 'bg-emerald-100 text-[#059669]'
                            : 'bg-amber-100 text-[#D97706]'
                        }`}
                      >
                        {lipinskiViolations <= 1
                          ? `Orally Bioavailable (${lipinskiViolations} Violations)`
                          : `${lipinskiViolations} Rule Violations`}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-700">
                      <div>H-Bond Donors: {compoundData.hBondDonor} (≤5)</div>
                      <div>H-Bond Acceptors: {compoundData.hBondAcceptor} (≤10)</div>
                      <div>Rotatable Bonds: {compoundData.rotatableBonds} (≤10)</div>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] font-mono break-all">
                      <strong className="text-slate-600 block text-[10px] uppercase">
                        Canonical SMILES:
                      </strong>
                      {compoundData.canonicalSmiles}
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] font-mono break-all">
                      <strong className="text-slate-600 block text-[10px] uppercase">
                        InChIKey:
                      </strong>
                      {compoundData.inChIKey}
                    </div>
                  </div>

                  {compoundData.fdaIndicationSnippet && (
                    <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-slate-800">
                      <strong className="text-[#0B57D0] block text-[10px] uppercase tracking-wider mb-0.5">
                        openFDA Drug Product Labeling Excerpt:
                      </strong>
                      {compoundData.fdaIndicationSnippet}
                    </div>
                  )}
                </div>
              )}

              {proteinData && (
                <div className="space-y-3.5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Gene Symbol
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {proteinData.geneName}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        UniProt Accession
                      </span>
                      <span className="font-mono font-extrabold text-sm text-[#0B57D0]">
                        {proteinData.accession}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                      <span className="text-[10px] font-bold uppercase text-slate-500 block">
                        Sequence Length
                      </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        {proteinData.sequenceLength} aa
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5 text-xs">
                    <div className="font-extrabold text-slate-900">
                      {proteinData.proteinName} ({proteinData.organism})
                    </div>
                    <p className="text-slate-700 leading-relaxed">{proteinData.functionText}</p>
                  </div>

                  {proteinData.alphafoldCifUrl && (
                    <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-200 flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-teal-950">
                        AlphaFold v6 mmCIF Coordinate Structure Ready ({proteinData.alphafoldEntryId})
                      </span>
                      <a
                        href={proteinData.alphafoldCifUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1 rounded-lg bg-[#007B83] text-white font-mono font-bold text-[11px] shrink-0"
                      >
                        Download .cif ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Live Peer-Reviewed Biomedical Literature Explorer (Europe PMC REST API) */}
          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0B57D0] block">
                  Europe PMC &amp; PubMed Biomedical Literature Explorer
                </span>
                <h4 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                  Peer-Reviewed Reproductive Health &amp; Contraceptive Clinical Studies
                </h4>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Ovulation Biomarkers', q: 'menstrual cycle ovulation fertility biomarkers' },
                  { label: 'LARC Contraceptive Efficacy', q: 'long acting reversible contraception efficacy IUD implant' },
                  { label: 'Emergency Contraception', q: 'emergency contraception ulipristal levonorgestrel ovulation' },
                  { label: 'Luteal Phase & BBT', q: 'basal body temperature progesterone luteal phase' },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setLitQuery(preset.q);
                      searchEuropePmcLiterature(preset.q);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-slate-100 text-slate-700 border border-[#E2E8F0] text-[11px] font-bold cursor-pointer"
                  >
                    🔎 {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                searchEuropePmcLiterature(litQuery);
              }}
              className="flex flex-col sm:flex-row gap-2"
            >
              <input
                type="text"
                value={litQuery}
                onChange={(e) => setLitQuery(e.target.value)}
                placeholder="Search PubMed / Europe PMC reproductive health studies..."
                className="flex-1 px-3.5 py-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-xs sm:text-sm font-medium text-slate-900 outline-none focus:border-[#0B57D0]"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0B57D0] hover:bg-[#1A73E8] text-white font-extrabold text-xs sm:text-sm cursor-pointer shrink-0"
              >
                {litLoading ? 'Searching...' : 'Search Literature'}
              </button>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {litArticles.map((art) => (
                <div
                  key={art.id}
                  className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex flex-col justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono font-bold text-[#007B83]">
                        {art.journalTitle} ({art.pubYear})
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-200/70 text-slate-800 text-[10px] font-bold">
                        Cited by {art.citedByCount}
                      </span>
                    </div>
                    <div className="font-display font-bold text-xs sm:text-sm text-slate-900 leading-snug">
                      {art.title}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{art.authorString}</div>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#E2E8F0] text-[11px]">
                    <span className="font-bold text-emerald-700">[Literature Curated]</span>
                    {art.pmid ? (
                      <a
                        href={`https://pubmed.ncbi.nlm.nih.gov/${art.pmid}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-bold text-[#0B57D0] hover:underline"
                      >
                        PMID:{art.pmid} ↗
                      </a>
                    ) : art.doi ? (
                      <a
                        href={`https://doi.org/${art.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono font-bold text-[#0B57D0] hover:underline"
                      >
                        DOI ↗
                      </a>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FOOTER: HEALTHCARE PROFESSIONAL DISCLAIMER & CREATOR BRANDING MAINTENANCE */}
      <div className="rounded-2xl bg-white border border-[#E2E8F0] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
        <div>
          <strong>🩺 Medical Disclaimer:</strong> Educational content is for informational purposes only and is not a substitute for professional medical diagnosis or contraceptive counseling. Always consult a licensed physician or gynecologist.
        </div>
        <div className="shrink-0 font-bold text-slate-800">
          Created by {CREATOR_NAME} ({CREATOR_EMAIL})
        </div>
      </div>
    </section>
  );
};
