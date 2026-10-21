import { AdminConfig, CycleMetrics, PeriodRecord, StageKey, UserData } from '../types';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_FREE_ACCESS_PASSWORD,
  OWNER_ADMIN_EMAIL,
  SECRET_VIP_PASSWORDS,
  STORAGE_ADMIN_CONFIG_KEY,
} from '../constants';

const OriginalDate = Date;
const originalDateNow = Date.now.bind(Date);

/**
 * Permanent, immutable real-time system date function.
 * Strictly read-only: captures the real-time current date from the system clock
 * and cannot be overridden, manipulated, or changed by user or manual inputs.
 */
export function getLockedRealTimeDate(): Readonly<Date> {
  const realTimeNow = new OriginalDate(originalDateNow());
  return Object.freeze(realTimeNow);
}

/**
 * Returns the strictly read-only real-time current date in YYYY-MM-DD (ISO) format.
 * Takes zero parameters so it can never be overridden by user inputs.
 */
export function getLockedTodayISO(): string {
  const now = getLockedRealTimeDate();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns a human-readable string of the locked real-time current date.
 */
export function formatLockedTodayHuman(): string {
  const now = getLockedRealTimeDate();
  return now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateISO(dateObj: Date): string {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return getLockedTodayISO();
  }
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateTimeLocalISO(dateObj: Date): string {
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    dateObj = new OriginalDate(originalDateNow());
  }
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  const hh = String(dateObj.getHours()).padStart(2, '0');
  const mm = String(dateObj.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

export function parseDateISO(isoStr: string): Date {
  if (!isoStr || typeof isoStr !== 'string') {
    const locked = getLockedRealTimeDate();
    return new OriginalDate(locked.getFullYear(), locked.getMonth(), locked.getDate(), 12, 0, 0);
  }
  const parts = isoStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    const locked = getLockedRealTimeDate();
    return new OriginalDate(locked.getFullYear(), locked.getMonth(), locked.getDate(), 12, 0, 0);
  }
  const [y, m, d] = parts;
  return new OriginalDate(y, m - 1, d, 12, 0, 0);
}

export function addDaysISO(isoStr: string, daysToAdd: number): string {
  const d = parseDateISO(isoStr);
  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return formatDateISO(d);
}

export function formatHumanDate(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = parseDateISO(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortMonthDay(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = parseDateISO(isoStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function diffDays(dateStrA: string, dateStrB: string): number {
  const a = parseDateISO(dateStrA);
  const b = parseDateISO(dateStrB);
  const utcA = OriginalDate.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = OriginalDate.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

export function getAdminConfig(): AdminConfig {
  try {
    const raw = localStorage.getItem(STORAGE_ADMIN_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ownerEmail: OWNER_ADMIN_EMAIL,
        adminPassword: parsed.adminPassword || DEFAULT_ADMIN_PASSWORD,
        freeAccessPassword: parsed.freeAccessPassword || DEFAULT_FREE_ACCESS_PASSWORD,
        additionalAdmins: Array.isArray(parsed.additionalAdmins) ? parsed.additionalAdmins : [],
        updatedAt: parsed.updatedAt || getLockedRealTimeDate().toISOString(),
      };
    }
  } catch {
    // ignore
  }
  return {
    ownerEmail: OWNER_ADMIN_EMAIL,
    adminPassword: DEFAULT_ADMIN_PASSWORD,
    freeAccessPassword: DEFAULT_FREE_ACCESS_PASSWORD,
    additionalAdmins: [],
    updatedAt: getLockedRealTimeDate().toISOString(),
  };
}

export function saveAdminConfig(config: AdminConfig): void {
  try {
    localStorage.setItem(STORAGE_ADMIN_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Could not save admin config', e);
  }
}

export function isOwnerAdminCredentials(
  email: string,
  password: string,
  adminConfig?: AdminConfig
): boolean {
  const cfg = adminConfig || getAdminConfig();
  const emailClean = email.trim().toLowerCase();
  const passClean = password.trim();
  const passLower = passClean.toLowerCase();
  const cfgAdminLower = cfg.adminPassword.trim().toLowerCase();
  const defaultAdminLower = DEFAULT_ADMIN_PASSWORD.trim().toLowerCase();
  const defaultFreeLower = DEFAULT_FREE_ACCESS_PASSWORD.trim().toLowerCase();

  if (
    emailClean === OWNER_ADMIN_EMAIL.toLowerCase() &&
    (passClean === cfg.adminPassword.trim() ||
      passLower === cfgAdminLower ||
      passLower === defaultAdminLower ||
      passLower === defaultAdminLower.replace(/\.$/, '') ||
      passLower === defaultFreeLower)
  ) {
    return true;
  }

  if (Array.isArray(cfg.additionalAdmins)) {
    const matched = cfg.additionalAdmins.some(
      (adm) =>
        adm &&
        typeof adm.email === 'string' &&
        typeof adm.password === 'string' &&
        adm.email.trim().toLowerCase() === emailClean &&
        (adm.password.trim() === passClean ||
          adm.password.trim().toLowerCase() === passLower)
    );
    if (matched) return true;
  }

  return false;
}

export function isSecretVipPassword(str: string, customFreePass?: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  const activeFreePass = (customFreePass || getAdminConfig().freeAccessPassword).trim();
  if (trimmed === activeFreePass || trimmed === `${activeFreePass}.`) {
    return true;
  }
  return SECRET_VIP_PASSWORDS.includes(trimmed);
}

export function getSortedPeriods(periods: PeriodRecord[] | undefined): PeriodRecord[] {
  if (!Array.isArray(periods)) return [];
  return [...periods]
    .filter((p) => p && typeof p.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.startDate))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function calculateCycleMetrics(
  userData: UserData | null,
  referenceDateStr?: string
): CycleMetrics {
  const lockedTodayStr = getLockedTodayISO();
  const refDateStr =
    referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
      ? referenceDateStr
      : lockedTodayStr;

  const periods = getSortedPeriods(userData?.periods);
  const customCycleLen =
    userData?.customCycleLength &&
    userData.customCycleLength >= 18 &&
    userData.customCycleLength <= 60
      ? Math.round(userData.customCycleLength)
      : null;

  let avgCycleLength = customCycleLen || 28;
  let avgPeriodDuration = 5;

  if (!customCycleLen && periods.length >= 2) {
    let totalCycleDays = 0;
    let cycleCount = 0;
    for (let i = 1; i < periods.length; i++) {
      const gap = diffDays(periods[i - 1].startDate, periods[i].startDate);
      if (gap >= 15 && gap <= 65) {
        totalCycleDays += gap;
        cycleCount++;
      }
    }
    if (cycleCount > 0) {
      avgCycleLength = Math.round(totalCycleDays / cycleCount);
    }
  }

  let durTotal = 0;
  let durCount = 0;
  periods.forEach((p) => {
    if (p.startDate && p.endDate && p.endDate >= p.startDate) {
      const d = diffDays(p.startDate, p.endDate) + 1;
      if (d >= 1 && d <= 20) {
        durTotal += d;
        durCount++;
      }
    }
  });
  if (durCount > 0) {
    avgPeriodDuration = Math.round(durTotal / durCount);
  }

  if (periods.length === 0) {
    return {
      avgCycleLength,
      avgPeriodDuration,
      activePeriodStartStr: null,
      activePeriodEndStr: null,
      activePeriodDuration: avgPeriodDuration,
      effectiveCycleStartStr: null,
      effectiveCycleEndStr: null,
      autoRolloverCycles: 0,
      rawDaysSinceLmp: 0,
      cycleDay: 1,
      stageKey: 'MENSTRUATION',
      ovulationDay: Math.max(avgPeriodDuration + 2, avgCycleLength - 14),
      ovStart: Math.max(avgPeriodDuration + 1, avgCycleLength - 19),
      ovEnd: Math.min(avgCycleLength - 1, avgCycleLength - 13),
      ovulationDateStr: null,
      nextPeriodDateStr: null,
      nextPeriodEndDateStr: null,
      ovulationWindowStartStr: null,
      ovulationWindowEndStr: null,
      daysUntilNextPeriod: null,
      isIrregular: false,
      lockedTodayStr,
    };
  }

  // Primary logged period (most recently entered/chronologically latest LMP)
  const latestPeriod = periods[periods.length - 1];
  const latestBleedDuration =
    latestPeriod.endDate && latestPeriod.endDate >= latestPeriod.startDate
      ? Math.max(1, Math.min(20, diffDays(latestPeriod.startDate, latestPeriod.endDate) + 1))
      : avgPeriodDuration;
  const latestEffectiveEndStr =
    latestPeriod.endDate && latestPeriod.endDate >= latestPeriod.startDate
      ? latestPeriod.endDate
      : addDaysISO(latestPeriod.startDate, latestBleedDuration - 1);

  // Check if refDateStr is directly inside ANY logged period
  const directLoggedPeriod = periods.find((p) => {
    const pDur =
      p.endDate && p.endDate >= p.startDate
        ? Math.max(1, Math.min(20, diffDays(p.startDate, p.endDate) + 1))
        : avgPeriodDuration;
    const effectiveEnd =
      p.endDate && p.endDate >= p.startDate
        ? p.endDate
        : addDaysISO(p.startDate, pDur - 1);
    return refDateStr >= p.startDate && refDateStr <= effectiveEnd;
  });

  // Find which logged period cycle refDateStr belongs to
  let activeIndex = -1;
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].startDate <= refDateStr) {
      activeIndex = i;
      break;
    }
  }

  // Anchor period for the reference date (if refDateStr is before all logged periods, use earliest period)
  const anchorPeriod = activeIndex >= 0 ? periods[activeIndex] : latestPeriod;
  const nextLoggedPeriod =
    activeIndex >= 0 && activeIndex + 1 < periods.length ? periods[activeIndex + 1] : null;

  let effectiveCycleLength = avgCycleLength;
  if (nextLoggedPeriod) {
    const actualGap = diffDays(anchorPeriod.startDate, nextLoggedPeriod.startDate);
    if (actualGap >= 15 && actualGap <= 65) {
      effectiveCycleLength = actualGap;
    }
  }

  let activeDuration = avgPeriodDuration;
  if (anchorPeriod.endDate && anchorPeriod.endDate >= anchorPeriod.startDate) {
    const customDur = diffDays(anchorPeriod.startDate, anchorPeriod.endDate) + 1;
    if (customDur >= 1 && customDur <= 20) {
      activeDuration = customDur;
    }
  }

  const activePeriodStartStr = anchorPeriod.startDate;
  const activePeriodEndStr =
    anchorPeriod.endDate && anchorPeriod.endDate >= anchorPeriod.startDate
      ? anchorPeriod.endDate
      : addDaysISO(anchorPeriod.startDate, activeDuration - 1);

  // Compute exact Ovulation Day and Fertile Window strictly from the entered period Start & End Dates
  const ovulationDay = Math.min(
    effectiveCycleLength - 2,
    Math.max(activeDuration + 2, effectiveCycleLength - 14)
  );
  const ovStart = Math.max(activeDuration + 1, ovulationDay - 5);
  const ovEnd = Math.min(effectiveCycleLength - 1, ovulationDay + 1);

  let cycleDay = 1;
  if (activeIndex >= 0) {
    const rawDiff = diffDays(anchorPeriod.startDate, refDateStr);
    if (!nextLoggedPeriod && rawDiff >= effectiveCycleLength) {
      // Automatically roll over based on standard cycle calculations when a new cycle has elapsed
      cycleDay = (rawDiff % effectiveCycleLength) + 1;
    } else {
      cycleDay = rawDiff + 1;
    }
  } else {
    const earliestPeriod = periods[0];
    const rawDiffBefore = diffDays(earliestPeriod.startDate, refDateStr);
    cycleDay =
      (((rawDiffBefore % effectiveCycleLength) + effectiveCycleLength) % effectiveCycleLength) + 1;
  }

  let stageKey: StageKey = 'LUTEAL';
  if (directLoggedPeriod) {
    stageKey = 'MENSTRUATION';
    cycleDay = diffDays(directLoggedPeriod.startDate, refDateStr) + 1;
  } else if (
    activeIndex >= 0 &&
    refDateStr >= anchorPeriod.startDate &&
    refDateStr <= activePeriodEndStr
  ) {
    stageKey = 'MENSTRUATION';
  } else if (cycleDay >= 1 && cycleDay <= activeDuration) {
    stageKey = 'MENSTRUATION';
  } else if (cycleDay > activeDuration && cycleDay < ovStart) {
    stageKey = 'FOLLICULAR';
  } else if (cycleDay >= ovStart && cycleDay <= ovEnd) {
    stageKey = 'OVULATION';
  } else {
    stageKey = 'LUTEAL';
  }

  // Exact Fertile Window, Peak Ovulation Date, and Next Period Date anchored to the recorded LMP,
  // with automatic standard cycle rollover if 1 or more full cycles have elapsed since latestPeriod.startDate.
  const latestOvulationDay = Math.min(
    avgCycleLength - 2,
    Math.max(latestBleedDuration + 2, avgCycleLength - 14)
  );
  const latestOvStart = Math.max(latestBleedDuration + 1, latestOvulationDay - 5);
  const latestOvEnd = Math.min(avgCycleLength - 1, latestOvulationDay + 1);

  const rawDaysSinceLmp = diffDays(latestPeriod.startDate, lockedTodayStr);
  const autoRolloverCycles =
    rawDaysSinceLmp >= avgCycleLength ? Math.floor(rawDaysSinceLmp / avgCycleLength) : 0;

  const effectiveCycleStartStr =
    autoRolloverCycles > 0
      ? addDaysISO(latestPeriod.startDate, autoRolloverCycles * avgCycleLength)
      : latestPeriod.startDate;
  const effectiveCycleEndStr =
    autoRolloverCycles > 0
      ? addDaysISO(effectiveCycleStartStr, latestBleedDuration - 1)
      : latestEffectiveEndStr;

  const ovulationDateStr = addDaysISO(effectiveCycleStartStr, latestOvulationDay - 1);
  const ovulationWindowStartStr = addDaysISO(effectiveCycleStartStr, latestOvStart - 1);
  const ovulationWindowEndStr = addDaysISO(effectiveCycleStartStr, latestOvEnd - 1);

  const nextPeriodDateStr = addDaysISO(effectiveCycleStartStr, avgCycleLength);
  const nextPeriodEndDateStr = addDaysISO(nextPeriodDateStr, latestBleedDuration - 1);

  // Days until next period measured from the strictly read-only Locked Real-Time Today
  const daysUntilNextPeriod = diffDays(lockedTodayStr, nextPeriodDateStr);

  const isIrregular = avgCycleLength < 25 || avgCycleLength > 35;

  return {
    avgCycleLength,
    avgPeriodDuration: latestBleedDuration,
    activePeriodStartStr: latestPeriod.startDate,
    activePeriodEndStr: latestEffectiveEndStr,
    activePeriodDuration: latestBleedDuration,
    effectiveCycleStartStr,
    effectiveCycleEndStr,
    autoRolloverCycles,
    rawDaysSinceLmp: Math.max(1, rawDaysSinceLmp + 1),
    cycleDay,
    stageKey,
    ovulationDay: latestOvulationDay,
    ovStart: latestOvStart,
    ovEnd: latestOvEnd,
    ovulationDateStr,
    nextPeriodDateStr,
    nextPeriodEndDateStr,
    ovulationWindowStartStr,
    ovulationWindowEndStr,
    daysUntilNextPeriod,
    isIrregular,
    lockedTodayStr,
  };
}

export function isDateInLoggedPeriod(userData: UserData | null, dateStr: string): boolean {
  if (!userData || !userData.periods) return false;
  const metrics = calculateCycleMetrics(userData, dateStr);
  return userData.periods.some((p) => {
    const pDur =
      p.endDate && p.endDate >= p.startDate
        ? Math.max(1, Math.min(20, diffDays(p.startDate, p.endDate) + 1))
        : metrics.avgPeriodDuration;
    const effectiveEnd =
      p.endDate && p.endDate >= p.startDate
        ? p.endDate
        : addDaysISO(p.startDate, pDur - 1);
    return dateStr >= p.startDate && dateStr <= effectiveEnd;
  });
}

export function isDateInPredictedPeriod(dateStr: string, metrics: CycleMetrics): boolean {
  if (!metrics.activePeriodStartStr) return false;
  const bleedDays = metrics.activePeriodDuration || metrics.avgPeriodDuration || 5;
  for (let cycleOffset = 1; cycleOffset <= 12; cycleOffset++) {
    const start = addDaysISO(
      metrics.activePeriodStartStr,
      cycleOffset * metrics.avgCycleLength
    );
    const end = addDaysISO(start, bleedDays - 1);
    if (dateStr >= start && dateStr <= end) return true;
  }
  return false;
}

export function getFertileStatusForDate(
  userData: UserData | null,
  dateStr: string,
  metrics: CycleMetrics
): { isFertileWindow: boolean; isPeakOvulation: boolean } {
  if (!userData || !userData.periods || userData.periods.length === 0) {
    return { isFertileWindow: false, isPeakOvulation: false };
  }
  if (isDateInLoggedPeriod(userData, dateStr) || isDateInPredictedPeriod(dateStr, metrics)) {
    return { isFertileWindow: false, isPeakOvulation: false };
  }

  const periods = getSortedPeriods(userData.periods);
  // Check each logged period's cycle
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const nextP = i + 1 < periods.length ? periods[i + 1] : null;
    let cLen = metrics.avgCycleLength;
    if (nextP) {
      const gap = diffDays(p.startDate, nextP.startDate);
      if (gap >= 15 && gap <= 65) cLen = gap;
    }
    const pDur =
      p.endDate && p.endDate >= p.startDate
        ? Math.max(1, Math.min(20, diffDays(p.startDate, p.endDate) + 1))
        : metrics.avgPeriodDuration;
    const ovDay = Math.min(cLen - 2, Math.max(pDur + 2, cLen - 14));
    const ovS = Math.max(pDur + 1, ovDay - 5);
    const ovE = Math.min(cLen - 1, ovDay + 1);

    const fStart = addDaysISO(p.startDate, ovS - 1);
    const fEnd = addDaysISO(p.startDate, ovE - 1);
    const fPeak = addDaysISO(p.startDate, ovDay - 1);
    if (dateStr >= fStart && dateStr <= fEnd) {
      return { isFertileWindow: true, isPeakOvulation: dateStr === fPeak };
    }
  }

  // Check auto-rolled-over and future predicted cycles starting from the latest recorded LMP
  if (metrics.activePeriodStartStr) {
    for (let cycleOffset = 1; cycleOffset <= 12; cycleOffset++) {
      const cycleStart = addDaysISO(
        metrics.activePeriodStartStr,
        cycleOffset * metrics.avgCycleLength
      );
      const fStart = addDaysISO(cycleStart, metrics.ovStart - 1);
      const fEnd = addDaysISO(cycleStart, metrics.ovEnd - 1);
      const fPeak = addDaysISO(cycleStart, metrics.ovulationDay - 1);
      if (dateStr >= fStart && dateStr <= fEnd) {
        return { isFertileWindow: true, isPeakOvulation: dateStr === fPeak };
      }
    }
  }

  return { isFertileWindow: false, isPeakOvulation: false };
}

export function getTrialStatus(userData: UserData | null): {
  status: 'trial' | 'subscribed' | 'free_password' | 'pending_verification' | 'expired';
  daysLeft: number;
  label: string;
} {
  if (!userData) {
    return { status: 'trial', daysLeft: 14, label: '🎁 2-Week Free Access: 14 Days Left' };
  }

  const nowMs = getLockedRealTimeDate().getTime();

  if (
    userData.subscriptionStatus === 'pending_verification' ||
    userData.pendingPayment?.status === 'pending'
  ) {
    return {
      status: 'pending_verification',
      daysLeft: 0,
      label: '⏳ Pending Owner Verification (Orange Money)',
    };
  }

  if (userData.subscriptionStatus === 'expired') {
    return {
      status: 'expired',
      daysLeft: 0,
      label: '🔒 Free Access Expired • Renew to Unlock',
    };
  }

  if (userData.subscriptionUntil) {
    if (userData.subscriptionUntil > nowMs) {
      const daysRemaining = Math.ceil(
        (userData.subscriptionUntil - nowMs) / (1000 * 60 * 60 * 24)
      );
      if (userData.paymentMethod?.includes('Orange Money')) {
        return {
          status: 'subscribed',
          daysLeft: daysRemaining,
          label: `✅ Active Pass: ${daysRemaining}d Left (Orange Money)`,
        };
      }
      return {
        status: 'trial',
        daysLeft: daysRemaining,
        label: `🎁 Free Access: ${daysRemaining}d Left`,
      };
    } else {
      return {
        status: 'expired',
        daysLeft: 0,
        label: '🔒 2-Week Free Access Ended • Renew Pass (Le 30)',
      };
    }
  }

  const msElapsed = nowMs - (userData.createdAt || nowMs);
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, 14 - daysElapsed);
  if (daysElapsed >= 14) {
    return {
      status: 'expired',
      daysLeft: 0,
      label: '🔒 2-Week Free Access Ended • Renew Pass (Le 30)',
    };
  }
  return { status: 'trial', daysLeft, label: `🎁 2-Week Free Access: ${daysLeft}d Left` };
}

export function createDefaultUserObject(
  name: string,
  email: string,
  password: string,
  age = '',
  phone = ''
): UserData {
  const today = getLockedRealTimeDate();
  const nineDaysAgo = new OriginalDate(today.getFullYear(), today.getMonth(), today.getDate() - 9);
  const fiveDaysAhead = new OriginalDate(today.getFullYear(), today.getMonth(), today.getDate() + 5);
  const twelveDaysAhead = new OriginalDate(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 12
  );

  // Automatic 2-Week (14-Day) Free Access on Account Creation / Sign-In
  const initialSubUntil = today.getTime() + 14 * 24 * 60 * 60 * 1000;

  const nowIso = today.toISOString();
  return {
    name: name || email.split('@')[0],
    age: age ? String(age).trim() : '',
    email: email.toLowerCase(),
    phone: phone ? String(phone).trim() : '',
    password,
    createdAt: today.getTime(),
    lastUpdatedAt: nowIso,
    lastSignInAt: nowIso,
    signInCount: 1,
    signupSource: 'Create Account',
    isVip: false,
    usedFreeAccessPassword: false,
    subscriptionStatus: 'active',
    subscriptionUntil: initialSubUntil,
    paymentMethod: '2-Week Free Access',
    periods: [],
    emergencyPills: [],
    dailyLogs: {},
    skincareGoal: 'Even Skin Tone & Clear Dark Spots',
    therapyLogs: [
      {
        id: 't-sample-1',
        treatmentType: 'Deep Cleansing & Glow Facial Treatment',
        sessionDate: formatDateISO(nineDaysAgo),
        postSessionFeeling: 'Skin felt super hydrated and calm right as my period ended!',
        stageAtSession: 'Follicular',
      },
    ],
    appointments: [],
    academicTasks: [
      {
        id: 'task-1',
        title: 'Biochemistry Midterm Exam',
        course: 'BIOL 204',
        dueDate: formatDateISO(fiveDaysAhead),
        type: 'Exam',
        completed: false,
      },
      {
        id: 'task-2',
        title: 'Research Group Presentation',
        course: 'SOCI 102',
        dueDate: formatDateISO(twelveDaysAhead),
        type: 'Presentation',
        completed: false,
      },
    ],
  };
}
