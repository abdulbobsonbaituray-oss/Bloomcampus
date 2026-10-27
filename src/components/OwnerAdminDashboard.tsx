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
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Table as TableIcon,
  ArrowUpDown,
  CheckSquare,
  Square,
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

export type AdminPageId =
  | 'entries'
  | 'overview'
  | 'revenue'
  | 'converter'
  | 'security'
  | 'inbox';

type SortField =
  | 'entry_asc'
  | 'entry_desc'
  | 'recent_login'
  | 'name_asc'
  | 'days_desc';

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
  onBulkDeleteUsers?: (userEmails: string[]) => void;
  onDeleteSupportInquiry?: (inquiryId?: string, clearAll?: boolean) => void;
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
  onBulkDeleteUsers,
  onDeleteSupportInquiry,
  onRefreshUsers,
  onExitAdmin,
  showToast,
}) => {
  // Multi-Page Admin Navigation State
  const [activeAdminPage, setActiveAdminPage] = useState<AdminPageId>('entries');

  // Search, Filter, Sort & Pagination State for Dedicated Customer Entries Page
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<
    'all' | 'pending' | 'active' | 'expired' | 'free_password'
  >('all');
  const [sortBy, setSortBy] = useState<SortField>('entry_asc');
  const [entriesViewLayout, setEntriesViewLayout] = useState<'table' | 'cards' | 'both'>('table');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  // Inbox Page Search & Filter State
  const [inboxSearchQuery, setInboxSearchQuery] = useState('');
  const [inboxFilterType, setInboxFilterType] = useState<'all' | 'login' | 'payment' | 'support'>('all');
  const [inboxPage, setInboxPage] = useState<number>(1);

  const [adminPassInput, setAdminPassInput] = useState(adminConfig.adminPassword);
  const [freePassInput, setFreePassInput] = useState(adminConfig.freeAccessPassword);
  const [lastApprovedUserEmail, setLastApprovedUserEmail] = useState<string | null>(null);
  const [isSyncingEntries, setIsSyncingEntries] = useState<boolean>(false);

  // Add / Manage Additional Admin Accounts state
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [newAdminName, setNewAdminName] = useState('');

  // Manual Register / Edit Customer Entry state
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [editingOriginalEmail, setEditingOriginalEmail] = useState<string | null>(null);
  const [manualUserName, setManualUserName] = useState('');
  const [manualUserAge, setManualUserAge] = useState('21');
  const [manualUserEmail, setManualUserEmail] = useState('');
  const [manualUserPhone, setManualUserPhone] = useState('');
  const [manualUserPassword, setManualUserPassword] = useState('');
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

  // Recent logins sorted by most recent sign-in or entry timestamp, filtered by searchQuery & filterTab
  const recentLoginsList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return [...usersList]
      .filter((u) => {
        const st = getTrialStatus(u);
        const phoneUsed = resolveCustomerPhoneUsed(u);
        const matchesSearch =
          !q ||
          (u.name || '').toLowerCase().includes(q) ||
          (u.pendingPayment?.senderName || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          phoneUsed.toLowerCase().includes(q);
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
      })
      .sort((a, b) => {
        const aTime = a.lastSignInAt
          ? new Date(a.lastSignInAt).getTime()
          : Number(a.firstEntryAt || a.createdAt || 0);
        const bTime = b.lastSignInAt
          ? new Date(b.lastSignInAt).getTime()
          : Number(b.firstEntryAt || b.createdAt || 0);
        return bTime - aTime;
      });
  }, [usersList, searchQuery, filterTab]);

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

  // Filtered and Sorted Users for the Dedicated Customer Entries Page
  const filteredUsers = useMemo(() => {
    const matched = usersList.filter((u) => {
      const q = searchQuery.toLowerCase().trim();
      const st = getTrialStatus(u);
      const custNumStr = `#${u.customerNumber || ''}`;
      const phoneUsed = resolveCustomerPhoneUsed(u);
      const matchesSearch =
        !q ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.pendingPayment?.senderName || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.age || '').toLowerCase().includes(q) ||
        phoneUsed.toLowerCase().includes(q) ||
        custNumStr.includes(q) ||
        String(u.customerNumber || '').includes(q) ||
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

    const sorted = [...matched];
    sorted.sort((a, b) => {
      if (sortBy === 'entry_asc') {
        return (a.customerNumber || 999999) - (b.customerNumber || 999999);
      }
      if (sortBy === 'entry_desc') {
        return (b.customerNumber || 0) - (a.customerNumber || 0);
      }
      if (sortBy === 'recent_login') {
        const aTime = a.lastSignInAt
          ? new Date(a.lastSignInAt).getTime()
          : Number(a.firstEntryAt || a.createdAt || 0);
        const bTime = b.lastSignInAt
          ? new Date(b.lastSignInAt).getTime()
          : Number(b.firstEntryAt || b.createdAt || 0);
        return bTime - aTime;
      }
      if (sortBy === 'name_asc') {
        return (a.name || a.email || '').localeCompare(b.name || b.email || '');
      }
      if (sortBy === 'days_desc') {
        return getTrialStatus(b).daysLeft - getTrialStatus(a).daysLeft;
      }
      return 0;
    });

    return sorted;
  }, [usersList, searchQuery, filterTab, sortBy]);

  // Reset pagination to Page 1 whenever search query, status filter, sort, or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTab, sortBy, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  }, [filteredUsers.length, pageSize]);

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedUsers = useMemo(() => {
    if (pageSize <= 0) return filteredUsers;
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredUsers.slice(startIdx, startIdx + pageSize);
  }, [filteredUsers, safeCurrentPage, pageSize]);

  const pageStartItem =
    filteredUsers.length === 0
      ? 0
      : pageSize <= 0
      ? 1
      : (safeCurrentPage - 1) * pageSize + 1;
  const pageEndItem =
    filteredUsers.length === 0
      ? 0
      : pageSize <= 0
      ? filteredUsers.length
      : Math.min(filteredUsers.length, safeCurrentPage * pageSize);

  // Clean up selectedEmails if any were deleted
  useEffect(() => {
    setSelectedEmails((prev) => prev.filter((em) => Boolean(usersMap[em])));
  }, [usersMap]);

  const isAllCurrentPageSelected =
    paginatedUsers.length > 0 &&
    paginatedUsers.every((u) => selectedEmails.includes(u.email.toLowerCase().trim()));

  const handleToggleSelectUser = (email: string) => {
    const clean = email.toLowerCase().trim();
    setSelectedEmails((prev) =>
      prev.includes(clean) ? prev.filter((x) => x !== clean) : [...prev, clean]
    );
  };

  const handleToggleSelectPage = () => {
    const pageEmails = paginatedUsers.map((u) => u.email.toLowerCase().trim());
    if (isAllCurrentPageSelected) {
      setSelectedEmails((prev) => prev.filter((em) => !pageEmails.includes(em)));
    } else {
      setSelectedEmails((prev) => Array.from(new Set([...prev, ...pageEmails])));
    }
  };

  const handleDeleteSingleCustomer = (email: string) => {
    const clean = email.toLowerCase().trim();
    if (!clean) return;
    setSelectedEmails((prev) => prev.filter((x) => x !== clean));
    if (lastApprovedUserEmail?.toLowerCase().trim() === clean) {
      setLastApprovedUserEmail(null);
    }
    if (onDeleteUser) {
      onDeleteUser(clean);
    }
  };

  const handleBulkDeleteSelected = () => {
    if (selectedEmails.length === 0) return;
    const targets = [...selectedEmails];
    setSelectedEmails([]);
    if (onBulkDeleteUsers) {
      onBulkDeleteUsers(targets);
    } else if (onDeleteUser) {
      targets.forEach((em) => onDeleteUser(em));
    }
  };

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
    showToast(`🗑️ Removed admin access for ${emailToRemove}.`, 'info');
  };

  const handleOpenEditCustomerEntry = (u: UserData) => {
    const st = getTrialStatus(u);
    setEditingOriginalEmail(u.email);
    setManualUserName(u.name || '');
    setManualUserAge(u.age || '21');
    setManualUserEmail(u.email || '');
    setManualUserPhone(resolveCustomerPhoneUsed(u));
    setManualUserPassword(u.password || '');
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
    setActiveAdminPage('entries');
    setShowAddUserForm(true);
    window.scrollTo({ top: 140, behavior: 'smooth' });
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
      password: manualUserPassword.trim(),
      originalEmail: editingOriginalEmail || undefined,
      subscriptionStatus: manualSubStatus,
      subscriptionDays: !Number.isNaN(parsedDays) ? parsedDays : 14,
    });
    setEditingOriginalEmail(null);
    setManualUserName('');
    setManualUserAge('21');
    setManualUserEmail('');
    setManualUserPhone('');
    setManualUserPassword('');
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
      const firstDateStr =
        u.firstEntryAt || u.createdAt
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
    showToast(
      `✉️ Opened email to ${OWNER_ADMIN_EMAIL} with all ${usersList.length} user logins!`,
      'success'
    );
  };

  const handleWhatsAppAllLoginsToOwner = () => {
    const report = buildCustomerReportText();
    const waHref = `https://wa.me/23273604401?text=${encodeURIComponent(report)}`;
    const a = document.createElement('a');
    a.href = waHref;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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

  // Filtered Inquiries for Page 6 (Alerts & Support Inbox Page)
  const filteredInquiries = useMemo(() => {
    return supportInquiries.filter((inq) => {
      if (
        inboxFilterType === 'login' &&
        inq.type !== 'login' &&
        inq.type !== 'signup' &&
        inq.type !== 'welcome'
      ) {
        return false;
      }
      if (
        inboxFilterType === 'payment' &&
        inq.type !== 'payment' &&
        inq.type !== 'appreciation'
      ) {
        return false;
      }
      if (inboxFilterType === 'support' && inq.type !== 'support') {
        return false;
      }
      const q = inboxSearchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        (inq.userName || '').toLowerCase().includes(q) ||
        (inq.userEmail || '').toLowerCase().includes(q) ||
        (inq.userPhone || '').toLowerCase().includes(q) ||
        (inq.subject || '').toLowerCase().includes(q) ||
        (inq.message || '').toLowerCase().includes(q)
      );
    });
  }, [supportInquiries, inboxFilterType, inboxSearchQuery]);

  const INBOX_PAGE_SIZE = 20;
  const totalInboxPages = Math.max(1, Math.ceil(filteredInquiries.length / INBOX_PAGE_SIZE));
  const safeInboxPage = Math.min(inboxPage, totalInboxPages);
  const paginatedInquiries = filteredInquiries.slice(
    (safeInboxPage - 1) * INBOX_PAGE_SIZE,
    safeInboxPage * INBOX_PAGE_SIZE
  );

  // Admin Pages Config (Rendered in the Bottom Icon Navigation Bar)
  const adminPages: Array<{
    id: AdminPageId;
    label: string;
    shortLabel: string;
    Icon: React.ComponentType<{ className?: string }>;
    badge?: string;
    description: string;
  }> = [
    {
      id: 'entries',
      label: 'Customer Entries',
      shortLabel: 'Entries',
      Icon: Users,
      badge: `${stats.total}`,
      description: 'Dedicated directory with Search Bar, Pagination & Bulk Delete for lots of people',
    },
    {
      id: 'overview',
      label: 'Overview & Logins',
      shortLabel: 'Overview',
      Icon: Activity,
      badge: `${recentLoginsList.length}`,
      description: 'KPI summary cards, real-time sign-ins & quick actions',
    },
    {
      id: 'revenue',
      label: 'Money & Revenue',
      shortLabel: 'Revenue',
      Icon: DollarSign,
      badge: `Le ${revenueSummary.grandTotalSle.toLocaleString()}`,
      description: 'App earnings calculator, auto-money reducer & custom ledger',
    },
    {
      id: 'converter',
      label: 'USD ⇄ Leones',
      shortLabel: 'USD ⇄ Le',
      Icon: ArrowRightLeft,
      badge: `$1=Le ${usdToSleRate}`,
      description: 'Live currency converter & arithmetic check calculator',
    },
    {
      id: 'security',
      label: 'Admins & Codes',
      shortLabel: 'Admins',
      Icon: KeyRound,
      badge: `${1 + additionalAdmins.length}`,
      description: 'Manage co-admins, owner password & 30-day free code',
    },
    {
      id: 'inbox',
      label: 'Alerts & Inbox',
      shortLabel: 'Inbox',
      Icon: BellRing,
      badge: `${supportInquiries.length}`,
      description: 'Searchable login, payment & support notifications',
    },
  ];

  return (
    <div className="min-h-screen bg-cream text-slate-800 flex flex-col pb-24">
      {/* Top Owner Admin Header */}
      <header className="bg-gradient-to-r from-plum-900 via-lavender-900 to-plum-900 text-white shadow-lg border-b border-gold-500/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gold-500/20 border border-gold-400/50 flex items-center justify-center text-gold-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-gold-500 text-plum-900">
                  Multi-Page Owner Admin Console
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
                BloomCampus &amp; Sidratu Multi-Page Admin Portal
              </h1>
              <p className="text-xs text-white/80 mt-0.5">
                Created by <strong>{CREATOR_NAME}</strong> · Use the bottom icon navigation bar to switch between all 6 Admin Pages
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveAdminPage('entries');
                window.setTimeout(() => {
                  const el = document.getElementById('entries-page-search-input');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (el as HTMLInputElement).focus();
                  }
                }, 60);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-plum-900 text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              title="Open Dedicated Customer Entries Page & Search Bar"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Find Entry ({stats.total})</span>
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
        {/* PAGE 1: DEDICATED CUSTOMER ENTRIES PAGE (WITH SEARCH & PAGINATION)  */}
        {/* =================================================================== */}
        {activeAdminPage === 'entries' && (
          <div className="space-y-5">
            {/* Page Banner + Quick Actions */}
            <div className="bg-white rounded-3xl border-2 border-plum-900/20 p-5 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-plum-900 text-gold-400 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-plum-900 text-gold-400">
                        Page 1 of 6 · Dedicated Customer Directory
                      </span>
                      <span className="text-xs font-extrabold text-emerald-800">
                        {filteredUsers.length} Matching of {stats.total} Total People
                      </span>
                    </div>
                    <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 mt-0.5">
                      👥 Customer Entries Directory (Built for High Volume &amp; Instant Search)
                    </h2>
                    <p className="text-xs text-slate-600">
                      Search by Name, Email, Phone Number, Age, or Entry #, filter by status, navigate pages, or delete individual/bulk entries permanently.
                    </p>
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
                          setManualUserPassword('');
                          setManualSubStatus('active');
                          setManualSubDays('14');
                        } else {
                          setShowAddUserForm((prev) => !prev);
                        }
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>
                        {showAddUserForm ? 'Close Entry Form' : '+ Add / Edit Customer Entry'}
                      </span>
                    </button>
                  )}

                  {onExtendUserFreeAccess && usersList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onExtendUserFreeAccess('ALL', 30)}
                      className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                      title="Give every logged-in person 1 Month (30 Days) Free with Le 0 added to Money Made"
                    >
                      <span>🎁 Give All {usersList.length} People 1M Free (Le 0)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopyAllCustomersText}
                    className="px-3 py-2.5 rounded-xl bg-cream hover:bg-lavender-50 text-slate-800 border border-slate-200 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5 text-lavender-700" />
                    <span>Copy Report</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportUsersCsv}
                    className="px-3 py-2.5 rounded-xl bg-sage-50 hover:bg-sage-100 text-sage-900 border border-sage-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-sage-700" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>

              {/* Manual Register / Edit Customer Entry Form */}
              {showAddUserForm && onRegisterNewUserByAdmin && (
                <form
                  onSubmit={handleManualUserSubmit}
                  className="p-4 rounded-2xl bg-lavender-50/70 border-2 border-lavender-300 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-lavender-900">
                      {editingOriginalEmail
                        ? `✏️ Editing Customer Entry (${editingOriginalEmail})`
                        : '➕ Register New Customer Entry'}
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
                          setManualUserPassword('');
                          setManualSubStatus('active');
                          setManualSubDays('14');
                        }}
                        className="text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                      >
                        Switch to New Customer Mode
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
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
                        4. Number Used (Phone)
                      </label>
                      <input
                        type="tel"
                        value={manualUserPhone}
                        onChange={(e) => setManualUserPhone(e.target.value)}
                        placeholder="076 123 456"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        5. Account Password
                      </label>
                      <input
                        type="text"
                        value={manualUserPassword}
                        onChange={(e) => setManualUserPassword(e.target.value)}
                        placeholder="Optional password"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-1">
                    <div>
                      <label className="text-[11px] font-extrabold uppercase text-slate-700 block mb-1">
                        6. Subscription Status
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
                        7. Remaining Access Days
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

              {/* DEDICATED HIGH-VOLUME SEARCH BAR + SUBSCRIPTION STATUS DROPDOWN + SORT + PAGE SIZE */}
              <div className="p-4 rounded-2xl bg-cream/90 border-2 border-lavender-200 space-y-3.5">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
                  {/* Search Bar by Name or Email */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-plum-900 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="entries-page-search-input"
                      type="text"
                      aria-label="Search users by name or email"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search users by Name or Email (or Phone / Entry #)..."
                      className="w-full pl-10 pr-24 py-3 rounded-xl border-2 border-lavender-300 bg-white text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-plum-900 shadow-2xs"
                    />
                    {searchQuery.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-[11px] cursor-pointer"
                      >
                        Clear ✕
                      </button>
                    )}
                  </div>

                  {/* Subscription Status Filter Dropdown (Active, Expired, Pending) */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 rounded-xl border-2 border-lavender-300 shadow-2xs">
                      <label
                        htmlFor="user-subscription-status-filter"
                        className="text-[11px] font-extrabold uppercase tracking-wider text-plum-900 whitespace-nowrap"
                      >
                        Status:
                      </label>
                      <select
                        id="user-subscription-status-filter"
                        aria-label="Filter users by subscription status"
                        value={filterTab}
                        onChange={(e) =>
                          setFilterTab(
                            e.target.value as
                              | 'all'
                              | 'active'
                              | 'expired'
                              | 'pending'
                              | 'free_password'
                          )
                        }
                        className="text-xs font-extrabold text-slate-900 bg-transparent outline-none cursor-pointer"
                      >
                        <option value="all">All Statuses ({stats.total})</option>
                        <option value="active">Active ({stats.active})</option>
                        <option value="expired">Expired ({stats.expired})</option>
                        <option value="pending">Pending ({stats.pending})</option>
                        <option value="free_password">30-Day Free Access ({stats.freePass})</option>
                      </select>
                    </div>

                    {/* Sort Selector */}
                    <div className="flex items-center gap-1.5 bg-white px-3 py-2.5 rounded-xl border border-slate-300">
                      <ArrowUpDown className="w-3.5 h-3.5 text-lavender-700 shrink-0" />
                      <span className="text-[11px] font-extrabold text-slate-600">Sort:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortField)}
                        className="text-xs font-extrabold text-slate-900 bg-transparent outline-none cursor-pointer"
                      >
                        <option value="entry_asc">Entry # (1st → Latest)</option>
                        <option value="entry_desc">Entry # (Newest → 1st)</option>
                        <option value="recent_login">Most Recent Login</option>
                        <option value="name_asc">Name (A → Z)</option>
                        <option value="days_desc">Access Days Remaining</option>
                      </select>
                    </div>

                    {/* Page Size Selector to accommodate lots of people */}
                    <div className="flex items-center gap-1.5 bg-white px-3 py-2.5 rounded-xl border border-slate-300">
                      <span className="text-[11px] font-extrabold text-slate-600">Per Page:</span>
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="text-xs font-extrabold text-plum-900 bg-transparent outline-none cursor-pointer"
                      >
                        <option value={10}>10 / page</option>
                        <option value={25}>25 / page</option>
                        <option value={50}>50 / page</option>
                        <option value={100}>100 / page</option>
                        <option value={0}>Show All ({filteredUsers.length})</option>
                      </select>
                    </div>

                    {(searchQuery.trim() !== '' || filterTab !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setFilterTab('all');
                        }}
                        className="px-3 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-extrabold text-xs cursor-pointer"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Filter Tabs & View Layout Switcher */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200">
                    {(
                      [
                        { id: 'all', label: `All Entries (${stats.total})` },
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
                        className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                          filterTab === tab.id
                            ? 'bg-plum-900 text-gold-400 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Bulk Delete Toolbar when rows are selected */}
                    {selectedEmails.length > 0 && (
                      <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-300 px-3 py-1.5 rounded-xl">
                        <span className="text-xs font-extrabold text-rose-900">
                          {selectedEmails.length} Selected
                        </span>
                        <button
                          type="button"
                          onClick={handleBulkDeleteSelected}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Selected ({selectedEmails.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedEmails([])}
                          className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-600 font-bold text-[11px] border border-slate-200 cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    {/* View Layout Switcher */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setEntriesViewLayout('table')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer ${
                          entriesViewLayout === 'table'
                            ? 'bg-lavender-700 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <TableIcon className="w-3.5 h-3.5" />
                        <span>Table</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEntriesViewLayout('cards')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer ${
                          entriesViewLayout === 'cards'
                            ? 'bg-lavender-700 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span>Cards</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEntriesViewLayout('both')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer ${
                          entriesViewLayout === 'both'
                            ? 'bg-lavender-700 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Both
                      </button>
                    </div>
                  </div>
                </div>
              </div>

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

              {/* TOP PAGINATION STATUS BAR */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
                <div className="font-bold text-slate-700">
                  Showing{' '}
                  <span className="font-extrabold text-plum-900">
                    {pageStartItem}–{pageEndItem}
                  </span>{' '}
                  of{' '}
                  <span className="font-extrabold text-plum-900">{filteredUsers.length}</span>{' '}
                  customer entries
                  {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs cursor-pointer"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>
                    <span className="px-3 py-1.5 rounded-lg bg-plum-900 text-gold-400 font-mono font-extrabold text-xs">
                      Page {safeCurrentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs cursor-pointer"
                    >
                      Last
                    </button>
                  </div>
                )}
              </div>

              {/* CUSTOMER ENTRIES TABLE VIEW */}
              {(entriesViewLayout === 'table' || entriesViewLayout === 'both') && (
                <>
                  {paginatedUsers.length === 0 ? (
                    <div className="rounded-2xl bg-cream p-8 text-center space-y-2 border border-slate-200">
                      <p className="text-sm font-extrabold text-slate-700">
                        No customer entries match your current search or filter.
                      </p>
                      <p className="text-xs text-slate-500">
                        Clear your search bar above or click &ldquo;Sync All Entries&rdquo; in the top header.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-2xl border-2 border-slate-200 shadow-2xs">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-plum-900 text-white font-extrabold uppercase tracking-wider text-[11px]">
                            <th className="py-3 px-3 w-9">
                              <button
                                type="button"
                                onClick={handleToggleSelectPage}
                                className="flex items-center justify-center text-gold-400 hover:text-white cursor-pointer"
                                title={
                                  isAllCurrentPageSelected
                                    ? 'Unselect all on this page'
                                    : 'Select all on this page'
                                }
                              >
                                {isAllCurrentPageSelected ? (
                                  <CheckSquare className="w-4 h-4" />
                                ) : (
                                  <Square className="w-4 h-4" />
                                )}
                              </button>
                            </th>
                            <th className="py-3 px-3"># Entry</th>
                            <th className="py-3 px-3">1. Customer Name</th>
                            <th className="py-3 px-3">2. Email Address</th>
                            <th className="py-3 px-3">3. Age</th>
                            <th className="py-3 px-3">4. Number Used (Phone)</th>
                            <th className="py-3 px-3">Last Login &amp; Device</th>
                            <th className="py-3 px-3">Access Status</th>
                            <th className="py-3 px-3">Actions &amp; Delete</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {paginatedUsers.map((u, idx) => {
                            const st = getTrialStatus(u);
                            const custNum = u.customerNumber || idx + 1;
                            const phoneUsed = resolveCustomerPhoneUsed(u);
                            const cleanEmail = u.email.toLowerCase().trim();
                            const isSelected = selectedEmails.includes(cleanEmail);
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
                                className={`transition-colors ${
                                  isSelected
                                    ? 'bg-rose-50/70 hover:bg-rose-50'
                                    : 'hover:bg-lavender-50/60'
                                }`}
                              >
                                <td className="py-3 px-3">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleSelectUser(u.email)}
                                    className="flex items-center justify-center text-slate-600 hover:text-plum-900 cursor-pointer"
                                    title="Select row"
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4 text-rose-600" />
                                    ) : (
                                      <Square className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                                <td className="py-3 px-3">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-plum-900 text-gold-400 font-mono font-extrabold text-xs">
                                    #{custNum}
                                  </span>
                                </td>
                                <td className="py-3 px-3 font-extrabold text-slate-900">
                                  <div>{u.name || 'Student'}</div>
                                  {u.pendingPayment && (
                                    <div className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-orange-100 text-orange-900 border border-orange-300 text-[10px] font-mono font-bold">
                                      <span>
                                        🟧 OM Name: {u.pendingPayment.senderName || u.name} ·{' '}
                                        {u.pendingPayment.senderPhone}
                                      </span>
                                    </div>
                                  )}
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
                                    {u.deviceInfo || '📱/💻 WebApp Link'} • {u.signInCount || 1}{' '}
                                    login(s)
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
                                    {st.daysLeft}d left (
                                    {st.status === 'trial' ? '2-Wk Free' : st.status})
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
                                        🎁 1M Free
                                      </button>
                                    )}
                                    {onExtendUserFreeAccess && (
                                      <button
                                        type="button"
                                        onClick={() => onExtendUserFreeAccess(u.email, 14)}
                                        className="px-2 py-1 rounded-lg bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-[10px] cursor-pointer"
                                        title="Extend +14 days free access (Le 0)"
                                      >
                                        +14d
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
                                      Paid +30d
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditCustomerEntry(u)}
                                      className="px-2.5 py-1 rounded-lg bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-[10px] inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRejectOrExpireUser(u.email, 'expire')}
                                      className="px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] cursor-pointer"
                                      title="Expire / Lock account"
                                    >
                                      Lock
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteSingleCustomer(u.email)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                                      title="Permanently delete this customer entry"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Delete</span>
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
                </>
              )}

              {/* CUSTOMER ENTRIES DETAILED CARDS VIEW */}
              {(entriesViewLayout === 'cards' || entriesViewLayout === 'both') &&
                paginatedUsers.length > 0 && (
                  <div className="space-y-3.5 pt-2">
                    {entriesViewLayout === 'both' && (
                      <h3 className="font-display font-extrabold text-sm uppercase tracking-wider text-slate-700">
                        🪪 Detailed Customer Cards (Page {safeCurrentPage} of {totalPages})
                      </h3>
                    )}
                    {paginatedUsers.map((u, idx) => {
                      const st = getTrialStatus(u);
                      const custNum = u.customerNumber || idx + 1;
                      const phoneDisplay = resolveCustomerPhoneUsed(u) || 'Not entered yet';
                      const hasPending =
                        st.status === 'pending_verification' ||
                        u.pendingPayment?.status === 'pending';
                      const isRecentlyApproved = lastApprovedUserEmail === u.email;
                      const periodsCount = Array.isArray(u.periods) ? u.periods.length : 0;
                      const logsCount = u.dailyLogs ? Object.keys(u.dailyLogs).length : 0;
                      const appointmentsCount = Array.isArray(u.appointments)
                        ? u.appointments.length
                        : 0;
                      const skincareLogsCount = Array.isArray(u.therapyLogs)
                        ? u.therapyLogs.length
                        : 0;
                      const isAdminRole =
                        u.role === 'admin' ||
                        u.email.toLowerCase() === OWNER_ADMIN_EMAIL.toLowerCase() ||
                        additionalAdmins.some(
                          (a) => a.email.trim().toLowerCase() === u.email.toLowerCase()
                        );

                      return (
                        <div
                          key={`card-${u.email}`}
                          className={`relative rounded-2xl p-4 border transition-all ${
                            hasPending
                              ? 'bg-orange-50/70 border-2 border-orange-400 shadow-xs'
                              : isRecentlyApproved
                              ? 'bg-sage-50/80 border-2 border-sage-500'
                              : 'bg-cream/60 border-slate-200'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="space-y-2 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2.5 py-1 rounded-lg bg-plum-900 text-gold-400 font-mono text-xs font-extrabold">
                                  Customer #{custNum}
                                </span>
                                <span className="font-display font-extrabold text-base text-slate-900">
                                  {u.name || 'Student'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold ${
                                    isAdminRole
                                      ? 'bg-plum-900 text-gold-400 border border-gold-500/50'
                                      : 'bg-lavender-100 text-lavender-900 border border-lavender-300'
                                  }`}
                                >
                                  {isAdminRole ? '🛡️ Admin' : '🌸 Client'}
                                </span>
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold ${
                                    st.status === 'expired'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : st.status === 'pending_verification'
                                      ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                      : 'bg-sage-100 text-sage-800'
                                  }`}
                                >
                                  {st.label} ({st.daysLeft}d left)
                                </span>
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
                                        ? new Date(
                                            u.firstEntryAt || u.createdAt
                                          ).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                          })
                                        : 'Recorded'}
                                    </strong>
                                  </span>
                                </span>
                                <span className="inline-flex items-center gap-1 font-mono">
                                  <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                                  <span>
                                    {u.deviceInfo || '📱/💻 WebApp Link'} ({u.signInCount || 1}{' '}
                                    logins)
                                  </span>
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-semibold">
                                  <Activity className="w-3 h-3 text-rose-600" />
                                  <span>
                                    {periodsCount} Period(s) • {logsCount} Mood/Symptom Log(s) •{' '}
                                    {appointmentsCount} Appt(s) • {skincareLogsCount} Skincare Log(s)
                                  </span>
                                </span>
                              </div>

                              {u.pendingPayment && (
                                <div className="relative mt-2 p-3 pr-9 rounded-xl bg-white border border-orange-200 text-xs space-y-1">
                                  {onClearPendingVerification && (
                                    <button
                                      type="button"
                                      onClick={() => onClearPendingVerification(u.email)}
                                      title="Remove Pending Owner Verification"
                                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-orange-100 hover:bg-rose-100 text-orange-900 hover:text-rose-700 border border-orange-300 font-extrabold text-[11px] flex items-center justify-center cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  )}
                                  <div className="font-extrabold text-orange-900 uppercase tracking-wider text-[10px]">
                                    🟧 Submitted Orange Money Transaction ({u.pendingPayment.amount})
                                  </div>
                                  <div className="flex flex-wrap items-center gap-4 font-mono text-slate-800">
                                    <span>
                                      User / Payer Name:{' '}
                                      <strong className="text-slate-950">
                                        {u.pendingPayment.senderName || u.name}
                                      </strong>
                                    </span>
                                    <span>
                                      Sender Phone: <strong>{u.pendingPayment.senderPhone}</strong>
                                    </span>
                                    <span>
                                      SMS Tx ID: <strong>{u.pendingPayment.transactionId}</strong>
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleOpenEditCustomerEntry(u)}
                                className="px-3 py-2 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>

                              {onExtendUserFreeAccess && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onExtendUserFreeAccess(u.email, 30)}
                                    className="px-3.5 py-2 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-xs cursor-pointer"
                                  >
                                    🎁 1 Month Free (Le 0)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onExtendUserFreeAccess(u.email, 14)}
                                    className="px-3 py-2 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs cursor-pointer"
                                  >
                                    +14d Free
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  onApproveUserPayment(u.email);
                                  setLastApprovedUserEmail(u.email);
                                }}
                                className="px-3.5 py-2 rounded-xl bg-sage-600 hover:bg-sage-800 text-white font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve Paid (+Le {passPriceSle})</span>
                              </button>

                              {hasPending ? (
                                <button
                                  type="button"
                                  onClick={() => onRejectOrExpireUser(u.email, 'reject')}
                                  className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-800 text-white font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onRejectOrExpireUser(u.email, 'expire')}
                                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs flex items-center gap-1 cursor-pointer"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Lock</span>
                                </button>
                              )}

                              <a
                                href={buildWhatsAppHref(u)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>

                              <a
                                href={buildSmsHref(u)}
                                className="px-3 py-2 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-bold text-xs flex items-center gap-1"
                              >
                                <Phone className="w-3.5 h-3.5" />
                                <span>SMS</span>
                              </a>

                              <a
                                href={buildApprovalEmailHref(u)}
                                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1"
                              >
                                <Mail className="w-3.5 h-3.5" />
                                <span>Email</span>
                              </a>

                              <button
                                type="button"
                                onClick={() => handleDeleteSingleCustomer(u.email)}
                                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-2xs transition-all cursor-pointer"
                                title="Permanently delete this customer entry"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

              {/* BOTTOM MULTI-PAGE PAGINATION CONTROLS */}
              {totalPages > 1 && (
                <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-600">
                    Page <strong>{safeCurrentPage}</strong> of <strong>{totalPages}</strong> (
                    {filteredUsers.length} total people)
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage(1)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs cursor-pointer"
                    >
                      First
                    </button>
                    <button
                      type="button"
                      disabled={safeCurrentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Prev</span>
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(
                        (p) =>
                          p === 1 ||
                          p === totalPages ||
                          Math.abs(p - safeCurrentPage) <= 2
                      )
                      .map((pageNum, idx, arr) => {
                        const prev = arr[idx - 1];
                        const showEllipsis = prev !== undefined && pageNum - prev > 1;
                        return (
                          <React.Fragment key={`pg-btn-${pageNum}`}>
                            {showEllipsis && (
                              <span className="px-1.5 text-xs font-bold text-slate-400">…</span>
                            )}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(pageNum)}
                              className={`w-8 h-8 rounded-xl font-mono font-extrabold text-xs transition-all cursor-pointer ${
                                pageNum === safeCurrentPage
                                  ? 'bg-plum-900 text-gold-400 shadow-xs'
                                  : 'bg-white hover:bg-lavender-50 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {pageNum}
                            </button>
                          </React.Fragment>
                        );
                      })}

                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={safeCurrentPage >= totalPages}
                      onClick={() => setCurrentPage(totalPages)}
                      className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold text-xs cursor-pointer"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* PAGE 2: OVERVIEW & LIVE PEOPLE LOGGING IN PAGE                      */}
        {/* =================================================================== */}
        {activeAdminPage === 'overview' && (
          <div className="space-y-6">
            {/* TOP KPI SUMMARY CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <div
                onClick={() => setActiveAdminPage('entries')}
                className="bg-gradient-to-br from-plum-900 to-lavender-900 text-white rounded-2xl p-4 border-2 border-gold-500/50 shadow-sm cursor-pointer hover:scale-[1.01] transition-all"
              >
                <div className="flex items-center justify-between text-gold-400 text-xs font-extrabold uppercase">
                  <span>People in App</span>
                  <Users className="w-4 h-4 text-gold-400" />
                </div>
                <div className="font-display font-extrabold text-3xl text-white mt-1 tabular-nums">
                  {stats.total}
                </div>
                <p className="text-[11px] text-gold-300 mt-0.5 underline">
                  Open Entries Page →
                </p>
              </div>

              <div
                onClick={() => setActiveAdminPage('revenue')}
                className="bg-gradient-to-br from-emerald-900 to-sage-900 text-white rounded-2xl p-4 border-2 border-emerald-400/50 shadow-sm cursor-pointer hover:scale-[1.01] transition-all"
              >
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

              <div
                onClick={() => {
                  setFilterTab('pending');
                  setActiveAdminPage('entries');
                }}
                className="bg-white rounded-2xl p-4 border-2 border-orange-300 shadow-xs cursor-pointer hover:bg-orange-50/40 transition-all"
              >
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

              <div
                onClick={() => {
                  setFilterTab('active');
                  setActiveAdminPage('entries');
                }}
                className="bg-white rounded-2xl p-4 border border-sage-200 shadow-xs cursor-pointer hover:bg-sage-50/50 transition-all"
              >
                <div className="flex items-center justify-between text-sage-800 text-xs font-bold">
                  <span>2-Week Free Users</span>
                  <CheckCircle2 className="w-4 h-4 text-sage-600" />
                </div>
                <div className="font-display font-extrabold text-3xl text-sage-800 mt-1 tabular-nums">
                  {stats.trial}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">Active 14-day free access</p>
              </div>

              <div
                onClick={() => {
                  setFilterTab('free_password');
                  setActiveAdminPage('entries');
                }}
                className="bg-white rounded-2xl p-4 border border-lavender-200 shadow-xs cursor-pointer hover:bg-lavender-50/50 transition-all"
              >
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

              <div
                onClick={() => {
                  setFilterTab('expired');
                  setActiveAdminPage('entries');
                }}
                className="bg-white rounded-2xl p-4 border border-rose-200 shadow-xs cursor-pointer hover:bg-rose-50/50 transition-all"
              >
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

            {/* LIVE PEOPLE LOGGING IN & SIGN-UP FEED */}
            <section className="bg-white rounded-3xl border-2 border-emerald-300 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <BellRing className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                      🟢 Live People Logging In &amp; Sign-Up Feed ({recentLoginsList.length}{' '}
                      People)
                    </h2>
                    <p className="text-xs text-slate-600">
                      Every person who creates an account or logs in appears here in real time. Every card has working Free Pass, Edit, and Delete buttons.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveAdminPage('entries')}
                    className="px-3.5 py-2 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Open Full Searchable Entries Page</span>
                  </button>
                  {onExtendUserFreeAccess && recentLoginsList.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onExtendUserFreeAccess('ALL', 30)}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
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
                    <span>Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWhatsAppAllLoginsToOwner}
                    className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp List</span>
                  </button>
                </div>
              </div>

              {/* Search Bar & Subscription Status Filter Dropdown on Overview User Feed */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-3.5 rounded-2xl bg-cream border border-emerald-200">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-emerald-800 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    aria-label="Search users by name or email in overview"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users by Name or Email..."
                    className="w-full pl-10 pr-20 py-2.5 rounded-xl border border-emerald-300 bg-white text-xs font-semibold text-slate-900 outline-none focus:border-emerald-700"
                  />
                  {searchQuery.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-800 font-extrabold text-[11px] cursor-pointer"
                    >
                      Clear ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-white px-3.5 py-2.5 rounded-xl border border-emerald-300 shrink-0">
                  <label
                    htmlFor="overview-subscription-status-filter"
                    className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900 whitespace-nowrap"
                  >
                    Subscription Status:
                  </label>
                  <select
                    id="overview-subscription-status-filter"
                    aria-label="Filter overview users by subscription status"
                    value={filterTab}
                    onChange={(e) =>
                      setFilterTab(
                        e.target.value as
                          | 'all'
                          | 'active'
                          | 'expired'
                          | 'pending'
                          | 'free_password'
                      )
                    }
                    className="text-xs font-extrabold text-slate-900 bg-transparent outline-none cursor-pointer"
                  >
                    <option value="all">All Statuses ({stats.total})</option>
                    <option value="active">Active ({stats.active})</option>
                    <option value="expired">Expired ({stats.expired})</option>
                    <option value="pending">Pending ({stats.pending})</option>
                    <option value="free_password">30-Day Free Access ({stats.freePass})</option>
                  </select>
                </div>
              </div>

              {recentLoginsList.length === 0 ? (
                <div className="rounded-2xl bg-cream p-6 text-center text-xs text-slate-600 border border-slate-200">
                  No users match your current search or subscription status filter.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {recentLoginsList.slice(0, 18).map((u, idx) => {
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
                        className="rounded-2xl bg-emerald-50/50 border border-emerald-200 p-4 flex flex-col justify-between gap-3"
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
                          {u.pendingPayment && (
                            <div className="mt-1.5 p-2 rounded-xl bg-orange-50 border border-orange-300 text-[11px] font-mono text-orange-950 space-y-0.5">
                              <div>
                                🟧 OM Payer Name:{' '}
                                <strong>{u.pendingPayment.senderName || u.name}</strong>
                              </div>
                              <div>
                                📞 Sender: <strong>{u.pendingPayment.senderPhone}</strong> · Ref:{' '}
                                <strong>{u.pendingPayment.transactionId}</strong>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="pt-2 border-t border-emerald-200/70 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span className="truncate max-w-[165px]">
                              {u.deviceInfo || '📱/💻 WebApp'} • {u.signInCount || 1} login(s)
                            </span>
                            <span className="font-extrabold text-emerald-900">
                              {st.daysLeft}d left
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {onExtendUserFreeAccess && (
                              <button
                                type="button"
                                onClick={() => onExtendUserFreeAccess(u.email, 30)}
                                className="flex-1 py-1.5 px-2.5 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-400 font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-2xs transition-all cursor-pointer"
                              >
                                <span>🎁 1M Free (Le 0)</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenEditCustomerEntry(u)}
                              className="py-1.5 px-2.5 rounded-xl bg-white hover:bg-lavender-50 text-lavender-900 border border-lavender-300 font-extrabold text-[11px] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSingleCustomer(u.email)}
                              className="py-1.5 px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] flex items-center gap-1 cursor-pointer"
                              title="Delete this customer entry"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* PAGE 3: MONEY & REVENUE CALCULATOR PAGE                             */}
        {/* =================================================================== */}
        {activeAdminPage === 'revenue' && (
          <section className="bg-white rounded-3xl border-2 border-amber-300 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500 text-plum-900 flex items-center justify-center shrink-0">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 block">
                    Page 3 of 6 · App Revenue &amp; Auto Money Reducer
                  </span>
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                    💰 Money the App Is Making: Le {revenueSummary.grandTotalSle.toLocaleString()}{' '}
                    (${revenueSummary.grandTotalUsd.toFixed(2)})
                  </h2>
                </div>
              </div>

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
                className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Total Revenue Report</span>
              </button>
            </div>

            {/* Grand Total Display Banner */}
            <div className="rounded-2xl bg-gradient-to-r from-plum-900 via-lavender-900 to-plum-900 text-white p-5 border border-gold-500/40 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-gold-400">
                  Grand Total Money Made (Auto Subscriptions + Added Entries)
                </span>
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-white/90 cursor-pointer">
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
                  <div className="font-mono text-xs text-white/75 tabular-nums">
                    Old Leones: Le {revenueSummary.grandTotalOldLeones.toLocaleString()} SLL
                  </div>
                </div>
              </div>
            </div>

            {/* Automatic Subscription Breakdown Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-cream p-3.5 border border-slate-200">
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
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  🎁 1-Month Free grants = Le 0
                </span>
              </div>

              <div className="rounded-xl bg-emerald-50/70 p-3.5 border border-emerald-200 space-y-1.5">
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
                    className="w-full px-2 py-1.5 rounded-lg border border-emerald-300 bg-white font-mono font-extrabold text-sm text-emerald-900"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                  <button
                    type="button"
                    onClick={() => handleAdjustAutoMoney(-(passPriceSle || 30))}
                    className="px-2 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-300 font-mono font-extrabold text-[10px] cursor-pointer"
                  >
                    −Le {passPriceSle || 30}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustAutoMoney(passPriceSle || 30)}
                    className="px-2 py-0.5 rounded-md bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 font-mono font-extrabold text-[10px] cursor-pointer"
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
                  >
                    Set Le 0
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-orange-50/70 p-3.5 border border-orange-200">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900 block">
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
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-mono font-extrabold text-xs transition-all cursor-pointer"
                    >
                      +Le {btn.amount}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-200 space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-900 block">
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
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 font-mono font-extrabold text-xs transition-all cursor-pointer"
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

            {/* Custom Revenue Item Form */}
            <form
              onSubmit={(e) => handleAddCustomRevenueItem(e, 'add')}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-cream p-4 rounded-2xl border border-slate-200"
            >
              <div className="sm:col-span-5">
                <label className="text-[10px] font-extrabold uppercase text-slate-600 block mb-1">
                  Description / Note
                </label>
                <input
                  type="text"
                  value={newRevLabel}
                  onChange={(e) => setNewRevLabel(e.target.value)}
                  placeholder="e.g., Direct Orange Money / Clinic Session / Expense"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-[10px] font-extrabold uppercase text-slate-600 block mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={newRevAmount}
                  onChange={(e) => setNewRevAmount(e.target.value)}
                  placeholder="30"
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
                  className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer h-[36px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddCustomRevenueItem(undefined, 'reduce')}
                  className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1 cursor-pointer h-[36px]"
                >
                  <span>− Reduce</span>
                </button>
              </div>
            </form>

            {/* Custom Revenue Ledger with Delete Buttons */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-700">
                <span>
                  Custom Money Ledger ({customRevenueItems.length} entries) — Net: Le{' '}
                  {revenueSummary.customItemsTotalSle.toLocaleString()}
                </span>
                {customRevenueItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomRevenueItems([]);
                      showToast('🗑️ Cleared all custom money entries.', 'info');
                    }}
                    className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All Entries</span>
                  </button>
                )}
              </div>

              {customRevenueItems.length === 0 ? (
                <p className="text-xs text-slate-500 italic bg-cream p-4 rounded-2xl border border-slate-200">
                  No custom money entries added yet. Use the form or quick-tap buttons above to record custom earnings or expenses.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {customRevenueItems.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-xs ${
                        item.amountSle < 0
                          ? 'bg-rose-50/70 border-rose-200'
                          : 'bg-amber-50/50 border-amber-200'
                      }`}
                    >
                      <div className="truncate">
                        <span className="font-bold text-slate-900">{item.label}</span>{' '}
                        <span className="text-[10px] text-slate-500">({item.createdAt})</span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
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
                          onClick={() => {
                            setCustomRevenueItems((prev) => prev.filter((x) => x.id !== item.id));
                            showToast(`🗑️ Deleted "${item.label}" from money ledger.`, 'info');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] flex items-center gap-1 cursor-pointer"
                          title="Delete this revenue entry"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* PAGE 4: USD ($) ⇄ SIERRA LEONEAN LEONES CONVERTER & CALCULATOR PAGE */}
        {/* =================================================================== */}
        {activeAdminPage === 'converter' && (
          <section className="bg-white rounded-3xl border-2 border-emerald-300 p-5 sm:p-6 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <ArrowRightLeft className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                    Page 4 of 6 · Currency Converter &amp; Check Calculator
                  </span>
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                    💱 USD ($) ⇄ Sierra Leonean Leones (SLE) Calculator ($1 = Le {usdToSleRate})
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200">
                <span className="text-xs font-extrabold text-emerald-900">$1 USD = Le</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={usdToSleRate}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className="w-20 px-2 py-1 rounded-lg border border-emerald-300 bg-white font-mono font-extrabold text-xs text-slate-900"
                />
              </div>
            </div>

            {/* Two-Way Live Converter Box */}
            <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-2xs">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>🇺🇸 US Dollars ($ USD)</span>
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={usdInputStr}
                    onChange={(e) => handleUsdInputChange(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-cream/60 font-mono font-extrabold text-lg text-slate-900 outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-emerald-300 shadow-2xs">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                    <span>🇸🇱 Sierra Leonean Leones (Le / SLE)</span>
                    <span className="font-mono text-emerald-700 font-bold">Le</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={sleInputStr}
                    onChange={(e) => handleSleInputChange(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 bg-cream/60 font-mono font-extrabold text-lg text-emerald-900 outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950 bg-white/90 px-3.5 py-2.5 rounded-xl border border-emerald-200 font-mono">
                <span>
                  <strong>${Number(usdInputStr || 0).toLocaleString()} USD</strong> ={' '}
                  <strong>Le {Number(sleInputStr || 0).toLocaleString()} SLE</strong> (New Leones)
                </span>
                <span className="text-slate-600">
                  Old Leones:{' '}
                  <strong>
                    Le {(Number(sleInputStr || 0) * 1000).toLocaleString()} SLL
                  </strong>
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[1, 5, 10, 20, 50, 100].map((usdPreset) => (
                  <button
                    key={usdPreset}
                    type="button"
                    onClick={() => handleUsdInputChange(String(usdPreset))}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono font-extrabold text-[11px] cursor-pointer"
                  >
                    ${usdPreset} = Le {(usdPreset * usdToSleRate).toFixed(1)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleSleInputChange(String(passPriceSle))}
                  className="px-2.5 py-1 rounded-lg bg-plum-900 text-gold-400 font-mono font-extrabold text-[11px] cursor-pointer"
                >
                  Pass Le {passPriceSle} = $
                  {usdToSleRate > 0 ? (passPriceSle / usdToSleRate).toFixed(2) : '0.00'}
                </button>
              </div>
            </div>

            {/* Quick Check Arithmetic Calculator */}
            <div className="rounded-2xl bg-cream p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  🧮 Quick Check Calculator (Add, Subtract, Multiply, Divide)
                </span>
                <div className="inline-flex rounded-lg bg-white border border-slate-300 p-0.5 text-[11px] font-extrabold">
                  <button
                    type="button"
                    onClick={() => setCalcInputCurrency('SLE')}
                    className={`px-2 py-0.5 rounded-md cursor-pointer ${
                      calcInputCurrency === 'SLE'
                        ? 'bg-plum-900 text-gold-400'
                        : 'text-slate-600'
                    }`}
                  >
                    Input in Le (SLE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcInputCurrency('USD')}
                    className={`px-2 py-0.5 rounded-md cursor-pointer ${
                      calcInputCurrency === 'USD'
                        ? 'bg-emerald-700 text-white'
                        : 'text-slate-600'
                    }`}
                  >
                    Input in $ (USD)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="number"
                  step="any"
                  value={calcNumA}
                  onChange={(e) => setCalcNumA(e.target.value)}
                  className="col-span-4 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900"
                  placeholder="First #"
                />
                <div className="col-span-4 grid grid-cols-4 gap-1">
                  {(['+', '-', '×', '÷'] as const).map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => setCalcOp(op)}
                      className={`py-2 rounded-xl font-mono font-extrabold text-sm cursor-pointer ${
                        calcOp === op
                          ? 'bg-plum-900 text-gold-400 shadow-2xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
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
                  className="col-span-4 px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900"
                  placeholder="Second #"
                />
              </div>

              {quickCalcResult.valid && (
                <div className="rounded-xl bg-white p-3.5 border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-extrabold uppercase text-slate-400">
                      Calculation Result ({calcNumA} {calcOp} {calcNumB})
                    </div>
                    <div className="font-mono font-extrabold text-base text-slate-900">
                      Le {quickCalcResult.resultSle.toLocaleString()} SLE{' '}
                      <span className="text-emerald-700">
                        (≈ ${quickCalcResult.resultUsd.toFixed(2)} USD)
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">
                      Old Leones: Le {quickCalcResult.resultOldSll.toLocaleString()} SLL
                    </div>
                  </div>

                  {quickCalcResult.resultSle > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        handleQuickAddMoney(
                          quickCalcResult.resultSle,
                          `Calc (${calcNumA} ${calcOp} ${calcNumB})`
                        )
                      }
                      className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-plum-900 font-extrabold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Le {quickCalcResult.resultSle} to App Money</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* =================================================================== */}
        {/* PAGE 5: TEAM ADMINS & PASSWORDS PAGE                                */}
        {/* =================================================================== */}
        {activeAdminPage === 'security' && (
          <div className="space-y-6">
            {/* TEAM ADMIN ACCOUNTS SECTION */}
            <section className="bg-white rounded-3xl border-2 border-sage-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-sage-700 text-white flex items-center justify-center shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-sage-800 block">
                    Page 5 of 6 · Team Admin Access &amp; Security Codes
                  </span>
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                    🛡️ Team Admin Accounts ({1 + additionalAdmins.length} Authorized Admins)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Add or remove Co-Admins who can view customer entries and approve accounts.
                  </p>
                </div>
              </div>

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
                  const shareText = `Hello ${adm.name || 'Admin'}! You have been granted Admin Dashboard access on BloomCampus & Sidratu Clinic.\n• Admin Login Email: ${adm.email}\n• Admin Password: ${adm.password}`;
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
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText(shareText);
                            showToast(
                              `Copied login credentials for ${adm.email}!`,
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
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete Admin</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* MANAGE OWNER ADMIN & FREE 30-DAY UNLOCK CODE */}
            <section className="bg-white rounded-3xl border-2 border-lavender-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-lavender-100 text-lavender-800 flex items-center justify-center shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-extrabold text-base sm:text-lg text-slate-900">
                      🔑 Manage Owner Admin Console &amp; Free 30-Day Unlock Code
                    </h3>
                    <p className="text-xs text-slate-600">
                      Update your Owner Admin password or student Free 30-Day Unlock Code.
                    </p>
                  </div>
                </div>

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
                </div>

                <button
                  type="submit"
                  className="py-3.5 px-5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
                >
                  💾 Save &amp; Sync Admin Codes
                </button>
              </form>
            </section>
          </div>
        )}

        {/* =================================================================== */}
        {/* PAGE 6: ALERTS & SUPPORT INBOX PAGE (WITH SEARCH & DELETE)          */}
        {/* =================================================================== */}
        {activeAdminPage === 'inbox' && (
          <section className="bg-white rounded-3xl border-2 border-lavender-200 p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-lavender-100 text-lavender-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-lavender-800 block">
                    Page 6 of 6 · Live Activity &amp; Support Inbox
                  </span>
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                    📬 Live Login Alerts, Payments &amp; Support Inbox ({filteredInquiries.length})
                  </h2>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleEmailAllLoginsToOwner}
                  className="px-3.5 py-2 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email All Logins to {OWNER_ADMIN_EMAIL}</span>
                </button>

                {onDeleteSupportInquiry && supportInquiries.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onDeleteSupportInquiry(undefined, true)}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All Alerts ({supportInquiries.length})</span>
                  </button>
                )}
              </div>
            </div>

            {/* Inbox Search Bar & Filter Tabs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-cream p-3.5 rounded-2xl border border-slate-200">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inboxSearchQuery}
                  onChange={(e) => {
                    setInboxSearchQuery(e.target.value);
                    setInboxPage(1);
                  }}
                  placeholder="Search inbox alerts by name, email, phone, or message..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 outline-none focus:border-lavender-700"
                />
              </div>

              <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl border border-slate-200">
                {(
                  [
                    { id: 'all', label: 'All Alerts' },
                    { id: 'login', label: 'Logins & Sign-Ups' },
                    { id: 'payment', label: 'Payments' },
                    { id: 'support', label: 'Support' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setInboxFilterType(t.id);
                      setInboxPage(1);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                      inboxFilterType === t.id
                        ? 'bg-plum-900 text-gold-400'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {paginatedInquiries.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-cream rounded-2xl p-6 text-center border border-slate-200">
                No alerts match your current inbox filter.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {paginatedInquiries.map((inq) => {
                  const isPayment = inq.type === 'payment' || inq.type === 'appreciation';
                  const isLogin =
                    inq.type === 'login' || inq.type === 'signup' || inq.type === 'welcome';
                  return (
                    <div
                      key={inq.id}
                      className={`rounded-2xl p-4 border space-y-2 text-xs ${
                        inq.type === 'appreciation'
                          ? 'bg-rose-50/70 border-rose-300'
                          : isPayment
                          ? 'bg-orange-50/70 border-orange-200'
                          : isLogin
                          ? 'bg-emerald-50/70 border-emerald-200'
                          : 'bg-cream border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-md font-extrabold uppercase text-[10px] ${
                            inq.type === 'appreciation'
                              ? 'bg-rose-100 text-rose-900'
                              : isPayment
                              ? 'bg-orange-100 text-orange-800'
                              : inq.type === 'welcome'
                              ? 'bg-lavender-100 text-lavender-900'
                              : isLogin
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-lavender-100 text-lavender-800'
                          }`}
                        >
                          {inq.type === 'appreciation'
                            ? '💖 Payment Appreciation Sent'
                            : isPayment
                            ? '🟧 Payment Alert'
                            : inq.type === 'welcome'
                            ? '🌸 Welcome & Thank-You Sent'
                            : inq.type === 'signup'
                            ? '🆕 New Account Sign-Up'
                            : isLogin
                            ? '🔑 User Sign-In'
                            : '💬 Support Inquiry'}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-500">
                            {new Date(inq.createdAt).toLocaleString()}
                          </span>
                          {onDeleteSupportInquiry && (
                            <button
                              type="button"
                              onClick={() => onDeleteSupportInquiry(inq.id, false)}
                              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[10px] flex items-center gap-1 cursor-pointer"
                              title="Delete this alert"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
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

            {totalInboxPages > 1 && (
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-600">
                  Inbox Page {safeInboxPage} of {totalInboxPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeInboxPage <= 1}
                    onClick={() => setInboxPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold cursor-pointer"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={safeInboxPage >= totalInboxPages}
                    onClick={() => setInboxPage((p) => Math.min(totalInboxPages, p + 1))}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 font-extrabold cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Admin Footer with Creator Branding */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-600 mb-4">
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

      {/* =================================================================== */}
      {/* FIXED BOTTOM MULTI-PAGE ADMIN NAVIGATION BAR WITH ICONS             */}
      {/* =================================================================== */}
      <nav
        aria-label="Admin Pages Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-r from-plum-950 via-plum-900 to-plum-950 text-white border-t-2 border-gold-500/60 shadow-2xl"
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 grid grid-cols-6 gap-1 sm:gap-2">
          {adminPages.map((page) => {
            const isActive = activeAdminPage === page.id;
            const PageIcon = page.Icon;
            return (
              <button
                key={page.id}
                type="button"
                title={`${page.label} — ${page.description}`}
                onClick={() => {
                  setActiveAdminPage(page.id);
                  if (typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className={`relative py-2 px-1 sm:px-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gold-500 text-plum-900 shadow-lg scale-[1.02]'
                    : 'bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border border-white/10'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <PageIcon
                    className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      isActive ? 'text-plum-900' : 'text-gold-400'
                    }`}
                  />
                  {page.badge !== undefined && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] font-mono font-extrabold leading-tight ${
                        isActive
                          ? 'bg-plum-900 text-gold-400'
                          : 'bg-black/40 text-gold-300 border border-gold-400/30'
                      }`}
                    >
                      {page.badge}
                    </span>
                  )}
                </div>
                <span className="font-extrabold text-[10px] sm:text-xs leading-tight truncate max-w-full">
                  <span className="sm:hidden">{page.shortLabel}</span>
                  <span className="hidden sm:inline">{page.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
