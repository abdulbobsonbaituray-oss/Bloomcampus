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

interface OwnerAdminDashboardProps {
  usersMap: Record<string, UserData>;
  adminConfig: AdminConfig;
  supportInquiries: SupportInquiry[];
  onUpdateAdminConfig: (nextConfig: AdminConfig) => void;
  onApproveUserPayment: (email: string) => void;
  onRejectOrExpireUser: (email: string, mode: 'reject' | 'expire') => void;
  onExitAdmin: () => void;
  showToast: (msg: string, type?: 'success' | 'warning' | 'info') => void;
}

export const OwnerAdminDashboard: React.FC<OwnerAdminDashboardProps> = ({
  usersMap,
  adminConfig,
  supportInquiries,
  onUpdateAdminConfig,
  onApproveUserPayment,
  onRejectOrExpireUser,
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
  const [lastApprovedUserEmail, setLastApprovedUserEmail] = useState<string | null>(null);

  const additionalAdmins: AdminAccount[] = useMemo(
    () => (Array.isArray(adminConfig.additionalAdmins) ? adminConfig.additionalAdmins : []),
    [adminConfig.additionalAdmins]
  );

  const usersList = useMemo(() => {
    const entries = Object.values(usersMap || {});
    return entries.sort((a, b) => {
      const aPending =
        a.subscriptionStatus === 'pending_verification' ||
        a.pendingPayment?.status === 'pending'
          ? 1
          : 0;
      const bPending =
        b.subscriptionStatus === 'pending_verification' ||
        b.pendingPayment?.status === 'pending'
          ? 1
          : 0;
      if (aPending !== bPending) return bPending - aPending;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [usersMap]);

  const stats = useMemo(() => {
    let pending = 0;
    let activePaid = 0;
    let freePass = 0;
    let expired = 0;

    usersList.forEach((u) => {
      const st = getTrialStatus(u);
      if (st.status === 'pending_verification') pending += 1;
      else if (st.status === 'free_password') freePass += 1;
      else if (st.status === 'expired') expired += 1;
      else activePaid += 1;
    });

    return {
      total: usersList.length,
      pending,
      activePaid,
      freePass,
      expired,
    };
  }, [usersList]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const st = getTrialStatus(u);
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'active' && st.status !== 'subscribed' && st.status !== 'trial') {
          return false;
        }
        if (
          statusFilter !== 'active' &&
          st.status !== statusFilter
        ) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (u.name || '').toLowerCase().includes(q);
        const matchEmail = (u.email || '').toLowerCase().includes(q);
        const matchPhone = (u.phone || u.pendingPayment?.senderPhone || '')
          .toLowerCase()
          .includes(q);
        const matchTx = (u.pendingPayment?.transactionId || '').toLowerCase().includes(q);
        return matchName || matchEmail || matchPhone || matchTx;
      }
      return true;
    });
  }, [usersList, statusFilter, searchQuery]);

  const handleSavePasswords = (e: React.FormEvent) => {
    e.preventDefault();
    if (!freePassInput.trim() || !adminPassInput.trim()) {
      showToast('Both passwords must be non-empty.', 'warning');
      return;
    }
    const nextCfg: AdminConfig = {
      ownerEmail: OWNER_ADMIN_EMAIL,
      freeAccessPassword: freePassInput.trim(),
      adminPassword: adminPassInput.trim(),
      additionalAdmins,
      updatedAt: new Date().toISOString(),
    };
    onUpdateAdminConfig(nextCfg);
    showToast(
      `✅ Updated passwords! Active Free 30-Day Password is now "${nextCfg.freeAccessPassword}".`,
      'success'
    );
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
    showToast(
      `🔄 Reset to defaults: Free Access Password = "${DEFAULT_FREE_ACCESS_PASSWORD}", Admin Password = "${DEFAULT_ADMIN_PASSWORD}".`,
      'info'
    );
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
        `${OWNER_ADMIN_EMAIL} is the Primary Owner account. Use the Owner Admin Password box above to change your password.`,
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
    const phone = (u.phone || u.pendingPayment?.senderPhone || '').replace(/\s+/g, '');
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
    const rawPhone = (u.phone || u.pendingPayment?.senderPhone || '').replace(/\D/g, '');
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
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-gold-500 text-plum-900">
                  Owner Admin Console
                </span>
                <span className="text-xs text-lavender-200 font-mono">{OWNER_ADMIN_EMAIL}</span>
              </div>
              <h1 className="font-display font-extrabold text-lg sm:text-xl text-white mt-0.5">
                BloomCampus Subscription &amp; Access Control Dashboard
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden md:inline-block text-xs font-bold text-gold-500">
              Created by {CREATOR_NAME}
            </span>
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white font-extrabold text-xs sm:text-sm border border-white/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Return to App / Log Out Admin</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-lavender-200 p-4 shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block">
              Total Registered Users
            </span>
            <span className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 font-mono mt-1 block">
              {stats.total}
            </span>
            <span className="text-xs text-slate-500">All student accounts</span>
          </div>

          <div className="bg-orange-50 rounded-2xl border-2 border-orange-300 p-4 shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-800 block">
              Pending Verification
            </span>
            <span className="font-display font-extrabold text-2xl sm:text-3xl text-orange-600 font-mono mt-1 block">
              {stats.pending}
            </span>
            <span className="text-xs text-orange-800 font-semibold">
              Awaiting Orange Money approval
            </span>
          </div>

          <div className="bg-sage-50 rounded-2xl border border-sage-200 p-4 shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-sage-800 block">
              Active 30-Day Passes
            </span>
            <span className="font-display font-extrabold text-2xl sm:text-3xl text-sage-800 font-mono mt-1 block">
              {stats.activePaid + stats.freePass}
            </span>
            <span className="text-xs text-sage-700">
              {stats.activePaid} Paid · {stats.freePass} Free Password
            </span>
          </div>

          <div className="bg-rose-50 rounded-2xl border border-rose-200 p-4 shadow-2xs">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-800 block">
              Expired / Locked Accounts
            </span>
            <span className="font-display font-extrabold text-2xl sm:text-3xl text-rose-700 font-mono mt-1 block">
              {stats.expired}
            </span>
            <span className="text-xs text-rose-700">Requires renewal or password</span>
          </div>
        </div>

        {/* SECTION 1: MANAGE FREE 30-DAY ACCESS PASSWORD & ADMIN PASSWORD */}
        <section className="bg-white rounded-3xl border-2 border-lavender-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-lavender-100 text-lavender-800 flex items-center justify-center">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-lg text-slate-900">
                  Manage Free 30-Day Access Password &amp; Owner Admin Password
                </h2>
                <p className="text-xs text-slate-600">
                  Students who enter the active Free 30-Day Access Password unlock the app immediately for 30 days, after which it locks again for renewal.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetDefaultPasswords}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 self-start md:self-auto cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults (Bobson@565)</span>
            </button>
          </div>

          <form onSubmit={handleSavePasswords} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="bg-lavender-50/70 rounded-2xl p-3.5 border border-lavender-200">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-extrabold uppercase tracking-wider text-lavender-900">
                  Active Free 30-Day Access Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(adminConfig.freeAccessPassword);
                    showToast(`Copied Free Access Password: ${adminConfig.freeAccessPassword}`, 'info');
                  }}
                  className="text-[11px] font-bold text-lavender-700 hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copy</span>
                </button>
              </div>
              <input
                type="text"
                value={freePassInput}
                onChange={(e) => setFreePassInput(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-lavender-300 bg-white font-mono font-extrabold text-sm text-slate-900 outline-none focus:border-lavender-700"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Default: <strong>Bobson@565</strong> (Unlocks 30 days)
              </span>
            </div>

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
                Default: <strong>@Haizen565.</strong>
              </span>
            </div>

            <button
              type="submit"
              className="py-3.5 px-5 rounded-2xl bg-lavender-700 hover:bg-lavender-900 text-white font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer"
            >
              💾 Save &amp; Update Passwords
            </button>
          </form>
        </section>

        {/* SECTION 1B: ADD & MANAGE ADDITIONAL ADMINS BY EMAIL AND PASSWORD */}
        <section className="bg-white rounded-3xl border-2 border-sage-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sage-100 text-sage-800 flex items-center justify-center">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display font-extrabold text-lg text-slate-900">
                    Add Admin by Email &amp; Password
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-lg bg-sage-100 text-sage-800 text-[11px] font-extrabold">
                    {1 + additionalAdmins.length} Active Admin{additionalAdmins.length === 0 ? '' : 's'}
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Create admin credentials (email + password you assign to them) so trusted team members can log into this Admin Dashboard via the regular login screen or the Owner/Admin Login button.
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
                Permanent Super Admin
              </span>
            </div>

            {/* Added Co-Admins */}
            {additionalAdmins.map((adm) => {
              const shareText = `Hello ${adm.name || 'Admin'}! You have been granted Admin Dashboard access on BloomCampus & Sidratu Clinic.\n• Admin Login Email: ${adm.email}\n• Admin Password: ${adm.password}\nClick "Owner / Admin Login" to sign in.`;
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
                      <span>Copy Details to Give Them</span>
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

        {/* SECTION 2: ALL USERS & ORANGE MONEY PAYMENT VERIFICATION TABLE */}
        <section className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-sage-100 text-sage-800 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display font-extrabold text-lg text-slate-900">
                  Users, 30-Day Subscriptions &amp; Orange Money Verification
                </h2>
                <p className="text-xs text-slate-600">
                  Review submitted Orange Money transactions, approve to unlock 30 days + trigger Email/SMS/WhatsApp confirmations, or expire/reject passes.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, email, phone, Tx ID..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-cream focus:bg-white outline-none"
                />
              </div>

              {(
                [
                  { id: 'ALL', label: `All (${stats.total})` },
                  { id: 'pending_verification', label: `⏳ Pending (${stats.pending})` },
                  { id: 'active', label: `✅ Active (${stats.activePaid})` },
                  { id: 'free_password', label: `🔑 Free Pass (${stats.freePass})` },
                  { id: 'expired', label: `🔒 Expired (${stats.expired})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
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

          {filteredUsers.length === 0 ? (
            <div className="rounded-2xl bg-cream p-6 text-center text-xs text-slate-500">
              No users match the selected filter.
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredUsers.map((u) => {
                const st = getTrialStatus(u);
                const phoneDisplay = u.phone || u.pendingPayment?.senderPhone || 'Not provided';
                const hasPending =
                  st.status === 'pending_verification' || u.pendingPayment?.status === 'pending';
                const isRecentlyApproved = lastApprovedUserEmail === u.email;

                let statusBadge = (
                  <span className="px-2.5 py-1 rounded-lg bg-sage-100 text-sage-800 text-xs font-extrabold">
                    ✅ Active ({st.daysLeft}d left)
                  </span>
                );
                if (st.status === 'pending_verification') {
                  statusBadge = (
                    <span className="px-2.5 py-1 rounded-lg bg-orange-100 text-orange-800 border border-orange-300 text-xs font-extrabold">
                      ⏳ Pending Verification
                    </span>
                  );
                } else if (st.status === 'free_password') {
                  statusBadge = (
                    <span className="px-2.5 py-1 rounded-lg bg-lavender-100 text-lavender-900 border border-lavender-300 text-xs font-extrabold">
                      🔑 Free Password User ({st.daysLeft}d left)
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
                    className={`rounded-2xl p-4 border transition-all ${
                      hasPending
                        ? 'bg-orange-50/70 border-2 border-orange-400 shadow-xs'
                        : isRecentlyApproved
                        ? 'bg-sage-50/80 border-2 border-sage-500'
                        : 'bg-cream/60 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* User Info & Contact Details */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display font-extrabold text-base text-slate-900">
                            {u.name || 'Student'}
                          </span>
                          {u.age && (
                            <span className="text-xs font-bold text-slate-500">
                              (Age {u.age})
                            </span>
                          )}
                          {statusBadge}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Mail className="w-3.5 h-3.5 text-lavender-700" />
                            <span>{u.email}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 font-semibold">
                            <Phone className="w-3.5 h-3.5 text-sage-700" />
                            <span>Phone: {phoneDisplay}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              Remaining: <strong>{st.daysLeft} days</strong>
                              {u.subscriptionUntil
                                ? ` (Expires ${new Date(u.subscriptionUntil).toLocaleDateString()})`
                                : ''}
                            </span>
                          </span>
                        </div>

                        {/* Submitted Orange Money Details Box */}
                        {u.pendingPayment && (
                          <div className="mt-2 p-3 rounded-xl bg-white border border-orange-200 text-xs space-y-1">
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
                          onClick={() => {
                            onApproveUserPayment(u.email);
                            setLastApprovedUserEmail(u.email);
                            // Trigger automated email notification to the user
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
                            title="Expire this user's 30-day pass to require renewal"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>Expire / Lock</span>
                          </button>
                        )}

                        {/* Pre-filled SMS / WhatsApp / Email Confirmation Quick Actions */}
                        <a
                          href={buildWhatsAppHref(u)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all"
                          title="Send WhatsApp confirmation to user's phone"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>WhatsApp Confirm</span>
                        </a>

                        <a
                          href={buildSmsHref(u)}
                          className="px-3 py-2.5 rounded-xl bg-lavender-100 hover:bg-lavender-200 text-lavender-900 font-bold text-xs flex items-center gap-1.5 transition-all"
                          title="Send SMS confirmation to user's phone"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Send SMS</span>
                        </a>

                        <a
                          href={buildApprovalEmailHref(u)}
                          className="px-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs flex items-center gap-1 transition-all"
                          title="Send Email confirmation to user"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Email</span>
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* SECTION 3: OWNER EMAIL ALERTS & SUPPORT INQUIRIES LOG */}
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
