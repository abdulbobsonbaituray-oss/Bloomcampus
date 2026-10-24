import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  KeyRound,
  Search,
  Mail,
  Phone,
  Sparkles,
  Copy,
  RefreshCw,
  ArrowLeft,
  Lock,
  Unlock,
  MessageSquare,
  Calendar,
  Activity,
  RotateCcw,
  UserPlus,
  Trash2,
  Download,
  Smartphone,
  Edit3,
  Calculator,
  DollarSign,
  TrendingUp,
  Plus,
  ArrowRightLeft,
  BellRing,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AdminAccount, AdminConfig, SupportInquiry, UserData } from '../types';
import {
  CREATOR_EMAIL,
  CREATOR_NAME,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_FREE_ACCESS_PASSWORD,
  OWNER_ADMIN_EMAIL,
} from '../constants';
import { getTrialStatus } from '../utils/cycleEngine';
import { resolveCustomerPhoneUsed } from '../firebase';

interface CustomRevenueItem {
  id: string;
  label: string;
  amountSle: number;
  originalInput: string;
  createdAt: string;
}

const STORAGE_REVENUE_ITEMS_KEY = 'bloomcampus_admin_revenue_items_v1';
const STORAGE_PASS_PRICE_KEY = 'bloomcampus_admin_pass_price_sle_v1';
const STORAGE_USD_RATE_KEY = 'bloomcampus_admin_usd_to_sle_rate_v1';
const STORAGE_AUTO_REV_ADJUST_KEY = 'bloomcampus_admin_auto_rev_adjustment_sle_v1';

