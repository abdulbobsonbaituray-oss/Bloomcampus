import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Droplets,
  Eye,
  EyeOff,
  FileText,
  Gift,
  HeartHandshake,
  HelpCircle,
  Lock,
  LogOut,
  Mail,
  Moon,
  Pill,
  Plus,
  Printer,
  Search,
  Shield,
  Sparkles,
  Stethoscope,
  Sun,
  Trash2,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import {
  AdminConfig,
  EmergencyPillLog,
  PeriodRecord,
  StageKey,
  SupportInquiry,
  UserData,
} from './types';
import {
  CREATOR_EMAIL,
  CREATOR_NAME,
  HABIT_ITEMS,
  MOOD_CATEGORIES,
  OWNER_ADMIN_EMAIL,
  PHASE_ADVISOR_DATA,
  PHASE_SHIFT_NOTIFICATION_DATA,
  STORAGE_ADMIN_CONFIG_KEY,
  STORAGE_ADMIN_SESSION_KEY,
  STORAGE_HIDE_GUIDE_KEY,
  STORAGE_REMEMBER_ME_KEY,
  STORAGE_REMEMBERED_EMAIL_KEY,
  STORAGE_THEME_KEY,
  SYMPTOM_ITEMS,
} from './constants';
import {
  calculateCycleMetrics,
  createDefaultUserObject,
  diffDays,
  formatDateTimeLocalISO,
  formatHumanDate,
  formatLockedTodayHuman,
  formatShortMonthDay,
  getAdminConfig,
  getLockedTodayISO,
  getSortedPeriods,
  getTrialStatus,
  isSecretVipPassword,
  saveAdminConfig,
} from './utils/cycleEngine';
import { exportClinicSummaryToPDF } from './utils/clinicPdfExport';
import {
  auth,
  clearAllSupportInquiriesFromFirestore,
  clearDeletedEmailLocally,
  deleteMultipleUsersFromFirestore,
  deleteSupportInquiryFromFirestore,
  deleteUserFromFirestore,
  emailToDocId,
  fetchAllUsersFromFirestore,
  getClientDeviceLabel,
  getCurrentFirebaseIdToken,
  loadUserDocByUid,
  logCustomerEntryToFirestore,
  resendVerificationEmailFirebase,
  resolveCustomerPhoneUsed,
  saveUserDocByUid,
  sendPasswordResetEmailFirebase,
  setFirebaseAuthRememberPersistence,
  signInWithEmailPasswordFirebase,
  signInWithGooglePopup,
  signOutFirebase,
  signUpWithEmailPasswordFirebase,
  subscribeToAdminConfigFirestore,
  subscribeToAllUsersFirestore,
  subscribeToFirebaseAuth,
  subscribeToSupportInquiriesFirestore,
  subscribeToUserDocByUid,
  syncAdminConfigToFirestore,
  syncSupportInquiryToFirestore,
} from './firebase';
import { BottomNavBar, CoreNavSection } from './components/BottomNavBar';
import { CycleInsightsPanel } from './components/CycleInsightsPanel';
import { FullScreenCalendarModal } from './components/FullScreenCalendarModal';
import { CycleJournalPromptsSection } from './components/CycleJournalPromptsSection';
import { BadgesMilestonesSection } from './components/BadgesMilestonesSection';
import { BioscienceReproductiveEducationCenter } from './components/BioscienceReproductiveEducationCenter';
import { MythBusterQuizSection } from './components/MythBusterQuizSection';
import { CycleTrendsSection } from './components/CycleTrendsSection';
import { HydrationTrackerWidget } from './components/HydrationTrackerWidget';
import { NutritionCravingSupportCard } from './components/NutritionCravingSupportCard';
import { MoodStageCorrelationSection } from './components/MoodStageCorrelationSection';
import { StudyExamSyncPlanner } from './components/StudyExamSyncPlanner';
import { SidratuClinicHub } from './components/SidratuClinicHub';
import { OwnerAdminDashboard } from './components/OwnerAdminDashboard';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';

type TrackerSubTab = 'dates' | 'insights' | 'phases';
type CheckinSubTab = 'mood' | 'journal' | 'badges';
type GuideSubTab = 'pill' | 'phase_guide' | 'myths';
type AnalyticsSubTab = 'trends' | 'hydration' | 'nutrition' | 'correlation' | 'badges' | 'videos';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'warning' | 'info';
}

interface QuickFindEntry {
  id: string;
  title: string;
  subtitle: string;
  emoji: string;
  section: CoreNavSection;
  subTab?: string;
  action?: 'open_calendar' | 'open_clinic_summary';
  keywords: string;
}

const QUICK_FIND_ITEMS: QuickFindEntry[] = [
  {
    id: 'qf-lmp',
    title: 'Period Dates & LMP',
    subtitle: 'Enter or update last period start, end & cycle length',
    emoji: '🩸',
    section: 'tracker',
    subTab: 'dates',
    keywords: 'lmp period start end dates cycle length history',
  },
  {
    id: 'qf-cal',
    title: 'Cycle Calendar',
    subtitle: 'Full-screen monthly & 3-month cycle view',
    emoji: '📅',
    section: 'tracker',
    action: 'open_calendar',
    keywords: 'calendar month fertility predictions dates',
  },
  {
    id: 'qf-insights',
    title: '6-Month Cycle Insights',
    subtitle: 'Check if cycles are steady or need a doctor visit',
    emoji: '🩺',
    section: 'tracker',
    subTab: 'insights',
    keywords: 'insights 6 month consistent irregular doctor analysis',
  },
  {
    id: 'qf-phases',
    title: 'What Each Week Means',
    subtitle: 'Plain-language guide to all 4 cycle stages',
    emoji: '🌱',
    section: 'tracker',
    subTab: 'phases',
    keywords: 'phases stages menstruation follicular ovulation luteal week',
  },
  {
    id: 'qf-mood',
    title: 'Log Mood & Symptoms',
    subtitle: 'Record daily mood, cramps, flow, habits & notes',
    emoji: '😊',
    section: 'checkin',
    subTab: 'mood',
    keywords: 'mood cramps symptoms headache bloating acne flow habits notes',
  },
  {
    id: 'qf-journal',
    title: 'Cycle Journal & Poses',
    subtitle: 'Guided prompts + cramp relief yoga poses',
    emoji: '📓',
    section: 'checkin',
    subTab: 'journal',
    keywords: 'journal prompts reflection yoga poses cramp relief',
  },
  {
    id: 'qf-badges-checkin',
    title: 'Badges & Streaks',
    subtitle: 'Check your daily logging streaks & milestones',
    emoji: '🏅',
    section: 'checkin',
    subTab: 'badges',
    keywords: 'badges milestones streak rewards mastery',
  },
  {
    id: 'qf-pill',
    title: 'Emergency Pill Log',
    subtitle: 'Track emergency contraception timing & cycle impact',
    emoji: '💊',
    section: 'guide',
    subTab: 'pill',
    keywords: 'emergency pill postinor plan b contraception log',
  },
  {
    id: 'qf-phase-guide',
    title: 'Smart Phase Guide & Bioscience',
    subtitle: 'Fertility risk, hormone science, workouts & body signals',
    emoji: '🧬',
    section: 'guide',
    subTab: 'phase_guide',
    keywords: 'bioscience pregnancy risk hormones guide education',
  },
  {
    id: 'qf-myths',
    title: 'Campus Myth Buster',
    subtitle: '3D flip quiz on reproductive & hormonal facts',
    emoji: '🧠',
    section: 'guide',
    subTab: 'myths',
    keywords: 'myth buster quiz facts education',
  },
  {
    id: 'qf-hydration',
    title: 'Water & Hydration',
    subtitle: 'Track daily glasses & 7-day hydration progress',
    emoji: '💧',
    section: 'analytics',
    subTab: 'hydration',
    keywords: 'water hydration glasses liters tracker',
  },
  {
    id: 'qf-nutrition',
    title: 'Snacks & Cravings',
    subtitle: 'Craving decoder + phase-matched snack ideas',
    emoji: '🍫',
    section: 'analytics',
    subTab: 'nutrition',
    keywords: 'nutrition food snacks cravings chocolate magnesium iron',
  },
  {
    id: 'qf-trends',
    title: '6-Month Cycle Charts',
    subtitle: 'Visual cycle length & bleed duration charts',
    emoji: '📈',
    section: 'analytics',
    subTab: 'trends',
    keywords: 'charts graphs trends analytics 6 month',
  },
  {
    id: 'qf-corr',
    title: 'Mood × Stage Table',
    subtitle: 'See which moods & symptoms appear in each phase',
    emoji: '📊',
    section: 'analytics',
    subTab: 'correlation',
    keywords: 'correlation mood stage heatmap table',
  },
  {
    id: 'qf-study',
    title: 'Study & Exam Sync',
    subtitle: 'Plan coursework & exams around your peak focus days',
    emoji: '🎓',
    section: 'study',
    keywords: 'study exam homework coursework academic planner',
  },
  {
    id: 'qf-sidratu',
    title: 'Sidratu Skincare & AI',
    subtitle: 'Skincare assistant, clinic booking & therapy timeline',
    emoji: '✨',
    section: 'sidratu',
    keywords: 'sidratu skincare clinic appointment prp facial freetown ai assistant',
  },
  {
    id: 'qf-clinic-pdf',
    title: 'Doctor & Clinic Summary',
    subtitle: 'Download printable PDF report of your cycles & logs',
    emoji: '📄',
    section: 'tracker',
    action: 'open_clinic_summary',
    keywords: 'doctor clinic summary pdf export print report',
  },
];

const EDUCATION_VIDEOS = [
  {
    id: 'vid-1',
    title: 'Understanding the 4 Phases of the Menstrual Cycle',
    source: 'TED-Ed · Reproductive Physiology',
    duration: '5 min',
    url: 'https://www.youtube.com/results?search_query=ted+ed+how+menstrual+cycle+works',
    summary: 'Clear animation explaining FSH, LH, estrogen, and progesterone across your 28-day rhythm.',
  },
  {
    id: 'vid-2',
    title: 'Primary Dysmenorrhea & Natural Cramp Relief on Campus',
    source: 'Obstetrics & Gynecology Education',
    duration: '6 min',
    url: 'https://www.youtube.com/results?search_query=obstetrics+period+cramps+prostaglandins+explained',
    summary: 'Why uterine prostaglandins cause cramps and when severe pain signals endometriosis.',
  },
  {
    id: 'vid-3',
    title: 'Hormonal Skincare & Why Luteal Breakouts Happen',
    source: 'Dermatology Science Primer',
    duration: '4 min',
    url: 'https://www.youtube.com/results?search_query=hormonal+acne+luteal+phase+progesterone+dermatologist',
    summary: 'How progesterone stimulates sebum before your period and gentle care routines.',
  },
];

const PENDING_SIGNUP_PROFILE_KEY = 'bloomcampus_pending_signup_profile_v1';

interface PendingSignupProfile {
  email: string;
  name: string;
  age: string;
  phone: string;
  createdAt: number;
}

function savePendingSignupProfile(profile: PendingSignupProfile) {
  try {
    sessionStorage.setItem(PENDING_SIGNUP_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore storage quota errors
  }
}

function readPendingSignupProfile(email: string): PendingSignupProfile | null {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNUP_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSignupProfile;
    if (parsed?.email?.trim().toLowerCase() === email.trim().toLowerCase()) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function clearPendingSignupProfile() {
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_PROFILE_KEY);
  } catch {
    // ignore
  }
}

