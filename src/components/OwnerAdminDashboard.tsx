import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Users,
  CheckCircle2,
  XCircle,
  Mail,
  MessageSquare,
  Phone,
  Clock,
  RotateCcw,
  LogOut,
  Search,
  Lock,
  Sparkles,
  Copy,
  UserPlus,
  Trash2,
  Download,
  Calendar,
  Activity,
  Eye,
  EyeOff,
  PlusCircle,
  Edit3,
  Smartphone,
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

interface OwnerAdminDashboardProps {
  usersMap: Record<string, UserData>;
  adminConfig: AdminConfig;
  supportInquiries: SupportInquiry[];
  onUpdateAdminConfig: (nextConfig: AdminConfig) => void;
  onApproveUserPayment: (email: string) => void;
  onExtendUserFreeAccess?: (email: string, days: number) => void;
  onRejectOrExpireUser: (email: string, mode: 'reject' | 'expire') => void;
  onClearPendingVerification?: (email: string) => void;
  onRegisterNewUserByAdmin?: (params: {
    name: string;
    age: string;
    email: string;
    phone: string;
    password: string;
    originalEmail?: string;
  }) => void;
  onDeleteUser?: (email: string) => void;
  onRefreshUsers?: () => Promise<number>;
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
  const [freePassInput, setFreePassInput] = useState<string>(adminConfig.freeAccessPassword);
  const [adminPassInput, setAdminPassInput] = useState<string>(adminConfig.adminPassword);
  const [newAdminEmail, setNewAdminEmail] = useState<string>('');
  const [newAdminPassword, setNewAdminPassword] = useState<string>('');
  const [newAdminName, setNewAdminName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'pending_verification' | 'active' | 'free_password' | 'expired'
  >('ALL');
  const [sortOrder, setSortOrder] = useState<'FIRST_ENTRY_ASC' | 'LATEST_ACTIVE_DESC'>(
    'FIRST_ENTRY_ASC'
  );
  const [lastApprovedUserEmail, setLastApprovedUserEmail] = useState<string | null>(null);
  const [isSyncingUsers, setIsSyncingUsers] = useState<boolean>(false);
  // Always show passwords by default so the admin immediately sees Name, Email, Age, Number Used, and Password
  const [showUserPasswords, setShowUserPasswords] = useState<boolean>(true);
  const [showAddUserForm, setShowAddUserForm] = useState<boolean>(false);
  const [editingCustomerOriginalEmail, setEditingCustomerOriginalEmail] = useState<string | null>(
    null
  );
  const [manualUserName, setManualUserName] = useState<string>('');
  const [manualUserAge, setManualUserAge] = useState<string>('21');
  const [manualUserEmail, setManualUserEmail] = useState<string>('');
  const [manualUserPhone, setManualUserPhone] = useState<string>('');
  const [manualUserPassword, setManualUserPassword] = useState<string>('');

  const additionalAdmins: AdminAccount[] = useMemo(
    () => (Array.isArray(adminConfig.additionalAdmins) ? adminConfig.additionalAdmins : []),
    [adminConfig.additionalAdmins]
  );

  // Assign each customer their permanent sequential number (#1, #2, #3...) strictly by their FIRST entry
  const usersList = useMemo(() => {
    const rawEntries = Object.values(usersMap || {}).filter(
      (u) => u && typeof u === 'object' && typeof u.email === 'string' && u.email.trim().length > 0
    );

    // First sort chronologically by firstEntryAt / createdAt ascending to assign Customer #1, #2, #3...
    const chronologicalByFirstEntry = [...rawEntries].sort((a, b) => {
      const aFirst = Number(a.firstEntryAt || a.createdAt || Number.MAX_SAFE_INTEGER);
      const bFirst = Number(b.firstEntryAt || b.createdAt || Number.MAX_SAFE_INTEGER);
      if (aFirst !== bFirst) return aFirst - bFirst;
      return (a.email || '').localeCompare(b.email || '');
    });

    const withCustomerNumbers = chronologicalByFirstEntry.map((u, idx) => ({
      ...u,
      customerNumber: idx + 1,
      firstEntryAt: Number(u.firstEntryAt || u.createdAt || Date.now()),
      phone: resolveCustomerPhoneUsed(u),
    }));

    if (sortOrder === 'FIRST_ENTRY_ASC') {
      return withCustomerNumbers;
    }

    return [...withCustomerNumbers].sort((a, b) => {
      const aUpdated = a.lastUpdatedAt
        ? new Date(a.lastUpdatedAt).getTime()
        : a.firstEntryAt || a.createdAt || 0;
      const bUpdated = b.lastUpdatedAt
        ? new Date(b.lastUpdatedAt).getTime()
        : b.firstEntryAt || b.createdAt || 0;
      if (bUpdated !== aUpdated) return bUpdated - aUpdated;
      return (b.customerNumber || 0) - (a.customerNumber || 0);
    });
  }, [usersMap, sortOrder]);

  const stats = useMemo(() => {
    let pending = 0;
    let activePaid = 0;
    let freePass = 0;
    let expired = 0;
    let activeLast7Days = 0;
    let signedUpToday = 0;
    let totalPeriodsLogged = 0;
    let totalDailyLogs = 0;

    const nowMs = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    usersList.forEach((u) => {
      const st = getTrialStatus(u);
      if (st.status === 'pending_verification') pending += 1;
      else if (st.status === 'free_password') freePass += 1;
      else if (st.status === 'expired') expired += 1;
      else activePaid += 1;

      const createdMs = Number(u.firstEntryAt || u.createdAt || 0);
      const updatedMs = u.lastUpdatedAt ? new Date(u.lastUpdatedAt).getTime() : createdMs;
      if (createdMs > 0 && nowMs - createdMs <= oneDayMs) {
        signedUpToday += 1;
      }
      if (
        (updatedMs > 0 && nowMs - updatedMs <= sevenDaysMs) ||
        (createdMs > 0 && nowMs - createdMs <= sevenDaysMs)
      ) {
        activeLast7Days += 1;
      }
      totalPeriodsLogged += Array.isArray(u.periods) ? u.periods.length : 0;
      totalDailyLogs += u.dailyLogs ? Object.keys(u.dailyLogs).length : 0;
    });

    return {
      total: usersList.length,
      pending,
      activePaid,
      freePass,
      expired,
      activeLast7Days,
      signedUpToday,
      totalPeriodsLogged,
      totalDailyLogs,
    };
  }, [usersList]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const st = getTrialStatus(u);
      if (statusFilter !== 'ALL') {
        if (
          statusFilter === 'active' &&
          st.status !== 'subscribed' &&
          st.status !== 'trial' &&
          st.status !== 'free_password'
        ) {
          return false;
        }
        if (statusFilter !== 'active' && st.status !== statusFilter) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = `#${u.customerNumber || ''}`.includes(q);
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchPhone = resolveCustomerPhoneUsed(u).toLowerCase().includes(q);
        const matchPass = (u.password || '').toLowerCase().includes(q);
        const matchTx = (u.pendingPayment?.transactionId || '').toLowerCase().includes(q);
        return matchNum || matchName || matchEmail || matchPhone || matchPass || matchTx;
      }
      return true;
    });
  }, [usersList, statusFilter, searchQuery]);

  const handleOpenEditCustomerEntry = (u: UserData) => {
    setEditingCustomerOriginalEmail(u.email);
    setManualUserName(u.name || '');
    setManualUserAge(u.age || '21');
    setManualUserEmail(u.email || '');
    setManualUserPhone(resolveCustomerPhoneUsed(u));
    setManualUserPassword(u.password || '');
    setShowAddUserForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExportAllSignupsCsv = () => {
    const headers = [
      'Customer Entry # (First Entry)',
      'Full Name',
      'Email Address',
      'Age',
      'Number Used (Phone)',
      'Password',
      'Device / Link Used',
      'First Entry Date',
      'Last Active',
      'Total Entries',
      'Status',
      'Days Remaining',
      'Logged Periods',
    ];
    const rows = usersList.map((u, idx) => {
      const st = getTrialStatus(u);
      const custNum = u.customerNumber || idx + 1;
      const phoneUsed = resolveCustomerPhoneUsed(u) || 'Not entered';
      const firstEntryStr =
        u.firstEntryAt || u.createdAt
          ? new Date(u.firstEntryAt || u.createdAt).toLocaleString()
          : 'Recorded';
      const updatedStr =
        u.lastSignInAt || u.lastUpdatedAt
          ? new Date(u.lastSignInAt || u.lastUpdatedAt || '').toLocaleString()
          : firstEntryStr;
      return [
        custNum,
        `"${(u.name || 'Student').replace(/"/g, '""')}"`,
        `"${(u.email || '').replace(/"/g, '""')}"`,
        `"${(u.age || '—').replace(/"/g, '""')}"`,
        `"${phoneUsed.replace(/"/g, '""')}"`,
        `"${(u.password || '—').replace(/"/g, '""')}"`,
        `"${(u.deviceInfo || 'WebApp Link').replace(/"/g, '""')}"`,
        `"${firstEntryStr}"`,
        `"${updatedStr}"`,
        u.signInCount || 1,
        `"${st.status}"`,
        st.daysLeft,
        Array.isArray(u.periods) ? u.periods.length : 0,
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bloomcampus-admin-customer-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(
      `📥 Downloaded Admin Report CSV with all ${usersList.length} customer entries!`,
      'success'
    );
  };

  const handleCopyAllSignupsSummary = () => {
    const lines = [
      `🌸 BloomCampus & Sidratu Clinic — Admin Customer Entry Report (${usersList.length} Total Customers)`,
      `Generated: ${new Date().toLocaleString()}`,
      `-----------------------------------------------------------------------------------`,
      ...usersList.map((u, idx) => {
        const custNum = u.customerNumber || idx + 1;
        const phoneUsed = resolveCustomerPhoneUsed(u) || 'Not entered';
        const firstDate =
          u.firstEntryAt || u.createdAt
            ? new Date(u.firstEntryAt || u.createdAt).toLocaleDateString()
            : 'Synced';
        return `#${custNum} (1st Entry: ${firstDate}) | Name: ${u.name || 'Student'} | Email: ${u.email} | Age: ${u.age || '—'} | Number Used: ${phoneUsed} | Password: ${u.password || '—'}`;
      }),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    showToast(
      `📋 Copied full Admin Report (${usersList.length} customers with Name, Email, Age, Number Used & Password)!`,
      'success'
    );
  };

  const handleManualUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRegisterNewUserByAdmin) return;
    if (!manualUserEmail.trim() || !manualUserPassword.trim()) {
      showToast('Please enter an email and password for the customer entry.', 'warning');
      return;
    }
    onRegisterNewUserByAdmin({
      name: manualUserName.trim() || manualUserEmail.trim().split('@')[0],
      age: manualUserAge.trim() || '21',
      email: manualUserEmail.trim().toLowerCase(),
      phone: manualUserPhone.trim(),
      password: manualUserPassword.trim(),
      originalEmail: editingCustomerOriginalEmail || undefined,
    });
    setEditingCustomerOriginalEmail(null);
    setManualUserName('');
    setManualUserAge('21');
    setManualUserEmail('');
    setManualUserPhone('');
    setManualUserPassword('');
    setShowAddUserForm(false);
  };

  const handleSavePasswords = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminPassInput.trim()) {
      showToast('Admin password must be non-empty.', 'warning');
      return;
    }
    const nextCfg: AdminConfig = {
      ownerEmail: OWNER_ADMIN_EMAIL,
      freeAccessPassword: freePassInput.trim() || DEFAULT_FREE_ACCESS_PASSWORD,
      adminPassword: adminPassInput.trim(),
      additionalAdmins,
      updatedAt: new Date().toISOString(),
    };
    onUpdateAdminConfig(nextCfg);
    showToast('✅ Updated Owner Admin password!', 'success');
  };

  const handleResetDefaultPasswords = () => {
    setFreePassInput(DEFAULT_FREE_ACCESS_PASSWORD);
    setAdminPassInput(DEFAULT_ADMIN_PASSWORD);
    const nextCfg: AdminConfig = {
      ownerEmail: OWNER_ADMIN_EMAIL,
      freeAccessPassword: DEFAULT_FREE_ACCESS_PASSWORD,
      adminPassword: DEFAULT_ADMIN_PASSWORD,
      additionalAdmins,
      updatedAt: new Date().toISOString(),
    };
    onUpdateAdminConfig(nextCfg);
    showToast('🔄 Reset Owner Admin password to default.', 'info');
  };

  const handleAddAdminAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const emailClean = newAdminEmail.trim().toLowerCase();
    const passClean = newAdminPassword.trim();
    const nameClean = newAdminName.trim();

    if (!emailClean || !emailClean.includes('@')) {
      showToast('Please enter a valid admin email address.', 'warning');
      return;
    }
    if (!passClean) {
      showToast('Please enter a password to give to this admin.', 'warning');
      return;
    }
    if (emailClean === OWNER_ADMIN_EMAIL.toLowerCase()) {
      showToast(
        `${OWNER_ADMIN_EMAIL} is the Primary Owner account. Use the Owner Admin Password box to change your password.`,
        'info'
      );
      return;
    }

    const existingIdx = additionalAdmins.findIndex(
      (a) => a.email.trim().toLowerCase() === emailClean
    );
    const updatedList = [...additionalAdmins];
    const newEntry: AdminAccount = {
      email: emailClean,
      password: passClean,
      name: nameClean || emailClean.split('@')[0],
      addedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      updatedList[existingIdx] = newEntry;
    } else {
      updatedList.unshift(newEntry);
    }

    const nextCfg: AdminConfig = {
      ...adminConfig,
      ownerEmail: OWNER_ADMIN_EMAIL,
      additionalAdmins: updatedList,
      updatedAt: new Date().toISOString(),
    };
    onUpdateAdminConfig(nextCfg);
    setNewAdminEmail('');
    setNewAdminPassword('');
    setNewAdminName('');

    showToast(
      existingIdx >= 0
        ? `✅ Updated admin password for ${emailClean}! They can log in with "${passClean}".`
        : `🛡️ Added new admin (${emailClean})! Give them password "${passClean}" to log into the Admin Dashboard.`,
      'success'
    );
  };

  const handleRemoveAdminAccount = (targetEmail: string) => {
    const emailClean = targetEmail.trim().toLowerCase();
    const updatedList = additionalAdmins.filter(
      (a) => a.email.trim().toLowerCase() !== emailClean
    );
    const nextCfg: AdminConfig = {
      ...adminConfig,
      ownerEmail: OWNER_ADMIN_EMAIL,
      additionalAdmins: updatedList,
      updatedAt: new Date().toISOString(),
    };
    onUpdateAdminConfig(nextCfg);
    showToast(`Removed admin access for ${targetEmail}.`, 'info');
  };

  const buildSmsHref = (u: UserData) => {
    const phone = resolveCustomerPhoneUsed(u).replace(/\s+/g, '');
    const expDateStr = u.subscriptionUntil
      ? new Date(u.subscriptionUntil).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '30 days from today';
    const msg = `Hello ${u.name}! 🌸 Your BloomCampus Orange Money payment of Le 30 has been verified and approved by ${CREATOR_NAME}. Your account (${u.email}) is now active for 30 days until ${expDateStr}!`;
    return `sms:${phone}?body=${encodeURIComponent(msg)}`;
  };

  const buildWhatsAppHref = (u: UserData) => {
    const rawPhone = resolveCustomerPhoneUsed(u).replace(/\D/g, '');
    const intlPhone =
      rawPhone.startsWith('0') && rawPhone.length === 9
        ? `232${rawPhone.slice(1)}`
        : rawPhone;
    const expDateStr = u.subscriptionUntil
      ? new Date(u.subscriptionUntil).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '30 days from today';
    const msg = `Hello ${u.name}! 🌸 Your BloomCampus Orange Money payment of Le 30 has been verified and approved by ${CREATOR_NAME}. Your account (${u.email}) is now unlocked and active for 30 days (until ${expDateStr})!`;
    return intlPhone
      ? `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  const buildApprovalEmailHref = (u: UserData) => {
    const expDateStr = u.subscriptionUntil
      ? new Date(u.subscriptionUntil).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        });
    const subject = 'BloomCampus Payment Verified — Your 30-Day Access Pass is Active! 🌸';
    const body =
      `Hello ${u.name},\n\n` +
      `Great news! Your Orange Money payment (Le 30) has been verified and approved by the owner (${CREATOR_NAME}).\n\n` +
      `• Account Email: ${u.email}\n` +
      `• Subscription Status: ACTIVE (30-Day Pass)\n` +
      `• New 30-Day Expiration Date: ${expDateStr}\n\n` +
      `You can now open BloomCampus and enjoy full access to your cycle tracker, mood analytics, clinic summary PDF, and Sidratu skincare planner.\n\n` +
      `Warm regards,\n` +
      `${CREATOR_NAME}\n` +
      `${CREATOR_EMAIL}`;
    return `mailto:${encodeURIComponent(u.email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="min-h-screen bg-cream text-slate-800 flex flex-col">
      {/* Top Admin Header */}
      <header className="sticky top-0 z-40 bg-plum-900 text-white border-b border-gold-500/30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-gold-500 to-magenta-600 flex items-center justify-center text-plum-900 font-extrabold shadow-sm">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-gold-500 text-plum-900">
                  Owner Admin Report Console
                </span>
                <span className="text-xs text-lavender-200 font-mono">{OWNER_ADMIN_EMAIL}</span>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  ● Cross-Phone &amp; Computer Live Sync ({stats.total}{' '}
                  {stats.total === 1 ? 'Customer Entry' : 'Customer Entries'})
                </span>
              </div>
              <h1 className="font-display font-extrabold text-lg sm:text-xl text-white mt-0.5">
                Customer First-Entry Report: Name, Email, Age, Number Used &amp; Password
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onRefreshUsers && (
              <button
                type="button"
                disabled={isSyncingUsers}
                onClick={async () => {
                  setIsSyncingUsers(true);
                  const count = await onRefreshUsers();
                  setIsSyncingUsers(false);
                  showToast(
                    `🔄 Synced all entries across phones & computers! Total customer entries: ${count}.`,
                    'success'
                  );
                }}
                className="px-3.5 py-2.5 rounded-xl bg-gold-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                <RotateCcw className={`w-4 h-4 ${isSyncingUsers ? 'animate-spin' : ''}`} />
                <span>
                  {isSyncingUsers ? 'Syncing Entries...' : `Sync All Entries (${stats.total})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs sm:text-sm border border-white/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Return to App View</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* LIVE POPULATION & TOTAL CUSTOMER ENTRIES HERO BANNER */}
        <section className="rounded-3xl bg-gradient-to-r from-plum-900 via-lavender-900 to-plum-900 text-white p-5 sm:p-6 shadow-lg border-2 border-gold-500/40">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-gold-500/20 border border-gold-500/40 text-gold-400 text-xs font-extrabold uppercase tracking-wider">
                <Users className="w-4 h-4" />
                <span>Cross-Phone &amp; Computer Customer First-Entry Report</span>
              </div>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white">
                {stats.total} {stats.total === 1 ? 'Customer Entry' : 'Customer Entries'} Recorded Across All Links
              </h2>
              <p className="text-xs sm:text-sm text-lavender-100 max-w-2xl">
                Every customer who uses the webapp or shared link on any phone or computer is numbered sequentially by their first entry (<strong>#1, #2, #3...</strong>) with their <strong>Name, Email, Age, Number Used, and Password</strong> shown below.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setEditingCustomerOriginalEmail(null);
                  setManualUserName('');
                  setManualUserAge('21');
                  setManualUserEmail('');
                  setManualUserPhone('');
                  setManualUserPassword('');
                  setShowAddUserForm((prev) => !prev);
                }}
                className="px-4 py-2.5 rounded-2xl bg-gold-500 hover:bg-amber-400 text-plum-900 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{showAddUserForm ? 'Close Entry Form' : 'Add / Fix Customer Entry'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyAllSignupsSummary}
                className="px-3.5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white border border-white/20 font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Copy className="w-4 h-4" />
                <span>Copy Full Report</span>
              </button>

              <button
                type="button"
                onClick={handleExportAllSignupsCsv}
                className="px-3.5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-xs cursor-pointer transition-all"
              >
                <Download className="w-4 h-4" />
                <span>Export CSV ({stats.total})</span>
              </button>
            </div>
          </div>

          {/* 5 KPI Summary Cards Inside Hero */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur-xs rounded-2xl border border-white/15 p-3.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-gold-400 block">
                Total Customer Entries
              </span>
              <span className="font-display font-extrabold text-2xl sm:text-3xl text-white font-mono mt-0.5 block">
                {stats.total}
              </span>
              <span className="text-[11px] text-lavender-200">Numbered #1 to #{stats.total || 1}</span>
            </div>

            <div className="bg-white/10 backdrop-blur-xs rounded-2xl border border-white/15 p-3.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 block">
                Active (Last 7 Days)
              </span>
              <span className="font-display font-extrabold text-2xl sm:text-3xl text-emerald-300 font-mono mt-0.5 block">
                {stats.activeLast7Days}
              </span>
              <span className="text-[11px] text-lavender-200">
                {stats.signedUpToday} new today
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-xs rounded-2xl border border-white/15 p-3.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sage-200 block">
                Active Access Passes
              </span>
              <span className="font-display font-extrabold text-2xl sm:text-3xl text-white font-mono mt-0.5 block">
                {stats.activePaid + stats.freePass}
              </span>
              <span className="text-[11px] text-lavender-200">
                2-Week Free &amp; Verified
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-xs rounded-2xl border border-white/15 p-3.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-orange-300 block">
                Pending Verification
              </span>
              <span className="font-display font-extrabold text-2xl sm:text-3xl text-orange-300 font-mono mt-0.5 block">
                {stats.pending}
              </span>
              <span className="text-[11px] text-lavender-200">
                Orange Money requests
              </span>
            </div>

            <div className="bg-white/10 backdrop-blur-xs rounded-2xl border border-white/15 p-3.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300 block">
                App Usage Activity
              </span>
              <span className="font-display font-extrabold text-xl sm:text-2xl text-white font-mono mt-0.5 block">
                {stats.totalPeriodsLogged} Cycles
              </span>
              <span className="text-[11px] text-lavender-200">
                {stats.totalDailyLogs} mood/symptom logs
              </span>
            </div>
          </div>

          {/* Add or Edit Customer Entry Form */}
          {showAddUserForm && (
            <form
              onSubmit={handleManualUserSubmit}
              className="mt-5 bg-white text-slate-900 rounded-2xl p-4 border-2 border-gold-500 space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display font-extrabold text-sm sm:text-base text-slate-900">
                  {editingCustomerOriginalEmail
                    ? `✏️ Edit / Fix Customer Entry (${editingCustomerOriginalEmail})`
                    : '➕ Register / Fix a Customer Entry Directly (Synced Across All Phones & Computers)'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddUserForm(false);
                    setEditingCustomerOriginalEmail(null);
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Close ✕
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                <div className="lg:col-span-2">
                  <label className="text-[11px] font-extrabold uppercase text-slate-600 block mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualUserName}
                    onChange={(e) => setManualUserName(e.target.value)}
                    placeholder="e.g., Mariama Sesay"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-600 block mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={manualUserEmail}
                    onChange={(e) => setManualUserEmail(e.target.value)}
                    placeholder="student@gmail.com"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-600 block mb-1">
                    Age *
                  </label>
                  <input
                    type="number"
                    required
                    min="10"
                    max="80"
                    value={manualUserAge}
                    onChange={(e) => setManualUserAge(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-600 block mb-1">
                    Number Used (Phone) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={manualUserPhone}
                    onChange={(e) => setManualUserPhone(e.target.value)}
                    placeholder="076 123 456"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-slate-600 block mb-1">
                    Password *
                  </label>
                  <input
                    type="text"
                    required
                    value={manualUserPassword}
                    onChange={(e) => setManualUserPassword(e.target.value)}
                    placeholder="Password..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {editingCustomerOriginalEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCustomerOriginalEmail(null);
                      setShowAddUserForm(false);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-plum-900 hover:bg-lavender-900 text-gold-500 font-extrabold text-xs cursor-pointer"
                >
                  {editingCustomerOriginalEmail
                    ? '💾 Save Updated Customer Entry'
                    : '💾 Save & Sync Customer Entry'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* SECTION 1 (TOP PRIORITY): ADMIN CUSTOMER FIRST-ENTRY REPORT TABLE & CARDS */}
        <section className="bg-white rounded-3xl border-2 border-lavender-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sage-100 text-sage-800 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900">
                    Admin Customer Entries Report — Numbered by First Entry ({stats.total})
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                    Showing {filteredUsers.length} of {stats.total} Customers
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Every customer entry across all phones, computers, and links, numbered by first entry (<strong>#1, #2, #3...</strong>) with <strong>Name, Email, Age, Number Used, and Password</strong>.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSortOrder((prev) =>
                    prev === 'FIRST_ENTRY_ASC' ? 'LATEST_ACTIVE_DESC' : 'FIRST_ENTRY_ASC'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-900 border border-lavender-200 font-bold text-xs cursor-pointer"
              >
                {sortOrder === 'FIRST_ENTRY_ASC'
                  ? '🔢 Ordered by 1st Entry (#1 → #' + Math.max(1, stats.total) + ')'
                  : '🕒 Ordered by Latest Activity'}
              </button>

              <button
                type="button"
                onClick={() => setShowUserPasswords((prev) => !prev)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                {showUserPasswords ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide Passwords</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Show Passwords</span>
                  </>
                )}
              </button>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search #, name, email, phone..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-cream focus:bg-white outline-none"
                />
              </div>

              {(
                [
                  { id: 'ALL', label: `All Entries (${stats.total})` },
                  { id: 'pending_verification', label: `⏳ Pending (${stats.pending})` },
                  { id: 'active', label: `✅ Active (${stats.activePaid + stats.freePass})` },
                  { id: 'expired', label: `🔒 Expired (${stats.expired})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-cream text-slate-600 border border-slate-200 hover:bg-lavender-50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Complete Scannable Customer First-Entry Report Table */}
          {filteredUsers.length > 0 && (
            <div className="mb-5 overflow-x-auto rounded-2xl border-2 border-slate-200 shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-plum-900 text-white font-extrabold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-3">Customer # (1st Entry)</th>
                    <th className="py-3 px-3">Name</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Age</th>
                    <th className="py-3 px-3">Number Used (Phone)</th>
                    {showUserPasswords && <th className="py-3 px-3">Password</th>}
                    <th className="py-3 px-3">First Entry &amp; Device</th>
                    <th className="py-3 px-3">Access Status</th>
                    <th className="py-3 px-3">Fix / Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {filteredUsers.map((u, idx) => {
                    const st = getTrialStatus(u);
                    const custNum = u.customerNumber || idx + 1;
                    const phoneUsed = resolveCustomerPhoneUsed(u);
                    const firstEntryDateStr =
                      u.firstEntryAt || u.createdAt
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
                        {showUserPasswords && (
                          <td className="py-3 px-3 font-mono font-extrabold text-rose-800">
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200">
                              {u.password || '—'}
                            </span>
                          </td>
                        )}
                        <td className="py-3 px-3 text-slate-600 text-[11px]">
                          <div className="font-mono font-semibold text-slate-800">
                            {firstEntryDateStr}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {u.deviceInfo || '📱/💻 WebApp Link'} • {u.signInCount || 1} entry(s)
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
                          <button
                            type="button"
                            onClick={() => handleOpenEditCustomerEntry(u)}
                            className="px-2.5 py-1 rounded-lg bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Detailed Individual Customer Cards with Full Entry Details & Controls */}
          {filteredUsers.length === 0 ? (
            <div className="rounded-2xl bg-cream p-6 text-center text-xs text-slate-500">
              No customer entries match the selected filter. Click &ldquo;Sync All Entries&rdquo; at the top right to refresh from Cloud Firestore.
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredUsers.map((u, idx) => {
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
                      {/* Customer Entry Info & 5 Core Fields */}
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

                        {/* Highlighted 5 Required Fields Grid: Name, Email, Age, Number Used, Password */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 bg-white p-3 rounded-xl border border-slate-200 text-xs">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                              1. Customer Name
                            </span>
                            <span className="font-extrabold text-slate-900">{u.name || 'Student'}</span>
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
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                              5. Password
                            </span>
                            <span className="font-mono font-extrabold text-rose-800">
                              {showUserPasswords ? u.password || '—' : '••••••••'}
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
                            <span>{u.deviceInfo || '📱/💻 WebApp Link'}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              Remaining: <strong>{st.daysLeft} days</strong>
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-semibold">
                            <Activity className="w-3 h-3 text-rose-600" />
                            <span>{periodsCount} Period(s) • {logsCount} Log(s)</span>
                          </span>
                          {appointmentsCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200 text-plum-900 font-semibold">
                              <span>✨ {appointmentsCount} Booking(s)</span>
                            </span>
                          )}
                        </div>

                        {/* Submitted Orange Money Details Box */}
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

                      {/* Admin Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCustomerEntry(u)}
                          className="px-3 py-2.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-extrabold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                          title="Edit or fix customer Name, Email, Age, Number Used, or Password"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Entry</span>
                        </button>

                        {onExtendUserFreeAccess && (
                          <button
                            type="button"
                            onClick={() => onExtendUserFreeAccess(u.email, 14)}
                            className="px-3.5 py-2.5 rounded-xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                            title="Grant or extend 2 weeks (14 days) of free access"
                          >
                            <span>🎁 +14 Days Free</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            onApproveUserPayment(u.email);
                            setLastApprovedUserEmail(u.email);
                            const mailtoUrl = buildApprovalEmailHref(u);
                            const link = document.createElement('a');
                            link.href = mailtoUrl;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className="px-4 py-2.5 rounded-xl bg-sage-600 hover:bg-sage-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approve (+30 Days)</span>
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
                            title="Expire this user's pass to require renewal"
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
                          title="Send WhatsApp confirmation to user's phone"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>

                        <a
                          href={buildSmsHref(u)}
                          className="px-3 py-2.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-bold text-xs flex items-center gap-1.5 transition-all"
                          title="Send SMS confirmation to user's phone"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>SMS</span>
                        </a>

                        <a
                          href={buildApprovalEmailHref(u)}
                          className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 transition-all"
                          title="Send Email confirmation to user"
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
              })}
            </div>
          )}
        </section>

        {/* SECTION 2: ADD & MANAGE ADDITIONAL ADMINS BY EMAIL AND PASSWORD */}
        <section className="bg-white rounded-3xl border-2 border-sage-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sage-100 text-sage-800 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display font-extrabold text-lg text-slate-900">
                    Grant Admin Access to Team Members (See All Customer Entries &amp; User Count)
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-lg bg-sage-100 text-sage-800 text-[11px] font-extrabold">
                    {1 + additionalAdmins.length} Authorized Admin
                    {additionalAdmins.length === 0 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Any admin added below gets full access to view all {stats.total} customer entries, see how many people are in the app in real time, and approve or manage accounts.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleAddAdminAccount}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end bg-sage-50/60 p-4 rounded-2xl border border-sage-200 mb-5"
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
                  Password to Give Them *
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
                placeholder="Enter password for them..."
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

          {/* List of Authorized Admins */}
          <div className="space-y-2.5">
            {/* Primary Owner Row */}
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
                  Password: <strong>{adminConfig.adminPassword}</strong>
                </span>
              </div>
              <span className="text-[11px] font-bold text-slate-500">
                Permanent Super Admin (Full Sign-Up &amp; User Count Access)
              </span>
            </div>

            {/* Added Co-Admins */}
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
        </section>

        {/* SECTION 3: MANAGE OWNER ADMIN PASSWORD */}
        <section className="bg-white rounded-3xl border border-lavender-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-lavender-100 text-lavender-800 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-lg text-slate-900">
                  Manage Owner Admin Password
                </h2>
                <p className="text-xs text-slate-600">
                  Every new user automatically receives <strong>2 weeks (14 days) of free access</strong> without needing any promo code. Manage your Owner Admin password below.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetDefaultPasswords}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Owner Password</span>
            </button>
          </div>

          <form onSubmit={handleSavePasswords} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="bg-cream rounded-2xl p-3.5 border border-slate-200">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 block mb-1">
                Owner Admin Password ({OWNER_ADMIN_EMAIL})
              </label>
              <input
                type="password"
                value={adminPassInput}
                onChange={(e) => setAdminPassInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white font-mono font-extrabold text-sm text-slate-900 outline-none focus:border-lavender-700"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Primary Owner Admin Password
              </span>
            </div>

            <button
              type="submit"
              className="py-3.5 px-5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
            >
              💾 Save &amp; Update Owner Password
            </button>
          </form>
        </section>

        {/* SECTION 4: OWNER EMAIL ALERTS & SUPPORT INQUIRIES LOG */}
        <section className="bg-white rounded-3xl border border-lavender-200 p-5 sm:p-6 shadow-xs">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-lavender-700" />
              <h2 className="font-display font-extrabold text-lg text-slate-900">
                Payment &amp; Support Notifications Sent to {OWNER_ADMIN_EMAIL} (
                {supportInquiries.length})
              </h2>
            </div>
          </div>

          {supportInquiries.length === 0 ? (
            <p className="text-xs text-slate-500 italic bg-cream rounded-2xl p-4 border border-slate-200">
              No payment or support inquiries logged yet. Whenever a student submits an Orange Money payment or support inquiry, it appears here and triggers an email alert to {OWNER_ADMIN_EMAIL}.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {supportInquiries.slice(0, 10).map((inq) => (
                <div
                  key={inq.id}
                  className="rounded-2xl bg-cream p-3.5 border border-slate-200 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded-md font-extrabold uppercase text-[10px] ${
                        inq.type === 'payment'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-lavender-100 text-lavender-800'
                      }`}
                    >
                      {inq.type === 'payment' ? '🟧 Payment Alert' : '💬 Support Inquiry'}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {new Date(inq.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-bold text-slate-900">{inq.subject}</div>
                  <div className="text-slate-600">
                    From: <strong>{inq.userName}</strong> ({inq.userEmail}{' '}
                    {inq.userPhone ? `· ${inq.userPhone}` : ''})
                  </div>
                  <p className="text-slate-700 bg-white p-2.5 rounded-xl border border-slate-100 whitespace-pre-line">
                    {inq.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Admin Footer with Creator Branding */}
      <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-600">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="font-extrabold text-slate-900">
            Created by {CREATOR_NAME}
          </span>
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
