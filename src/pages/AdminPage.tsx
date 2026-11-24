import { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  Shield,
  Package,
  CreditCard,
  Users,
  CheckCircle2,
  RotateCcw,
  Ban,
  Plus,
  Trash2,
  AlertTriangle,
  BarChart3,
  TrendingUp,
  KeyRound,
  Eye,
  EyeOff,
  Wallet,
  Layers,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { formatBangkokTimestamp, formatThbFromSatang } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/I18nContext';
import { GlassCard } from '../components/GlassCard';
import { StatusBadge } from '../components/StatusBadge';
import { ProductItem } from '../context/CartContext';

interface HourlyPoint {
  hour: number;
  label: string;
  salesSatang: number;
  ordersCount: number;
  unitsSold: number;
  topupSatang: number;
}

interface DailyPoint {
  date: string;
  salesSatang: number;
  topupSatang: number;
  ordersCount: number;
}

interface UnitBreakdownPoint {
  productId: number;
  nameEn: string;
  nameTh: string;
  priceSatang: number;
  availableStock: number;
  unitsSoldToday: number;
  revenueSatangToday: number;
}

interface VaultAccountRow {
  id: number;
  productId: number;
  accountUsername: string;
  accountPassword: string;
  note: string | null;
  isSold: boolean;
  soldToOrderId: string | null;
  soldAt: string | null;
  createdAt: string;
}

interface AdminOverviewResponse {
  metrics: {
    settledVolumeSatang: number;
    pendingOrdersCount: number;
    needsReviewCount: number;
    totalUsersCount: number;
  };
  revenueAnalytics?: {
    todayDateBangkok: string;
    todayRevenueSatang: number;
    todayOrdersCount: number;
    todayUnitsSold: number;
    todayTopupSatang: number;
    allTimeRevenueSatang: number;
    allTimeTopupSatang: number;
    hourlyToday: HourlyPoint[];
    last7Days: DailyPoint[];
    unitBreakdownToday: UnitBreakdownPoint[];
  };
  storeConfig?: {
    truemoneyPhoneMasked: string;
    truemoneyAccountName: string;
  };
  products: ProductItem[];
  productAccounts?: VaultAccountRow[];
  orders: {
    id: string;
    username: string;
    productNameSnapshot: string;
    quantity: number;
    totalSatang: number;
    deliveredAccountUsername?: string | null;
    deliveredAccounts?: { username: string; password: string; note?: string }[];
    status: string;
    adminDeliveryNote: string | null;
    createdAt: string;
  }[];
  topups: {
    id: string;
    username: string;
    channel: string;
    requestedSatang: number;
    creditedSatang: number;
    voucherUrlMasked: string | null;
    voucherUrlFull?: string | null;
    slipReference: string | null;
    status: string;
    reviewNote: string | null;
    createdAt: string;
  }[];
  users: {
    id: number;
    username: string;
    email: string;
    role: string;
    isInfiniteBalance?: boolean;
    balanceSatang: number;
    isBanned: boolean;
    createdAt: string;
  }[];
  activityLogs: {
    id: number;
    userId: number | null;
    eventType: string;
    status: string;
    deltaSatang: number | null;
    maskedIp: string;
    deviceSummary: string;
    metadata: string | null;
    createdAt: string;
  }[];
  bannedIps: {
    id: number;
    maskedIp: string;
    reason: string;
    createdAt: string;
  }[];
}

type AdminTab = 'revenue' | 'products' | 'orders' | 'topups' | 'security';

function parseBulkAccountLines(
  rawText: string
): { username: string; password: string; note?: string }[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: { username: string; password: string; note?: string }[] = [];
  for (const line of lines) {
    const separator = line.includes('|') ? '|' : line.includes(':') ? ':' : null;
    if (!separator) continue;
    const parts = line.split(separator).map((p) => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      parsed.push({
        username: parts[0],
        password: parts[1],
        note: parts.slice(2).join(' ').trim() || undefined,
      });
    }
  }
  return parsed;
}

export function AdminPage() {
  const { locale, t } = useTranslation();
  const { user, refreshBalance } = useAuth();
  const [tab, setTab] = useState<AdminTab>('revenue');
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [feedbackError, setFeedbackError] = useState(false);

  // Revenue Chart UI state
  const [chartSeries, setChartSeries] = useState<'sales' | 'topups'>('sales');
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  // Account Stock Vault state
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [vaultMode, setVaultMode] = useState<'single' | 'bulk'>('single');
  const [singleUser, setSingleUser] = useState('');
  const [singlePass, setSinglePass] = useState('');
  const [singleNote, setSingleNote] = useState('');
  const [bulkInput, setBulkInput] = useState('');
  const [vaultFilter, setVaultFilter] = useState<'AVAILABLE' | 'SOLD' | 'ALL'>('AVAILABLE');
  const [revealedIds, setRevealedIds] = useState<Record<number, boolean>>({});
  const [addingAccounts, setAddingAccounts] = useState(false);

  // Orders & Top-Up reconciliation drafts
  const [deliveryNotes, setDeliveryNotes] = useState<Record<string, string>>({});
  const [verifiedAmounts, setVerifiedAmounts] = useState<Record<string, string>>({});
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [copiedVoucherId, setCopiedVoucherId] = useState<string | null>(null);
  const [revealedVoucherIds, setRevealedVoucherIds] = useState<Record<string, boolean>>({});

  // Add new product form
  const [newProd, setNewProd] = useState({
    nameEn: '',
    nameTh: '',
    descriptionEn: '',
    descriptionTh: '',
    category: 'Titan' as 'Titan' | 'Mythic' | 'Godly',
    rarity: 'Godly',
    priceThb: '40',
    imageUrl:
      '/assets/aistudio/4502e52d1094eee24dde0583a4f4d6bb41b277dc9d095f1040ccaf81a76f39b0_81c812d5.webp',
  });

  // Ban IP form
  const [ipToBan, setIpToBan] = useState('');
  const [ipReason, setIpReason] = useState('');

  const isPrivileged = user?.role === 'ADMIN' || user?.role === 'OWNER';

  const showToast = (msg: string, isError = false) => {
    setFeedback(msg);
    setFeedbackError(isError);
  };

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<AdminOverviewResponse>('/api/admin/overview');
      setData(res);
      const prices: Record<number, string> = {};
      for (const p of res.products) {
        prices[p.id] = String(p.priceSatang / 100);
      }
      setPriceDrafts(prices);
      setSelectedProductId((prev) =>
        prev && res.products.some((p) => p.id === prev) ? prev : res.products[0]?.id ?? null
      );
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Unable to load admin data.', true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPrivileged) {
      void loadOverview();
    } else {
      setLoading(false);
    }
  }, [isPrivileged, loadOverview]);

  if (!user || !isPrivileged) {
    return (
      <div className="max-w-md mx-auto px-4 pt-16">
        <GlassCard elevated className="p-8 text-center space-y-3">
          <Shield className="w-7 h-7 text-[#EF4444] mx-auto" strokeWidth={1.5} />
          <h1 className="text-lg font-semibold text-[#F1F5F9]">{t('admin.accessDenied')}</h1>
        </GlassCard>
      </div>
    );
  }

  const handleAddAccounts = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;

    const payloadAccounts =
      vaultMode === 'single'
        ? singleUser.trim() && singlePass.trim()
          ? [
              {
                username: singleUser.trim(),
                password: singlePass.trim(),
                note: singleNote.trim() || undefined,
              },
            ]
          : []
        : parseBulkAccountLines(bulkInput);

    if (payloadAccounts.length === 0) {
      showToast(
        locale === 'th'
          ? 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านบัญชี Roblox (แบบวางหลายบรรทัดใช้รูปแบบ username:password)'
          : 'Enter at least one valid Roblox username and password (bulk format: username:password per line).',
        true
      );
      return;
    }

    setAddingAccounts(true);
    try {
      const res = await apiFetch<{ addedCount: number; stock: number }>(
        `/api/admin/products/${selectedProductId}/accounts`,
        {
          method: 'POST',
          body: { accounts: payloadAccounts },
        }
      );
      setSingleUser('');
      setSinglePass('');
      setSingleNote('');
      setBulkInput('');
      showToast(
        locale === 'th'
          ? `เพิ่มบัญชี Roblox เข้าสต็อกสำเร็จ ${res.addedCount} ไอดี (สต็อกพร้อมขายปัจจุบัน: ${res.stock} ไอดี)`
          : `Added ${res.addedCount} Roblox account(s) to stock vault (Live available stock: ${res.stock}).`
      );
      await loadOverview();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Failed to add accounts.', true);
    } finally {
      setAddingAccounts(false);
    }
  };

  const handleDeleteVaultAccount = async (accountId: number) => {
    try {
      await apiFetch(`/api/admin/accounts/${accountId}`, { method: 'DELETE' });
      showToast(
        locale === 'th' ? 'ลบไอดีออกจากสต็อกเรียบร้อยแล้ว' : 'Unsold account removed from stock.'
      );
      await loadOverview();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not delete account.', true);
    }
  };

  const handleSavePrice = async (productId: number) => {
    const priceThb = Number(priceDrafts[productId]);
    if (!Number.isFinite(priceThb) || priceThb < 1) return;
    try {
      await apiFetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        body: { priceThb },
      });
      showToast(locale === 'th' ? 'อัปเดตราคาสินค้าเรียบร้อยแล้ว' : `Product #${productId} price saved.`);
      await loadOverview();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update price.', true);
    }
  };

  const handleCreateProduct = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/products', {
        method: 'POST',
        body: {
          ...newProd,
          priceThb: Number(newProd.priceThb),
          stock: 0,
        },
      });
      setNewProd({
        nameEn: '',
        nameTh: '',
        descriptionEn: '',
        descriptionTh: '',
        category: 'Titan',
        rarity: 'Godly',
        priceThb: '40',
        imageUrl:
          '/assets/aistudio/4502e52d1094eee24dde0583a4f4d6bb41b277dc9d095f1040ccaf81a76f39b0_81c812d5.webp',
      });
      showToast(
        locale === 'th'
          ? 'เพิ่มยูนิตใหม่แล้ว กรุณาเพิ่มบัญชี Roblox เข้าคลังสต็อกเพื่อเปิดขาย'
          : 'New unit added. Add Roblox accounts in the Stock Vault above to open sales.'
      );
      await loadOverview();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not add product.', true);
    }
  };

  const handleOrderAction = async (orderId: string, status: 'DELIVERED' | 'REFUNDED') => {
    try {
      await apiFetch(`/api/admin/orders/${orderId}`, {
        method: 'PATCH',
        body: {
          status,
          adminDeliveryNote: deliveryNotes[orderId] || undefined,
        },
      });
      showToast(`Order ${orderId} updated to ${status}.`);
      await Promise.all([loadOverview(), refreshBalance()]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Order update failed.', true);
    }
  };

  const handleCopyVoucherUrl = async (txId: string, fullUrl: string) => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedVoucherId(txId);
      showToast(
        locale === 'th'
          ? `คัดลอกลิงก์ซองอั่งเปาของรายการ ${txId} แล้ว`
          : `Copied Gift Voucher URL for ${txId}.`
      );
      window.setTimeout(() => {
        setCopiedVoucherId((prev) => (prev === txId ? null : prev));
      }, 2000);
    } catch {
      showToast(
        locale === 'th' ? 'ไม่สามารถคัดลอกลิงก์ได้' : 'Could not copy voucher link.',
        true
      );
    }
  };

  const handleTopupAction = async (
    txId: string,
    status: 'COMPLETED' | 'FAILED',
    defaultSatang: number
  ) => {
    const verifiedThb = Number(verifiedAmounts[txId] || defaultSatang / 100);
    try {
      await apiFetch(`/api/admin/topups/${txId}`, {
        method: 'PATCH',
        body: {
          status,
          verifiedThb: status === 'COMPLETED' ? verifiedThb : undefined,
        },
      });
      showToast(`Top-Up ${txId} marked as ${status}.`);
      await Promise.all([loadOverview(), refreshBalance()]);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Top-up update failed.', true);
    }
  };

  const handleToggleBanUser = async (targetId: number, nextBanned: boolean) => {
    try {
      await apiFetch(`/api/admin/users/${targetId}/ban`, {
        method: 'PATCH',
        body: { isBanned: nextBanned },
      });
      await loadOverview();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not update user status.', true);
    }
  };

  const handleBlockIp = async (e: FormEvent) => {
    e.preventDefault();
    if (!ipToBan.trim()) return;
    try {
      await apiFetch('/api/admin/banned-ips', {
        method: 'POST',
        body: { maskedIp: ipToBan.trim(), reason: ipReason.trim() || 'Abuse policy' },
      });
      setIpToBan('');
      setIpReason('');
      await loadOverview();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not block IP.', true);
    }
  };

  const handleRemoveIpBan = async (id: number) => {
    try {
      await apiFetch(`/api/admin/banned-ips/${id}`, { method: 'DELETE' });
      await loadOverview();
    } catch {
      // Ignore
    }
  };

  const analytics = data?.revenueAnalytics;
  const hourlyPoints = analytics?.hourlyToday ?? [];
  const maxHourlyVal = Math.max(
    100,
    ...hourlyPoints.map((pt) => (chartSeries === 'sales' ? pt.salesSatang : pt.topupSatang))
  );

  const activeHourPoint =
    selectedHour !== null
      ? hourlyPoints[selectedHour] ?? null
      : hourlyPoints.reduce<HourlyPoint | null>((best, pt) => {
          const val = chartSeries === 'sales' ? pt.salesSatang : pt.topupSatang;
          const bestVal = best ? (chartSeries === 'sales' ? best.salesSatang : best.topupSatang) : 0;
          return val > bestVal ? pt : best;
        }, null);

  const last7Days = analytics?.last7Days ?? [];
  const max7DayVal = Math.max(
    100,
    ...last7Days.map((d) => Math.max(d.salesSatang, d.topupSatang))
  );

  const bulkParsedPreview = parseBulkAccountLines(bulkInput);

  const filteredVaultAccounts = (data?.productAccounts ?? []).filter((acc) => {
    if (selectedProductId && acc.productId !== selectedProductId) return false;
    if (vaultFilter === 'AVAILABLE') return !acc.isSold;
    if (vaultFilter === 'SOLD') return acc.isSold;
    return true;
  });

  const selectedProduct = data?.products.find((p) => p.id === selectedProductId) ?? null;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-tabular text-[#60A5FA]">
            <Shield className="w-4 h-4" strokeWidth={1.5} />
            <span>
              ROLE: {user.role}
              {user.isInfiniteBalance ? ' · INFINITE WALLET (∞ ฿)' : ''}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F1F5F9]">
            {t('admin.title')}
          </h1>
          <p className="text-sm text-[#94A3B8]">{t('admin.subtitle')}</p>
        </div>

        <button
          type="button"
          onClick={() => void loadOverview()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 bg-white/4 hover:bg-white/8 rounded-lg transition-colors cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          <span>{locale === 'th' ? 'รีเฟรชข้อมูล' : 'Refresh Data'}</span>
        </button>
      </div>

      {/* Top Bento Metrics Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GlassCard elevated className="p-5 space-y-2">
          <div className="flex items-center justify-between">
            <TrendingUp className="w-4 h-4 text-[#10B981]" strokeWidth={1.5} />
            <span className="font-tabular text-[11px] text-[#64748B]">
              {analytics?.todayDateBangkok || 'ICT'}
            </span>
          </div>
          <p className="text-xs text-[#94A3B8]">{t('admin.revenueTodayTitle')}</p>
          <p className="font-tabular text-xl sm:text-2xl font-semibold text-[#10B981]">
            {formatThbFromSatang(analytics?.todayRevenueSatang || 0)}
          </p>
          <p className="font-tabular text-[11px] text-[#94A3B8]">
            {analytics?.todayOrdersCount ?? 0}{' '}
            {locale === 'th' ? 'ออเดอร์วันนี้' : 'orders today'}
          </p>
        </GlassCard>

        <GlassCard className="p-5 space-y-2">
          <Wallet className="w-4 h-4 text-[#60A5FA]" strokeWidth={1.5} />
          <p className="text-xs text-[#94A3B8]">{t('admin.topupTodayTitle')}</p>
          <p className="font-tabular text-xl sm:text-2xl font-semibold text-[#F1F5F9]">
            {formatThbFromSatang(analytics?.todayTopupSatang || 0)}
          </p>
          <p className="font-tabular text-[11px] text-[#94A3B8]">
            {locale === 'th' ? 'รอตรวจ' : 'Pending review'}: {data?.metrics.needsReviewCount ?? 0}
          </p>
        </GlassCard>

        <GlassCard className="p-5 space-y-2">
          <Package className="w-4 h-4 text-[#3B82F6]" strokeWidth={1.5} />
          <p className="text-xs text-[#94A3B8]">{t('admin.unitsSoldTodayTitle')}</p>
          <p className="font-tabular text-xl sm:text-2xl font-semibold text-[#F1F5F9]">
            {analytics?.todayUnitsSold ?? 0}
          </p>
          <p className="font-tabular text-[11px] text-[#94A3B8]">
            {locale === 'th' ? 'สต็อกพร้อมขายรวม' : 'Total live stock'}:{' '}
            {(data?.products ?? []).reduce((sum, p) => sum + p.stock, 0)}
          </p>
        </GlassCard>

        <GlassCard className="p-5 space-y-2">
          <CreditCard className="w-4 h-4 text-[#E2E8F0]" strokeWidth={1.5} />
          <p className="text-xs text-[#94A3B8]">{t('admin.revenueAllTimeTitle')}</p>
          <p className="font-tabular text-xl sm:text-2xl font-semibold text-[#F1F5F9]">
            {formatThbFromSatang(analytics?.allTimeRevenueSatang || 0)}
          </p>
          <p className="font-tabular text-[11px] text-[#94A3B8]">
            <Users className="w-3 h-3 inline mr-1" />
            {data?.metrics.totalUsersCount ?? 0} {locale === 'th' ? 'สมาชิก' : 'users'}
          </p>
        </GlassCard>
      </section>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs ${
            feedbackError
              ? 'bg-[#EF4444]/10 border-[#EF4444]/35 text-[#FCA5A5]'
              : 'bg-[#3B82F6]/12 border-[#3B82F6]/35 text-[#BFDBFE]'
          }`}
        >
          {feedback}
        </div>
      )}

      {/* Admin Tabbed Workspace */}
      <GlassCard elevated className="overflow-hidden">
        <div className="px-4 sm:px-6 pt-3 border-b border-[#E2E8F0]/12 flex items-center gap-2 overflow-x-auto">
          {[
            { id: 'revenue' as AdminTab, label: t('admin.tabRevenue'), Icon: BarChart3 },
            { id: 'products' as AdminTab, label: t('admin.tabProducts'), Icon: KeyRound },
            { id: 'orders' as AdminTab, label: t('admin.tabOverview'), Icon: Package },
            { id: 'topups' as AdminTab, label: t('admin.tabTopups'), Icon: AlertTriangle },
            { id: 'security' as AdminTab, label: t('admin.tabSecurity'), Icon: Shield },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                tab === id
                  ? 'border-[#3B82F6] text-white'
                  : 'border-transparent text-[#94A3B8] hover:text-[#E2E8F0]'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-6">
          {loading && !data ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-16 rounded-lg bg-white/5" />
              ))}
            </div>
          ) : tab === 'revenue' ? (
            /* ============================================================
               TAB 1: REVENUE MANAGER & TODAY'S CHART (รายได้ & กราฟวันนี้)
               ============================================================ */
            <div className="space-y-6">
              {/* Direct TrueMoney Payout Assurance Banner */}
              {data?.storeConfig && (
                <div className="p-4 rounded-xl bg-[#10B981]/8 border border-[#10B981]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-[#6EE7B7]">
                      {locale === 'th'
                        ? 'ระบบรับเงินเข้า TrueMoney Wallet โดยตรง (ไม่ต้องกดถอนเงินจากเว็บ)'
                        : 'Direct TrueMoney Wallet Settlement (No Website Withdrawal Needed)'}
                    </p>
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      {data.storeConfig.truemoneyAccountName} ·{' '}
                      <span className="font-tabular text-[#E2E8F0]">
                        {data.storeConfig.truemoneyPhoneMasked}
                      </span>
                    </p>
                    <p className="text-[#94A3B8] leading-relaxed">
                      {locale === 'th'
                        ? 'ซองอั่งเปา TrueMoney โอนตรงเข้าบัญชี TrueMoney Wallet ของคุณทันที เว็บไซต์ไม่ได้เก็บเงินสดของคุณไว้ และคุณสามารถคัดลอกลิงก์ซองอั่งเปาได้โดยตรงในแท็บตรวจยอดเติมเงิน'
                        : 'TrueMoney Gift Vouchers settle directly to your own TrueMoney Wallet. This website never holds your cash, and you can copy any submitted Gift Voucher link in Top-Up Reviews.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Today's 24-Hour Interactive Revenue Bar Chart */}
              <div className="p-5 rounded-xl bg-[#060913]/75 border border-[#E2E8F0]/12 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[#F1F5F9]">
                      {t('admin.hourlyChartTitle')}
                    </h2>
                    <p className="text-xs text-[#94A3B8] mt-0.5 font-tabular">
                      {analytics?.todayDateBangkok} · Asia/Bangkok (UTC+7)
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/12 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setChartSeries('sales')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        chartSeries === 'sales'
                          ? 'bg-[#3B82F6] text-white'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {t('admin.chartSales')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartSeries('topups')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        chartSeries === 'topups'
                          ? 'bg-[#10B981] text-white'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {t('admin.chartTopups')}
                    </button>
                  </div>
                </div>

                {/* Selected / Peak Hour Readout Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-lg bg-[#0D1321]/90 border border-[#E2E8F0]/10 text-xs">
                  <div className="flex items-center gap-2 text-[#94A3B8]">
                    <span>
                      {selectedHour !== null
                        ? locale === 'th'
                          ? 'ช่วงเวลาที่เลือก'
                          : 'Selected Hour'
                        : locale === 'th'
                        ? 'ช่วงเวลาที่ทำรายได้สูงสุดวันนี้'
                        : 'Peak Hour Today'}
                      :
                    </span>
                    <span className="font-tabular font-semibold text-[#F1F5F9]">
                      {activeHourPoint ? activeHourPoint.label : '00:00'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-tabular">
                    <span
                      className={`font-semibold ${
                        chartSeries === 'sales' ? 'text-[#60A5FA]' : 'text-[#10B981]'
                      }`}
                    >
                      {formatThbFromSatang(
                        activeHourPoint
                          ? chartSeries === 'sales'
                            ? activeHourPoint.salesSatang
                            : activeHourPoint.topupSatang
                          : 0
                      )}
                    </span>
                    {chartSeries === 'sales' && activeHourPoint && (
                      <span className="text-[#94A3B8]">
                        {activeHourPoint.ordersCount}{' '}
                        {locale === 'th' ? 'ออเดอร์' : 'orders'} · {activeHourPoint.unitsSold}{' '}
                        {locale === 'th' ? 'ไอดี' : 'units'}
                      </span>
                    )}
                  </div>
                </div>

                {/* 24-Hour Vertical Bar Graph */}
                <div className="overflow-x-auto pb-1">
                  <div className="min-w-[600px]">
                    <div className="h-52 flex items-end gap-1.5 pt-6 px-1 border-b border-[#E2E8F0]/12 relative">
                      {/* Horizontal reference lines */}
                      <div className="pointer-events-none absolute inset-x-0 top-6 border-t border-dashed border-[#E2E8F0]/8" />
                      <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-[#E2E8F0]/8" />

                      {hourlyPoints.map((pt) => {
                        const val = chartSeries === 'sales' ? pt.salesSatang : pt.topupSatang;
                        const pct = val > 0 ? Math.max(8, Math.round((val / maxHourlyVal) * 100)) : 2;
                        const isSelected = selectedHour === pt.hour;
                        return (
                          <button
                            key={pt.hour}
                            type="button"
                            onMouseEnter={() => setSelectedHour(pt.hour)}
                            onClick={() => setSelectedHour(pt.hour)}
                            title={`${pt.label}: ${formatThbFromSatang(val)}`}
                            className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer focus:outline-none"
                          >
                            <div
                              style={{ height: `${pct}%` }}
                              className={`w-full rounded-t-md transition-all duration-200 ${
                                val === 0
                                  ? 'bg-white/6 group-hover:bg-white/15'
                                  : chartSeries === 'sales'
                                  ? isSelected
                                    ? 'bg-[#60A5FA] shadow-[0_0_16px_rgba(96,165,250,0.45)]'
                                    : 'bg-[#3B82F6]/85 group-hover:bg-[#60A5FA]'
                                  : isSelected
                                  ? 'bg-[#34D399] shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                                  : 'bg-[#10B981]/85 group-hover:bg-[#34D399]'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>

                    {/* X-Axis Hour Labels (every 2 hours) */}
                    <div className="flex items-center gap-1.5 px-1 pt-2">
                      {hourlyPoints.map((pt) => (
                        <div
                          key={`lbl-${pt.hour}`}
                          className="flex-1 text-center font-tabular text-[10px] text-[#64748B]"
                        >
                          {pt.hour % 2 === 0 ? String(pt.hour).padStart(2, '0') : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Grid: Unit Sales Breakdown Today + 7-Day Trend */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* Today's Sales by Unit (UTC vs UTTV) */}
                <div className="lg:col-span-6 p-5 rounded-xl bg-[#060913]/75 border border-[#E2E8F0]/12 space-y-4">
                  <h3 className="text-sm font-semibold text-[#F1F5F9]">
                    {t('admin.unitBreakdownTitle')}
                  </h3>
                  <div className="space-y-3">
                    {(analytics?.unitBreakdownToday ?? []).map((u) => (
                      <div
                        key={u.productId}
                        className="p-3.5 rounded-lg bg-[#0D1321]/85 border border-[#E2E8F0]/10 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-[#F1F5F9] truncate">
                            {locale === 'th' ? u.nameTh : u.nameEn}
                          </p>
                          <p className="font-tabular text-[11px] text-[#94A3B8] mt-0.5">
                            {formatThbFromSatang(u.priceSatang)} ·{' '}
                            <span
                              className={
                                u.availableStock > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                              }
                            >
                              {u.availableStock}{' '}
                              {locale === 'th' ? 'ไอดีคงเหลือ' : 'accounts in stock'}
                            </span>
                          </p>
                        </div>
                        <div className="text-right font-tabular shrink-0">
                          <p className="text-sm font-semibold text-[#60A5FA]">
                            {formatThbFromSatang(u.revenueSatangToday)}
                          </p>
                          <p className="text-[11px] text-[#94A3B8]">
                            {u.unitsSoldToday} {locale === 'th' ? 'ขายแล้ววันนี้' : 'sold today'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 7-Day Daily Revenue Trend */}
                <div className="lg:col-span-6 p-5 rounded-xl bg-[#060913]/75 border border-[#E2E8F0]/12 space-y-4">
                  <h3 className="text-sm font-semibold text-[#F1F5F9]">
                    {t('admin.last7DaysTitle')}
                  </h3>
                  <div className="space-y-2.5">
                    {last7Days.map((day) => {
                      const salesPct = Math.round((day.salesSatang / max7DayVal) * 100);
                      const isToday = day.date === analytics?.todayDateBangkok;
                      return (
                        <div key={day.date} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-tabular">
                            <span className={isToday ? 'text-[#60A5FA] font-semibold' : 'text-[#94A3B8]'}>
                              {day.date}
                              {isToday ? (locale === 'th' ? ' (วันนี้)' : ' (Today)') : ''}
                            </span>
                            <span className="text-[#E2E8F0]">
                              {formatThbFromSatang(day.salesSatang)}
                              <span className="text-[#64748B] ml-2">
                                ({day.ordersCount} {locale === 'th' ? 'ออเดอร์' : 'ord'})
                              </span>
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-white/6 overflow-hidden">
                            <div
                              style={{ width: `${day.salesSatang > 0 ? Math.max(4, salesPct) : 0}%` }}
                              className={`h-full rounded-full ${
                                isToday ? 'bg-[#3B82F6]' : 'bg-[#60A5FA]/60'
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : tab === 'products' ? (
            /* ============================================================
               TAB 2: ACCOUNT STOCK VAULT & UNIT PRICING (สต็อกไอดี & สินค้า)
               ============================================================ */
            <div className="space-y-8">
              {/* Account Stock Vault Manager */}
              <div className="p-5 rounded-xl bg-[#060913]/75 border border-[#3B82F6]/30 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="text-base font-semibold text-[#F1F5F9] flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-[#60A5FA]" strokeWidth={1.5} />
                      <span>{t('admin.vaultTitle')}</span>
                    </h2>
                    <p className="text-xs text-[#94A3B8] max-w-2xl leading-relaxed">
                      {t('admin.vaultSubtitle')}
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/12 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVaultMode('single')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        vaultMode === 'single'
                          ? 'bg-[#3B82F6] text-white'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {t('admin.vaultSingleMode')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setVaultMode('bulk')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        vaultMode === 'bulk'
                          ? 'bg-[#3B82F6] text-white'
                          : 'text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {t('admin.vaultBulkMode')}
                    </button>
                  </div>
                </div>

                {/* Unit Selector Cards (UTC / UTTV) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data?.products.map((prod) => {
                    const active = selectedProductId === prod.id;
                    return (
                      <button
                        key={prod.id}
                        type="button"
                        onClick={() => setSelectedProductId(prod.id)}
                        className={`p-3.5 rounded-xl border text-left transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                          active
                            ? 'bg-[#3B82F6]/14 border-[#3B82F6] text-white'
                            : 'bg-[#0D1321]/80 border-[#E2E8F0]/12 text-[#94A3B8] hover:border-[#E2E8F0]/30'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#F1F5F9] truncate">
                            {locale === 'th' ? prod.nameTh : prod.nameEn}
                          </p>
                          <p className="font-tabular text-xs text-[#94A3B8] mt-0.5">
                            {formatThbFromSatang(prod.priceSatang)}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`font-tabular text-lg font-semibold ${
                              prod.stock > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
                            }`}
                          >
                            {prod.stock}
                          </p>
                          <p className="text-[10px] text-[#94A3B8]">{t('admin.vaultAvailable')}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Add Account(s) Form */}
                {selectedProduct && (
                  <form
                    onSubmit={handleAddAccounts}
                    className="p-4 rounded-xl bg-[#0D1321]/85 border border-[#E2E8F0]/12 space-y-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[#E2E8F0]">
                        {locale === 'th' ? 'เพิ่มไอดีเข้ายูนิต' : 'Add Roblox Account(s) to'}:{' '}
                        <strong className="text-[#60A5FA]">
                          {locale === 'th' ? selectedProduct.nameTh : selectedProduct.nameEn}
                        </strong>
                      </span>
                      {vaultMode === 'bulk' && (
                        <span className="font-tabular text-[#10B981]">
                          {bulkParsedPreview.length}{' '}
                          {locale === 'th' ? 'ไอดีพร้อมเพิ่ม' : 'valid line(s)'}
                        </span>
                      )}
                    </div>

                    {vaultMode === 'single' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                        <input
                          type="text"
                          required
                          value={singleUser}
                          onChange={(e) => setSingleUser(e.target.value)}
                          placeholder={
                            locale === 'th'
                              ? 'ชื่อผู้ใช้ Roblox (Username)'
                              : 'Roblox Account Username'
                          }
                          className="sm:col-span-4 px-3 py-2.5 rounded-lg bg-[#060913] border border-[#E2E8F0]/15 text-[#F1F5F9] font-tabular focus:border-[#3B82F6]"
                        />
                        <input
                          type="text"
                          required
                          value={singlePass}
                          onChange={(e) => setSinglePass(e.target.value)}
                          placeholder={
                            locale === 'th' ? 'รหัสผ่าน (Password)' : 'Account Password'
                          }
                          className="sm:col-span-4 px-3 py-2.5 rounded-lg bg-[#060913] border border-[#E2E8F0]/15 text-[#F1F5F9] font-tabular focus:border-[#3B82F6]"
                        />
                        <input
                          type="text"
                          value={singleNote}
                          onChange={(e) => setSingleNote(e.target.value)}
                          placeholder={
                            locale === 'th'
                              ? 'หมายเหตุ (ไม่บังคับ)'
                              : 'Optional note (e.g. Level / Mail)'
                          }
                          className="sm:col-span-2 px-3 py-2.5 rounded-lg bg-[#060913] border border-[#E2E8F0]/15 text-[#F1F5F9] focus:border-[#3B82F6]"
                        />
                        <button
                          type="submit"
                          disabled={addingAccounts}
                          className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('admin.vaultAddButton')}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5 text-xs">
                        <textarea
                          rows={5}
                          value={bulkInput}
                          onChange={(e) => setBulkInput(e.target.value)}
                          placeholder={
                            locale === 'th'
                              ? 'วาง 1 บัญชีต่อ 1 บรรทัด ในรูปแบบ username:password\nตัวอย่าง:\nMyUTC_Account01:Pass1234\nMyUTC_Account02:Pass5678'
                              : 'Paste 1 Roblox account per line in username:password format\nExample:\nMyUTC_Account01:Pass1234\nMyUTC_Account02:Pass5678'
                          }
                          className="w-full px-3.5 py-2.5 rounded-lg bg-[#060913] border border-[#E2E8F0]/15 text-[#F1F5F9] font-tabular leading-relaxed focus:border-[#3B82F6]"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] text-[#94A3B8]">
                            {locale === 'th'
                              ? 'รองรับตัวคั่น : หรือ | (เพิ่มได้สูงสุด 200 ไอดีต่อครั้ง)'
                              : 'Supports : or | separators (up to 200 accounts per batch).'}
                          </p>
                          <button
                            type="submit"
                            disabled={addingAccounts || bulkParsedPreview.length === 0}
                            className="inline-flex items-center gap-1.5 px-4 py-2 font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            <Layers className="w-3.5 h-3.5" />
                            <span>
                              {t('admin.vaultAddButton')} ({bulkParsedPreview.length})
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </form>
                )}

                {/* Vault Inventory List for Selected Unit */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 text-xs">
                      {(
                        [
                          { id: 'AVAILABLE', label: t('admin.vaultAvailable') },
                          { id: 'SOLD', label: t('admin.vaultSold') },
                          { id: 'ALL', label: t('profile.filterAll') },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setVaultFilter(f.id)}
                          className={`px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                            vaultFilter === f.id
                              ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                              : 'bg-[#0D1321] border-[#E2E8F0]/12 text-[#94A3B8] hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <span className="font-tabular text-xs text-[#94A3B8]">
                      {filteredVaultAccounts.length}{' '}
                      {locale === 'th' ? 'รายการ' : 'entries'}
                    </span>
                  </div>

                  {filteredVaultAccounts.length === 0 ? (
                    <div className="py-8 px-4 rounded-lg border border-dashed border-[#E2E8F0]/12 text-center text-xs text-[#94A3B8]">
                      {t('admin.vaultEmpty')}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse min-w-[640px] text-xs">
                        <thead>
                          <tr className="border-b border-[#E2E8F0]/12 text-[11px] uppercase tracking-wider text-[#94A3B8]">
                            <th className="py-2.5 pr-3 font-medium">Username</th>
                            <th className="py-2.5 pr-3 font-medium">Password</th>
                            <th className="py-2.5 pr-3 font-medium">Note</th>
                            <th className="py-2.5 pr-3 font-medium">Status</th>
                            <th className="py-2.5 text-right font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E8F0]/10 font-tabular">
                          {filteredVaultAccounts.map((acc) => {
                            const revealed = Boolean(revealedIds[acc.id]);
                            return (
                              <tr key={acc.id} className="hover:bg-white/[0.02]">
                                <td className="py-2.5 pr-3 font-medium text-[#F1F5F9]">
                                  {acc.accountUsername}
                                </td>
                                <td className="py-2.5 pr-3 text-[#E2E8F0]">
                                  <div className="inline-flex items-center gap-2">
                                    <span>{revealed ? acc.accountPassword : '••••••••'}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setRevealedIds((prev) => ({
                                          ...prev,
                                          [acc.id]: !prev[acc.id],
                                        }))
                                      }
                                      className="text-[#94A3B8] hover:text-white cursor-pointer"
                                      title={revealed ? 'Hide password' : 'Show password'}
                                    >
                                      {revealed ? (
                                        <EyeOff className="w-3.5 h-3.5" />
                                      ) : (
                                        <Eye className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </td>
                                <td className="py-2.5 pr-3 text-[#94A3B8] font-sans">
                                  {acc.note || '—'}
                                </td>
                                <td className="py-2.5 pr-3">
                                  {acc.isSold ? (
                                    <span className="text-[#60A5FA]">
                                      {t('admin.vaultSold')} ({acc.soldToOrderId || 'Order'})
                                    </span>
                                  ) : (
                                    <span className="text-[#10B981] font-medium">
                                      {t('admin.vaultAvailable')}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 text-right">
                                  {!acc.isSold ? (
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteVaultAccount(acc.id)}
                                      className="inline-flex items-center gap-1 text-[#FCA5A5] hover:text-white cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span className="font-sans">
                                        {locale === 'th' ? 'ลบ' : 'Remove'}
                                      </span>
                                    </button>
                                  ) : (
                                    <span className="text-[#64748B]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {/* Unit Pricing Controls */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#F1F5F9]">
                  {locale === 'th' ? 'ตั้งราคายูนิต (THB)' : 'Unit Pricing (THB)'}
                </h2>
                {data?.products.map((prod) => (
                  <div
                    key={prod.id}
                    className="p-4 rounded-xl bg-[#060913]/65 border border-[#E2E8F0]/12 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#F1F5F9]">
                        {locale === 'th' ? prod.nameTh : prod.nameEn}
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        {prod.category} · {prod.rarity} ·{' '}
                        <span className="font-tabular text-[#60A5FA]">
                          {prod.stock} {locale === 'th' ? 'ไอดีในคลัง' : 'accounts in vault'}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      <label className="flex items-center gap-1.5 text-[#94A3B8]">
                        <span>THB</span>
                        <input
                          type="number"
                          min={1}
                          value={priceDrafts[prod.id] ?? ''}
                          onChange={(e) =>
                            setPriceDrafts((prev) => ({
                              ...prev,
                              [prod.id]: e.target.value,
                            }))
                          }
                          className="w-24 px-2.5 py-1.5 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9] font-tabular"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleSavePrice(prod.id)}
                        className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg cursor-pointer"
                      >
                        {t('admin.updateStock')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional: Add Additional Unit */}
              <form
                onSubmit={handleCreateProduct}
                className="p-5 rounded-xl bg-[#060913]/65 border border-[#E2E8F0]/12 space-y-4"
              >
                <h2 className="text-sm font-semibold text-[#F1F5F9] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#3B82F6]" />
                  <span>{t('admin.addProductTitle')}</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <input
                    required
                    value={newProd.nameEn}
                    onChange={(e) => setNewProd({ ...newProd, nameEn: e.target.value })}
                    placeholder="Unit Name (English)"
                    className="px-3 py-2 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9]"
                  />
                  <input
                    required
                    value={newProd.nameTh}
                    onChange={(e) => setNewProd({ ...newProd, nameTh: e.target.value })}
                    placeholder="ชื่อยูนิต (ภาษาไทย)"
                    className="px-3 py-2 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9]"
                  />
                  <input
                    required
                    value={newProd.descriptionEn}
                    onChange={(e) => setNewProd({ ...newProd, descriptionEn: e.target.value })}
                    placeholder="Description (English)"
                    className="px-3 py-2 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9]"
                  />
                  <input
                    required
                    value={newProd.descriptionTh}
                    onChange={(e) => setNewProd({ ...newProd, descriptionTh: e.target.value })}
                    placeholder="รายละเอียด (ภาษาไทย)"
                    className="px-3 py-2 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newProd.category}
                      onChange={(e) =>
                        setNewProd({
                          ...newProd,
                          category: e.target.value as 'Titan' | 'Mythic' | 'Godly',
                        })
                      }
                      className="px-2.5 py-2 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9]"
                    >
                      <option value="Titan">Titan</option>
                      <option value="Mythic">Mythic</option>
                      <option value="Godly">Godly</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      required
                      value={newProd.priceThb}
                      onChange={(e) => setNewProd({ ...newProd, priceThb: e.target.value })}
                      placeholder="THB"
                      className="px-2.5 py-2 rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9] font-tabular"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg cursor-pointer"
                  >
                    {t('admin.addProductTitle')}
                  </button>
                </div>
              </form>
            </div>
          ) : tab === 'orders' ? (
            /* ============================================================
               TAB 3: ORDERS
               ============================================================ */
            <div className="space-y-3">
              {data?.orders.length === 0 ? (
                <p className="text-sm text-[#94A3B8] py-8 text-center">No orders yet.</p>
              ) : (
                data?.orders.map((ord) => {
                  const deliveredUsers =
                    ord.deliveredAccounts && ord.deliveredAccounts.length > 0
                      ? ord.deliveredAccounts.map((a) => a.username).join(', ')
                      : ord.deliveredAccountUsername || null;

                  return (
                    <div
                      key={ord.id}
                      className="p-4 rounded-xl bg-[#060913]/65 border border-[#E2E8F0]/12 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-tabular text-[#60A5FA] font-medium">{ord.id}</span>
                          <StatusBadge status={ord.status} />
                          <span className="font-tabular text-[#64748B]">
                            {formatBangkokTimestamp(ord.createdAt, locale)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-[#F1F5F9]">
                          {ord.productNameSnapshot} × {ord.quantity} ·{' '}
                          <span className="font-tabular text-[#10B981]">
                            {formatThbFromSatang(ord.totalSatang)}
                          </span>
                        </p>
                        <p className="text-[#94A3B8]">
                          Buyer: <span className="text-[#E2E8F0]">{ord.username}</span>
                          {deliveredUsers && (
                            <>
                              {' '}
                              · Delivered Account(s):{' '}
                              <span className="font-tabular text-[#60A5FA]">{deliveredUsers}</span>
                            </>
                          )}
                        </p>
                      </div>

                      {ord.status !== 'REFUNDED' && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            value={deliveryNotes[ord.id] ?? ord.adminDeliveryNote ?? ''}
                            onChange={(e) =>
                              setDeliveryNotes((prev) => ({ ...prev, [ord.id]: e.target.value }))
                            }
                            placeholder={t('admin.deliveryNotePlaceholder')}
                            className="px-3 py-2 text-xs rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] min-w-[200px]"
                          />
                          {ord.status === 'PENDING_DELIVERY' && (
                            <button
                              type="button"
                              onClick={() => void handleOrderAction(ord.id, 'DELIVERED')}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#10B981] hover:bg-[#059669] rounded-lg cursor-pointer whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t('admin.markDelivered')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleOrderAction(ord.id, 'REFUNDED')}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#FCA5A5] border border-[#EF4444]/35 bg-[#EF4444]/10 hover:bg-[#EF4444]/20 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{t('admin.refundOrder')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : tab === 'topups' ? (
            /* ============================================================
               TAB 4: TOP-UP REVIEWS
               ============================================================ */
            <div className="space-y-4">
              {data?.storeConfig && (
                <div className="p-4 rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 text-xs">
                    <p className="font-semibold text-[#60A5FA]">
                      {locale === 'th'
                        ? 'บัญชีรับเงินเจ้าของร้าน (TrueMoney Wallet ซองอั่งเปา)'
                        : 'Active Owner Payout Account (TrueMoney Gift Voucher)'}
                    </p>
                    <p className="text-sm font-medium text-[#F1F5F9]">
                      {data.storeConfig.truemoneyAccountName} ·{' '}
                      <span className="font-tabular text-[#E2E8F0]">
                        {data.storeConfig.truemoneyPhoneMasked}
                      </span>
                    </p>
                    <p className="text-[#94A3B8]">
                      {locale === 'th'
                        ? 'รับชำระผ่านซองอั่งเปา TrueMoney เท่านั้น หากรายการใดติดรอตรวจสอบ คุณสามารถกดคัดลอกลิงก์ซองอั่งเปาเพื่อเปิดรับเงินเข้าวอลเล็ตแล้วกดอนุมัติยอดให้ลูกค้าได้ทันที'
                        : 'TrueMoney Gift Voucher only. If any voucher is queued for manual review, copy the full Gift Voucher link below to claim it into your wallet and approve the credit.'}
                    </p>
                  </div>
                </div>
              )}
              {data?.topups.length === 0 ? (
                <p className="text-sm text-[#94A3B8] py-8 text-center">No top-up records yet.</p>
              ) : (
                data?.topups.map((tx) => {
                  const isVoucherRevealed = Boolean(revealedVoucherIds[tx.id]);
                  const hasFullVoucher = Boolean(tx.voucherUrlFull);

                  return (
                    <div
                      key={tx.id}
                      className="p-4 rounded-xl bg-[#060913]/65 border border-[#E2E8F0]/12 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 text-xs min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-tabular text-[#60A5FA] font-medium">{tx.id}</span>
                          <StatusBadge status={tx.status} />
                          <span className="text-[#94A3B8]">{tx.channel}</span>
                        </div>
                        <p className="text-sm text-[#F1F5F9]">
                          User: <span className="font-medium">{tx.username}</span> · Requested:{' '}
                          <span className="font-tabular">
                            {formatThbFromSatang(tx.requestedSatang)}
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-2 font-tabular text-[#94A3B8]">
                          <span className="break-all">
                            Ref:{' '}
                            {isVoucherRevealed && tx.voucherUrlFull
                              ? tx.voucherUrlFull
                              : tx.voucherUrlMasked || tx.slipReference || '—'}
                          </span>
                          <span className="text-[#64748B]">
                            · {formatBangkokTimestamp(tx.createdAt, locale)}
                          </span>
                        </div>

                        {hasFullVoucher && tx.voucherUrlFull && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void handleCopyVoucherUrl(tx.id, tx.voucherUrlFull!)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#60A5FA] border border-[#3B82F6]/35 bg-[#3B82F6]/12 hover:bg-[#3B82F6]/22 rounded-lg transition-colors cursor-pointer"
                            >
                              {copiedVoucherId === tx.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                  <span className="text-[#6EE7B7]">{t('admin.copiedVoucher')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>{t('admin.copyVoucher')}</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setRevealedVoucherIds((prev) => ({
                                  ...prev,
                                  [tx.id]: !prev[tx.id],
                                }))
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-[#94A3B8] border border-[#E2E8F0]/14 hover:text-white hover:bg-white/6 rounded-lg transition-colors cursor-pointer"
                            >
                              {isVoucherRevealed ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>{t('admin.hideVoucher')}</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{t('admin.showVoucher')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </div>

                      {tx.status === 'NEEDS_REVIEW' || tx.status === 'PENDING' ? (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={1}
                            step="1"
                            value={verifiedAmounts[tx.id] ?? String(tx.requestedSatang / 100)}
                            onChange={(e) =>
                              setVerifiedAmounts((prev) => ({ ...prev, [tx.id]: e.target.value }))
                            }
                            aria-label={t('admin.verifiedBahtLabel')}
                            className="w-28 px-3 py-2 text-xs font-tabular rounded-lg bg-[#0D1321] border border-[#E2E8F0]/15 text-[#F1F5F9]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              void handleTopupAction(tx.id, 'COMPLETED', tx.requestedSatang)
                            }
                            className="px-3.5 py-2 text-xs font-medium text-white bg-[#10B981] hover:bg-[#059669] rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            {t('admin.approveTopup')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleTopupAction(tx.id, 'FAILED', tx.requestedSatang)
                            }
                            className="px-3.5 py-2 text-xs font-medium text-[#FCA5A5] border border-[#EF4444]/35 bg-[#EF4444]/10 rounded-lg cursor-pointer whitespace-nowrap"
                          >
                            {t('admin.rejectTopup')}
                          </button>
                        </div>
                      ) : (
                        <span className="font-tabular text-sm font-medium text-[#10B981] shrink-0">
                          {formatThbFromSatang(tx.creditedSatang, true)}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* ============================================================
               TAB 5: SECURITY & BANS
               ============================================================ */
            <div className="space-y-8">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#F1F5F9]">Accounts</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data?.users.map((u) => (
                    <div
                      key={u.id}
                      className="p-3.5 rounded-lg bg-[#060913]/65 border border-[#E2E8F0]/12 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-medium text-[#F1F5F9]">
                          {u.username}{' '}
                          <span className="font-tabular text-[#64748B]">({u.role})</span>
                        </p>
                        <p className="text-[#94A3B8]">
                          {u.email} ·{' '}
                          <span className="font-tabular">
                            {u.isInfiniteBalance
                              ? '∞ ฿'
                              : formatThbFromSatang(u.balanceSatang)}
                          </span>
                        </p>
                      </div>
                      {u.id !== user.id && u.role !== 'OWNER' && (
                        <button
                          type="button"
                          onClick={() => void handleToggleBanUser(u.id, !u.isBanned)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                            u.isBanned
                              ? 'border-[#10B981]/35 text-[#10B981] bg-[#10B981]/10'
                              : 'border-[#EF4444]/35 text-[#FCA5A5] bg-[#EF4444]/10'
                          }`}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{u.isBanned ? t('admin.unbanUser') : t('admin.banUser')}</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#F1F5F9]">{t('admin.banIpTitle')}</h2>
                <form onSubmit={handleBlockIp} className="flex flex-wrap gap-2 text-xs">
                  <input
                    value={ipToBan}
                    onChange={(e) => setIpToBan(e.target.value)}
                    placeholder={t('admin.banIpPlaceholder')}
                    className="px-3 py-2 rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] font-tabular"
                  />
                  <input
                    value={ipReason}
                    onChange={(e) => setIpReason(e.target.value)}
                    placeholder={t('admin.banReasonPlaceholder')}
                    className="flex-1 min-w-[180px] px-3 py-2 rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 font-medium text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-lg cursor-pointer"
                  >
                    {t('admin.blockIpButton')}
                  </button>
                </form>

                {data?.bannedIps && data.bannedIps.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {data.bannedIps.map((b) => (
                      <div
                        key={b.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-xs"
                      >
                        <span className="font-tabular text-[#FCA5A5]">{b.maskedIp}</span>
                        <span className="text-[#94A3B8]">· {b.reason}</span>
                        <button
                          type="button"
                          onClick={() => void handleRemoveIpBan(b.id)}
                          aria-label={t('admin.unblock')}
                          className="text-[#FCA5A5] hover:text-white cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#F1F5F9]">Global Security Audit Log</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px] text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E8F0]/12 text-[#94A3B8]">
                        <th className="py-2 pr-3 font-medium">Event</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">IP / Device</th>
                        <th className="py-2 pr-3 font-medium">Metadata</th>
                        <th className="py-2 text-right font-medium">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0]/10">
                      {data?.activityLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 pr-3 font-medium text-[#F1F5F9]">
                            {t(`events.${log.eventType}`)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <StatusBadge status={log.status} />
                          </td>
                          <td className="py-2.5 pr-3 text-[#94A3B8]">
                            <span className="font-tabular text-[#E2E8F0]">{log.maskedIp}</span> ·{' '}
                            {log.deviceSummary}
                          </td>
                          <td className="py-2.5 pr-3 text-[#94A3B8] max-w-[220px] truncate">
                            {log.metadata || '—'}
                          </td>
                          <td className="py-2.5 text-right font-tabular text-[#64748B] whitespace-nowrap">
                            {formatBangkokTimestamp(log.createdAt, locale)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
