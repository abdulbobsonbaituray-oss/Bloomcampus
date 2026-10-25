import React, { useState, useEffect, useRef } from 'react';
import {
  STORAGE_SESSION_KEY,
  STORAGE_USERS_KEY,
  STORAGE_ADMIN_SESSION_KEY,
  STORAGE_THEME_KEY,
  STORAGE_LMP_MEMORY_KEY,
  OWNER_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_FREE_ACCESS_PASSWORD,
  CREATOR_NAME,
  CREATOR_EMAIL,
  MOOD_CATEGORIES,
  SYMPTOM_ITEMS,
  HABIT_ITEMS,
  PHASE_ADVISOR_DATA,
  STAGE_NUTRITION_DATA,
  PHASE_SHIFT_NOTIFICATION_DATA,
  CAMPUS_MYTHS,
} from './constants';
import {
  StageKey,
  UserData,
  DailyLogEntry,
  AdminConfig,
  SupportInquiry,
  PhaseShiftNotificationSummary,
} from './types';
import {
  addDaysISO,
  calculateCycleMetrics,
  createDefaultUserObject,
  diffDays,
  formatDateISO,
  formatDateTimeLocalISO,
  formatHumanDate,
  formatLockedTodayHuman,
  formatShortMonthDay,
  getAdminConfig,
  getFertileStatusForDate,
  getLockedRealTimeDate,
  getLockedTodayISO,
  getSortedPeriods,
  getTrialStatus,
  isDateInLoggedPeriod,
  isDateInPredictedPeriod,
  isOwnerAdminCredentials,
  isSecretVipPassword,
  parseDateISO,
  saveAdminConfig,
} from './utils/cycleEngine';
import { PWAInstallButton, OfflineIndicator } from './components/PWAInstallButton';
import { SidratuClinicHub } from './components/SidratuClinicHub';
import { StudyExamSyncPlanner } from './components/StudyExamSyncPlanner';
import { CycleTrendsSection } from './components/CycleTrendsSection';
import { MoodStageCorrelationSection } from './components/MoodStageCorrelationSection';
import { HydrationTrackerWidget } from './components/HydrationTrackerWidget';
import { NutritionCravingSupportCard } from './components/NutritionCravingSupportCard';
import { CycleJournalPromptsSection } from './components/CycleJournalPromptsSection';
import { FullScreenCalendarModal } from './components/FullScreenCalendarModal';
import { OwnerAdminDashboard } from './components/OwnerAdminDashboard';
import { BottomNavBar, CoreNavSection } from './components/BottomNavBar';
import { BadgesMilestonesSection, evaluateUserBadges } from './components/BadgesMilestonesSection';
import { exportClinicSummaryToPDF } from './utils/clinicPdfExport';
import {
  assignSequentialCustomerNumbers,
  deleteUserFromFirestore,
  fetchAllUsersFromFirestore,
  fetchSingleUserFromFirestore,
  getClientDeviceLabel,
  logCustomerEntryToFirestore,
  resolveCustomerPhoneUsed,
  signInWithGooglePopup,
  signOutFirebase,
  subscribeToAdminConfigFirestore,
  subscribeToAllUsersFirestore,
  subscribeToFirebaseAuth,
  subscribeToSupportInquiriesFirestore,
  syncAdminConfigToFirestore,
  syncAllUsersToFirestore,
  syncSupportInquiryToFirestore,
  syncUserToFirestore,
} from './firebase';

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'warning' | 'info';
}

function sanitizeClientUser(u: UserData, emailKey: string): UserData {
  const firstMs =
    Number(u.firstEntryAt) > 0
      ? Number(u.firstEntryAt)
      : Number(u.createdAt) > 0
      ? Number(u.createdAt)
      : Date.now();
  const cleaned: UserData = {
    ...u,
    email: emailKey,
    firstEntryAt: firstMs,
    createdAt: firstMs,
    phone: resolveCustomerPhoneUsed(u),
  };
  if (
    typeof cleaned.paymentMethod === 'string' &&
    cleaned.paymentMethod.includes('Bobson')
  ) {
    cleaned.paymentMethod = '2-Week Free Access';
  }
  return cleaned;
}

function getSafeUserTimestamp(u: UserData): number {
  if (u.lastUpdatedAt) {
    const t = new Date(u.lastUpdatedAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  const c = Number(u.createdAt || 0);
  return !isNaN(c) && c > 0 ? c : 0;
}

function mergeUsersMaps(
  baseUsers: Record<string, UserData>,
  incomingUsers: Record<string, UserData>
): Record<string, UserData> {
  const merged: Record<string, UserData> = {};
  Object.entries(baseUsers || {}).forEach(([k, u]) => {
    if (!k || !u || typeof u !== 'object') return;
    const emailKey = (u.email || k).toLowerCase().trim();
    if (emailKey) {
      merged[emailKey] = sanitizeClientUser(u, emailKey);
    }
  });

  Object.entries(incomingUsers || {}).forEach(([rawKey, u]) => {
    if (!rawKey || !u || typeof u !== 'object') return;
    const emailKey = (u.email || rawKey).toLowerCase().trim();
    if (!emailKey) return;
    const existing = merged[emailKey];
    if (!existing) {
      merged[emailKey] = sanitizeClientUser(u, emailKey);
      return;
    }
    const existingTs = getSafeUserTimestamp(existing);
    const incomingTs = getSafeUserTimestamp(u);
    const isIncomingNewer = incomingTs >= existingTs;
    const base = isIncomingNewer ? { ...existing, ...u } : { ...u, ...existing };

    // 1. Preserve User Profile fields (name, age, phone, password, earliest firstEntryAt)
    const existingFirst = Number(existing.firstEntryAt || existing.createdAt || Date.now());
    const incomingFirst = Number(u.firstEntryAt || u.createdAt || Date.now());
    const earliestFirst = Math.min(
      existingFirst > 0 ? existingFirst : Date.now(),
      incomingFirst > 0 ? incomingFirst : Date.now()
    );
    const bestPhone =
      (isIncomingNewer ? resolveCustomerPhoneUsed(u) : '') ||
      resolveCustomerPhoneUsed(existing) ||
      resolveCustomerPhoneUsed(u);
    const bestAge =
      (isIncomingNewer && (u.age || '').trim() ? u.age.trim() : '') ||
      (existing.age || '').trim() ||
      (u.age || '').trim();
    const bestPassword =
      (isIncomingNewer && (u.password || '').trim() ? (u.password || '').trim() : '') ||
      (existing.password || '').trim() ||
      (u.password || '').trim();
    const bestName =
      (isIncomingNewer &&
      (u.name || '').trim() &&
      u.name.trim() !== emailKey.split('@')[0]
        ? u.name.trim()
        : '') ||
      ((existing.name || '').trim() && existing.name.trim() !== emailKey.split('@')[0]
        ? existing.name.trim()
        : '') ||
      (u.name || existing.name || emailKey.split('@')[0] || 'Student').trim();

    // 2. Preserve Period Tracking Information (periods, dailyLogs, emergencyPills, journalEntries, unlockedBadges)
    const existingPeriods = Array.isArray(existing.periods) ? existing.periods : [];
    const incomingPeriods = Array.isArray(u.periods) ? u.periods : [];
    const bestPeriods =
      isIncomingNewer && incomingPeriods.length > 0
        ? incomingPeriods
        : existingPeriods.length > 0
        ? existingPeriods
        : incomingPeriods;

    const mergedDailyLogs = isIncomingNewer
      ? { ...(existing.dailyLogs || {}), ...(u.dailyLogs || {}) }
      : { ...(u.dailyLogs || {}), ...(existing.dailyLogs || {}) };

    const existingPills = Array.isArray(existing.emergencyPills) ? existing.emergencyPills : [];
    const incomingPills = Array.isArray(u.emergencyPills) ? u.emergencyPills : [];
    const bestPills =
      isIncomingNewer && incomingPills.length > 0
        ? incomingPills
        : existingPills.length > 0
        ? existingPills
        : incomingPills;

    const existingJournals = Array.isArray(existing.journalEntries) ? existing.journalEntries : [];
    const incomingJournals = Array.isArray(u.journalEntries) ? u.journalEntries : [];
    const bestJournals =
      isIncomingNewer && incomingJournals.length > 0
        ? incomingJournals
        : existingJournals.length > 0
        ? existingJournals
        : incomingJournals;

    const mergedBadges = {
      ...(existing.unlockedBadges || {}),
      ...(u.unlockedBadges || {}),
    };

    // 3. Preserve Subscription Status & Payment History
    const existingPayHistory = Array.isArray(existing.paymentHistory) ? existing.paymentHistory : [];
    const incomingPayHistory = Array.isArray(u.paymentHistory) ? u.paymentHistory : [];
    const bestPayHistory =
      isIncomingNewer && incomingPayHistory.length > 0
        ? incomingPayHistory
        : existingPayHistory.length > 0
        ? existingPayHistory
        : incomingPayHistory;

    merged[emailKey] = sanitizeClientUser(
      {
        ...base,
        name: bestName,
        age: bestAge,
        phone: bestPhone,
        password: bestPassword,
        firstEntryAt: earliestFirst,
        createdAt: earliestFirst,
        signInCount: Math.max(Number(existing.signInCount || 1), Number(u.signInCount || 1)),
        periods: bestPeriods,
        dailyLogs: mergedDailyLogs,
        emergencyPills: bestPills,
        journalEntries: bestJournals,
        unlockedBadges: mergedBadges,
        paymentHistory: bestPayHistory,
      },
      emailKey
    );
  });
  return assignSequentialCustomerNumbers(merged);
}

function getAllUsers(): Record<string, UserData> {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return mergeUsersMaps({}, parsed);
  } catch {
    return {};
  }
}

function saveAllUsers(
  usersObj: Record<string, UserData>,
  activeEmail?: string,
  forceOverwriteUser = false
) {
  try {
    const normalized = mergeUsersMaps(getAllUsers(), usersObj);
    if (activeEmail && usersObj[activeEmail]) {
      const cleanKey = activeEmail.toLowerCase().trim();
      normalized[cleanKey] = {
        ...normalized[cleanKey],
        ...usersObj[activeEmail],
        email: cleanKey,
      };
    }
    const numbered = assignSequentialCustomerNumbers(normalized);
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(numbered));

    if (activeEmail) {
      const cleanKey = activeEmail.toLowerCase().trim();
      const targetUser = numbered[cleanKey];
      if (targetUser) {
        syncUserToFirestore(targetUser, cleanKey).catch(() => {});
      }
    } else {
      syncAllUsersToFirestore(numbered).catch(() => {});
    }

    fetch('/api/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: activeEmail || undefined,
        userData: activeEmail ? numbered[activeEmail.toLowerCase().trim()] : undefined,
        allUsers: numbered,
        forceOverwriteUser,
      }),
    }).catch(() => {
      // Offline fallback: localStorage and Firestore handle persistence
    });
  } catch (e) {
    console.error('Failed saving users to localStorage', e);
  }
}

