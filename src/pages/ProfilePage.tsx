import { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  Wallet,
  TrendingUp,
  ShoppingBag,
  ShieldCheck,
  Copy,
  Check,
  History,
  Activity,
  Lock,
  LogOut,
  AlertCircle,
  CheckCircle2,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import {
  evaluatePasswordStrength,
  formatBangkokDate,
  formatBangkokTimestamp,
  formatThbFromSatang,
} from '../lib/format';
import { useAuth, UserProfile } from '../context/AuthContext';
import { useTranslation } from '../context/I18nContext';
import { GlassCard } from '../components/GlassCard';
import { StatusBadge } from '../components/StatusBadge';
import { ResilientImage } from '../components/ResilientImage';
import { AppRoute } from '../components/Navbar';

export type ProfileTab = 'purchases' | 'activity' | 'security';

interface ProfilePageProps {
  initialTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  onNavigate: (route: AppRoute, query?: string) => void;
}

interface DeliveredAccountEntry {
  username: string;
  password: string;
  note?: string;
}

interface PurchaseRow {
  id: string;
  productNameSnapshot: string;
  productImageSnapshot: string;
  quantity: number;
  unitPriceSatang: number;
  totalSatang: number;
  robloxUsername: string;
  deliveredAccountUsername?: string | null;
  deliveredAccountPassword?: string | null;
  deliveredAccounts?: DeliveredAccountEntry[];
  status: string;
  adminDeliveryNote: string | null;
  createdAt: string;
}

interface ActivityRow {
  id: number;
  eventType: string;
  status: string;
  deltaSatang: number | null;
  balanceBeforeSatang: number | null;
  balanceAfterSatang: number | null;
  maskedIp: string;
  deviceSummary: string;
  metadata: string | null;
  createdAt: string;
}

interface SessionRow {
  id: string;
  userAgent: string;
  maskedIp: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export function ProfilePage({ initialTab, onTabChange, onNavigate }: ProfilePageProps) {
  const { locale, t } = useTranslation();
  const {
    user,
    loading: authLoading,
    activeSessionsCount,
    hasAdminAccount,
    requiresAdminSecret,
    refreshBalance,
    refreshUser,
    applyAuthSession,
  } = useAuth();

  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [purchaseFilter, setPurchaseFilter] = useState('ALL');
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [purchaseTotalPages, setPurchaseTotalPages] = useState(1);
  const [purchasesLoading, setPurchasesLoading] = useState(false);

  const [activityFilter, setActivityFilter] = useState('ALL');
  const [activityPage, setActivityPage] = useState(1);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  // Session revocation state
  const [sessionMsg, setSessionMsg] = useState('');

  // First-run Admin Claim State
  const [adminSecret, setAdminSecret] = useState('');
  const [adminClaimError, setAdminClaimError] = useState('');
  const [adminClaiming, setAdminClaiming] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Always fetch live balance from /api/user/balance when visiting /profile
  useEffect(() => {
    if (user) {
      void refreshBalance();
    }
  }, [user?.id, refreshBalance]);

  const loadPurchases = useCallback(async () => {
    if (!user) return;
    setPurchasesLoading(true);
    try {
      const res = await apiFetch<{
        items: PurchaseRow[];
        totalPages: number;
      }>(`/api/user/purchases?status=${purchaseFilter}&page=${purchasePage}`);
      setPurchases(res.items);
      setPurchaseTotalPages(res.totalPages);
    } catch {
      setPurchases([]);
    } finally {
      setPurchasesLoading(false);
    }
  }, [user, purchaseFilter, purchasePage]);

  const loadActivities = useCallback(async () => {
    if (!user) return;
    setActivitiesLoading(true);
    try {
      const res = await apiFetch<{
        items: ActivityRow[];
        totalPages: number;
      }>(`/api/user/activity?filter=${activityFilter}&page=${activityPage}`);
      setActivities(res.items);
      setActivityTotalPages(res.totalPages);
    } catch {
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }, [user, activityFilter, activityPage]);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setSessionsLoading(true);
    try {
      const res = await apiFetch<{ sessions: SessionRow[] }>('/api/user/sessions');
      setSessions(res.sessions);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (tab === 'purchases') void loadPurchases();
    else if (tab === 'activity') void loadActivities();
    else if (tab === 'security') void loadSessions();
  }, [tab, user, loadPurchases, loadActivities, loadSessions]);

  const handleSelectTab = (next: ProfileTab) => {
    setTab(next);
    onTabChange(next);
  };

  const handleCopyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    const strength = evaluatePasswordStrength(newPassword);
    if (!strength.isValid) {
      setPwError(t('auth.newPasswordPlaceholder'));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwError(t('auth.passwordMismatch'));
      return;
    }

    setPwLoading(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: {
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
        },
      });
      setPwSuccess(t('profile.passwordUpdated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      await Promise.all([loadSessions(), refreshBalance()]);
    } catch (err) {
      setPwError(err instanceof ApiError ? err.message : 'Unable to update password.');
    } finally {
      setPwLoading(false);
    }
  };

  const handleLogoutOtherDevices = async () => {
    setSessionMsg('');
    try {
      await apiFetch('/api/auth/logout-all', {
        method: 'POST',
        body: { keepCurrent: true },
      });
      setSessionMsg(t('profile.logoutAllSuccess'));
      await Promise.all([loadSessions(), refreshBalance()]);
    } catch (err) {
      setSessionMsg(err instanceof ApiError ? err.message : 'Unable to revoke sessions.');
    }
  };

  const handleClaimAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setAdminClaimError('');
    setAdminClaiming(true);
    try {
      const res = await apiFetch<{ user: UserProfile; accessToken: string }>(
        '/api/auth/claim-admin',
        {
          method: 'POST',
          body: { secret: adminSecret },
        }
      );
      applyAuthSession(res.user, res.accessToken);
      await refreshUser();
      onNavigate('admin');
    } catch (err) {
      setAdminClaimError(err instanceof ApiError ? err.message : 'Unable to claim admin role.');
    } finally {
      setAdminClaiming(false);
    }
  };

  if (authLoading) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-pulse">
          <div className="lg:col-span-6 h-48 glass-surface rounded-xl" />
          <div className="lg:col-span-6 grid grid-cols-3 gap-4">
            <div className="h-48 glass-surface rounded-xl" />
            <div className="h-48 glass-surface rounded-xl" />
            <div className="h-48 glass-surface rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16">
        <GlassCard elevated className="p-8 text-center space-y-4">
          <Lock className="w-7 h-7 text-[#3B82F6] mx-auto" strokeWidth={1.5} />
          <h1 className="text-xl font-semibold text-[#F1F5F9]">{t('profile.title')}</h1>
          <p className="text-sm text-[#94A3B8]">{t('auth.signInSubtitle')}</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg cursor-pointer"
            >
              {t('nav.signIn')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="px-5 py-2.5 text-sm font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 hover:bg-white/6 rounded-lg cursor-pointer"
            >
              {t('nav.createAccount')}
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-8">
      {/* Top Bento Grid: Wallet & Account Overview */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Main Balance & Quick Top-Up Tile */}
        <GlassCard elevated className="lg:col-span-6 p-6 flex flex-col justify-between gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-semibold text-[#F1F5F9]">
                  {user.username}
                </h1>
                {(user.role === 'ADMIN' || user.role === 'OWNER') && (
                  <span
                    className={`text-[11px] font-tabular font-medium px-2 py-0.5 rounded border ${
                      user.role === 'OWNER'
                        ? 'bg-[#3B82F6]/25 border-[#60A5FA]/60 text-white'
                        : 'bg-[#3B82F6]/20 border-[#3B82F6]/40 text-[#60A5FA]'
                    }`}
                  >
                    {user.role}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8]">
                {user.email} <span aria-hidden="true">·</span> {t('profile.memberSince')}{' '}
                {formatBangkokDate(user.createdAt, locale)}
              </p>
            </div>

            {(user.role === 'ADMIN' || user.role === 'OWNER') && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#60A5FA] border border-[#3B82F6]/35 bg-[#3B82F6]/10 hover:bg-[#3B82F6]/20 rounded-lg transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>{t('profile.openAdmin')}</span>
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-[#E2E8F0]/12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs text-[#94A3B8] mb-1">{t('profile.currentBalance')}</p>
              <p className="font-tabular text-3xl sm:text-4xl font-semibold text-[#F1F5F9] tracking-tight">
                {user.isInfiniteBalance
                  ? '∞ ฿'
                  : formatThbFromSatang(user.balanceSatang)}
              </p>
              {user.isInfiniteBalance && (
                <p className="text-xs font-medium text-[#60A5FA] mt-1">
                  {t('shop.ownerInfinite')}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigate('topup')}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              <Wallet className="w-4 h-4" strokeWidth={1.5} />
              <span>{t('profile.topUpButton')}</span>
            </button>
          </div>
        </GlassCard>

        {/* Compact Stat Tiles */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <GlassCard className="p-5 flex flex-col justify-between gap-4">
            <TrendingUp className="w-5 h-5 text-[#10B981]" strokeWidth={1.5} />
            <div>
              <p className="text-xs text-[#94A3B8] mb-1">{t('profile.totalToppedUp')}</p>
              <p className="font-tabular text-xl font-semibold text-[#F1F5F9]">
                {formatThbFromSatang(user.totalToppedUpSatang)}
              </p>
            </div>
          </GlassCard>

          <GlassCard className="p-5 flex flex-col justify-between gap-4">
            <ShoppingBag className="w-5 h-5 text-[#60A5FA]" strokeWidth={1.5} />
            <div>
              <p className="text-xs text-[#94A3B8] mb-1">{t('profile.totalSpent')}</p>
              <p className="font-tabular text-xl font-semibold text-[#F1F5F9]">
                {formatThbFromSatang(user.totalSpentSatang)}
              </p>
            </div>
          </GlassCard>

          <GlassCard className="p-5 flex flex-col justify-between gap-4">
            <ShieldCheck className="w-5 h-5 text-[#E2E8F0]" strokeWidth={1.5} />
            <div>
              <p className="text-xs text-[#94A3B8] mb-1">{t('profile.securityStatus')}</p>
              <p className="font-tabular text-xl font-semibold text-[#F1F5F9]">
                {activeSessionsCount}
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                {t('profile.activeSessionsCount')}
              </p>
            </div>
          </GlassCard>
        </div>
      </section>

      {/* Full-Width Tabbed History & Security Panel */}
      <GlassCard elevated className="overflow-hidden">
        {/* Tabs Header */}
        <div className="px-4 sm:px-6 pt-4 border-b border-[#E2E8F0]/12 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'purchases' as ProfileTab, label: t('profile.tabPurchases'), Icon: History },
            { id: 'activity' as ProfileTab, label: t('profile.tabActivity'), Icon: Activity },
            { id: 'security' as ProfileTab, label: t('profile.tabSecurity'), Icon: Lock },
          ].map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-[#3B82F6] text-white'
                    : 'border-transparent text-[#94A3B8] hover:text-[#E2E8F0]'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-5 sm:p-6">
          {/* TAB 1: PURCHASE HISTORY */}
          {tab === 'purchases' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'ALL', label: t('profile.filterAll') },
                  { key: 'PENDING_DELIVERY', label: t('profile.filterPending') },
                  { key: 'DELIVERED', label: t('profile.filterDelivered') },
                  { key: 'REFUNDED', label: t('profile.filterRefunded') },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setPurchaseFilter(f.key);
                      setPurchasePage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      purchaseFilter === f.key
                        ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                        : 'bg-[#060913]/60 border-[#E2E8F0]/12 text-[#94A3B8] hover:text-[#F1F5F9]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {purchasesLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-16 rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : purchases.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#94A3B8]">
                  {t('profile.noPurchases')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[740px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0]/12 text-[11px] uppercase tracking-wider text-[#94A3B8]">
                        <th className="py-3 pr-4 font-medium">{t('profile.colOrderId')}</th>
                        <th className="py-3 pr-4 font-medium">{t('profile.colProduct')}</th>
                        <th className="py-3 pr-4 font-medium">{t('profile.colQtyTotal')}</th>
                        <th className="py-3 pr-4 font-medium">{t('profile.colStatus')}</th>
                        <th className="py-3 pr-4 font-medium">{t('shop.deliveredAccountTitle')}</th>
                        <th className="py-3 font-medium text-right">{t('profile.colTime')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]/10 text-xs">
                      {purchases.map((row) => {
                        const deliveredList: DeliveredAccountEntry[] =
                          row.deliveredAccounts && row.deliveredAccounts.length > 0
                            ? row.deliveredAccounts
                            : row.deliveredAccountUsername
                            ? [
                                {
                                  username: row.deliveredAccountUsername,
                                  password: row.deliveredAccountPassword || '',
                                },
                              ]
                            : [];
                        return (
                          <tr key={row.id} className="hover:bg-white/[0.02]">
                            <td className="py-3.5 pr-4 whitespace-nowrap align-top">
                              <button
                                type="button"
                                onClick={() => void handleCopyId(row.id)}
                                title={t('profile.copyOrderId')}
                                className="inline-flex items-center gap-1.5 font-tabular text-[#60A5FA] hover:text-white cursor-pointer"
                              >
                                <span>{row.id}</span>
                                {copiedId === row.id ? (
                                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5 opacity-70" />
                                )}
                              </button>
                            </td>
                            <td className="py-3.5 pr-4 align-top">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-md overflow-hidden bg-[#060913] shrink-0 p-1">
                                  <ResilientImage
                                    src={row.productImageSnapshot}
                                    alt={row.productNameSnapshot}
                                    fallbackTitle={row.productNameSnapshot}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                                <span className="font-medium text-[#F1F5F9]">
                                  {row.productNameSnapshot}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 pr-4 whitespace-nowrap font-tabular align-top">
                              <span className="text-[#94A3B8]">×{row.quantity} · </span>
                              <span className="text-[#F1F5F9] font-medium">
                                {formatThbFromSatang(row.totalSatang)}
                              </span>
                            </td>
                            <td className="py-3.5 pr-4 align-top">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="py-3.5 pr-4 text-[#94A3B8] align-top">
                              {deliveredList.length > 0 ? (
                                <div className="space-y-1.5 min-w-[210px]">
                                  {deliveredList.map((acc, idx) => {
                                    const uKey = `${row.id}-${idx}-u`;
                                    return (
                                      <div
                                        key={uKey}
                                        className="space-y-1 font-tabular text-[11px] bg-[#3B82F6]/10 border border-[#3B82F6]/25 rounded-md px-2.5 py-1.5"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="truncate">
                                            {t('shop.accountUsername')}:{' '}
                                            <strong className="text-[#F1F5F9]">
                                              {acc.username}
                                            </strong>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => void handleCopyId(acc.username)}
                                            className="text-[#60A5FA] hover:text-white cursor-pointer shrink-0"
                                            title="Copy username"
                                          >
                                            {copiedId === acc.username ? (
                                              <Check className="w-3 h-3 text-[#10B981]" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                          </button>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="truncate">
                                            {t('shop.accountPassword')}:{' '}
                                            <strong className="text-[#F1F5F9]">
                                              {acc.password || '—'}
                                            </strong>
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => void handleCopyId(acc.password)}
                                            className="text-[#60A5FA] hover:text-white cursor-pointer shrink-0"
                                            title="Copy password"
                                          >
                                            {copiedId === acc.password ? (
                                              <Check className="w-3 h-3 text-[#10B981]" />
                                            ) : (
                                              <Copy className="w-3 h-3" />
                                            )}
                                          </button>
                                        </div>
                                        {acc.note && (
                                          <p className="text-[10px] text-[#94A3B8] truncate">
                                            {acc.note}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="max-w-[200px] truncate block">
                                  {row.adminDeliveryNote || '—'}
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 text-right font-tabular text-[#94A3B8] whitespace-nowrap align-top">
                              {formatBangkokTimestamp(row.createdAt, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {purchaseTotalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]/10 text-xs">
                  <span className="text-[#94A3B8] font-tabular">
                    {t('profile.page')} {purchasePage} / {purchaseTotalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={purchasePage <= 1}
                      onClick={() => setPurchasePage((p) => p - 1)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F0]/14 text-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{t('profile.prev')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={purchasePage >= purchaseTotalPages}
                      onClick={() => setPurchasePage((p) => p + 1)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F0]/14 text-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                    >
                      <span>{t('profile.next')}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVITY HISTORY */}
          {tab === 'activity' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { key: 'ALL', label: t('profile.filterAll') },
                  { key: 'TOPUPS', label: t('profile.filterTopups') },
                  { key: 'PURCHASES', label: t('profile.filterPurchases') },
                  { key: 'SECURITY', label: t('profile.filterSecurity') },
                ].map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => {
                      setActivityFilter(f.key);
                      setActivityPage(1);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
                      activityFilter === f.key
                        ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                        : 'bg-[#060913]/60 border-[#E2E8F0]/12 text-[#94A3B8] hover:text-[#F1F5F9]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {activitiesLoading ? (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-14 rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : activities.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#94A3B8]">
                  {t('profile.noActivity')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="border-b border-[#E2E8F0]/12 text-[11px] uppercase tracking-wider text-[#94A3B8]">
                        <th className="py-3 pr-4 font-medium">{t('profile.colEvent')}</th>
                        <th className="py-3 pr-4 font-medium">{t('profile.colDelta')}</th>
                        <th className="py-3 pr-4 font-medium">{t('profile.colDevice')}</th>
                        <th className="py-3 pr-4 font-medium">{t('profile.colStatus')}</th>
                        <th className="py-3 font-medium text-right">{t('profile.colTime')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]/10 text-xs">
                      {activities.map((row) => (
                        <tr key={row.id} className="hover:bg-white/[0.02]">
                          <td className="py-3.5 pr-4">
                            <p className="font-medium text-[#F1F5F9]">
                              {t(`events.${row.eventType}`)}
                            </p>
                            {row.metadata && (
                              <p className="text-[11px] text-[#94A3B8] mt-0.5 max-w-xs truncate">
                                {row.metadata}
                              </p>
                            )}
                          </td>
                          <td className="py-3.5 pr-4 font-tabular whitespace-nowrap">
                            {row.deltaSatang !== null ? (
                              <div className="space-y-0.5">
                                <p
                                  className={`font-semibold ${
                                    row.deltaSatang > 0
                                      ? 'text-[#10B981]'
                                      : row.deltaSatang < 0
                                      ? 'text-[#EF4444]'
                                      : 'text-[#94A3B8]'
                                  }`}
                                >
                                  {formatThbFromSatang(row.deltaSatang, true)}
                                </p>
                                {row.balanceBeforeSatang !== null &&
                                  row.balanceAfterSatang !== null && (
                                    <p className="text-[11px] text-[#64748B]">
                                      {formatThbFromSatang(row.balanceBeforeSatang)} →{' '}
                                      {formatThbFromSatang(row.balanceAfterSatang)}
                                    </p>
                                  )}
                              </div>
                            ) : (
                              <span className="text-[#64748B]">—</span>
                            )}
                          </td>
                          <td className="py-3.5 pr-4 text-[#94A3B8]">
                            <p className="text-[#E2E8F0]">{row.deviceSummary}</p>
                            <p className="font-tabular text-[11px] text-[#64748B]">
                              {row.maskedIp}
                            </p>
                          </td>
                          <td className="py-3.5 pr-4">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="py-3.5 text-right font-tabular text-[#94A3B8] whitespace-nowrap">
                            {formatBangkokTimestamp(row.createdAt, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activityTotalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]/10 text-xs">
                  <span className="text-[#94A3B8] font-tabular">
                    {t('profile.page')} {activityPage} / {activityTotalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={activityPage <= 1}
                      onClick={() => setActivityPage((p) => p - 1)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F0]/14 text-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>{t('profile.prev')}</span>
                    </button>
                    <button
                      type="button"
                      disabled={activityPage >= activityTotalPages}
                      onClick={() => setActivityPage((p) => p + 1)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F0]/14 text-[#E2E8F0] disabled:opacity-40 cursor-pointer"
                    >
                      <span>{t('profile.next')}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ACCOUNT SECURITY */}
          {tab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Change Password Form */}
              <div className="lg:col-span-6 space-y-4">
                <h2 className="text-base font-semibold text-[#F1F5F9]">
                  {t('profile.changePasswordTitle')}
                </h2>

                {pwError && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-center gap-2 text-xs text-[#FCA5A5]">
                    <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
                    <span>{pwError}</span>
                  </div>
                )}
                {pwSuccess && (
                  <div className="p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 flex items-center gap-2 text-xs text-[#6EE7B7]">
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                    <span>{pwSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label htmlFor="sec-cur-pw" className="block text-xs font-medium text-[#E2E8F0]">
                      {t('profile.currentPassword')}
                    </label>
                    <input
                      id="sec-cur-pw"
                      type="password"
                      required
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] focus:border-[#3B82F6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sec-new-pw" className="block text-xs font-medium text-[#E2E8F0]">
                      {t('profile.newPassword')}
                    </label>
                    <input
                      id="sec-new-pw"
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={t('auth.newPasswordPlaceholder')}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="sec-cnf-pw" className="block text-xs font-medium text-[#E2E8F0]">
                      {t('profile.confirmNewPassword')}
                    </label>
                    <input
                      id="sec-cnf-pw"
                      type="password"
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] focus:border-[#3B82F6]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="px-5 py-2.5 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                  >
                    {t('profile.updatePassword')}
                  </button>
                </form>

                {/* First-Run Admin Claim Panel when no Admin is assigned yet */}
                {user.role !== 'ADMIN' &&
                  user.role !== 'OWNER' &&
                  (!hasAdminAccount || requiresAdminSecret) && (
                  <div className="mt-6 p-4 rounded-xl border border-[#3B82F6]/30 bg-[#3B82F6]/8 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#F1F5F9]">
                      <Shield className="w-4 h-4 text-[#60A5FA]" strokeWidth={1.5} />
                      <span>{t('profile.adminClaimTitle')}</span>
                    </div>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      {t('profile.adminClaimSubtitle')}
                    </p>
                    {adminClaimError && (
                      <p className="text-xs text-[#EF4444]">{adminClaimError}</p>
                    )}
                    <form onSubmit={handleClaimAdmin} className="space-y-2.5">
                      {requiresAdminSecret && (
                        <input
                          type="password"
                          required
                          value={adminSecret}
                          onChange={(e) => setAdminSecret(e.target.value)}
                          placeholder={t('profile.adminSecretLabel')}
                          className="w-full px-3 py-2 text-xs rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9]"
                        />
                      )}
                      <button
                        type="submit"
                        disabled={adminClaiming}
                        className="px-4 py-2 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors cursor-pointer"
                      >
                        {t('profile.adminClaimButton')}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Active Sessions Management */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#F1F5F9]">
                      {t('profile.sessionsTitle')}
                    </h2>
                    <p className="text-xs text-[#94A3B8] mt-0.5">
                      {t('profile.sessionsSubtitle')}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleLogoutOtherDevices()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#FCA5A5] border border-[#EF4444]/35 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                    <span>{t('profile.logoutAllOther')}</span>
                  </button>
                </div>

                {sessionMsg && (
                  <p className="text-xs text-[#10B981]">{sessionMsg}</p>
                )}

                {sessionsLoading ? (
                  <div className="space-y-2.5 animate-pulse">
                    {[1, 2].map((n) => (
                      <div key={n} className="h-14 rounded-lg bg-white/5" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className="p-3.5 rounded-lg bg-[#060913]/65 border border-[#E2E8F0]/12 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#F1F5F9]">{s.userAgent}</span>
                            {s.isCurrent && (
                              <span className="text-[10px] font-medium text-[#10B981]">
                                · {t('profile.currentDevice')}
                              </span>
                            )}
                          </div>
                          <p className="font-tabular text-[#64748B]">
                            {s.maskedIp} · {formatBangkokTimestamp(s.createdAt, locale)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
