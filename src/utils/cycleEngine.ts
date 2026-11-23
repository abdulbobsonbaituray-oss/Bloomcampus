import { AdminConfig, CycleMetrics, PeriodRecord, StageKey, UserData } from '../types';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_FREE_ACCESS_PASSWORD,
  FREE_TRIAL_DAYS,
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
    .filter(
      (p) =>
        p &&
        !p.autoGenerated &&
        typeof p.startDate === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(p.startDate)
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export interface AutoAdvancePeriodsResult {
  changed: boolean;
  periods: PeriodRecord[];
  latestPeriod: PeriodRecord | null;
  previousPeriod: PeriodRecord | null;
  autoAdvancedCount: number;
}

/**
 * Sanitizes a user's logged period records by removing any legacy computer-generated
 * (`autoGenerated: true`) entries without ever fabricating start or end dates.
 */
export function autoAdvancePeriodsIfNeeded(
  userData: UserData | null,
  _referenceDateStr?: string
): AutoAdvancePeriodsResult {
  if (!userData || !Array.isArray(userData.periods)) {
    return {
      changed: false,
      periods: [],
      latestPeriod: null,
      previousPeriod: null,
      autoAdvancedCount: 0,
    };
  }

  const realPeriods = getSortedPeriods(userData.periods).map((p) => ({
    startDate: p.startDate,
    endDate: p.endDate && p.endDate >= p.startDate ? p.endDate : null,
  }));

  const rawCount = userData.periods.length;
  const hadAutoGenerated = userData.periods.some((p) => Boolean(p?.autoGenerated));
  const changed = hadAutoGenerated || realPeriods.length !== rawCount;

  const latestPeriod = realPeriods.length > 0 ? realPeriods[realPeriods.length - 1] : null;
  const previousPeriod = realPeriods.length > 1 ? realPeriods[realPeriods.length - 2] : null;

  return {
    changed,
    periods: realPeriods,
    latestPeriod,
    previousPeriod,
    autoAdvancedCount: 0,
  };
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
  const hasLoggedPeriods = periods.length > 0;
  const customCycleLen =
    userData?.customCycleLength &&
    userData.customCycleLength >= 18 &&
    userData.customCycleLength <= 60
      ? Math.round(userData.customCycleLength)
      : null;

  let measuredCycleAvg: number | null = null;
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
      measuredCycleAvg = Math.round(totalCycleDays / cycleCount);
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
  const avgPeriodDuration = durCount > 0 ? Math.round(durTotal / durCount) : 0;

  if (!hasLoggedPeriods) {
    return {
      hasLoggedPeriods: false,
      avgCycleLength: customCycleLen || 0,
      avgPeriodDuration: 0,
      activePeriodStartStr: null,
      activePeriodEndStr: null,
      activePeriodDuration: 0,
      effectiveCycleStartStr: null,
      effectiveCycleEndStr: null,
      autoRolloverCycles: 0,
      wasAutoRolledOver: false,
      previousPeriodStartStr: null,
      previousPeriodEndStr: null,
      rawDaysSinceLmp: 0,
      cycleDay: 0,
      stageKey: 'FOLLICULAR',
      ovulationDay: 0,
      ovStart: 0,
      ovEnd: 0,
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

  const avgCycleLength = customCycleLen || measuredCycleAvg || 28;
  const projectionBleedDuration = avgPeriodDuration > 0 ? avgPeriodDuration : 5;

  // Primary logged period (most recently entered/chronologically latest LMP)
  const latestPeriod = periods[periods.length - 1];
  const previousPeriod = periods.length > 1 ? periods[periods.length - 2] : null;
  const latestBleedDuration =
    latestPeriod.endDate && latestPeriod.endDate >= latestPeriod.startDate
      ? Math.max(1, Math.min(20, diffDays(latestPeriod.startDate, latestPeriod.endDate) + 1))
      : avgPeriodDuration;
  const latestEffectiveEndStr =
    latestPeriod.endDate && latestPeriod.endDate >= latestPeriod.startDate
      ? latestPeriod.endDate
      : latestPeriod.startDate;

  // Check if refDateStr is directly inside ANY logged period
  const directLoggedPeriod = periods.find((p) => {
    const effectiveEnd =
      p.endDate && p.endDate >= p.startDate ? p.endDate : p.startDate;
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

  // Anchor period for the reference date
  const anchorPeriod = activeIndex >= 0 ? periods[activeIndex] : periods[0];
  const nextLoggedPeriod =
    activeIndex >= 0 && activeIndex + 1 < periods.length ? periods[activeIndex + 1] : null;

  let effectiveCycleLength = avgCycleLength;
  if (nextLoggedPeriod) {
    const actualGap = diffDays(anchorPeriod.startDate, nextLoggedPeriod.startDate);
    if (actualGap >= 15 && actualGap <= 65) {
      effectiveCycleLength = actualGap;
    }
  }

  let activeDuration = 1;
  if (anchorPeriod.endDate && anchorPeriod.endDate >= anchorPeriod.startDate) {
    const customDur = diffDays(anchorPeriod.startDate, anchorPeriod.endDate) + 1;
    if (customDur >= 1 && customDur <= 20) {
      activeDuration = customDur;
    }
  } else if (avgPeriodDuration > 0) {
    activeDuration = avgPeriodDuration;
  }

  const activePeriodEndStr =
    anchorPeriod.endDate && anchorPeriod.endDate >= anchorPeriod.startDate
      ? anchorPeriod.endDate
      : anchorPeriod.startDate;

  const ovulationDay = Math.min(
    effectiveCycleLength - 2,
    Math.max(activeDuration + 2, effectiveCycleLength - 14)
  );
  const ovStart = Math.max(activeDuration + 1, ovulationDay - 5);
  const ovEnd = Math.min(effectiveCycleLength - 1, ovulationDay + 1);

  // Never rollover/wrap unlogged cycles via modulo arithmetic: show exact elapsed day since logged LMP
  let cycleDay = 0;
  if (activeIndex >= 0) {
    const rawDiff = diffDays(anchorPeriod.startDate, refDateStr);
    cycleDay = Math.max(1, rawDiff + 1);
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
  } else if (cycleDay > ovEnd) {
    stageKey = 'LUTEAL';
  } else {
    stageKey = 'FOLLICULAR';
  }

  const latestSpan = latestBleedDuration > 0 ? latestBleedDuration : projectionBleedDuration;
  const latestOvulationDay = Math.min(
    avgCycleLength - 2,
    Math.max(latestSpan + 2, avgCycleLength - 14)
  );
  const latestOvStart = Math.max(latestSpan + 1, latestOvulationDay - 5);
  const latestOvEnd = Math.min(avgCycleLength - 1, latestOvulationDay + 1);

  const rawDaysSinceLmp = diffDays(latestPeriod.startDate, lockedTodayStr);
  const effectiveCycleStartStr = latestPeriod.startDate;
  const effectiveCycleEndStr = latestEffectiveEndStr;

  const ovulationDateStr = addDaysISO(effectiveCycleStartStr, latestOvulationDay - 1);
  const ovulationWindowStartStr = addDaysISO(effectiveCycleStartStr, latestOvStart - 1);
  const ovulationWindowEndStr = addDaysISO(effectiveCycleStartStr, latestOvEnd - 1);

  const nextPeriodDateStr = addDaysISO(effectiveCycleStartStr, avgCycleLength);
  const nextPeriodEndDateStr = addDaysISO(nextPeriodDateStr, latestSpan - 1);

  const daysUntilNextPeriod = diffDays(lockedTodayStr, nextPeriodDateStr);
  const isIrregular =
    (measuredCycleAvg !== null || customCycleLen !== null) &&
    (avgCycleLength < 25 || avgCycleLength > 35);

  const prevEndResolved =
    previousPeriod && previousPeriod.endDate && previousPeriod.endDate >= previousPeriod.startDate
      ? previousPeriod.endDate
      : previousPeriod?.startDate || null;

  return {
    hasLoggedPeriods: true,
    avgCycleLength,
    avgPeriodDuration,
    activePeriodStartStr: effectiveCycleStartStr,
    activePeriodEndStr: effectiveCycleEndStr,
    activePeriodDuration: latestBleedDuration,
    effectiveCycleStartStr,
    effectiveCycleEndStr,
    autoRolloverCycles: 0,
    wasAutoRolledOver: false,
    previousPeriodStartStr: previousPeriod?.startDate || null,
    previousPeriodEndStr: prevEndResolved,
    rawDaysSinceLmp: Math.max(0, rawDaysSinceLmp + 1),
    cycleDay,
    stageKey,
    ovulationDay,
    ovStart,
    ovEnd,
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
  const realPeriods = getSortedPeriods(userData.periods);
  return realPeriods.some((p) => {
    const effectiveEnd =
      p.endDate && p.endDate >= p.startDate ? p.endDate : p.startDate;
    return dateStr >= p.startDate && dateStr <= effectiveEnd;
  });
}

export function isDateInPredictedPeriod(dateStr: string, metrics: CycleMetrics): boolean {
  if (!metrics.activePeriodStartStr) return false;
  const bleedDays = metrics.activePeriodDuration || metrics.avgPeriodDuration || 5;
  const maxCycles = Math.max(18, (metrics.autoRolloverCycles || 0) + 12);
  for (let cycleOffset = 1; cycleOffset <= maxCycles; cycleOffset++) {
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
    if (dateStr >= fStart && dateStr <= fEnd && (!nextP || dateStr < nextP.startDate)) {
      return { isFertileWindow: true, isPeakOvulation: dateStr === fPeak };
    }
  }

  // Check auto-rolled-over and future predicted cycles starting from the latest recorded LMP
  if (metrics.activePeriodStartStr) {
    const maxCycles = Math.max(18, (metrics.autoRolloverCycles || 0) + 12);
    for (let cycleOffset = 1; cycleOffset <= maxCycles; cycleOffset++) {
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
    return {
      status: 'trial',
      daysLeft: FREE_TRIAL_DAYS,
      label: `🎁 1-Week Free Access: ${FREE_TRIAL_DAYS} Days Left`,
    };
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
      const daysRemaining = Math.max(
        1,
        Math.ceil((userData.subscriptionUntil - nowMs) / (1000 * 60 * 60 * 24))
      );
      if (
        userData.subscriptionStatus === 'free_password' ||
        userData.usedFreeAccessPassword ||
        userData.paymentMethod?.toLowerCase().includes('free 30-day') ||
        userData.paymentMethod?.toLowerCase().includes('1-month free')
      ) {
        return {
          status: 'free_password',
          daysLeft: daysRemaining,
          label: `🎁 Free 1-Month Pass: ${daysRemaining}d Left`,
        };
      }
      if (
        userData.paymentMethod?.includes('Orange Money') &&
        !userData.paymentMethod?.toLowerCase().includes('free')
      ) {
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
        label: '🔒 1-Week Free Access Ended • Renew Pass (Le 30)',
      };
    }
  }

  const msElapsed = nowMs - (userData.createdAt || nowMs);
  const daysElapsed = Math.floor(msElapsed / (1000 * 60 * 60 * 24));
  const daysLeft = Math.max(0, FREE_TRIAL_DAYS - daysElapsed);
  if (daysElapsed >= FREE_TRIAL_DAYS) {
    return {
      status: 'expired',
      daysLeft: 0,
      label: '🔒 1-Week Free Access Ended • Renew Pass (Le 30)',
    };
  }
  return { status: 'trial', daysLeft, label: `🎁 1-Week Free Access: ${daysLeft}d Left` };
}

export function createDefaultUserObject(
  name: string,
  email: string,
  _passwordIgnored?: string,
  age = '',
  phone = '',
  uid?: string
): UserData {
  const today = getLockedRealTimeDate();

  // Automatic 1-Week (7-Day) Free Access on Account Creation
  const initialSubUntil = today.getTime() + FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000;

  const nowIso = today.toISOString();
  return {
    ...(uid ? { uid } : {}),
    name: name || email.split('@')[0],
    age: age ? String(age).trim() : '',
    email: email.toLowerCase(),
    phone: phone ? String(phone).trim() : '',
    role: 'client',
    createdAt: today.getTime(),
    firstEntryAt: today.getTime(),
    lastUpdatedAt: nowIso,
    lastSignInAt: nowIso,
    signInCount: 1,
    signupSource: 'Create Account',
    isVip: false,
    usedFreeAccessPassword: false,
    subscriptionStatus: 'active',
    subscriptionUntil: initialSubUntil,
    paymentMethod: '1-Week Free Access',
    periods: [],
    emergencyPills: [],
    dailyLogs: {},
    skincareGoal: 'Even Skin Tone & Clear Dark Spots',
    therapyLogs: [],
    appointments: [],
    academicTasks: [],
    phaseShiftNotificationsEnabled: true,
    themeMode: 'light',
  };
}

export type CycleInsightsStatus =
  | 'consistent'
  | 'mild_variation'
  | 'consult_doctor'
  | 'needs_data';

export interface CycleIntervalRecord {
  fromStartDate: string;
  toStartDate: string;
  cycleLengthDays: number;
  bleedDays: number;
  isAutoProjected: boolean;
  isWithinNormalLength: boolean;
}

export interface SixMonthCycleInsights {
  status: CycleInsightsStatus;
  statusLabel: string;
  headline: string;
  summaryText: string;
  doctorGuidance: string;
  shouldConsultDoctor: boolean;
  reasons: string[];
  actionChecklist: string[];
  windowStartISO: string;
  windowEndISO: string;
  loggedCyclesCount: number;
  autoCyclesCount: number;
  confirmedIntervalsCount: number;
  minCycleLength: number;
  maxCycleLength: number;
  avgCycleLength: number;
  cycleVariationDays: number;
  minBleedDays: number;
  maxBleedDays: number;
  avgBleedDays: number;
  recentEmergencyPillsCount: number;
  severePainDaysCount: number;
  intervals: CycleIntervalRecord[];
}

export function analyzeSixMonthCycleInsights(
  userData: UserData | null,
  referenceDateStr?: string
): SixMonthCycleInsights {
  const todayISO =
    referenceDateStr && /^\d{4}-\d{2}-\d{2}$/.test(referenceDateStr)
      ? referenceDateStr
      : getLockedTodayISO();
  const windowStartISO = addDaysISO(todayISO, -183);

  const metrics = calculateCycleMetrics(userData, todayISO);
  const allSorted = getSortedPeriods(userData?.periods);

  const periodsInWindow = allSorted.filter(
    (p) => p.startDate >= windowStartISO && p.startDate <= todayISO
  );
  const manualInWindow = periodsInWindow.filter((p) => !p.autoGenerated);
  const autoInWindow = periodsInWindow.filter((p) => Boolean(p.autoGenerated));

  const recentEmergencyPillsCount = Array.isArray(userData?.emergencyPills)
    ? userData!.emergencyPills.filter(
        (pill) => pill && pill.dateStr >= windowStartISO && pill.dateStr <= todayISO
      ).length
    : 0;

  const severePainDaysCount = userData?.dailyLogs
    ? Object.entries(userData.dailyLogs).filter(
        ([dStr, entry]) =>
          dStr >= windowStartISO &&
          dStr <= todayISO &&
          Array.isArray(entry?.symptoms) &&
          entry.symptoms.includes('Severe Pain')
      ).length
    : 0;

  // Measure real intervals where the second period falls inside the last 6 months
  const intervals: CycleIntervalRecord[] = [];
  for (let i = 1; i < allSorted.length; i++) {
    const prev = allSorted[i - 1];
    const curr = allSorted[i];
    if (curr.startDate < windowStartISO || curr.startDate > todayISO) continue;
    const gap = diffDays(prev.startDate, curr.startDate);
    if (gap < 10 || gap > 120) continue;

    let bleedDays = metrics.avgPeriodDuration;
    if (curr.endDate && curr.endDate >= curr.startDate) {
      const rawDur = diffDays(curr.startDate, curr.endDate) + 1;
      if (rawDur >= 1 && rawDur <= 20) bleedDays = rawDur;
    }

    intervals.push({
      fromStartDate: prev.startDate,
      toStartDate: curr.startDate,
      cycleLengthDays: gap,
      bleedDays,
      isAutoProjected: Boolean(prev.autoGenerated || curr.autoGenerated),
      isWithinNormalLength: gap >= 21 && gap <= 35,
    });
  }

  const confirmedIntervals = intervals.filter((item) => !item.isAutoProjected);
  const analysisIntervals = confirmedIntervals.length > 0 ? confirmedIntervals : intervals;

  const cycleLengths =
    analysisIntervals.length > 0
      ? analysisIntervals.map((item) => item.cycleLengthDays)
      : metrics.hasLoggedPeriods && metrics.avgCycleLength > 0
      ? [metrics.avgCycleLength]
      : [];

  const minCycleLength = cycleLengths.length > 0 ? Math.min(...cycleLengths) : 0;
  const maxCycleLength = cycleLengths.length > 0 ? Math.max(...cycleLengths) : 0;
  const avgCycleLength =
    cycleLengths.length > 0
      ? Math.round(cycleLengths.reduce((sum, n) => sum + n, 0) / cycleLengths.length)
      : 0;
  const cycleVariationDays = maxCycleLength - minCycleLength;

  const measuredBleeds: number[] = [];
  periodsInWindow.forEach((p) => {
    if (p.endDate && p.endDate >= p.startDate) {
      const d = diffDays(p.startDate, p.endDate) + 1;
      if (d >= 1 && d <= 20) measuredBleeds.push(d);
    }
  });
  const bleedPool =
    measuredBleeds.length > 0
      ? measuredBleeds
      : metrics.avgPeriodDuration > 0
      ? [metrics.avgPeriodDuration]
      : [];
  const minBleedDays = bleedPool.length > 0 ? Math.min(...bleedPool) : 0;
  const maxBleedDays = bleedPool.length > 0 ? Math.max(...bleedPool) : 0;
  const avgBleedDays =
    bleedPool.length > 0
      ? Math.round(bleedPool.reduce((sum, n) => sum + n, 0) / bleedPool.length)
      : 0;

  // Evaluate clinical red flags across the 6-month window
  const hasShortCycle = cycleLengths.some((len) => len > 0 && len < 21);
  const hasLongCycle = cycleLengths.some((len) => len > 35);
  const hasOutOfRangeSetting =
    periodsInWindow.length > 0 &&
    metrics.avgCycleLength > 0 &&
    (metrics.avgCycleLength < 21 || metrics.avgCycleLength > 35);
  const hasLongBleed = maxBleedDays > 7;
  const hasVeryShortBleed = measuredBleeds.length > 0 && minBleedDays < 2;
  const hasLargeSwing = confirmedIntervals.length >= 2 && cycleVariationDays >= 10;
  const hasModerateSwing =
    confirmedIntervals.length >= 2 && cycleVariationDays >= 8 && cycleVariationDays <= 9;
  const hasFrequentSeverePain = severePainDaysCount >= 3;

  const reasons: string[] = [];
  if (hasShortCycle || (periodsInWindow.length > 0 && metrics.avgCycleLength < 21)) {
    reasons.push(
      `A cycle shorter than 21 days was recorded (${minCycleLength} days).`
    );
  }
  if (hasLongCycle || (periodsInWindow.length > 0 && metrics.avgCycleLength > 35)) {
    reasons.push(
      `A cycle longer than 35 days was recorded (${maxCycleLength} days).`
    );
  }
  if (hasLargeSwing) {
    reasons.push(
      `Your cycle length changed by ${cycleVariationDays} days over the last 6 months (${minCycleLength}–${maxCycleLength} days).`
    );
  } else if (hasModerateSwing) {
    reasons.push(
      `Your cycle length shifted slightly by ${cycleVariationDays} days (${minCycleLength}–${maxCycleLength} days).`
    );
  }
  if (hasLongBleed) {
    reasons.push(`Bleeding lasted longer than 7 days (up to ${maxBleedDays} days).`);
  }
  if (hasVeryShortBleed) {
    reasons.push(`A period lasted less than 2 days (${minBleedDays} day).`);
  }
  if (hasFrequentSeverePain) {
    reasons.push(
      `Severe pain was logged on ${severePainDaysCount} days in the last 6 months.`
    );
  }

  // Case 1: Clear doctor consultation flags
  if (
    hasShortCycle ||
    hasLongCycle ||
    hasOutOfRangeSetting ||
    hasLongBleed ||
    hasVeryShortBleed ||
    hasLargeSwing ||
    hasFrequentSeverePain
  ) {
    const summaryParts: string[] = [];
    if (confirmedIntervals.length >= 2) {
      summaryParts.push(
        `Over the last 6 months, your cycles ranged from ${minCycleLength} to ${maxCycleLength} days (a ${cycleVariationDays}-day difference).`
      );
    } else if (periodsInWindow.length > 0) {
      summaryParts.push(
        `Based on your logged period dates in the last 6 months, your cycle shows signs outside the typical 21–35 day or 2–7 day bleeding range.`
      );
    }
    if (recentEmergencyPillsCount > 0) {
      summaryParts.push(
        `Note: You also logged ${recentEmergencyPillsCount} emergency pill${
          recentEmergencyPillsCount === 1 ? '' : 's'
        } in the last 6 months, which can temporarily shift period timing by a week or more.`
      );
    }

    return {
      status: 'consult_doctor',
      statusLabel: 'Consult a Doctor',
      headline: 'Your 6-Month Pattern Suggests a Check-In With a Doctor',
      summaryText: `${summaryParts.join(' ')} While temporary shifts can come from stress, sleep changes, or diet, patterns outside the usual range are worth discussing with a healthcare provider.`,
      doctorGuidance:
        'Book a routine visit with a doctor, gynecologist, or campus health clinic. Bring your 6-month cycle summary so they can check for common causes like stress, iron levels, thyroid shifts, or PCOS.',
      shouldConsultDoctor: true,
      reasons,
      actionChecklist: [
        'Download or open your Clinic Summary card before your appointment.',
        'Note any heavy bleeding, dizziness, or severe cramps alongside your dates.',
        'Seek prompt medical care sooner if bleeding soaks a pad every hour or pain stops normal daily activities.',
      ],
      windowStartISO,
      windowEndISO: todayISO,
      loggedCyclesCount: manualInWindow.length,
      autoCyclesCount: autoInWindow.length,
      confirmedIntervalsCount: confirmedIntervals.length,
      minCycleLength,
      maxCycleLength,
      avgCycleLength,
      cycleVariationDays,
      minBleedDays,
      maxBleedDays,
      avgBleedDays,
      recentEmergencyPillsCount,
      severePainDaysCount,
      intervals,
    };
  }

  // Case 2: Not enough confirmed months yet (0 or 1 period logged)
  if (periodsInWindow.length === 0 || confirmedIntervals.length === 0) {
    const hasCurrent = periodsInWindow.length > 0;
    return {
      status: 'needs_data',
      statusLabel: 'Needs More Logs',
      headline: hasCurrent
        ? 'Your Current Cycle Settings Look Healthy — Keep Logging Months'
        : 'Add Your Period Dates to Unlock 6-Month Cycle Insights',
      summaryText: hasCurrent
        ? `${
            metrics.avgCycleLength > 0
              ? `Your current cycle baseline (${metrics.avgCycleLength} days)`
              : 'Your logged start date'
          }${
            avgBleedDays > 0 ? ` and bleeding length (${avgBleedDays} days) are` : ' is'
          } recorded. Once you have at least 2 real period start dates from separate months, BloomCampus will measure your actual cycle length and variation automatically.`
        : 'Log your real period start and end dates first. Once you have 2 or more periods recorded across the last 6 months, BloomCampus will tell you whether your cycle rhythm is steady or if you should check with a doctor.',
      doctorGuidance:
        'No doctor visit is needed based on your current numbers. Consult a doctor if your period skips more than 45 days, lasts over 7 days, or comes with severe pain.',
      shouldConsultDoctor: false,
      reasons: [],
      actionChecklist: [
        'Confirm your start date whenever a new period arrives (or adjust auto-updated dates if yours came early or late).',
        'Log your end date so bleed length stays accurate.',
      ],
      windowStartISO,
      windowEndISO: todayISO,
      loggedCyclesCount: manualInWindow.length,
      autoCyclesCount: autoInWindow.length,
      confirmedIntervalsCount: confirmedIntervals.length,
      minCycleLength,
      maxCycleLength,
      avgCycleLength,
      cycleVariationDays,
      minBleedDays,
      maxBleedDays,
      avgBleedDays,
      recentEmergencyPillsCount,
      severePainDaysCount,
      intervals,
    };
  }

  // Case 3: Mild variation (8–9 day swing over 6 months)
  if (hasModerateSwing) {
    return {
      status: 'mild_variation',
      statusLabel: 'Slightly Variable',
      headline: 'Your Cycle Has a Small Shift Over the Last 6 Months',
      summaryText: `Your cycles stayed within the healthy 21–35 day window, ranging from ${minCycleLength} to ${maxCycleLength} days (an ${cycleVariationDays}-day difference). A small 8–9 day shift can happen from exam stress, travel, illness, or sleep changes.${
        recentEmergencyPillsCount > 0
          ? ` Emergency contraception (${recentEmergencyPillsCount} logged) can also cause a temporary shift.`
          : ''
      }`,
      doctorGuidance:
        'You do not necessarily need an urgent visit right now—keep tracking the next 1–2 cycles. If the difference grows to 10+ days or keeps shifting every month, consult a doctor or campus nurse.',
      shouldConsultDoctor: false,
      reasons,
      actionChecklist: [
        'Track your next 2 period start dates closely to see if your rhythm settles back within 7 days.',
        'Log sleep, stress, or severe cramps in Daily Mood so your doctor can see clear patterns if needed.',
      ],
      windowStartISO,
      windowEndISO: todayISO,
      loggedCyclesCount: manualInWindow.length,
      autoCyclesCount: autoInWindow.length,
      confirmedIntervalsCount: confirmedIntervals.length,
      minCycleLength,
      maxCycleLength,
      avgCycleLength,
      cycleVariationDays,
      minBleedDays,
      maxBleedDays,
      avgBleedDays,
      recentEmergencyPillsCount,
      severePainDaysCount,
      intervals,
    };
  }

  // Case 4: Consistent cycle
  const rangeNote =
    confirmedIntervals.length === 1
      ? `Your latest measured cycle was ${minCycleLength} days with ${avgBleedDays}-day bleeding—right inside the healthy 21–35 day window.`
      : `Over the last 6 months, your cycles stayed steady between ${minCycleLength} and ${maxCycleLength} days (only a ${cycleVariationDays}-day difference, well under the normal 7-day variation), with periods lasting ${
          minBleedDays === maxBleedDays ? `${minBleedDays}` : `${minBleedDays}–${maxBleedDays}`
        } days.`;

  return {
    status: 'consistent',
    statusLabel: 'Consistent Rhythm',
    headline: 'Your Cycle Length Is Consistent and Healthy',
    summaryText: `${rangeNote} No signs of cycle irregularity were found in your last 6 months of data.`,
    doctorGuidance:
      'Your cycle is steady and within normal medical guidelines, so no doctor visit is needed for cycle length. Simply keep tracking each month and see a doctor only if new symptoms like severe pain or bleeding over 7 days appear.',
    shouldConsultDoctor: false,
    reasons: [],
    actionChecklist: [
      'Continue confirming your start dates whenever a period begins so predictions stay accurate.',
      'Your consistent rhythm helps keep fertile window and energy forecasts reliable.',
    ],
    windowStartISO,
    windowEndISO: todayISO,
    loggedCyclesCount: manualInWindow.length,
    autoCyclesCount: autoInWindow.length,
    confirmedIntervalsCount: confirmedIntervals.length,
    minCycleLength,
    maxCycleLength,
    avgCycleLength,
    cycleVariationDays,
    minBleedDays,
    maxBleedDays,
    avgBleedDays,
    recentEmergencyPillsCount,
    severePainDaysCount,
    intervals,
  };
}