export default function App() {
  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  // Auth State & Input Refs for Validation Focus
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authName, setAuthName] = useState('');
  const [authAge, setAuthAge] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFreeAccessPassInput, setAuthFreeAccessPassInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signupPlanChoice, setSignupPlanChoice] = useState<'free_password' | 'orange_money'>('free_password');
  const [authFieldError, setAuthFieldError] = useState<{
    fieldId: 'authName' | 'authAge' | 'authEmail' | 'authPhone' | 'authPassword';
    message: string;
  } | null>(null);
  const authNameInputRef = useRef<HTMLInputElement | null>(null);
  const authAgeInputRef = useRef<HTMLInputElement | null>(null);
  const authEmailInputRef = useRef<HTMLInputElement | null>(null);
  const authPhoneInputRef = useRef<HTMLInputElement | null>(null);
  const authPasswordInputRef = useRef<HTMLInputElement | null>(null);
  const [showGoogleAccountModal, setShowGoogleAccountModal] = useState<boolean>(false);
  const [googleModalEmail, setGoogleModalEmail] = useState<string>('');
  const [googleModalName, setGoogleModalName] = useState<string>('');
  const [googleModalAge, setGoogleModalAge] = useState<string>('21');
  const [googleModalPhone, setGoogleModalPhone] = useState<string>('');
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState<boolean>(false);

  // Active User State & All Users Map
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [allUsersMap, setAllUsersMap] = useState<Record<string, UserData>>(() => getAllUsers());

  // Admin & Support Inquiries State
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => getAdminConfig());
  const [supportInquiries, setSupportInquiries] = useState<SupportInquiry[]>([]);
  const [isAdminView, setIsAdminView] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_ADMIN_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showAdminLoginModal, setShowAdminLoginModal] = useState<boolean>(false);
  const [adminLoginEmail, setAdminLoginEmail] = useState<string>(OWNER_ADMIN_EMAIL);
  const [adminLoginPassword, setAdminLoginPassword] = useState<string>('');

  // Main App Sidebar & About / Contact / Support Inquiry State
  const [showSidebarDrawer, setShowSidebarDrawer] = useState<boolean>(false);
  const [showAboutContactModal, setShowAboutContactModal] = useState<boolean>(false);
  const [supportSubjectInput, setSupportSubjectInput] = useState<string>('');
  const [supportMessageInput, setSupportMessageInput] = useState<string>('');
  const [supportPhoneInput, setSupportPhoneInput] = useState<string>('');

  // Active Navigation View ('tracker' | 'checkin' | 'guide' | 'analytics' | 'study' | 'sidratu')
  const [activeNavTab, setActiveNavTab] = useState<CoreNavSection>('tracker');
  const [activeTrackerAction, setActiveTrackerAction] = useState<
    | 'badges'
    | 'nutrition'
    | 'hydration'
    | 'trends'
    | 'correlation'
    | 'videos'
    | 'all'
    | null
  >('trends');

  const handleSelectNavSection = (section: CoreNavSection) => {
    setActiveNavTab(section);
    if (section === 'analytics' && !activeTrackerAction) {
      setActiveTrackerAction('trends');
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const jumpToUpdateLmpSection = () => {
    setShowPillAdviceModal(false);
    setActiveNavTab('tracker');
    showToast(
      '🩸 Returned to Update LMP! Enter your new Last Menstrual Period Start Date below and tap Save.',
      'info'
    );
    window.setTimeout(() => {
      const lmpSection = document.getElementById('update-lmp-section');
      if (lmpSection) {
        lmpSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const startInput = document.getElementById('periodStartDateInput') as HTMLInputElement | null;
      if (startInput) {
        startInput.focus();
      }
    }, 120);
  };

  const jumpToEmergencyPillLogger = () => {
    setShowPillAdviceModal(false);
    setActiveNavTab('guide');
    showToast('💊 Ready to note down your Emergency Pill date and time!', 'info');
    window.setTimeout(() => {
      const pillSection = document.getElementById('standalone-emergency-pill');
      if (pillSection) {
        pillSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      const pillInput = document.getElementById('customPillDateTime') as HTMLInputElement | null;
      if (pillInput) {
        pillInput.focus();
      }
    }, 120);
  };

  // Locked Real-Time Current Date (Strictly Read-Only System Clock)
  const [lockedTodayStr, setLockedTodayStr] = useState<string>(() => getLockedTodayISO());

  useEffect(() => {
    const syncRealTimeDate = () => {
      const currentRealIso = getLockedTodayISO();
      setLockedTodayStr((prev) => (prev !== currentRealIso ? currentRealIso : prev));
    };
    syncRealTimeDate();
    const timer = window.setInterval(syncRealTimeDate, 15000);
    return () => window.clearInterval(timer);
  }, []);

  // Calendar & Selected Date State
  const [selectedDateStr, setSelectedDateStr] = useState<string>(() => getLockedTodayISO());
  const [calendarMonth, setCalendarMonth] = useState<number>(() =>
    getLockedRealTimeDate().getMonth()
  );
  const [calendarYear, setCalendarYear] = useState<number>(() =>
    getLockedRealTimeDate().getFullYear()
  );

  // Period Form State & Persistent LMP Memory (Never forced to Today's Date when past dates are entered)
  const [periodStartInput, setPeriodStartInput] = useState<string>('');
  const [periodEndInput, setPeriodEndInput] = useState<string>('');
  const [editingPeriodStartKey, setEditingPeriodStartKey] = useState<string | null>(null);
  const [showCalendarGrid, setShowCalendarGrid] = useState<boolean>(false);

  // Emergency Pill Picker State
  const [customPillDateTime, setCustomPillDateTime] = useState<string>(() =>
    formatDateTimeLocalISO(getLockedRealTimeDate() as Date)
  );

  // Smart Phase Advisor State
  const [activeAdvisorStage, setActiveAdvisorStage] = useState<StageKey>('OVULATION');
  const [showSmartPhaseGuide, setShowSmartPhaseGuide] = useState<boolean>(false);

  // Campus Myth Index
  const [currentMythIndex, setCurrentMythIndex] = useState<number>(0);

  // Daily Notes & Symptom Search Filter Local Input State
  const [dailyNotesInput, setDailyNotesInput] = useState<string>('');
  const [symptomSearchQuery, setSymptomSearchQuery] = useState<string>('');
  const [symptomCategoryFilter, setSymptomCategoryFilter] = useState<string>('ALL');
  const [showSymptomChecklist, setShowSymptomChecklist] = useState<boolean>(false);

  // Privacy Blur, Dark Mode & Alert Banners
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  const [privacyBlurEnabled, setPrivacyBlurEnabled] = useState<boolean>(false);
  const [forceBagBannerPreview, setForceBagBannerPreview] = useState<boolean>(false);
  const [bagBannerDismissed, setBagBannerDismissed] = useState<boolean>(false);

  // Modals State
  const [showPillAdviceModal, setShowPillAdviceModal] = useState<boolean>(false);
  const [showClinicSummaryModal, setShowClinicSummaryModal] = useState<boolean>(false);
  const [showPaywallModal, setShowPaywallModal] = useState<boolean>(false);
  const [isPaywallPreview, setIsPaywallPreview] = useState<boolean>(true);
  const [showFullScreenCalendar, setShowFullScreenCalendar] = useState<boolean>(false);
  const [showBadgesModal, setShowBadgesModal] = useState<boolean>(false);
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);

  // Paywall / Lock Screen Form State
  const [paymentTab, setPaymentTab] = useState<'orange' | 'free_password'>('orange');
  const [orangePhoneInput, setOrangePhoneInput] = useState<string>('');
  const [orangeTxIdInput, setOrangeTxIdInput] = useState<string>('');
  const [vipSecretCodeInput, setVipSecretCodeInput] = useState<string>('');
  const [paymentReceiptText, setPaymentReceiptText] = useState<string>('');
  const [latestPaymentReceiptMessage, setLatestPaymentReceiptMessage] = useState<string>('');

  // Load saved session on mount & sync with persistent server memory
  useEffect(() => {
    const savedEmail = localStorage.getItem(STORAGE_SESSION_KEY);
    const localUsers = getAllUsers();
    setAllUsersMap(localUsers);

    if (savedEmail && localUsers[savedEmail]) {
      let loadedUser = localUsers[savedEmail];
      // Restore memorized LMP start/end dates only if they belong to this exact user email
      try {
        const lmpRaw = localStorage.getItem(STORAGE_LMP_MEMORY_KEY);
        if (lmpRaw && (!loadedUser.periods || loadedUser.periods.length === 0)) {
          const parsedLmp = JSON.parse(lmpRaw);
          const lmpOwnerEmail =
            typeof parsedLmp?.email === 'string' ? parsedLmp.email.toLowerCase().trim() : '';
          if (
            parsedLmp &&
            lmpOwnerEmail === savedEmail.toLowerCase().trim() &&
            typeof parsedLmp.startDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(parsedLmp.startDate)
          ) {
            loadedUser = {
              ...loadedUser,
              periods: [
                {
                  startDate: parsedLmp.startDate,
                  endDate: parsedLmp.endDate || null,
                },
              ],
              customCycleLength: parsedLmp.customCycleLength || loadedUser.customCycleLength,
            };
            localUsers[savedEmail] = loadedUser;
            saveAllUsers(localUsers, savedEmail);
          }
        }
      } catch {
        // ignore storage parse error
      }
      setCurrentUserEmail(savedEmail);
      setUserData(loadedUser);
      if (loadedUser.themeMode) {
        setIsDarkMode(loadedUser.themeMode === 'dark');
      }
      const todayIso = getLockedTodayISO();
      setSelectedDateStr(todayIso);
      const sorted = getSortedPeriods(loadedUser.periods);
      const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
      setPeriodStartInput(latest ? latest.startDate : '');
      setPeriodEndInput(latest && latest.endDate ? latest.endDate : '');
      if (latest) {
        try {
          localStorage.setItem(
            STORAGE_LMP_MEMORY_KEY,
            JSON.stringify({
              email: savedEmail,
              startDate: latest.startDate,
              endDate: latest.endDate || null,
              customCycleLength: loadedUser.customCycleLength || 28,
            })
          );
        } catch {
          // ignore
        }
      }
      const m = calculateCycleMetrics(loadedUser, todayIso);
      setActiveAdvisorStage(m.stageKey);
      const trial = getTrialStatus(loadedUser);
      if ( trial.status === 'expired' || trial.status === 'pending_verification') {
        setIsPaywallPreview(false);
        setShowPaywallModal(true);
      }
      // Immediately send the active session user's entry to Cloud Firestore so every phone/computer opening the link is reported
      loadedUser = {
        ...loadedUser,
        deviceInfo: getClientDeviceLabel(),
        lastUpdatedAt: new Date().toISOString(),
      };
      localUsers[savedEmail] = loadedUser;
      logCustomerEntryToFirestore(loadedUser, 'WebApp Session').catch(() => {});
    }

    // Push any local users to Cloud Firestore on boot & subscribe in real time
    syncAllUsersToFirestore(localUsers).catch(() => {});

    const unsubUsers = subscribeToAllUsersFirestore((cloudUsers) => {
      if (!cloudUsers || Object.keys(cloudUsers).length === 0) return;
      const mergedUsers = mergeUsersMaps(getAllUsers(), cloudUsers);
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(mergedUsers));
      setAllUsersMap(mergedUsers);
      const activeSessionEmail = localStorage.getItem(STORAGE_SESSION_KEY);
      if (activeSessionEmail && mergedUsers[activeSessionEmail]) {
        const syncedUser = mergedUsers[activeSessionEmail];
        setUserData(syncedUser);
      }
    });

    const unsubAdminCfg = subscribeToAdminConfigFirestore((cloudCfg) => {
      if (cloudCfg && typeof cloudCfg === 'object') {
        setAdminConfig(cloudCfg);
        saveAdminConfig(cloudCfg);
      }
    });

    const unsubInquiries = subscribeToSupportInquiriesFirestore((cloudInqs) => {
      if (Array.isArray(cloudInqs) && cloudInqs.length > 0) {
        setSupportInquiries(cloudInqs);
      }
    });

    // Reconcile with server persistent store (push local users & pull all server users so Admin sees every person)
    const refreshUsersFromServer = () => {
      const currentLocal = getAllUsers();
      fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allUsers: currentLocal,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          if (data.adminConfig && typeof data.adminConfig === 'object') {
            setAdminConfig(data.adminConfig);
            saveAdminConfig(data.adminConfig);
          }
          if (Array.isArray(data.supportInquiries) && data.supportInquiries.length > 0) {
            setSupportInquiries(data.supportInquiries);
          }
          if (data.users && typeof data.users === 'object') {
            const mergedUsers = mergeUsersMaps(getAllUsers(), data.users as Record<string, UserData>);
            localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(mergedUsers));
            setAllUsersMap(mergedUsers);
            const activeSessionEmail = localStorage.getItem(STORAGE_SESSION_KEY);
            if (activeSessionEmail && mergedUsers[activeSessionEmail]) {
              const syncedUser = mergedUsers[activeSessionEmail];
              const sorted = getSortedPeriods(syncedUser.periods);
              const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
              setCurrentUserEmail(activeSessionEmail);
              setUserData(syncedUser);
              if (latest) {
                setPeriodStartInput((prev) => prev || latest.startDate);
                setPeriodEndInput((prev) => prev || latest.endDate || '');
              }
            }
          }
        })
        .catch(() => {
          // Offline mode: local storage is already active
        });
    };

    const unsubFirebaseAuth = subscribeToFirebaseAuth(async (fbUser) => {
      if (!fbUser || !fbUser.email) return;
      const gEmail = fbUser.email.trim().toLowerCase();
      const activeSession = localStorage.getItem(STORAGE_SESSION_KEY);
      if (activeSession) return;

      let existingRecord: UserData | null = getAllUsers()[gEmail] || null;
      if (!existingRecord) {
        existingRecord = await fetchSingleUserFromFirestore(gEmail);
      }
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
      const firstMs =
        existingRecord && Number(existingRecord.firstEntryAt || existingRecord.createdAt) > 0
          ? Number(existingRecord.firstEntryAt || existingRecord.createdAt)
          : nowMs;

      const resolvedUser: UserData =
        existingRecord ||
        createDefaultUserObject(
          fbUser.displayName || gEmail.split('@')[0],
          gEmail,
          'GoogleAuthVerified',
          '21',
          fbUser.phoneNumber || ''
        );

      resolvedUser.name = fbUser.displayName || resolvedUser.name || gEmail.split('@')[0];
      resolvedUser.email = gEmail;
      resolvedUser.firstEntryAt = firstMs;
      resolvedUser.createdAt = firstMs;
      resolvedUser.deviceInfo = getClientDeviceLabel();
      resolvedUser.subscriptionStatus = resolvedUser.subscriptionStatus || 'active';
      resolvedUser.subscriptionUntil = resolvedUser.subscriptionUntil || nowMs + twoWeeksMs;
      resolvedUser.lastUpdatedAt = nowIso;
      resolvedUser.lastSignInAt = nowIso;

      const all = getAllUsers();
      all[gEmail] = resolvedUser;
      const numbered = assignSequentialCustomerNumbers(all);
      saveAllUsers(numbered, gEmail, true);
      setAllUsersMap({ ...numbered });
      setCurrentUserEmail(gEmail);
      setUserData(numbered[gEmail]);
      localStorage.setItem(STORAGE_SESSION_KEY, gEmail);
    });

    refreshUsersFromServer();
    const syncTimer = window.setInterval(refreshUsersFromServer, 25000);
    window.addEventListener('focus', refreshUsersFromServer);
    window.addEventListener('online', refreshUsersFromServer);
    return () => {
      window.clearInterval(syncTimer);
      window.removeEventListener('focus', refreshUsersFromServer);
      window.removeEventListener('online', refreshUsersFromServer);
      unsubUsers();
      unsubAdminCfg();
      unsubInquiries();
      unsubFirebaseAuth();
    };
  }, []);

  // Sync root & body class for Dark Mode theme
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark-mode');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-mode');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDarkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDarkMode]);

  const handleToggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (userData && currentUserEmail) {
      const updated: UserData = {
        ...userData,
        themeMode: nextDark ? 'dark' : 'light',
        lastUpdatedAt: new Date().toISOString(),
      };
      setUserData(updated);
      const all = getAllUsers();
      all[currentUserEmail] = updated;
      setAllUsersMap(all);
      saveAllUsers(all, currentUserEmail);
    }
    showToast(
      nextDark
        ? '🌙 Dark Mode ON: Low-light theme active for comfortable late-night study sessions.'
        : '☀️ Light Mode ON: Switched back to warm daylight cream theme.',
      'info'
    );
  };

  // Sync body class for privacy blur
  useEffect(() => {
    if (privacyBlurEnabled) {
      document.body.classList.add('privacy-blur-active');
    } else {
      document.body.classList.remove('privacy-blur-active');
    }
  }, [privacyBlurEnabled]);

  // Sync daily notes input and advisor stage when selectedDateStr or userData changes
  useEffect(() => {
    if (!userData) return;
    const log = userData.dailyLogs[selectedDateStr];
    setDailyNotesInput(log?.notes || '');
    const m = calculateCycleMetrics(userData, selectedDateStr);
    setActiveAdvisorStage(m.stageKey);
  }, [selectedDateStr, userData]);

  // Automatically detect newly unlocked virtual badges and persist their unlock timestamps
  useEffect(() => {
    if (!userData) return;
    const evalResult = evaluateUserBadges(userData);
    const existingUnlocked = userData.unlockedBadges || {};
    const newlyUnlocked: string[] = [];
    const nextUnlockedMap: Record<string, string> = { ...existingUnlocked };
    const nowIso = new Date().toISOString();

    evalResult.badges.forEach((b) => {
      if (b.isUnlocked && !existingUnlocked[b.id]) {
        nextUnlockedMap[b.id] = nowIso;
        newlyUnlocked.push(`${b.emoji} ${b.title}`);
      }
    });

    if (newlyUnlocked.length > 0) {
      const hadPreviousBadges = Object.keys(existingUnlocked).length > 0;
      updateUserData((prev) => ({
        ...prev,
        unlockedBadges: {
          ...(prev.unlockedBadges || {}),
          ...nextUnlockedMap,
        },
      }));
      if (hadPreviousBadges) {
        showToast(
          `🏅 Milestone Badge Unlocked: ${newlyUnlocked.join(', ')}!`,
          'success'
        );
      }
    }
  }, [userData?.periods, userData?.dailyLogs, userData?.journalEntries]);

  // Helper to dispatch a native Browser Notification (with Service Worker fallback)
  const triggerBrowserNotification = (
    title: string,
    body: string,
    tag = 'bloomcampus-2day-reminder'
  ): boolean => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    if (Notification.permission !== 'granted') {
      return false;
    }
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            reg.showNotification(title, {
              body,
              icon: '/icon.svg',
              badge: '/icon.svg',
              tag,
            });
          })
          .catch(() => {
            new Notification(title, {
              body,
              icon: '/icon.svg',
              tag,
            });
          });
      } else {
        new Notification(title, {
          body,
          icon: '/icon.svg',
          tag,
        });
      }
      return true;
    } catch {
      return false;
    }
  };

  // Dispatch a Browser Notification + In-App Summary Banner when the user moves into a new cycle phase
  const dispatchPhaseShiftNotification = async (
    fromStage: StageKey,
    toStage: StageKey,
    options?: { requestPermissionIfDefault?: boolean }
  ) => {
    if (!userData) return;
    const shiftGuide = PHASE_SHIFT_NOTIFICATION_DATA[toStage];
    const fromInfo = PHASE_ADVISOR_DATA[fromStage];
    const toInfo = PHASE_ADVISOR_DATA[toStage];

    if (
      options?.requestPermissionIfDefault &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore
      }
    }

    const notifTitle = `${toInfo.emoji} Phase Shift: ${fromInfo.shortName} → ${toInfo.shortName} Stage!`;
    const notifBody = `🥗 Nutrition: ${shiftGuide.nutritionTip}\n✨ Skincare: ${shiftGuide.skincareTip}`;

    const sentBrowser = triggerBrowserNotification(
      notifTitle,
      notifBody,
      `bloomcampus-phase-shift-${toStage.toLowerCase()}`
    );

    const nowIso = new Date().toISOString();
    const summary: PhaseShiftNotificationSummary = {
      fromStage,
      toStage,
      notifiedAt: nowIso,
      nutritionTip: shiftGuide.nutritionTip,
      skincareTip: shiftGuide.skincareTip,
      recommendedSnack: shiftGuide.recommendedSnack,
      recommendedTreatment: shiftGuide.recommendedTreatment,
    };

    updateUserData((prev) => ({
      ...prev,
      phaseShiftNotificationsEnabled: prev.phaseShiftNotificationsEnabled ?? true,
      lastNotifiedStageKey: toStage,
      lastPhaseShiftNotifiedAt: nowIso,
      lastPhaseShiftSummary: summary,
    }));

    if (sentBrowser) {
      showToast(
        `🔔 Phase Shift Browser Notification Sent (${fromInfo.shortName} → ${toInfo.shortName})! Check your nutrition & skincare tips.`,
        'success'
      );
    } else {
      showToast(
        `${toInfo.emoji} Phase Shift (${fromInfo.shortName} → ${toInfo.shortName}): ${shiftGuide.recommendedSnack} & ${shiftGuide.recommendedTreatment}`,
        'info'
      );
    }
  };

  // Toggle Phase Shift Browser Notifications ON/OFF
  const handleTogglePhaseShiftNotifications = async () => {
    if (!userData) return;
    const currentlyEnabled = userData.phaseShiftNotificationsEnabled !== false;
    const nextEnabled = !currentlyEnabled;

    if (!nextEnabled) {
      updateUserData((prev) => ({
        ...prev,
        phaseShiftNotificationsEnabled: false,
      }));
      showToast('🔕 Phase Shift Notifications turned off.', 'info');
      return;
    }

    let permissionState: NotificationPermission | 'unsupported' =
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'unsupported';

    if (permissionState === 'default') {
      try {
        permissionState = await Notification.requestPermission();
      } catch {
        permissionState = 'denied';
      }
    }

    const currentMetrics = calculateCycleMetrics(userData, lockedTodayStr);
    const toStage = currentMetrics.stageKey;
    const shiftGuide = PHASE_SHIFT_NOTIFICATION_DATA[toStage];
    const fromStage = shiftGuide.defaultFromStage;
    const fromInfo = PHASE_ADVISOR_DATA[fromStage];
    const toInfo = PHASE_ADVISOR_DATA[toStage];
    const nowIso = new Date().toISOString();

    const summary: PhaseShiftNotificationSummary = {
      fromStage,
      toStage,
      notifiedAt: nowIso,
      nutritionTip: shiftGuide.nutritionTip,
      skincareTip: shiftGuide.skincareTip,
      recommendedSnack: shiftGuide.recommendedSnack,
      recommendedTreatment: shiftGuide.recommendedTreatment,
    };

    updateUserData((prev) => ({
      ...prev,
      phaseShiftNotificationsEnabled: true,
      lastNotifiedStageKey: toStage,
      lastPhaseShiftNotifiedAt: nowIso,
      lastPhaseShiftSummary: summary,
    }));

    if (permissionState === 'granted') {
      triggerBrowserNotification(
        `${toInfo.emoji} Phase Shift Alerts Active (${fromInfo.shortName} → ${toInfo.shortName})!`,
        `🥗 Nutrition: ${shiftGuide.nutritionTip}\n✨ Skincare: ${shiftGuide.skincareTip}`,
        `bloomcampus-phase-shift-${toStage.toLowerCase()}`
      );
      showToast(
        '🔔 Phase Shift Notifications ON! Browser notifications will alert you whenever you enter a new cycle phase.',
        'success'
      );
    } else {
      showToast(
        '🔔 Phase Shift Notifications ON! In-app nutrition & skincare alerts active (enable browser notifications in site settings for desktop/phone popups).',
        'info'
      );
    }
  };

  // Trigger / Test a Phase Shift Notification on demand (e.g., Follicular -> Ovulation or any stage)
  const handleSimulatePhaseShiftNotification = async (targetStageOverride?: StageKey) => {
    if (!userData) return;
    const currentMetrics = calculateCycleMetrics(userData, lockedTodayStr);
    const toStage: StageKey = targetStageOverride || currentMetrics.stageKey || 'OVULATION';
    const fromStage: StageKey = PHASE_SHIFT_NOTIFICATION_DATA[toStage].defaultFromStage;
    await dispatchPhaseShiftNotification(fromStage, toStage, {
      requestPermissionIfDefault: true,
    });
  };

  // Automatic Cycle Phase Shift Browser Notification Check when user moves into a new cycle phase
  useEffect(() => {
    if (!userData || userData.phaseShiftNotificationsEnabled === false) return;
    if (!Array.isArray(userData.periods) || userData.periods.length === 0) return;

    const currentMetrics = calculateCycleMetrics(userData, lockedTodayStr);
    const currentStage = currentMetrics.stageKey;
    const previousStage = userData.lastNotifiedStageKey;

    if (!previousStage) {
      // Initialize baseline stage so future transitions fire automatically
      updateUserData((prev) => ({
        ...prev,
        lastNotifiedStageKey: currentStage,
      }));
      return;
    }

    if (previousStage !== currentStage) {
      void dispatchPhaseShiftNotification(previousStage, currentStage, {
        requestPermissionIfDefault: false,
      });
    }
  }, [
    userData?.periods,
    userData?.customCycleLength,
    userData?.lastNotifiedStageKey,
    userData?.phaseShiftNotificationsEnabled,
    lockedTodayStr,
  ]);

  // Toggle 2-Day Cycle Reminder Notifications (requests Browser Notification permission)
  const handleToggleCycleReminders = async () => {
    if (!userData) return;
    const nextEnabled = !userData.cycleRemindersEnabled;

    if (!nextEnabled) {
      updateUserData((prev) => ({
        ...prev,
        cycleRemindersEnabled: false,
      }));
      showToast('🔕 2-Day Period Reminder notifications turned off.', 'info');
      return;
    }

    // Turning ON: check Browser Notification API support and permission
    let permissionState: NotificationPermission | 'unsupported' =
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission
        : 'unsupported';

    if (permissionState === 'default') {
      try {
        permissionState = await Notification.requestPermission();
      } catch {
        permissionState = 'denied';
      }
    }

    const currentMetrics = calculateCycleMetrics(userData, formatDateISO(new Date()));
    const nextDateLabel = currentMetrics.nextPeriodDateStr
      ? formatHumanDate(currentMetrics.nextPeriodDateStr)
      : 'your next cycle';

    updateUserData((prev) => ({
      ...prev,
      cycleRemindersEnabled: true,
    }));

    if (permissionState === 'granted') {
      triggerBrowserNotification(
        '🌸 BloomCampus 2-Day Reminder Active!',
        `We will alert you 2 days before your predicted period (${nextDateLabel}) so your campus bag is packed.`
      );
      showToast(
        '🔔 2-Day Period Reminders ON! Browser notification permission granted.',
        'success'
      );
    } else {
      showToast(
        `🔔 2-Day Period Reminders ON for ${nextDateLabel}! (In-app reminder active; allow browser notifications in site settings for desktop/phone popups).`,
        'info'
      );
    }
  };

  const handleSendTestCycleNotification = async () => {
    if (!userData) return;
    const currentMetrics = calculateCycleMetrics(userData, formatDateISO(new Date()));
    const nextDateLabel = currentMetrics.nextPeriodDateStr
      ? formatHumanDate(currentMetrics.nextPeriodDateStr)
      : 'in ~2 days';

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch {
          // ignore
        }
      }
    }

    const sentNative = triggerBrowserNotification(
      '🎒 Heads up: Period Expected in ~2 Days!',
      `Predicted start: ${nextDateLabel}. Remember to pack pads, tampons, and pain relief in your bag for class!`
    );

    setForceBagBannerPreview(true);
    setBagBannerDismissed(false);

    if (sentNative) {
      showToast('🔔 Sent 2-Day Period Reminder via Browser Notification!', 'success');
    } else {
      showToast(
        `🎒 2-Day Reminder Preview: Period expected around ${nextDateLabel}! Pack pads, tampons & pain relief.`,
        'info'
      );
    }
  };

  // Automatic 2-Day Before Predicted Period Browser Notification Check
  useEffect(() => {
    if (!userData || !userData.cycleRemindersEnabled) return;
    const todayIso = formatDateISO(new Date());
    const m = calculateCycleMetrics(userData, todayIso);

    if (
      m.nextPeriodDateStr &&
      m.daysUntilNextPeriod !== null &&
      m.daysUntilNextPeriod >= 0 &&
      m.daysUntilNextPeriod <= 2 &&
      userData.lastReminderNotifiedForPeriod !== m.nextPeriodDateStr
    ) {
      const daysLabel =
        m.daysUntilNextPeriod === 0
          ? 'today'
          : m.daysUntilNextPeriod === 1
          ? 'tomorrow'
          : 'in 2 days';

      triggerBrowserNotification(
        `🎒 Period Expected ${daysLabel.toUpperCase()} (${formatShortMonthDay(
          m.nextPeriodDateStr
        )})!`,
        'Make sure you have pads, tampons, and pain relief packed in your campus bag for class!'
      );

      updateUserData((prev) => ({
        ...prev,
        lastReminderNotifiedForPeriod: m.nextPeriodDateStr || undefined,
      }));
    }
  }, [userData]);

  // Helper to update userData and persist to both localStorage and server memory
  const updateUserData = (updater: (prev: UserData) => UserData) => {
    setUserData((prev) => {
      if (!prev) return prev;
      const updated: UserData = {
        ...updater(prev),
        lastUpdatedAt: new Date().toISOString(),
      };
      if (currentUserEmail) {
        const users = getAllUsers();
        users[currentUserEmail] = updated;
        saveAllUsers(users, currentUserEmail);
        setAllUsersMap({ ...users });
      }
      return updated;
    });
  };

  // Helper to send Owner Email Notification (mailto payload to abdulbobsonbaituray@gmail.com) + save to server inquiry log
  const triggerOwnerEmailAndServerAlert = (params: {
    userName: string;
    userEmail: string;
    userPhone?: string;
    userAge?: string;
    deviceInfo?: string;
    subject: string;
    message: string;
    type: 'payment' | 'support' | 'login' | 'signup';
    openMailClient?: boolean;
  }) => {
    const newInq: SupportInquiry = {
      id: `inq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userName: params.userName,
      userEmail: params.userEmail,
      userPhone: params.userPhone,
      userAge: params.userAge,
      deviceInfo: params.deviceInfo,
      subject: params.subject,
      message: params.message,
      type: params.type,
      createdAt: new Date().toISOString(),
    };
    setSupportInquiries((prev) => [newInq, ...prev]);
    syncSupportInquiryToFirestore(newInq).catch(() => {});

    fetch('/api/admin/inquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.supportInquiries)) {
          setSupportInquiries(d.supportInquiries);
        }
      })
      .catch(() => {
        // Offline fallback
      });

    if (params.openMailClient !== false) {
      const mailtoHref = `mailto:${encodeURIComponent(OWNER_ADMIN_EMAIL)}?subject=${encodeURIComponent(
        params.subject
      )}&body=${encodeURIComponent(params.message)}`;
      const a = document.createElement('a');
      a.href = mailtoHref;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // =========================================================================
  // OWNER ADMIN DASHBOARD HANDLERS
  // =========================================================================
  const syncLatestUsersFromEverywhere = async (): Promise<number> => {
    let combined = mergeUsersMaps(getAllUsers(), allUsersMap);
    try {
      const cloudUsers = await fetchAllUsersFromFirestore();
      if (cloudUsers && Object.keys(cloudUsers).length > 0) {
        combined = mergeUsersMaps(combined, cloudUsers);
      }
    } catch {
      // ignore
    }
    try {
      const res = await fetch('/api/users/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allUsers: combined }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.users && typeof data.users === 'object') {
          combined = mergeUsersMaps(combined, data.users as Record<string, UserData>);
        }
        if (Array.isArray(data?.supportInquiries) && data.supportInquiries.length > 0) {
          setSupportInquiries(data.supportInquiries);
        }
      }
    } catch {
      // ignore
    }
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(combined));
    setAllUsersMap(combined);
    syncAllUsersToFirestore(combined).catch(() => {});
    return Object.keys(combined).length;
  };

  const handleAdminLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOwnerAdminCredentials(adminLoginEmail, adminLoginPassword, adminConfig)) {
      const emailClean = adminLoginEmail.trim().toLowerCase();
      setIsAdminView(true);
      setShowAdminLoginModal(false);
      setShowSidebarDrawer(false);
      setAdminLoginPassword('');
      localStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
      const totalCount = await syncLatestUsersFromEverywhere();
      showToast(
        emailClean === OWNER_ADMIN_EMAIL.toLowerCase()
          ? `🛡️ Welcome Owner (${CREATOR_NAME})! Showing all ${totalCount} people in the app.`
          : `🛡️ Welcome Admin (${emailClean})! Showing all ${totalCount} people in the app.`,
        'success'
      );
    } else {
      showToast(
        'Invalid Admin credentials. Enter a valid Owner or Added Admin email and password.',
        'warning'
      );
    }
  };

  const handleGoogleAdminLogin = async () => {
    try {
      const googleUser = await signInWithGooglePopup();
      const gEmail = (googleUser.email || '').trim().toLowerCase();
      const isAuthorized =
        gEmail === OWNER_ADMIN_EMAIL.toLowerCase() ||
        (adminConfig.additionalAdmins || []).some(
          (a) => a.email.trim().toLowerCase() === gEmail
        );
      if (isAuthorized) {
        setIsAdminView(true);
        setShowAdminLoginModal(false);
        setShowSidebarDrawer(false);
        localStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
        const totalCount = await syncLatestUsersFromEverywhere();
        showToast(
          `🛡️ Google Admin Verified (${gEmail})! Showing all ${totalCount} people in the app.`,
          'success'
        );
      } else {
        showToast(
          `Google account (${gEmail}) is not registered as an Admin. Sign in with ${OWNER_ADMIN_EMAIL} or an added Admin email.`,
          'warning'
        );
      }
    } catch {
      showToast('Google Sign-In was cancelled or blocked by popup settings. Use your Admin email & password above.', 'info');
    }
  };

  const handleUpdateAdminConfig = (nextCfg: AdminConfig) => {
    setAdminConfig(nextCfg);
    saveAdminConfig(nextCfg);
    syncAdminConfigToFirestore(nextCfg).catch(() => {});
    fetch('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextCfg),
    }).catch(() => {});
  };

  const handleExtendUserFreeAccess = (targetEmail: string, daysToAdd = 14) => {
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const isOneMonthFree = daysToAdd >= 30;
    const nowMs = Date.now();

    if (targetEmail === 'ALL') {
      const allKeys = Object.keys(users);
      if (allKeys.length === 0) {
        showToast('No registered users found yet.', 'info');
        return;
      }
      const newExpMs = nowMs + daysToAdd * 24 * 60 * 60 * 1000;
      const expFormatted = new Date(newExpMs).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      allKeys.forEach((k) => {
        const u = users[k];
        if (!u || !u.email) return;
        const baseMs =
          !isOneMonthFree && u.subscriptionUntil && u.subscriptionUntil > nowMs
            ? u.subscriptionUntil
            : nowMs;
        const userExpMs = Math.max(newExpMs, baseMs + daysToAdd * 24 * 60 * 60 * 1000);
        users[k] = {
          ...u,
          subscriptionStatus: isOneMonthFree ? 'free_password' : 'active',
          usedFreeAccessPassword: isOneMonthFree ? true : false,
          subscriptionUntil: userExpMs,
          paymentMethod: isOneMonthFree
            ? '1-Month Free Access (Owner Grant — Le 0)'
            : '2-Week Free Access',
          pendingPayment: null,
          approvalWelcomePending: true,
          lastApprovedExpirationDate: expFormatted,
          lastUpdatedAt: new Date().toISOString(),
        };
      });

      saveAllUsers(users, undefined, true);
      setAllUsersMap({ ...users });
      if (currentUserEmail && users[currentUserEmail.toLowerCase().trim()]) {
        setUserData(users[currentUserEmail.toLowerCase().trim()]);
      }
      showToast(
        `🎁 Granted ${allKeys.length} logged-in people ${
          isOneMonthFree ? '1 Month (30 Days) Free' : `+${daysToAdd} Days Free`
        } (until ${expFormatted}) — Le 0 added to Money Made!`,
        'success'
      );
      return;
    }

    const emailKey = targetEmail.toLowerCase().trim();
    const target = users[emailKey];
    if (!target) return;

    const baseMs =
      !isOneMonthFree && target.subscriptionUntil && target.subscriptionUntil > nowMs
        ? target.subscriptionUntil
        : nowMs;
    const newExpMs = Math.max(
      nowMs + daysToAdd * 24 * 60 * 60 * 1000,
      baseMs + daysToAdd * 24 * 60 * 60 * 1000
    );
    const expFormatted = new Date(newExpMs).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const updatedUser: UserData = {
      ...target,
      subscriptionStatus: isOneMonthFree ? 'free_password' : 'active',
      usedFreeAccessPassword: isOneMonthFree ? true : false,
      subscriptionUntil: newExpMs,
      paymentMethod: isOneMonthFree
        ? '1-Month Free Access (Owner Grant — Le 0)'
        : '2-Week Free Access',
      pendingPayment: null,
      approvalWelcomePending: true,
      lastApprovedExpirationDate: expFormatted,
      paymentHistory: isOneMonthFree
        ? (target.paymentHistory || []).map((item) =>
            item.status === 'approved' ? { ...item, status: 'pending' as const } : item
          )
        : target.paymentHistory,
      lastUpdatedAt: new Date().toISOString(),
    };

    users[emailKey] = updatedUser;
    saveAllUsers(users, emailKey, true);
    setAllUsersMap({ ...users });
    if (currentUserEmail === emailKey) {
      setUserData(updatedUser);
    }

    showToast(
      isOneMonthFree
        ? `🎁 Gave ${updatedUser.name} (${updatedUser.email}) 1 Month (30 Days) FREE Access until ${expFormatted} — Le 0 added to Money Made!`
        : `🎁 Extended ${updatedUser.name} (${updatedUser.email}) by +${daysToAdd} days free access (until ${expFormatted}) — Le 0 added!`,
      'success'
    );
  };

  const handleRegisterNewUserByAdmin = (params: {
    name: string;
    age: string;
    email: string;
    phone: string;
    password: string;
    originalEmail?: string;
    subscriptionStatus?: 'active' | 'pending_verification' | 'expired' | 'free_password';
    subscriptionDays?: number;
  }) => {
    const emailClean = params.email.trim().toLowerCase();
    const origClean = params.originalEmail ? params.originalEmail.trim().toLowerCase() : '';
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    const existingRecord =
      (origClean && users[origClean]) || users[emailClean] || null;

    if (origClean && origClean !== emailClean && users[origClean]) {
      delete users[origClean];
      deleteUserFromFirestore(origClean).catch(() => {});
      fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: origClean }),
      }).catch(() => {});
    }

    const baseUser =
      existingRecord ||
      createDefaultUserObject(
        params.name || emailClean.split('@')[0],
        emailClean,
        params.password,
        params.age || '21',
        params.phone
      );

    const firstMs =
      existingRecord && Number(existingRecord.firstEntryAt || existingRecord.createdAt) > 0
        ? Number(existingRecord.firstEntryAt || existingRecord.createdAt)
        : Date.now();

    const nextStatus = params.subscriptionStatus || baseUser.subscriptionStatus || 'active';
    const nextDays =
      typeof params.subscriptionDays === 'number' && !Number.isNaN(params.subscriptionDays)
        ? Math.max(0, params.subscriptionDays)
        : null;
    const nextSubUntil =
      nextStatus === 'expired'
        ? Date.now() - 86400000
        : nextDays !== null
        ? Date.now() + nextDays * 86400000
        : baseUser.subscriptionUntil || Date.now() + twoWeeksMs;

    const updatedUser: UserData = {
      ...baseUser,
      name: params.name.trim() || baseUser.name || emailClean.split('@')[0],
      age: params.age.trim() || baseUser.age || '21',
      email: emailClean,
      phone: params.phone.trim() || resolveCustomerPhoneUsed(baseUser),
      password: params.password.trim() || baseUser.password,
      firstEntryAt: firstMs,
      createdAt: firstMs,
      subscriptionStatus: nextStatus,
      subscriptionUntil: nextSubUntil,
      isVip: nextStatus === 'free_password' ? true : baseUser.isVip,
      usedFreeAccessPassword:
        nextStatus === 'free_password' ? true : baseUser.usedFreeAccessPassword,
      pendingPayment: nextStatus === 'active' || nextStatus === 'free_password' ? null : baseUser.pendingPayment,
      paymentMethod:
        nextStatus === 'free_password'
          ? 'Free 30-Day Access Password'
          : baseUser.paymentMethod || '2-Week Free Access',
      signupSource: existingRecord ? baseUser.signupSource || 'Admin Updated' : 'Admin Registered',
      deviceInfo: baseUser.deviceInfo || getClientDeviceLabel(),
      lastUpdatedAt: new Date().toISOString(),
    };

    users[emailClean] = updatedUser;
    const numbered = assignSequentialCustomerNumbers(users);
    saveAllUsers(numbered, emailClean, true);
    logCustomerEntryToFirestore(numbered[emailClean], 'Admin Updated').catch(() => {});
    setAllUsersMap({ ...numbered });
    if (currentUserEmail && currentUserEmail.toLowerCase().trim() === emailClean) {
      setUserData(numbered[emailClean]);
    }
    showToast(
      existingRecord
        ? `✅ Updated customer entry #${numbered[emailClean]?.customerNumber || 1} (${updatedUser.name} • ${updatedUser.email}) across all devices!`
        : `✅ Registered customer entry #${numbered[emailClean]?.customerNumber || Object.keys(numbered).length} (${updatedUser.name} • ${updatedUser.email})!`,
      'success'
    );
  };

  const handleDeleteUserByAdmin = (targetEmail: string) => {
    const emailKey = targetEmail.toLowerCase().trim();
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const targetName = users[emailKey]?.name || emailKey;
    delete users[emailKey];
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
    setAllUsersMap({ ...users });
    deleteUserFromFirestore(emailKey).catch(() => {});
    fetch('/api/users/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailKey }),
    }).catch(() => {});
    showToast(`🗑️ Removed ${targetName} (${emailKey}) from the app directory.`, 'info');
  };

  const handleApproveUserPayment = (targetEmail: string) => {
    const emailKey = targetEmail.toLowerCase().trim();
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const target = users[emailKey];
    if (!target) return;

    const newExpMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const expFormatted = new Date(newExpMs).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const updatedUser: UserData = {
      ...target,
      subscriptionStatus: 'active',
      usedFreeAccessPassword: false,
      subscriptionUntil: newExpMs,
      paymentMethod: 'Orange Money (Verified by Owner)',
      approvalWelcomePending: true,
      lastApprovedExpirationDate: expFormatted,
      pendingPayment: target.pendingPayment
        ? {
            ...target.pendingPayment,
            status: 'approved',
            reviewedAt: new Date().toISOString(),
          }
        : null,
      paymentHistory: (target.paymentHistory || []).map((item, idx) =>
        idx === 0 ? { ...item, status: 'approved' } : item
      ),
      lastUpdatedAt: new Date().toISOString(),
    };

    users[emailKey] = updatedUser;
    saveAllUsers(users, emailKey, true);
    setAllUsersMap({ ...users });
    if (currentUserEmail === emailKey) {
      setUserData(updatedUser);
    }

    showToast(
      `✅ Approved ${updatedUser.name} (${updatedUser.email}) for 30 days until ${expFormatted}! In-app welcome banner + Email notification triggered.`,
      'success'
    );
  };

  const handleRejectOrExpireUser = (targetEmail: string, mode: 'reject' | 'expire') => {
    const emailKey = targetEmail.toLowerCase().trim();
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const target = users[emailKey];
    if (!target) return;

    const updatedUser: UserData = {
      ...target,
      subscriptionStatus: 'expired',
      subscriptionUntil: Date.now() - 1000,
      pendingPayment:
        mode === 'reject' && target.pendingPayment
          ? {
              ...target.pendingPayment,
              status: 'rejected',
              reviewedAt: new Date().toISOString(),
            }
          : target.pendingPayment,
      lastUpdatedAt: new Date().toISOString(),
    };

    users[emailKey] = updatedUser;
    saveAllUsers(users, emailKey, true);
    setAllUsersMap({ ...users });
    if (currentUserEmail === emailKey) {
      setUserData(updatedUser);
    }

    showToast(
      mode === 'reject'
        ? `❌ Rejected payment for ${updatedUser.name}. Account remains locked.`
        : `🔒 Expired access pass for ${updatedUser.name}. User must renew via Orange Money.`,
      'info'
    );
  };

  const copyTextToClipboard = (text: string, successMsg?: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => showToast(successMsg || 'Copied to clipboard!', 'success'))
        .catch(() => fallbackCopy(text, successMsg));
    } else {
      fallbackCopy(text, successMsg);
    }
  };

  const fallbackCopy = (text: string, successMsg?: string) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg || 'Copied to clipboard!', 'success');
    } catch {
      showToast('Could not copy automatically.', 'warning');
    }
    document.body.removeChild(textarea);
  };

  // =========================================================================
  // 1. AUTHENTICATION HANDLERS
  // =========================================================================
  const loginUserSession = (email: string, loadedUsers?: Record<string, UserData>) => {
    const users = loadedUsers || getAllUsers();
    const u = users[email];
    if (!u) return;
    setCurrentUserEmail(email);
    setUserData(u);
    setAllUsersMap({ ...users });
    localStorage.setItem(STORAGE_SESSION_KEY, email);

    const todayIso = getLockedTodayISO();
    setSelectedDateStr(todayIso);
    let sorted = getSortedPeriods(u.periods);
    if (sorted.length === 0) {
      try {
        const lmpRaw = localStorage.getItem(STORAGE_LMP_MEMORY_KEY);
        if (lmpRaw) {
          const parsedLmp = JSON.parse(lmpRaw);
          const lmpOwnerEmail =
            typeof parsedLmp?.email === 'string' ? parsedLmp.email.toLowerCase().trim() : '';
          if (
            parsedLmp &&
            lmpOwnerEmail === email.toLowerCase().trim() &&
            typeof parsedLmp.startDate === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(parsedLmp.startDate)
          ) {
            u.periods = [{ startDate: parsedLmp.startDate, endDate: parsedLmp.endDate || null }];
            users[email] = u;
            saveAllUsers(users, email);
            setUserData({ ...u });
            sorted = getSortedPeriods(u.periods);
          }
        }
      } catch {
        // ignore
      }
    }
    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    setPeriodStartInput(latest ? latest.startDate : '');
    setPeriodEndInput(latest && latest.endDate ? latest.endDate : '');
    if (latest) {
      try {
        localStorage.setItem(
          STORAGE_LMP_MEMORY_KEY,
          JSON.stringify({
            email,
            startDate: latest.startDate,
            endDate: latest.endDate || null,
            customCycleLength: u.customCycleLength || 28,
          })
        );
      } catch {
        // ignore
      }
    }
    setCustomPillDateTime(formatDateTimeLocalISO(getLockedRealTimeDate() as Date));
    const now = getLockedRealTimeDate();
    setCalendarMonth(now.getMonth());
    setCalendarYear(now.getFullYear());

    const trial = getTrialStatus(u);
    if (trial.status === 'expired' || trial.status === 'pending_verification') {
      setIsPaywallPreview(false);
      setShowPaywallModal(true);
    }
  };

  const focusAuthInputField = (
    fieldId: 'authName' | 'authAge' | 'authEmail' | 'authPhone' | 'authPassword',
    message: string
  ) => {
    setAuthFieldError({ fieldId, message });
    showToast(message, 'warning');
    const refMap: Record<
      'authName' | 'authAge' | 'authEmail' | 'authPhone' | 'authPassword',
      HTMLInputElement | null
    > = {
      authName: authNameInputRef.current,
      authAge: authAgeInputRef.current,
      authEmail: authEmailInputRef.current,
      authPhone: authPhoneInputRef.current,
      authPassword: authPasswordInputRef.current,
    };
    const targetInput =
      refMap[fieldId] ||
      (typeof document !== 'undefined'
        ? (document.getElementById(fieldId) as HTMLInputElement | null)
        : null);
    if (targetInput) {
      targetInput.focus();
      try {
        targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch {
        // ignore scrollIntoView error
      }
    }
  };

  const handleAuthSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    // Read from React state with DOM input fallback (handles browser autofill / mobile keyboards)
    const domName =
      authNameInputRef.current?.value ||
      (typeof document !== 'undefined'
        ? (document.getElementById('authName') as HTMLInputElement | null)?.value || ''
        : '');
    const domAge =
      authAgeInputRef.current?.value ||
      (typeof document !== 'undefined'
        ? (document.getElementById('authAge') as HTMLInputElement | null)?.value || ''
        : '');
    const domEmail =
      authEmailInputRef.current?.value ||
      (typeof document !== 'undefined'
        ? (document.getElementById('authEmail') as HTMLInputElement | null)?.value || ''
        : '');
    const domPhone =
      authPhoneInputRef.current?.value ||
      (typeof document !== 'undefined'
        ? (document.getElementById('authPhone') as HTMLInputElement | null)?.value || ''
        : '');
    const domPassword =
      authPasswordInputRef.current?.value ||
      (typeof document !== 'undefined'
        ? (document.getElementById('authPassword') as HTMLInputElement | null)?.value || ''
        : '');

    const nameTrim = (authName || domName).trim();
    const ageTrim = (authAge || domAge).trim();
    const emailTrim = (authEmail || domEmail).trim().toLowerCase();
    const phoneTrim = (authPhone || domPhone).trim();
    const passVal = (authPassword || domPassword).trim();

    if (nameTrim && nameTrim !== authName) setAuthName(nameTrim);
    if (ageTrim && ageTrim !== authAge) setAuthAge(ageTrim);
    if (emailTrim && emailTrim !== authEmail) setAuthEmail(emailTrim);
    if (phoneTrim && phoneTrim !== authPhone) setAuthPhone(phoneTrim);
    if (passVal && passVal !== authPassword) setAuthPassword(passVal);

    // Check Owner / Admin credentials first so Admin login always works immediately
    if (emailTrim && passVal && isOwnerAdminCredentials(emailTrim, passVal, adminConfig)) {
      setAuthFieldError(null);
      const mergedAll = mergeUsersMaps(getAllUsers(), allUsersMap);
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(mergedAll));
      setAllUsersMap(mergedAll);
      setIsAdminView(true);
      localStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
      showToast(
        `🛡️ Admin Recognized (${emailTrim})! Showing all ${Object.keys(mergedAll).length} people in the app.`,
        'success'
      );
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneDigits = phoneTrim.replace(/\D/g, '');
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const deviceLabel = getClientDeviceLabel();

    const usedVipPassOnAuth =
      isSecretVipPassword(passVal, adminConfig.freeAccessPassword) ||
      (authFreeAccessPassInput.trim().length > 0 &&
        isSecretVipPassword(authFreeAccessPassInput.trim(), adminConfig.freeAccessPassword));

    if (authMode === 'signin') {
      // Sign-In Mode: Require the user's own registered Email Address or Phone Number AND their Password
      const rawIdentifier = (emailTrim || phoneTrim).trim();
      if (!rawIdentifier) {
        focusAuthInputField(
          'authEmail',
          'Please enter your registered Email Address or Phone Number to sign in.'
        );
        return;
      }

      if (!passVal) {
        focusAuthInputField(
          'authPassword',
          'Please enter the password you used to create your account.'
        );
        return;
      }

      setAuthFieldError(null);
      const idLower = rawIdentifier.toLowerCase();
      const idDigits = rawIdentifier.replace(/\D/g, '');

      // 1. Check if identifier matches the user's exact registered email or phone number
      let matchedKey = Object.keys(users).find((k) => {
        const u = users[k];
        if (!u) return false;
        const uEmail = (u.email || k).toLowerCase().trim();
        if (uEmail === idLower || k.toLowerCase().trim() === idLower) return true;
        if (idLower.indexOf('@') === -1 && idDigits.length < 6 && uEmail === `${idLower}@gmail.com`) return true;
        const uPhoneDigits = resolveCustomerPhoneUsed(u).replace(/\D/g, '');
        if (
          idDigits.length >= 6 &&
          uPhoneDigits.length >= 6 &&
          (uPhoneDigits === idDigits ||
            (idDigits.length >= 8 && uPhoneDigits.endsWith(idDigits)) ||
            (uPhoneDigits.length >= 8 && idDigits.endsWith(uPhoneDigits)))
        ) {
          return true;
        }
        return false;
      });

      let existing = matchedKey ? users[matchedKey] : undefined;

      // 2. If not found locally, try Cloud Firestore lookup
      const candidateEmail = emailRegex.test(idLower)
        ? idLower
        : idDigits.length >= 6 && !/[a-z]/i.test(idLower)
        ? `${idDigits}@phone.bloomcampus.app`
        : `${idLower.replace(/[^a-z0-9._-]/g, '') || 'student'}@gmail.com`;

      if (!existing) {
        try {
          const cloudRecord = await fetchSingleUserFromFirestore(candidateEmail);
          if (cloudRecord) {
            const sanitizedCloud = sanitizeClientUser(cloudRecord, candidateEmail);
            users[candidateEmail] = sanitizedCloud;
            existing = sanitizedCloud;
            matchedKey = candidateEmail;
          }
        } catch {
          // Offline fallback
        }
      }

      if (!existing) {
        focusAuthInputField(
          'authEmail',
          'No account found with this Email or Phone Number. Please switch to "Create Account" to create your account first.'
        );
        return;
      }

      const savedPassword = (existing.password || '').trim();
      if (savedPassword.length > 0 && passVal !== savedPassword) {
        focusAuthInputField(
          'authPassword',
          'Incorrect password. Please enter the exact same password you used when creating your account.'
        );
        return;
      }

      const finalEmailKey = (existing?.email || matchedKey || candidateEmail).toLowerCase().trim();
      const resolvedUser = existing;

      if (nameTrim) resolvedUser.name = nameTrim;
      if (ageTrim) resolvedUser.age = ageTrim;
      if (phoneTrim) resolvedUser.phone = phoneTrim;
      resolvedUser.password = savedPassword.length > 0 ? savedPassword : passVal;
      if (usedVipPassOnAuth) {
        resolvedUser.isVip = true;
        resolvedUser.usedFreeAccessPassword = true;
        resolvedUser.subscriptionStatus = 'free_password';
        resolvedUser.subscriptionUntil = nowMs + thirtyDaysMs;
        resolvedUser.paymentMethod = `Free 30-Day Access Password (${adminConfig.freeAccessPassword})`;
      }
      resolvedUser.email = finalEmailKey;
      resolvedUser.firstEntryAt =
        Number(resolvedUser.firstEntryAt || resolvedUser.createdAt) > 0
          ? Number(resolvedUser.firstEntryAt || resolvedUser.createdAt)
          : nowMs;
      resolvedUser.createdAt = resolvedUser.firstEntryAt;
      resolvedUser.deviceInfo = deviceLabel;
      resolvedUser.lastUpdatedAt = nowIso;
      resolvedUser.lastSignInAt = nowIso;
      resolvedUser.signInCount = existing ? (existing.signInCount || 1) + 1 : 1;
      resolvedUser.signupSource = 'Sign In';

      users[finalEmailKey] = resolvedUser;
      const numbered = assignSequentialCustomerNumbers(users);
      const savedUser = numbered[finalEmailKey];
      saveAllUsers(numbered, finalEmailKey, true);
      setAllUsersMap({ ...numbered });
      loginUserSession(finalEmailKey, numbered);
      showToast(
        `🌸 Welcome back, ${savedUser?.name || finalEmailKey}! (Customer Entry #${savedUser?.customerNumber || 1})`,
        'success'
      );

      triggerOwnerEmailAndServerAlert({
        userName: savedUser.name,
        userEmail: savedUser.email,
        userPhone: resolveCustomerPhoneUsed(savedUser) || 'Not entered',
        userAge: savedUser.age || '21',
        deviceInfo: deviceLabel,
        subject: `🔑 User Signed In (#${savedUser.customerNumber || 1}): ${savedUser.name} (${savedUser.email})`,
        message:
          `Customer Entry #${savedUser.customerNumber || 1} signed in to BloomCampus!\n` +
          `• Name: ${savedUser.name}\n` +
          `• Email: ${savedUser.email}\n` +
          `• Age: ${savedUser.age || '21'}\n` +
          `• Phone Number Used: ${resolveCustomerPhoneUsed(savedUser) || 'Not entered'}\n` +
          `• Total Sign-Ins: ${savedUser.signInCount || 1}\n` +
          `• Device: ${deviceLabel}\n` +
          `• Time: ${new Date(nowMs).toLocaleString()}`,
        type: 'login',
        openMailClient: false,
      });

      void logCustomerEntryToFirestore(savedUser, 'Sign In').catch(() => {});
      return;
    }

    // Create Account Mode Validation (Name, Age, Email, Phone, Password)
    if (!nameTrim || nameTrim.length < 2) {
      focusAuthInputField(
        'authName',
        'Please enter your full name in the "Your Name" field to create your account.'
      );
      return;
    }

    const parsedAge = Number(ageTrim);
    if (!ageTrim || !Number.isInteger(parsedAge) || Number.isNaN(parsedAge) || parsedAge < 10 || parsedAge > 99) {
      focusAuthInputField(
        'authAge',
        'Please enter your age (between 10 and 99) in the "Age" field.'
      );
      return;
    }

    if (!emailTrim) {
      focusAuthInputField(
        'authEmail',
        'Please enter your email address in the "Email Address" field.'
      );
      return;
    }

    // Auto-complete @gmail.com if the user typed a username without @
    const normalizedSignupEmail = emailTrim.includes('@')
      ? emailTrim
      : `${emailTrim.replace(/\s+/g, '')}@gmail.com`;

    if (!emailRegex.test(normalizedSignupEmail)) {
      focusAuthInputField(
        'authEmail',
        'Please enter a valid email address (for example, you@gmail.com).'
      );
      return;
    }

    if (!phoneTrim || phoneDigits.length < 6) {
      focusAuthInputField(
        'authPhone',
        'Please enter a valid phone number with at least 6 digits (e.g., 076 123 456).'
      );
      return;
    }

    if (!passVal) {
      focusAuthInputField(
        'authPassword',
        'Please create a password for your account (you will use this same password to Sign In).'
      );
      return;
    }

    setAuthFieldError(null);

    let matchedKey = Object.keys(users).find(
      (k) =>
        k.toLowerCase().trim() === normalizedSignupEmail ||
        (users[k]?.email && users[k].email.toLowerCase().trim() === normalizedSignupEmail)
    );
    let existing = matchedKey ? users[matchedKey] : undefined;

    if (!existing) {
      try {
        const cloudRecord = await fetchSingleUserFromFirestore(normalizedSignupEmail);
        if (cloudRecord) {
          const sanitizedCloud = sanitizeClientUser(cloudRecord, normalizedSignupEmail);
          users[normalizedSignupEmail] = sanitizedCloud;
          existing = sanitizedCloud;
          matchedKey = normalizedSignupEmail;
        }
      } catch {
        // Offline fallback
      }
    }

    if (
      existing &&
      (existing.password || '').trim().length > 0 &&
      (existing.password || '').trim() !== passVal
    ) {
      focusAuthInputField(
        'authPassword',
        'An account with this email already exists. Please switch to "Sign In" and enter the password you used to create the account.'
      );
      return;
    }

    const firstEntryMs =
      existing && Number(existing.firstEntryAt || existing.createdAt) > 0
        ? Number(existing.firstEntryAt || existing.createdAt)
        : nowMs;
    const newUser =
      existing ||
      createDefaultUserObject(
        nameTrim || normalizedSignupEmail.split('@')[0],
        normalizedSignupEmail,
        passVal,
        ageTrim || '21',
        phoneTrim
      );

    newUser.name = nameTrim || existing?.name || normalizedSignupEmail.split('@')[0];
    newUser.age = ageTrim || existing?.age || '21';
    newUser.email = normalizedSignupEmail;
    newUser.phone = phoneTrim || resolveCustomerPhoneUsed(existing);
    newUser.password = passVal;
    newUser.firstEntryAt = firstEntryMs;
    newUser.createdAt = firstEntryMs;
    newUser.deviceInfo = deviceLabel;
    newUser.isVip = usedVipPassOnAuth ? true : existing?.isVip ?? false;
    newUser.usedFreeAccessPassword = usedVipPassOnAuth
      ? true
      : existing?.usedFreeAccessPassword ?? false;
    newUser.subscriptionStatus = usedVipPassOnAuth
      ? 'free_password'
      : existing?.subscriptionStatus || 'active';
    newUser.subscriptionUntil = usedVipPassOnAuth
      ? nowMs + thirtyDaysMs
      : existing?.subscriptionUntil || nowMs + twoWeeksMs;
    newUser.paymentMethod = usedVipPassOnAuth
      ? `Free 30-Day Access Password (${adminConfig.freeAccessPassword})`
      : existing?.paymentMethod || '2-Week Free Access';
    newUser.lastUpdatedAt = nowIso;
    newUser.lastSignInAt = nowIso;
    newUser.signInCount = existing ? (existing.signInCount || 1) + 1 : 1;
    newUser.signupSource = 'Create Account';

    users[normalizedSignupEmail] = newUser;
    const numbered = assignSequentialCustomerNumbers(users);
    const savedUser = numbered[normalizedSignupEmail];
    saveAllUsers(numbered, normalizedSignupEmail, true);
    setAllUsersMap({ ...numbered });
    loginUserSession(normalizedSignupEmail, numbered);
    showToast(
      usedVipPassOnAuth
        ? `🔑 Welcome, ${newUser.name}! Entry #${savedUser?.customerNumber || 1} unlocked with 30-Day Free Access Password.`
        : `🌸 Welcome, ${newUser.name}! Entry #${savedUser?.customerNumber || 1} saved with 2 weeks (14 days) of free access.`,
      'success'
    );

    triggerOwnerEmailAndServerAlert({
      userName: savedUser.name,
      userEmail: savedUser.email,
      userPhone: resolveCustomerPhoneUsed(savedUser) || 'Not entered',
      userAge: savedUser.age || '21',
      deviceInfo: deviceLabel,
      subject: `🆕 New Account Sign-Up (#${savedUser.customerNumber || 1}): ${savedUser.name} (${savedUser.email})`,
      message:
        `Customer Entry #${savedUser.customerNumber || 1} signed up in BloomCampus!\n` +
        `• Name: ${savedUser.name}\n` +
        `• Email: ${savedUser.email}\n` +
        `• Age: ${savedUser.age || '21'}\n` +
        `• Phone Number Used: ${resolveCustomerPhoneUsed(savedUser) || 'Not entered'}\n` +
        `• Device: ${deviceLabel}\n` +
        `• Time: ${new Date(nowMs).toLocaleString()}`,
      type: 'signup',
      openMailClient: false,
    });

    void logCustomerEntryToFirestore(savedUser, 'Create Account').catch(() => {});
  };

  const buildSampleStudentDataOnObject = (baseUser: UserData): UserData => {
    const now = new Date();
    const d = (offset: number) => {
      const copy = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return formatDateISO(copy);
    };
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    return {
      ...baseUser,
      periods: [
        { startDate: d(-154), endDate: d(-150) },
        { startDate: d(-125), endDate: d(-121) },
        { startDate: d(-97), endDate: d(-92) },
        { startDate: d(-69), endDate: d(-65) },
        { startDate: d(-41), endDate: d(-37) },
        { startDate: d(-13), endDate: d(-9) },
      ],
      emergencyPills: [
        { timestamp: fourDaysAgo.toISOString(), dateStr: formatDateISO(fourDaysAgo) },
      ],
      dailyLogs: {
        ...baseUser.dailyLogs,
        [d(-40)]: {
          mood: 'Fatigued',
          stageAtLog: 'MENSTRUATION STAGE',
          symptoms: ['Mild Cramps', 'Headache'],
          habits: ['Slept 7+ Hours', 'Hydrated'],
          notes: 'Rested between morning classes.',
          waterGlasses: 6,
        },
        [d(-33)]: {
          mood: 'Focused',
          stageAtLog: 'FOLLICULAR STAGE',
          symptoms: [],
          habits: ['Slept 7+ Hours', 'Hydrated', 'Moved My Body'],
          notes: 'Great focus finishing lab report.',
          waterGlasses: 7,
        },
        [d(-27)]: {
          mood: 'Creative',
          stageAtLog: 'OVULATION STAGE',
          symptoms: [],
          habits: ['Hydrated', 'Moved My Body'],
          notes: 'Group presentation went really well!',
          waterGlasses: 8,
        },
        [d(-20)]: {
          mood: 'Anxious',
          stageAtLog: 'LUTEAL STAGE',
          symptoms: ['Bloating', 'Acne / Breakout'],
          habits: ['Hydrated'],
          notes: 'Pre-exam stress + luteal dip.',
          waterGlasses: 5,
        },
        [d(-16)]: {
          mood: 'Irritable',
          stageAtLog: 'LUTEAL STAGE',
          symptoms: ['Breast Tenderness', 'Bloating'],
          habits: ['Slept 7+ Hours'],
          notes: 'Needed quiet dorm time.',
          waterGlasses: 6,
        },
        [d(-12)]: {
          mood: 'Fatigued',
          stageAtLog: 'MENSTRUATION STAGE',
          symptoms: ['Mild Cramps', 'Bloating'],
          habits: ['Slept 7+ Hours', 'Hydrated'],
          notes: 'First week of lectures, rested in dorm.',
          waterGlasses: 6,
        },
        [d(-6)]: {
          mood: 'Focused',
          stageAtLog: 'FOLLICULAR STAGE',
          symptoms: [],
          habits: ['Slept 7+ Hours', 'Hydrated'],
          notes: 'Productive study block in campus library.',
          waterGlasses: 8,
        },
        [d(-5)]: {
          mood: 'Calm',
          stageAtLog: 'FOLLICULAR STAGE',
          symptoms: [],
          habits: ['Hydrated'],
          notes: 'Afternoon lectures and smoothies.',
          waterGlasses: 7,
        },
        [d(-4)]: {
          mood: 'Creative',
          stageAtLog: 'FOLLICULAR STAGE',
          symptoms: [],
          habits: ['Slept 7+ Hours', 'Hydrated'],
          notes: 'Met study group on campus.',
          waterGlasses: 8,
        },
        [d(-3)]: {
          mood: 'Calm',
          stageAtLog: 'FOLLICULAR STAGE',
          symptoms: ['Headache'],
          habits: ['Hydrated'],
          notes: 'Long study session in library.',
          waterGlasses: 6,
        },
        [d(-2)]: {
          mood: 'Energized',
          stageAtLog: 'OVULATION STAGE',
          symptoms: [],
          habits: ['Slept 7+ Hours', 'Hydrated', 'Moved My Body'],
          notes: 'Morning walk and lab prep.',
          waterGlasses: 8,
        },
        [d(-1)]: {
          mood: 'Creative',
          stageAtLog: 'OVULATION STAGE',
          symptoms: [],
          habits: ['Hydrated'],
          notes: 'Hydrated well during classes.',
          waterGlasses: 7,
        },
        [d(0)]: {
          mood: 'Energized',
          stageAtLog: 'OVULATION STAGE',
          symptoms: [],
          habits: ['Slept 7+ Hours', 'Hydrated', 'Moved My Body'],
          notes: 'Feeling sharp and focused for class today!',
          waterGlasses: 7,
        },
      },
      journalEntries: [
        {
          id: 'j-sample-1',
          dateStr: d(-16),
          stageKey: 'LUTEAL',
          cycleDay: 24,
          promptQuestion:
            'What was your biggest win during your Luteal phase, even as your energy naturally turns inward?',
          reflectionText:
            'Finishing my Biochemistry lab draft two days early so I could rest in my dorm without guilt when pre-period fatigue hit.',
          moodAtReflection: 'Irritable',
          updatedAt: new Date(Date.now() - 16 * 86400000).toISOString(),
        },
        {
          id: 'j-sample-2',
          dateStr: d(-5),
          stageKey: 'FOLLICULAR',
          cycleDay: 9,
          promptQuestion:
            'As your energy and estrogen rise in your Follicular phase, what new academic goal or creative project are you most excited to start?',
          reflectionText:
            'Mapping out my study group schedule and starting my consistent hydration & Sidratu glow skincare routine!',
          moodAtReflection: 'Calm',
          updatedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
      ],
    };
  };


  const loadSampleStudentData = () => {
    updateUserData((prev) => buildSampleStudentDataOnObject(prev));
    setSelectedDateStr(formatDateISO(new Date()));
    showToast(
      '✨ Loaded sample college cycle history, moods, and emergency pill timestamp!',
      'success'
    );
  };

  const completeGoogleAccountSignIn = async (
    rawEmail: string,
    rawName?: string,
    rawAge?: string,
    rawPhone?: string
  ) => {
    const cleanRaw = rawEmail.trim().toLowerCase();
    if (!cleanRaw) {
      showToast('Please enter your Google / Gmail address to continue.', 'warning');
      return;
    }
    const gEmail = cleanRaw.includes('@')
      ? cleanRaw
      : `${cleanRaw.replace(/\s+/g, '')}@gmail.com`;

    let cloudDoc: UserData | null = null;
    try {
      cloudDoc = await fetchSingleUserFromFirestore(gEmail);
    } catch {
      // Offline fallback
    }

    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    if (cloudDoc) {
      users[gEmail] = mergeUsersMaps(
        { [gEmail]: users[gEmail] || cloudDoc },
        { [gEmail]: cloudDoc }
      )[gEmail];
    }

    const existing = users[gEmail];
    const nowMs = Date.now();
    const nowIso = new Date().toISOString();
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const firstEntryMs =
      existing && Number(existing.firstEntryAt || existing.createdAt) > 0
        ? Number(existing.firstEntryAt || existing.createdAt)
        : nowMs;

    const googleDisplayName =
      (rawName || '').trim() ||
      authName.trim() ||
      existing?.name ||
      gEmail.split('@')[0];
    const googleAge = (rawAge || '').trim() || authAge.trim() || existing?.age || '21';
    const googlePhone =
      (rawPhone || '').trim() ||
      authPhone.trim() ||
      resolveCustomerPhoneUsed(existing) ||
      '';

    const baseUser =
      existing ||
      createDefaultUserObject(googleDisplayName, gEmail, '', googleAge, googlePhone);

    baseUser.name = googleDisplayName;
    baseUser.age = googleAge;
    baseUser.email = gEmail;
    baseUser.phone = googlePhone;
    baseUser.password = existing?.password || authPassword.trim() || '';
    baseUser.firstEntryAt = firstEntryMs;
    baseUser.createdAt = firstEntryMs;
    baseUser.deviceInfo = getClientDeviceLabel();
    baseUser.subscriptionStatus = existing?.subscriptionStatus || 'active';
    baseUser.subscriptionUntil = existing?.subscriptionUntil || nowMs + twoWeeksMs;
    baseUser.paymentMethod = existing?.paymentMethod || '2-Week Free Access';
    baseUser.lastUpdatedAt = nowIso;
    baseUser.lastSignInAt = nowIso;
    baseUser.signInCount = existing ? (existing.signInCount || 1) + 1 : 1;
    baseUser.signupSource = existing ? 'Sign In' : 'Create Account';

    users[gEmail] = baseUser;
    const numbered = assignSequentialCustomerNumbers(users);
    const savedUser = numbered[gEmail];
    saveAllUsers(numbered, gEmail, true);
    setAllUsersMap({ ...numbered });
    setShowGoogleAccountModal(false);
    loginUserSession(gEmail, numbered);

    showToast(
      `🌸 Signed in with Google as ${baseUser.name} (${gEmail})! Synced to Cloud (Entry #${
        savedUser?.customerNumber || 1
      }).`,
      'success'
    );

    triggerOwnerEmailAndServerAlert({
      userName: savedUser.name,
      userEmail: savedUser.email,
      userPhone: resolveCustomerPhoneUsed(savedUser) || 'Not entered',
      userAge: savedUser.age || '21',
      deviceInfo: savedUser.deviceInfo,
      subject: `${existing ? '🔑 Google User Logged In' : '🆕 New Google Sign-Up'} (#${savedUser.customerNumber || 1}): ${savedUser.name} (${savedUser.email})`,
      message:
        `Customer Entry #${savedUser.customerNumber || 1} signed in via Google!\n` +
        `• Name: ${savedUser.name}\n` +
        `• Email: ${savedUser.email}\n` +
        `• Age: ${savedUser.age || '21'}\n` +
        `• Phone Number Used: ${resolveCustomerPhoneUsed(savedUser) || 'Not entered'}\n` +
        `• Device: ${savedUser.deviceInfo}\n` +
        `• Time: ${new Date(nowMs).toLocaleString()}`,
      type: existing ? 'login' : 'signup',
      openMailClient: false,
    });

    void logCustomerEntryToFirestore(
      savedUser,
      existing ? 'Sign In' : 'Create Account'
    ).catch(() => {});
  };

  const handleUserGoogleSignIn = async () => {
    setAuthFieldError(null);
    const formEmail = (authEmail || authEmailInputRef.current?.value || '').trim().toLowerCase();
    const formName = (authName || authNameInputRef.current?.value || '').trim();
    const formAge = (authAge || authAgeInputRef.current?.value || '').trim();
    const formPhone = (authPhone || authPhoneInputRef.current?.value || '').trim();

    setIsGoogleSigningIn(true);
    try {
      const googleUser = await signInWithGooglePopup();
      const gEmail = (googleUser.email || '').trim().toLowerCase();
      setIsGoogleSigningIn(false);
      if (gEmail) {
        await completeGoogleAccountSignIn(
          gEmail,
          formName || googleUser.displayName || '',
          formAge || '21',
          formPhone || googleUser.phoneNumber || ''
        );
        return;
      }
    } catch {
      setIsGoogleSigningIn(false);
      // If browser/iframe blocks OAuth popup, seamlessly fallback:
      // 1) If user already typed an email in the form, complete Google sign-in immediately!
      if (formEmail && formEmail.length >= 3) {
        await completeGoogleAccountSignIn(
          formEmail,
          formName,
          formAge || '21',
          formPhone
        );
        return;
      }
      // 2) Otherwise open the instant in-app Google Account Chooser modal so it never fails!
      setGoogleModalEmail(formEmail);
      setGoogleModalName(formName);
      setGoogleModalAge(formAge || '21');
      setGoogleModalPhone(formPhone);
      setShowGoogleAccountModal(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    signOutFirebase().catch(() => {});
    setCurrentUserEmail(null);
    setUserData(null);
    setAuthEmail('');
    setAuthName('');
    setAuthAge('');
    setAuthPhone('');
    setAuthPassword('');
    setGoogleModalEmail('');
    setGoogleModalName('');
    setGoogleModalPhone('');
    showToast('You have been logged out safely.', 'info');
  };

  // =========================================================================
  // 2. PERIOD TRACKER HANDLERS (ACCURATE PAST/PRESENT START & END DATE LOGIC)
  // =========================================================================
  const savePeriodDatesFromInputs = (replaceAllHistory = false) => {
    if (!userData) return;
    const startDate = periodStartInput.trim();
    const endDate = periodEndInput.trim() ? periodEndInput.trim() : null;

    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      showToast('Please select a valid Period Start Date (First Day of Bleeding).', 'warning');
      return;
    }
    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      showToast('Please select a valid Period End Date.', 'warning');
      return;
    }
    if (endDate && endDate < startDate) {
      showToast('Period End Date cannot be earlier than the Period Start Date.', 'warning');
      return;
    }
    if (endDate && diffDays(startDate, endDate) > 19) {
      showToast(
        'Period duration looks longer than 20 days—double check your Start & End dates.',
        'warning'
      );
      return;
    }

    updateUserData((prev) => {
      if (replaceAllHistory) {
        return {
          ...prev,
          periods: [{ startDate, endDate }],
        };
      }

      let periods = Array.isArray(prev.periods) ? [...prev.periods] : [];

      if (editingPeriodStartKey) {
        const editIdx = periods.findIndex((p) => p.startDate === editingPeriodStartKey);
        if (editIdx >= 0) {
          periods[editIdx] = { startDate, endDate };
        } else {
          periods.push({ startDate, endDate });
        }
      } else {
        // Remove any conflicting period within 14 days OR any period with a later date so the
        // newly entered past/current period becomes the authoritative active cycle calculation anchor
        periods = periods.filter(
          (p) =>
            p.startDate < startDate &&
            Math.abs(diffDays(p.startDate, startDate)) >= 15
        );
        periods.push({ startDate, endDate });
      }
      return { ...prev, periods };
    });

    setEditingPeriodStartKey(null);
    // Keep the exact entered Start & End Dates in the inputs & persistent LMP memory — never reset to Today's Date!
    setPeriodStartInput(startDate);
    setPeriodEndInput(endDate || '');
    try {
      localStorage.setItem(
        STORAGE_LMP_MEMORY_KEY,
        JSON.stringify({
          email: currentUserEmail,
          startDate,
          endDate: endDate || null,
          customCycleLength: userData.customCycleLength || 28,
        })
      );
    } catch {
      // ignore storage errors
    }

    // Jump the calendar view to the month of the entered period so the user sees their cycle & fertile window
    const parsedStart = parseDateISO(startDate);
    setCalendarMonth(parsedStart.getMonth());
    setCalendarYear(parsedStart.getFullYear());

    if (endDate) {
      const dur = diffDays(startDate, endDate) + 1;
      showToast(
        `🩸 Memorized LMP: ${formatHumanDate(startDate)} to ${formatHumanDate(endDate)} (${dur} days)! Saved permanently—next cycle, fertile window & ovulation auto-calculated.`,
        'success'
      );
    } else {
      showToast(
        `🩸 Memorized LMP Start (${formatHumanDate(startDate)})! Saved permanently—next cycle, fertile window & ovulation auto-calculated.`,
        'success'
      );
    }
  };

  const handleCustomCycleLengthChange = (newLen: number) => {
    const clamped = Math.max(21, Math.min(45, Math.round(newLen || 28)));
    updateUserData((prev) => ({
      ...prev,
      customCycleLength: clamped,
    }));
    showToast(`🔄 Cycle length set to ${clamped} days. Fertile window, ovulation & next period recalculated!`, 'info');
  };

  const clearAllPeriodHistory = () => {
    updateUserData((prev) => ({
      ...prev,
      periods: [],
    }));
    try {
      localStorage.removeItem(STORAGE_LMP_MEMORY_KEY);
    } catch {
      // ignore
    }
    setEditingPeriodStartKey(null);
    setPeriodStartInput('');
    setPeriodEndInput('');
    showToast('🧹 Cleared period memory. Enter your Period Start & End Dates to calculate your cycle.', 'info');
  };

  const editPeriodRecord = (startDateStr: string) => {
    if (!userData) return;
    const record = (userData.periods || []).find((p) => p.startDate === startDateStr);
    if (!record) return;
    setEditingPeriodStartKey(record.startDate);
    setPeriodStartInput(record.startDate);
    setPeriodEndInput(record.endDate || '');
    showToast(
      `Loaded period (${formatHumanDate(record.startDate)}) into the Period Tracker at the top.`,
      'info'
    );
  };

  const cancelPeriodEdit = () => {
    setEditingPeriodStartKey(null);
    const sorted = getSortedPeriods(userData?.periods);
    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    setPeriodStartInput(latest ? latest.startDate : '');
    setPeriodEndInput(latest && latest.endDate ? latest.endDate : '');
  };

  const deletePeriodRecord = (startDateStr: string) => {
    updateUserData((prev) => ({
      ...prev,
      periods: (prev.periods || []).filter((p) => p.startDate !== startDateStr),
    }));
    if (editingPeriodStartKey === startDateStr) {
      setEditingPeriodStartKey(null);
    }
    showToast('Period record deleted and cycle predictions updated.', 'info');
  };

  // =========================================================================
  // 3. EMERGENCY CONTRACEPTION HANDLERS
  // =========================================================================
  const logEmergencyPillFromPicker = () => {
    const chosen = customPillDateTime ? new Date(customPillDateTime) : new Date();
    if (isNaN(chosen.getTime())) {
      showToast('Please select a valid date and time.', 'warning');
      return;
    }

    updateUserData((prev) => ({
      ...prev,
      emergencyPills: [
        {
          timestamp: chosen.toISOString(),
          dateStr: formatDateISO(chosen),
        },
        ...(prev.emergencyPills || []),
      ],
    }));
    setCustomPillDateTime(formatDateTimeLocalISO(new Date()));
    showToast(
      '💊 Emergency Pill timestamp saved! Tap the 💊 Pill Icon anytime to view body & cycle advice.',
      'success'
    );
  };

  const removeEmergencyPillLog = (idx: number) => {
    updateUserData((prev) => ({
      ...prev,
      emergencyPills: (prev.emergencyPills || []).filter((_, i) => i !== idx),
    }));
  };

  // =========================================================================
  // 4. MOOD, SYMPTOMS, HABITS, HYDRATION & NOTES HANDLERS
  // =========================================================================
  const getDailyLog = (dateStr: string): DailyLogEntry => {
    return (
      userData?.dailyLogs[dateStr] || {
        mood: null,
        stageAtLog: null,
        symptoms: [],
        symptomDurations: {},
        intensity: {},
        habits: [],
        notes: '',
        waterGlasses: 0,
      }
    );
  };

  const selectMoodForDate = (moodId: string) => {
    if (!userData) return;
    const m = calculateCycleMetrics(userData, selectedDateStr);
    const stageInfo = PHASE_ADVISOR_DATA[m.stageKey];

    updateUserData((prev) => {
      const existing = prev.dailyLogs[selectedDateStr] || {
        mood: null,
        stageAtLog: null,
        symptoms: [],
        symptomDurations: {},
        intensity: {},
        habits: [],
        notes: '',
      };
      return {
        ...prev,
        dailyLogs: {
          ...prev.dailyLogs,
          [selectedDateStr]: {
            ...existing,
            mood: moodId,
            stageAtLog: stageInfo.name,
          },
        },
      };
    });
    showToast(`Logged "${moodId}" linked to your ${stageInfo.shortName}!`, 'success');
  };

  const toggleSymptom = (symptomId: string, defaultHours = 2, defaultIntensity = 3) => {
    if (!userData) return;
    const currentLog = getDailyLog(selectedDateStr);
    const exists = currentLog.symptoms.includes(symptomId);
    const updatedSymptoms = exists
      ? currentLog.symptoms.filter((s) => s !== symptomId)
      : [...currentLog.symptoms, symptomId];

    const nextDurations: Record<string, number> = {
      ...(currentLog.symptomDurations || {}),
    };
    const nextIntensity: Record<string, number> = {
      ...(currentLog.intensity || {}),
    };
    if (exists) {
      delete nextDurations[symptomId];
      delete nextIntensity[symptomId];
    } else {
      if (nextDurations[symptomId] === undefined) {
        nextDurations[symptomId] = defaultHours;
      }
      if (nextIntensity[symptomId] === undefined) {
        nextIntensity[symptomId] = symptomId === 'Severe Pain' ? 5 : defaultIntensity;
      }
    }

    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [selectedDateStr]: {
          ...currentLog,
          symptoms: updatedSymptoms,
          symptomDurations: nextDurations,
          intensity: nextIntensity,
        },
      },
    }));

    if (symptomId === 'Severe Pain' && !exists) {
      showToast(
        '🏥 Severe pain logged. Please check the Campus Clinic banner at the top of your screen.',
        'warning'
      );
    }
  };

  const setSymptomDurationHours = (
    symptomId: string,
    rawHours: number,
    showToastFeedback = false
  ) => {
    if (!userData) return;
    const clamped = Math.max(0.5, Math.min(24, Math.round((Number(rawHours) || 1) * 2) / 2));
    const currentLog = getDailyLog(selectedDateStr);
    const updatedSymptoms = currentLog.symptoms.includes(symptomId)
      ? currentLog.symptoms
      : [...currentLog.symptoms, symptomId];
    const nextDurations: Record<string, number> = {
      ...(currentLog.symptomDurations || {}),
      [symptomId]: clamped,
    };
    const nextIntensity: Record<string, number> = {
      ...(currentLog.intensity || {}),
      [symptomId]: currentLog.intensity?.[symptomId] ?? (symptomId === 'Severe Pain' ? 5 : 3),
    };

    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [selectedDateStr]: {
          ...currentLog,
          symptoms: updatedSymptoms,
          symptomDurations: nextDurations,
          intensity: nextIntensity,
        },
      },
    }));

    if (showToastFeedback) {
      showToast(
        `⏱️ Logged "${symptomId}" duration: ${clamped} hr${clamped === 1 ? '' : 's'} on ${formatShortMonthDay(
          selectedDateStr
        )}!`,
        'info'
      );
    }
  };

  const setSymptomIntensity = (
    symptomId: string,
    rawIntensity: number,
    showToastFeedback = false
  ) => {
    if (!userData) return;
    const clamped = Math.max(1, Math.min(5, Math.round(Number(rawIntensity) || 3)));
    const currentLog = getDailyLog(selectedDateStr);
    const updatedSymptoms = currentLog.symptoms.includes(symptomId)
      ? currentLog.symptoms
      : [...currentLog.symptoms, symptomId];
    const nextDurations: Record<string, number> = {
      ...(currentLog.symptomDurations || {}),
      [symptomId]: currentLog.symptomDurations?.[symptomId] ?? 2,
    };
    const nextIntensity: Record<string, number> = {
      ...(currentLog.intensity || {}),
      [symptomId]: clamped,
    };

    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [selectedDateStr]: {
          ...currentLog,
          symptoms: updatedSymptoms,
          symptomDurations: nextDurations,
          intensity: nextIntensity,
        },
      },
    }));

    if (showToastFeedback) {
      const severityLabels: Record<number, string> = {
        1: 'Very Mild',
        2: 'Mild',
        3: 'Moderate',
        4: 'Strong',
        5: 'Severe',
      };
      showToast(
        `📊 Rated "${symptomId}" severity: ${clamped}/5 (${severityLabels[clamped] || 'Moderate'}) on ${formatShortMonthDay(
          selectedDateStr
        )}!`,
        clamped >= 5 ? 'warning' : 'info'
      );
    }
  };

  const toggleHabit = (habitId: string) => {
    if (!userData) return;
    const currentLog = getDailyLog(selectedDateStr);
    const exists = currentLog.habits.includes(habitId);
    const updatedHabits = exists
      ? currentLog.habits.filter((h) => h !== habitId)
      : [...currentLog.habits, habitId];

    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [selectedDateStr]: {
          ...currentLog,
          habits: updatedHabits,
        },
      },
    }));
  };

  const setWaterGlassesForDate = (dateStr: string, targetGlasses: number) => {
    if (!userData) return;
    const currentLog = getDailyLog(dateStr);
    const nextGlasses = Math.max(0, Math.min(16, targetGlasses));
    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [dateStr]: {
          ...currentLog,
          waterGlasses: nextGlasses,
          habits:
            nextGlasses >= 6 && !currentLog.habits.includes('Hydrated')
              ? [...currentLog.habits, 'Hydrated']
              : currentLog.habits,
        },
      },
    }));
  };

  const updateWaterGlasses = (delta: number) => {
    if (!userData) return;
    const currentLog = getDailyLog(selectedDateStr);
    setWaterGlassesForDate(selectedDateStr, (currentLog.waterGlasses || 0) + delta);
  };

  const saveDailyNotes = () => {
    if (!userData) return;
    const currentLog = getDailyLog(selectedDateStr);
    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [selectedDateStr]: {
          ...currentLog,
          notes: dailyNotesInput.trim(),
        },
      },
    }));
    showToast(`Saved daily notes for ${formatHumanDate(selectedDateStr)}!`, 'success');
  };

  const toggleSnackForDate = (dateStr: string, snackId: string, snackName: string) => {
    if (!userData) return;
    const currentLog = getDailyLog(dateStr);
    const existingSnacks = currentLog.loggedSnacks || [];
    const exists = existingSnacks.includes(snackId);
    const updatedSnacks = exists
      ? existingSnacks.filter((id) => id !== snackId)
      : [...existingSnacks, snackId];

    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [dateStr]: {
          ...currentLog,
          loggedSnacks: updatedSnacks,
        },
      },
    }));

    if (!exists) {
      showToast(`🥗 Logged nutrient snack: "${snackName}" for ${formatShortMonthDay(dateStr)}!`, 'success');
    } else {
      showToast(`Removed "${snackName}" from ${formatShortMonthDay(dateStr)}.`, 'info');
    }
  };

  const selectCravingForDate = (dateStr: string, cravingLabel: string) => {
    if (!userData) return;
    const currentLog = getDailyLog(dateStr);
    const nextCraving = currentLog.cravingLogged === cravingLabel ? null : cravingLabel;

    updateUserData((prev) => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [dateStr]: {
          ...currentLog,
          cravingLogged: nextCraving,
        },
      },
    }));

    if (nextCraving) {
      showToast(`🍫 Craving "${cravingLabel}" decoded & saved for ${formatShortMonthDay(dateStr)}!`, 'info');
    }
  };

  // =========================================================================
  // 5. 30-DAY SUBSCRIPTION, ORANGE MONEY VERIFICATION & FREE PASSWORD HANDLERS
  // =========================================================================
  const processOrangeMoneySubmission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData) return;

    const senderPhone = orangePhoneInput.trim() || userData.phone || '';
    const txId = orangeTxIdInput.trim();
    if (!senderPhone || !txId) {
      showToast(
        'Please enter both your Orange Money sender number and SMS Transaction ID.',
        'warning'
      );
      return;
    }

    const paymentDetailSummary = `🟧 Orange Money (To 073604401) | Sender Phone: ${senderPhone} | SMS Ref/ID: ${txId}`;
    const nowIso = new Date().toISOString();

    updateUserData((prev) => ({
      ...prev,
      phone: senderPhone,
      usedFreeAccessPassword: false,
      subscriptionStatus: 'pending_verification',
      subscriptionUntil: null,
      paymentMethod: 'Orange Money (Pending Verification)',
      pendingPayment: {
        id: `pay-${Date.now()}`,
        senderPhone,
        transactionId: txId,
        amount: 'Le 30',
        method: 'Orange Money',
        submittedAt: nowIso,
        status: 'pending',
      },
      paymentHistory: [
        {
          date: nowIso,
          amount: 'Le 30',
          details: paymentDetailSummary,
          status: 'pending',
          senderPhone,
          transactionId: txId,
        },
        ...(prev.paymentHistory || []),
      ],
    }));

    const emailSubject = `🟧 Orange Money Payment Verification Request — ${userData.name}`;
    const emailBody =
      `Hello ${CREATOR_NAME} (${OWNER_ADMIN_EMAIL}),\n\n` +
      `A user has submitted an Orange Money payment of Le 30 for a 30-day subscription pass:\n\n` +
      `• User Name: ${userData.name}\n` +
      `• User Email: ${userData.email}\n` +
      `• Orange Money Sender Number: ${senderPhone}\n` +
      `• SMS Transaction ID: ${txId}\n` +
      `• Submitted At: ${new Date().toLocaleString()}\n\n` +
      `Please log into the Owner Admin Dashboard to review and click Approve (+30 Days) or Reject.`;

    triggerOwnerEmailAndServerAlert({
      userName: userData.name,
      userEmail: userData.email,
      userPhone: senderPhone,
      subject: emailSubject,
      message: emailBody,
      type: 'payment',
      openMailClient: true,
    });

    setLatestPaymentReceiptMessage(emailBody);
    setPaymentReceiptText(
      `Your Orange Money payment (Sender: ${senderPhone}, Tx ID: ${txId}) has been submitted and is Pending Owner Verification.`
    );
    setIsPaywallPreview(false);
    setShowPaywallModal(true);
    showToast(
      '⏳ Orange Money payment submitted! Showing Pending Approval screen & triggered email alert to owner.',
      'info'
    );
  };

  const handleRemovePendingVerification = (targetEmail?: string) => {
    const emailKey = (targetEmail || currentUserEmail || '').toLowerCase().trim();
    if (!emailKey) {
      setShowPaywallModal(false);
      return;
    }
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const users = mergeUsersMaps(getAllUsers(), allUsersMap);
    const target = users[emailKey] || (emailKey === currentUserEmail ? userData : null);
    if (!target) {
      setShowPaywallModal(false);
      return;
    }

    const firstMs = Number(target.firstEntryAt || target.createdAt) || Date.now();
    const restoredUntil =
      target.subscriptionUntil && target.subscriptionUntil > Date.now()
        ? target.subscriptionUntil
        : firstMs + twoWeeksMs > Date.now()
        ? firstMs + twoWeeksMs
        : Date.now() + twoWeeksMs;

    const updatedUser: UserData = {
      ...target,
      subscriptionStatus: 'active',
      subscriptionUntil: restoredUntil,
      paymentMethod: '2-Week Free Access',
      pendingPayment: null,
      lastUpdatedAt: new Date().toISOString(),
    };

    users[emailKey] = updatedUser;
    saveAllUsers(users, emailKey, true);
    setAllUsersMap({ ...users });
    if (currentUserEmail && currentUserEmail.toLowerCase().trim() === emailKey) {
      setUserData(updatedUser);
      setShowPaywallModal(false);
    }
    showToast('Removed Pending Owner Verification and restored active access.', 'info');
  };

  const applyVipCodeFromModal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSecretVipPassword(vipSecretCodeInput, adminConfig.freeAccessPassword)) {
      const nextExp = Date.now() + 30 * 24 * 60 * 60 * 1000;
      updateUserData((prev) => ({
        ...prev,
        isVip: true,
        usedFreeAccessPassword: true,
        subscriptionStatus: 'free_password',
        subscriptionUntil: nextExp,
        paymentMethod: `Free 30-Day Access Password (${adminConfig.freeAccessPassword})`,
      }));
      setVipSecretCodeInput('');
      setShowPaywallModal(false);
      showToast(
        '🔑 Free 30-Day Access Password Verified! App unlocked for 30 days (locks again after 30 days).',
        'success'
      );
    } else {
      showToast(
        'Invalid Free Access Password. Please enter the valid 30-day password or submit Orange Money.',
        'warning'
      );
    }
  };

  const handleSupportInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subj = supportSubjectInput.trim() || 'Student Support / Subscription Inquiry';
    const msg = supportMessageInput.trim();
    if (!msg) {
      showToast('Please write your message before sending.', 'warning');
      return;
    }

    const senderName = userData?.name || authName.trim() || 'BloomCampus User';
    const senderEmail = userData?.email || authEmail.trim() || 'student@campus.edu';
    const senderPhone = supportPhoneInput.trim() || userData?.phone || authPhone.trim() || '';

    const fullBody =
      `Hello ${CREATOR_NAME} (${OWNER_ADMIN_EMAIL}),\n\n` +
      `New Support Inquiry from BloomCampus:\n` +
      `• Name: ${senderName}\n` +
      `• Email: ${senderEmail}\n` +
      `• Phone: ${senderPhone || 'Not provided'}\n` +
      `• Subject: ${subj}\n\n` +
      `Message:\n${msg}`;

    triggerOwnerEmailAndServerAlert({
      userName: senderName,
      userEmail: senderEmail,
      userPhone: senderPhone,
      subject: `💬 BloomCampus Inquiry: ${subj}`,
      message: fullBody,
      type: 'support',
      openMailClient: true,
    });

    setSupportSubjectInput('');
    setSupportMessageInput('');
    setShowAboutContactModal(false);
    showToast(
      `📩 Support inquiry sent & email notification triggered to ${OWNER_ADMIN_EMAIL}!`,
      'success'
    );
  };

  // =========================================================================
  // RENDER OWNER ADMIN DASHBOARD IF IN ADMIN VIEW
  // =========================================================================
  if (isAdminView) {
    return (
      <>
        <OfflineIndicator />
        {/* Toast Container */}
        <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-lg border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
                t.type === 'success'
                  ? 'bg-sage-800 text-white border-sage-600'
                  : t.type === 'warning'
                  ? 'bg-peach-700 text-white border-peach-500'
                  : 'bg-lavender-900 text-white border-lavender-500'
              }`}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="opacity-80 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <OwnerAdminDashboard
          usersMap={allUsersMap}
          adminConfig={adminConfig}
          supportInquiries={supportInquiries}
          onUpdateAdminConfig={handleUpdateAdminConfig}
          onApproveUserPayment={handleApproveUserPayment}
          onExtendUserFreeAccess={handleExtendUserFreeAccess}
          onRejectOrExpireUser={handleRejectOrExpireUser}
          onClearPendingVerification={handleRemovePendingVerification}
          onRegisterNewUserByAdmin={handleRegisterNewUserByAdmin}
          onDeleteUser={handleDeleteUserByAdmin}
          onRefreshUsers={syncLatestUsersFromEverywhere}
          onExitAdmin={() => {
            setIsAdminView(false);
            localStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
            if (!userData || !currentUserEmail) {
              const savedEmail = localStorage.getItem(STORAGE_SESSION_KEY);
              const merged = mergeUsersMaps(getAllUsers(), allUsersMap);
              if (savedEmail && merged[savedEmail]) {
                loginUserSession(savedEmail, merged);
                showToast(`🌸 Switched to User Phase (${merged[savedEmail].name})!`, 'info');
                return;
              }
              showToast('🌸 Exited Admin Area.', 'info');
              return;
            }
            showToast('🌸 Switched to User Phase.', 'info');
          }}
          showToast={showToast}
        />
      </>
    );
  }

  // =========================================================================
  // RENDER AUTHENTICATION SCREEN IF NOT LOGGED IN
  // =========================================================================
  if (!userData || !currentUserEmail) {
    return (
      <div className="min-h-screen flex flex-col selection:bg-lavender-200 selection:text-lavender-900">
        <OfflineIndicator />
        {/* Toast Container */}
        <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-lg border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
                t.type === 'success'
                  ? 'bg-sage-800 text-white border-sage-600'
                  : t.type === 'warning'
                  ? 'bg-peach-700 text-white border-peach-500'
                  : 'bg-lavender-900 text-white border-lavender-500'
              }`}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="opacity-80 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-lavender-100 via-cream to-peach-100">
          <div className="w-full max-w-md bg-white/95 backdrop-blur-md rounded-3xl shadow-xl border border-lavender-200 p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-lavender-500 to-rose-500 text-white text-3xl shadow-md mb-3">
                🌸
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-800 tracking-tight">
                BloomCampus
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                College Period, Cycle Stage, Study &amp; Sidratu Skincare Companion
              </p>
              <div className="mt-2.5 flex items-center justify-center gap-2 text-xs font-semibold text-sage-800">
                <span>🎁 2 Weeks (14 Days) Free Access</span>
                <span aria-hidden="true">·</span>
                <span>🌸 Instant Sign In &amp; Cycle Tracking</span>
              </div>
            </div>

            {/* Auth Mode Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-lavender-50 rounded-2xl mb-5 border border-lavender-100">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthFieldError(null);
                }}
                className={`py-2.5 rounded-xl font-bold text-sm transition-all ${
                  authMode === 'signup'
                    ? 'bg-white text-lavender-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setAuthFieldError(null);
                }}
                className={`py-2.5 rounded-xl font-bold text-sm transition-all ${
                  authMode === 'signin'
                    ? 'bg-white text-lavender-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
            </div>

            {authFieldError && (
              <div
                role="alert"
                className="mb-4 px-3.5 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center justify-between gap-2"
              >
                <span>⚠️ {authFieldError.message}</span>
                <button
                  type="button"
                  onClick={() => setAuthFieldError(null)}
                  className="text-rose-600 hover:text-rose-900 font-bold"
                  aria-label="Dismiss validation notice"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Auth Form — Create Account vs Streamlined Sign In */}
            <form onSubmit={handleAuthSubmit} noValidate className="space-y-3.5">
              {authMode === 'signup' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="authName"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                      >
                        Your Name *
                      </label>
                      <input
                        ref={authNameInputRef}
                        type="text"
                        id="authName"
                        name="name"
                        autoComplete="name"
                        required
                        value={authName}
                        onChange={(e) => {
                          setAuthName(e.target.value);
                          if (authFieldError?.fieldId === 'authName') setAuthFieldError(null);
                        }}
                        placeholder="e.g., Kumba Hannah Kaingbanja"
                        className={`w-full px-4 py-3 rounded-2xl border outline-none text-slate-800 font-medium text-sm ${
                          authFieldError?.fieldId === 'authName'
                            ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                            : 'border-slate-200 focus:border-lavender-500 focus:ring-4 focus:ring-lavender-100'
                        }`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="authAge"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                      >
                        Age *
                      </label>
                      <input
                        ref={authAgeInputRef}
                        type="number"
                        id="authAge"
                        name="age"
                        min="10"
                        max="99"
                        required
                        value={authAge}
                        onChange={(e) => {
                          setAuthAge(e.target.value);
                          if (authFieldError?.fieldId === 'authAge') setAuthFieldError(null);
                        }}
                        placeholder="21"
                        className={`w-full px-4 py-3 rounded-2xl border outline-none text-slate-800 font-medium text-sm ${
                          authFieldError?.fieldId === 'authAge'
                            ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                            : 'border-slate-200 focus:border-lavender-500 focus:ring-4 focus:ring-lavender-100'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="authEmail"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                      >
                        Email Address *
                      </label>
                      <input
                        ref={authEmailInputRef}
                        type="email"
                        id="authEmail"
                        name="email"
                        autoComplete="email"
                        required
                        value={authEmail}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAuthEmail(val);
                          if (authFieldError?.fieldId === 'authEmail') setAuthFieldError(null);
                        }}
                        placeholder="you@gmail.com"
                        className={`w-full px-4 py-3 rounded-2xl border outline-none text-slate-800 font-medium text-sm ${
                          authFieldError?.fieldId === 'authEmail'
                            ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                            : 'border-slate-200 focus:border-lavender-500 focus:ring-4 focus:ring-lavender-100'
                        }`}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="authPhone"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                      >
                        Phone Number Used *
                      </label>
                      <input
                        ref={authPhoneInputRef}
                        type="tel"
                        id="authPhone"
                        name="tel"
                        autoComplete="tel"
                        required
                        value={authPhone}
                        onChange={(e) => {
                          setAuthPhone(e.target.value);
                          if (authFieldError?.fieldId === 'authPhone') setAuthFieldError(null);
                        }}
                        placeholder="e.g., 076 123 456"
                        className={`w-full px-4 py-3 rounded-2xl border outline-none text-slate-800 font-medium text-sm ${
                          authFieldError?.fieldId === 'authPhone'
                            ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                            : 'border-slate-200 focus:border-lavender-500 focus:ring-4 focus:ring-lavender-100'
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="authPassword"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-600"
                      >
                        Create Account Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="text-[11px] font-bold text-lavender-700 hover:text-lavender-900 cursor-pointer"
                      >
                        {showPassword ? '🙈 Hide Password' : '👁️ Show Password'}
                      </button>
                    </div>
                    <input
                      ref={authPasswordInputRef}
                      type={showPassword ? 'text' : 'password'}
                      id="authPassword"
                      name="password"
                      autoComplete="new-password"
                      required
                      value={authPassword}
                      onChange={(e) => {
                        setAuthPassword(e.target.value);
                        if (authFieldError?.fieldId === 'authPassword') setAuthFieldError(null);
                      }}
                      placeholder="Create a password you will use to Sign In"
                      className={`w-full px-4 py-3 rounded-2xl border outline-none text-slate-800 font-medium text-sm ${
                        authFieldError?.fieldId === 'authPassword'
                          ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                          : 'border-slate-200 focus:border-lavender-500 focus:ring-4 focus:ring-lavender-100'
                      }`}
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="authEmail"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                    >
                      Registered Email Address or Phone Number *
                    </label>
                    <input
                      ref={authEmailInputRef}
                      type="text"
                      id="authEmail"
                      name="email"
                      autoComplete="username"
                      required
                      value={authEmail}
                      onChange={(e) => {
                        setAuthEmail(e.target.value);
                        if (authFieldError?.fieldId === 'authEmail') setAuthFieldError(null);
                      }}
                      placeholder="Enter your email or phone number (e.g. 076...)"
                      className={`w-full px-4 py-3.5 rounded-2xl border outline-none text-slate-900 font-semibold text-sm ${
                        authFieldError?.fieldId === 'authEmail'
                          ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                          : 'border-lavender-300 focus:border-lavender-600 focus:ring-4 focus:ring-lavender-100 bg-cream/60'
                      }`}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="authPassword"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                      >
                        Account Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="text-[11px] font-bold text-lavender-700 hover:text-lavender-900 cursor-pointer"
                      >
                        {showPassword ? '🙈 Hide Password' : '👁️ Show Password'}
                      </button>
                    </div>
                    <input
                      ref={authPasswordInputRef}
                      type={showPassword ? 'text' : 'password'}
                      id="authPassword"
                      name="password"
                      autoComplete="current-password"
                      required
                      value={authPassword}
                      onChange={(e) => {
                        setAuthPassword(e.target.value);
                        if (authFieldError?.fieldId === 'authPassword') setAuthFieldError(null);
                      }}
                      placeholder="Enter the password you used to create your account"
                      className={`w-full px-4 py-3.5 rounded-2xl border outline-none text-slate-900 font-semibold text-sm ${
                        authFieldError?.fieldId === 'authPassword'
                          ? 'border-rose-500 ring-4 ring-rose-100 bg-rose-50/30'
                          : 'border-lavender-300 focus:border-lavender-600 focus:ring-4 focus:ring-lavender-100 bg-cream/60'
                      }`}
                    />
                    <p className="text-[11px] text-slate-500 mt-1.5 font-medium">
                      🔒 Private Sign-In — enter your registered Email/Phone and the exact password you used to create your account.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-lavender-500 to-rose-500 hover:from-lavender-700 hover:to-rose-700 text-white font-bold text-base shadow-lg shadow-lavender-200 transition-all active:scale-[0.99] cursor-pointer"
              >
                {authMode === 'signup'
                  ? 'Create Account & Start 2-Week Free Access 🌸'
                  : 'Sign In to My Tracker 🌸'}
              </button>
            </form>

            {/* Continue with Google */}
            <div className="mt-5 pt-4 border-t border-slate-100 space-y-2.5 text-center">
              <button
                type="button"
                disabled={isGoogleSigningIn}
                onClick={handleUserGoogleSignIn}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-800 font-extrabold text-xs sm:text-sm border-2 border-slate-300 shadow-xs transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                <span>
                  {isGoogleSigningIn
                    ? 'Connecting to Google...'
                    : authMode === 'signup'
                    ? 'Continue with Google (Create Account & Cloud Sync)'
                    : 'Continue with Google (Instant Sign In)'}
                </span>
              </button>
            </div>

            {/* Creator Branding Footer on Auth Screen */}
            <div className="mt-5 pt-3 border-t border-slate-100 text-center space-y-1">
              <div className="text-xs font-extrabold text-slate-800">
                Created by {CREATOR_NAME}
              </div>
              <a
                href={`mailto:${CREATOR_EMAIL}?subject=Contact%20Creator%20-%20BloomCampus`}
                className="inline-block text-xs font-bold text-lavender-700 hover:underline"
              >
                ✉️ Contact Creator: {CREATOR_EMAIL}
              </a>
            </div>
          </div>
        </div>

        {/* IN-APP GOOGLE ACCOUNT CHOOSER MODAL (ENSURES CONTINUE WITH GOOGLE ALWAYS SUCCEEDS ON MOBILE & COMPUTER) */}
        {showGoogleAccountModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                    />
                  </svg>
                  <div>
                    <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                      Continue with Google
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Choose or enter your Google account to continue to BloomCampus
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGoogleAccountModal(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  completeGoogleAccountSignIn(
                    googleModalEmail,
                    googleModalName,
                    googleModalAge,
                    googleModalPhone
                  );
                }}
                className="space-y-3 pt-1"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Your Google Email (Gmail) *
                  </label>
                  <input
                    type="text"
                    required
                    value={googleModalEmail}
                    onChange={(e) => setGoogleModalEmail(e.target.value)}
                    placeholder="yourname@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-lavender-600 outline-none text-xs sm:text-sm font-semibold text-slate-900 bg-cream/50"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={googleModalName}
                      onChange={(e) => setGoogleModalName(e.target.value)}
                      placeholder="e.g., Kumba Hannah"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Age
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="99"
                      value={googleModalAge}
                      onChange={(e) => setGoogleModalAge(e.target.value)}
                      placeholder="21"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number Used
                  </label>
                  <input
                    type="tel"
                    value={googleModalPhone}
                    onChange={(e) => setGoogleModalPhone(e.target.value)}
                    placeholder="e.g., 076 123 456"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold text-slate-900 bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 px-5 rounded-2xl bg-[#4285F4] hover:bg-[#3367D6] text-white font-extrabold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
                >
                  Continue with Google Account 🌸
                </button>
              </form>
            </div>
          </div>
        )}

        {/* OWNER ADMIN LOGIN MODAL ON AUTH SCREEN */}
        {showAdminLoginModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-plum-900">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-plum-900 text-gold-500">
                  🛡️ Owner Admin Console Login
                </span>
                <button
                  type="button"
                  onClick={() => setShowAdminLoginModal(false)}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg bg-slate-100"
                >
                  Close ✕
                </button>
              </div>
              <h3 className="font-display font-extrabold text-xl text-slate-900">
                Sign In to Owner / Admin Dashboard
              </h3>
              <p className="text-xs text-slate-600 mt-1 mb-4">
                See all sign-ups and know how many people are in the app ({Object.keys(allUsersMap).length} currently synced). For <strong>{CREATOR_NAME}</strong> ({OWNER_ADMIN_EMAIL}) or any authorized admin.
              </p>

              <form onSubmit={handleAdminLoginSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    required
                    value={adminLoginEmail}
                    onChange={(e) => setAdminLoginEmail(e.target.value)}
                    placeholder="Enter owner or added admin email..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold text-slate-900 bg-cream"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Admin Password
                  </label>
                  <input
                    type="password"
                    required
                    value={adminLoginPassword}
                    onChange={(e) => setAdminLoginPassword(e.target.value)}
                    placeholder="Enter admin password..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold text-slate-900 bg-white"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 px-5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-500 font-extrabold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
                >
                  Open Admin Dashboard ({Object.keys(allUsersMap).length} Sign-Ups) 🛡️
                </button>
              </form>

              <div className="mt-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleGoogleAdminLogin}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>🔐</span>
                  <span>Verify Owner Admin with Google ({OWNER_ADMIN_EMAIL})</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // COMPUTED METRICS FOR LOGGED-IN DASHBOARD (LOCKED REAL-TIME TODAY)
  // =========================================================================
  const todayStr = lockedTodayStr;
  const todayMetrics = calculateCycleMetrics(userData, todayStr);
  const metrics = calculateCycleMetrics(userData, selectedDateStr);
  const stageInfo = PHASE_ADVISOR_DATA[todayMetrics.stageKey];
  const selectedStageInfo = PHASE_ADVISOR_DATA[metrics.stageKey];
  const advisorInfo = PHASE_ADVISOR_DATA[activeAdvisorStage];
  const trialInfo = getTrialStatus(userData);
  const currentDailyLog = getDailyLog(selectedDateStr);
  const sortedPeriods = getSortedPeriods(userData.periods);
  const badgeEvaluation = evaluateUserBadges(userData);

  // Live preview of bleed duration when Start & End dates are selected in the Period Tracker inputs
  const inputBleedDaysPreview =
    periodStartInput &&
    periodEndInput &&
    periodEndInput >= periodStartInput &&
    diffDays(periodStartInput, periodEndInput) + 1 <= 20
      ? diffDays(periodStartInput, periodEndInput) + 1
      : null;

  const isAccountLocked =
    trialInfo.status === 'expired' || trialInfo.status === 'pending_verification';

  const showBagAlert =
    !bagBannerDismissed &&
    (forceBagBannerPreview ||
      (todayMetrics.daysUntilNextPeriod !== null &&
        todayMetrics.daysUntilNextPeriod >= 0 &&
        todayMetrics.daysUntilNextPeriod <= 2));

  const hasSeverePain = Object.values(userData.dailyLogs || {}).some((entry) =>
    (entry.symptoms || []).includes('Severe Pain')
  );
  const showClinicAlert = hasSeverePain || todayMetrics.isIrregular;

  // Stage-linked mood frequency pattern
  const stageMoodCounts: Record<string, number> = {};
  Object.values(userData.dailyLogs || {}).forEach((entry) => {
    if (entry.mood && entry.stageAtLog === stageInfo.name) {
      stageMoodCounts[entry.mood] = (stageMoodCounts[entry.mood] || 0) + 1;
    }
  });
  const topStageMoods = Object.entries(stageMoodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([m, c]) => `${m} (${c}x)`)
    .join(', ');

  // Calendar grid generation
  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const pillDatesSet = new Set((userData.emergencyPills || []).map((p) => p.dateStr));

  const changeCalendarMonth = (delta: number) => {
    let nextM = calendarMonth + delta;
    let nextY = calendarYear;
    if (nextM < 0) {
      nextM = 11;
      nextY--;
    } else if (nextM > 11) {
      nextM = 0;
      nextY++;
    }
    setCalendarMonth(nextM);
    setCalendarYear(nextY);
  };

  const jumpToToday = () => {
    const now = getLockedRealTimeDate();
    const iso = getLockedTodayISO();
    setSelectedDateStr(iso);
    setCalendarMonth(now.getMonth());
    setCalendarYear(now.getFullYear());
  };

  // Emergency Pill 21-day follow-up calculation
  const lastPillBaseDate =
    userData.emergencyPills && userData.emergencyPills.length > 0
      ? new Date(userData.emergencyPills[0].timestamp)
      : new Date();
  const hasLoggedPill = Boolean(userData.emergencyPills && userData.emergencyPills.length > 0);
  const followUpDate = new Date(lastPillBaseDate.getTime() + 21 * 24 * 60 * 60 * 1000);
  const formattedFollowUp = followUpDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Clinic Summary Aggregations
  const symCounts: Record<string, number> = {};
  const symTotalHours: Record<string, number> = {};
  const symDurationEntries: Record<string, number> = {};
  const symTotalIntensity: Record<string, number> = {};
  const symIntensityEntries: Record<string, number> = {};
  const moodCounts: Record<string, number> = {};
  Object.values(userData.dailyLogs || {}).forEach((log) => {
    if (log.mood) {
      const key = `${log.mood} (${log.stageAtLog || 'Cycle'})`;
      moodCounts[key] = (moodCounts[key] || 0) + 1;
    }
    (log.symptoms || []).forEach((s) => {
      symCounts[s] = (symCounts[s] || 0) + 1;
      const hrs = log.symptomDurations?.[s];
      if (typeof hrs === 'number' && hrs > 0) {
        symTotalHours[s] = (symTotalHours[s] || 0) + hrs;
        symDurationEntries[s] = (symDurationEntries[s] || 0) + 1;
      }
      const sev = log.intensity?.[s];
      if (typeof sev === 'number' && sev >= 1 && sev <= 5) {
        symTotalIntensity[s] = (symTotalIntensity[s] || 0) + sev;
        symIntensityEntries[s] = (symIntensityEntries[s] || 0) + 1;
      }
    });
  });
  const topSymptomsText =
    Object.entries(symCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => {
        const durCount = symDurationEntries[k] || 0;
        const sevCount = symIntensityEntries[k] || 0;
        const details: string[] = [`${v}d`];
        if (durCount > 0) {
          const avgHrs = Math.round(((symTotalHours[k] || 0) / durCount) * 10) / 10;
          details.push(`~${avgHrs}h/day`);
        }
        if (sevCount > 0) {
          const avgSev = Math.round(((symTotalIntensity[k] || 0) / sevCount) * 10) / 10;
          details.push(`sev ${avgSev}/5`);
        }
        return `${k} (${details.join(' · ')})`;
      })
      .join(', ') || 'None logged yet';
  const topMoodsText =
    Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k}: ${v}x`)
      .join(' • ') || 'None logged yet';

  return (
    <div className="min-h-screen flex flex-col selection:bg-lavender-200 selection:text-lavender-900">
      <OfflineIndicator />

      {/* TOAST CONTAINER */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-lg border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
              t.type === 'success'
                ? 'bg-sage-800 text-white border-sage-600'
                : t.type === 'warning'
                ? 'bg-peach-700 text-white border-peach-500'
                : 'bg-lavender-900 text-white border-lavender-500'
            }`}
          >
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* MAIN APP SIDEBAR DRAWER (WITH OWNER ADMIN LOGIN & CREATOR BRANDING) */}
      {showSidebarDrawer && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setShowSidebarDrawer(false)}
          />
          <aside className="relative z-10 w-80 max-w-[86vw] bg-white h-full shadow-2xl border-r border-lavender-200 flex flex-col justify-between p-5 overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-lavender-500 to-rose-500 flex items-center justify-center text-white text-xl shadow-xs">
                    🌸
                  </div>
                  <div>
                    <div className="font-display font-extrabold text-base text-slate-900">
                      BloomCampus
                    </div>
                    <div className="text-[11px] text-slate-500 font-semibold">
                      {userData.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSidebarDrawer(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Menu Only Controls: Profile & Sync, Light / Dark Mode, and Admin Console */}
              <div className="rounded-2xl bg-cream border border-lavender-200 p-3.5 space-y-2.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-lavender-900">
                  Menu Controls — Profile, Theme &amp; Admin
                </div>

                {/* 1. Profile & Sync Button (Inside Menu Only) */}
                <button
                  type="button"
                  onClick={() => {
                    setShowSidebarDrawer(false);
                    setShowProfileModal(true);
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-white hover:bg-lavender-50 text-lavender-900 border border-lavender-300 font-extrabold text-xs flex items-center justify-between gap-2 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span>👤</span>
                    <span>Profile &amp; Sync</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-lavender-100 text-lavender-800">
                    Open →
                  </span>
                </button>

                {/* 2. Light / Dark Mode Toggle (Inside Menu Only) */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDarkMode}
                  onClick={handleToggleDarkMode}
                  className={`w-full py-2.5 px-3.5 rounded-xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                    isDarkMode
                      ? 'bg-slate-800 border-lavender-500/50 text-white shadow-xs'
                      : 'bg-white hover:bg-lavender-50 border-lavender-200 text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2 font-extrabold text-xs">
                    <span>{isDarkMode ? '🌙' : '☀️'}</span>
                    <span>{isDarkMode ? 'Dark Mode (Active)' : 'Light Mode (Active)'}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                      isDarkMode
                        ? 'bg-lavender-500 text-white'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    Switch to {isDarkMode ? 'Light' : 'Dark'}
                  </span>
                </button>

                {/* 3. Admin Button (Inside Menu Only) */}
                <button
                  type="button"
                  onClick={async () => {
                    setShowSidebarDrawer(false);
                    const isCurrentUserAdmin =
                      currentUserEmail &&
                      (currentUserEmail.toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase() ||
                        (adminConfig.additionalAdmins || []).some(
                          (a) => a.email.trim().toLowerCase() === currentUserEmail.toLowerCase()
                        ));
                    if (isCurrentUserAdmin) {
                      setIsAdminView(true);
                      localStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
                      await syncLatestUsersFromEverywhere();
                    } else {
                      setAdminLoginEmail(OWNER_ADMIN_EMAIL);
                      setShowAdminLoginModal(true);
                    }
                  }}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-500 font-extrabold text-xs border border-gold-500/40 shadow-xs flex items-center justify-between gap-2 transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <span>🛡️</span>
                    <span>Admin ({Object.keys(allUsersMap).length} People)</span>
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/10 text-amber-200">
                    Open →
                  </span>
                </button>

                {/* Access Pass / Renewal */}
                <div className="pt-2 border-t border-lavender-200/70 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-700 truncate">
                    {trialInfo.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSidebarDrawer(false);
                      setIsPaywallPreview(true);
                      setShowPaywallModal(true);
                    }}
                    className="py-1.5 px-2.5 rounded-lg bg-lavender-600 hover:bg-lavender-800 text-white font-bold text-[11px] shrink-0 transition-all cursor-pointer"
                  >
                    🟧 Pass / Renew
                  </button>
                </div>
              </div>

              {/* Sidebar Navigation */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-2">
                  App Sections
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNavSection('tracker');
                    setShowSidebarDrawer(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${
                    activeNavTab === 'tracker'
                      ? 'bg-rose-100 text-rose-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>🩸</span>
                  <span>Cycle &amp; LMP Calendar</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNavSection('checkin');
                    setShowSidebarDrawer(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${
                    activeNavTab === 'checkin'
                      ? 'bg-lavender-100 text-lavender-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>😊</span>
                  <span>Daily Mood, Symptoms &amp; Journal</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNavSection('guide');
                    setShowSidebarDrawer(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${
                    activeNavTab === 'guide'
                      ? 'bg-peach-100 text-peach-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>💊</span>
                  <span>Emergency Pill &amp; Phase Guide</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNavSection('analytics');
                    setShowSidebarDrawer(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${
                    activeNavTab === 'analytics'
                      ? 'bg-sage-100 text-sage-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>📊</span>
                  <span>Trends, Hydration &amp; Cravings</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNavSection('study');
                    setShowSidebarDrawer(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${
                    activeNavTab === 'study'
                      ? 'bg-lavender-100 text-lavender-900'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>📚</span>
                  <span>Study &amp; Exam Sync Planner</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSelectNavSection('sidratu');
                    setShowSidebarDrawer(false);
                  }}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 ${
                    activeNavTab === 'sidratu'
                      ? 'bg-[#3B0944] text-[#D4AF37]'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>✨</span>
                  <span>Sidratu Skincare &amp; AI Assistant</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSidebarDrawer(false);
                    setShowAboutContactModal(true);
                  }}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl font-bold text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                >
                  <span>💬</span>
                  <span>About / Contact Creator &amp; Support</span>
                </button>
              </div>
            </div>

            {/* Sidebar Footer: Creator Branding */}
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="rounded-2xl bg-lavender-50/90 border border-lavender-200 p-3 text-center space-y-1">
                <div className="text-xs font-extrabold text-slate-900">
                  Created by {CREATOR_NAME}
                </div>
                <a
                  href={`mailto:${CREATOR_EMAIL}?subject=BloomCampus%20Support%20%26%20Creator%20Contact`}
                  className="block text-[11px] font-bold text-lavender-700 hover:underline"
                >
                  ✉️ Contact Creator: {CREATOR_EMAIL}
                </a>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSidebarDrawer(false);
                  handleLogout();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200"
              >
                Log Out
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* STICKY HEADER — CLEAN & EASY ON THE EYES FOR BOTH MOBILE PHONES AND COMPUTERS */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-lavender-100 shadow-2xs">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Menu Button (Holds Profile & Sync, Light/Dark, and Admin) + Greeting */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setShowSidebarDrawer(true)}
              className="px-3 py-2 rounded-xl bg-lavender-600 hover:bg-lavender-700 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition-all shrink-0 cursor-pointer"
              title="Open Menu for Profile & Sync, Light/Dark Theme, and Admin"
            >
              <span>☰</span>
              <span>Menu</span>
            </button>
            <div className="hidden xs:flex w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-lavender-500 to-rose-500 items-center justify-center text-white text-lg sm:text-xl shadow-2xs shrink-0">
              🌸
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="font-display font-bold text-sm sm:text-base text-slate-900 truncate max-w-[140px] sm:max-w-none">
                  Hi, {userData.name}
                  {userData.age ? ` (${userData.age})` : ''}!
                </span>
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsPaywallPreview(true);
                      setShowPaywallModal(true);
                    }}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all whitespace-nowrap ${
                      trialInfo.status === 'subscribed' || trialInfo.status === 'free_password'
                        ? 'bg-sage-50 text-sage-800 border-sage-200 hover:bg-sage-100'
                        : trialInfo.status === 'pending_verification'
                        ? 'bg-orange-100 text-orange-800 border-orange-300'
                        : trialInfo.status === 'expired'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-lavender-50 text-lavender-700 border-lavender-200 hover:bg-lavender-100'
                    }`}
                  >
                    {trialInfo.label}
                  </button>
                  {trialInfo.status === 'pending_verification' && (
                    <button
                      type="button"
                      onClick={() => handleRemovePendingVerification()}
                      title="Remove Pending Owner Verification"
                      aria-label="Remove Pending Owner Verification"
                      className="w-5 h-5 rounded-full bg-orange-200 hover:bg-orange-300 text-orange-950 font-extrabold text-[11px] flex items-center justify-center border border-orange-400 cursor-pointer transition-all"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                {stageInfo.emoji} {stageInfo.shortName} · Day {todayMetrics.cycleDay}
                {selectedDateStr !== todayStr
                  ? ` · Viewing ${formatShortMonthDay(selectedDateStr)} (Day ${metrics.cycleDay})`
                  : ''}
              </p>
            </div>
          </div>

          {/* Zone 2: Clean Compact Quick Actions (Admin, Light/Dark, and Profile & Sync are strictly inside Menu) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setShowBadgesModal(true)}
              className="px-2.5 sm:px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-extrabold flex items-center gap-1 border border-amber-300 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              title="View Virtual Milestones & Cycle Master Badges"
            >
              <span>🏅</span>
              <span className="hidden md:inline">Badges</span>
              <span className="px-1.5 py-0.2 rounded-md bg-amber-200/80 text-amber-950 text-[10px] font-extrabold tabular-nums">
                {badgeEvaluation.unlockedCount}/{badgeEvaluation.totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowClinicSummaryModal(true)}
              className="px-2.5 sm:px-3 py-2 rounded-xl bg-sage-100 hover:bg-sage-200 text-sage-800 text-xs font-bold flex items-center gap-1 border border-sage-200 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              title="Open Doctor & Clinic Summary Report"
            >
              <span>🩺</span>
              <span className="hidden md:inline">Clinic</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const next = !privacyBlurEnabled;
                setPrivacyBlurEnabled(next);
                if (next) {
                  showToast(
                    '🙈 Discreet Mode ON: Sensitive sections are blurred.',
                    'info'
                  );
                }
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              title="Blur sensitive text around friends in class or dorm"
            >
              <span>{privacyBlurEnabled ? '🙈' : '👁️'}</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 sm:px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="max-w-6xl mx-auto w-full px-4 py-6 space-y-6 flex-1">
        {/* IN-APP WELCOME-BACK BANNER WHEN OWNER APPROVES PAYMENT */}
        {userData.approvalWelcomePending && (
          <div className="rounded-3xl bg-gradient-to-r from-sage-800 via-emerald-700 to-plum-900 text-white p-5 sm:p-6 shadow-xl border-2 border-gold-500 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-gold-500 text-plum-900 text-[10px] font-extrabold uppercase tracking-wider">
                🎉 Payment Verified &amp; Approved by Owner
              </div>
              <h3 className="font-display font-extrabold text-lg sm:text-xl text-white">
                Welcome Back, {userData.name}! Your 30-Day Access Pass is Restored &amp; Active!
              </h3>
              <p className="text-xs sm:text-sm text-sage-100">
                Your Orange Money payment of <strong>Le 30</strong> has been verified by{' '}
                <strong>{CREATOR_NAME}</strong>. Your full access is unlocked until{' '}
                <strong>{userData.lastApprovedExpirationDate || '30 days from today'}</strong>.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                updateUserData((prev) => ({
                  ...prev,
                  approvalWelcomePending: false,
                }))
              }
              className="px-4 py-2.5 rounded-xl bg-white text-sage-900 hover:bg-sage-50 font-extrabold text-xs shrink-0 shadow-sm cursor-pointer"
            >
              🎉 Awesome, Thank You!
            </button>
          </div>
        )}

        {/* INLINE QUICK COMPLETION BAR IF ACTIVE SESSION IS MISSING PHONE NUMBER OR AGE */}
        {(!resolveCustomerPhoneUsed(userData) || !userData.age) && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const enteredPhone = String(formData.get('quickPhone') || '').trim();
              const enteredAge = String(formData.get('quickAge') || '').trim();
              const enteredName = String(formData.get('quickName') || '').trim();
              if (!enteredPhone) {
                showToast('Please enter your phone number to complete your profile.', 'warning');
                return;
              }
              const nextUser: UserData = {
                ...userData,
                name: enteredName || userData.name,
                age: enteredAge || userData.age || '21',
                phone: enteredPhone,
                deviceInfo: getClientDeviceLabel(),
                lastUpdatedAt: new Date().toISOString(),
              };
              updateUserData(() => nextUser);
              await logCustomerEntryToFirestore(nextUser, 'WebApp Session');
              showToast('✅ Saved your phone number & profile details!', 'success');
            }}
            className="rounded-2xl bg-lavender-900 text-white p-4 shadow-md border border-gold-500/40 flex flex-col md:flex-row md:items-end justify-between gap-3"
          >
            <div className="space-y-0.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gold-400 block">
                📱 Complete Your Student Profile Entry (Customer #{userData.customerNumber || 1})
              </span>
              <p className="text-xs text-lavender-100">
                Please confirm your name, age, and phone number used so your account entry is complete across all devices.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <label className="text-[10px] font-bold uppercase text-lavender-200 block mb-0.5">
                  Name
                </label>
                <input
                  type="text"
                  name="quickName"
                  defaultValue={userData.name}
                  required
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-lavender-200 block mb-0.5">
                  Age
                </label>
                <input
                  type="number"
                  name="quickAge"
                  defaultValue={userData.age || '21'}
                  min="10"
                  max="80"
                  required
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-lavender-200 block mb-0.5">
                  Phone Number Used *
                </label>
                <input
                  type="tel"
                  name="quickPhone"
                  defaultValue={resolveCustomerPhoneUsed(userData)}
                  placeholder="076 123 456"
                  required
                  className="w-full px-2.5 py-1.5 rounded-xl bg-white text-slate-900 text-xs font-semibold"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-xl bg-gold-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs h-[32px] cursor-pointer"
              >
                Save Entry ✓
              </button>
            </div>
          </form>
        )}

        {/* TOP ALERT BANNERS (PHASE SHIFT NOTIFICATION, 2-DAY BAG REMINDER & CLINIC ALERT) */}
        {(userData.lastPhaseShiftSummary || showBagAlert || showClinicAlert) && (
          <div className="space-y-3">
            {userData.lastPhaseShiftSummary && (() => {
              const summary = userData.lastPhaseShiftSummary;
              const fromMeta = PHASE_ADVISOR_DATA[summary.fromStage] || PHASE_ADVISOR_DATA.FOLLICULAR;
              const toMeta = PHASE_ADVISOR_DATA[summary.toStage] || PHASE_ADVISOR_DATA.OVULATION;
              const shiftMeta = PHASE_SHIFT_NOTIFICATION_DATA[summary.toStage] || PHASE_SHIFT_NOTIFICATION_DATA.OVULATION;
              return (
                <div className="rounded-3xl bg-gradient-to-r from-plum-900 via-lavender-900 to-rose-900 text-white p-5 sm:p-6 shadow-lg border-2 border-gold-500/60 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500 text-plum-900 text-[11px] font-extrabold uppercase tracking-wider">
                          <span>🔔 Phase Shift Notification</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 border border-white/20 text-xs font-extrabold text-amber-200">
                          <span>
                            {fromMeta.emoji} {fromMeta.shortName} → {toMeta.emoji} {toMeta.shortName} Stage
                          </span>
                        </span>
                      </div>
                      <h3 className="font-display font-extrabold text-base sm:text-xl text-white">
                        {toMeta.emoji} You Moved into Your {toMeta.shortName} Stage! ({shiftMeta.headline})
                      </h3>
                      <p className="text-xs sm:text-sm text-lavender-100">
                        {shiftMeta.hormoneShiftText} Here are your personalized cycle-synced nutrition and Sidratu skincare recommendations for this phase:
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateUserData((prev) => ({
                          ...prev,
                          lastPhaseShiftSummary: null,
                        }))
                      }
                      title="Dismiss Phase Shift Notification"
                      aria-label="Dismiss Phase Shift Notification"
                      className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs flex items-center justify-center shrink-0 cursor-pointer transition-all"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Related Nutrition Tip Card */}
                    <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300">
                            🥗 Phase Nutrition &amp; Craving Tip
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-100 border border-emerald-400/30">
                            {toMeta.shortName} Fuel
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-white/95 leading-relaxed">
                          {summary.nutritionTip}
                        </p>
                        <div className="text-xs font-bold text-amber-200 pt-1">
                          Top Snack: {summary.recommendedSnack}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveNavTab('analytics');
                          setActiveTrackerAction('nutrition');
                        }}
                        className="self-start px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-extrabold text-xs transition-all cursor-pointer"
                      >
                        🥗 Open {toMeta.shortName} Nutrition &amp; Snacks →
                      </button>
                    </div>

                    {/* Related Skincare Tip Card */}
                    <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20 p-4 flex flex-col justify-between gap-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-gold-400">
                            ✨ Sidratu Phase Skincare Tip
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-gold-500/25 text-amber-100 border border-gold-400/30">
                            101 Jomo Kenyatta Rd
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm text-white/95 leading-relaxed">
                          {summary.skincareTip}
                        </p>
                        <div className="text-xs font-bold text-amber-200 pt-1">
                          Recommended Care: {summary.recommendedTreatment}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveNavTab('sidratu')}
                        className="self-start px-3.5 py-2 rounded-xl bg-gold-500 hover:bg-amber-400 text-plum-900 font-display font-extrabold text-xs transition-all cursor-pointer"
                      >
                        ✨ Open Sidratu Skincare Hub →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {showBagAlert && (
              <div className="rounded-2xl bg-gradient-to-r from-peach-100 to-rose-100 border-2 border-peach-500 p-4 shadow-xs flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎒</span>
                  <div>
                    <h3 className="font-display font-bold text-slate-900 text-sm sm:text-base">
                      Heads up: Your period is expected in ~2 days!
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-700 mt-0.5">
                      Make sure you have pads, tampons, and pain relief packed in your bag for class!
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setForceBagBannerPreview(false);
                    setBagBannerDismissed(true);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1"
                >
                  ✕
                </button>
              </div>
            )}

            {showClinicAlert && (
              <div className="rounded-2xl bg-rose-50 border-2 border-rose-500 p-4 shadow-xs flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🏥</span>
                  <div>
                    <h3 className="font-display font-bold text-rose-900 text-sm sm:text-base">
                      Campus Clinic Heads-Up
                    </h3>
                    <p className="text-xs sm:text-sm text-rose-800 mt-0.5">
                      Pain this bad or irregular cycles aren't something you just have to push through. Consider dropping by the campus health center or Sidratu Clinic to chat with a doctor and rule out conditions like endometriosis or PCOS!
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowClinicSummaryModal(true)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-rose-700 underline hover:text-rose-900"
                    >
                      Open your Doctor Summary Card 🩺 →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: STUDY & EXAM SYNC */}
        {activeNavTab === 'study' && (
          <StudyExamSyncPlanner
            userData={userData}
            selectedDateStr={selectedDateStr}
            metrics={metrics}
            onUpdateUser={updateUserData}
            showToast={showToast}
          />
        )}

        {/* TAB 3: SIDRATU SKINCARE & AI HUB */}
        {activeNavTab === 'sidratu' && (
          <SidratuClinicHub
            userData={userData}
            metrics={metrics}
            onUpdateUser={updateUserData}
            showToast={showToast}
          />
        )}

        {/* TAB 1: FULL BLOOMCAMPUS CYCLE, MOOD & EMERGENCY PILL TRACKER */}
        {activeNavTab === 'tracker' && (
          <>
            {/* =====================================================================
                VERY TOP OF APP: PROMINENT LAST MENSTRUAL PERIOD (LMP) INFO SUMMARY CARD,
                PERSISTENT PERIOD TRACKING CONTROLS & INTERACTIVE CALENDAR TOGGLE BUTTON
               ===================================================================== */}
            <section
              id="top-period-tracker"
              className="bg-white rounded-3xl shadow-sm border-2 border-rose-200 p-5 sm:p-6 space-y-5"
            >
              {/* 1. PROMINENT LAST MENSTRUAL PERIOD (LMP) INFO SUMMARY CARD & BADGE */}
              <div className="rounded-3xl bg-gradient-to-r from-plum-900 via-rose-900 to-lavender-900 text-white p-5 sm:p-6 shadow-lg border-2 border-gold-500/40">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/15">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500 text-plum-900 text-[11px] font-extrabold uppercase tracking-wider shadow-xs">
                        <span>🩸 Last Menstrual Period (LMP) Info</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[11px] font-bold">
                        <span>💾 Persistent Period Memory: Active</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 text-amber-200 border border-white/15 text-[11px] font-bold">
                        <span>🔒 Locked Today: {formatLockedTodayHuman()} ({todayStr})</span>
                      </span>
                      {todayMetrics.autoRolloverCycles && todayMetrics.autoRolloverCycles > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-lavender-500/30 text-lavender-100 border border-lavender-300/30 text-[11px] font-bold">
                          🔄 Auto-Rolled Over (+{todayMetrics.autoRolloverCycles} Cycle
                          {todayMetrics.autoRolloverCycles === 1 ? '' : 's'})
                        </span>
                      ) : null}
                    </div>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl tracking-tight text-white">
                      {sortedPeriods.length > 0
                        ? `${stageInfo.emoji} ${stageInfo.name} · Cycle Day ${todayMetrics.cycleDay} of ${todayMetrics.avgCycleLength}`
                        : '🩸 Log Your Last Menstrual Period (LMP) Start & End Dates Below'}
                    </h2>
                    <p className="text-xs sm:text-sm text-lavender-100">
                      {sortedPeriods.length > 0
                        ? 'Your entered Start & End dates are memorized automatically. You only need to update them when a new cycle begins, or let the app automatically roll over.'
                        : 'Enter your Start & End dates once below—the app permanently remembers them and automatically calculates your next cycle, fertile window, and ovulation.'}
                    </p>
                  </div>

                  {/* TOP CALENDAR TOGGLE BUTTON & QUICK ACTIONS RIGHT AT THE VERY TOP */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowCalendarGrid((prev) => !prev)}
                      aria-expanded={showCalendarGrid}
                      className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer border-2 ${
                        showCalendarGrid
                          ? 'bg-gold-500 text-plum-900 border-white hover:bg-amber-400'
                          : 'bg-white text-plum-900 border-gold-500 hover:bg-lavender-50'
                      }`}
                    >
                      <span>📅</span>
                      <span>{showCalendarGrid ? 'Hide Calendar' : 'View Calendar'}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-plum-900/10 font-bold">
                        {showCalendarGrid ? '▲' : '▼'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFullScreenCalendar(true)}
                      className="px-3.5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white border border-white/25 font-extrabold text-xs transition-all cursor-pointer"
                      title="Open Full-Screen 3-Month Horizon Calendar"
                    >
                      ⛶ Full-Screen
                    </button>
                  </div>
                </div>

                {/* 4 PROMINENT LMP SUMMARY BADGES: (1) RECORDED START DATE, (2) RECORDED END DATE, (3) ESTIMATED CYCLE DAY, (4) NEXT EXPECTED PERIOD */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
                  <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 p-3.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-200 block">
                      1. Recorded LMP Start Date
                    </span>
                    <span className="font-display font-extrabold text-base sm:text-lg text-white mt-0.5 block tabular-nums">
                      {todayMetrics.activePeriodStartStr
                        ? formatHumanDate(todayMetrics.activePeriodStartStr)
                        : 'Not Recorded Yet'}
                    </span>
                    <span className="text-[11px] text-lavender-200 font-semibold block mt-0.5">
                      {todayMetrics.activePeriodStartStr
                        ? 'Memorized First Day of Bleeding'
                        : 'Select Start Date below'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 p-3.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-200 block">
                      2. Recorded LMP End Date
                    </span>
                    <span className="font-display font-extrabold text-base sm:text-lg text-white mt-0.5 block tabular-nums">
                      {todayMetrics.activePeriodEndStr
                        ? formatHumanDate(todayMetrics.activePeriodEndStr)
                        : 'Not Recorded Yet'}
                    </span>
                    <span className="text-[11px] text-lavender-200 font-semibold block mt-0.5">
                      {todayMetrics.activePeriodStartStr
                        ? `${todayMetrics.activePeriodDuration}d Bleed Duration Memorized`
                        : 'Select End Date below'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 p-3.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-200 block">
                      3. Estimated Cycle Day
                    </span>
                    <span className="font-display font-extrabold text-base sm:text-lg text-amber-300 mt-0.5 block tabular-nums">
                      {sortedPeriods.length > 0
                        ? `Day ${todayMetrics.cycleDay} of ${todayMetrics.avgCycleLength}`
                        : 'Awaiting LMP'}
                    </span>
                    <span className="text-[11px] text-lavender-200 font-semibold block mt-0.5">
                      {sortedPeriods.length > 0
                        ? `${stageInfo.emoji} ${stageInfo.shortName} Stage`
                        : 'Auto-calculates from LMP'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-white/10 backdrop-blur-xs border border-white/15 p-3.5">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200 block">
                      4. Next Expected Period
                    </span>
                    <span className="font-display font-extrabold text-base sm:text-lg text-emerald-300 mt-0.5 block tabular-nums">
                      {todayMetrics.nextPeriodDateStr
                        ? formatHumanDate(todayMetrics.nextPeriodDateStr)
                        : 'Log LMP Start Date'}
                    </span>
                    <span className="text-[11px] text-lavender-200 font-semibold block mt-0.5">
                      {todayMetrics.daysUntilNextPeriod !== null
                        ? todayMetrics.daysUntilNextPeriod > 0
                          ? `In ${todayMetrics.daysUntilNextPeriod} day${
                              todayMetrics.daysUntilNextPeriod === 1 ? '' : 's'
                            } (Ends ${formatShortMonthDay(todayMetrics.nextPeriodEndDateStr)})`
                          : todayMetrics.daysUntilNextPeriod === 0
                          ? 'Expected Today'
                          : `Auto-rolled over (${todayMetrics.avgCycleLength}d cycle)`
                        : 'Auto-calculates next cycle'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. TOP INTERACTIVE CALENDAR TOGGLE PANEL (OPENS WHEN USER CLICKS VIEW CALENDAR) */}
              {showCalendarGrid && (
                <div className="bg-cream rounded-2xl border-2 border-lavender-300 p-4 sm:p-5 shadow-md transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeCalendarMonth(-1)}
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-lavender-50 flex items-center justify-center font-bold text-slate-700 cursor-pointer"
                      >
                        ◀
                      </button>
                      <h3 className="font-display font-bold text-base sm:text-lg text-slate-800 min-w-[140px] text-center">
                        {monthNames[calendarMonth]} {calendarYear}
                      </h3>
                      <button
                        type="button"
                        onClick={() => changeCalendarMonth(1)}
                        className="w-9 h-9 rounded-xl bg-white border border-slate-200 hover:bg-lavender-50 flex items-center justify-center font-bold text-slate-700 cursor-pointer"
                      >
                        ▶
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                        🔒 Today: <strong className="text-slate-900">{formatShortMonthDay(todayStr)}</strong>
                        {' · '}Selected:{' '}
                        <strong className="text-lavender-700">
                          {selectedDateStr === todayStr
                            ? 'Today'
                            : formatShortMonthDay(selectedDateStr)}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={jumpToToday}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl bg-lavender-100 text-lavender-700 hover:bg-lavender-200 transition-all cursor-pointer"
                      >
                        Jump to Locked Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFullScreenCalendar(true)}
                        className="text-xs font-extrabold px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-lavender-800 text-white shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>⛶</span>
                        <span>Full-Screen View</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCalendarGrid(false)}
                        className="text-xs font-extrabold px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 transition-all cursor-pointer"
                      >
                        ✕ Hide Calendar
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase text-slate-400 mb-2">
                    <div>Sun</div>
                    <div>Mon</div>
                    <div>Tue</div>
                    <div>Wed</div>
                    <div>Thu</div>
                    <div>Fri</div>
                    <div>Sat</div>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: firstDayIndex }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-12 rounded-xl" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                      const day = idx + 1;
                      const dObj = new Date(calendarYear, calendarMonth, day);
                      const dStr = formatDateISO(dObj);
                      const isLoggedPeriod = isDateInLoggedPeriod(userData, dStr);
                      const isPredPeriod =
                        !isLoggedPeriod && isDateInPredictedPeriod(dStr, todayMetrics);
                      const fertileInfo = getFertileStatusForDate(userData, dStr, todayMetrics);
                      const isOvulation =
                        !isLoggedPeriod && !isPredPeriod && fertileInfo.isFertileWindow;
                      const isPeakOvulation = isOvulation && fertileInfo.isPeakOvulation;
                      const isSelected = dStr === selectedDateStr;
                      const isToday = dStr === todayStr;
                      const dayLog = userData.dailyLogs[dStr];
                      const hasPill = pillDatesSet.has(dStr);
                      const moodObj =
                        dayLog && dayLog.mood
                          ? MOOD_CATEGORIES.find((m) => m.id === dayLog.mood)
                          : null;

                      let bgClass =
                        'bg-white hover:bg-lavender-50 text-slate-700 border border-slate-200/80';
                      if (isLoggedPeriod) {
                        bgClass = 'bg-rose-500 text-white font-bold border border-rose-600';
                      } else if (isPredPeriod) {
                        bgClass =
                          'bg-rose-100 text-rose-900 border border-dashed border-rose-500 font-semibold';
                      } else if (isPeakOvulation) {
                        bgClass = 'bg-sage-600 text-white font-bold border border-sage-800';
                      } else if (isOvulation) {
                        bgClass =
                          'bg-sage-100 text-sage-800 border border-sage-600/50 font-semibold';
                      }

                      return (
                        <button
                          key={dStr}
                          type="button"
                          onClick={() => setSelectedDateStr(dStr)}
                          className={`h-12 sm:h-14 rounded-xl p-1 flex flex-col items-center justify-between transition-all tabular-nums ${bgClass} ${
                            isSelected ? 'ring-2 ring-slate-900 ring-offset-1 scale-[1.03]' : ''
                          }`}
                        >
                          <span className="text-xs leading-none">{day}</span>
                          <div className="text-[10px] leading-none flex items-center gap-0.5">
                            {isPeakOvulation && <span title="Peak Ovulation Day">⭐</span>}
                            {hasPill && <span>💊</span>}
                            {moodObj && <span>{moodObj.emoji}</span>}
                            {!isPeakOvulation && !hasPill && !moodObj && isToday && (
                              <span className="text-[9px] uppercase font-extrabold">Today</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Set Selected Date & Calendar Legend */}
                  <div className="mt-3 pt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" /> Logged Period
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-rose-200 border border-dashed border-rose-500 inline-block" />{' '}
                        Predicted Period
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-sage-200 border border-sage-600 inline-block" />{' '}
                        Fertile Window
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-sage-600 inline-block" /> ⭐ Peak Ovulation
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span>💊</span> Emergency Pill
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPeriodStartInput(selectedDateStr);
                          showToast(
                            `🩸 Period Start Date set to ${formatHumanDate(
                              selectedDateStr
                            )} in the top Period Tracker!`,
                            'info'
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] transition-all cursor-pointer"
                      >
                        🩸 Set Selected as Start Date
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPeriodEndInput(selectedDateStr);
                          showToast(
                            `✨ Period End Date set to ${formatHumanDate(
                              selectedDateStr
                            )} in the top Period Tracker!`,
                            'info'
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-lavender-100 hover:bg-lavender-200 text-lavender-800 font-bold text-[11px] transition-all cursor-pointer"
                      >
                        ✨ Set Selected as End Date
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. PERSISTENT PERIOD TRACKING CONTROLS & LOCKED REAL-TIME CURRENT DATE INPUTS */}
              <div
                id="update-lmp-section"
                className="rounded-2xl bg-gradient-to-br from-rose-50/90 via-cream to-lavender-50/90 border-2 border-rose-200 p-4 sm:p-5 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700">
                        🩸 Persistent Period Memory &amp; Tracking Controls
                      </span>
                      {todayMetrics.activePeriodStartStr && (
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ✓ Dates Memorized ({formatShortMonthDay(todayMetrics.activePeriodStartStr)}
                          {todayMetrics.activePeriodEndStr
                            ? ` – ${formatShortMonthDay(todayMetrics.activePeriodEndStr)}`
                            : ''})
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900 mt-0.5">
                      {editingPeriodStartKey
                        ? `✏️ Editing Memorized Period Starting ${formatHumanDate(editingPeriodStartKey)}`
                        : 'Update LMP Start & End Dates (Saved Automatically)'}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Your Start &amp; End dates stay saved here so you never have to re-enter them. Update only when a new period starts, or let the cycle roll over automatically.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCalendarGrid((prev) => !prev)}
                      className="px-3.5 py-1.5 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>📅</span>
                      <span>{showCalendarGrid ? 'Hide Calendar' : 'View Calendar'}</span>
                    </button>
                    {sortedPeriods.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAllPeriodHistory}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[11px] transition-all cursor-pointer"
                      >
                        🧹 Clear Memory
                      </button>
                    )}
                  </div>
                </div>

                {/* 4-COLUMN INPUT GRID: (0) LOCKED TODAY, (1) START DATE, (2) END DATE, (3) CYCLE LENGTH */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
                  {/* LOCKED REAL-TIME CURRENT DATE (READ-ONLY) */}
                  <div className="bg-slate-900 text-white rounded-2xl p-3.5 border-2 border-slate-700 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label
                          htmlFor="lockedRealTimeDateInput"
                          className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1"
                        >
                          <span>🔒 Today&apos;s Date (Locked)</span>
                        </label>
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                          Read-Only
                        </span>
                      </div>
                      <input
                        type="date"
                        id="lockedRealTimeDateInput"
                        value={todayStr}
                        readOnly
                        disabled
                        aria-readonly="true"
                        tabIndex={-1}
                        title="Permanent real-time system date — strictly read-only and cannot be changed"
                        className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/90 text-xs sm:text-sm font-mono font-extrabold text-white cursor-not-allowed select-none opacity-95"
                      />
                    </div>
                    <div className="text-[10px] text-slate-300 font-semibold mt-1.5 flex items-center justify-between">
                      <span>{formatLockedTodayHuman()}</span>
                      <span className="text-emerald-400 font-bold">● Live Clock</span>
                    </div>
                  </div>

                  {/* 1. PERIOD START DATE (FIRST DAY OF BLEEDING) */}
                  <div className="bg-white rounded-2xl p-3.5 border-2 border-rose-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label
                          htmlFor="periodStartDateInput"
                          className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700"
                        >
                          1. LMP Start Date *
                        </label>
                        <button
                          type="button"
                          onClick={() => setPeriodStartInput(todayStr)}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-800 transition-all cursor-pointer"
                        >
                          New Cycle Today
                        </button>
                      </div>
                      <input
                        type="date"
                        id="periodStartDateInput"
                        value={periodStartInput}
                        onChange={(e) => setPeriodStartInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none text-xs sm:text-sm font-bold text-slate-800 bg-cream"
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-1.5">
                      {periodStartInput
                        ? `Memorized Start: ${formatHumanDate(periodStartInput)}`
                        : 'Pick past or current start date'}
                    </div>
                  </div>

                  {/* 2. PERIOD END DATE (LAST DAY OF BLEEDING) */}
                  <div className="bg-white rounded-2xl p-3.5 border-2 border-lavender-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label
                          htmlFor="periodEndDateInput"
                          className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-700"
                        >
                          2. LMP End Date
                        </label>
                        <div className="flex items-center gap-1">
                          {periodStartInput && (
                            <button
                              type="button"
                              onClick={() =>
                                setPeriodEndInput(addDaysISO(periodStartInput, 4))
                              }
                              className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-lavender-100 hover:bg-lavender-200 text-lavender-800 transition-all cursor-pointer"
                              title="Set End Date to 5 days from Start Date"
                            >
                              +5d
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setPeriodEndInput('')}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <input
                        type="date"
                        id="periodEndDateInput"
                        min={periodStartInput || undefined}
                        value={periodEndInput}
                        onChange={(e) => setPeriodEndInput(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 outline-none text-xs sm:text-sm font-bold text-slate-800 bg-cream"
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-1.5">
                      {inputBleedDaysPreview !== null ? (
                        <span className="text-rose-700 font-extrabold">
                          🩸 Bleed Length: {inputBleedDaysPreview} Day
                          {inputBleedDaysPreview === 1 ? '' : 's'} ({formatShortMonthDay(periodStartInput)}–{formatShortMonthDay(periodEndInput)})
                        </span>
                      ) : periodEndInput ? (
                        `Memorized End: ${formatHumanDate(periodEndInput)}`
                      ) : (
                        'Last day of bleeding (or leave blank if ongoing)'
                      )}
                    </div>
                  </div>

                  {/* 3. CYCLE LENGTH (DAYS) */}
                  <div className="bg-white rounded-2xl p-3.5 border-2 border-sage-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <label
                          htmlFor="customCycleLenInput"
                          className="text-[11px] font-extrabold uppercase tracking-wider text-sage-800"
                        >
                          3. Cycle Length (Days)
                        </label>
                        <button
                          type="button"
                          onClick={() => handleCustomCycleLengthChange(28)}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-sage-100 hover:bg-sage-200 text-sage-800 transition-all cursor-pointer"
                        >
                          28d Std
                        </button>
                      </div>
                      <input
                        type="number"
                        id="customCycleLenInput"
                        min={21}
                        max={45}
                        value={userData.customCycleLength || todayMetrics.avgCycleLength || 28}
                        onChange={(e) =>
                          handleCustomCycleLengthChange(Number(e.target.value))
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-sage-600 focus:ring-2 focus:ring-sage-100 outline-none text-xs sm:text-sm font-bold text-slate-800 bg-cream tabular-nums"
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold mt-1.5">
                      Ovulation Day {todayMetrics.ovulationDay} · Fertile Days {todayMetrics.ovStart}–{todayMetrics.ovEnd}
                    </div>
                  </div>
                </div>

                {/* SAVE PERIOD, VIEW/HIDE CALENDAR & REMINDER ROW */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => savePeriodDatesFromInputs(false)}
                      className="px-5 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-lavender-600 hover:from-rose-600 hover:to-lavender-700 text-white font-display font-extrabold text-xs sm:text-sm shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>💾 Save &amp; Memorize Period Dates</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowCalendarGrid((prev) => !prev)}
                      className="px-4 py-3 rounded-2xl bg-white hover:bg-lavender-50 text-lavender-900 border-2 border-lavender-300 font-extrabold text-xs sm:text-sm transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>📅 {showCalendarGrid ? 'Hide Calendar' : 'View Calendar'}</span>
                    </button>

                    {sortedPeriods.length > 1 && (
                      <button
                        type="button"
                        onClick={() => savePeriodDatesFromInputs(true)}
                        className="px-4 py-3 rounded-2xl bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 font-bold text-xs transition-all cursor-pointer"
                        title="Use only these entered Start & End dates and clear older sample/past periods"
                      >
                        🎯 Use Only This Period
                      </button>
                    )}

                    {editingPeriodStartKey && (
                      <button
                        type="button"
                        onClick={cancelPeriodEdit}
                        className="px-4 py-3 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </div>

                  {/* 2-Day Reminder & Phase Shift Notification Quick Toggles */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePhaseShiftNotifications}
                      role="switch"
                      aria-checked={userData.phaseShiftNotificationsEnabled !== false}
                      className={`px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 border cursor-pointer ${
                        userData.phaseShiftNotificationsEnabled !== false
                          ? 'bg-plum-900 hover:bg-lavender-900 text-gold-500 border-gold-500/50 shadow-xs'
                          : 'bg-white hover:bg-lavender-50 text-slate-800 border-lavender-300'
                      }`}
                      title="Receive a browser notification with nutrition & skincare tips whenever you move into a new cycle phase"
                    >
                      <span>
                        {userData.phaseShiftNotificationsEnabled !== false
                          ? '🌸 Phase Shift Alerts: ON'
                          : '🔕 Enable Phase Shift Alerts'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulatePhaseShiftNotification('OVULATION')}
                      className="px-3 py-2.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-xs border border-lavender-300 transition-all cursor-pointer"
                      title="Send a browser notification simulating a shift from Follicular to Ovulation with nutrition & skincare tips"
                    >
                      ✨ Test Phase Shift (Follicular → Ovulation)
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleCycleReminders}
                      role="switch"
                      aria-checked={Boolean(userData.cycleRemindersEnabled)}
                      className={`px-3.5 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 border cursor-pointer ${
                        userData.cycleRemindersEnabled
                          ? 'bg-sage-600 hover:bg-sage-800 text-white border-sage-700 shadow-xs'
                          : 'bg-white hover:bg-peach-100 text-slate-800 border-peach-300'
                      }`}
                    >
                      <span>
                        {userData.cycleRemindersEnabled
                          ? '🔔 2-Day Reminder: ON'
                          : '🔕 Enable 2-Day Alert'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSendTestCycleNotification}
                      className="px-3 py-2.5 rounded-xl bg-white hover:bg-lavender-50 text-lavender-800 font-bold text-xs border border-lavender-200 transition-all cursor-pointer"
                    >
                      Test 2-Day Alert
                    </button>
                  </div>
                </div>

                {/* INTERACTIVE PHASE SHIFT NOTIFICATION BAR (PREVIEW ANY TRANSITION ON DEMAND) */}
                <div className="mt-3.5 pt-3 border-t border-rose-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-xs text-slate-700 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-lavender-900">
                      🔔 Phase Shift Browser Notifications:
                    </span>
                    <span>
                      Auto-sends nutrition &amp; Sidratu skincare tips when your cycle moves into a new phase. Preview any phase shift:
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {(
                      [
                        { to: 'MENSTRUATION', label: '🌙→🩸 Menstruation' },
                        { to: 'FOLLICULAR', label: '🩸→🌱 Follicular' },
                        { to: 'OVULATION', label: '🌱→🌸 Ovulation' },
                        { to: 'LUTEAL', label: '🌸→🌙 Luteal' },
                      ] as Array<{ to: StageKey; label: string }>
                    ).map((item) => (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => handleSimulatePhaseShiftNotification(item.to)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-bold text-[11px] transition-all cursor-pointer shadow-2xs"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* RECORDED PERIOD HISTORY CHIPS (COMPACT & EDITABLE) */}
                {sortedPeriods.length > 0 && (
                  <div className="mt-4 pt-3.5 border-t border-rose-200/70">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                        📅 Memorized Period History ({sortedPeriods.length}) — Active LMP:{' '}
                        <strong className="text-rose-700">
                          {formatHumanDate(todayMetrics.activePeriodStartStr)}
                          {todayMetrics.activePeriodEndStr
                            ? ` to ${formatHumanDate(todayMetrics.activePeriodEndStr)}`
                            : ''}
                        </strong>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[...sortedPeriods].reverse().map((p) => {
                        const hasEnd = Boolean(p.endDate && p.endDate >= p.startDate);
                        const bleedDays = hasEnd
                          ? diffDays(p.startDate, p.endDate!) + 1
                          : todayMetrics.avgPeriodDuration;
                        const isLatest = p.startDate === todayMetrics.activePeriodStartStr;
                        return (
                          <div
                            key={p.startDate}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold tabular-nums ${
                              isLatest
                                ? 'bg-white border-rose-400 text-slate-900 shadow-2xs'
                                : 'bg-white/70 border-slate-200 text-slate-700'
                            }`}
                          >
                            <span>
                              🩸 <strong>{formatShortMonthDay(p.startDate)}</strong>
                              {hasEnd ? ` – ${formatShortMonthDay(p.endDate)}` : ' (Ongoing)'}{' '}
                              <span className="text-rose-700 font-bold">({bleedDays}d)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => editPeriodRecord(p.startDate)}
                              className="text-[11px] font-bold text-lavender-700 hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePeriodRecord(p.startDate)}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                              title="Delete this period record"
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* 4 AUTO-CALCULATED CYCLE METRICS CARDS (FERTILE WINDOW, OVULATION & NEXT CYCLE) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl bg-rose-50/80 border border-rose-200 p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Memorized LMP &amp; Bleed
                  </span>
                  <span className="font-display font-extrabold text-sm sm:text-base text-rose-800 mt-0.5 block tabular-nums">
                    {todayMetrics.activePeriodStartStr
                      ? `${formatShortMonthDay(todayMetrics.activePeriodStartStr)} – ${formatShortMonthDay(
                          todayMetrics.activePeriodEndStr
                        )}`
                      : 'Enter Dates Above'}
                  </span>
                  <span className="text-[11px] font-semibold text-rose-700 block tabular-nums mt-0.5">
                    {todayMetrics.activePeriodStartStr
                      ? `${todayMetrics.activePeriodDuration}d Bleed · ${todayMetrics.avgCycleLength}d Cycle`
                      : 'No period logged yet'}
                  </span>
                </div>

                <div className="rounded-2xl bg-sage-50/80 border border-sage-200 p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Auto-Calculated Fertile Window
                  </span>
                  <span className="font-display font-extrabold text-sm sm:text-base text-sage-900 mt-0.5 block tabular-nums">
                    {todayMetrics.ovulationWindowStartStr && todayMetrics.ovulationWindowEndStr
                      ? `${formatShortMonthDay(
                          todayMetrics.ovulationWindowStartStr
                        )} – ${formatShortMonthDay(todayMetrics.ovulationWindowEndStr)}`
                      : `Days ${todayMetrics.ovStart}–${todayMetrics.ovEnd}`}
                  </span>
                  <span className="text-[11px] font-semibold text-sage-700 block tabular-nums mt-0.5">
                    Cycle Days {todayMetrics.ovStart}–{todayMetrics.ovEnd}
                  </span>
                </div>

                <div className="rounded-2xl bg-peach-50/80 border border-peach-200 p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Auto-Calculated Peak Ovulation
                  </span>
                  <span className="font-display font-extrabold text-sm sm:text-base text-peach-800 mt-0.5 block tabular-nums">
                    {todayMetrics.ovulationDateStr
                      ? `⭐ ${formatHumanDate(todayMetrics.ovulationDateStr)}`
                      : `Cycle Day ${todayMetrics.ovulationDay}`}
                  </span>
                  <span className="text-[11px] font-semibold text-peach-700 block tabular-nums mt-0.5">
                    Cycle Day {todayMetrics.ovulationDay} of {todayMetrics.avgCycleLength}d
                  </span>
                </div>

                <div className="rounded-2xl bg-lavender-50/80 border border-lavender-200 p-3.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                    Next Expected Period
                  </span>
                  <span className="font-display font-extrabold text-sm sm:text-base text-lavender-900 mt-0.5 block tabular-nums">
                    {todayMetrics.nextPeriodDateStr
                      ? `${formatShortMonthDay(todayMetrics.nextPeriodDateStr)} – ${formatShortMonthDay(
                          todayMetrics.nextPeriodEndDateStr
                        )}`
                      : 'Log Start Date'}
                  </span>
                  <span className="text-[11px] font-semibold text-lavender-700 block tabular-nums mt-0.5">
                    {todayMetrics.daysUntilNextPeriod !== null
                      ? todayMetrics.daysUntilNextPeriod > 0
                        ? `In ${todayMetrics.daysUntilNextPeriod} day${
                            todayMetrics.daysUntilNextPeriod === 1 ? '' : 's'
                          } (from Locked Today)`
                        : todayMetrics.daysUntilNextPeriod === 0
                        ? 'Expected Today'
                        : 'Auto-rolled over to active cycle'
                      : 'Based on memorized LMP'}
                  </span>
                </div>
              </div>

              {/* INTERACTIVE 4-PHASE USER CYCLE EXPLORER & HORMONE PROGRESS CARD */}
              <div className="rounded-2xl bg-gradient-to-br from-lavender-50/90 via-cream to-rose-50/90 border-2 border-lavender-200 p-4 sm:p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-800">
                        🌸 User Phase Engine &amp; 4-Stage Cycle Explorer
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-lavender-700 text-white text-[10px] font-extrabold">
                        Active Today: {stageInfo.emoji} {stageInfo.shortName} (Day {todayMetrics.cycleDay}/{todayMetrics.avgCycleLength})
                      </span>
                      {selectedDateStr !== todayStr && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-extrabold">
                          Selected Date ({formatShortMonthDay(selectedDateStr)}): {selectedStageInfo.emoji} {selectedStageInfo.shortName} (Day {metrics.cycleDay})
                        </span>
                      )}
                    </div>
                    <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900 mt-1">
                      Tap Any Cycle Phase Below to Inspect Hormones, Study Sync, Nutrition &amp; Skincare
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {activeAdvisorStage !== todayMetrics.stageKey && (
                      <button
                        type="button"
                        onClick={() => setActiveAdvisorStage(todayMetrics.stageKey)}
                        className="px-3 py-1.5 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-bold text-xs cursor-pointer transition-all"
                      >
                        🎯 Reset to Today&apos;s Phase ({stageInfo.shortName})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSelectNavSection('guide')}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-lavender-100 text-lavender-900 border border-lavender-300 font-bold text-xs cursor-pointer transition-all"
                    >
                      🧬 Full Phase Guide →
                    </button>
                  </div>
                </div>

                {/* 4 Interactive Phase Buttons */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {(
                    [
                      {
                        key: 'MENSTRUATION' as StageKey,
                        daysLabel: `Days 1–${todayMetrics.activePeriodDuration || todayMetrics.avgPeriodDuration || 5}`,
                      },
                      {
                        key: 'FOLLICULAR' as StageKey,
                        daysLabel: `Days ${(todayMetrics.activePeriodDuration || todayMetrics.avgPeriodDuration || 5) + 1}–${Math.max((todayMetrics.activePeriodDuration || 5) + 1, todayMetrics.ovStart - 1)}`,
                      },
                      {
                        key: 'OVULATION' as StageKey,
                        daysLabel: `Days ${todayMetrics.ovStart}–${todayMetrics.ovEnd} (Peak D${todayMetrics.ovulationDay})`,
                      },
                      {
                        key: 'LUTEAL' as StageKey,
                        daysLabel: `Days ${todayMetrics.ovEnd + 1}–${todayMetrics.avgCycleLength}`,
                      },
                    ]
                  ).map((item) => {
                    const meta = PHASE_ADVISOR_DATA[item.key];
                    const isTodayPhase = todayMetrics.stageKey === item.key;
                    const isViewingPhase = activeAdvisorStage === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveAdvisorStage(item.key)}
                        className={`p-3 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-1.5 cursor-pointer ${
                          isViewingPhase
                            ? 'bg-plum-900 text-white border-gold-500 shadow-md scale-[1.01]'
                            : isTodayPhase
                            ? 'bg-white text-slate-900 border-lavender-500 shadow-2xs'
                            : 'bg-white/85 hover:bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-lg">{meta.emoji}</span>
                          <div className="flex items-center gap-1">
                            {isTodayPhase && (
                              <span
                                className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                                  isViewingPhase
                                    ? 'bg-gold-500 text-plum-900'
                                    : 'bg-lavender-100 text-lavender-900'
                                }`}
                              >
                                Active Today
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isViewingPhase
                                  ? 'bg-white/15 text-amber-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {item.daysLabel}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div className="font-display font-extrabold text-xs sm:text-sm">
                            {meta.shortName} Stage
                          </div>
                          <div
                            className={`text-[11px] line-clamp-1 mt-0.5 ${
                              isViewingPhase ? 'text-lavender-200' : 'text-slate-500'
                            }`}
                          >
                            {meta.hormoneSummary}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Phase Quick Summary Bar */}
                <div className="rounded-2xl bg-white border border-lavender-200 p-3.5 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-lavender-700 block">
                      {advisorInfo.emoji} {advisorInfo.shortName} Hormones &amp; Mood
                    </span>
                    <p className="text-slate-700 font-medium leading-relaxed">
                      <strong>{advisorInfo.hormoneSummary}:</strong> {advisorInfo.mind}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-sage-800 block">
                      🥗 {advisorInfo.shortName} Nutrition &amp; Study Sync
                    </span>
                    <p className="text-slate-700 font-medium leading-relaxed">
                      {advisorInfo.craving} {advisorInfo.study}
                    </p>
                  </div>
                  <div className="space-y-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 block">
                        ✨ Sidratu {advisorInfo.shortName} Skin Sync
                      </span>
                      <p className="text-slate-700 font-medium leading-relaxed">
                        {advisorInfo.skincareSync}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSimulatePhaseShiftNotification(activeAdvisorStage)}
                        className="px-2.5 py-1 rounded-lg bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-bold text-[11px] cursor-pointer transition-all"
                      >
                        🔔 Alert for {advisorInfo.shortName}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectNavSection('sidratu')}
                        className="px-2.5 py-1 rounded-lg bg-[#3B0944] hover:bg-[#C81D77] text-[#D4AF37] font-bold text-[11px] cursor-pointer transition-all"
                      >
                        ✨ Book Skincare →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Shortcut Bar to Jump to Other Core Tools */}
              <div className="pt-2 border-t border-rose-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500 font-semibold">
                  💡 Use the bottom navigation bar anytime to switch tools with a single tap:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectNavSection('checkin')}
                    className="px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-800 font-bold border border-lavender-200 transition-all cursor-pointer"
                  >
                    😊 Log Today&apos;s Mood &amp; Symptoms →
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectNavSection('analytics')}
                    className="px-3 py-1.5 rounded-xl bg-sage-50 hover:bg-sage-100 text-sage-800 font-bold border border-sage-200 transition-all cursor-pointer"
                  >
                    📊 View 6-Mo Trends &amp; Water →
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBadgesModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 transition-all cursor-pointer"
                  >
                    🏅 Badges ({badgeEvaluation.unlockedCount}/{badgeEvaluation.totalCount}) · 🔥{' '}
                    {badgeEvaluation.currentStreakDays}d Streak →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectNavSection('guide');
                      setShowSmartPhaseGuide(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#0B57D0] font-bold border border-blue-200 transition-all cursor-pointer"
                  >
                    🧠 Smart Phase Guide &amp; Emergency Pill Tracker →
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {/* TAB 2 (BOTTOM NAV): DAILY MOOD, SYMPTOMS, DAILY WINS, NOTES & JOURNAL PROMPTS */}
        {activeNavTab === 'checkin' && (
          <>
            {/* =====================================================================
                STANDALONE SECTION 1: DAILY MOOD, SYMPTOMS, DAILY WINS & NOTES
               ===================================================================== */}
            <section
              id="standalone-mood-symptoms"
              className="bg-white rounded-3xl shadow-xs border-2 border-lavender-200 p-5 sm:p-6 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-lavender-700 block mb-1">
                    😊 Daily Check-In · {formatHumanDate(selectedDateStr)} (Cycle Day {metrics.cycleDay})
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-800">
                    Mood &amp; Symptoms Check-In (How Are You Feeling Today?)
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600">
                    Tap your mood and symptoms below — linked automatically to your{' '}
                    <span className="font-bold text-lavender-700">
                      {selectedStageInfo.emoji} {selectedStageInfo.shortName} Stage
                    </span>
                    .
                  </p>
                </div>
              </div>

              {/* Mood Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-lavender-800 mb-2.5">
                  1. Rate Your Mood
                </h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-2.5 mb-4">
                  {MOOD_CATEGORIES.map((m) => {
                    const isSelected = currentDailyLog.mood === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => selectMoodForDate(m.id)}
                        className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                          isSelected
                            ? 'bg-lavender-700 text-white border-lavender-900 shadow-md scale-[1.03]'
                            : 'bg-cream hover:bg-lavender-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <span className="text-2xl">{m.emoji}</span>
                        <span className="text-xs font-bold">{m.id}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-2xl bg-lavender-50 border border-lavender-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm font-bold text-lavender-900">
                    {currentDailyLog.mood ? (
                      <>
                        ✅ Logged on {formatHumanDate(selectedDateStr)}: Feeling{' '}
                        <span className="underline">
                          {MOOD_CATEGORIES.find((x) => x.id === currentDailyLog.mood)?.emoji}{' '}
                          {currentDailyLog.mood}
                        </span>{' '}
                        in your {selectedStageInfo.shortName}.
                      </>
                    ) : (
                      `👆 Tap a mood above to record how you feel on ${formatHumanDate(selectedDateStr)}.`
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const moodText = currentDailyLog.mood
                        ? `feeling ${currentDailyLog.mood}`
                        : 'navigating my hormone shifts';
                      const msg = `Hey! 🌸 My BloomCampus tracker says I'm in my ${selectedStageInfo.shortName} (Cycle Day ${metrics.cycleDay}) and ${moodText}. ${selectedStageInfo.hormoneSummary} — a little extra patience or snacks today would be amazing! 💜`;
                      copyTextToClipboard(
                        msg,
                        '💬 Status copied! Paste it in WhatsApp or text for your partner/bestie.'
                      );
                    }}
                    className="shrink-0 px-3.5 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 self-start sm:self-center"
                  >
                    <span>💬</span>
                    <span>Copy Status for Partner / Bestie</span>
                  </button>
                </div>

                {/* Contraceptive Mood State & Emergency Pill Monthly Period Shift Notice */}
                <div className="mt-3 rounded-2xl bg-gradient-to-r from-peach-50 via-rose-50 to-lavender-50 border-2 border-peach-300 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0">💊</span>
                    <div className="space-y-1">
                      <div className="font-display font-extrabold text-xs sm:text-sm text-rose-950">
                        Contraceptive Mood State &amp; Emergency Pill Period Shift Notice
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed">
                        If you are taking an <strong>emergency contraceptive pill in a month</strong>, it can lead to changes in how your period is found (delaying ovulation and shifting your next period earlier or later, while also affecting your hormone and mood state). <strong>Always note the exact date and time down</strong>, and <strong>re-change your LMP (Last Menstrual Period) start date when you notice your period again</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={jumpToUpdateLmpSection}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🩸</span>
                      <span>Back to Update LMP Start Date →</span>
                    </button>
                    <button
                      type="button"
                      onClick={jumpToEmergencyPillLogger}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-peach-100 text-slate-800 border border-peach-300 font-bold text-xs transition-all cursor-pointer flex items-center gap-1"
                    >
                      <span>⏱️</span>
                      <span>Note Pill Date &amp; Time</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Physical Symptoms Checklist Button & Collapsible Panel */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowSymptomChecklist((prev) => !prev)}
                  aria-expanded={showSymptomChecklist}
                  className={`w-full rounded-3xl p-4 sm:p-5 border-2 transition-all cursor-pointer text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:shadow-md active:scale-[0.99] ${
                    showSymptomChecklist
                      ? 'bg-gradient-to-r from-rose-700 via-rose-800 to-slate-900 text-white border-rose-900'
                      : 'bg-gradient-to-r from-rose-50 via-peach-50/70 to-lavender-50 hover:from-rose-100 hover:to-lavender-100 text-slate-900 border-rose-300'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-2xs border ${
                        showSymptomChecklist
                          ? 'bg-white/15 border-white/25 text-white'
                          : 'bg-white border-rose-200 text-rose-700'
                      }`}
                    >
                      🩺
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            showSymptomChecklist
                              ? 'bg-white/20 text-white'
                              : 'bg-rose-600 text-white'
                          }`}
                        >
                          {(currentDailyLog.symptoms || []).length} Selected
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            showSymptomChecklist ? 'text-rose-100' : 'text-rose-800'
                          }`}
                        >
                          {formatShortMonthDay(selectedDateStr)} · Severity (1–5) &amp; Duration Tracker
                        </span>
                      </div>
                      <h3 className="font-display font-extrabold text-base sm:text-lg leading-snug">
                        2. Physical Symptoms Checklist ({(currentDailyLog.symptoms || []).length} Selected)
                      </h3>
                      <p
                        className={`text-xs mt-0.5 ${
                          showSymptomChecklist ? 'text-rose-100' : 'text-slate-600'
                        }`}
                      >
                        Tap to {showSymptomChecklist ? 'hide' : 'open'} the physical symptoms checklist, search bar &amp; category filters
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <span
                      className={`px-4 py-2 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-2xs transition-all ${
                        showSymptomChecklist
                          ? 'bg-white text-rose-950'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      <span>
                        {showSymptomChecklist ? '▲ Hide Symptoms' : '▼ Open Symptoms Checklist'}
                      </span>
                    </span>
                  </div>
                </button>

                {showSymptomChecklist && (
                  <div className="rounded-3xl bg-cream/60 border-2 border-rose-200 p-4 sm:p-5 space-y-3.5">
                    {(currentDailyLog.symptoms || []).length > 0 && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-600">
                          Manage or clear logged symptoms for {formatShortMonthDay(selectedDateStr)}:
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const currentLog = getDailyLog(selectedDateStr);
                            updateUserData((prev) => ({
                              ...prev,
                              dailyLogs: {
                                ...prev.dailyLogs,
                                [selectedDateStr]: {
                                  ...currentLog,
                                  symptoms: [],
                                  symptomDurations: {},
                                  intensity: {},
                                },
                              },
                            }));
                            showToast(
                              `Cleared physical symptoms for ${formatShortMonthDay(selectedDateStr)}.`,
                              'info'
                            );
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-all cursor-pointer"
                        >
                          🧹 Clear Selected ({(currentDailyLog.symptoms || []).length})
                        </button>
                      </div>
                    )}

                {/* Symptom Search Bar */}
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none"
                  >
                    🔍
                  </span>
                  <input
                    type="search"
                    id="symptomChecklistSearchInput"
                    value={symptomSearchQuery}
                    onChange={(e) => setSymptomSearchQuery(e.target.value)}
                    placeholder="Search physical symptoms (e.g., cramps, headache, bloating, spotting, nausea, back ache)..."
                    aria-label="Search physical symptoms"
                    className="w-full pl-10 pr-24 py-2.5 rounded-2xl border-2 border-rose-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 bg-cream text-xs sm:text-sm font-semibold text-slate-800 outline-none transition-all"
                  />
                  {symptomSearchQuery.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSymptomSearchQuery('')}
                      aria-label="Clear symptom search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] transition-all cursor-pointer"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>

                {/* Quick Category Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'ALL', label: `All (${SYMPTOM_ITEMS.length})` },
                    {
                      id: 'SELECTED',
                      label: `✓ Logged Today (${(currentDailyLog.symptoms || []).length})`,
                    },
                    { id: 'Pain & Cramps', label: '🌸 Pain & Cramps' },
                    { id: 'Hormonal & Body', label: '💗 Hormonal & Body' },
                    { id: 'Digestion & Fluid', label: '🎈 Digestion & Fluid' },
                    { id: 'Bleeding & Flow', label: '🩸 Bleeding & Flow' },
                    { id: 'Skin & Hair', label: '✨ Skin & Hair' },
                    { id: 'Head & Neuro', label: '🤕 Head & Neuro' },
                  ].map((cat) => {
                    const isActive = symptomCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setSymptomCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                          isActive
                            ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                            : 'bg-white hover:bg-rose-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>

                {/* Active Logged Symptoms, Severity (1-5) & Persistence Duration (Hours) Summary Panel */}
                {(currentDailyLog.symptoms || []).length > 0 && (
                  <div className="rounded-2xl bg-rose-50/90 border-2 border-rose-200 p-3.5 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-rose-900">
                        ⏱️ Logged Symptoms, Severity (1–5) &amp; Duration on {formatShortMonthDay(selectedDateStr)}:
                      </span>
                      <span className="text-[11px] font-semibold text-rose-700">
                        Rate severity (1 Mild – 5 Severe) and hours persisted (0.5h – 24h)
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {(currentDailyLog.symptoms || []).map((symId) => {
                        const preset = SYMPTOM_ITEMS.find((s) => s.id === symId);
                        const hoursPersisted = currentDailyLog.symptomDurations?.[symId] ?? 2;
                        const severityLevel =
                          currentDailyLog.intensity?.[symId] ?? (symId === 'Severe Pain' ? 5 : 3);
                        const severityTextMap: Record<number, string> = {
                          1: 'Very Mild',
                          2: 'Mild',
                          3: 'Moderate',
                          4: 'Strong',
                          5: 'Severe',
                        };
                        return (
                          <div
                            key={symId}
                            className={`rounded-xl p-3 border flex flex-col gap-2 ${
                              preset?.redFlag
                                ? 'bg-rose-600 text-white border-rose-700'
                                : 'bg-white text-slate-800 border-rose-300'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <span className="text-xs font-extrabold truncate flex items-center gap-1.5">
                                <span>{preset ? preset.emoji : '📌'}</span>
                                <span className="truncate">{symId}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                                    preset?.redFlag
                                      ? 'bg-rose-800 text-rose-100'
                                      : severityLevel >= 4
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  Sev {severityLevel}/5 · {severityTextMap[severityLevel]}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleSymptom(symId)}
                                title="Remove symptom"
                                aria-label={`Remove ${symId}`}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold cursor-pointer shrink-0 ${
                                  preset?.redFlag
                                    ? 'bg-rose-800 hover:bg-rose-950 text-white'
                                    : 'bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-800'
                                }`}
                              >
                                ✕
                              </button>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              {/* 1-5 Severity Rating Buttons */}
                              <div className="flex items-center gap-1">
                                <span
                                  className={`text-[10px] font-bold uppercase mr-0.5 ${
                                    preset?.redFlag ? 'text-rose-100' : 'text-slate-500'
                                  }`}
                                >
                                  📊 Severity:
                                </span>
                                {[1, 2, 3, 4, 5].map((lvl) => {
                                  const isSelectedLvl = severityLevel === lvl;
                                  return (
                                    <button
                                      key={lvl}
                                      type="button"
                                      onClick={() => setSymptomIntensity(symId, lvl, true)}
                                      aria-label={`Rate ${symId} severity ${lvl} out of 5`}
                                      title={`Severity ${lvl}/5 (${severityTextMap[lvl]})`}
                                      className={`w-6 h-6 rounded-lg font-extrabold text-[11px] flex items-center justify-center border transition-all cursor-pointer tabular-nums ${
                                        isSelectedLvl
                                          ? preset?.redFlag
                                            ? 'bg-white text-rose-900 border-white shadow-2xs'
                                            : lvl >= 4
                                            ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                                            : 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                          : preset?.redFlag
                                          ? 'bg-rose-700/80 hover:bg-rose-800 text-rose-100 border-rose-400/60'
                                          : 'bg-rose-50/70 hover:bg-rose-100 text-slate-700 border-rose-200'
                                      }`}
                                    >
                                      {lvl}
                                    </button>
                                  );
                                })}
                              </div>

                              {/* Duration (Hours) Controls */}
                              <div className="flex items-center gap-1 shrink-0">
                                <span
                                  className={`text-[10px] font-bold uppercase ${
                                    preset?.redFlag ? 'text-rose-100' : 'text-slate-500'
                                  }`}
                                >
                                  ⏱️ Hours:
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSymptomDurationHours(
                                      symId,
                                      hoursPersisted <= 1 ? 0.5 : hoursPersisted - 1,
                                      true
                                    )
                                  }
                                  aria-label={`Decrease hours for ${symId}`}
                                  className={`w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                    preset?.redFlag
                                      ? 'bg-rose-700 hover:bg-rose-800 text-white border-rose-400'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200'
                                  }`}
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min={0.5}
                                  max={24}
                                  step={0.5}
                                  value={hoursPersisted}
                                  onChange={(e) =>
                                    setSymptomDurationHours(symId, Number(e.target.value), false)
                                  }
                                  aria-label={`Hours ${symId} persisted`}
                                  className={`w-13 px-1 py-0.5 rounded-lg border text-center text-xs font-extrabold tabular-nums outline-none ${
                                    preset?.redFlag
                                      ? 'bg-white text-rose-950 border-white'
                                      : 'bg-cream text-slate-900 border-rose-300 focus:border-rose-500'
                                  }`}
                                />
                                <span
                                  className={`text-[10px] font-bold ${
                                    preset?.redFlag ? 'text-white' : 'text-rose-800'
                                  }`}
                                >
                                  hr{hoursPersisted === 1 ? '' : 's'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSymptomDurationHours(
                                      symId,
                                      hoursPersisted < 1 ? 1 : hoursPersisted + 1,
                                      true
                                    )
                                  }
                                  aria-label={`Increase hours for ${symId}`}
                                  className={`w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                    preset?.redFlag
                                      ? 'bg-rose-700 hover:bg-rose-800 text-white border-rose-400'
                                      : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200'
                                  }`}
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Filtered Physical Symptoms Grid */}
                {(() => {
                  const q = symptomSearchQuery.trim().toLowerCase();
                  const checkedList = currentDailyLog.symptoms || [];
                  const filteredSymptoms = SYMPTOM_ITEMS.filter((item) => {
                    const matchesCategory =
                      symptomCategoryFilter === 'ALL'
                        ? true
                        : symptomCategoryFilter === 'SELECTED'
                        ? checkedList.includes(item.id)
                        : item.category === symptomCategoryFilter;
                    if (!matchesCategory) return false;
                    if (!q) return true;
                    const haystack = `${item.id} ${item.category} ${item.keywords}`.toLowerCase();
                    return haystack.includes(q);
                  });

                  if (filteredSymptoms.length === 0) {
                    const cleanCustom = symptomSearchQuery.trim();
                    return (
                      <div className="rounded-2xl bg-cream border border-dashed border-rose-300 p-4 text-center space-y-2.5">
                        <p className="text-xs font-semibold text-slate-700">
                          No matching symptoms found{q ? ` for "${symptomSearchQuery.trim()}"` : ' in this filter'}.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {cleanCustom.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                toggleSymptom(cleanCustom, 2, 3);
                                setSymptomSearchQuery('');
                                setSymptomCategoryFilter('ALL');
                                showToast(`📌 Logged custom symptom "${cleanCustom}" (Sev 3/5 · 2 hrs) for ${formatShortMonthDay(selectedDateStr)}!`, 'success');
                              }}
                              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                            >
                              ➕ Log &ldquo;{cleanCustom}&rdquo; as Custom Symptom
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setSymptomSearchQuery('');
                              setSymptomCategoryFilter('ALL');
                            }}
                            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs transition-all cursor-pointer"
                          >
                            Show All {SYMPTOM_ITEMS.length} Symptoms
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const severityLabelsShort: Record<number, string> = {
                    1: 'Very Mild',
                    2: 'Mild',
                    3: 'Moderate',
                    4: 'Strong',
                    5: 'Severe',
                  };

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {filteredSymptoms.map((item) => {
                        const checked = checkedList.includes(item.id);
                        const hoursPersisted = currentDailyLog.symptomDurations?.[item.id] ?? 2;
                        const severityLevel =
                          currentDailyLog.intensity?.[item.id] ??
                          (item.id === 'Severe Pain' ? 5 : 3);
                        const style = checked
                          ? item.redFlag
                            ? 'bg-rose-600 text-white border-rose-700 shadow-xs font-bold'
                            : 'bg-rose-100 text-rose-900 border-rose-400 font-bold'
                          : 'bg-cream hover:bg-rose-50/60 text-slate-700 border-slate-200';
                        return (
                          <div
                            key={item.id}
                            className={`rounded-2xl border transition-all flex flex-col justify-between ${style}`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleSymptom(item.id)}
                              className="w-full p-3 text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 truncate">
                                  <span className="text-base shrink-0">{item.emoji}</span>
                                  <span className="truncate">{item.id}</span>
                                </div>
                                <span
                                  className={`text-[10px] block mt-0.5 ${
                                    checked
                                      ? item.redFlag
                                        ? 'text-rose-100'
                                        : 'text-rose-700'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  {item.category}
                                  {item.redFlag ? ' · Clinical Alert' : ''}
                                  {checked
                                    ? ` · 📊 Sev ${severityLevel}/5 · ⏱️ ${hoursPersisted}h`
                                    : ''}
                                </span>
                              </div>
                              <span className="shrink-0 text-sm font-extrabold">
                                {checked ? '✓' : '+'}
                              </span>
                            </button>

                            {/* Inline Severity (1-5) & Persistence Duration (Hours) Selector when Symptom is Selected */}
                            {checked && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`px-3 pb-3 pt-2 border-t text-[11px] space-y-2 ${
                                  item.redFlag
                                    ? 'border-rose-500/60 bg-rose-700/40'
                                    : 'border-rose-200/80 bg-white/75'
                                } rounded-b-2xl`}
                              >
                                {/* Severity 1-5 Scale */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={`font-extrabold ${
                                        item.redFlag ? 'text-rose-100' : 'text-rose-900'
                                      }`}
                                    >
                                      📊 Severity (1–5):
                                    </span>
                                    <span
                                      className={`text-[10px] font-extrabold ${
                                        item.redFlag ? 'text-white' : 'text-rose-700'
                                      }`}
                                    >
                                      {severityLevel}/5 · {severityLabelsShort[severityLevel]}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-5 gap-1">
                                    {[1, 2, 3, 4, 5].map((lvl) => {
                                      const isSelectedLvl = severityLevel === lvl;
                                      return (
                                        <button
                                          key={lvl}
                                          type="button"
                                          onClick={() => setSymptomIntensity(item.id, lvl, true)}
                                          aria-label={`Set ${item.id} severity to ${lvl} out of 5`}
                                          title={`${lvl}/5 — ${severityLabelsShort[lvl]}`}
                                          className={`py-1 rounded-lg font-extrabold text-[11px] border transition-all cursor-pointer tabular-nums ${
                                            isSelectedLvl
                                              ? item.redFlag
                                                ? 'bg-white text-rose-900 border-white shadow-2xs'
                                                : lvl >= 4
                                                ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                                                : 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                              : item.redFlag
                                              ? 'bg-rose-800/70 hover:bg-rose-800 text-rose-100 border-rose-400/50'
                                              : 'bg-white hover:bg-rose-100 text-rose-900 border-rose-200'
                                          }`}
                                        >
                                          {lvl}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <div
                                    className={`flex items-center justify-between text-[9px] font-semibold px-0.5 ${
                                      item.redFlag ? 'text-rose-100/90' : 'text-slate-500'
                                    }`}
                                  >
                                    <span>1 · Mild</span>
                                    <span>3 · Moderate</span>
                                    <span>5 · Severe</span>
                                  </div>
                                </div>

                                {/* Persistence Duration (Hours) */}
                                <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-rose-200/50">
                                  <span
                                    className={`font-extrabold ${
                                      item.redFlag ? 'text-rose-100' : 'text-rose-900'
                                    }`}
                                  >
                                    ⏱️ Persisted (Hours):
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSymptomDurationHours(
                                          item.id,
                                          hoursPersisted <= 1 ? 0.5 : hoursPersisted - 1,
                                          true
                                        )
                                      }
                                      className={`w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                        item.redFlag
                                          ? 'bg-rose-800 text-white border-rose-400'
                                          : 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300'
                                      }`}
                                    >
                                      −
                                    </button>
                                    <input
                                      type="number"
                                      min={0.5}
                                      max={24}
                                      step={0.5}
                                      value={hoursPersisted}
                                      onChange={(e) =>
                                        setSymptomDurationHours(
                                          item.id,
                                          Number(e.target.value),
                                          false
                                        )
                                      }
                                      aria-label={`Hours ${item.id} persisted`}
                                      className={`w-12 px-1 py-0.5 rounded-lg border text-center text-xs font-extrabold tabular-nums outline-none ${
                                        item.redFlag
                                          ? 'bg-white text-rose-950 border-white'
                                          : 'bg-white text-slate-900 border-rose-300'
                                      }`}
                                    />
                                    <span
                                      className={`text-[10px] font-bold ${
                                        item.redFlag ? 'text-white' : 'text-rose-800'
                                      }`}
                                    >
                                      hrs
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSymptomDurationHours(
                                          item.id,
                                          hoursPersisted < 1 ? 1 : hoursPersisted + 1,
                                          true
                                        )
                                      }
                                      className={`w-6 h-6 rounded-lg font-extrabold text-xs flex items-center justify-center border cursor-pointer ${
                                        item.redFlag
                                          ? 'bg-rose-800 text-white border-rose-400'
                                          : 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300'
                                      }`}
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-1">
                                  {[1, 2, 4, 8, 12, 24].map((presetHr) => {
                                    const isHrSelected = hoursPersisted === presetHr;
                                    return (
                                      <button
                                        key={presetHr}
                                        type="button"
                                        onClick={() =>
                                          setSymptomDurationHours(item.id, presetHr, true)
                                        }
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition-all cursor-pointer tabular-nums ${
                                          isHrSelected
                                            ? item.redFlag
                                              ? 'bg-white text-rose-900 border-white'
                                              : 'bg-rose-600 text-white border-rose-700'
                                            : item.redFlag
                                            ? 'bg-rose-800/70 hover:bg-rose-800 text-rose-100 border-rose-400/50'
                                            : 'bg-white hover:bg-rose-100 text-rose-800 border-rose-200'
                                        }`}
                                      >
                                        {presetHr}h
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                  </div>
                )}
              </div>

              {/* Student Daily Wins Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-sage-800 mb-2.5">
                  3. Student Daily Wins (Fights Inflammation)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {HABIT_ITEMS.map((item) => {
                    const checked = (currentDailyLog.habits || []).includes(item.id);
                    const style = checked
                      ? 'bg-sage-600 text-white border-sage-800 font-bold shadow-xs'
                      : 'bg-cream hover:bg-sage-50 text-slate-700 border-slate-200';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleHabit(item.id)}
                        className={`p-3 rounded-2xl border text-left text-xs font-semibold flex items-center justify-between transition-all ${style}`}
                      >
                        <span>
                          {item.emoji} {item.id}
                        </span>
                        <span>{checked ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Daily Notes */}
              <div>
                <label
                  htmlFor="dailyNotesInput"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  4. Personal Notes for {formatHumanDate(selectedDateStr)}
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <textarea
                    id="dailyNotesInput"
                    rows={2}
                    value={dailyNotesInput}
                    onChange={(e) => setDailyNotesInput(e.target.value)}
                    onBlur={() => {
                      if (dailyNotesInput.trim() !== (currentDailyLog.notes || '')) {
                        const currentLog = getDailyLog(selectedDateStr);
                        updateUserData((prev) => ({
                          ...prev,
                          dailyLogs: {
                            ...prev.dailyLogs,
                            [selectedDateStr]: {
                              ...currentLog,
                              notes: dailyNotesInput.trim(),
                            },
                          },
                        }));
                      }
                    }}
                    placeholder="Write down how class went, pain levels, cravings, or questions for the doctor..."
                    className="flex-1 px-4 py-2.5 rounded-2xl border border-slate-200 focus:border-lavender-500 focus:ring-2 focus:ring-lavender-100 outline-none text-xs sm:text-sm text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={saveDailyNotes}
                    className="px-5 py-3 rounded-2xl bg-lavender-500 hover:bg-lavender-700 text-white font-bold text-xs sm:text-sm shrink-0 shadow-xs transition-all"
                  >
                    Save Daily Log 💾
                  </button>
                </div>
              </div>
            </section>

            {/* =====================================================================
                STANDALONE SECTION 4: DAILY CYCLE-STAGE JOURNAL PROMPTS
               ===================================================================== */}
            <div id="standalone-journal-prompts">
              <CycleJournalPromptsSection
                userData={userData}
                selectedDateStr={selectedDateStr}
                metrics={metrics}
                onUpdateUser={updateUserData}
                onSelectDate={(dateStr) => setSelectedDateStr(dateStr)}
                showToast={showToast}
              />
            </div>

            {/* =====================================================================
                STANDALONE SECTION 5: VIRTUAL MILESTONES & CONSISTENCY BADGES
               ===================================================================== */}
            <BadgesMilestonesSection
              userData={userData}
              onNavigateSection={(sec, sub) => {
                handleSelectNavSection(sec);
                if (sub) setActiveTrackerAction(sub);
              }}
              onSimulateStreakDemo={loadSampleStudentData}
            />
          </>
        )}

        {/* TAB 3 (BOTTOM NAV): EMERGENCY PILL TRACKER & SMART PHASE GUIDE */}
        {activeNavTab === 'guide' && (
          <>
            {/* =====================================================================
                STANDALONE SECTION 2: EMERGENCY CONTRACEPTION TRACKER & PILL ADVICE
               ===================================================================== */}
            <section
              id="standalone-emergency-pill"
              className="bg-white rounded-3xl shadow-xs border-2 border-peach-200 p-5 sm:p-6 privacy-sensitive"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-peach-700 block mb-1">
                    💊 Emergency Pill · Date &amp; Time Logger
                  </span>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-800">
                    Emergency Contraception Tracker
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                    Select the exact date and time you took an emergency contraceptive pill (e.g., Postinor-2 / Plan B). Tap the{' '}
                    <strong>💊 Pill Advice</strong> button anytime to view body effects &amp; 21-day follow-up guidance.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-peach-50/60 p-3 rounded-2xl border border-peach-200">
                  <div className="flex flex-col">
                    <div className="flex items-center justify-between mb-1">
                      <label
                        htmlFor="customPillDateTime"
                        className="text-[11px] font-bold uppercase tracking-wider text-peach-700"
                      >
                        Date &amp; Time Taken
                      </label>
                      <button
                        type="button"
                        onClick={() => setCustomPillDateTime(formatDateTimeLocalISO(new Date()))}
                        className="text-[10px] font-bold text-lavender-700 hover:underline"
                      >
                        Set Now
                      </button>
                    </div>
                    <input
                      type="datetime-local"
                      id="customPillDateTime"
                      value={customPillDateTime}
                      onChange={(e) => setCustomPillDateTime(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-peach-300 text-xs sm:text-sm font-bold text-slate-800 bg-white outline-none focus:border-peach-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={logEmergencyPillFromPicker}
                    className="px-4 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm shadow-xs transition-all active:scale-95 flex items-center gap-1.5 self-end"
                  >
                    <span>➕ Log Emergency Pill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowPillAdviceModal(true)}
                    className="px-4 py-3 rounded-2xl bg-gradient-to-r from-peach-500 to-rose-500 hover:from-peach-700 hover:to-rose-700 text-white font-bold text-xs sm:text-sm shadow-md flex items-center gap-2 border-2 border-white ring-2 ring-peach-200 self-end transition-transform active:scale-95"
                    title="Tap to view Emergency Pill Body & Cycle Advice"
                  >
                    <span className="text-lg">💊</span>
                    <span>Pill Advice</span>
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-500 mb-2">
                  Logged Emergency Pill Dates &amp; Times:
                </div>
                {(userData.emergencyPills || []).length === 0 ? (
                  <div className="text-xs text-slate-400 italic">
                    No emergency pills logged yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-28 overflow-y-auto">
                    {(userData.emergencyPills || []).map((item, idx) => {
                      const dt = new Date(item.timestamp);
                      const formatted = dt.toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      });
                      return (
                        <div
                          key={`${item.timestamp}-${idx}`}
                          className="flex items-center justify-between bg-peach-50 border border-peach-200 px-3 py-1.5 rounded-xl text-xs"
                        >
                          <span className="font-semibold text-slate-800 tabular-nums">
                            💊 Taken: {formatted}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeEmergencyPillLog(idx)}
                            className="text-slate-400 hover:text-rose-600 font-bold ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* CLEAR CONTRACEPTIVE MOOD & MONTHLY EMERGENCY PILL LMP RESET CALLOUT + LINK BUTTON */}
              <div className="mt-4 rounded-2xl bg-gradient-to-r from-rose-50 via-peach-50 to-lavender-50 border-2 border-rose-300 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">⚠️</span>
                  <div className="space-y-1">
                    <div className="font-display font-extrabold text-xs sm:text-sm text-rose-950">
                      Contraceptive Mood State: Taking an Emergency Pill in a Month Changes How Your Period Is Found
                    </div>
                    <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                      If you take an <strong>emergency pill in a month</strong>, it can lead to changes in how your period is found (delaying ovulation and shifting your period earlier or later, alongside temporary hormone &amp; mood changes). Please <strong>note the exact date and time down</strong> above, and <strong>re-change your LMP (Last Menstrual Period) start date when you notice your period again</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={jumpToUpdateLmpSection}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🩸</span>
                  <span>Back to Update LMP Start Date →</span>
                </button>
              </div>
            </section>

            {/* =====================================================================
                STANDALONE SECTION 3: BIG BUTTON — SMART PHASE GUIDE & CAMPUS MYTH BUSTER
               ===================================================================== */}
            <section
              id="standalone-phase-guide"
              className="bg-white rounded-3xl shadow-xs border-2 border-sage-200 p-4 sm:p-6"
            >
              {/* BIG INTERACTIVE BUTTON */}
              <button
                type="button"
                onClick={() => setShowSmartPhaseGuide((prev) => !prev)}
                aria-expanded={showSmartPhaseGuide}
                className={`w-full rounded-3xl p-5 sm:p-6 border-2 transition-all cursor-pointer text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:shadow-md active:scale-[0.99] ${
                  showSmartPhaseGuide
                    ? 'bg-gradient-to-r from-sage-700 via-lavender-800 to-slate-900 text-white border-sage-800'
                    : 'bg-gradient-to-r from-sage-50 via-lavender-50/80 to-peach-50 hover:from-sage-100 hover:to-lavender-100 text-slate-900 border-sage-300'
                }`}
              >
                <div className="flex items-start sm:items-center gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 shadow-xs border ${
                      showSmartPhaseGuide
                        ? 'bg-white/15 border-white/25 text-white'
                        : 'bg-white border-sage-200 text-sage-800'
                    }`}
                  >
                    🧠
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                          showSmartPhaseGuide
                            ? 'bg-white/20 text-white'
                            : 'bg-sage-700 text-white'
                        }`}
                      >
                        Current Stage: {PHASE_ADVISOR_DATA[metrics.stageKey].shortName}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          showSmartPhaseGuide
                            ? 'bg-amber-400/20 text-amber-100 border border-amber-300/30'
                            : 'bg-lavender-100 text-lavender-800 border border-lavender-200'
                        }`}
                      >
                        💡 {CAMPUS_MYTHS.length} Campus Myths &amp; Facts
                      </span>
                    </div>
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl leading-snug">
                      Smart Phase Guide &amp; Campus Myth Buster
                    </h2>
                    <p
                      className={`text-xs sm:text-sm mt-0.5 ${
                        showSmartPhaseGuide ? 'text-sage-100' : 'text-slate-600'
                      }`}
                    >
                      Tap to {showSmartPhaseGuide ? 'close' : 'open'} body, mind, pregnancy risk, study advice &amp; campus myth busters
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end shrink-0">
                  <span
                    className={`px-4 py-2.5 rounded-2xl font-display font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition-all ${
                      showSmartPhaseGuide
                        ? 'bg-white text-slate-900'
                        : 'bg-sage-700 text-white'
                    }`}
                  >
                    <span>
                      {showSmartPhaseGuide ? '▲ Hide Phase Guide' : '▼ Open Phase Guide & Myths'}
                    </span>
                  </span>
                </div>
              </button>

              {showSmartPhaseGuide && (
                <div className="mt-5 pt-5 border-t border-sage-100 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-xs sm:text-sm text-slate-600">
                      Body, mind, pregnancy &amp; study advice tailored to your current stage — tap any stage tab below to explore what happens next.
                    </p>
                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveAdvisorStage(metrics.stageKey);
                          showToast(
                            `Synced Phase Guide to your current ${
                              PHASE_ADVISOR_DATA[metrics.stageKey].shortName
                            }.`,
                            'info'
                          );
                        }}
                        className="text-xs font-bold text-sage-800 bg-sage-50 hover:bg-sage-100 border border-sage-200 px-3 py-2 rounded-xl cursor-pointer"
                      >
                        🎯 Sync to My Stage
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(
                      [
                        { key: 'MENSTRUATION', label: '🩸 Menstruation (Days 1–5)' },
                        { key: 'FOLLICULAR', label: '🌱 Follicular (Days 6–11)' },
                        { key: 'OVULATION', label: '🌸 Ovulation (Days 12–16)' },
                        { key: 'LUTEAL', label: '🌙 Luteal (Days 17–28)' },
                      ] as Array<{ key: StageKey; label: string }>
                    ).map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        onClick={() => setActiveAdvisorStage(st.key)}
                        className={`py-2.5 px-3 rounded-xl text-xs transition-all cursor-pointer ${
                          activeAdvisorStage === st.key
                            ? 'font-extrabold border-2 border-lavender-700 bg-lavender-700 text-white shadow-xs'
                            : 'font-bold border border-slate-200 bg-cream text-slate-700 hover:bg-lavender-50'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
                      className={`rounded-2xl p-4 privacy-sensitive ${
                        activeAdvisorStage === 'OVULATION'
                          ? 'border-2 border-rose-500 bg-rose-100/90 shadow-xs'
                          : 'border-2 border-rose-200 bg-rose-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-display font-extrabold text-base text-rose-900 mb-1.5">
                        <span>🤰</span>
                        <span>Pregnancy Risk in This Stage</span>
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-rose-900 leading-relaxed">
                        {advisorInfo.pregnancy}
                      </p>
                    </div>

                    <div className="rounded-2xl p-4 border border-sage-200 bg-sage-50/70">
                      <div className="flex items-center gap-2 font-display font-extrabold text-base text-sage-800 mb-1.5">
                        <span>💪</span>
                        <span>Body, Energy &amp; Smartwatch HRV</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                        {advisorInfo.body}
                      </p>
                    </div>

                    <div className="rounded-2xl p-4 border border-lavender-200 bg-lavender-50/70">
                      <div className="flex items-center gap-2 font-display font-extrabold text-base text-lavender-900 mb-1.5">
                        <span>🧠</span>
                        <span>Mind, Mood &amp; Emotions</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                        {advisorInfo.mind}
                      </p>
                    </div>

                    <div className="rounded-2xl p-4 border border-peach-200 bg-peach-50/70">
                      <div className="flex items-center gap-2 font-display font-extrabold text-base text-peach-700 mb-1.5">
                        <span>📚</span>
                        <span>College Study &amp; Exam Sync</span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                        {advisorInfo.study}
                      </p>
                    </div>
                  </div>

                  {/* Campus Myth vs. Fact */}
                  <div className="rounded-2xl bg-lavender-50/70 border border-lavender-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">💡</span>
                        <span className="font-display font-extrabold text-sm text-slate-900">
                          Campus Myth vs. Fact ({currentMythIndex + 1}/{CAMPUS_MYTHS.length})
                        </span>
                      </div>
                      <div className="text-xs font-bold text-rose-700">
                        {CAMPUS_MYTHS[currentMythIndex].myth}
                      </div>
                      <div className="text-xs text-slate-700 leading-relaxed">
                        {CAMPUS_MYTHS[currentMythIndex].fact}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentMythIndex(
                            (prev) => (prev - 1 + CAMPUS_MYTHS.length) % CAMPUS_MYTHS.length
                          )
                        }
                        className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer"
                      >
                        ⬅️ Prev
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentMythIndex((prev) => (prev + 1) % CAMPUS_MYTHS.length)
                        }
                        className="px-4 py-2 rounded-xl bg-lavender-600 hover:bg-lavender-800 text-white font-bold text-xs cursor-pointer"
                      >
                        Next Tip ➡️
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {/* TAB 4 (BOTTOM NAV): WELLNESS FUEL, HYDRATION & 6-MONTH ANALYTICS */}
        {activeNavTab === 'analytics' && (
          <>
            {/* =====================================================================
                QUICK ACTION BUTTONS FOR BIG ANALYTICS TABLES & EXTRA TOOLS
               ===================================================================== */}
            <section className="bg-white rounded-3xl shadow-xs border-2 border-lavender-200 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-700 block">
                    ✨ Interactive Wellness &amp; Analytics Tables
                  </span>
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                    Nutrition, Hydration &amp; Cycle Analytics Action Buttons
                  </h2>
                  <p className="text-xs text-slate-600">
                    Tap any button below to open that table or tracker. Tap it again (or click Close) to tuck it away!
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeTrackerAction && (
                    <button
                      type="button"
                      onClick={() => setActiveTrackerAction(null)}
                      className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs transition-all cursor-pointer"
                    >
                      ✕ Close Open Section
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTrackerAction((prev) => (prev === 'all' ? null : 'all'))
                    }
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs transition-all cursor-pointer"
                  >
                    {activeTrackerAction === 'all' ? '📁 Collapse All' : '📂 Show All'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                {[
                  {
                    id: 'badges' as const,
                    emoji: '🏅',
                    title: 'Badges & Streaks',
                    badge: `${badgeEvaluation.unlockedCount}/${badgeEvaluation.totalCount} · 🔥 ${badgeEvaluation.currentStreakDays}d`,
                    activeClass: 'bg-amber-600 text-white border-amber-800 shadow-md',
                    idleClass:
                      'bg-amber-50/80 hover:bg-amber-100/80 text-slate-800 border-amber-300',
                  },
                  {
                    id: 'nutrition' as const,
                    emoji: '🍫',
                    title: 'Snacks & Cravings',
                    badge: `${(currentDailyLog.loggedSnacks || []).length}/3 ${stageInfo.shortName}`,
                    activeClass: 'bg-peach-700 text-white border-peach-800 shadow-md',
                    idleClass:
                      'bg-peach-50/70 hover:bg-peach-100/80 text-slate-800 border-peach-200',
                  },
                  {
                    id: 'hydration' as const,
                    emoji: '💧',
                    title: 'Water Tracker',
                    badge: `${currentDailyLog.waterGlasses || 0}/8 Glasses`,
                    activeClass: 'bg-sky-700 text-white border-sky-800 shadow-md',
                    idleClass: 'bg-sky-50/70 hover:bg-sky-100/80 text-slate-800 border-sky-200',
                  },
                  {
                    id: 'trends' as const,
                    emoji: '📊',
                    title: '6-Mo Cycle Trends',
                    badge: `${todayMetrics.avgCycleLength}d Avg Chart`,
                    activeClass: 'bg-lavender-800 text-white border-lavender-950 shadow-md',
                    idleClass:
                      'bg-lavender-50/70 hover:bg-lavender-100/80 text-slate-800 border-lavender-200',
                  },
                  {
                    id: 'correlation' as const,
                    emoji: '💜',
                    title: 'Stage Pattern Table',
                    badge: 'Mood × Stage',
                    activeClass: 'bg-plum-900 text-white border-lavender-900 shadow-md',
                    idleClass:
                      'bg-lavender-50/70 hover:bg-lavender-100/80 text-slate-800 border-lavender-200',
                  },
                  {
                    id: 'videos' as const,
                    emoji: '🎥',
                    title: 'Expert Videos',
                    badge: '3 Video Guides',
                    activeClass: 'bg-slate-800 text-white border-slate-900 shadow-md',
                    idleClass:
                      'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200',
                  },
                ].map((btn) => {
                  const isActive =
                    activeTrackerAction === btn.id || activeTrackerAction === 'all';
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() =>
                        setActiveTrackerAction((prev) => (prev === btn.id ? null : btn.id))
                      }
                      className={`p-3.5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isActive ? btn.activeClass : btn.idleClass
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xl leading-none">{btn.emoji}</span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-white/90 text-slate-700 border border-slate-200/70'
                          }`}
                        >
                          {isActive ? 'Open ✓' : 'Open'}
                        </span>
                      </div>
                      <div>
                        <div className="font-display font-extrabold text-xs sm:text-sm leading-snug">
                          {btn.title}
                        </div>
                        <div
                          className={`text-[11px] font-semibold mt-0.5 truncate ${
                            isActive ? 'text-white/90' : 'text-slate-500'
                          }`}
                        >
                          {btn.badge}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ACTION PANEL: VIRTUAL BADGES & MILESTONES */}
            {(activeTrackerAction === 'badges' || activeTrackerAction === 'all') && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTrackerAction(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    ✕ Close Badges &amp; Milestones
                  </button>
                </div>
                <BadgesMilestonesSection
                  userData={userData}
                  onNavigateSection={(sec, sub) => {
                    handleSelectNavSection(sec);
                    if (sub) setActiveTrackerAction(sub);
                  }}
                  onSimulateStreakDemo={loadSampleStudentData}
                />
              </div>
            )}

            {/* ACTION PANEL: NUTRITION & CRAVING SUPPORT */}
            {(activeTrackerAction === 'nutrition' || activeTrackerAction === 'all') && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTrackerAction(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    ✕ Close Nutrition &amp; Cravings
                  </button>
                </div>
                <NutritionCravingSupportCard
                  userData={userData}
                  selectedDateStr={selectedDateStr}
                  currentStageKey={metrics.stageKey}
                  cycleDay={metrics.cycleDay}
                  onToggleSnackForDate={toggleSnackForDate}
                  onSelectCravingForDate={selectCravingForDate}
                />
              </div>
            )}

            {/* ACTION PANEL: HYDRATION TRACKER */}
            {(activeTrackerAction === 'hydration' || activeTrackerAction === 'all') && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTrackerAction(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    ✕ Close Water Tracker
                  </button>
                </div>
                <HydrationTrackerWidget
                  userData={userData}
                  selectedDateStr={selectedDateStr}
                  currentStageKey={metrics.stageKey}
                  onLogWaterForDate={(dateStr, nextGlasses) => {
                    setWaterGlassesForDate(dateStr, nextGlasses);
                    showToast(
                      `💧 Hydration updated: ${nextGlasses}/8 glasses (${((nextGlasses * 250) / 1000).toFixed(2)}L) for ${formatShortMonthDay(dateStr)}!`,
                      'info'
                    );
                  }}
                  onSelectDate={(dateStr) => setSelectedDateStr(dateStr)}
                />
              </div>
            )}

            {/* ACTION PANEL: 6-MONTH CYCLE TRENDS */}
            {(activeTrackerAction === 'trends' || activeTrackerAction === 'all') && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTrackerAction(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    ✕ Close 6-Month Cycle Trends
                  </button>
                </div>
                <CycleTrendsSection
                  periods={userData.periods || []}
                  avgCycleLength={metrics.avgCycleLength}
                  avgPeriodDuration={metrics.avgPeriodDuration}
                />
              </div>
            )}

            {/* ACTION PANEL: MOOD × CYCLE STAGE CORRELATION */}
            {(activeTrackerAction === 'correlation' || activeTrackerAction === 'all') && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveTrackerAction(null)}
                    className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs cursor-pointer shadow-2xs"
                  >
                    ✕ Close Stage Pattern Table
                  </button>
                </div>
                <MoodStageCorrelationSection
                  userData={userData}
                  currentStageKey={metrics.stageKey}
                  onSelectDate={(dateStr) => {
                    setSelectedDateStr(dateStr);
                    showToast(`Viewing daily check-in for ${formatHumanDate(dateStr)}`, 'info');
                  }}
                />
              </div>
            )}

            {/* ACTION PANEL: EDUCATIONAL VIDEO RESOURCES */}
            {(activeTrackerAction === 'videos' || activeTrackerAction === 'all') && (
              <section className="bg-gradient-to-r from-lavender-100 via-peach-50 to-sage-100 rounded-3xl shadow-xs border border-lavender-200 p-5 sm:p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider text-lavender-900">
                        🎥 Science &amp; Expert Education
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveTrackerAction(null)}
                        className="px-3 py-1 rounded-xl bg-white/80 hover:bg-white text-slate-700 font-bold text-xs cursor-pointer"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                      Learn About Your Hormones, Mood &amp; The Pill
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-700 mt-0.5">
                      Watch world-leading doctors and researchers break down periods, fertility, PCOS, endometriosis, and how hormonal pills affect your brain.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row flex-wrap gap-3 shrink-0">
                    <a
                      href="https://youtu.be/Hp-bXOTuQck?si=A_T0dngDLV8ZYBlq"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center gap-2 transition-all"
                    >
                      <span className="text-base">🌸</span>
                      <span>Watch: Relieve Period Cramps</span>
                    </a>

                    <a
                      href="https://youtu.be/kizDk8idpT8?si=vEYQ294JII4hSX3R"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-2xl bg-white hover:bg-lavender-50 text-slate-900 font-bold text-xs sm:text-sm shadow-xs border border-lavender-200 flex items-center gap-2 transition-all"
                    >
                      <span className="text-base">▶️</span>
                      <span>Watch: Women&apos;s Health &amp; Cycle Experts</span>
                    </a>

                    <a
                      href="https://youtu.be/4r9zkXiE8NY?si=R0ACvRHhjm3HCvFj"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-bold text-xs sm:text-sm shadow-xs flex items-center gap-2 transition-all"
                    >
                      <span className="text-base">🎬</span>
                      <span>Watch: How The Pill Changes Hormones &amp; Mood (11m)</span>
                    </a>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ABOUT / CONTACT CREATOR & SUPPORT INQUIRY SECTION */}
        <section className="bg-white rounded-3xl shadow-xs border-2 border-lavender-200 p-5 sm:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-800 block">
                🌸 About &amp; Contact Creator
              </span>
              <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                Created by {CREATOR_NAME}
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                Need help with your 30-day subscription, Orange Money verification, or have a support inquiry? Reach out directly to the creator anytime.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <a
                href={`mailto:${CREATOR_EMAIL}?subject=Contact%20Creator%20-%20BloomCampus`}
                className="px-4 py-2.5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-xs transition-all flex items-center gap-2"
              >
                <span>✉️</span>
                <span>Contact Creator ({CREATOR_EMAIL})</span>
              </a>
              <button
                type="button"
                onClick={() => setShowAboutContactModal(true)}
                className="px-4 py-2.5 rounded-2xl bg-cream hover:bg-lavender-50 text-slate-800 border border-lavender-200 font-bold text-xs sm:text-sm transition-all cursor-pointer"
              >
                💬 Send Support Inquiry
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER & QUICK PREVIEW CONTROLS WITH CREATOR BRANDING */}
      <footer className="bg-white border-t border-slate-200/80 py-5 px-4 pb-24 mt-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 text-xs text-slate-600">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-slate-900">Created by {CREATOR_NAME}</strong>
              <span aria-hidden="true">·</span>
              <a
                href={`mailto:${CREATOR_EMAIL}?subject=Contact%20Creator%20-%20BloomCampus`}
                className="font-bold text-lavender-700 hover:underline"
              >
                Contact Creator: {CREATOR_EMAIL}
              </a>
              <span aria-hidden="true">·</span>
              <span>Sidratu Beauty Therapy · 101 Jomo Kenyatta Road, Freetown</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPaywallPreview(true);
                  setShowPaywallModal(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-800 font-bold border border-orange-200"
              >
                🎁 2-Week Free Access &amp; Renewal
              </button>
              <button
                type="button"
                onClick={loadSampleStudentData}
                className="px-3 py-1.5 rounded-xl bg-sage-50 hover:bg-sage-100 text-sage-800 font-bold border border-sage-200"
              >
                ✨ Load Sample Data
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* PERSISTENT BOTTOM NAVIGATION BAR FOR SINGLE-TAP SECTION SWITCHING */}
      <BottomNavBar
        activeSection={activeNavTab}
        onSelectSection={handleSelectNavSection}
        cycleDay={todayMetrics.cycleDay}
        hasLoggedMoodToday={Boolean(userData.dailyLogs?.[todayStr]?.mood)}
        waterGlassesToday={userData.dailyLogs?.[todayStr]?.waterGlasses || 0}
        isDarkMode={isDarkMode}
      />

      {/* ===================================================================== */}
      {/* MODAL 1: HIDDEN EMERGENCY PILL ADVICE MODAL (💊)                      */}
      {/* ===================================================================== */}
      {showPillAdviceModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-peach-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-peach-100 border border-peach-200 flex items-center justify-center text-2xl">
                  💊
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-peach-700">
                    Emergency Contraception Guide
                  </span>
                  <h3 className="font-display font-extrabold text-xl text-slate-900">
                    How the Pill Affects Your Body &amp; Cycle
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPillAdviceModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-rose-50 border-2 border-rose-400 p-4 mb-4">
              <div className="font-display font-extrabold text-sm sm:text-base text-rose-900">
                📅 Follow-Up: Take a pregnancy test on {formattedFollowUp} if your period hasn't arrived or is more than 7 days late.
              </div>
              <p className="text-xs text-rose-700 mt-1">
                {hasLoggedPill
                  ? `Calculated 21 days from your last logged pill on ${lastPillBaseDate.toLocaleString(
                      'en-US',
                      { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
                    )}.`
                  : 'Calculated 21 days from today (log a pill timestamp anytime to personalize this date).'}
              </p>
            </div>

            <ul className="space-y-3 text-xs sm:text-sm text-slate-700 mb-5">
              <li className="flex items-start gap-2.5 bg-rose-50/90 p-3.5 rounded-2xl border-2 border-rose-300">
                <span className="text-base">📆</span>
                <div className="space-y-2">
                  <div>
                    <strong>Monthly Emergency Pill &amp; LMP Reset Rule:</strong> If you take an emergency pill in a month, it can lead to changes in how your period is found (arriving a few days early or up to a week late because emergency pills delay ovulation). Always <strong>note the date and time down</strong> and <strong>re-change your LMP (Last Menstrual Period) start date when you notice your period again</strong>.
                  </div>
                  <button
                    type="button"
                    onClick={jumpToUpdateLmpSection}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs shadow-xs transition-all cursor-pointer"
                  >
                    <span>🩸</span>
                    <span>Back to Update LMP Start Date →</span>
                  </button>
                </div>
              </li>
              <li className="flex items-start gap-2.5 bg-cream p-3 rounded-2xl border border-slate-200/80">
                <span className="text-base">🩹</span>
                <div>
                  <strong>Short-Term Body Effects:</strong> Light spotting/bleeding, temporary fatigue, mild lower-belly cramping, breast tenderness, or mild nausea for a few days is completely normal.
                </div>
              </li>
              <li className="flex items-start gap-2.5 bg-peach-50/70 p-3 rounded-2xl border border-peach-200">
                <span className="text-base">⏱️</span>
                <div>
                  <strong>The 2-Hour Rule:</strong> If you vomit within <strong>2 hours</strong> of taking the emergency pill, your body may not have absorbed it—speak to a pharmacist or campus clinic as you may need another dose.
                </div>
              </li>
              <li className="flex items-start gap-2.5 bg-lavender-50/80 p-3 rounded-2xl border border-lavender-200">
                <span className="text-base">🧠</span>
                <div>
                  <strong>How Hormonal Pills Affect Your Mind &amp; Body:</strong> Hormonal contraceptives and emergency pills use synthetic progestin to pause ovulation and lower natural estrogen and free testosterone—which can temporarily shift your mood, stress resilience, energy, and attraction.
                </div>
              </li>
            </ul>

            <a
              href="https://youtu.be/4r9zkXiE8NY?si=R0ACvRHhjm3HCvFj"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-lavender-700 to-rose-600 hover:from-lavender-900 hover:to-rose-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all mb-3"
            >
              <span>▶️</span>
              <span>Watch: How The Pill Affects Your Brain &amp; Hormones (11 min)</span>
            </a>

            <button
              type="button"
              onClick={() => setShowPillAdviceModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
            >
              Got It, Close Advice
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* FULL-SCREEN MONTHLY & 3-MONTH HORIZON CALENDAR MODAL                  */}
      {/* ===================================================================== */}
      <FullScreenCalendarModal
        isOpen={showFullScreenCalendar}
        onClose={() => setShowFullScreenCalendar(false)}
        userData={userData}
        todayMetrics={todayMetrics}
        calendarMonth={calendarMonth}
        calendarYear={calendarYear}
        selectedDateStr={selectedDateStr}
        onChangeMonth={changeCalendarMonth}
        onJumpToMonthYear={(m, y) => {
          setCalendarMonth(m);
          setCalendarYear(y);
        }}
        onJumpToToday={jumpToToday}
        onSelectDate={(dStr) => setSelectedDateStr(dStr)}
        onSetAsPeriodStart={(dStr) => {
          setPeriodStartInput(dStr);
          showToast(
            `🩸 Period Start Date set to ${formatHumanDate(dStr)}. Tap "Save Period Dates" to record!`,
            'info'
          );
        }}
        onSetAsPeriodEnd={(dStr) => {
          setPeriodEndInput(dStr);
          showToast(
            `✨ Period End Date set to ${formatHumanDate(dStr)}. Tap "Save Period Dates" to record!`,
            'info'
          );
        }}
      />

      {/* ===================================================================== */}
      {/* MODAL: VIRTUAL BADGES & MILESTONES SHOWCASE (🏅)                      */}
      {/* ===================================================================== */}
      {showBadgesModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-cream rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl border-2 border-amber-300 max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                🏅 Virtual Milestones &amp; Consistency Rewards
              </span>
              <button
                type="button"
                onClick={() => setShowBadgesModal(false)}
                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200 cursor-pointer"
              >
                Close ✕
              </button>
            </div>
            <BadgesMilestonesSection
              userData={userData}
              defaultExpanded={true}
              onNavigateSection={(sec, sub) => {
                setShowBadgesModal(false);
                handleSelectNavSection(sec);
                if (sub) setActiveTrackerAction(sub);
              }}
              onSimulateStreakDemo={loadSampleStudentData}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CLINIC SUMMARY MODAL (🩺)                                    */}
      {/* ===================================================================== */}
      {showClinicSummaryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            id="clinic-printable-report"
            className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border border-sage-200 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-sage-100 border border-sage-200 flex items-center justify-center text-2xl shrink-0">
                  🩺
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-sage-800 block">
                    Healthcare Provider &amp; Clinical Report
                  </span>
                  <h3 className="font-display font-extrabold text-xl text-slate-900">
                    Campus &amp; Sidratu Clinic Summary
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    101 Jomo Kenyatta Road, Freetown • Generated {formatHumanDate(todayStr)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClinicSummaryModal(false)}
                className="no-print w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 shrink-0"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-700 mb-5">
              <div className="p-3.5 rounded-2xl bg-sage-50 border border-sage-200">
                <div className="font-bold text-slate-900">
                  Patient Name: {userData.name || 'Kumba Hannah Kaingbanja'} · Age:{' '}
                  {userData.age ? `${userData.age} yrs` : 'Not specified'} · Email: {userData.email}
                </div>
                <div className="text-xs text-slate-600 mt-1 tabular-nums">
                  Average Cycle Length: <strong>{todayMetrics.avgCycleLength} Days</strong> · Avg Bleed:{' '}
                  <strong>{todayMetrics.avgPeriodDuration} Days</strong> · Current Stage:{' '}
                  <strong>
                    {PHASE_ADVISOR_DATA[todayMetrics.stageKey].shortName} (Day {todayMetrics.cycleDay})
                  </strong>
                </div>
                <div className="text-xs text-slate-600 mt-0.5 tabular-nums">
                  Next Predicted Period:{' '}
                  <strong>
                    {todayMetrics.nextPeriodDateStr
                      ? formatHumanDate(todayMetrics.nextPeriodDateStr)
                      : 'Pending log'}
                  </strong>{' '}
                  · Pattern Status:{' '}
                  <strong>
                    {todayMetrics.isIrregular ? 'Variable / Irregular Flagged' : 'Regular Rhythm'}
                  </strong>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-cream border border-slate-200">
                <div className="font-bold text-slate-800 mb-1">
                  🩸 Last Recorded Period Start &amp; End Dates:
                </div>
                <ul className="space-y-1 text-xs text-slate-700 tabular-nums">
                  {sortedPeriods.length === 0 ? (
                    <li>No periods logged yet</li>
                  ) : (
                    [...sortedPeriods]
                      .reverse()
                      .slice(0, 6)
                      .map((p) => {
                        const hasEnd = Boolean(p.endDate && p.endDate >= p.startDate);
                        const durLabel = hasEnd
                          ? ` (${diffDays(p.startDate, p.endDate!) + 1} days)`
                          : ' (Ongoing)';
                        return (
                          <li key={p.startDate} className="font-semibold">
                            • Start: {formatHumanDate(p.startDate)} — End:{' '}
                            {hasEnd ? formatHumanDate(p.endDate) : 'Ongoing'}
                            {durLabel}
                          </li>
                        );
                      })
                  )}
                </ul>
              </div>

              <div className="p-3.5 rounded-2xl bg-cream border border-slate-200">
                <div className="font-bold text-slate-800 mb-1">
                  💊 Recent Emergency Contraception Dates:
                </div>
                <ul className="space-y-1 text-xs text-slate-700 tabular-nums">
                  {(userData.emergencyPills || []).length === 0 ? (
                    <li>None logged</li>
                  ) : (
                    (userData.emergencyPills || []).slice(0, 3).map((p, i) => (
                      <li key={i}>
                        •{' '}
                        {new Date(p.timestamp).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </li>
                    ))
                  )}
                </ul>
              </div>

              <div className="p-3.5 rounded-2xl bg-cream border border-slate-200">
                <div className="font-bold text-slate-800 mb-1">📋 Logged Physical Symptoms:</div>
                <p className="text-xs text-slate-700">{topSymptomsText}</p>
              </div>

              <div className="p-3.5 rounded-2xl bg-cream border border-slate-200">
                <div className="font-bold text-slate-800 mb-1">🧠 Stage-Linked Mood History:</div>
                <p className="text-xs text-slate-700">{topMoodsText}</p>
              </div>
            </div>

            <div className="no-print space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const fileName = exportClinicSummaryToPDF(
                        userData,
                        todayMetrics,
                        sortedPeriods
                      );
                      showToast(
                        `📄 Downloaded printable PDF report (${fileName})!`,
                        'success'
                      );
                    } catch {
                      showToast('Could not generate PDF file. Try using Print Report.', 'warning');
                    }
                  }}
                  className="py-3 px-4 rounded-2xl bg-plum-900 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>📄</span>
                  <span>Download Printable PDF Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="py-3 px-4 rounded-2xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-extrabold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🖨️</span>
                  <span>Print Clinical Report</span>
                </button>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const summaryStr =
                      `Patient: ${userData.name} (Age: ${userData.age || 'N/A'})\n` +
                      `Avg Cycle: ${todayMetrics.avgCycleLength}d | Avg Bleed: ${todayMetrics.avgPeriodDuration}d\n` +
                      `Current Stage: ${PHASE_ADVISOR_DATA[todayMetrics.stageKey].shortName} (Day ${todayMetrics.cycleDay})\n` +
                      `Symptoms: ${topSymptomsText}\n` +
                      `Moods: ${topMoodsText}`;
                    copyTextToClipboard(
                      summaryStr,
                      '🩺 Clinic summary copied! Ready to share with your doctor.'
                    );
                  }}
                  className="flex-1 py-2.5 px-4 rounded-2xl bg-sage-600 hover:bg-sage-800 text-white font-bold text-xs sm:text-sm shadow-xs transition-all"
                >
                  📋 Copy Summary Text
                </button>
                <button
                  type="button"
                  onClick={() => setShowClinicSummaryModal(false)}
                  className="py-2.5 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: 2-WEEK FREE ACCESS & ORANGE MONEY RENEWAL SCREEN             */}
      {/* ===================================================================== */}
      {(showPaywallModal || isAccountLocked) && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border-2 border-lavender-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-peach-100 text-peach-800">
                {trialInfo.status === 'pending_verification'
                  ? '⏳ Pending Owner Verification'
                  : trialInfo.status === 'expired'
                  ? '🔒 2-Week Free Access Expired — Renewal'
                  : '🎁 2-Week Free Access · Orange Money Renewal'}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (trialInfo.status === 'pending_verification') {
                    handleRemovePendingVerification();
                  } else {
                    setShowPaywallModal(false);
                  }
                }}
                title="Close / Remove Pending Verification"
                aria-label="Close or remove Pending Owner Verification"
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-extrabold text-sm flex items-center justify-center border border-slate-200 transition-all shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* IF PENDING OWNER VERIFICATION */}
            {trialInfo.status === 'pending_verification' ? (
              <div className="space-y-4">
                <div className="relative rounded-2xl bg-orange-50 border-2 border-orange-400 p-4 pr-10 space-y-2">
                  <button
                    type="button"
                    onClick={() => handleRemovePendingVerification()}
                    title="Remove Pending Owner Verification"
                    aria-label="Remove Pending Owner Verification"
                    className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-white hover:bg-rose-100 text-orange-900 hover:text-rose-700 border border-orange-300 font-extrabold text-xs flex items-center justify-center shadow-2xs transition-all cursor-pointer"
                  >
                    ✕
                  </button>
                  <div className="font-display font-extrabold text-lg text-orange-950 flex items-center gap-2">
                    <span>⏳</span>
                    <span>Orange Money Payment Pending Approval</span>
                  </div>
                  <p className="text-xs text-orange-900 leading-relaxed">
                    Your Orange Money payment details have been submitted to the owner (
                    <strong>{CREATOR_NAME}</strong> · <strong>{OWNER_ADMIN_EMAIL}</strong>). As soon as the owner clicks <strong>Approve</strong> on the Admin Dashboard, your account will unlock!
                  </p>
                  {userData.pendingPayment && (
                    <div className="bg-white rounded-xl p-3 border border-orange-200 text-xs font-mono space-y-1 text-slate-800">
                      <div>
                        • Sender Number: <strong>{userData.pendingPayment.senderPhone}</strong>
                      </div>
                      <div>
                        • SMS Transaction ID:{' '}
                        <strong>{userData.pendingPayment.transactionId}</strong>
                      </div>
                      <div>
                        • Status:{' '}
                        <strong className="text-orange-700 uppercase">Pending Verification</strong>
                      </div>
                    </div>
                  )}
                  <a
                    href={`mailto:${OWNER_ADMIN_EMAIL}?subject=${encodeURIComponent(
                      `Orange Money Verification — ${userData.name}`
                    )}&body=${encodeURIComponent(
                      `Hello ${CREATOR_NAME},\nPlease verify my Orange Money payment (Sender: ${
                        userData.pendingPayment?.senderPhone || ''
                      }, SMS Tx ID: ${userData.pendingPayment?.transactionId || ''}) for ${
                        userData.email
                      }.`
                    )}`}
                    className="w-full py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs text-center block transition-all"
                  >
                    ✉️ Send Email Reminder to Owner ({OWNER_ADMIN_EMAIL})
                  </a>
                </div>
              </div>
            ) : (
              <>
                <h3 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
                  {trialInfo.status === 'expired'
                    ? 'Your 2-Week Free Access Has Ended. Renew or Unlock to Continue.'
                    : `Your Free Access is Active (${trialInfo.daysLeft} days left).`}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 mb-3">
                  Every account includes <strong>2 weeks (14 days) of free access</strong>. Renew via <strong>Orange Money</strong> or enter a <strong>Free 30-Day Access Password</strong> from the Owner Admin:
                </p>

                {/* Renewal Method Switcher Tabs */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-cream rounded-2xl border border-slate-200 mb-4">
                  <button
                    type="button"
                    onClick={() => setPaymentTab('orange')}
                    className={`py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                      paymentTab === 'orange'
                        ? 'bg-orange-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🟧 Orange Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentTab('free_password')}
                    className={`py-2 px-3 rounded-xl font-extrabold text-xs transition-all cursor-pointer ${
                      paymentTab === 'free_password'
                        ? 'bg-lavender-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🔑 30-Day Password
                  </button>
                </div>

                {paymentTab === 'free_password' ? (
                  <form onSubmit={applyVipCodeFromModal} className="space-y-3.5">
                    <div className="rounded-2xl bg-lavender-50 border border-lavender-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-lavender-900">
                          🔑 Free 30-Day Access Password
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white border border-lavender-200 text-[11px] font-bold text-lavender-800">
                          Instant Unlock
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        Enter the Free 30-Day Access Password provided by the Owner Admin (<strong>{CREATOR_NAME}</strong>) to immediately unlock your account for 30 days.
                      </p>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          30-Day Access Password *
                        </label>
                        <input
                          type="text"
                          required
                          value={vipSecretCodeInput}
                          onChange={(e) => setVipSecretCodeInput(e.target.value)}
                          placeholder="Enter 30-day access password..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-lavender-300 focus:border-lavender-600 outline-none text-xs sm:text-sm font-mono font-bold text-slate-900 bg-white"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3.5 px-5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer"
                    >
                      Unlock 30 Days Free Access 🔑
                    </button>
                  </form>
                ) : (
                  <form onSubmit={processOrangeMoneySubmission} className="space-y-3.5">
                    <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-orange-800">
                          Orange Money Renewal
                        </span>
                        <span className="font-display font-extrabold text-base text-orange-600 tabular-nums">
                          Le 30 / Pass
                        </span>
                      </div>

                      <div className="bg-white rounded-xl p-3 border-2 border-orange-300 flex items-center justify-between gap-2">
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Step 1 — Send Le 30 To Orange Money:
                          </span>
                          <span className="font-display font-extrabold text-lg text-slate-900 tracking-wide font-mono tabular-nums">
                            073604401
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            copyTextToClipboard(
                              '073604401',
                              '🟧 Orange Money number 073604401 copied!'
                            )
                          }
                          className="px-3 py-1.5 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-900 font-bold text-xs transition-all shrink-0"
                        >
                          📋 Copy
                        </button>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Step 2 — Your Orange Money Sender Number *
                        </label>
                        <input
                          type="tel"
                          required
                          value={orangePhoneInput}
                          onChange={(e) => setOrangePhoneInput(e.target.value)}
                          placeholder="e.g., 076 123 456"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-orange-300 focus:border-orange-500 outline-none text-xs sm:text-sm font-semibold text-slate-800 bg-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Step 3 — Orange Money SMS Transaction ID *
                        </label>
                        <input
                          type="text"
                          required
                          value={orangeTxIdInput}
                          onChange={(e) => setOrangeTxIdInput(e.target.value)}
                          placeholder="e.g., MP261020.1234.A12345"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-orange-200 focus:border-orange-500 outline-none text-xs sm:text-sm font-medium text-slate-800 bg-white"
                        />
                      </div>

                      <p className="text-[11px] text-orange-900">
                        ⏳ Submitting shows a <strong>Pending Approval</strong> screen and notifies{' '}
                        <strong>{OWNER_ADMIN_EMAIL}</strong> to verify and unlock your pass.
                      </p>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3.5 px-5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm shadow-md transition-all cursor-pointer"
                    >
                      Submit Orange Money for Verification 🟧
                    </button>
                  </form>
                )}
              </>
            )}

            {/* Bottom of Lock Screen: Easy Owner / Admin Login + Log Out + Creator Branding */}
            <div className="mt-5 pt-4 border-t border-slate-200 space-y-2.5 text-center">
              <button
                type="button"
                onClick={() => {
                  setAdminLoginEmail(OWNER_ADMIN_EMAIL);
                  setShowAdminLoginModal(true);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-500 font-extrabold text-xs border border-gold-500/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>🛡️</span>
                <span>Owner / Admin Login ({OWNER_ADMIN_EMAIL})</span>
              </button>

              {isAccountLocked && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Log Out / Switch Account
                </button>
              )}

              <div className="pt-1 text-[11px] text-slate-500">
                <strong className="text-slate-800">Created by {CREATOR_NAME}</strong> ·{' '}
                <a
                  href={`mailto:${CREATOR_EMAIL}?subject=Contact%20Creator%20-%20BloomCampus`}
                  className="font-bold text-lavender-700 hover:underline"
                >
                  Contact Creator ({CREATOR_EMAIL})
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: ABOUT / CONTACT CREATOR & SUPPORT INQUIRY MODAL              */}
      {/* ===================================================================== */}
      {showAboutContactModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl border-2 border-lavender-200 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-700 block">
                  🌸 Creator Branding &amp; Direct Support
                </span>
                <h3 className="font-display font-extrabold text-xl text-slate-900">
                  Created by {CREATOR_NAME}
                </h3>
                <a
                  href={`mailto:${CREATOR_EMAIL}?subject=Contact%20Creator%20-%20BloomCampus`}
                  className="text-xs font-bold text-lavender-700 hover:underline"
                >
                  ✉️ Direct Contact: {CREATOR_EMAIL}
                </a>
              </div>
              <button
                type="button"
                onClick={() => setShowAboutContactModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSupportInquirySubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Your Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={supportPhoneInput}
                  onChange={(e) => setSupportPhoneInput(e.target.value)}
                  placeholder="e.g., 076 123 456"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium bg-cream"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  value={supportSubjectInput}
                  onChange={(e) => setSupportSubjectInput(e.target.value)}
                  placeholder="e.g., Subscription Question or App Feedback"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Message to {CREATOR_NAME} *
                </label>
                <textarea
                  rows={3}
                  required
                  value={supportMessageInput}
                  onChange={(e) => setSupportMessageInput(e.target.value)}
                  placeholder="Write your support question or payment inquiry..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium bg-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 px-5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
              >
                Send Inquiry &amp; Email Notification to {CREATOR_EMAIL} 📩
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: OWNER ADMIN LOGIN MODAL (FROM LOGGED-IN SCREEN / SIDEBAR)    */}
      {/* ===================================================================== */}
      {showAdminLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-plum-900">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-plum-900 text-gold-500">
                🛡️ Owner Admin Console Login
              </span>
              <button
                type="button"
                onClick={() => setShowAdminLoginModal(false)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg bg-slate-100"
              >
                Close ✕
              </button>
            </div>
            <h3 className="font-display font-extrabold text-xl text-slate-900">
              Sign In to Owner / Admin Dashboard
            </h3>
            <p className="text-xs text-slate-600 mt-1 mb-4">
              See all sign-ups and know how many people are in the app ({Object.keys(allUsersMap).length} currently synced). For <strong>{CREATOR_NAME}</strong> ({OWNER_ADMIN_EMAIL}) or any authorized admin.
            </p>

            <form onSubmit={handleAdminLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Email
                </label>
                <input
                  type="email"
                  required
                  value={adminLoginEmail}
                  onChange={(e) => setAdminLoginEmail(e.target.value)}
                  placeholder="Enter owner or added admin email..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold text-slate-900 bg-cream"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Admin Password
                </label>
                <input
                  type="password"
                  required
                  value={adminLoginPassword}
                  onChange={(e) => setAdminLoginPassword(e.target.value)}
                  placeholder="Enter admin password..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold text-slate-900 bg-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 px-5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-500 font-extrabold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
              >
                Open Admin Dashboard ({Object.keys(allUsersMap).length} Sign-Ups) 🛡️
              </button>
            </form>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleGoogleAdminLogin}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>🔐</span>
                <span>Verify Owner Admin with Google ({OWNER_ADMIN_EMAIL})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: USER PROFILE, SUBSCRIPTION STATUS & PERIOD TRACKING SYNC     */}
      {/* ===================================================================== */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-7 shadow-2xl border-2 border-lavender-200 max-h-[92vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-700 block">
                  ☁️ Firebase Auth &amp; Firestore Persistence
                </span>
                <h3 className="font-display font-extrabold text-xl text-slate-900">
                  User Profile, Subscription &amp; Period Tracking
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Customer Entry #{userData.customerNumber || 1} · Automatic real-time cloud backup for your profile, subscription status, and cycle logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* 1. USER PROFILE FORM */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const nextName = String(fd.get('profName') || '').trim() || userData.name;
                const nextAge = String(fd.get('profAge') || '').trim() || userData.age || '21';
                const nextPhone = String(fd.get('profPhone') || '').trim();
                const nextPass = String(fd.get('profPassword') || '').trim() || userData.password;
                const nextCycleLen = Math.max(
                  21,
                  Math.min(45, Number(fd.get('profCycleLen') || userData.customCycleLength || 28))
                );
                const nextGoal = String(fd.get('profSkincareGoal') || '').trim();

                const updated: UserData = {
                  ...userData,
                  name: nextName,
                  age: nextAge,
                  phone: nextPhone,
                  password: nextPass,
                  customCycleLength: nextCycleLen,
                  skincareGoal: nextGoal || userData.skincareGoal,
                  deviceInfo: getClientDeviceLabel(),
                  lastUpdatedAt: new Date().toISOString(),
                };

                updateUserData(() => updated);
                await syncUserToFirestore(updated, updated.email);
                await logCustomerEntryToFirestore(updated, 'WebApp Session');
                showToast(
                  '☁️ Saved User Profile, Subscription Status & Period Tracking data to Cloud Firestore!',
                  'success'
                );
                setShowProfileModal(false);
              }}
              className="space-y-4"
            >
              <div className="rounded-2xl bg-cream border border-lavender-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-lavender-900">
                    1. User Profile Details
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">
                    {userData.email}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="profName"
                      defaultValue={userData.name}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Age *
                    </label>
                    <input
                      type="number"
                      name="profAge"
                      min="10"
                      max="80"
                      defaultValue={userData.age || '21'}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                    Phone Number Used *
                  </label>
                  <input
                    type="tel"
                    name="profPhone"
                    defaultValue={resolveCustomerPhoneUsed(userData)}
                    placeholder="076 123 456"
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Custom Cycle Length (Days)
                    </label>
                    <input
                      type="number"
                      name="profCycleLen"
                      min="21"
                      max="45"
                      defaultValue={userData.customCycleLength || todayMetrics.avgCycleLength || 28}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                      Sidratu Skincare Goal
                    </label>
                    <input
                      type="text"
                      name="profSkincareGoal"
                      defaultValue={userData.skincareGoal || 'Even Skin Tone'}
                      placeholder="e.g., Even Skin Tone"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* 2. SUBSCRIPTION STATUS SUMMARY */}
              <div className="rounded-2xl bg-sage-50/70 border border-sage-200 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-sage-900">
                    2. Saved Subscription Status
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-white border border-sage-300 text-sage-900 text-[11px] font-extrabold">
                    {trialInfo.label}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                  <div>
                    Status Code:{' '}
                    <strong className="uppercase text-slate-900">
                      {userData.subscriptionStatus || 'active'}
                    </strong>
                  </div>
                  <div>
                    Access Method:{' '}
                    <strong className="text-slate-900">
                      {userData.paymentMethod || '2-Week Free Access'}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setIsPaywallPreview(true);
                    setShowPaywallModal(true);
                  }}
                  className="text-xs font-extrabold text-lavender-700 hover:underline cursor-pointer"
                >
                  🟧 Open Subscription Renewal / Access Pass Settings →
                </button>
              </div>

              {/* 3. PERIOD TRACKING INFORMATION SUMMARY */}
              <div className="rounded-2xl bg-rose-50/70 border border-rose-200 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-rose-900">
                    3. Saved Period Tracking Information
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-white border border-rose-300 text-rose-900 text-[11px] font-extrabold tabular-nums">
                    {sortedPeriods.length} Logged {sortedPeriods.length === 1 ? 'Cycle' : 'Cycles'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-slate-700">
                  <div>
                    Latest LMP Start:{' '}
                    <strong className="text-slate-900">
                      {todayMetrics.activePeriodStartStr
                        ? formatHumanDate(todayMetrics.activePeriodStartStr)
                        : 'Not set'}
                    </strong>
                  </div>
                  <div>
                    Latest LMP End:{' '}
                    <strong className="text-slate-900">
                      {todayMetrics.activePeriodEndStr
                        ? formatHumanDate(todayMetrics.activePeriodEndStr)
                        : 'Not set'}
                    </strong>
                  </div>
                  <div>
                    Daily Logs Saved:{' '}
                    <strong className="text-slate-900">
                      {Object.keys(userData.dailyLogs || {}).length} days
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-3 px-5 rounded-2xl bg-gradient-to-r from-lavender-600 to-rose-600 hover:from-lavender-700 hover:to-rose-700 text-white font-extrabold text-xs sm:text-sm shadow-md transition-all cursor-pointer"
                >
                  💾 Save Profile, Subscription &amp; Period Info to Firestore
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="py-3 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm cursor-pointer"
                >
                  Close
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
