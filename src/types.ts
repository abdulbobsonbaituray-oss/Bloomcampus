export type StageKey = 'MENSTRUATION' | 'FOLLICULAR' | 'OVULATION' | 'LUTEAL';

export interface PeriodRecord {
  startDate: string;
  endDate: string | null;
}

export interface EmergencyPillLog {
  timestamp: string;
  dateStr: string;
}

export interface DailyLogEntry {
  mood: string | null;
  stageAtLog: string | null;
  symptoms: string[];
  symptomDurations?: Record<string, number>;
  intensity?: Record<string, number>;
  habits: string[];
  notes: string;
  waterGlasses?: number;
  loggedSnacks?: string[];
  cravingLogged?: string | null;
}

export interface JournalEntry {
  id: string;
  dateStr: string;
  stageKey: StageKey;
  cycleDay: number;
  promptQuestion: string;
  reflectionText: string;
  moodAtReflection?: string | null;
  updatedAt: string;
}

export interface AcademicTask {
  id: string;
  title: string;
  course: string;
  dueDate: string;
  type: 'Exam' | 'Assignment' | 'Presentation' | 'Study Session';
  completed: boolean;
}

export interface TherapySessionLog {
  id: string;
  treatmentType: string;
  sessionDate: string;
  postSessionFeeling: string;
  stageAtSession?: string;
}

export interface SidratuAppointment {
  id: string;
  treatmentType: string;
  requestedDate: string;
  requestedTime: string;
  notes?: string;
  status: 'Pending' | 'Confirmed';
  createdAt: string;
}

export interface PaymentHistoryItem {
  date: string;
  amount: string;
  details: string;
  status?: 'pending' | 'approved' | 'rejected';
  senderPhone?: string;
  transactionId?: string;
}

export interface PendingPaymentSubmission {
  id: string;
  senderPhone: string;
  transactionId: string;
  amount: string;
  method: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAt?: string;
}

export interface AdminAccount {
  email: string;
  password: string;
  name?: string;
  addedAt: string;
}

export interface AdminConfig {
  ownerEmail: string;
  adminPassword: string;
  freeAccessPassword: string;
  additionalAdmins?: AdminAccount[];
  updatedAt: string;
}

export interface SupportInquiry {
  id: string;
  userName: string;
  userEmail: string;
  userPhone?: string;
  userAge?: string;
  deviceInfo?: string;
  subject: string;
  message: string;
  type: 'payment' | 'support' | 'login' | 'signup' | 'welcome' | 'appreciation';
  createdAt: string;
}

export interface CustomerEntryRecord {
  id: string;
  customerNumber?: number;
  name: string;
  email: string;
  age: string;
  phone: string;
  password?: string;
  role?: 'admin' | 'client';
  entryType: 'Create Account' | 'Sign In' | 'WebApp Session' | 'Admin Updated';
  deviceInfo: string;
  appUrl?: string;
  firstEntryAt: number;
  timestamp: number;
  timestampIso: string;
}

export interface PhaseShiftNotificationSummary {
  fromStage: StageKey;
  toStage: StageKey;
  notifiedAt: string;
  nutritionTip: string;
  skincareTip: string;
  recommendedSnack: string;
  recommendedTreatment: string;
}

export interface UserData {
  customerNumber?: number;
  firstEntryAt?: number;
  name: string;
  age: string;
  email: string;
  phone?: string;
  password?: string;
  role?: 'admin' | 'client';
  createdAt: number;
  lastUpdatedAt?: string;
  lastSignInAt?: string;
  signInCount?: number;
  signupSource?: string;
  deviceInfo?: string;
  lastAppUrl?: string;
  entryHistory?: CustomerEntryRecord[];
  isVip: boolean;
  usedFreeAccessPassword?: boolean;
  subscriptionStatus?: 'active' | 'free_password' | 'pending_verification' | 'expired' | 'trial';
  subscriptionUntil: number | null;
  paymentMethod: string | null;
  pendingPayment?: PendingPaymentSubmission | null;
  approvalWelcomePending?: boolean;
  lastApprovedExpirationDate?: string;
  paymentHistory?: PaymentHistoryItem[];
  periods: PeriodRecord[];
  emergencyPills: EmergencyPillLog[];
  dailyLogs: Record<string, DailyLogEntry>;
  journalEntries?: JournalEntry[];
  skincareGoal?: string;
  therapyLogs?: TherapySessionLog[];
  appointments?: SidratuAppointment[];
  academicTasks?: AcademicTask[];
  cycleRemindersEnabled?: boolean;
  lastReminderNotifiedForPeriod?: string;
  phaseShiftNotificationsEnabled?: boolean;
  lastNotifiedStageKey?: StageKey;
  lastPhaseShiftNotifiedAt?: string;
  lastPhaseShiftSummary?: PhaseShiftNotificationSummary | null;
  pushNotificationsEnabled?: boolean;
  appointmentRemindersEnabled?: boolean;
  dailyCheckinRemindersEnabled?: boolean;
  lastPushNotificationSentAt?: string;
  welcomeMessageSent?: boolean;
  welcomeMessageSentAt?: string;
  welcomeMessagePendingModal?: boolean;
  paymentAppreciationPending?: boolean;
  lastPaymentAppreciationAt?: string;
  lastPaymentAppreciationAmount?: string;
  themeMode?: 'light' | 'dark';
  customCycleLength?: number;
  unlockedBadges?: Record<string, string>;
  mythBusterCorrectIds?: string[];
  mythBusterAttempts?: Record<string, 'correct' | 'incorrect' | 'revealed'>;
}

export interface CycleMetrics {
  avgCycleLength: number;
  avgPeriodDuration: number;
  activePeriodStartStr?: string | null;
  activePeriodEndStr?: string | null;
  activePeriodDuration?: number;
  effectiveCycleStartStr?: string | null;
  effectiveCycleEndStr?: string | null;
  autoRolloverCycles?: number;
  rawDaysSinceLmp?: number;
  cycleDay: number;
  stageKey: StageKey;
  ovulationDay: number;
  ovStart: number;
  ovEnd: number;
  ovulationDateStr?: string | null;
  nextPeriodDateStr: string | null;
  nextPeriodEndDateStr?: string | null;
  ovulationWindowStartStr: string | null;
  ovulationWindowEndStr: string | null;
  daysUntilNextPeriod: number | null;
  isIrregular: boolean;
  lockedTodayStr?: string;
}