interface OwnerAdminDashboardProps {
  usersMap: Record<string, UserData>;
  adminConfig: AdminConfig;
  supportInquiries: SupportInquiry[];
  onUpdateAdminConfig: (nextConfig: AdminConfig) => void;
  onApproveUserPayment: (userEmail: string) => void;
  onExtendUserFreeAccess?: (userEmail: string, daysToAdd?: number) => void;
  onRejectOrExpireUser: (userEmail: string, mode: 'reject' | 'expire') => void;
  onClearPendingVerification?: (userEmail: string) => void;
  onRegisterNewUserByAdmin?: (params: {
    name: string;
    age: string;
    email: string;
    phone: string;
    password: string;
    originalEmail?: string;
    subscriptionStatus?: 'active' | 'pending_verification' | 'expired' | 'free_password';
    subscriptionDays?: number;
  }) => void;
  onDeleteUser?: (userEmail: string) => void;
  onRefreshUsers: () => Promise<number> | void;
  onExitAdmin: () => void;
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const OwnerAdminDashboard: React.FC<OwnerAdminDashboardProps> = ({
  usersMap,
  adminConfig,
  supportInquiries,
  onUpdateAdminConfig,
  onApproveUserPayment,
  onExtendUserFreeAccess,
  onRejectOrExpireUser,
  onClearPendingVerification,
  onRegisterNewUserByAdmin,
  onDeleteUser,
  onRefreshUsers,
  onExitAdmin,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<
    'all' | 'pending' | 'active' | 'expired' | 'free_password'
  >('all');
  const [adminPassInput, setAdminPassInput] = useState(adminConfig.adminPassword);
  const [freePassInput, setFreePassInput] = useState(adminConfig.freeAccessPassword);
  const [lastApprovedUserEmail, setLastApprovedUserEmail] = useState<string | null>(null);
  const [isSyncingEntries, setIsSyncingEntries] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'both' | 'table' | 'cards'>('table');

  // Collapsible Table / Section Buttons State (Reduces Vertical Space)
  const [openTables, setOpenTables] = useState<{
    liveLogins: boolean;
    moneyCalc: boolean;
    currencyCalc: boolean;
    customerTable: boolean;
    customerCards: boolean;
    teamAdmins: boolean;
    adminCodes: boolean;
    inboxAlerts: boolean;
  }>({
    liveLogins: false,
    moneyCalc: false,
    currencyCalc: false,
    customerTable: true,
    customerCards: false,
    teamAdmins: false,
    adminCodes: false,
    inboxAlerts: false,
  });

  const toggleTableSection = (key: keyof typeof openTables) => {
    setOpenTables((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setAllTablesOpen = (isOpen: boolean) => {
    setOpenTables({
      liveLogins: isOpen,
      moneyCalc: isOpen,
      currencyCalc: isOpen,
      customerTable: isOpen,
      customerCards: isOpen,
      teamAdmins: isOpen,
      adminCodes: isOpen,
      inboxAlerts: isOpen,
    });
  };

  // Dedicated "Search for Someone" input & active search state
  const [personSearchInput, setPersonSearchInput] = useState<string>('');
  const [isSearchBoxFocused, setIsSearchBoxFocused] = useState<boolean>(false);

  // Add / Manage Additional Admin Accounts state
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminName, setNewAdminName] = useState('');

  // Manual Register / Edit Customer Entry state (No User Password Field)
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [editingOriginalEmail, setEditingOriginalEmail] = useState<string | null>(null);
  const [manualUserName, setManualUserName] = useState('');
  const [manualUserAge, setManualUserAge] = useState('21');
  const [manualUserEmail, setManualUserEmail] = useState('');
  const [manualUserPhone, setManualUserPhone] = useState('');
  const [manualSubStatus, setManualSubStatus] = useState<
    'active' | 'pending_verification' | 'expired' | 'free_password'
  >('active');
  const [manualSubDays, setManualSubDays] = useState<string>('14');

  // =========================================================================
  // 1. APP MONEY / REVENUE CALCULATOR STATE
  // =========================================================================
  const [passPriceSle, setPassPriceSle] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_PASS_PRICE_KEY));
      return !Number.isNaN(saved) && saved > 0 ? saved : 30;
    } catch {
      return 30;
    }
  });
  const [includePendingInTotal, setIncludePendingInTotal] = useState<boolean>(false);
  const [customRevenueItems, setCustomRevenueItems] = useState<CustomRevenueItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_REVENUE_ITEMS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [newRevLabel, setNewRevLabel] = useState<string>('');
  const [newRevAmount, setNewRevAmount] = useState<string>('');
  const [newRevCurrency, setNewRevCurrency] = useState<'SLE' | 'USD'>('SLE');
  const [autoMoneyAdjustmentSle, setAutoMoneyAdjustmentSle] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_AUTO_REV_ADJUST_KEY));
      return !Number.isNaN(saved) ? saved : 0;
    } catch {
      return 0;
    }
  });

  // =========================================================================
  // 2. USD ($) ⇄ SIERRA LEONEAN LEONES CONVERTER & CHECK CALCULATOR STATE
  // =========================================================================
  const [usdToSleRate, setUsdToSleRate] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(STORAGE_USD_RATE_KEY));
      return !Number.isNaN(saved) && saved > 0 ? saved : 23.5;
    } catch {
      return 23.5;
    }
  });
  const [usdInputStr, setUsdInputStr] = useState<string>('10');
  const [sleInputStr, setSleInputStr] = useState<string>(() => String(10 * 23.5));
  const [lastEditedCurrency, setLastEditedCurrency] = useState<'USD' | 'SLE'>('USD');

  // Quick Check Calculator (Add / Subtract / Multiply / Divide)
  const [calcNumA, setCalcNumA] = useState<string>('30');
  const [calcOp, setCalcOp] = useState<'+' | '-' | '×' | '÷'>('×');
  const [calcNumB, setCalcNumB] = useState<string>('5');
  const [calcInputCurrency, setCalcInputCurrency] = useState<'SLE' | 'USD'>('SLE');

  // Save Pass Price, USD Rate, and Custom Revenue Items to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PASS_PRICE_KEY, String(passPriceSle));
    } catch {
      // ignore
    }
  }, [passPriceSle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_USD_RATE_KEY, String(usdToSleRate));
    } catch {
      // ignore
    }
  }, [usdToSleRate]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_REVENUE_ITEMS_KEY, JSON.stringify(customRevenueItems));
    } catch {
      // ignore
    }
  }, [customRevenueItems]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_AUTO_REV_ADJUST_KEY, String(autoMoneyAdjustmentSle));
    } catch {
      // ignore
    }
  }, [autoMoneyAdjustmentSle]);

  // Keep USD and SLE inputs synchronized when rate changes
  const handleUsdInputChange = (val: string) => {
    setUsdInputStr(val);
    setLastEditedCurrency('USD');
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num >= 0) {
      setSleInputStr(String(Math.round(num * usdToSleRate * 100) / 100));
    } else {
      setSleInputStr('');
    }
  };

  const handleSleInputChange = (val: string) => {
    setSleInputStr(val);
    setLastEditedCurrency('SLE');
    const num = parseFloat(val);
    if (!Number.isNaN(num) && num >= 0 && usdToSleRate > 0) {
      setUsdInputStr(String(Math.round((num / usdToSleRate) * 100) / 100));
    } else {
      setUsdInputStr('');
    }
  };

  const handleRateChange = (nextRateStr: string) => {
    const parsed = parseFloat(nextRateStr);
    const safeRate = !Number.isNaN(parsed) && parsed > 0 ? parsed : 1;
    setUsdToSleRate(safeRate);
    if (lastEditedCurrency === 'USD') {
      const u = parseFloat(usdInputStr);
      if (!Number.isNaN(u)) {
        setSleInputStr(String(Math.round(u * safeRate * 100) / 100));
      }
    } else {
      const l = parseFloat(sleInputStr);
      if (!Number.isNaN(l)) {
        setUsdInputStr(String(Math.round((l / safeRate) * 100) / 100));
      }
    }
  };

  // Auto-sync all entries on mount and every 8 seconds while Admin Console is open
  useEffect(() => {
    void onRefreshUsers();
    const interval = window.setInterval(() => {
      void onRefreshUsers();
    }, 8000);
    return () => window.clearInterval(interval);
  }, []);

  const additionalAdmins: AdminAccount[] = Array.isArray(adminConfig.additionalAdmins)
    ? adminConfig.additionalAdmins
    : [];

  // Sort by customerNumber ascending (1st Entry -> Latest Entry)
  const usersList = useMemo(() => {
    const arr = Object.values(usersMap || {}).filter(
      (u): u is UserData => Boolean(u && typeof u === 'object' && u.email)
    );
    return arr.sort((a, b) => {
      const numA = a.customerNumber || 999999;
      const numB = b.customerNumber || 999999;
      if (numA !== numB) return numA - numB;
      return (a.firstEntryAt || a.createdAt || 0) - (b.firstEntryAt || b.createdAt || 0);
    });
  }, [usersMap]);

  // Recent logins sorted by most recent sign-in or entry timestamp
  const recentLoginsList = useMemo(() => {
    return [...usersList].sort((a, b) => {
      const aTime = a.lastSignInAt
        ? new Date(a.lastSignInAt).getTime()
        : Number(a.firstEntryAt || a.createdAt || 0);
      const bTime = b.lastSignInAt
        ? new Date(b.lastSignInAt).getTime()
        : Number(b.firstEntryAt || b.createdAt || 0);
      return bTime - aTime;
    });
  }, [usersList]);

  const stats = useMemo(() => {
    let total = 0;
    let pending = 0;
    let active = 0;
    let expired = 0;
    let freePass = 0;
    let subscribed = 0;
    let trial = 0;
    let historicalApprovedPasses = 0;

    usersList.forEach((u) => {
      total++;
      const st = getTrialStatus(u);
      if (st.status === 'pending_verification' || u.pendingPayment?.status === 'pending') {
        pending++;
      } else if (st.status === 'expired') {
        expired++;
      } else {
        active++;
        if (st.status === 'free_password') freePass++;
        if (st.status === 'subscribed') subscribed++;
        if (st.status === 'trial') trial++;
      }

      // Count any extra approved payments in paymentHistory beyond current active status
      const approvedHistoryCount = (u.paymentHistory || []).filter(
        (h) => h.status === 'approved'
      ).length;
      if (approvedHistoryCount > 1) {
        historicalApprovedPasses += approvedHistoryCount - 1;
      }
    });

    return {
      total,
      pending,
      active,
      expired,
      freePass,
      subscribed,
      trial,
      historicalApprovedPasses,
    };
  }, [usersList]);

  // =========================================================================
  // COMPUTED APP EARNINGS & REVENUE TOTALS
  // =========================================================================
  const revenueSummary = useMemo(() => {
    const activePaidPassesCount = stats.subscribed + stats.historicalApprovedPasses;
    const rawAutoPassRevenueSle = activePaidPassesCount * passPriceSle;
    const confirmedPassRevenueSle = Math.max(0, rawAutoPassRevenueSle + autoMoneyAdjustmentSle);
    const pendingPassRevenueSle = stats.pending * passPriceSle;
    const customItemsTotalSle = customRevenueItems.reduce(
      (acc, item) => acc + (Number(item.amountSle) || 0),
      0
    );
    const grandTotalSle = Math.max(
      0,
      confirmedPassRevenueSle +
        (includePendingInTotal ? pendingPassRevenueSle : 0) +
        customItemsTotalSle
    );
    const grandTotalUsd = usdToSleRate > 0 ? grandTotalSle / usdToSleRate : 0;
    const grandTotalOldLeones = grandTotalSle * 1000;

    return {
      activePaidPassesCount,
      rawAutoPassRevenueSle,
      confirmedPassRevenueSle,
      pendingPassRevenueSle,
      customItemsTotalSle,
      grandTotalSle,
      grandTotalUsd,
      grandTotalOldLeones,
    };
  }, [
    stats,
    passPriceSle,
    autoMoneyAdjustmentSle,
    includePendingInTotal,
    customRevenueItems,
    usdToSleRate,
  ]);

  // =========================================================================
  // COMPUTED QUICK CHECK ARITHMETIC CALCULATOR
  // =========================================================================
  const quickCalcResult = useMemo(() => {
    const a = parseFloat(calcNumA);
    const b = parseFloat(calcNumB);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return { valid: false, rawResult: 0, resultSle: 0, resultUsd: 0, resultOldSll: 0 };
    }
    let res = 0;
    if (calcOp === '+') res = a + b;
    else if (calcOp === '-') res = a - b;
    else if (calcOp === '×') res = a * b;
    else if (calcOp === '÷') res = b !== 0 ? a / b : 0;

    const resultSle = calcInputCurrency === 'SLE' ? res : res * usdToSleRate;
    const resultUsd =
      calcInputCurrency === 'USD' ? res : usdToSleRate > 0 ? res / usdToSleRate : 0;
    const resultOldSll = resultSle * 1000;

    return {
      valid: true,
      rawResult: Math.round(res * 100) / 100,
      resultSle: Math.round(resultSle * 100) / 100,
      resultUsd: Math.round(resultUsd * 100) / 100,
      resultOldSll: Math.round(resultOldSll),
    };
  }, [calcNumA, calcNumB, calcOp, calcInputCurrency, usdToSleRate]);

  const handleAddCustomRevenueItem = (e?: React.FormEvent, mode: 'add' | 'reduce' = 'add') => {
    if (e) e.preventDefault();
    const rawVal = Math.abs(parseFloat(newRevAmount));
    if (Number.isNaN(rawVal) || rawVal <= 0) {
      showToast('Please enter a valid amount to add or reduce in the revenue calculator.', 'warning');
      return;
    }
    const baseSle =
      newRevCurrency === 'SLE'
        ? Math.round(rawVal * 100) / 100
        : Math.round(rawVal * usdToSleRate * 100) / 100;
    const amountSle = mode === 'reduce' ? -baseSle : baseSle;
    const label =
      newRevLabel.trim() ||
      (mode === 'reduce'
        ? newRevCurrency === 'SLE'
          ? `Manual Reduction (-Le ${rawVal})`
          : `Manual USD Reduction (-$${rawVal})`
        : newRevCurrency === 'SLE'
        ? `Manual Entry (Le ${rawVal})`
        : `Manual USD Entry ($${rawVal})`);

    const item: CustomRevenueItem = {
      id: `rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label,
      amountSle,
      originalInput:
        newRevCurrency === 'SLE'
          ? `${mode === 'reduce' ? '-' : '+'}Le ${rawVal.toLocaleString()}`
          : `${mode === 'reduce' ? '-' : '+'}$${rawVal.toLocaleString()} USD`,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setCustomRevenueItems((prev) => [item, ...prev]);
    setNewRevLabel('');
    setNewRevAmount('');
    showToast(
      mode === 'reduce'
        ? `📉 Reduced App Money by ${item.originalInput} (${label})!`
        : `💰 Added ${item.originalInput} (${label}) to App Money Calculator!`,
      'success'
    );
  };

  const handleQuickAddMoney = (amountSle: number, label: string) => {
    const item: CustomRevenueItem = {
      id: `rev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      label,
      amountSle,
      originalInput: `${amountSle < 0 ? '-' : '+'}Le ${Math.abs(amountSle).toLocaleString()}`,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setCustomRevenueItems((prev) => [item, ...prev]);
    showToast(
      amountSle < 0
        ? `📉 Reduced App Money by Le ${Math.abs(amountSle)} (${label})!`
        : `💰 Added +Le ${amountSle} (${label}) to App Money Calculator!`,
      'success'
    );
  };

  const handleAdjustAutoMoney = (deltaSle: number) => {
    const currentEffective = Math.max(
      0,
      revenueSummary.rawAutoPassRevenueSle + autoMoneyAdjustmentSle
    );
    const nextEffective = Math.max(0, currentEffective + deltaSle);
    const nextAdjustment = nextEffective - revenueSummary.rawAutoPassRevenueSle;
    setAutoMoneyAdjustmentSle(nextAdjustment);
    showToast(
      deltaSle < 0
        ? `📉 Reduced Auto Money Made by Le ${Math.abs(deltaSle)} (Now Le ${nextEffective.toLocaleString()})!`
        : `💰 Increased Auto Money Made by +Le ${deltaSle} (Now Le ${nextEffective.toLocaleString()})!`,
      'info'
    );
  };

  const handleSetExactAutoMoney = (targetSle: number) => {
    const cleanTarget = Math.max(0, Math.round(targetSle * 100) / 100);
    setAutoMoneyAdjustmentSle(cleanTarget - revenueSummary.rawAutoPassRevenueSle);
  };

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const st = getTrialStatus(u);
      const custNumStr = `#${u.customerNumber || ''}`;
      const phoneUsed = resolveCustomerPhoneUsed(u);
      const matchesSearch =
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.age || '').toLowerCase().includes(q) ||
        phoneUsed.toLowerCase().includes(q) ||
        custNumStr.includes(q) ||
        (u.pendingPayment?.transactionId || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (filterTab === 'all') return true;
      if (filterTab === 'pending') {
        return st.status === 'pending_verification' || u.pendingPayment?.status === 'pending';
      }
      if (filterTab === 'expired') return st.status === 'expired';
      if (filterTab === 'free_password') return st.status === 'free_password';
      if (filterTab === 'active') {
        return (
          st.status === 'trial' || st.status === 'subscribed' || st.status === 'free_password'
        );
      }
      return true;
    });
  }, [usersList, searchQuery, filterTab]);

  const handleManualSyncClick = async () => {
    setIsSyncingEntries(true);
    try {
      const total = await onRefreshUsers();
      showToast(
        `🔄 Synced all customer entries from Cloud Firestore & Server! (${
          typeof total === 'number' ? total : stats.total
        } people in app)`,
        'success'
      );
    } finally {
      setIsSyncingEntries(false);
    }
  };

  const handleSavePasswords = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAdmin = adminPassInput.trim() || DEFAULT_ADMIN_PASSWORD;
    const cleanFree = freePassInput.trim() || DEFAULT_FREE_ACCESS_PASSWORD;
    onUpdateAdminConfig({
      ...adminConfig,
      ownerEmail: OWNER_ADMIN_EMAIL,
      adminPassword: cleanAdmin,
      freeAccessPassword: cleanFree,
      additionalAdmins,
      updatedAt: new Date().toISOString(),
    });
    showToast(
      '✅ Saved & synced Owner Admin Password and Free 30-Day Access Password!',
      'success'
    );
  };

  const handleResetDefaultPasswords = () => {
    setAdminPassInput(DEFAULT_ADMIN_PASSWORD);
    setFreePassInput(DEFAULT_FREE_ACCESS_PASSWORD);
    onUpdateAdminConfig({
      ...adminConfig,
      ownerEmail: OWNER_ADMIN_EMAIL,
      adminPassword: DEFAULT_ADMIN_PASSWORD,
      freeAccessPassword: DEFAULT_FREE_ACCESS_PASSWORD,
      additionalAdmins,
      updatedAt: new Date().toISOString(),
    });
    showToast('🔄 Reset Owner Admin and Free 30-Day Access passwords to defaults.', 'info');
  };

  const handleAddAdminAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const emailClean = newAdminEmail.trim().toLowerCase();
    const passClean = newAdminPassword.trim();
    const nameClean = newAdminName.trim();

    if (!emailClean || !emailClean.includes('@')) {
      showToast('Please enter a valid email address for the new Admin.', 'warning');
      return;
    }
    if (!passClean || passClean.length < 4) {
      showToast('Please set a password of at least 4 characters for this Admin.', 'warning');
      return;
    }
    if (emailClean === OWNER_ADMIN_EMAIL.toLowerCase()) {
      showToast(
        `${OWNER_ADMIN_EMAIL} is already the Primary Owner Admin. Use the box below to update your Owner password.`,
        'info'
      );
      return;
    }

    const existingIdx = additionalAdmins.findIndex(
      (a) => a.email.trim().toLowerCase() === emailClean
    );
    const updatedList = [...additionalAdmins];
    const nextAccount: AdminAccount = {
      email: emailClean,
      password: passClean,
      name: nameClean || emailClean.split('@')[0],
      addedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      updatedList[existingIdx] = nextAccount;
    } else {
      updatedList.push(nextAccount);
    }

    onUpdateAdminConfig({
      ...adminConfig,
      ownerEmail: OWNER_ADMIN_EMAIL,
      additionalAdmins: updatedList,
      updatedAt: new Date().toISOString(),
    });

    setNewAdminEmail('');
    setNewAdminPassword('');
    setNewAdminName('');
    showToast(
      existingIdx >= 0
        ? `✅ Updated Admin password for ${emailClean}! They can log in to view all people in the app.`
        : `🛡️ Added ${emailClean} as an Admin! They can now sign in with their email & password to see all sign-ups.`,
      'success'
    );
  };

  const handleRemoveAdminAccount = (emailToRemove: string) => {
    const clean = emailToRemove.trim().toLowerCase();
    const updatedList = additionalAdmins.filter(
      (a) => a.email.trim().toLowerCase() !== clean
    );
    onUpdateAdminConfig({
      ...adminConfig,
      ownerEmail: OWNER_ADMIN_EMAIL,
      additionalAdmins: updatedList,
      updatedAt: new Date().toISOString(),
    });
    showToast(`Removed admin access for ${emailToRemove}.`, 'info');
  };

  const handleOpenEditCustomerEntry = (u: UserData) => {
    const st = getTrialStatus(u);
    setEditingOriginalEmail(u.email);
    setManualUserName(u.name || '');
    setManualUserAge(u.age || '21');
    setManualUserEmail(u.email || '');
    setManualUserPhone(resolveCustomerPhoneUsed(u));
    setManualSubStatus(
      st.status === 'expired'
        ? 'expired'
        : st.status === 'pending_verification'
        ? 'pending_verification'
        : st.status === 'free_password'
        ? 'free_password'
        : 'active'
    );
    setManualSubDays(String(st.daysLeft > 0 ? st.daysLeft : 14));
    setShowAddUserForm(true);
    window.scrollTo({ top: 180, behavior: 'smooth' });
  };

  const handleManualUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRegisterNewUserByAdmin) return;
    const emailClean = manualUserEmail.trim().toLowerCase();
    if (!emailClean || !emailClean.includes('@')) {
      showToast('Please enter a valid customer email address.', 'warning');
      return;
    }
    const parsedDays = Number(manualSubDays);
    onRegisterNewUserByAdmin({
      name: manualUserName.trim() || emailClean.split('@')[0],
      age: manualUserAge.trim() || '21',
      email: emailClean,
      phone: manualUserPhone.trim(),
      password: '',
      originalEmail: editingOriginalEmail || undefined,
      subscriptionStatus: manualSubStatus,
      subscriptionDays: !Number.isNaN(parsedDays) ? parsedDays : 14,
    });
    setEditingOriginalEmail(null);
    setManualUserName('');
    setManualUserAge('21');
    setManualUserEmail('');
    setManualUserPhone('');
    setManualSubStatus('active');
    setManualSubDays('14');
    setShowAddUserForm(false);
  };

  const handleExportUsersCsv = () => {
    const headers = [
      'Customer Entry #',
      'Name',
      'Email',
      'Age',
      'Number Used (Phone)',
      'First Entry Date',
      'Last Sign-In Date',
      'Sign-In Count',
      'Device / Source',
      'Access Status',
      'Days Remaining',
    ];
    const rows = usersList.map((u, idx) => {
      const st = getTrialStatus(u);
      const firstDateStr = u.firstEntryAt || u.createdAt
        ? new Date(u.firstEntryAt || u.createdAt).toLocaleString()
        : '';
      const lastSignInStr = u.lastSignInAt
        ? new Date(u.lastSignInAt).toLocaleString()
        : firstDateStr;
      const phoneUsed = resolveCustomerPhoneUsed(u);
      return [
        `#${u.customerNumber || idx + 1}`,
        u.name || 'Student',
        u.email,
        u.age || '',
        phoneUsed,
        firstDateStr,
        lastSignInStr,
        String(u.signInCount || 1),
        u.deviceInfo || u.signupSource || 'WebApp',
        st.status,
        String(st.daysLeft),
      ]
        .map((field) => `"${String(field).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bloomcampus-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`📥 Exported ${usersList.length} customer entries to CSV!`, 'success');
  };

  const buildCustomerReportText = () => {
    const lines = usersList.map((u, idx) => {
      const st = getTrialStatus(u);
      const phoneUsed = resolveCustomerPhoneUsed(u) || 'Not entered';
      const lastLoginStr = u.lastSignInAt
        ? new Date(u.lastSignInAt).toLocaleString()
        : u.firstEntryAt
        ? new Date(u.firstEntryAt).toLocaleString()
        : 'Recorded';
      return `Customer #${u.customerNumber || idx + 1}: ${u.name || 'Student'} | Email: ${u.email} | Age: ${u.age || '—'} | Number Used: ${phoneUsed} | Last Login: ${lastLoginStr} | Status: ${st.label} (${st.daysLeft}d left)`;
    });
    return (
      `BloomCampus & Sidratu Customer Login & Sign-Up Directory (${usersList.length} Total People)\n` +
      `Generated: ${new Date().toLocaleString()}\n\n` +
      lines.join('\n')
    );
  };

  const handleCopyAllCustomersText = () => {
    const report = buildCustomerReportText();
    navigator.clipboard?.writeText(report);
    showToast(
      `📋 Copied all ${usersList.length} customer entries (Name, Email, Age, Number Used) to clipboard!`,
      'success'
    );
  };

  const handleEmailAllLoginsToOwner = () => {
    const report = buildCustomerReportText();
    const subject = `📊 BloomCampus Live User Login Report (${usersList.length} People in App)`;
    const mailto = `mailto:${encodeURIComponent(OWNER_ADMIN_EMAIL)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(report)}`;
    const a = document.createElement('a');
    a.href = mailto;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`✉️ Opened email to ${OWNER_ADMIN_EMAIL} with all ${usersList.length} user logins!`, 'success');
  };

  const handleWhatsAppAllLoginsToOwner = () => {
    const report = buildCustomerReportText();
    const waHref = `https://wa.me/23273604401?text=${encodeURIComponent(report)}`;
    window.open(waHref, '_blank', 'noopener,noreferrer');
  };

  // Build mailto link to send approval confirmation email from Owner to User
  const buildApprovalEmailHref = (u: UserData) => {
    const expDate = u.subscriptionUntil
      ? new Date(u.subscriptionUntil).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '30 days from today';
    const subject = `✅ BloomCampus & Sidratu 30-Day Subscription Approved!`;
    const body =
      `Hello ${u.name || 'Student'},\n\n` +
      `Great news! Your Orange Money payment (Le 30) has been verified and approved by ${CREATOR_NAME}.\n\n` +
      `• Account Email: ${u.email}\n` +
      `• Subscription Status: Active (30-Day Full Access)\n` +
      `• Valid Until: ${expDate}\n\n` +
      `Simply open the BloomCampus app and your account will automatically unlock with a welcome message.\n\n` +
      `Warm regards,\n${CREATOR_NAME}\n${CREATOR_EMAIL}`;
    return `mailto:${encodeURIComponent(u.email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  // Build WhatsApp confirmation link for Sierra Leone numbers
  const buildWhatsAppHref = (u: UserData) => {
    const rawPhone = resolveCustomerPhoneUsed(u);
    const digits = rawPhone.replace(/\D/g, '');
    const formattedPhone = digits.startsWith('0')
      ? `232${digits.slice(1)}`
      : digits.startsWith('232')
      ? digits
      : digits;
    const expDate = u.subscriptionUntil
      ? new Date(u.subscriptionUntil).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '30 days from today';
    const text = `Hello ${u.name || 'Student'} 🌸! Your BloomCampus & Sidratu 30-Day Subscription has been APPROVED by ${CREATOR_NAME}. Your account (${u.email}) is now unlocked until ${expDate}!`;
    return formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  // Build SMS confirmation link for mobile devices
  const buildSmsHref = (u: UserData) => {
    const rawPhone = resolveCustomerPhoneUsed(u);
    const expDate = u.subscriptionUntil
      ? new Date(u.subscriptionUntil).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '30 days';
    const text = `BloomCampus Approved: Hi ${u.name || 'Student'}, your 30-day subscription (${u.email}) is now active until ${expDate}! - ${CREATOR_NAME}`;
    return `sms:${rawPhone}?body=${encodeURIComponent(text)}`;
  };

  return (
    <div className="min-h-screen bg-cream text-slate-800 flex flex-col">
      {/* Top Owner Admin Header */}
      <header className="bg-gradient-to-r from-plum-900 via-lavender-900 to-plum-900 text-white shadow-lg border-b border-gold-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gold-500/20 border border-gold-400/50 flex items-center justify-center text-gold-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-gold-500 text-plum-900">
                  Owner Admin Console
                </span>
                <span className="text-xs text-gold-400 font-mono">{OWNER_ADMIN_EMAIL}</span>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-200">
                  👥 {stats.total} {stats.total === 1 ? 'Person' : 'People'} in App
                </span>
                <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-200">
                  💰 App Total: Le {revenueSummary.grandTotalSle.toLocaleString()} ($
                  {revenueSummary.grandTotalUsd.toFixed(2)})
                </span>
              </div>
              <h1 className="font-display font-extrabold text-xl sm:text-2xl text-white mt-1">
                Live People Logging In, App Money Calculator &amp; USD ⇄ Leones Converter
              </h1>
              <p className="text-xs text-white/80 mt-0.5">
                Created by <strong>{CREATOR_NAME}</strong> · Real-Time Login Sync Across All Phones &amp; Computers (User Passwords Removed)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('admin-person-search-input');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  (el as HTMLInputElement).focus();
                }
              }}
              className="px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-plum-900 text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Jump to Search for Someone in the Admin Area"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search Someone</span>
            </button>
            <button
              type="button"
              onClick={handleManualSyncClick}
              disabled={isSyncingEntries}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-xs font-extrabold border border-emerald-400/40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingEntries ? 'animate-spin' : ''}`} />
              <span>{isSyncingEntries ? 'Syncing...' : 'Sync All Entries'}</span>
            </button>
            <button
              type="button"
              onClick={handleEmailAllLoginsToOwner}
              className="px-3.5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold border border-white/25 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Send full login & customer list to your email"
            >
              <Mail className="w-3.5 h-3.5 text-gold-400" />
              <span>Email Me All Logins</span>
            </button>
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-4 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-plum-900 font-extrabold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Switch to User Phase</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* =================================================================== */}
        {/* TOP KPI SUMMARY CARDS                                               */}
        {/* =================================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-gradient-to-br from-plum-900 to-lavender-900 text-white rounded-2xl p-4 border-2 border-gold-500/50 shadow-sm">
            <div className="flex items-center justify-between text-gold-400 text-xs font-extrabold uppercase">
              <span>People in App</span>
              <Users className="w-4 h-4 text-gold-400" />
            </div>
            <div className="font-display font-extrabold text-3xl text-white mt-1 tabular-nums">
              {stats.total}
            </div>
            <p className="text-[11px] text-white/80 mt-0.5">
              Total registered accounts
            </p>
          </div>

          <div className="bg-gradient-to-br from-emerald-900 to-sage-900 text-white rounded-2xl p-4 border-2 border-emerald-400/50 shadow-sm">
            <div className="flex items-center justify-between text-emerald-300 text-xs font-extrabold uppercase">
              <span>Money Made</span>
              <TrendingUp className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="font-display font-extrabold text-2xl sm:text-3xl text-white mt-1 tabular-nums">
              Le {revenueSummary.grandTotalSle.toLocaleString()}
            </div>
            <p className="text-[11px] text-emerald-200 mt-0.5 font-mono">
              ≈ ${revenueSummary.grandTotalUsd.toFixed(2)} USD
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border-2 border-orange-300 shadow-xs">
            <div className="flex items-center justify-between text-orange-800 text-xs font-extrabold">
              <span>Pending Orange Money</span>
              <Clock className="w-4 h-4 text-orange-600" />
            </div>
            <div className="font-display font-extrabold text-3xl text-orange-600 mt-1 tabular-nums">
              {stats.pending}
            </div>
            <p className="text-[11px] text-orange-800 mt-0.5">
              Le {(stats.pending * passPriceSle).toLocaleString()} awaiting approval
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-sage-200 shadow-xs">
            <div className="flex items-center justify-between text-sage-800 text-xs font-bold">
              <span>2-Week Free Users</span>
              <CheckCircle2 className="w-4 h-4 text-sage-600" />
            </div>
            <div className="font-display font-extrabold text-3xl text-sage-800 mt-1 tabular-nums">
              {stats.trial}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Active 14-day free access</p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-lavender-200 shadow-xs">
            <div className="flex items-center justify-between text-lavender-900 text-xs font-bold">
              <span>Paid + 30d Pass</span>
              <KeyRound className="w-4 h-4 text-lavender-700" />
            </div>
            <div className="font-display font-extrabold text-3xl text-lavender-900 mt-1 tabular-nums">
              {stats.subscribed + stats.freePass}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {stats.subscribed} Paid · {stats.freePass} Free Code
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-rose-200 shadow-xs">
            <div className="flex items-center justify-between text-rose-800 text-xs font-bold">
              <span>Expired / Locked</span>
              <Lock className="w-4 h-4 text-rose-600" />
            </div>
            <div className="font-display font-extrabold text-3xl text-rose-700 mt-1 tabular-nums">
              {stats.expired}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Requires renewal</p>
          </div>
        </div>

        {/* =================================================================== */}
        {/* DEDICATED "SEARCH FOR SOMEONE" BAR & INSTANT PERSON FINDER          */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-plum-900/20 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-plum-900 text-gold-400 flex items-center justify-center shrink-0">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                  🔍 Search for Someone in the Admin Area
                </h2>
                <p className="text-xs text-slate-600">
                  Search any person by <strong>Name</strong>, <strong>Email</strong>, <strong>Phone Number</strong>, <strong>Age</strong>, or <strong>Customer #</strong> to give 1 Month Free (Le 0) or manage their account immediately.
                </p>
              </div>
            </div>

            {onExtendUserFreeAccess && usersList.length > 0 && (
              <button
                type="button"
                onClick={() => onExtendUserFreeAccess('ALL', 30)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer self-start md:self-auto shrink-0"
                title="Give every logged-in person 1 Month (30 Days) Free with Le 0 added to Money Made"
              >
                <span>🎁 Give All {usersList.length} People 1 Month Free (Le 0)</span>
              </button>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearchQuery(personSearchInput.trim());
              setIsSearchBoxFocused(true);
              if (!personSearchInput.trim()) {
                showToast('Showing all people in the app.', 'info');
              } else {
                showToast(`🔍 Searching for "${personSearchInput.trim()}"...`, 'info');
              }
            }}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="admin-person-search-input"
                type="text"
                value={personSearchInput}
                onFocus={() => setIsSearchBoxFocused(true)}
                onChange={(e) => {
                  setPersonSearchInput(e.target.value);
                  setSearchQuery(e.target.value);
                }}
                placeholder="Type Name, Email, Phone Number (076...), Age, or #1..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border-2 border-lavender-300 bg-cream/60 text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-plum-900 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>Search Person</span>
              </button>

              {(personSearchInput.trim() !== '' || searchQuery.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setPersonSearchInput('');
                    setSearchQuery('');
                    setIsSearchBoxFocused(false);
                  }}
                  className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-extrabold text-xs cursor-pointer shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          </form>

          {/* Instant Search Results Preview when searching for someone */}
          {searchQuery.trim() !== '' && (
            <div className="rounded-2xl bg-lavender-50/70 border-2 border-lavender-300 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-plum-900">
                  🔍 Found {filteredUsers.length} {filteredUsers.length === 1 ? 'Person' : 'People'} matching &ldquo;{searchQuery}&rdquo;
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOpenTables((prev) => ({ ...prev, customerTable: true }));
                  }}
                  className="text-[11px] font-extrabold text-lavender-800 underline cursor-pointer"
                >
                  Open Full Customer Table Below
                </button>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="rounded-xl bg-white p-3 text-xs text-slate-600 border border-slate-200">
                  No person found matching <strong>&ldquo;{searchQuery}&rdquo;</strong>. Try searching by part of their name, email, or phone number, or click <strong>&ldquo;Sync All Entries&rdquo;</strong> at the top.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {filteredUsers.map((u, idx) => {
                    const st = getTrialStatus(u);
                    const custNum = u.customerNumber || idx + 1;
                    const phoneUsed = resolveCustomerPhoneUsed(u) || 'No phone';
                    return (
                      <div
                        key={`search-hit-${u.email}`}
                        className="rounded-xl bg-white border border-lavender-200 p-3 flex flex-col justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-plum-900 text-gold-400 font-mono font-extrabold text-[10px]">
                                #{custNum}
                              </span>
                              <span className="font-display font-extrabold text-sm text-slate-900">
                                {u.name || 'Student'}
                              </span>
                              <span className="text-[11px] font-mono text-slate-500">
                                ({u.age ? `${u.age} yrs` : '21 yrs'})
                              </span>
                            </div>
                            <div className="text-xs font-mono font-bold text-lavender-900 break-all mt-0.5">
                              ✉️ {u.email}
                            </div>
                            <div className="text-[11px] font-mono font-semibold text-sage-900">
                              📞 {phoneUsed} • <strong>{st.daysLeft}d left</strong> ({st.status === 'free_password' ? '1M Free' : st.status === 'trial' ? '2W Free' : st.status})
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
                          {onExtendUserFreeAccess && (
                            <button
                              type="button"
                              onClick={() => onExtendUserFreeAccess(u.email, 30)}
                              className="px-2.5 py-1.5 rounded-lg bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-[11px] cursor-pointer"
                              title="Give 1 Month (30 Days) Free without adding money (Le 0)"
                            >
                              🎁 1 Month Free (Le 0)
                            </button>
                          )}
                          {onExtendUserFreeAccess && (
                            <button
                              type="button"
                              onClick={() => onExtendUserFreeAccess(u.email, 14)}
                              className="px-2 py-1.5 rounded-lg bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-[10px] cursor-pointer"
                            >
                              +14d Free
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              onApproveUserPayment(u.email);
                              setLastApprovedUserEmail(u.email);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-800 text-white font-extrabold text-[10px] cursor-pointer"
                          >
                            Paid +30d (+Le {passPriceSle})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenTables((prev) => ({ ...prev, customerTable: true }));
                              handleOpenEditCustomerEntry(u);
                            }}
                            className="px-2 py-1.5 rounded-lg bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-[10px] cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onRejectOrExpireUser(u.email, 'expire')}
                            className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[10px] cursor-pointer"
                          >
                            Lock
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* COMPACT TABLE & TOOL LAUNCHER BUTTONS BAR (SAVES SPACE)             */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-gold-500/40 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                🗂️ Admin Tables &amp; Calculators (Click Any Button Below to Open or Hide Table)
              </h2>
              <p className="text-[11px] text-slate-500">
                Each table is turned into a compact button so your Admin Area stays clean and easy to use.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAllTablesOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-extrabold text-[11px] cursor-pointer"
              >
                Expand All Tables
              </button>
              <button
                type="button"
                onClick={() => setAllTablesOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] cursor-pointer"
              >
                Collapse All (Save Space)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              {
                key: 'customerTable' as const,
                label: `📋 Customer Table (${filteredUsers.length})`,
                sub: '1st Entry to Latest',
              },
              {
                key: 'liveLogins' as const,
                label: `🟢 Live People Logging In (${recentLoginsList.length})`,
                sub: 'Give 1M Free (Le 0)',
              },
              {
                key: 'moneyCalc' as const,
                label: `💰 Money Made (Le ${revenueSummary.grandTotalSle.toLocaleString()})`,
                sub: 'Add or Reduce Money',
              },
              {
                key: 'currencyCalc' as const,
                label: `💱 USD ($) ⇄ Leones`,
                sub: `$1 = Le ${usdToSleRate}`,
              },
              {
                key: 'customerCards' as const,
                label: `🪪 Detailed Customer Cards (${filteredUsers.length})`,
                sub: 'Full Actions & Logs',
              },
              {
                key: 'teamAdmins' as const,
                label: `🛡️ Team Admins (${1 + additionalAdmins.length})`,
                sub: 'Add / Remove Admins',
              },
              {
                key: 'adminCodes' as const,
                label: `🔑 Admin & 30d Free Codes`,
                sub: 'Manage Passwords',
              },
              {
                key: 'inboxAlerts' as const,
                label: `📬 Login & Payment Inbox (${supportInquiries.length})`,
                sub: 'Live Alerts Log',
              },
            ].map((item) => {
              const isOpen = openTables[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleTableSection(item.key)}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    isOpen
                      ? 'bg-plum-900 text-white border-gold-500 shadow-xs'
                      : 'bg-cream/70 hover:bg-lavender-50 text-slate-900 border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-extrabold text-xs truncate">{item.label}</div>
                    <div
                      className={`text-[10px] truncate mt-0.5 ${
                        isOpen ? 'text-gold-400 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {item.sub}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4 text-gold-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* =================================================================== */}
        {/* TABLE BUTTON 1: LIVE PEOPLE LOGGING IN & REAL-TIME SIGN-IN FEED     */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-emerald-300 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleTableSection('liveLogins')}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-emerald-50/60 hover:bg-emerald-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <BellRing className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    🟢 Live People Logging In &amp; Sign-Up Feed ({recentLoginsList.length} People)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-extrabold">
                    Click to {openTables.liveLogins ? 'Hide' : 'Open'} Table
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  See everyone logging in and give 1 Month Free (Le 0) with 1 click.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs flex items-center gap-1">
                <span>{openTables.liveLogins ? 'Hide Table' : 'Open Table'}</span>
                {openTables.liveLogins ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </div>
          </button>

          {openTables.liveLogins && (
            <div className="p-5 sm:p-6 border-t border-emerald-200 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  Every person who creates an account or signs in from any phone or computer appears here immediately.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {onExtendUserFreeAccess && recentLoginsList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onExtendUserFreeAccess('ALL', 30)}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      title="Give every logged-in person 1 Month (30 Days) Free without adding any money to Money Made"
                    >
                      <span>🎁 Give All People 1 Month Free (Le 0)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleManualSyncClick}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingEntries ? 'animate-spin' : ''}`} />
                    <span>Refresh People Logging In</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleEmailAllLoginsToOwner}
                    className="px-3.5 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Send Login Info to My Email</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWhatsAppAllLoginsToOwner}
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp Login List</span>
                  </button>
                </div>
              </div>

              {recentLoginsList.length === 0 ? (
                <div className="rounded-2xl bg-cream p-5 text-center text-xs text-slate-600 border border-slate-200">
                  No logins recorded yet. Click <strong>&ldquo;Refresh People Logging In&rdquo;</strong>.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentLoginsList.slice(0, 12).map((u, idx) => {
                    const phoneUsed = resolveCustomerPhoneUsed(u) || 'Not entered';
                    const lastLoginDate = u.lastSignInAt
                      ? new Date(u.lastSignInAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : u.firstEntryAt || u.createdAt
                      ? new Date(u.firstEntryAt || u.createdAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'Just now';
                    const st = getTrialStatus(u);

                    return (
                      <div
                        key={`recent-login-${u.email}-${idx}`}
                        className="rounded-2xl bg-emerald-50/50 border border-emerald-200 p-3.5 flex flex-col justify-between gap-2.5"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded-md bg-plum-900 text-gold-400 font-mono font-extrabold text-[11px]">
                              Customer #{u.customerNumber || idx + 1}
                            </span>
                            <span className="text-[11px] font-mono font-bold text-emerald-800">
                              🕒 {lastLoginDate}
                            </span>
                          </div>
                          <div className="font-display font-extrabold text-sm text-slate-900 mt-1.5">
                            {u.name || 'Student'}{' '}
                            <span className="text-xs font-mono font-bold text-slate-500">
                              ({u.age ? `${u.age} yrs` : '21 yrs'})
                            </span>
                          </div>
                          <div className="text-xs font-mono font-bold text-lavender-900 break-all">
                            ✉️ {u.email}
                          </div>
                          <div className="text-xs font-mono font-bold text-sage-900 mt-0.5">
                            📞 Phone Used: {phoneUsed}
                          </div>
                        </div>

                        <div className="pt-2 border-t border-emerald-200/70 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span className="truncate max-w-[165px]">
                              {u.deviceInfo || '📱/💻 WebApp'} • {u.signInCount || 1} login(s)
                            </span>
                            <span className="font-extrabold text-emerald-900">
                              {st.daysLeft}d left (
                              {st.status === 'free_password'
                                ? 'Free 1M'
                                : st.status === 'trial'
                                ? 'Free 2W'
                                : st.status}
                              )
                            </span>
                          </div>

                          {onExtendUserFreeAccess && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onExtendUserFreeAccess(u.email, 30)}
                                className="flex-1 py-1.5 px-2.5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-2xs transition-all cursor-pointer"
                                title="Give this logged-in person 1 Month (30 Days) Free without adding to Money Made (Le 0)"
                              >
                                <span>🎁 Give 1 Month Free (Le 0)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onExtendUserFreeAccess(u.email, 14)}
                                className="py-1.5 px-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-[10px] transition-all cursor-pointer"
                                title="Extend +14 days free access (Le 0)"
                              >
                                +14d Free
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* TABLE BUTTONS 2 & 3: TWO ADMIN CALCULATORS (COLLAPSIBLE BUTTONS)    */}
        {/* =================================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CALCULATOR 1 BUTTON: APP EARNINGS & REVENUE CALCULATOR ("MONEY THE APP IS MAKING") */}
          <section className="bg-white rounded-3xl border-2 border-amber-300 shadow-xs overflow-hidden self-start">
            <button
              type="button"
              onClick={() => toggleTableSection('moneyCalc')}
              className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-amber-50/70 hover:bg-amber-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-plum-900 flex items-center justify-center shrink-0">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 block">
                    💰 App Revenue &amp; Auto Money Reducer
                  </span>
                  <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    Money the App Is Making: Le {revenueSummary.grandTotalSle.toLocaleString()} ($
                    {revenueSummary.grandTotalUsd.toFixed(2)})
                  </h2>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-amber-600 text-white font-extrabold text-xs flex items-center gap-1 shrink-0">
                <span>{openTables.moneyCalc ? 'Hide' : 'Open'}</span>
                {openTables.moneyCalc ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            {openTables.moneyCalc && (
              <div className="p-5 sm:p-6 border-t border-amber-200 space-y-4">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const summaryText =
                        `💰 BloomCampus & Sidratu App Revenue Summary\n` +
                        `• Price per 30-Day Pass: Le ${passPriceSle}\n` +
                        `• Paid Verified Passes (${revenueSummary.activePaidPassesCount}): Le ${revenueSummary.confirmedPassRevenueSle.toLocaleString()}\n` +
                        `• Pending Passes (${stats.pending}): Le ${revenueSummary.pendingPassRevenueSle.toLocaleString()}\n` +
                        `• Custom Added Money (${customRevenueItems.length} items): Le ${revenueSummary.customItemsTotalSle.toLocaleString()}\n` +
                        `• GRAND TOTAL MONEY MADE: Le ${revenueSummary.grandTotalSle.toLocaleString()} SLE (≈ $${revenueSummary.grandTotalUsd.toFixed(2)} USD / ${revenueSummary.grandTotalOldLeones.toLocaleString()} Old Leones)`;
                      navigator.clipboard?.writeText(summaryText);
                      showToast('📋 Copied App Money & Revenue Report to clipboard!', 'success');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Total Report</span>
                  </button>
                </div>

                {/* Grand Total Display Banner */}
                <div className="rounded-2xl bg-gradient-to-r from-plum-900 via-lavender-900 to-plum-900 text-white p-4 border border-gold-500/40 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-gold-400">
                      Grand Total Money Made (Auto Subscriptions + Added Entries)
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/90 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includePendingInTotal}
                        onChange={(e) => setIncludePendingInTotal(e.target.checked)}
                        className="rounded border-white/30"
                      />
                      <span>Include Pending ({stats.pending})</span>
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
                    <div className="font-display font-extrabold text-3xl sm:text-4xl text-gold-400 tabular-nums">
                      Le {revenueSummary.grandTotalSle.toLocaleString()}{' '}
                      <span className="text-xs font-mono text-white/80">SLE (New Leones)</span>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-extrabold text-lg text-emerald-300 tabular-nums">
                        ≈ ${revenueSummary.grandTotalUsd.toFixed(2)} USD
                      </div>
                      <div className="font-mono text-[11px] text-white/75 tabular-nums">
                        Old Leones: Le {revenueSummary.grandTotalOldLeones.toLocaleString()} SLL
                      </div>
                    </div>
                  </div>
                </div>

                {/* Automatic Subscription Breakdown Grid with Direct Reduce / Set Auto Money Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="rounded-xl bg-cream p-3 border border-slate-200">
                    <span className="text-[10px] font-extrabold uppercase text-slate-500 block">
                      Price Per 30-Day Pass (Le)
                    </span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-bold text-slate-700">Le</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={passPriceSle}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setPassPriceSle(!Number.isNaN(v) && v >= 0 ? v : 0);
                        }}
                        className="w-full px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      🎁 1-Month Free grants = Le 0
                    </span>
                  </div>

                  <div className="rounded-xl bg-emerald-50/70 p-3 border border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-extrabold uppercase text-emerald-800">
                        Auto Money Made ({revenueSummary.activePaidPassesCount} Paid)
                      </span>
                      {autoMoneyAdjustmentSle !== 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setAutoMoneyAdjustmentSle(0);
                            showToast('Reset Auto Money Made to default paid pass count.', 'info');
                          }}
                          className="text-[10px] font-extrabold text-emerald-800 underline cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-emerald-900 text-xs">Le</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={revenueSummary.confirmedPassRevenueSle}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          handleSetExactAutoMoney(!Number.isNaN(val) && val >= 0 ? val : 0);
                        }}
                        className="w-full px-2 py-1 rounded-lg border border-emerald-300 bg-white font-mono font-extrabold text-sm text-emerald-900"
                        title="Type any amount to directly set or reduce Auto Money Made"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={() => handleAdjustAutoMoney(-(passPriceSle || 30))}
                        className="px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-mono font-extrabold text-[10px] cursor-pointer"
                        title="Reduce Auto Money Made by 1 pass"
                      >
                        −Le {passPriceSle || 30}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustAutoMoney(passPriceSle || 30)}
                        className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-mono font-extrabold text-[10px] cursor-pointer"
                        title="Add 1 pass to Auto Money Made"
                      >
                        +Le {passPriceSle || 30}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleSetExactAutoMoney(0);
                          showToast('📉 Set Auto Money Made to Le 0!', 'info');
                        }}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 font-extrabold text-[10px] cursor-pointer"
                        title="Set Auto Money Made to Le 0"
                      >
                        Set Le 0
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-orange-50/70 p-3 border border-orange-200">
                    <span className="text-[10px] font-extrabold uppercase text-orange-800 block">
                      Pending Passes ({stats.pending})
                    </span>
                    <div className="font-display font-extrabold text-base text-orange-800 mt-1 tabular-nums">
                      Le {revenueSummary.pendingPassRevenueSle.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-orange-700">
                      {includePendingInTotal ? 'Included in total' : 'Check box above to include'}
                    </span>
                  </div>
                </div>

                {/* Quick-Tap Money Adder & Reducer Buttons */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 block">
                      Quick-Tap to Add Up Money (+Le):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { amount: 30, label: '1 Subscription Pass (+Le 30)' },
                        { amount: 60, label: '2 Subscription Passes (+Le 60)' },
                        { amount: 150, label: '5 Subscription Passes (+Le 150)' },
                        { amount: 300, label: '10 Subscription Passes (+Le 300)' },
                        { amount: 500, label: 'Clinic / Custom (+Le 500)' },
                        { amount: 1000, label: 'Clinic / Custom (+Le 1,000)' },
                      ].map((btn) => (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => handleQuickAddMoney(btn.amount, btn.label)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-mono font-extrabold text-xs transition-all cursor-pointer"
                        >
                          +Le {btn.amount}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800 block">
                      Quick-Tap to Reduce / Subtract Money (−Le):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { amount: 30, label: 'Reduce 1 Pass (−Le 30)' },
                        { amount: 60, label: 'Reduce 2 Passes (−Le 60)' },
                        { amount: 150, label: 'Reduce 5 Passes (−Le 150)' },
                        { amount: 300, label: 'Reduce 10 Passes (−Le 300)' },
                        { amount: 500, label: 'Reduce Custom (−Le 500)' },
                      ].map((btn) => (
                        <button
                          key={btn.label}
                          type="button"
                          onClick={() => handleAdjustAutoMoney(-btn.amount)}
                          className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 font-mono font-extrabold text-xs transition-all cursor-pointer"
                        >
                          −Le {btn.amount}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          handleSetExactAutoMoney(0);
                          setCustomRevenueItems([]);
                          setIncludePendingInTotal(false);
                          showToast('📉 Reset Total App Money Made to Le 0!', 'info');
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-extrabold text-xs transition-all cursor-pointer"
                      >
                        Reset All Money to Le 0
                      </button>
                    </div>
                  </div>
                </div>

                {/* Custom Revenue Item Form (Supports + Add and − Reduce) */}
                <form
                  onSubmit={(e) => handleAddCustomRevenueItem(e, 'add')}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-cream p-3 rounded-2xl border border-slate-200"
                >
                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-extrabold uppercase text-slate-600 block mb-1">
                      Description / Note
                    </label>
                    <input
                      type="text"
                      value={newRevLabel}
                      onChange={(e) => setNewRevLabel(e.target.value)}
                      placeholder="e.g., Direct Orange Money / Expense"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[10px] font-extrabold uppercase text-slate-600 block mb-1">
                      Amount *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={newRevAmount}
                      onChange={(e) => setNewRevAmount(e.target.value)}
                      placeholder="e.g., 30"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-xs text-slate-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-extrabold uppercase text-slate-600 block mb-1">
                      Currency
                    </label>
                    <select
                      value={newRevCurrency}
                      onChange={(e) => setNewRevCurrency(e.target.value as 'SLE' | 'USD')}
                      className="w-full px-2 py-2 rounded-xl border border-slate-300 bg-white font-extrabold text-xs text-slate-900"
                    >
                      <option value="SLE">Le (SLE)</option>
                      <option value="USD">$ (USD)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3 flex items-center gap-1.5">
                    <button
                      type="submit"
                      className="flex-1 py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer h-[34px]"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddCustomRevenueItem(undefined, 'reduce')}
                      className="flex-1 py-2 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer h-[34px]"
                    >
                      <span>− Reduce</span>
                    </button>
                  </div>
                </form>

                {/* List of Added / Reduced Revenue Entries */}
                {customRevenueItems.length > 0 && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-600">
                      <span>
                        Custom Money Entries ({customRevenueItems.length}) — Net: Le{' '}
                        {revenueSummary.customItemsTotalSle.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomRevenueItems([]);
                          showToast('Cleared custom money entries.', 'info');
                        }}
                        className="text-rose-700 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                    {customRevenueItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
                          item.amountSle < 0
                            ? 'bg-rose-50/70 border-rose-200'
                            : 'bg-amber-50/50 border-amber-200'
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-bold text-slate-900">{item.label}</span>{' '}
                          <span className="text-[10px] text-slate-500">({item.createdAt})</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`font-mono font-extrabold ${
                              item.amountSle < 0 ? 'text-rose-800' : 'text-amber-900'
                            }`}
                          >
                            {item.amountSle < 0
                              ? `−Le ${Math.abs(item.amountSle).toLocaleString()}`
                              : `+Le ${item.amountSle.toLocaleString()}`}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomRevenueItems((prev) => prev.filter((x) => x.id !== item.id))
                            }
                            className="text-slate-400 hover:text-rose-700 font-bold cursor-pointer"
                            title="Remove item"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* CALCULATOR 2 BUTTON: USD ($) ⇄ SIERRA LEONEAN LEONES CONVERTER & QUICK CHECK CALCULATOR */}
          <section className="bg-white rounded-3xl border-2 border-lavender-300 shadow-xs overflow-hidden self-start">
            <button
              type="button"
              onClick={() => toggleTableSection('currencyCalc')}
              className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-lavender-50/70 hover:bg-lavender-50 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-lavender-700 text-white flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-lavender-800 block">
                    💱 Currency &amp; Quick Check Calculator
                  </span>
                  <h2 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    Convert $ (USD) ⇄ Leones ($1 = Le {usdToSleRate})
                  </h2>
                </div>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-lavender-700 text-white font-extrabold text-xs flex items-center gap-1 shrink-0">
                <span>{openTables.currencyCalc ? 'Hide' : 'Open'}</span>
                {openTables.currencyCalc ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>

            {openTables.currencyCalc && (
              <div className="p-5 sm:p-6 border-t border-lavender-200 space-y-4">
                <div className="flex items-center justify-between gap-2 bg-cream px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-xs font-extrabold text-slate-700">
                    Exchange Rate (1 US Dollar in New Leones):
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-extrabold text-slate-600">$1 = Le</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={usdToSleRate}
                      onChange={(e) => handleRateChange(e.target.value)}
                      className="w-20 px-2 py-1 rounded-lg border border-slate-300 bg-white font-mono font-extrabold text-xs text-slate-900"
                    />
                  </div>
                </div>

                {/* Two-Way USD ($) <-> Leones (SLE) Converter Box */}
                <div className="grid grid-cols-1 sm:grid-cols-11 gap-2.5 items-center bg-gradient-to-r from-lavender-50 via-white to-emerald-50 p-4 rounded-2xl border border-lavender-200">
                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-900 block mb-1">
                      🇺🇸 US Dollars ($ USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-extrabold text-slate-500">
                        $
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={usdInputStr}
                        onChange={(e) => handleUsdInputChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border-2 border-lavender-300 bg-white font-mono font-extrabold text-base text-slate-900 outline-none focus:border-lavender-700"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-1 flex justify-center">
                    <div className="w-8 h-8 rounded-full bg-lavender-100 text-lavender-800 flex items-center justify-center">
                      <ArrowRightLeft className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="sm:col-span-5">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 block mb-1">
                      🇸🇱 New Leones (Le / SLE)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-extrabold text-slate-500 text-xs">
                        Le
                      </span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={sleInputStr}
                        onChange={(e) => handleSleInputChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border-2 border-emerald-300 bg-white font-mono font-extrabold text-base text-emerald-900 outline-none focus:border-emerald-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Instant Conversion Readout (New SLE + Old SLL + Subscription Pass Equivalent) */}
                <div className="rounded-2xl bg-plum-900 text-white p-3.5 border border-gold-500/40 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gold-400 block">
                      New Leones (SLE)
                    </span>
                    <span className="font-mono font-extrabold text-base text-white tabular-nums">
                      Le {(parseFloat(sleInputStr) || 0).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gold-400 block">
                      Old Leones (SLL × 1,000)
                    </span>
                    <span className="font-mono font-extrabold text-base text-emerald-300 tabular-nums">
                      Le {Math.round((parseFloat(sleInputStr) || 0) * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-gold-400 block">
                      Equals Le {passPriceSle} Passes
                    </span>
                    <span className="font-mono font-extrabold text-base text-amber-300 tabular-nums">
                      {passPriceSle > 0
                        ? ((parseFloat(sleInputStr) || 0) / passPriceSle).toFixed(1)
                        : '0'}{' '}
                      passes
                    </span>
                  </div>
                </div>

                {/* Quick Preset USD ($) Buttons */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 block">
                    Tap Dollar Amount to Check in Leones:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[1, 2, 5, 10, 20, 50, 100, 250, 500, 1000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => handleUsdInputChange(String(amt))}
                        className={`px-2.5 py-1.5 rounded-xl font-mono font-extrabold text-xs border transition-all cursor-pointer ${
                          Number(usdInputStr) === amt
                            ? 'bg-lavender-700 text-white border-lavender-700'
                            : 'bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border-lavender-200'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Built-In Quick Check Math Calculator (+, -, ×, ÷) */}
                <div className="rounded-2xl bg-cream p-3.5 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                      🧮 Quick Math Check Pad (+, −, ×, ÷)
                    </span>
                    <select
                      value={calcInputCurrency}
                      onChange={(e) => setCalcInputCurrency(e.target.value as 'SLE' | 'USD')}
                      className="px-2 py-1 rounded-lg border border-slate-300 bg-white font-extrabold text-[11px] text-slate-800"
                    >
                      <option value="SLE">Numbers in Le (SLE)</option>
                      <option value="USD">Numbers in $ (USD)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-7 gap-2 items-center">
                    <input
                      type="number"
                      step="any"
                      value={calcNumA}
                      onChange={(e) => setCalcNumA(e.target.value)}
                      placeholder="First #"
                      className="col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-xs text-slate-900"
                    />
                    <div className="col-span-3 flex items-center justify-center gap-1">
                      {(['+', '-', '×', '÷'] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setCalcOp(op)}
                          className={`w-8 h-8 rounded-lg font-mono font-extrabold text-sm cursor-pointer transition-all ${
                            calcOp === op
                              ? 'bg-plum-900 text-gold-400 shadow-2xs'
                              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      step="any"
                      value={calcNumB}
                      onChange={(e) => setCalcNumB(e.target.value)}
                      placeholder="Second #"
                      className="col-span-2 px-2.5 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-xs text-slate-900"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 text-xs">
                    <div>
                      <span className="text-slate-500 font-bold">Result: </span>
                      <span className="font-mono font-extrabold text-sm text-slate-900">
                        Le {quickCalcResult.resultSle.toLocaleString()} SLE
                      </span>{' '}
                      <span className="font-mono font-bold text-lavender-800">
                        (≈ ${quickCalcResult.resultUsd.toFixed(2)} USD)
                      </span>
                    </div>
                    {quickCalcResult.resultSle > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          handleQuickAddMoney(
                            quickCalcResult.resultSle,
                            `Calc: ${calcNumA} ${calcOp} ${calcNumB} (${calcInputCurrency})`
                          )
                        }
                        className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-extrabold text-[11px] cursor-pointer"
                      >
                        + Add Result to App Money
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* =================================================================== */}
        {/* TABLE BUTTON 4: MASTER CUSTOMER ENTRIES TABLE (COLLAPSIBLE BUTTON)  */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-lavender-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleTableSection('customerTable')}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-lavender-50/60 hover:bg-lavender-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-plum-900 text-gold-400 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    📋 Customer Entries Directory Table — #1 to #{usersList.length} ({filteredUsers.length} Shown)
                  </span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-plum-900 text-gold-400 text-xs font-extrabold">
                    {stats.total} Total
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Compact table of Name, Email, Age, Phone &amp; 1-Click &ldquo;🎁 1 Month Free (Le 0)&rdquo;.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-plum-900 text-gold-400 font-extrabold text-xs flex items-center gap-1 shrink-0">
              <span>{openTables.customerTable ? 'Hide Table' : 'Open Table'}</span>
              {openTables.customerTable ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {openTables.customerTable && (
            <div className="p-5 sm:p-6 border-t border-lavender-200 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPersonSearchInput(e.target.value);
                      }}
                      placeholder="Filter table by #1, name, email, phone..."
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 bg-cream text-xs font-medium outline-none focus:border-lavender-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1 bg-cream p-1 rounded-xl border border-slate-200">
                    {(
                      [
                        { id: 'all', label: `All (${stats.total})` },
                        { id: 'pending', label: `Pending (${stats.pending})` },
                        { id: 'active', label: `Active (${stats.active})` },
                        { id: 'free_password', label: `30d Free (${stats.freePass})` },
                        { id: 'expired', label: `Expired (${stats.expired})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilterTab(tab.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          filterTab === tab.id
                            ? 'bg-lavender-700 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onRegisterNewUserByAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        if (showAddUserForm && editingOriginalEmail) {
                          setEditingOriginalEmail(null);
                          setManualUserName('');
                          setManualUserAge('21');
                          setManualUserEmail('');
                          setManualUserPhone('');
                          setManualSubStatus('active');
                          setManualSubDays('14');
                        } else {
                          setShowAddUserForm((prev) => !prev);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>{showAddUserForm ? 'Close Form' : '+ Register / Edit Customer'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyAllCustomersText}
                    className="px-3 py-2 rounded-xl bg-cream hover:bg-lavender-50 text-slate-800 border border-slate-200 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-lavender-700" />
                    <span>Copy Report</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportUsersCsv}
                    className="px-3 py-2 rounded-xl bg-sage-50 hover:bg-sage-100 text-sage-900 border border-sage-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-sage-700" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Manual Register / Edit Customer Entry Form (No User Password Field) */}
              {showAddUserForm && onRegisterNewUserByAdmin && (
                <form
                  onSubmit={handleManualUserSubmit}
                  className="p-4 rounded-2xl bg-lavender-50/70 border-2 border-lavender-300 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-lavender-900">
                      {editingOriginalEmail
                        ? `✏️ Editing Customer Entry (${editingOriginalEmail}) — Update Details & Subscription`
                        : '➕ Register / Record Customer Entry (Name, Email, Age, Phone & Subscription)'}
                    </span>
                    {editingOriginalEmail && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOriginalEmail(null);
                          setManualUserName('');
                          setManualUserAge('21');
                          setManualUserEmail('');
                          setManualUserPhone('');
                          setManualSubStatus('active');
                          setManualSubDays('14');
                        }}
                        className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                      >
                        Switch to New Customer Mode
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        1. Customer Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={manualUserName}
                        onChange={(e) => setManualUserName(e.target.value)}
                        placeholder="e.g., Mariama Kamara"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        2. Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={manualUserEmail}
                        onChange={(e) => setManualUserEmail(e.target.value)}
                        placeholder="student@example.com"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        3. Age *
                      </label>
                      <input
                        type="number"
                        min="10"
                        max="99"
                        required
                        value={manualUserAge}
                        onChange={(e) => setManualUserAge(e.target.value)}
                        placeholder="21"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        4. Number Used (Phone) *
                      </label>
                      <input
                        type="tel"
                        required
                        value={manualUserPhone}
                        onChange={(e) => setManualUserPhone(e.target.value)}
                        placeholder="076 123 456"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        5. Subscription Status
                      </label>
                      <select
                        value={manualSubStatus}
                        onChange={(e) =>
                          setManualSubStatus(
                            e.target.value as
                              | 'active'
                              | 'pending_verification'
                              | 'expired'
                              | 'free_password'
                          )
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-slate-900"
                      >
                        <option value="active">Active (Free Trial / Verified Pass)</option>
                        <option value="free_password">Free 30-Day Password Unlocked</option>
                        <option value="pending_verification">Pending Owner Verification</option>
                        <option value="expired">Expired / Locked (0 Days)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        6. Remaining Access Days
                      </label>
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={manualSubDays}
                        onChange={(e) => setManualSubDays(e.target.value)}
                        placeholder="14"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-extrabold text-slate-900"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 px-4 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs cursor-pointer"
                      >
                        {editingOriginalEmail ? '💾 Save Updated Entry' : '✅ Save Customer Entry'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingOriginalEmail(null);
                          setShowAddUserForm(false);
                        }}
                        className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Last Approved Confirmation Strip */}
              {lastApprovedUserEmail && usersMap[lastApprovedUserEmail] && (
                <div className="rounded-2xl bg-sage-50 border-2 border-sage-400 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-extrabold uppercase tracking-wider text-sage-900 flex items-center gap-1.5">
                      <Unlock className="w-4 h-4 text-sage-700" />
                      <span>
                        30-Day Subscription Unlocked for {usersMap[lastApprovedUserEmail].name}!
                      </span>
                    </div>
                    <p className="text-xs text-sage-800">
                      Send them a direct WhatsApp, SMS, or Email confirmation:
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={buildWhatsAppHref(usersMap[lastApprovedUserEmail])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Send WhatsApp</span>
                    </a>
                    <a
                      href={buildSmsHref(usersMap[lastApprovedUserEmail])}
                      className="px-3 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Send SMS</span>
                    </a>
                    <a
                      href={buildApprovalEmailHref(usersMap[lastApprovedUserEmail])}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-sage-100 text-sage-900 border border-sage-400 font-extrabold text-xs flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Send Email</span>
                    </a>
                  </div>
                </div>
              )}

              {filteredUsers.length === 0 ? (
                <div className="rounded-2xl bg-cream p-6 text-center text-xs text-slate-500">
                  No customer entries match the selected filter. Click &ldquo;Sync All Entries&rdquo; at the top right to refresh from Cloud Firestore.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border-2 border-slate-200 shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-plum-900 text-white font-extrabold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-3"># (1st Entry)</th>
                        <th className="py-3 px-3">1. Customer Name</th>
                        <th className="py-3 px-3">2. Email Address</th>
                        <th className="py-3 px-3">3. Age</th>
                        <th className="py-3 px-3">4. Number Used (Phone)</th>
                        <th className="py-3 px-3">Last Login &amp; Device</th>
                        <th className="py-3 px-3">Access Status</th>
                        <th className="py-3 px-3">Quick Subscription &amp; Edit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredUsers.map((u, idx) => {
                        const st = getTrialStatus(u);
                        const custNum = u.customerNumber || idx + 1;
                        const phoneUsed = resolveCustomerPhoneUsed(u);
                        const lastLoginStr = u.lastSignInAt
                          ? new Date(u.lastSignInAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : u.firstEntryAt || u.createdAt
                          ? new Date(u.firstEntryAt || u.createdAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : 'Synced';

                        return (
                          <tr
                            key={`row-${u.email}`}
                            className="hover:bg-lavender-50/60 transition-colors"
                          >
                            <td className="py-3 px-3">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-plum-900 text-gold-400 font-mono font-extrabold text-xs">
                                #{custNum}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-extrabold text-slate-900">
                              {u.name || 'Student'}
                            </td>
                            <td className="py-3 px-3 font-mono text-lavender-900 font-bold">
                              {u.email}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-800">
                              {u.age ? `${u.age} yrs` : '—'}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-sage-900">
                              {phoneUsed ? (
                                <span className="px-2 py-0.5 rounded-md bg-sage-50 border border-sage-200">
                                  {phoneUsed}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditCustomerEntry(u)}
                                  className="text-[11px] font-bold text-amber-700 underline cursor-pointer"
                                >
                                  + Add Number
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-3 text-slate-600 text-[11px]">
                              <div className="font-mono font-semibold text-slate-800">
                                {lastLoginStr}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {u.deviceInfo || '📱/💻 WebApp Link'} • {u.signInCount || 1} login(s)
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-md font-extrabold text-[10px] ${
                                  st.status === 'expired'
                                    ? 'bg-rose-100 text-rose-800'
                                    : st.status === 'pending_verification'
                                    ? 'bg-orange-100 text-orange-800'
                                    : 'bg-sage-100 text-sage-800'
                                }`}
                              >
                                {st.daysLeft}d left ({st.status === 'trial' ? '2-Wk Free' : st.status})
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {onExtendUserFreeAccess && (
                                  <button
                                    type="button"
                                    onClick={() => onExtendUserFreeAccess(u.email, 30)}
                                    className="px-2.5 py-1 rounded-lg bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-[10px] cursor-pointer"
                                    title="Give 1 Month (30 Days) Free without adding money (Le 0)"
                                  >
                                    🎁 1 Month Free (Le 0)
                                  </button>
                                )}
                                {onExtendUserFreeAccess && (
                                  <button
                                    type="button"
                                    onClick={() => onExtendUserFreeAccess(u.email, 14)}
                                    className="px-2 py-1 rounded-lg bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-[10px] cursor-pointer"
                                    title="Extend +14 days free access (Le 0)"
                                  >
                                    +14d Free
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    onApproveUserPayment(u.email);
                                    setLastApprovedUserEmail(u.email);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-sage-600 hover:bg-sage-800 text-white font-extrabold text-[10px] cursor-pointer"
                                  title="Verify Paid Pass (+30 days & adds Le 30 to Money Made)"
                                >
                                  Paid +30d (Le {passPriceSle})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditCustomerEntry(u)}
                                  className="px-2.5 py-1 rounded-lg bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Edit3 className="w-3 h-3" />
                                  <span>Edit</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* TABLE BUTTON 5: DETAILED INDIVIDUAL CUSTOMER CARDS (COLLAPSIBLE)    */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-slate-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleTableSection('customerCards')}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-cream/70 hover:bg-cream transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-lavender-100 text-lavender-900 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <span className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                  🪪 Detailed Individual Customer Cards ({filteredUsers.length} People)
                </span>
                <p className="text-xs text-slate-600">
                  Full cards with Period/Log counts, Orange Money SMS details, WhatsApp/SMS links &amp; Delete controls.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-lavender-700 text-white font-extrabold text-xs flex items-center gap-1 shrink-0">
              <span>{openTables.customerCards ? 'Hide Cards' : 'Open Cards'}</span>
              {openTables.customerCards ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {openTables.customerCards && (
            <div className="p-5 sm:p-6 border-t border-slate-200 space-y-3.5">
              {filteredUsers.length === 0 ? (
                <div className="rounded-2xl bg-cream p-6 text-center text-xs text-slate-500">
                  No customer entries match the selected filter.
                </div>
              ) : (
                filteredUsers.map((u, idx) => {
                  const st = getTrialStatus(u);
                  const custNum = u.customerNumber || idx + 1;
                  const phoneDisplay = resolveCustomerPhoneUsed(u) || 'Not entered yet';
                  const hasPending =
                    st.status === 'pending_verification' || u.pendingPayment?.status === 'pending';
                  const isRecentlyApproved = lastApprovedUserEmail === u.email;
                  const periodsCount = Array.isArray(u.periods) ? u.periods.length : 0;
                  const logsCount = u.dailyLogs ? Object.keys(u.dailyLogs).length : 0;
                  const appointmentsCount = Array.isArray(u.appointments) ? u.appointments.length : 0;

                  let statusBadge = (
                    <span className="px-2.5 py-1 rounded-lg bg-sage-100 text-sage-800 text-xs font-extrabold">
                      🎁 Active 2-Week Free Access ({st.daysLeft}d left)
                    </span>
                  );
                  if (st.status === 'subscribed') {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold">
                        ✅ Orange Money Verified ({st.daysLeft}d left)
                      </span>
                    );
                  } else if (st.status === 'free_password') {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold">
                        🎁 Free 1-Month Pass ({st.daysLeft}d left)
                      </span>
                    );
                  } else if (st.status === 'pending_verification') {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-100 text-orange-800 border border-orange-300 text-xs font-extrabold">
                        <span>⏳ Pending Verification</span>
                        {onClearPendingVerification && (
                          <button
                            type="button"
                            onClick={() => onClearPendingVerification(u.email)}
                            title="Remove Pending Owner Verification"
                            className="w-4 h-4 rounded-full bg-white hover:bg-rose-100 text-orange-900 hover:text-rose-700 border border-orange-300 flex items-center justify-center text-[10px] font-extrabold cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    );
                  } else if (st.status === 'expired') {
                    statusBadge = (
                      <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 text-xs font-extrabold">
                        🔒 Expired (0d left)
                      </span>
                    );
                  }

                  return (
                    <div
                      key={u.email}
                      className={`relative rounded-2xl p-4 border transition-all ${
                        hasPending
                          ? 'bg-orange-50/70 border-2 border-orange-400 shadow-xs'
                          : isRecentlyApproved
                          ? 'bg-sage-50/80 border-2 border-sage-500'
                          : 'bg-cream/60 border-slate-200'
                      }`}
                    >
                      {hasPending && onClearPendingVerification && (
                        <button
                          type="button"
                          onClick={() => onClearPendingVerification(u.email)}
                          title="Remove Pending Owner Verification"
                          aria-label="Remove Pending Owner Verification"
                          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white hover:bg-rose-100 text-orange-900 hover:text-rose-700 border border-orange-300 font-extrabold text-xs flex items-center justify-center shadow-2xs transition-all cursor-pointer z-10"
                        >
                          ✕
                        </button>
                      )}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-plum-900 text-gold-400 font-mono text-xs font-extrabold">
                              Customer #{custNum} (First Entry)
                            </span>
                            <span className="font-display font-extrabold text-base text-slate-900">
                              {u.name || 'Student'}
                            </span>
                            {statusBadge}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                            <div>
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                1. Customer Name
                              </span>
                              <span className="font-extrabold text-slate-900">
                                {u.name || 'Student'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                2. Email Address
                              </span>
                              <span className="font-mono font-bold text-lavender-900 break-all">
                                {u.email}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                3. Age
                              </span>
                              <span className="font-mono font-bold text-slate-800">
                                {u.age ? `${u.age} years` : 'Not set'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                4. Number Used (Phone)
                              </span>
                              <span className="font-mono font-bold text-sage-900">
                                {phoneDisplay}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                1st Entry:{' '}
                                <strong>
                                  {u.firstEntryAt || u.createdAt
                                    ? new Date(u.firstEntryAt || u.createdAt).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })
                                    : 'Recorded'}
                                </strong>
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                {u.deviceInfo || '📱/💻 WebApp Link'} ({u.signInCount || 1} logins)
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>
                                Remaining: <strong>{st.daysLeft} days</strong>
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-semibold">
                              <Activity className="w-3 h-3 text-rose-600" />
                              <span>
                                {periodsCount} Period(s) • {logsCount} Log(s)
                              </span>
                            </span>
                            {appointmentsCount > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-plum-900 font-semibold">
                                <span>✨ {appointmentsCount} Booking(s)</span>
                              </span>
                            )}
                          </div>

                          {u.pendingPayment && (
                            <div className="relative mt-2 p-3 pr-9 rounded-xl bg-white border border-orange-200 text-xs space-y-1">
                              {onClearPendingVerification && (
                                <button
                                  type="button"
                                  onClick={() => onClearPendingVerification(u.email)}
                                  title="Remove Pending Owner Verification"
                                  aria-label="Remove Pending Owner Verification"
                                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-100 hover:bg-rose-100 text-orange-900 hover:text-rose-700 border border-orange-300 font-extrabold text-[11px] flex items-center justify-center cursor-pointer transition-all"
                                >
                                  ✕
                                </button>
                              )}
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-extrabold text-orange-900 uppercase tracking-wider text-[10px]">
                                  🟧 Submitted Orange Money Transaction ({u.pendingPayment.amount})
                                </span>
                                <span className="font-mono text-[10px] text-slate-500">
                                  Submitted:{' '}
                                  {new Date(u.pendingPayment.submittedAt).toLocaleString()}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 font-mono text-slate-800">
                                <span>
                                  Sender Phone: <strong>{u.pendingPayment.senderPhone}</strong>
                                </span>
                                <span>
                                  SMS Tx ID: <strong>{u.pendingPayment.transactionId}</strong>
                                </span>
                                <span>
                                  Status:{' '}
                                  <strong className="uppercase">{u.pendingPayment.status}</strong>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setOpenTables((prev) => ({ ...prev, customerTable: true }));
                              handleOpenEditCustomerEntry(u);
                            }}
                            className="px-3 py-2.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Entry</span>
                          </button>

                          {onExtendUserFreeAccess && (
                            <>
                              <button
                                type="button"
                                onClick={() => onExtendUserFreeAccess(u.email, 30)}
                                className="px-4 py-2.5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 border border-gold-500/40 font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                                title="Give 1 Month (30 Days) Free without adding to Money Made (Le 0)"
                              >
                                <span>🎁 1 Month Free (Le 0)</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onExtendUserFreeAccess(u.email, 14)}
                                className="px-3.5 py-2.5 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                                title="Grant or extend 2 weeks (14 days) of free access (Le 0)"
                              >
                                <span>+14d Free (Le 0)</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              onApproveUserPayment(u.email);
                              setLastApprovedUserEmail(u.email);
                            }}
                            className="px-4 py-2.5 rounded-xl bg-sage-600 hover:bg-sage-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                            title="Approve Paid Orange Money Pass (+30 Days & adds Le 30 to Money Made)"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Approve Paid (+Le {passPriceSle})</span>
                          </button>

                          {hasPending ? (
                            <button
                              type="button"
                              onClick={() => onRejectOrExpireUser(u.email, 'reject')}
                              className="px-3.5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>Reject</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onRejectOrExpireUser(u.email, 'expire')}
                              className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Expire / Lock</span>
                            </button>
                          )}

                          <a
                            href={buildWhatsAppHref(u)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>

                          <a
                            href={buildSmsHref(u)}
                            className="px-3 py-2.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-bold text-xs flex items-center gap-1.5 transition-all"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            <span>SMS</span>
                          </a>

                          <a
                            href={buildApprovalEmailHref(u)}
                            className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 transition-all"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Email</span>
                          </a>

                          {onDeleteUser && (
                            <button
                              type="button"
                              onClick={() => onDeleteUser(u.email)}
                              className="p-2.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-700 border border-slate-200 transition-all cursor-pointer"
                              title="Remove user account"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* TABLE BUTTON 6: GRANT ADMIN ACCESS TO TEAM MEMBERS (COLLAPSIBLE)    */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-sage-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleTableSection('teamAdmins')}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-sage-50/60 hover:bg-sage-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sage-700 text-white flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                    🛡️ Team Admin Accounts Table ({1 + additionalAdmins.length} Authorized Admins)
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Add or manage Co-Admins who can view customer sign-ups and approve accounts.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-sage-700 text-white font-extrabold text-xs flex items-center gap-1 shrink-0">
              <span>{openTables.teamAdmins ? 'Hide Table' : 'Open Table'}</span>
              {openTables.teamAdmins ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {openTables.teamAdmins && (
            <div className="p-5 sm:p-6 border-t border-sage-200 space-y-4">
              <form
                onSubmit={handleAddAdminAccount}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end bg-sage-50/60 p-4 rounded-2xl border border-sage-200"
              >
                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Admin Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="e.g., manager@gmail.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 outline-none focus:border-sage-700"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                      Admin Console Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const generated = `Admin@${Math.floor(1000 + Math.random() * 9000)}`;
                        setNewAdminPassword(generated);
                      }}
                      className="text-[10px] font-extrabold text-sage-700 hover:underline cursor-pointer"
                    >
                      Auto-Generate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={newAdminPassword}
                    onChange={(e) => setNewAdminPassword(e.target.value)}
                    placeholder="Enter admin password..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900 outline-none focus:border-sage-700"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Admin Name / Role (Optional)
                  </label>
                  <input
                    type="text"
                    value={newAdminName}
                    onChange={(e) => setNewAdminName(e.target.value)}
                    placeholder="e.g., Clinic Co-Admin"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 outline-none focus:border-sage-700"
                  />
                </div>

                <button
                  type="submit"
                  className="py-2.5 px-4 rounded-xl bg-sage-700 hover:bg-sage-900 text-white font-extrabold text-xs sm:text-sm shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer h-[42px]"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Add Admin Account</span>
                </button>
              </form>

              <div className="space-y-2.5">
                <div className="rounded-2xl p-3.5 bg-lavender-50/60 border border-lavender-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-extrabold uppercase tracking-wider">
                      👑 Primary Owner
                    </span>
                    <span className="font-display font-extrabold text-sm text-slate-900">
                      {CREATOR_NAME}
                    </span>
                    <span className="font-mono text-xs text-lavender-900 font-bold bg-white px-2.5 py-1 rounded-lg border border-lavender-200">
                      {OWNER_ADMIN_EMAIL}
                    </span>
                    <span className="font-mono text-xs text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      Console Password: <strong>{adminConfig.adminPassword}</strong>
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">
                    Permanent Super Admin
                  </span>
                </div>

                {additionalAdmins.map((adm) => {
                  const shareText = `Hello ${adm.name || 'Admin'}! You have been granted Admin Dashboard access on BloomCampus & Sidratu Clinic to view all user sign-ups and total people in the app.\n• Admin Login Email: ${adm.email}\n• Admin Password: ${adm.password}\nClick "Owner / Admin Login" to sign in.`;
                  const mailHref = `mailto:${encodeURIComponent(
                    adm.email
                  )}?subject=${encodeURIComponent(
                    'Your BloomCampus Admin Dashboard Login Credentials'
                  )}&body=${encodeURIComponent(shareText)}`;

                  return (
                    <div
                      key={adm.email}
                      className="rounded-2xl p-3.5 bg-cream/70 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="px-2.5 py-1 rounded-lg bg-sage-100 text-sage-900 border border-sage-300 text-[10px] font-extrabold uppercase tracking-wider">
                          🛡️ Added Admin
                        </span>
                        {adm.name && (
                          <span className="font-display font-extrabold text-sm text-slate-900">
                            {adm.name}
                          </span>
                        )}
                        <span className="font-mono text-xs text-slate-800 font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                          {adm.email}
                        </span>
                        <span className="font-mono text-xs text-sage-900 bg-sage-50 px-2.5 py-1 rounded-lg border border-sage-200">
                          Password: <strong>{adm.password}</strong>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Added {new Date(adm.addedAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(shareText);
                            showToast(
                              `Copied login credentials for ${adm.email} to share with them!`,
                              'success'
                            );
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-sage-50 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-sage-700" />
                          <span>Copy Details</span>
                        </button>

                        <a
                          href={mailHref}
                          className="px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-bold text-xs flex items-center gap-1"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Email Login</span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleRemoveAdminAccount(adm.email)}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* TABLE BUTTON 7: MANAGE OWNER ADMIN & FREE 30-DAY UNLOCK CODE        */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-lavender-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleTableSection('adminCodes')}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-cream/60 hover:bg-cream transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-lavender-100 text-lavender-800 flex items-center justify-center shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <span className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                  🔑 Manage Owner Admin Console &amp; Free 30-Day Unlock Code
                </span>
                <p className="text-xs text-slate-600">
                  Update your Owner Admin password or student Free 30-Day Unlock Code.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-lavender-700 text-white font-extrabold text-xs flex items-center gap-1 shrink-0">
              <span>{openTables.adminCodes ? 'Hide' : 'Open'}</span>
              {openTables.adminCodes ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {openTables.adminCodes && (
            <div className="p-5 sm:p-6 border-t border-lavender-200 space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleResetDefaultPasswords}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default Codes</span>
                </button>
              </div>

              <form
                onSubmit={handleSavePasswords}
                className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
              >
                <div className="bg-cream rounded-2xl p-3.5 border border-slate-200">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Owner Admin Password ({OWNER_ADMIN_EMAIL})
                  </label>
                  <input
                    type="text"
                    value={adminPassInput}
                    onChange={(e) => setAdminPassInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900 outline-none focus:border-lavender-700"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Primary Owner Admin Console Password
                  </span>
                </div>

                <div className="bg-cream rounded-2xl p-3.5 border border-slate-200">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                    Free 30-Day Access Code (Student Unlock Code)
                  </label>
                  <input
                    type="text"
                    value={freePassInput}
                    onChange={(e) => setFreePassInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-emerald-800 outline-none focus:border-lavender-700"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Unlocks 30 days when entered in the Renewal / Unlock modal
                  </span>
                </div>

                <button
                  type="submit"
                  className="py-3.5 px-5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
                >
                  💾 Save &amp; Sync Admin Codes
                </button>
              </form>
            </div>
          )}
        </section>

        {/* =================================================================== */}
        {/* TABLE BUTTON 8: LIVE LOGIN ALERTS, PAYMENTS & SUPPORT INBOX         */}
        {/* =================================================================== */}
        <section className="bg-white rounded-3xl border-2 border-lavender-200 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => toggleTableSection('inboxAlerts')}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 bg-lavender-50/40 hover:bg-lavender-50 transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-lavender-100 text-lavender-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                  📬 Live Login Alerts, Payments &amp; Support Inbox ({supportInquiries.length})
                </span>
                <p className="text-xs text-slate-600">
                  Every account sign-up, login, payment alert, and support inquiry for {OWNER_ADMIN_EMAIL}.
                </p>
              </div>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-lavender-700 text-white font-extrabold text-xs flex items-center gap-1 shrink-0">
              <span>{openTables.inboxAlerts ? 'Hide Inbox' : 'Open Inbox'}</span>
              {openTables.inboxAlerts ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
          </button>

          {openTables.inboxAlerts && (
            <div className="p-5 sm:p-6 border-t border-lavender-200 space-y-4">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleEmailAllLoginsToOwner}
                  className="px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email All Logins to {OWNER_ADMIN_EMAIL}</span>
                </button>
              </div>

              {supportInquiries.length === 0 ? (
                <p className="text-xs text-slate-500 italic bg-cream rounded-2xl p-4 border border-slate-200">
                  No login, payment, or support notifications logged yet. Whenever a student signs up, logs in, or submits an Orange Money payment, it appears here automatically.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {supportInquiries.slice(0, 20).map((inq) => {
                    const isPayment = inq.type === 'payment';
                    const isLogin = inq.type === 'login' || inq.type === 'signup';
                    return (
                      <div
                        key={inq.id}
                        className={`rounded-2xl p-3.5 border space-y-1 text-xs ${
                          isPayment
                            ? 'bg-orange-50/70 border-orange-200'
                            : isLogin
                            ? 'bg-emerald-50/70 border-emerald-200'
                            : 'bg-cream border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`px-2 py-0.5 rounded-md font-extrabold uppercase text-[10px] ${
                              isPayment
                                ? 'bg-orange-100 text-orange-800'
                                : isLogin
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-lavender-100 text-lavender-800'
                            }`}
                          >
                            {isPayment
                              ? '🟧 Payment Alert'
                              : inq.type === 'signup'
                              ? '🆕 New Account Sign-Up'
                              : isLogin
                              ? '🔑 User Sign-In'
                              : '💬 Support Inquiry'}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500">
                            {new Date(inq.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="font-bold text-slate-900">{inq.subject}</div>
                        <div className="text-slate-600">
                          From: <strong>{inq.userName}</strong> ({inq.userEmail}
                          {inq.userAge ? ` · Age ${inq.userAge}` : ''}
                          {inq.userPhone ? ` · 📞 ${inq.userPhone}` : ''})
                        </div>
                        <p className="text-slate-700 bg-white p-2.5 rounded-xl border border-slate-100 whitespace-pre-line">
                          {inq.message}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Admin Footer with Creator Branding */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-extrabold text-slate-900">Created by {CREATOR_NAME}</span>
          <a
            href={`mailto:${CREATOR_EMAIL}?subject=BloomCampus%20Owner%20Admin%20Support`}
            className="font-bold text-lavender-700 hover:underline"
          >
            Contact Creator: {CREATOR_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
};