export default function App() {
  const lockedTodayISO = getLockedTodayISO();
  const [usersMap, setUsersMap] = useState<Record<string, UserData>>({});
  const [adminConfig, setAdminConfig] = useState<AdminConfig>(() => getAdminConfig());
  const [supportInquiries, setSupportInquiries] = useState<SupportInquiry[]>([]);

  const [authInitialized, setAuthInitialized] = useState<boolean>(false);
  const [firebaseUid, setFirebaseUid] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);

  const [isAdminSession, setIsAdminSession] = useState<boolean>(false);
  const pendingAuthSourceRef = useRef<string | null>(null);

  // Theme & privacy UI state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_THEME_KEY) === 'dark';
    } catch {
      return false;
    }
  });
  const [privacyBlur, setPrivacyBlur] = useState<boolean>(false);
  const [hideQuickGuide, setHideQuickGuide] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_HIDE_GUIDE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Navigation & sub-tabs
  const [activeSection, setActiveSection] = useState<CoreNavSection>('tracker');
  const [trackerSubTab, setTrackerSubTab] = useState<TrackerSubTab>('dates');
  const [checkinSubTab, setCheckinSubTab] = useState<CheckinSubTab>('mood');
  const [guideSubTab, setGuideSubTab] = useState<GuideSubTab>('pill');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<AnalyticsSubTab>('trends');

  // Selected date & calendar state
  const [selectedDateStr, setSelectedDateStr] = useState<string>(lockedTodayISO);
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState<number>(() => new Date().getFullYear());
  const [showCalendarModal, setShowCalendarModal] = useState<boolean>(false);

  // Overlays & modals
  const [quickFindOpen, setQuickFindOpen] = useState<boolean>(false);
  const [quickFindQuery, setQuickFindQuery] = useState<string>('');
  const [showClinicSummaryModal, setShowClinicSummaryModal] = useState<boolean>(false);
  const [showPaywallModal, setShowPaywallModal] = useState<boolean>(false);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [stageTransitionAlert, setStageTransitionAlert] = useState<{
    fromStage: StageKey;
    toStage: StageKey;
    headline: string;
    tip: string;
    detectedAt: string;
  } | null>(null);
  const prevObservedStageRef = useRef<{ uid: string; stageKey: StageKey } | null>(null);

  // Collapsible accumulating data lists (collapsed by default to reduce scrolling)
  const [showPeriodHistory, setShowPeriodHistory] = useState<boolean>(false);
  const [showCycleAlerts, setShowCycleAlerts] = useState<boolean>(false);
  const [showSymptomChecklist, setShowSymptomChecklist] = useState<boolean>(true);
  const [symptomSearch, setSymptomSearch] = useState<string>('');
  const [showSymptomHistoryList, setShowSymptomHistoryList] = useState<boolean>(false);
  const [showPillHistoryList, setShowPillHistoryList] = useState<boolean>(false);
  const [showBioscienceCenter, setShowBioscienceCenter] = useState<boolean>(false);

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [authName, setAuthName] = useState('');
  const [authAge, setAuthAge] = useState('');
  const [authPhone, setAuthPhone] = useState('');
  const [authEmail, setAuthEmail] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_REMEMBERED_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [authPassword, setAuthPassword] = useState('');
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_REMEMBER_ME_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [authNotice, setAuthNotice] = useState<{
    tone: 'error' | 'info' | 'success' | 'verification';
    message: string;
    pendingVerifyEmail?: string;
  } | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  // Period editor inputs
  const [lmpStartInput, setLmpStartInput] = useState('');
  const [lmpEndInput, setLmpEndInput] = useState('');
  const [cycleLenInput, setCycleLenInput] = useState<number>(28);

  // Emergency pill input
  const [pillDateTimeInput, setPillDateTimeInput] = useState(() => formatDateTimeLocalISO(new Date()));

  // Paywall / Orange Money & VIP password inputs
  const [omSenderPhone, setOmSenderPhone] = useState('');
  const [omTxId, setOmTxId] = useState('');
  const [vipPassInput, setVipPassInput] = useState('');
  const [showVipPassword, setShowVipPassword] = useState(false);

  // Support inquiry form
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportSending, setSupportSending] = useState(false);

  const lmpEditorRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'warning' | 'info' = 'info') => {
      const id = Date.now();
      setToast({ id, message, type });
      window.setTimeout(() => {
        setToast((prev) => (prev && prev.id === id ? null : prev));
      }, 4200);
    },
    []
  );

  // Apply Dark Mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, isDarkMode ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [isDarkMode]);

  // Clear any legacy local multi-user dumps from older app versions on mount
  useEffect(() => {
    try {
      localStorage.removeItem('bloomcampus_users_v1');
      localStorage.removeItem('bloomcampus_current_user_v1');
      sessionStorage.removeItem('bloomcampus_current_user_v1');
    } catch {
      // ignore
    }
  }, []);

  // Subscribe to Firebase Auth state & bind ONLY the authenticated user's UID-scoped Firestore docs
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    let unsubUserInquiries: (() => void) | null = null;
    let cancelled = false;

    const cleanupDataListeners = () => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubUserInquiries) {
        unsubUserInquiries();
        unsubUserInquiries = null;
      }
    };

    const unsubAuth = subscribeToFirebaseAuth((fbUser) => {
      cleanupDataListeners();

      if (!fbUser || !fbUser.email) {
        setFirebaseUid(null);
        setCurrentEmail(null);
        setCurrentUser(null);
        setUsersMap({});
        setSupportInquiries([]);
        setIsAdminSession(false);
        setAuthInitialized(true);
        return;
      }

      const isGoogle = fbUser.providerData.some((p) => p.providerId === 'google.com');
      const isVerified = Boolean(fbUser.emailVerified || isGoogle);
      if (!isVerified) {
        // Strict privacy: do not keep an unverified account signed in or load data
        setFirebaseUid(null);
        setCurrentEmail(null);
        setCurrentUser(null);
        setUsersMap({});
        setSupportInquiries([]);
        setIsAdminSession(false);
        setAuthInitialized(true);
        return;
      }

      const cleanEmail = fbUser.email.trim().toLowerCase();
      const uid = fbUser.uid;
      setFirebaseUid(uid);
      setCurrentEmail(cleanEmail);

      const isOwnerEmail = cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase();
      try {
        if (isOwnerEmail && sessionStorage.getItem(STORAGE_ADMIN_SESSION_KEY) === 'true') {
          setIsAdminSession(true);
        } else if (!isOwnerEmail) {
          setIsAdminSession(false);
          sessionStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
        }
      } catch {
        setIsAdminSession(false);
      }

      const bootstrapAndSubscribe = async () => {
        const deviceLabel = getClientDeviceLabel();
        const nowIso = new Date().toISOString();
        const signInSource = pendingAuthSourceRef.current;
        pendingAuthSourceRef.current = null;

        try {
          const existingDoc = await loadUserDocByUid(uid);
          if (cancelled) return;

          if (!existingDoc) {
            // Check authenticated legacy store migration first so genuine prior user data is preserved
            let legacyUser: UserData | null = null;
            const idToken = await getCurrentFirebaseIdToken();
            if (idToken) {
              try {
                const migRes = await fetch('/api/users/migrate-legacy', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${idToken}`,
                  },
                });
                if (migRes.ok) {
                  const migJson = await migRes.json();
                  if (migJson?.migrated && migJson.userData) {
                    legacyUser = migJson.userData as UserData;
                  }
                }
              } catch {
                // continue cleanly with fresh profile
              }
            }

            const pendingSignup = readPendingSignupProfile(cleanEmail);
            const fallbackName =
              pendingSignup?.name ||
              legacyUser?.name ||
              fbUser.displayName ||
              cleanEmail.split('@')[0];

            const baseUser = legacyUser
              ? {
                  ...createDefaultUserObject(
                    fallbackName,
                    cleanEmail,
                    '',
                    legacyUser.age || pendingSignup?.age || '',
                    resolveCustomerPhoneUsed(legacyUser) || pendingSignup?.phone || '',
                    uid
                  ),
                  ...legacyUser,
                }
              : createDefaultUserObject(
                  fallbackName,
                  cleanEmail,
                  '',
                  pendingSignup?.age || '',
                  pendingSignup?.phone || '',
                  uid
                );

            const initialUser: UserData = {
              ...baseUser,
              uid,
              email: cleanEmail,
              name: fallbackName,
              role: isOwnerEmail ? 'admin' : 'client',
              lastSignInAt: nowIso,
              lastUpdatedAt: nowIso,
              signInCount: Math.max(1, (legacyUser?.signInCount || 0) + 1),
              deviceInfo: deviceLabel,
              lastAppUrl: typeof window !== 'undefined' ? window.location.origin : '',
              signupSource:
                legacyUser?.signupSource ||
                signInSource ||
                (isGoogle ? 'Google Sign In' : 'Verified Account'),
            };
            delete (initialUser as unknown as Record<string, unknown>).password;

            clearDeletedEmailLocally(cleanEmail);
            await saveUserDocByUid(uid, initialUser, { action: 'create' });
            clearPendingSignupProfile();

            if (!cancelled) {
              setCurrentUser(initialUser);
            }
            void logCustomerEntryToFirestore(
              initialUser,
              pendingSignup ? 'Create Account' : isGoogle ? 'Google Sign In' : 'Sign In'
            );
          } else {
            clearPendingSignupProfile();
            let activeUser = existingDoc;
            if (signInSource) {
              const updatedLoginMeta: UserData = {
                ...existingDoc,
                uid,
                email: cleanEmail,
                name: existingDoc.name || fbUser.displayName || cleanEmail.split('@')[0],
                lastSignInAt: nowIso,
                lastUpdatedAt: nowIso,
                signInCount: (existingDoc.signInCount || 0) + 1,
                deviceInfo: deviceLabel,
                lastAppUrl: typeof window !== 'undefined' ? window.location.origin : '',
              };
              await saveUserDocByUid(uid, updatedLoginMeta, { action: 'normal' });
              activeUser = updatedLoginMeta;
              void logCustomerEntryToFirestore(
                updatedLoginMeta,
                isGoogle ? 'Google Sign In' : 'Sign In'
              );
            }
            if (!cancelled) {
              setCurrentUser(activeUser);
            }
          }
        } catch (err) {
          console.error('Failed to bootstrap authenticated user profile:', err);
        } finally {
          if (!cancelled) {
            setAuthInitialized(true);
          }
        }

        if (cancelled) return;

        unsubUserDoc = subscribeToUserDocByUid(uid, (docUser) => {
          if (docUser) {
            setCurrentUser(docUser);
          }
        });

        if (!isOwnerEmail) {
          unsubUserInquiries = subscribeToSupportInquiriesFirestore((list) => {
            setSupportInquiries(list);
          });
        }
      };

      void bootstrapAndSubscribe();
    });

    return () => {
      cancelled = true;
      cleanupDataListeners();
      unsubAuth();
    };
  }, []);

  // Admin-only Firestore subscriptions (strictly gated on verified owner email & active admin session)
  useEffect(() => {
    const verifiedOwner =
      isAdminSession &&
      auth.currentUser &&
      (auth.currentUser.emailVerified ||
        auth.currentUser.providerData.some((p) => p.providerId === 'google.com')) &&
      auth.currentUser.email?.trim().toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase();

    if (!verifiedOwner) {
      setUsersMap({});
      return;
    }

    const unsubUsers = subscribeToAllUsersFirestore((allUsers) => {
      setUsersMap(allUsers);
    });
    const unsubCfg = subscribeToAdminConfigFirestore((cfg) => {
      setAdminConfig(cfg);
      saveAdminConfig(cfg);
    });
    const unsubInq = subscribeToSupportInquiriesFirestore((inquiries) => {
      setSupportInquiries(inquiries);
    });

    return () => {
      unsubUsers();
      unsubCfg();
      unsubInq();
    };
  }, [isAdminSession, firebaseUid]);

  const refreshAdminUsersFromFirestore = useCallback(async (): Promise<number> => {
    const verifiedOwner =
      auth.currentUser &&
      (auth.currentUser.emailVerified ||
        auth.currentUser.providerData.some((p) => p.providerId === 'google.com')) &&
      auth.currentUser.email?.trim().toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase();
    if (!verifiedOwner) return 0;
    const allUsers = await fetchAllUsersFromFirestore();
    setUsersMap(allUsers);
    return Object.keys(allUsers).length;
  }, []);

  const updateCurrentUser = useCallback(
    (
      updater: (prev: UserData) => UserData,
      action: 'normal' | 'pending_payment' | 'free_code' = 'normal'
    ) => {
      if (!firebaseUid || !currentEmail) return;
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const updatedRaw = updater(prev);
        const updated: UserData = {
          ...updatedRaw,
          uid: firebaseUid,
          email: currentEmail,
          lastUpdatedAt: new Date().toISOString(),
        };
        void saveUserDocByUid(firebaseUid, updated, { action });
        return updated;
      });
    },
    [firebaseUid, currentEmail]
  );

  // Sync LMP input fields with latest real logged period when user opens/updates
  const sortedPeriods = useMemo(() => getSortedPeriods(currentUser?.periods), [currentUser?.periods]);
  const latestPeriod = sortedPeriods.length > 0 ? sortedPeriods[sortedPeriods.length - 1] : null;

  useEffect(() => {
    if (latestPeriod) {
      setLmpStartInput(latestPeriod.startDate);
      setLmpEndInput(latestPeriod.endDate || '');
    } else {
      setLmpStartInput('');
      setLmpEndInput('');
    }
    if (currentUser?.customCycleLength) {
      setCycleLenInput(currentUser.customCycleLength);
    } else {
      setCycleLenInput(28);
    }
  }, [latestPeriod, currentUser?.customCycleLength]);

  const todayMetrics = useMemo(
    () => calculateCycleMetrics(currentUser, lockedTodayISO),
    [currentUser, lockedTodayISO]
  );

  const selectedMetrics = useMemo(
    () => calculateCycleMetrics(currentUser, selectedDateStr),
    [currentUser, selectedDateStr]
  );

  const trialStatus = useMemo(() => getTrialStatus(currentUser), [currentUser]);

  // Trigger a subtle UI alert & toast whenever the cycle stage transitions (when alerts are enabled)
  useEffect(() => {
    if (!currentUser || !firebaseUid || !todayMetrics.hasLoggedPeriods || todayMetrics.cycleDay <= 0) {
      if (!todayMetrics.hasLoggedPeriods) {
        prevObservedStageRef.current = null;
        setStageTransitionAlert(null);
      }
      return;
    }

    const alertsEnabled = currentUser.phaseShiftNotificationsEnabled !== false;
    const currentStage = todayMetrics.stageKey;
    const storedLastStage = currentUser.lastNotifiedStageKey;
    const prevObserved =
      prevObservedStageRef.current?.uid === firebaseUid
        ? prevObservedStageRef.current.stageKey
        : null;

    const priorStage = prevObserved || storedLastStage || null;
    prevObservedStageRef.current = { uid: firebaseUid, stageKey: currentStage };

    // First-time baseline: record current stage quietly without raising a false transition notification
    if (!priorStage) {
      updateCurrentUser((prev) => ({
        ...prev,
        lastNotifiedStageKey: currentStage,
      }));
      return;
    }

    if (priorStage !== currentStage) {
      const guidance = PHASE_SHIFT_NOTIFICATION_DATA[currentStage];
      const fromInfo = PHASE_ADVISOR_DATA[priorStage];
      const toInfo = PHASE_ADVISOR_DATA[currentStage];
      const nowIso = new Date().toISOString();

      updateCurrentUser((prev) => ({
        ...prev,
        lastNotifiedStageKey: currentStage,
        lastPhaseShiftNotifiedAt: nowIso,
        lastPhaseShiftSummary: {
          fromStage: priorStage,
          toStage: currentStage,
          notifiedAt: nowIso,
          nutritionTip: guidance.nutritionTip,
          skincareTip: guidance.skincareTip,
          recommendedSnack: guidance.recommendedSnack,
          recommendedTreatment: guidance.recommendedTreatment,
        },
      }));

      if (alertsEnabled) {
        setStageTransitionAlert({
          fromStage: priorStage,
          toStage: currentStage,
          headline: `${guidance.emoji} Stage Transition: ${fromInfo.everydayName} → ${toInfo.everydayName}`,
          tip: `${guidance.hormoneShiftText} ${guidance.recommendedSnack}`,
          detectedAt: nowIso,
        });
        showToast(
          `${guidance.emoji} Cycle stage transitioned to ${toInfo.everydayName} (${toInfo.shortName}).`,
          'info'
        );
      }
    }
  }, [
    currentUser,
    firebaseUid,
    todayMetrics.hasLoggedPeriods,
    todayMetrics.cycleDay,
    todayMetrics.stageKey,
    updateCurrentUser,
    showToast,
  ]);

  // =========================================================================
  // AUTH HANDLERS (FIREBASE AUTH ONLY + CREATE ACCOUNT -> LOG IN SECTION FLOW)
  // =========================================================================

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = authEmail.trim().toLowerCase();
    const cleanPass = authPassword.trim();
    if (!cleanEmail) {
      setAuthNotice({ tone: 'error', message: 'Please enter your email address.' });
      return;
    }

    if (authMode === 'forgot') {
      setAuthLoading(true);
      const sent = await sendPasswordResetEmailFirebase(cleanEmail);
      setAuthLoading(false);
      if (sent) {
        setAuthNotice({
          tone: 'success',
          message: `Password reset link sent to ${cleanEmail}. Check your inbox (and spam folder), then log in.`,
        });
        setAuthMode('login');
      } else {
        setAuthNotice({
          tone: 'error',
          message: 'Could not send reset email. Check the email spelling or create an account.',
        });
      }
      return;
    }

    if (!cleanPass || cleanPass.length < 6) {
      setAuthNotice({
        tone: 'error',
        message: 'Please enter your password (at least 6 characters).',
      });
      return;
    }

    setAuthLoading(true);
    await setFirebaseAuthRememberPersistence(rememberMe);

    if (authMode === 'signup') {
      if (!authName.trim()) {
        setAuthLoading(false);
        setAuthNotice({ tone: 'error', message: 'Please enter your full name to create an account.' });
        return;
      }

      // Hold non-sensitive signup details temporarily in sessionStorage until user signs in via Log In section
      savePendingSignupProfile({
        email: cleanEmail,
        name: authName.trim(),
        age: authAge.trim(),
        phone: authPhone.trim(),
        createdAt: Date.now(),
      });

      const res = await signUpWithEmailPasswordFirebase(cleanEmail, cleanPass, authName.trim());
      setAuthLoading(false);

      if (res.errorCode && res.errorCode !== 'auth/email-already-in-use') {
        clearPendingSignupProfile();
        const readableErr =
          res.errorCode === 'auth/weak-password'
            ? 'Password must be at least 6 characters.'
            : res.errorCode === 'auth/invalid-email'
            ? 'Please enter a valid email address.'
            : res.errorMessage || 'Could not create account. Please try again.';
        setAuthNotice({ tone: 'error', message: readableErr });
        return;
      }

      // Every newly created account must verify & sign in through the Log In section (never auto-signed-in)
      setAuthPassword('');
      setAuthMode('login');

      if (res.emailVerified) {
        setAuthNotice({
          tone: 'success',
          message: `Account for ${cleanEmail} already exists and is verified. Please enter your password here in the Log In section.`,
        });
      } else {
        setAuthNotice({
          tone: 'verification',
          pendingVerifyEmail: cleanEmail,
          message: res.verificationEmailSent
            ? `Account created! Verification link sent to ${cleanEmail}. Verify via email (also check Spam), then sign in here in the Log In section.`
            : `Account created for ${cleanEmail}. Verify your email first, then sign in here in the Log In section.`,
        });
      }
      return;
    }

    // SIGN IN FLOW (All users & Owner Admin must authenticate through Firebase Auth)
    pendingAuthSourceRef.current =
      cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase() ? 'Admin Login' : 'Sign In';

    const signInRes = await signInWithEmailPasswordFirebase(cleanEmail, cleanPass, false);
    setAuthLoading(false);

    if (signInRes.errorCode === 'auth/email-not-verified') {
      pendingAuthSourceRef.current = null;
      setAuthNotice({
        tone: 'verification',
        pendingVerifyEmail: cleanEmail,
        message:
          'Your email is not verified yet. Please check your inbox (and spam folder) to verify your account, or click Resend Verification Email below.',
      });
      return;
    }

    if (signInRes.user && signInRes.emailVerified) {
      setAuthPassword('');
      try {
        localStorage.setItem(STORAGE_REMEMBERED_EMAIL_KEY, cleanEmail);
        localStorage.setItem(STORAGE_REMEMBER_ME_KEY, String(rememberMe));
        if (cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase()) {
          setIsAdminSession(true);
          sessionStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
        }
      } catch {
        // ignore
      }
      setAuthNotice(null);
      showToast(
        cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase()
          ? '🛡️ Signed in to Owner Admin Dashboard.'
          : '🌸 Welcome back to BloomCampus!',
        'success'
      );
      return;
    }

    pendingAuthSourceRef.current = null;
    const isOwnerAttempt = cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase();
    const errMsg =
      signInRes.errorCode === 'auth/wrong-password' ||
      signInRes.errorCode === 'auth/invalid-credential'
        ? isOwnerAttempt
          ? `Incorrect email or password for ${cleanEmail}. If this owner account uses Google Sign-In, tap "Continue with Google" below or use "Forgot password?".`
          : 'Incorrect email or password. Please double-check or reset your password.'
        : signInRes.errorCode === 'auth/user-not-found'
        ? 'No account found with this email. Tap Create Account above to get started.'
        : signInRes.errorCode === 'auth/too-many-requests'
        ? 'Too many attempts. Please wait a minute before trying again.'
        : signInRes.errorMessage || 'Sign in failed. Please check your credentials.';
    setAuthNotice({ tone: 'error', message: errMsg });
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    pendingAuthSourceRef.current = 'Google Sign In';
    try {
      await setFirebaseAuthRememberPersistence(rememberMe);
      const user = await signInWithGooglePopup();
      if (user && user.email) {
        const cleanEmail = user.email.trim().toLowerCase();
        setAuthPassword('');
        try {
          localStorage.setItem(STORAGE_REMEMBERED_EMAIL_KEY, cleanEmail);
          localStorage.setItem(STORAGE_REMEMBER_ME_KEY, String(rememberMe));
          if (cleanEmail === OWNER_ADMIN_EMAIL.toLowerCase()) {
            setIsAdminSession(true);
            sessionStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
          }
        } catch {
          // ignore
        }
        setAuthNotice(null);
        showToast('🌸 Signed in with Google!', 'success');
      }
    } catch {
      pendingAuthSourceRef.current = null;
      setAuthNotice({
        tone: 'error',
        message: 'Google Sign-In was canceled or blocked. You can sign in using email & password.',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    const targetEmail = (authNotice?.pendingVerifyEmail || authEmail).trim().toLowerCase();
    if (!targetEmail || !authPassword.trim()) {
      setAuthNotice({
        tone: 'verification',
        pendingVerifyEmail: targetEmail,
        message: 'Enter your email and password in the Log In form above, then click Resend Verification Email.',
      });
      return;
    }
    setResendLoading(true);
    const res = await resendVerificationEmailFirebase(targetEmail, authPassword.trim());
    setResendLoading(false);

    if (res.alreadyVerified) {
      setAuthNotice({
        tone: 'success',
        message: `${targetEmail} is already verified! Click Log In now.`,
      });
    } else if (res.sent) {
      setAuthNotice({
        tone: 'verification',
        pendingVerifyEmail: targetEmail,
        message: `New verification email sent to ${targetEmail}! Open your inbox (or Spam folder), click the link, then return here to Log In.`,
      });
    } else {
      setAuthNotice({
        tone: 'verification',
        pendingVerifyEmail: targetEmail,
        message:
          res.errorMessage ||
          'Could not resend verification email right now. Please verify your password and try again in a moment.',
      });
    }
  };

  const handleSignOut = async () => {
    await signOutFirebase();
    setFirebaseUid(null);
    setCurrentEmail(null);
    setCurrentUser(null);
    setUsersMap({});
    setSupportInquiries([]);
    setIsAdminSession(false);
    clearPendingSignupProfile();
    try {
      sessionStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
    } catch {
      // ignore
    }
    showToast('Signed out safely.', 'info');
  };

  // =========================================================================
  // TRACKER & DAILY LOG HANDLERS
  // =========================================================================

  const handleSavePeriodForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lmpStartInput) {
      showToast('Please select the start date of your last period.', 'warning');
      return;
    }
    if (lmpEndInput && lmpEndInput < lmpStartInput) {
      showToast('End date cannot be earlier than start date.', 'warning');
      return;
    }
    const clampedCycleLen = Math.max(18, Math.min(60, Number(cycleLenInput) || 28));

    updateCurrentUser((prev) => {
      const existingPeriods = getSortedPeriods(prev.periods);
      // Update existing period matching startDate or append a new manual entry
      const filteredManual = existingPeriods.filter(
        (p) => !p.autoGenerated && p.startDate !== lmpStartInput
      );
      const updatedManualList: PeriodRecord[] = [
        ...filteredManual,
        {
          startDate: lmpStartInput,
          endDate: lmpEndInput || null,
          autoGenerated: false,
        },
      ].sort((a, b) => a.startDate.localeCompare(b.startDate));
      return {
        ...prev,
        customCycleLength: clampedCycleLen,
        periods: updatedManualList,
      };
    });

    showToast('✅ Period dates and cycle length saved!', 'success');
  };

  const handleCalendarSetStart = (dateStr: string) => {
    setLmpStartInput(dateStr);
    updateCurrentUser((prev) => {
      const manualOnly = getSortedPeriods(prev.periods).filter(
        (p) => !p.autoGenerated && p.startDate !== dateStr
      );
      return {
        ...prev,
        periods: [...manualOnly, { startDate: dateStr, endDate: null, autoGenerated: false }].sort(
          (a, b) => a.startDate.localeCompare(b.startDate)
        ),
      };
    });
    showToast(`🩸 Set ${formatHumanDate(dateStr)} as Period Start Date.`, 'success');
  };

  const handleCalendarSetEnd = (dateStr: string) => {
    if (!latestPeriod) {
      showToast('Log a Period Start Date first before setting an End Date.', 'warning');
      return;
    }
    if (dateStr < latestPeriod.startDate) {
      showToast('End Date cannot be before Start Date.', 'warning');
      return;
    }
    setLmpEndInput(dateStr);
    updateCurrentUser((prev) => {
      const updated = getSortedPeriods(prev.periods).map((p) =>
        p.startDate === latestPeriod.startDate
          ? { ...p, endDate: dateStr, autoGenerated: false }
          : p
      );
      return { ...prev, periods: updated };
    });
    showToast(`✅ Set ${formatHumanDate(dateStr)} as Period End Date.`, 'success');
  };

  const handleDeletePeriodRecord = (startDate: string) => {
    updateCurrentUser((prev) => ({
      ...prev,
      periods: getSortedPeriods(prev.periods).filter((p) => p.startDate !== startDate),
    }));
    showToast('Removed period entry.', 'info');
  };

  const selectedDayLog = useMemo(() => {
    return (
      currentUser?.dailyLogs?.[selectedDateStr] || {
        mood: null,
        stageAtLog: null,
        symptoms: [],
        symptomDurations: {},
        intensity: {},
        habits: [],
        notes: '',
        waterGlasses: 0,
        loggedSnacks: [],
        cravingLogged: null,
      }
    );
  }, [currentUser?.dailyLogs, selectedDateStr]);

  const updateDailyLogForDate = useCallback(
    (
      dateStr: string,
      updater: (curr: NonNullable<UserData['dailyLogs'][string]>) => NonNullable<UserData['dailyLogs'][string]>
    ) => {
      updateCurrentUser((prev) => {
        const dayMetrics = calculateCycleMetrics(prev, dateStr);
        const derivedStage =
          dayMetrics.hasLoggedPeriods && dayMetrics.cycleDay > 0
            ? PHASE_ADVISOR_DATA[dayMetrics.stageKey].shortName
            : null;
        const existing = prev.dailyLogs?.[dateStr] || {
          mood: null,
          stageAtLog: derivedStage,
          symptoms: [],
          symptomDurations: {},
          intensity: {},
          habits: [],
          notes: '',
          waterGlasses: 0,
          loggedSnacks: [],
          cravingLogged: null,
        };
        const updated = updater({
          ...existing,
          stageAtLog: existing.stageAtLog || derivedStage,
        });
        return {
          ...prev,
          dailyLogs: {
            ...(prev.dailyLogs || {}),
            [dateStr]: updated,
          },
        };
      });
    },
    [updateCurrentUser]
  );

  const handleLogEmergencyPill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pillDateTimeInput) {
      showToast('Select the date and time you took the pill.', 'warning');
      return;
    }
    const isoTimestamp = new Date(pillDateTimeInput).toISOString();
    const dateStr = pillDateTimeInput.slice(0, 10);
    const newEntry: EmergencyPillLog = {
      timestamp: isoTimestamp,
      dateStr,
    };
    updateCurrentUser((prev) => ({
      ...prev,
      emergencyPills: [newEntry, ...(prev.emergencyPills || [])],
    }));
    showToast('💊 Emergency pill logged privately. Expect temporary cycle timing shifts.', 'info');
  };

  const handleDeletePillLog = (timestamp: string) => {
    updateCurrentUser((prev) => ({
      ...prev,
      emergencyPills: (prev.emergencyPills || []).filter((p) => p.timestamp !== timestamp),
    }));
    showToast('Removed emergency pill log.', 'info');
  };

  // Payment / Access Modal Handlers
  const handleOrangeMoneySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!omSenderPhone.trim() || !omTxId.trim()) {
      showToast('Enter both your Orange Money phone number and transaction ID.', 'warning');
      return;
    }
    const nowIso = new Date().toISOString();
    const txIdClean = omTxId.trim();
    const senderPhoneClean = omSenderPhone.trim();
    updateCurrentUser(
      (prev) => ({
        ...prev,
        phone: senderPhoneClean,
        subscriptionStatus: 'pending_verification',
        paymentMethod: 'Orange Money (Pending Verification)',
        pendingPayment: {
          id: `pay-${Date.now()}`,
          senderName: prev.name,
          userEmail: prev.email,
          senderPhone: senderPhoneClean,
          transactionId: txIdClean,
          amount: 'Le 30',
          method: 'Orange Money',
          submittedAt: nowIso,
          status: 'pending',
        },
      }),
      'pending_payment'
    );
    void syncSupportInquiryToFirestore({
      id: `inq_pay_${Date.now()}`,
      userName: currentUser.name,
      userEmail: currentUser.email,
      userPhone: senderPhoneClean,
      deviceInfo: getClientDeviceLabel(),
      subject: `Orange Money Pass Verification — ${txIdClean}`,
      message: `Phone: ${senderPhoneClean} | TxID: ${txIdClean} | Amount: Le 30`,
      type: 'payment',
      createdAt: nowIso,
    }).catch(() => {});
    setOmTxId('');
    setShowPaywallModal(false);
    showToast('⏳ Payment submitted! The owner will verify your Le 30 pass shortly.', 'success');
  };

  const handleVipPasswordUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const codeInput = vipPassInput.trim();
    if (!codeInput) {
      showToast('Enter your free access pass code.', 'warning');
      return;
    }

    let isValidPass = false;
    const idToken = await getCurrentFirebaseIdToken();
    if (idToken) {
      try {
        const res = await fetch('/api/auth/verify-free-pass', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ code: codeInput }),
        });
        if (res.ok) {
          const data = await res.json();
          isValidPass = Boolean(data?.valid);
        }
      } catch {
        isValidPass = isSecretVipPassword(codeInput, adminConfig.freeAccessPassword);
      }
    } else {
      isValidPass = isSecretVipPassword(codeInput, adminConfig.freeAccessPassword);
    }

    if (!isValidPass) {
      showToast('Invalid free access password. Contact support for an active pass code.', 'warning');
      return;
    }

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    updateCurrentUser(
      (prev) => ({
        ...prev,
        isVip: true,
        usedFreeAccessPassword: true,
        subscriptionStatus: 'free_password',
        subscriptionUntil: Date.now() + thirtyDaysMs,
        paymentMethod: '1-Month Free Pass Code',
        pendingPayment: null,
        submittedFreeCode: codeInput,
      }),
      'free_code'
    );
    setVipPassInput('');
    setShowPaywallModal(false);
    showToast('🎁 30-Day Free Pass unlocked!', 'success');
  };

  const handleSendSupportInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !supportMessage.trim()) {
      showToast('Please write your message before sending.', 'warning');
      return;
    }
    setSupportSending(true);
    try {
      await syncSupportInquiryToFirestore({
        id: `inq_sup_${Date.now()}`,
        userName: currentUser.name,
        userEmail: currentUser.email,
        userPhone: currentUser.phone,
        userAge: currentUser.age,
        deviceInfo: getClientDeviceLabel(),
        subject: supportSubject.trim() || 'Student Support Inquiry',
        message: supportMessage.trim(),
        type: 'support',
        createdAt: new Date().toISOString(),
      });
      setSupportSubject('');
      setSupportMessage('');
      setShowSupportModal(false);
      showToast('💌 Message sent to BloomCampus Support!', 'success');
    } catch {
      showToast('Could not send right now. Email abdulbobsonbaituray@gmail.com directly.', 'warning');
    } finally {
      setSupportSending(false);
    }
  };

  const handleQuickFindJump = (item: QuickFindEntry) => {
    setQuickFindOpen(false);
    setQuickFindQuery('');
    if (item.action === 'open_calendar') {
      setActiveSection('tracker');
      setShowCalendarModal(true);
      return;
    }
    if (item.action === 'open_clinic_summary') {
      setShowClinicSummaryModal(true);
      return;
    }
    setActiveSection(item.section);
    if (item.section === 'tracker' && item.subTab) {
      setTrackerSubTab(item.subTab as TrackerSubTab);
    } else if (item.section === 'checkin' && item.subTab) {
      setCheckinSubTab(item.subTab as CheckinSubTab);
    } else if (item.section === 'guide' && item.subTab) {
      setGuideSubTab(item.subTab as GuideSubTab);
    } else if (item.section === 'analytics' && item.subTab) {
      setAnalyticsSubTab(item.subTab as AnalyticsSubTab);
    }
  };

  const handleBadgeNavigate = (section: CoreNavSection, subAction?: 'hydration' | 'trends') => {
    setActiveSection(section);
    if (section === 'analytics') {
      setAnalyticsSubTab(subAction === 'hydration' ? 'hydration' : 'trends');
    } else if (section === 'guide') {
      setGuideSubTab('myths');
    }
  };

  const filteredQuickFind = useMemo(() => {
    const q = quickFindQuery.trim().toLowerCase();
    if (!q) return QUICK_FIND_ITEMS;
    return QUICK_FIND_ITEMS.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.subtitle.toLowerCase().includes(q) ||
        i.keywords.toLowerCase().includes(q)
    );
  }, [quickFindQuery]);

  const filteredSymptoms = useMemo(() => {
    const q = symptomSearch.trim().toLowerCase();
    if (!q) return SYMPTOM_ITEMS;
    return SYMPTOM_ITEMS.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.keywords.toLowerCase().includes(q)
    );
  }, [symptomSearch]);

  const symptomHistoryEntries = useMemo(() => {
    if (!currentUser?.dailyLogs) return [];
    return Object.entries(currentUser.dailyLogs)
      .filter(([, entry]) => {
        if (!entry) return false;
        return Boolean(
          entry.mood ||
            (entry.symptoms && entry.symptoms.length > 0) ||
            (entry.habits && entry.habits.length > 0) ||
            (entry.notes && entry.notes.trim().length > 0)
        );
      })
      .sort(([a], [b]) => b.localeCompare(a));
  }, [currentUser?.dailyLogs]);

  // =========================================================================
  // AUTH INITIALIZATION LOADING STATE
  // =========================================================================
  if (!authInitialized) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center p-6">
        <div className="rounded-3xl bg-white border-2 border-lavender-200 px-8 py-6 shadow-md text-center space-y-2">
          <div className="text-3xl">🌸</div>
          <div className="font-display font-extrabold text-base text-slate-900">BloomCampus</div>
          <div className="text-xs text-slate-500 font-semibold">
            Restoring your private verified session...
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ADMIN DASHBOARD VIEW (Strictly Verified Owner Firebase Auth Only)
  // =========================================================================
  if (isAdminSession && currentEmail === OWNER_ADMIN_EMAIL.toLowerCase()) {
    return (
      <div className="min-h-screen bg-cream">
        <OwnerAdminDashboard
          usersMap={usersMap}
          adminConfig={adminConfig}
          supportInquiries={supportInquiries}
          onUpdateAdminConfig={(nextCfg) => {
            setAdminConfig(nextCfg);
            saveAdminConfig(nextCfg);
            void syncAdminConfigToFirestore(nextCfg);
            void getCurrentFirebaseIdToken().then((idToken) => {
              if (!idToken) return;
              fetch('/api/admin/config', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify(nextCfg),
              }).catch(() => {});
            });
          }}
          onApproveUserPayment={(userEmail) => {
            const clean = userEmail.toLowerCase().trim();
            setUsersMap((prev) => {
              const target = prev[clean];
              if (!target) return prev;
              const nextUser: UserData = {
                ...target,
                isVip: true,
                subscriptionStatus: 'active',
                subscriptionUntil: Date.now() + 30 * 24 * 60 * 60 * 1000,
                paymentMethod: 'Orange Money (Approved)',
                pendingPayment: target.pendingPayment
                  ? { ...target.pendingPayment, status: 'approved', reviewedAt: new Date().toISOString() }
                  : null,
                lastUpdatedAt: new Date().toISOString(),
              };
              const targetUid = target.uid || emailToDocId(clean);
              void saveUserDocByUid(targetUid, nextUser, { action: 'admin' });
              return { ...prev, [clean]: nextUser };
            });
            showToast(`✅ Approved pass for ${clean}.`, 'success');
          }}
          onExtendUserFreeAccess={(userEmail, days = 30) => {
            const clean = userEmail.toLowerCase().trim();
            setUsersMap((prev) => {
              const target = prev[clean];
              if (!target) return prev;
              const base = Math.max(Date.now(), target.subscriptionUntil || Date.now());
              const nextUser: UserData = {
                ...target,
                subscriptionStatus: 'active',
                subscriptionUntil: base + days * 24 * 60 * 60 * 1000,
                lastUpdatedAt: new Date().toISOString(),
              };
              const targetUid = target.uid || emailToDocId(clean);
              void saveUserDocByUid(targetUid, nextUser, { action: 'admin' });
              return { ...prev, [clean]: nextUser };
            });
            showToast(`🎁 Extended access by ${days} days for ${clean}.`, 'success');
          }}
          onRejectOrExpireUser={(userEmail, mode) => {
            const clean = userEmail.toLowerCase().trim();
            setUsersMap((prev) => {
              const target = prev[clean];
              if (!target) return prev;
              const nextUser: UserData = {
                ...target,
                subscriptionStatus: 'expired',
                subscriptionUntil: Date.now() - 1000,
                pendingPayment:
                  target.pendingPayment && mode === 'reject'
                    ? { ...target.pendingPayment, status: 'rejected', reviewedAt: new Date().toISOString() }
                    : null,
                lastUpdatedAt: new Date().toISOString(),
              };
              const targetUid = target.uid || emailToDocId(clean);
              void saveUserDocByUid(targetUid, nextUser, { action: 'admin' });
              return { ...prev, [clean]: nextUser };
            });
            showToast(`Updated access status (${mode}) for ${clean}.`, 'warning');
          }}
          onClearPendingVerification={(userEmail) => {
            const clean = userEmail.toLowerCase().trim();
            setUsersMap((prev) => {
              const target = prev[clean];
              if (!target) return prev;
              const nextUser: UserData = {
                ...target,
                pendingPayment: null,
                lastUpdatedAt: new Date().toISOString(),
              };
              const targetUid = target.uid || emailToDocId(clean);
              void saveUserDocByUid(targetUid, nextUser, { action: 'admin' });
              return { ...prev, [clean]: nextUser };
            });
          }}
          onRegisterNewUserByAdmin={(params) => {
            const clean = params.email.trim().toLowerCase();
            const originalClean = params.originalEmail?.trim().toLowerCase();
            const existing = (originalClean && usersMap[originalClean]) || usersMap[clean];
            const days = params.subscriptionDays || 30;
            const targetUid = existing?.uid || emailToDocId(clean);
            const newObj: UserData = existing
              ? {
                  ...existing,
                  uid: targetUid,
                  email: clean,
                  name: params.name.trim(),
                  age: params.age.trim(),
                  phone: params.phone.trim(),
                  subscriptionStatus: params.subscriptionStatus || existing.subscriptionStatus || 'active',
                  subscriptionUntil: Date.now() + days * 24 * 60 * 60 * 1000,
                  lastUpdatedAt: new Date().toISOString(),
                }
              : {
                  ...createDefaultUserObject(
                    params.name.trim(),
                    clean,
                    '',
                    params.age,
                    params.phone,
                    targetUid
                  ),
                  subscriptionStatus: params.subscriptionStatus || 'active',
                  subscriptionUntil: Date.now() + days * 24 * 60 * 60 * 1000,
                };
            setUsersMap((prev) => ({ ...prev, [clean]: newObj }));
            void saveUserDocByUid(targetUid, newObj, { action: 'admin' });
            showToast(`Updated ${clean} in Firestore.`, 'success');
          }}
          onDeleteUser={(userEmail) => {
            const clean = userEmail.toLowerCase().trim();
            setUsersMap((prev) => {
              const copy = { ...prev };
              delete copy[clean];
              return copy;
            });
            void deleteUserFromFirestore(clean);
            void getCurrentFirebaseIdToken().then((idToken) => {
              if (!idToken) return;
              fetch('/api/users/delete', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ email: clean }),
              }).catch(() => {});
            });
          }}
          onBulkDeleteUsers={(emails) => {
            const lowered = emails.map((e) => e.toLowerCase().trim());
            setUsersMap((prev) => {
              const copy = { ...prev };
              lowered.forEach((em) => delete copy[em]);
              return copy;
            });
            void deleteMultipleUsersFromFirestore(lowered);
            void getCurrentFirebaseIdToken().then((idToken) => {
              if (!idToken) return;
              fetch('/api/users/delete', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({ emails: lowered }),
              }).catch(() => {});
            });
          }}
          onDeleteSupportInquiry={(inquiryId, clearAll) => {
            setSupportInquiries((prev) =>
              clearAll ? [] : prev.filter((i) => i.id !== inquiryId)
            );
            if (clearAll) {
              void clearAllSupportInquiriesFromFirestore();
            } else if (inquiryId) {
              void deleteSupportInquiryFromFirestore(inquiryId);
            }
          }}
          onRefreshUsers={refreshAdminUsersFromFirestore}
          onExitAdmin={() => {
            setIsAdminSession(false);
            try {
              sessionStorage.removeItem(STORAGE_ADMIN_SESSION_KEY);
            } catch {
              // ignore
            }
          }}
          showToast={showToast}
        />
        {toast && (
          <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl bg-slate-900 text-white text-xs font-bold shadow-xl border border-gold-500">
            {toast.message}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // UNAUTHENTICATED LOGIN / SIGNUP SCREEN
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-cream flex flex-col justify-between p-4 sm:p-6">
        <main className="w-full max-w-md mx-auto my-auto space-y-5">
          {/* Brand Header */}
          <div className="rounded-3xl bg-gradient-to-br from-plum-900 via-lavender-900 to-rose-900 text-white p-6 shadow-xl border border-gold-500/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-gold-400">
                  Private College Cycle &amp; Wellness
                </div>
                <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight mt-0.5">
                  BloomCampus
                </h1>
                <p className="text-xs text-lavender-100 mt-1">
                  Simple period tracking, 6-month insights, study sync &amp; Sidratu skincare care.
                </p>
              </div>
              <span className="text-3xl shrink-0">🌸</span>
            </div>
            <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-amber-200">
              <span>🎁 1-Week (7-Day) Free Access on Sign Up</span>
              <span>📍 Sidratu Clinic · Freetown</span>
            </div>
          </div>

          {/* Auth Card */}
          <div className="rounded-3xl bg-white border-2 border-lavender-200 p-5 sm:p-6 shadow-md space-y-4">
            {/* Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-cream border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthNotice(null);
                }}
                className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  authMode === 'login'
                    ? 'bg-lavender-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthNotice(null);
                }}
                className={`py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-lavender-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Persistent Email Verification Banner */}
            {authNotice && (
              <div
                className={`rounded-2xl p-3.5 border text-xs space-y-2.5 ${
                  authNotice.tone === 'verification'
                    ? 'bg-amber-50 border-amber-300 text-amber-950'
                    : authNotice.tone === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : authNotice.tone === 'info'
                    ? 'bg-lavender-50 border-lavender-200 text-lavender-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}
              >
                <div className="font-bold leading-relaxed">{authNotice.message}</div>
                {authNotice.tone === 'verification' && (
                  <button
                    type="button"
                    onClick={handleResendVerificationEmail}
                    disabled={resendLoading}
                    className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{resendLoading ? 'Sending Verification Email...' : 'Resend Verification Email'}</span>
                  </button>
                )}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="e.g., Aminata Kamara"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-lavender-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Age (Optional)</label>
                      <input
                        type="number"
                        min={13}
                        max={65}
                        value={authAge}
                        onChange={(e) => setAuthAge(e.target.value)}
                        placeholder="e.g., 21"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-lavender-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Phone (Optional)</label>
                      <input
                        type="tel"
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        placeholder="e.g., 076..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-lavender-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-lavender-500"
                  required
                />
              </div>

              {authMode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showAuthPassword ? 'text' : 'password'}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full pl-3.5 pr-20 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-lavender-500"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowAuthPassword((prev) => !prev)}
                      aria-label={showAuthPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showAuthPassword}
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-lavender-700 hover:text-lavender-900 hover:bg-lavender-50 transition-colors cursor-pointer"
                    >
                      {showAuthPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>{showAuthPassword ? 'Hide' : 'Show'}</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-0.5">
                <label className="flex items-center gap-2 text-slate-600 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-lavender-700 focus:ring-lavender-500"
                  />
                  <span>Keep me signed in</span>
                </label>
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'forgot' ? 'login' : 'forgot')}
                  className="text-lavender-700 hover:text-lavender-900 font-bold cursor-pointer"
                >
                  {authMode === 'forgot' ? 'Back to Log In' : 'Forgot password?'}
                </button>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-2xl bg-lavender-700 hover:bg-lavender-800 disabled:opacity-60 text-white font-display font-extrabold text-sm shadow-sm transition-all cursor-pointer"
              >
                {authLoading
                  ? 'Please wait...'
                  : authMode === 'signup'
                  ? 'Create Verified Account →'
                  : authMode === 'forgot'
                  ? 'Send Password Reset Email'
                  : 'Log In to BloomCampus →'}
              </button>
            </form>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[11px] font-bold uppercase tracking-wider">
                <span className="bg-white px-2.5 text-slate-400">or continue with</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={authLoading}
              className="w-full py-2.5 px-4 rounded-2xl bg-cream hover:bg-lavender-50 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>🔵 Continue with Google</span>
            </button>
          </div>
        </main>

        <footer className="text-center text-[11px] text-slate-500 py-3">
          Created by <strong>{CREATOR_NAME}</strong> · {CREATOR_EMAIL}
        </footer>
      </div>
    );
  }

  // =========================================================================
  // MAIN AUTHENTICATED BLOOMCAMPUS EXPERIENCE
  // =========================================================================

  const currentStageInfo = PHASE_ADVISOR_DATA[todayMetrics.stageKey];
  const isAccountExpired = trialStatus.status === 'expired';
  const showHardPaywall = isAccountExpired && currentUser.role !== 'admin';

  return (
    <div
      className={`min-h-screen bg-cream pb-24 transition-colors ${
        privacyBlur ? 'privacy-blur-active' : ''
      }`}
    >
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          className={`fixed top-16 right-3 sm:right-6 z-50 max-w-sm px-4 py-3 rounded-2xl shadow-xl border text-xs font-extrabold transition-all no-print ${
            toast.type === 'success'
              ? 'bg-emerald-900 text-white border-emerald-400'
              : toast.type === 'warning'
              ? 'bg-amber-900 text-amber-50 border-amber-400'
              : 'bg-slate-900 text-white border-lavender-400'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* STICKY COMPACT TOP HEADER */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-lavender-200/80 shadow-2xs no-print">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
          {/* Left: Brand & Active Phase */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-plum-900 to-lavender-700 text-white flex items-center justify-center text-lg shadow-xs shrink-0">
              🌸
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-extrabold text-sm sm:text-base text-slate-900 truncate">
                  BloomCampus
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full bg-lavender-100 text-lavender-900 text-[10px] font-extrabold">
                  {todayMetrics.hasLoggedPeriods && todayMetrics.cycleDay > 0
                    ? `Day ${todayMetrics.cycleDay} · ${currentStageInfo.everydayName}`
                    : 'Period Not Logged'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                Hi, <strong className="text-slate-700">{currentUser.name}</strong> ·{' '}
                <button
                  type="button"
                  onClick={() => setShowPaywallModal(true)}
                  className="text-lavender-700 hover:underline font-bold cursor-pointer"
                >
                  {trialStatus.label}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Quick Find + Compact Utility Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setQuickFindOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Jump quickly to any tool"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Quick Find</span>
            </button>

            <button
              type="button"
              onClick={() => setShowClinicSummaryModal(true)}
              className="hidden md:flex px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs items-center gap-1 cursor-pointer"
              title="Open Doctor & Clinic Summary Report"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Clinic PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setPrivacyBlur((prev) => !prev)}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                privacyBlur
                  ? 'bg-plum-900 text-gold-400 border-gold-500'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title={privacyBlur ? 'Disable Campus Privacy Blur' : 'Blur Sensitive Dates & Notes'}
              aria-label="Toggle Privacy Blur"
            >
              {privacyBlur ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {currentEmail === OWNER_ADMIN_EMAIL.toLowerCase() && (
              <button
                type="button"
                onClick={() => {
                  setIsAdminSession(true);
                  try {
                    sessionStorage.setItem(STORAGE_ADMIN_SESSION_KEY, 'true');
                  } catch {
                    // ignore
                  }
                }}
                className="p-2 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 border border-gold-500/40 cursor-pointer"
                title="Open Owner Admin Dashboard"
              >
                <Shield className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 border border-slate-200 transition-colors cursor-pointer"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT SHELL */}
      <main className="max-w-5xl mx-auto px-3 sm:px-5 pt-4 sm:pt-5 space-y-4">
        {/* SUBTLE CYCLE STAGE TRANSITION ALERT */}
        {stageTransitionAlert && currentUser.phaseShiftNotificationsEnabled !== false && (
          <div
            role="status"
            aria-live="polite"
            className="rounded-2xl bg-lavender-50 border border-lavender-300 px-4 py-3 shadow-xs flex items-start justify-between gap-3 text-xs no-print"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-lavender-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <div className="space-y-0.5">
                <div className="font-display font-extrabold text-lavender-950">
                  {stageTransitionAlert.headline}
                </div>
                <p className="text-slate-700 leading-relaxed">{stageTransitionAlert.tip}</p>
                <div className="pt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSection('tracker');
                      setTrackerSubTab('dates');
                      setShowCycleAlerts(true);
                      setStageTransitionAlert(null);
                    }}
                    className="font-extrabold text-lavender-800 hover:underline cursor-pointer"
                  >
                    View Cycle Shift Alerts →
                  </button>
                  <button
                    type="button"
                    onClick={() => setStageTransitionAlert(null)}
                    className="font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStageTransitionAlert(null)}
              aria-label="Dismiss stage transition alert"
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-lavender-100 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 1: TRACKER ("My Period")                                         */}
        {/* =================================================================== */}
        {activeSection === 'tracker' && (
          <div className="space-y-4">
            {/* Simple Top Summary Card */}
            <section
              className={`rounded-3xl bg-gradient-to-br ${currentStageInfo.bannerGradient} text-white p-5 sm:p-6 shadow-md border border-white/15`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-white/90">
                    <span>{formatLockedTodayHuman()}</span>
                    {todayMetrics.wasAutoRolledOver && (
                      <span className="px-2 py-0.5 rounded-full bg-white/20 text-amber-200 text-[10px] font-extrabold">
                        🔄 Auto-updated to current month
                      </span>
                    )}
                  </div>
                  <h2 className="font-display font-extrabold text-2xl sm:text-3xl flex items-center gap-2">
                    <span>{todayMetrics.hasLoggedPeriods ? currentStageInfo.emoji : '🩸'}</span>
                    <span>
                      {todayMetrics.hasLoggedPeriods && todayMetrics.cycleDay > 0
                        ? `Day ${todayMetrics.cycleDay}: ${currentStageInfo.everydayName}`
                        : 'Log Your Last Period to Start'}
                    </span>
                  </h2>
                  <p className="text-xs sm:text-sm text-white/90 max-w-xl">
                    {todayMetrics.hasLoggedPeriods
                      ? currentStageInfo.everydaySummary
                      : 'No period dates have been logged yet. Enter your last period start date below — BloomCampus never invents or guesses unlogged cycle data.'}
                  </p>
                </div>

                <div className="flex flex-wrap sm:flex-col items-stretch sm:items-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowCalendarModal(true)}
                    className="px-4 py-2.5 rounded-2xl bg-white text-slate-900 hover:bg-lavender-50 font-display font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <CalendarIcon className="w-4 h-4 text-lavender-700" />
                    <span>Open Full Calendar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClinicSummaryModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/20 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Doctor Summary PDF</span>
                  </button>
                </div>
              </div>

              {/* 3 Key Plain-Language Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-white/15 privacy-sensitive">
                <div className="rounded-2xl bg-black/20 px-3.5 py-2.5 border border-white/10">
                  <div className="text-[11px] font-bold text-white/75">Next Period Expected</div>
                  <div className="font-display font-extrabold text-sm sm:text-base text-white mt-0.5 tabular-nums">
                    {todayMetrics.nextPeriodDateStr
                      ? `${formatShortMonthDay(todayMetrics.nextPeriodDateStr)} (${
                          todayMetrics.daysUntilNextPeriod !== null &&
                          todayMetrics.daysUntilNextPeriod >= 0
                            ? `in ${todayMetrics.daysUntilNextPeriod} days`
                            : 'due soon'
                        })`
                      : 'Enter your start date below'}
                  </div>
                </div>

                <div className="rounded-2xl bg-black/20 px-3.5 py-2.5 border border-white/10">
                  <div className="text-[11px] font-bold text-white/75">Fertile Days Window</div>
                  <div className="font-display font-extrabold text-sm sm:text-base text-white mt-0.5 tabular-nums">
                    {todayMetrics.hasLoggedPeriods &&
                    todayMetrics.ovulationWindowStartStr &&
                    todayMetrics.ovulationWindowEndStr
                      ? `${formatShortMonthDay(todayMetrics.ovulationWindowStartStr)} – ${formatShortMonthDay(
                          todayMetrics.ovulationWindowEndStr
                        )}`
                      : 'Log start date to calculate'}
                  </div>
                </div>

                <div className="rounded-2xl bg-black/20 px-3.5 py-2.5 border border-white/10">
                  <div className="text-[11px] font-bold text-white/75">Your Cycle Length</div>
                  <div className="font-display font-extrabold text-sm sm:text-base text-white mt-0.5 tabular-nums">
                    {todayMetrics.hasLoggedPeriods
                      ? `${todayMetrics.avgCycleLength} days · ${
                          todayMetrics.avgPeriodDuration > 0
                            ? `${todayMetrics.avgPeriodDuration}d bleed`
                            : 'End date not logged'
                        }`
                      : 'Not logged yet'}
                  </div>
                </div>
              </div>
            </section>

            {/* Quick 3-Step Guide Banner for New Users */}
            {!hideQuickGuide && (
              <div className="rounded-2xl bg-lavender-50 border border-lavender-200 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-extrabold text-lavender-900">
                    ✨ Quick 3-Step Start Guide
                  </div>
                  <div className="text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      <strong>1.</strong> Enter your last period date below
                    </span>
                    <span>
                      <strong>2.</strong> Tap <em>Daily Log</em> when cramps or moods shift
                    </span>
                    <span>
                      <strong>3.</strong> Check <em>6-Mo Insights</em> to see your rhythm
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHideQuickGuide(true);
                    try {
                      localStorage.setItem(STORAGE_HIDE_GUIDE_KEY, 'true');
                    } catch {
                      // ignore
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-lavender-100 text-lavender-800 border border-lavender-200 text-xs font-bold shrink-0 cursor-pointer"
                >
                  Got it ×
                </button>
              </div>
            )}

            {/* 3-Button Segmented Control */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-white border border-lavender-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setTrackerSubTab('dates')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  trackerSubTab === 'dates'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                🩸 Period Dates
              </button>
              <button
                type="button"
                onClick={() => setTrackerSubTab('insights')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  trackerSubTab === 'insights'
                    ? 'bg-lavender-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                🩺 6-Mo Insights
              </button>
              <button
                type="button"
                onClick={() => setTrackerSubTab('phases')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  trackerSubTab === 'phases'
                    ? 'bg-sage-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                🌱 Cycle Phases
              </button>
            </div>

            {/* SUB-TAB 1A: PERIOD DATES & COLLAPSIBLE HISTORY */}
            {trackerSubTab === 'dates' && (
              <div className="space-y-4">
                <section
                  ref={lmpEditorRef}
                  className="bg-white rounded-3xl border border-rose-200 p-5 sm:p-6 shadow-xs space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                        Update Your Last Period (LMP) Dates
                      </h3>
                      <p className="text-xs text-slate-600">
                        Log your actual period start &amp; end dates. Cycle insights &amp; predictions calculate strictly from what you record.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('guide');
                        setGuideSubTab('pill');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pill className="w-3.5 h-3.5" />
                      <span>Took Emergency Pill? →</span>
                    </button>
                  </div>

                  <form onSubmit={handleSavePeriodForm} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Period Start Date
                      </label>
                      <input
                        type="date"
                        value={lmpStartInput}
                        onChange={(e) => setLmpStartInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Period End Date (Optional)
                      </label>
                      <input
                        type="date"
                        value={lmpEndInput}
                        min={lmpStartInput || undefined}
                        onChange={(e) => setLmpEndInput(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Usual Cycle Length ({cycleLenInput} days)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={18}
                          max={60}
                          value={cycleLenInput}
                          onChange={(e) => setCycleLenInput(Number(e.target.value))}
                          className="w-20 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-rose-400"
                        />
                        <button
                          type="submit"
                          className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-display font-extrabold text-xs sm:text-sm shadow-xs cursor-pointer"
                        >
                          Save Period
                        </button>
                      </div>
                    </div>
                  </form>
                </section>

                {/* Collapsible Period History (Hidden under title with down arrow) */}
                <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowPeriodHistory((prev) => !prev)}
                    aria-expanded={showPeriodHistory}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left hover:bg-cream transition-colors cursor-pointer"
                  >
                    <span className="font-display font-extrabold text-sm text-slate-900">
                      📅 Period History ({sortedPeriods.length} logged)
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${
                        showPeriodHistory ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showPeriodHistory && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-2 privacy-sensitive">
                      {sortedPeriods.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">
                          No periods logged yet. Add your last period date above to build your history.
                        </p>
                      ) : (
                        [...sortedPeriods].reverse().map((p, idx) => {
                          const bleedDays =
                            p.endDate && p.endDate >= p.startDate
                              ? diffDays(p.startDate, p.endDate) + 1
                              : null;
                          return (
                            <div
                              key={`${p.startDate}-${idx}`}
                              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-cream border border-slate-200 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                                  <span>
                                    {formatHumanDate(p.startDate)} →{' '}
                                    {p.endDate ? formatHumanDate(p.endDate) : 'Ongoing'}
                                  </span>
                                  {bleedDays && (
                                    <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold">
                                      {bleedDays} days
                                    </span>
                                  )}
                                  {p.autoGenerated && (
                                    <span className="px-2 py-0.5 rounded-full bg-lavender-100 text-lavender-800 text-[10px] font-extrabold">
                                      Auto-updated
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLmpStartInput(p.startDate);
                                    setLmpEndInput(p.endDate || '');
                                    showToast('Loaded into form above for editing.', 'info');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-lavender-50 border border-slate-200 text-slate-700 font-bold"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePeriodRecord(p.startDate)}
                                  className="p-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-rose-600"
                                  aria-label="Delete period entry"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </section>

                {/* Collapsible Cycle Alerts & Reminders (Hidden under title with down arrow) */}
                <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowCycleAlerts((prev) => !prev)}
                    aria-expanded={showCycleAlerts}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left hover:bg-cream transition-colors cursor-pointer"
                  >
                    <span className="font-display font-extrabold text-sm text-slate-900 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-lavender-700" />
                      <span>Cycle Shift Alerts &amp; What Changed Today</span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          currentUser.phaseShiftNotificationsEnabled !== false
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {currentUser.phaseShiftNotificationsEnabled !== false ? 'Alerts On' : 'Alerts Off'}
                      </span>
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${
                        showCycleAlerts ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showCycleAlerts && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-100 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-lavender-50 border border-lavender-200">
                        <div className="space-y-0.5 max-w-md">
                          <div className="font-bold text-slate-900">
                            Stage Transition Notification Alerts
                          </div>
                          <div className="text-slate-600">
                            Trigger a subtle toast and stage-shift alert banner whenever your cycle transitions into a new hormonal stage.
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={currentUser.phaseShiftNotificationsEnabled !== false}
                            aria-label="Toggle Stage Transition Notifications"
                            onClick={() => {
                              const currentlyEnabled =
                                currentUser.phaseShiftNotificationsEnabled !== false;
                              const nextEnabled = !currentlyEnabled;
                              updateCurrentUser((prev) => ({
                                ...prev,
                                phaseShiftNotificationsEnabled: nextEnabled,
                                ...(nextEnabled && todayMetrics.hasLoggedPeriods
                                  ? { lastNotifiedStageKey: todayMetrics.stageKey }
                                  : {}),
                              }));
                              if (!nextEnabled) {
                                setStageTransitionAlert(null);
                                showToast('🔕 Stage transition notifications turned off.', 'info');
                              } else {
                                showToast(
                                  '🔔 Stage transition notifications turned on! You will be alerted whenever your stage shifts.',
                                  'success'
                                );
                              }
                            }}
                            className={`relative inline-flex h-7 w-13 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-lavender-500 ${
                              currentUser.phaseShiftNotificationsEnabled !== false
                                ? 'bg-emerald-600'
                                : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                                currentUser.phaseShiftNotificationsEnabled !== false
                                  ? 'translate-x-7'
                                  : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className="font-extrabold text-slate-800 w-7">
                            {currentUser.phaseShiftNotificationsEnabled !== false ? 'On' : 'Off'}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-cream border border-slate-200 space-y-1.5">
                        {todayMetrics.hasLoggedPeriods ? (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-extrabold text-lavender-900">
                                {PHASE_SHIFT_NOTIFICATION_DATA[todayMetrics.stageKey].emoji}{' '}
                                {PHASE_SHIFT_NOTIFICATION_DATA[todayMetrics.stageKey].headline}
                              </div>
                              {currentUser.phaseShiftNotificationsEnabled !== false && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const guidance =
                                      PHASE_SHIFT_NOTIFICATION_DATA[todayMetrics.stageKey];
                                    const info = PHASE_ADVISOR_DATA[todayMetrics.stageKey];
                                    setStageTransitionAlert({
                                      fromStage: guidance.defaultFromStage,
                                      toStage: todayMetrics.stageKey,
                                      headline: `${guidance.emoji} Active Stage Alert: ${info.everydayName} (${info.shortName})`,
                                      tip: `${guidance.hormoneShiftText} ${guidance.recommendedSnack}`,
                                      detectedAt: new Date().toISOString(),
                                    });
                                    showToast(
                                      `${guidance.emoji} Stage alert preview: ${info.everydayName} — ${guidance.headline}`,
                                      'info'
                                    );
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-lavender-100 text-lavender-800 border border-lavender-200 font-bold text-[11px] cursor-pointer"
                                >
                                  🔔 Test Shift Alert
                                </button>
                              )}
                            </div>
                            <p className="text-slate-700">
                              {PHASE_SHIFT_NOTIFICATION_DATA[todayMetrics.stageKey].nutritionTip}
                            </p>
                            <p className="text-plum-900 font-semibold">
                              Skincare Focus: {PHASE_SHIFT_NOTIFICATION_DATA[todayMetrics.stageKey].skincareTip}
                            </p>
                          </>
                        ) : (
                          <p className="text-slate-600">
                            Log your period dates above to receive live stage transition alerts, snack tips, and Sidratu skincare guidance.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* SUB-TAB 1B: 6-MONTH CYCLE INSIGHTS */}
            {trackerSubTab === 'insights' && (
              <CycleInsightsPanel
                userData={currentUser}
                todayStr={lockedTodayISO}
                onOpenClinicSummary={() => setShowClinicSummaryModal(true)}
                onJumpToPeriodEditor={() => setTrackerSubTab('dates')}
                onOpenTrendsChart={() => {
                  setActiveSection('analytics');
                  setAnalyticsSubTab('trends');
                }}
              />
            )}

            {/* SUB-TAB 1C: PLAIN-LANGUAGE 4 CYCLE PHASES */}
            {trackerSubTab === 'phases' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {(['MENSTRUATION', 'FOLLICULAR', 'OVULATION', 'LUTEAL'] as StageKey[]).map((key) => {
                  const info = PHASE_ADVISOR_DATA[key];
                  const isCurrent =
                    todayMetrics.hasLoggedPeriods &&
                    todayMetrics.cycleDay > 0 &&
                    todayMetrics.stageKey === key;
                  return (
                    <div
                      key={key}
                      className={`rounded-3xl p-4 sm:p-5 border-2 space-y-2.5 bg-white ${
                        isCurrent
                          ? 'border-lavender-600 shadow-md ring-2 ring-lavender-200/70'
                          : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-display font-extrabold text-base text-slate-900">
                          {info.emoji} {info.everydayName}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isCurrent
                              ? 'bg-lavender-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isCurrent ? 'Right Now' : info.shortName}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-lavender-800">{info.everydaySummary}</p>
                      <p className="text-xs text-slate-600">{info.body}</p>
                      <div className="pt-2 border-t border-slate-100 text-xs text-slate-700 space-y-1">
                        <div>
                          <strong>Study Fit:</strong> {info.study}
                        </div>
                        <div>
                          <strong>Skin Care:</strong> {info.skincareSync}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: DAILY LOG ("Daily Log")                                       */}
        {/* =================================================================== */}
        {activeSection === 'checkin' && (
          <div className="space-y-4">
            {/* Date Picker Header */}
            <div className="rounded-2xl bg-white border border-lavender-200 p-3.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
              <div>
                <div className="text-xs font-extrabold text-lavender-900">
                  Logging For: {formatHumanDate(selectedDateStr)}{' '}
                  {selectedMetrics.hasLoggedPeriods && selectedMetrics.cycleDay > 0
                    ? `(Day ${selectedMetrics.cycleDay} · ${PHASE_ADVISOR_DATA[selectedMetrics.stageKey].everydayName})`
                    : '(Period not logged for this date)'}
                </div>
                <div className="text-[11px] text-slate-500">
                  Daily moods &amp; cramps automatically build your Doctor Summary and Trends charts.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={selectedDateStr}
                  onChange={(e) => setSelectedDateStr(e.target.value || lockedTodayISO)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold"
                />
                {selectedDateStr !== lockedTodayISO && (
                  <button
                    type="button"
                    onClick={() => setSelectedDateStr(lockedTodayISO)}
                    className="px-3 py-1.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 text-xs font-extrabold cursor-pointer"
                  >
                    Today
                  </button>
                )}
              </div>
            </div>

            {/* 3-Button Segmented Bar */}
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-white border border-lavender-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setCheckinSubTab('mood')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  checkinSubTab === 'mood'
                    ? 'bg-lavender-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                😊 Mood &amp; Symptoms
              </button>
              <button
                type="button"
                onClick={() => setCheckinSubTab('journal')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  checkinSubTab === 'journal'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                📓 Journal &amp; Poses
              </button>
              <button
                type="button"
                onClick={() => setCheckinSubTab('badges')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  checkinSubTab === 'badges'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                🏅 Badges &amp; Streaks
              </button>
            </div>

            {checkinSubTab === 'mood' && (
              <div className="space-y-4">
                {/* Slim Pill Link */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection('guide');
                    setGuideSubTab('pill');
                  }}
                  className="w-full px-4 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 text-xs font-extrabold flex items-center justify-between cursor-pointer"
                >
                  <span>💊 Need to log an Emergency Pill (Postinor-2 / Plan B)?</span>
                  <span>Open Pill Log →</span>
                </button>

                {/* Mood Grid */}
                <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
                  <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                    How Are You Feeling Today?
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {MOOD_CATEGORIES.map((m) => {
                      const active = selectedDayLog.mood === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            updateDailyLogForDate(selectedDateStr, (curr) => ({
                              ...curr,
                              mood: curr.mood === m.id ? null : m.id,
                            }))
                          }
                          className={`p-2.5 rounded-2xl border-2 text-xs font-extrabold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            active
                              ? 'bg-lavender-700 text-white border-lavender-700 shadow-sm scale-[1.02]'
                              : 'bg-cream hover:bg-lavender-50 text-slate-800 border-slate-200'
                          }`}
                        >
                          <span className="text-lg">{m.emoji}</span>
                          <span>{m.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Searchable & Collapsible Symptoms */}
                <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowSymptomChecklist((prev) => !prev)}
                      className="font-display font-extrabold text-sm sm:text-base text-slate-900 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Physical Symptoms ({selectedDayLog.symptoms.length} selected)</span>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-500 transition-transform ${
                          showSymptomChecklist ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <input
                      type="search"
                      value={symptomSearch}
                      onChange={(e) => setSymptomSearch(e.target.value)}
                      placeholder="Filter symptoms (e.g. cramps)..."
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs w-full sm:w-56"
                    />
                  </div>

                  {showSymptomChecklist && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {filteredSymptoms.map((sym) => {
                        const checked = selectedDayLog.symptoms.includes(sym.id);
                        const currentIntensity = Math.min(
                          3,
                          Math.max(1, selectedDayLog.intensity?.[sym.id] || 1)
                        );
                        const intensityLabels: Record<number, string> = {
                          1: 'Mild',
                          2: 'Moderate',
                          3: 'Strong',
                        };

                        return (
                          <div
                            key={sym.id}
                            className={`rounded-xl border transition-all ${
                              checked
                                ? sym.redFlag
                                  ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                                  : 'bg-lavender-700 text-white border-lavender-700 shadow-xs'
                                : 'bg-cream hover:bg-lavender-50 text-slate-800 border-slate-200'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                updateDailyLogForDate(selectedDateStr, (curr) => {
                                  const exists = curr.symptoms.includes(sym.id);
                                  const nextIntensity = { ...(curr.intensity || {}) };
                                  if (exists) {
                                    delete nextIntensity[sym.id];
                                  } else if (!nextIntensity[sym.id]) {
                                    nextIntensity[sym.id] = 1;
                                  }
                                  return {
                                    ...curr,
                                    symptoms: exists
                                      ? curr.symptoms.filter((s) => s !== sym.id)
                                      : [...curr.symptoms, sym.id],
                                    intensity: nextIntensity,
                                  };
                                })
                              }
                              className="w-full px-3 py-2.5 text-xs font-bold flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <span className="flex items-center gap-2 text-left">
                                <span>{sym.emoji}</span>
                                <span>{sym.id}</span>
                              </span>
                              <span>{checked ? '✓' : '+'}</span>
                            </button>

                            {checked && (
                              <div
                                className={`px-3 pb-2.5 pt-1.5 border-t flex items-center justify-between gap-2 text-[11px] ${
                                  sym.redFlag ? 'border-rose-500/50' : 'border-lavender-500/50'
                                }`}
                              >
                                <span className="font-semibold text-white/90">
                                  Intensity: {intensityLabels[currentIntensity]}
                                </span>
                                <div
                                  className="inline-flex items-center gap-1"
                                  role="group"
                                  aria-label={`Intensity level for ${sym.id}`}
                                >
                                  {[1, 2, 3].map((lvl) => {
                                    const isSelectedLvl = currentIntensity === lvl;
                                    return (
                                      <button
                                        key={lvl}
                                        type="button"
                                        onClick={() =>
                                          updateDailyLogForDate(selectedDateStr, (curr) => ({
                                            ...curr,
                                            intensity: {
                                              ...(curr.intensity || {}),
                                              [sym.id]: lvl,
                                            },
                                          }))
                                        }
                                        title={`Level ${lvl} (${intensityLabels[lvl]})`}
                                        className={`w-6 h-6 rounded-lg font-mono font-extrabold text-[11px] flex items-center justify-center transition-all cursor-pointer ${
                                          isSelectedLvl
                                            ? 'bg-white text-slate-900 shadow-2xs scale-105'
                                            : 'bg-white/15 hover:bg-white/30 text-white'
                                        }`}
                                      >
                                        {lvl}
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
                  )}

                  {(selectedDayLog.symptoms.includes('Severe Pain') ||
                    selectedDayLog.symptoms.includes('Heavy Flow / Clots')) && (
                    <div className="p-3 rounded-2xl bg-rose-50 border border-rose-300 text-xs text-rose-950 font-semibold">
                      🩺 Clinical Red Flag Logged: Severe pain or heavy clotting warrants a quick medical check-in. Use <strong>Clinic PDF</strong> in the top bar to share your log with a doctor.
                    </div>
                  )}
                </section>

                {/* Daily Habits & Notes */}
                <section className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 space-y-3 shadow-2xs">
                  <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                    Healthy Habits &amp; Private Notes
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {HABIT_ITEMS.map((h) => {
                      const done = selectedDayLog.habits.includes(h.id);
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() =>
                            updateDailyLogForDate(selectedDateStr, (curr) => ({
                              ...curr,
                              habits: curr.habits.includes(h.id)
                                ? curr.habits.filter((x) => x !== h.id)
                                : [...curr.habits, h.id],
                            }))
                          }
                          className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                            done
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-cream hover:bg-emerald-50 text-slate-800 border-slate-200'
                          }`}
                        >
                          <span>{h.emoji}</span>
                          <span>{h.id}</span>
                        </button>
                      );
                    })}
                  </div>

                  <textarea
                    rows={2}
                    value={selectedDayLog.notes}
                    onChange={(e) =>
                      updateDailyLogForDate(selectedDateStr, (curr) => ({
                        ...curr,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Optional private note for today (cramp severity, triggers, exam stress)..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-lavender-500 privacy-sensitive"
                  />
                </section>

                {/* Collapsible Logged Symptom Details */}
                <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowSymptomHistoryList((prev) => !prev)}
                    aria-expanded={showSymptomHistoryList}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left hover:bg-cream transition-colors cursor-pointer"
                  >
                    <span className="font-display font-extrabold text-sm text-slate-900">
                      📋 Logged Symptom Details ({symptomHistoryEntries.length} days saved)
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${
                        showSymptomHistoryList ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showSymptomHistoryList && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-2 privacy-sensitive">
                      {symptomHistoryEntries.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">
                          No daily logs recorded yet. Select a mood or symptom above to start.
                        </p>
                      ) : (
                        symptomHistoryEntries.slice(0, 15).map(([dStr, entry]) => {
                          const isActiveDay = dStr === selectedDateStr;
                          const intensityLabels: Record<number, string> = {
                            1: 'Mild',
                            2: 'Moderate',
                            3: 'Strong',
                          };
                          return (
                            <button
                              key={dStr}
                              type="button"
                              onClick={() => setSelectedDateStr(dStr)}
                              aria-current={isActiveDay ? 'date' : undefined}
                              className={`w-full text-left p-3 rounded-xl border text-xs space-y-1.5 transition-all cursor-pointer ${
                                isActiveDay
                                  ? 'bg-lavender-50/90 border-lavender-400 ring-1 ring-lavender-300/60 shadow-2xs'
                                  : 'bg-cream hover:bg-lavender-50 border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 font-bold text-slate-900">
                                <span className="flex items-center gap-1.5">
                                  <span>
                                    {formatHumanDate(dStr)} ({entry.stageAtLog || 'Logged'})
                                  </span>
                                  {isActiveDay && (
                                    <span className="px-1.5 py-0.5 rounded-md bg-lavender-700 text-white text-[10px] font-extrabold tracking-tight">
                                      Active
                                    </span>
                                  )}
                                </span>
                                <span className="text-lavender-800">{entry.mood || 'No mood'}</span>
                              </div>
                              {entry.symptoms.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 text-slate-700">
                                  <span className="font-semibold text-slate-600">Symptoms:</span>
                                  {entry.symptoms.map((symName) => {
                                    const rawLvl = entry.intensity?.[symName];
                                    const lvl =
                                      typeof rawLvl === 'number' && rawLvl >= 1 && rawLvl <= 3
                                        ? rawLvl
                                        : null;
                                    return (
                                      <span
                                        key={symName}
                                        data-level={lvl ?? undefined}
                                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-all ${
                                          lvl === 3
                                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                                            : lvl === 2
                                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                                            : 'bg-white border-slate-200 text-slate-800'
                                        } ${
                                          isActiveDay && lvl !== null
                                            ? 'intensity-indicator-active'
                                            : ''
                                        }`}
                                      >
                                        <span>{symName}</span>
                                        {lvl !== null && (
                                          <span className="inline-flex items-center gap-1 font-mono font-extrabold text-[10px] opacity-95">
                                            <span
                                              className="inline-flex items-center gap-0.5"
                                              aria-hidden="true"
                                            >
                                              {[1, 2, 3].map((dot) => {
                                                const isFilled = dot <= lvl;
                                                const isSelectedDot = dot === lvl;
                                                return (
                                                  <span
                                                    key={dot}
                                                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                                                      isFilled
                                                        ? lvl === 3
                                                          ? 'bg-rose-600'
                                                          : lvl === 2
                                                          ? 'bg-amber-500'
                                                          : 'bg-lavender-600'
                                                        : 'bg-slate-300/70'
                                                    } ${
                                                      isActiveDay && isSelectedDot
                                                        ? 'intensity-dot-active'
                                                        : ''
                                                    }`}
                                                  />
                                                );
                                              })}
                                            </span>
                                            <span>
                                              Lvl {lvl}/3 ({intensityLabels[lvl]})
                                            </span>
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                              {entry.notes && (
                                <div className="text-slate-500 italic">“{entry.notes}”</div>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {checkinSubTab === 'journal' && (
              <CycleJournalPromptsSection
                userData={currentUser}
                selectedDateStr={selectedDateStr}
                metrics={selectedMetrics}
                onUpdateUser={updateCurrentUser}
                onSelectDate={setSelectedDateStr}
                showToast={showToast}
              />
            )}

            {checkinSubTab === 'badges' && (
              <BadgesMilestonesSection
                userData={currentUser}
                onNavigateSection={handleBadgeNavigate}
                defaultExpanded={true}
              />
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: PILL & CARE ("Pill & Care")                                   */}
        {/* =================================================================== */}
        {activeSection === 'guide' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-white border border-lavender-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setGuideSubTab('pill')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  guideSubTab === 'pill'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                💊 Emergency Pill
              </button>
              <button
                type="button"
                onClick={() => setGuideSubTab('phase_guide')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  guideSubTab === 'phase_guide'
                    ? 'bg-lavender-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                🧬 Phase Guide
              </button>
              <button
                type="button"
                onClick={() => setGuideSubTab('myths')}
                className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                  guideSubTab === 'myths'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                }`}
              >
                🧠 Campus Myths
              </button>
            </div>

            {guideSubTab === 'pill' && (
              <div className="space-y-4">
                <section className="bg-white rounded-3xl border border-amber-200 p-5 sm:p-6 space-y-4 shadow-xs">
                  <div>
                    <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                      💊 Emergency Pill Logger (Postinor-2 / Plan B)
                    </h3>
                    <p className="text-xs text-slate-600">
                      Keep a private record of the exact date &amp; time you took emergency contraception.
                    </p>
                  </div>

                  <form onSubmit={handleLogEmergencyPill} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="datetime-local"
                      value={pillDateTimeInput}
                      onChange={(e) => setPillDateTimeInput(e.target.value)}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
                      required
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-display font-extrabold text-xs sm:text-sm cursor-pointer"
                    >
                      Save Pill Time
                    </button>
                  </form>

                  <div className="p-4 rounded-2xl bg-lavender-50 border border-lavender-200 text-xs text-slate-700 space-y-2">
                    <div className="font-extrabold text-lavender-900">
                      What to Expect After an Emergency Pill
                    </div>
                    <p>
                      A high dose of progestin temporarily delays ovulation and can make your next period arrive up to 7 days early or late, accompanied by temporary breast tenderness, spotting, or fatigue.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSection('tracker');
                        setTrackerSubTab('dates');
                      }}
                      className="text-lavender-800 hover:underline font-extrabold cursor-pointer"
                    >
                      Back to Update LMP Start Date →
                    </button>
                  </div>
                </section>

                {/* Collapsible Logged Emergency Pill List */}
                <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setShowPillHistoryList((prev) => !prev)}
                    aria-expanded={showPillHistoryList}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-2 text-left hover:bg-cream transition-colors cursor-pointer"
                  >
                    <span className="font-display font-extrabold text-sm text-slate-900">
                      🕒 Logged Emergency Pill Dates &amp; Times ({(currentUser.emergencyPills || []).length})
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 transition-transform ${
                        showPillHistoryList ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {showPillHistoryList && (
                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-2 privacy-sensitive">
                      {(currentUser.emergencyPills || []).length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">No emergency pill timestamps saved.</p>
                      ) : (
                        (currentUser.emergencyPills || []).map((pill) => (
                          <div
                            key={pill.timestamp}
                            className="flex items-center justify-between gap-2 p-3 rounded-xl bg-cream border border-slate-200 text-xs"
                          >
                            <span className="font-bold text-slate-800">
                              💊 {new Date(pill.timestamp).toLocaleString()}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeletePillLog(pill.timestamp)}
                              className="p-1.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 cursor-pointer"
                              aria-label="Remove pill entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {guideSubTab === 'phase_guide' && (
              <div className="space-y-4">
                <section className="bg-white rounded-3xl border border-lavender-200 p-5 sm:p-6 space-y-4 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                        {todayMetrics.hasLoggedPeriods && todayMetrics.cycleDay > 0
                          ? `${currentStageInfo.emoji} Today’s Stage Guidance (${currentStageInfo.everydayName})`
                          : '🧬 Cycle Stage Guidance (Log your last period first to see your active phase)'}
                      </h3>
                      <p className="text-xs text-slate-600">{currentStageInfo.hormoneSummary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowBioscienceCenter((prev) => !prev)}
                      className="px-3.5 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-800 text-white text-xs font-extrabold cursor-pointer"
                    >
                      {showBioscienceCenter ? 'Hide Deep Bioscience ▲' : 'Open Bioscience & Physiology ▼'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 space-y-1">
                      <div className="font-extrabold text-rose-900">Fertility &amp; Pregnancy Risk</div>
                      <p className="text-slate-700">{currentStageInfo.pregnancy}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-sage-50 border border-sage-200 space-y-1">
                      <div className="font-extrabold text-sage-800">Body, Cravings &amp; Nutrition</div>
                      <p className="text-slate-700">{currentStageInfo.craving}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-lavender-50 border border-lavender-200 space-y-1">
                      <div className="font-extrabold text-lavender-900">Mind &amp; Study Focus</div>
                      <p className="text-slate-700">{currentStageInfo.study}</p>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-peach-50 border border-peach-200 space-y-1">
                      <div className="font-extrabold text-peach-800">Skin &amp; Sidratu Care</div>
                      <p className="text-slate-700">{currentStageInfo.skincareSync}</p>
                    </div>
                  </div>
                </section>

                {showBioscienceCenter && (
                  <BioscienceReproductiveEducationCenter
                    currentStageKey={todayMetrics.stageKey}
                    cycleDay={todayMetrics.cycleDay}
                    avgCycleLength={todayMetrics.avgCycleLength}
                    onNavigateToUpdateLmp={() => {
                      setActiveSection('tracker');
                      setTrackerSubTab('dates');
                    }}
                    onNavigateToEmergencyPillLogger={() => {
                      setActiveSection('guide');
                      setGuideSubTab('pill');
                    }}
                  />
                )}
              </div>
            )}

            {guideSubTab === 'myths' && (
              <MythBusterQuizSection
                userData={currentUser}
                onUpdateUser={updateCurrentUser}
                onOpenBadgesModal={() => {
                  setActiveSection('checkin');
                  setCheckinSubTab('badges');
                }}
                showToast={showToast}
              />
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: TRENDS & FUEL ("Trends & Fuel")                              */}
        {/* =================================================================== */}
        {activeSection === 'analytics' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1.5 rounded-2xl bg-white border border-lavender-200 shadow-2xs">
              {(
                [
                  ['trends', '📈 6-Mo Charts'],
                  ['hydration', '💧 Water'],
                  ['nutrition', '🍫 Snacks'],
                  ['correlation', '📊 Mood×Stage'],
                  ['badges', '🏅 Badges'],
                  ['videos', '🎬 Videos'],
                ] as Array<[AnalyticsSubTab, string]>
              ).map(([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setAnalyticsSubTab(tabKey)}
                  className={`py-2 px-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold transition-all cursor-pointer truncate ${
                    analyticsSubTab === tabKey
                      ? 'bg-lavender-700 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-cream'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {analyticsSubTab === 'trends' && (
              <CycleTrendsSection
                periods={sortedPeriods}
                avgCycleLength={todayMetrics.avgCycleLength}
                avgPeriodDuration={todayMetrics.avgPeriodDuration}
              />
            )}

            {analyticsSubTab === 'hydration' && (
              <HydrationTrackerWidget
                userData={currentUser}
                selectedDateStr={selectedDateStr}
                currentStageKey={selectedMetrics.stageKey}
                onLogWaterForDate={(dateStr, nextGlasses) =>
                  updateDailyLogForDate(dateStr, (curr) => ({
                    ...curr,
                    waterGlasses: nextGlasses,
                  }))
                }
                onSelectDate={setSelectedDateStr}
              />
            )}

            {analyticsSubTab === 'nutrition' && (
              <NutritionCravingSupportCard
                userData={currentUser}
                selectedDateStr={selectedDateStr}
                currentStageKey={selectedMetrics.stageKey}
                cycleDay={selectedMetrics.cycleDay}
                onToggleSnackForDate={(dateStr, snackId, snackName) => {
                  updateDailyLogForDate(dateStr, (curr) => {
                    const prevList = curr.loggedSnacks || [];
                    const exists = prevList.includes(snackId);
                    return {
                      ...curr,
                      loggedSnacks: exists
                        ? prevList.filter((s) => s !== snackId)
                        : [...prevList, snackId],
                    };
                  });
                  showToast(`Updated snack log: ${snackName}`, 'info');
                }}
                onSelectCravingForDate={(dateStr, cravingLabel) => {
                  updateDailyLogForDate(dateStr, (curr) => ({
                    ...curr,
                    cravingLogged: curr.cravingLogged === cravingLabel ? null : cravingLabel,
                  }));
                }}
              />
            )}

            {analyticsSubTab === 'correlation' && (
              <MoodStageCorrelationSection
                userData={currentUser}
                currentStageKey={todayMetrics.stageKey}
                onSelectDate={(dateStr) => {
                  setSelectedDateStr(dateStr);
                  setActiveSection('checkin');
                  setCheckinSubTab('mood');
                }}
              />
            )}

            {analyticsSubTab === 'badges' && (
              <BadgesMilestonesSection
                userData={currentUser}
                onNavigateSection={handleBadgeNavigate}
                defaultExpanded={true}
              />
            )}

            {analyticsSubTab === 'videos' && (
              <section className="bg-white rounded-3xl border border-lavender-200 p-5 sm:p-6 space-y-4 shadow-xs">
                <div>
                  <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    🎬 Campus Health &amp; Cycle Science Videos
                  </h3>
                  <p className="text-xs text-slate-600">
                    Trusted educational explainers on menstrual physiology, cramp relief, and hormonal skincare.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {EDUCATION_VIDEOS.map((vid) => (
                    <a
                      key={vid.id}
                      href={vid.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-2xl p-4 bg-cream hover:bg-lavender-50 border border-slate-200 space-y-2 transition-colors block"
                    >
                      <div className="text-[11px] font-extrabold text-lavender-700">
                        {vid.source} · {vid.duration}
                      </div>
                      <h4 className="font-display font-extrabold text-sm text-slate-900">{vid.title}</h4>
                      <p className="text-xs text-slate-600">{vid.summary}</p>
                      <div className="text-xs font-extrabold text-rose-700 pt-1">Watch on YouTube →</div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: STUDY SYNC ("Study Sync")                                    */}
        {/* =================================================================== */}
        {activeSection === 'study' && (
          <StudyExamSyncPlanner
            userData={currentUser}
            selectedDateStr={selectedDateStr}
            metrics={selectedMetrics}
            onUpdateUser={updateCurrentUser}
            showToast={showToast}
          />
        )}

        {/* =================================================================== */}
        {/* TAB 6: SIDRATU AI CLINIC ("Sidratu AI")                             */}
        {/* =================================================================== */}
        {activeSection === 'sidratu' && (
          <SidratuClinicHub
            userData={currentUser}
            metrics={todayMetrics}
            onUpdateUser={updateCurrentUser}
            showToast={showToast}
          />
        )}

        {/* SLIM APP FOOTER */}
        <footer className="rounded-3xl bg-white border border-slate-200 p-4 sm:p-5 space-y-3 text-xs no-print">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-slate-600">
              Created by <strong className="text-slate-900">{CREATOR_NAME}</strong> ·{' '}
              <span className="font-mono">{CREATOR_EMAIL}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 font-bold border border-lavender-200 cursor-pointer"
              >
                💬 Support Inquiry
              </button>
              <button
                type="button"
                onClick={() => setShowPaywallModal(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold border border-amber-200 cursor-pointer"
              >
                🎁 Access &amp; Renewal
              </button>
            </div>
          </div>
          <PWAInstallButton />
        </footer>
      </main>

      {/* BOTTOM NAVIGATION BAR */}
      <BottomNavBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        cycleDay={todayMetrics.cycleDay}
        hasLoggedMoodToday={Boolean(currentUser.dailyLogs?.[lockedTodayISO]?.mood)}
        waterGlassesToday={currentUser.dailyLogs?.[lockedTodayISO]?.waterGlasses || 0}
        isDarkMode={isDarkMode}
      />

      <OfflineIndicator />

      {/* FULL SCREEN CALENDAR MODAL */}
      <FullScreenCalendarModal
        isOpen={showCalendarModal}
        onClose={() => setShowCalendarModal(false)}
        userData={currentUser}
        todayMetrics={todayMetrics}
        calendarMonth={calendarMonth}
        calendarYear={calendarYear}
        selectedDateStr={selectedDateStr}
        onChangeMonth={(delta) => {
          const next = new Date(calendarYear, calendarMonth + delta, 1);
          setCalendarMonth(next.getMonth());
          setCalendarYear(next.getFullYear());
        }}
        onJumpToMonthYear={(m, y) => {
          setCalendarMonth(m);
          setCalendarYear(y);
        }}
        onJumpToToday={() => {
          const now = new Date();
          setCalendarMonth(now.getMonth());
          setCalendarYear(now.getFullYear());
          setSelectedDateStr(lockedTodayISO);
        }}
        onSelectDate={(dStr) => {
          setSelectedDateStr(dStr);
          setShowCalendarModal(false);
          setActiveSection('checkin');
          setCheckinSubTab('mood');
        }}
        onSetAsPeriodStart={handleCalendarSetStart}
        onSetAsPeriodEnd={handleCalendarSetEnd}
      />

      {/* QUICK FIND OVERLAY MODAL */}
      {quickFindOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-start justify-center pt-12 sm:pt-16"
          onClick={() => setQuickFindOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white border-2 border-lavender-300 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center gap-2.5">
              <Search className="w-4 h-4 text-lavender-700 shrink-0" />
              <input
                type="text"
                autoFocus
                value={quickFindQuery}
                onChange={(e) => setQuickFindQuery(e.target.value)}
                placeholder="Search any tool (e.g., LMP, cramps, insights, pill, water, sidratu)..."
                className="flex-1 text-sm bg-transparent focus:outline-none text-slate-900"
              />
              <button
                type="button"
                onClick={() => setQuickFindOpen(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto p-3 space-y-1.5">
              {filteredQuickFind.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-8">
                  No matching tool found. Try “period”, “mood”, “insights”, or “sidratu”.
                </div>
              ) : (
                filteredQuickFind.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleQuickFindJump(item)}
                    className="w-full text-left p-3 rounded-2xl hover:bg-lavender-50 border border-transparent hover:border-lavender-200 flex items-center gap-3 transition-colors cursor-pointer"
                  >
                    <span className="text-xl shrink-0">{item.emoji}</span>
                    <div>
                      <div className="font-display font-extrabold text-sm text-slate-900">
                        {item.title}
                      </div>
                      <div className="text-xs text-slate-500">{item.subtitle}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DOCTOR & CLINIC SUMMARY MODAL */}
      {showClinicSummaryModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto"
          onClick={() => setShowClinicSummaryModal(false)}
        >
          <div
            id="clinic-printable-report"
            className="w-full max-w-2xl rounded-3xl bg-white border-2 border-plum-900/30 p-5 sm:p-6 shadow-2xl space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-rose-600" />
                  <span>Doctor &amp; Clinic Summary Report</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Private patient summary for {currentUser.name} ({currentUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClinicSummaryModal(false)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 no-print cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-lavender-50 border border-lavender-200">
                <div className="text-slate-500 font-bold">Cycle Length</div>
                <div className="font-display font-extrabold text-base text-lavender-900">
                  {todayMetrics.hasLoggedPeriods ? `${todayMetrics.avgCycleLength} days` : 'Not logged'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200">
                <div className="text-slate-500 font-bold">Bleed Length</div>
                <div className="font-display font-extrabold text-base text-rose-900">
                  {todayMetrics.hasLoggedPeriods && todayMetrics.avgPeriodDuration > 0
                    ? `${todayMetrics.avgPeriodDuration} days`
                    : 'Not logged'}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-cream border border-slate-200">
                <div className="text-slate-500 font-bold">Logged Periods</div>
                <div className="font-display font-extrabold text-base text-slate-900">
                  {sortedPeriods.length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="text-slate-500 font-bold">Emergency Pills</div>
                <div className="font-display font-extrabold text-base text-amber-900">
                  {(currentUser.emergencyPills || []).length}
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-700 bg-cream p-4 rounded-2xl border border-slate-200 space-y-1.5">
              <div className="font-extrabold text-slate-900">Recent Periods:</div>
              {sortedPeriods.length === 0 ? (
                <p>No periods recorded yet.</p>
              ) : (
                [...sortedPeriods]
                  .reverse()
                  .slice(0, 6)
                  .map((p, i) => (
                    <div key={`${p.startDate}-${i}`}>
                      • {formatHumanDate(p.startDate)} →{' '}
                      {p.endDate ? formatHumanDate(p.endDate) : 'Ongoing'}
                    </div>
                  ))
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 no-print">
              <button
                type="button"
                onClick={() => {
                  const filename = exportClinicSummaryToPDF(
                    currentUser,
                    todayMetrics,
                    sortedPeriods
                  );
                  showToast(`📄 Downloaded ${filename}`, 'success');
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-plum-900 hover:bg-lavender-900 text-gold-400 font-display font-extrabold text-xs sm:text-sm cursor-pointer"
              >
                Download Clinic PDF
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACCESS & RENEWAL / PAYWALL MODAL */}
      {(showPaywallModal || showHardPaywall) && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto"
          onClick={() => {
            if (!showHardPaywall) setShowPaywallModal(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border-2 border-gold-500 p-5 sm:p-6 shadow-2xl space-y-4 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-extrabold text-lg text-slate-900 flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-600" />
                  <span>BloomCampus Monthly Pass</span>
                </h3>
                <p className="text-xs text-slate-600">{trialStatus.label}</p>
              </div>
              {!showHardPaywall && (
                <button
                  type="button"
                  onClick={() => setShowPaywallModal(false)}
                  className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form
              onSubmit={handleOrangeMoneySubmit}
              className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2.5"
            >
              <div className="font-extrabold text-xs text-amber-950">
                Pay Le 30 / month via Orange Money (Sierra Leone)
              </div>
              <input
                type="tel"
                value={omSenderPhone}
                onChange={(e) => setOmSenderPhone(e.target.value)}
                placeholder="Your Orange Money Phone Number"
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs"
              />
              <input
                type="text"
                value={omTxId}
                onChange={(e) => setOmTxId(e.target.value)}
                placeholder="Orange Money Transaction ID"
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs"
              />
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs cursor-pointer"
              >
                Submit Le 30 Payment Verification
              </button>
            </form>

            <form
              onSubmit={handleVipPasswordUnlock}
              className="p-4 rounded-2xl bg-lavender-50 border border-lavender-200 space-y-2.5"
            >
              <div className="font-extrabold text-xs text-lavender-900">
                Or Enter Free Access Pass Code
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showVipPassword ? 'text' : 'password'}
                    value={vipPassInput}
                    onChange={(e) => setVipPassInput(e.target.value)}
                    placeholder="Enter access code"
                    className="w-full pl-3 pr-16 py-2 rounded-xl border border-lavender-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-lavender-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowVipPassword((prev) => !prev)}
                    aria-label={showVipPassword ? 'Hide access code' : 'Show access code'}
                    aria-pressed={showVipPassword}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold text-lavender-700 hover:text-lavender-900 hover:bg-lavender-50 transition-colors cursor-pointer"
                  >
                    {showVipPassword ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    <span>{showVipPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-800 text-white font-extrabold text-xs cursor-pointer"
                >
                  Unlock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPPORT INQUIRY MODAL */}
      {showSupportModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center"
          onClick={() => setShowSupportModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white border border-lavender-200 p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-display font-extrabold text-lg text-slate-900">
                  💬 Contact BloomCampus Support
                </h3>
                <p className="text-xs text-slate-500">
                  Direct message to {CREATOR_NAME} ({CREATOR_EMAIL})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendSupportInquiry} className="space-y-3">
              <input
                type="text"
                value={supportSubject}
                onChange={(e) => setSupportSubject(e.target.value)}
                placeholder="Subject (e.g., Account help, feedback)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
              />
              <textarea
                rows={4}
                value={supportMessage}
                onChange={(e) => setSupportMessage(e.target.value)}
                placeholder="Write your question or feedback..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs"
                required
              />
              <button
                type="submit"
                disabled={supportSending}
                className="w-full py-2.5 rounded-xl bg-lavender-700 hover:bg-lavender-800 text-white font-display font-extrabold text-xs sm:text-sm cursor-pointer"
              >
                {supportSending ? 'Sending...' : 'Send Message →'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
