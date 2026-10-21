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
  subject: string;
  message: string;
  type: 'payment' | 'support';
  createdAt: string;
}

export interface UserData {
  name: string;
  age: string;
  email: string;
  phone?: string;
  password: string;
  createdAt: number;
  lastUpdatedAt?: string;
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
  themeMode?: 'light' | 'dark';
  customCycleLength?: number;
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

