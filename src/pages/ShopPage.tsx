import { useState, useEffect, FormEvent } from 'react';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Wallet,
  ArrowRight,
  Lock,
  Copy,
  Check,
  KeyRound,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { formatThbFromSatang } from '../lib/format';
import { ProductItem, useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/I18nContext';
import { GlassCard } from '../components/GlassCard';
import { ResilientImage } from '../components/ResilientImage';
import { AppRoute } from '../components/Navbar';

interface ShopPageProps {
  onNavigate: (route: AppRoute, query?: string) => void;
}

interface DeliveredAccountEntry {
  username: string;
  password: string;
  note?: string;
}

interface CompletedOrderReceipt {
  orders: {
    id: string;
    productNameSnapshot: string;
    quantity: number;
    totalSatang: number;
    deliveredAccountUsername?: string | null;
    deliveredAccountPassword?: string | null;
    deliveredAccounts?: DeliveredAccountEntry[];
  }[];
  totalPaidSatang: number;
  balanceSatang: number;
  isInfiniteBalance?: boolean;
}

const CATEGORIES = ['ALL', 'Titan', 'Mythic', 'Godly'] as const;

export function ShopPage({ onNavigate }: ShopPageProps) {
  const { locale, t } = useTranslation();
  const { user, refreshBalance } = useAuth();
  const { items, totalSatang, addItem, updateQty, removeItem, clearCart } = useCart();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('ALL');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<CompletedOrderReceipt | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ products: ProductItem[] }>('/api/products');
      setProducts(res.products);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProducts();
  }, []);

  const visibleProducts =
    category === 'ALL'
      ? products
      : products.filter((p) => p.category.toLowerCase() === category.toLowerCase());

  const insufficientBalance = Boolean(
    user && !user.isInfiniteBalance && totalSatang > user.balanceSatang
  );

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCheckout = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!user) {
      onNavigate('login');
      return;
    }
    if (items.length === 0) return;

    setSubmitting(true);
    try {
      const res = await apiFetch<CompletedOrderReceipt>('/api/orders/checkout', {
        method: 'POST',
        body: {
          items: items.map((entry) => ({
            productId: entry.product.id,
            quantity: entry.quantity,
          })),
        },
      });
      setReceipt(res);
      clearCart();
      await Promise.all([refreshBalance(), loadProducts()]);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Checkout failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F1F5F9]">
            {t('shop.title')}
          </h1>
          <p className="text-sm text-[#94A3B8]">{t('shop.subtitle')}</p>
        </div>

        <div
          role="tablist"
          aria-label="Filter shop units"
          className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#0D1321]/90 border border-[#E2E8F0]/12 self-start sm:self-auto"
        >
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            const label =
              cat === 'ALL'
                ? t('shop.allCategories')
                : cat === 'Titan'
                ? t('shop.categoryTitan')
                : cat === 'Mythic'
                ? t('shop.categoryMythic')
                : t('shop.categoryGodly');
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  active ? 'bg-[#3B82F6] text-white' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 columns: Unit Catalog */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="glass-surface rounded-xl p-4 space-y-3 animate-pulse">
                  <div className="aspect-[4/3] rounded-lg bg-white/5" />
                  <div className="h-4 w-2/3 rounded bg-white/8" />
                  <div className="h-9 w-full rounded bg-white/6" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {visibleProducts.map((product) => {
                const name = locale === 'th' ? product.nameTh : product.nameEn;
                const desc = locale === 'th' ? product.descriptionTh : product.descriptionEn;
                const outOfStock = product.stock <= 0;

                return (
                  <GlassCard
                    key={product.id}
                    interactive
                    className="p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_45%,rgba(59,130,246,0.16),rgba(6,9,19,0.96)_76%)] border border-[#E2E8F0]/10 flex items-center justify-center">
                        <ResilientImage
                          src={product.imageUrl}
                          alt={name}
                          fallbackTitle={name}
                          className="w-full h-full object-contain p-4"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                          <span>
                            {product.category} · {product.rarity}
                          </span>
                          <span
                            className={`font-tabular ${
                              outOfStock ? 'text-[#EF4444]' : 'text-[#10B981]'
                            }`}
                          >
                            {outOfStock
                              ? t('shop.outOfStock')
                              : `${product.stock} ${t('shop.unitsLeft')}`}
                          </span>
                        </div>
                        <h2 className="text-base font-semibold text-[#F1F5F9]">{name}</h2>
                        <p className="text-xs text-[#94A3B8] leading-relaxed">{desc}</p>
                        {product.hasAutoAccountDelivery && (
                          <p className="text-[11px] font-medium text-[#60A5FA] pt-0.5">
                            {t('shop.autoDeliveryTag')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E2E8F0]/10 flex items-center justify-between gap-3">
                      <span className="font-tabular text-lg font-semibold text-[#E2E8F0]">
                        {formatThbFromSatang(product.priceSatang)}
                      </span>
                      <button
                        type="button"
                        disabled={outOfStock}
                        onClick={() => {
                          setReceipt(null);
                          addItem(product, 1);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-40 rounded-lg transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                        <span>{t('shop.addToCart')}</span>
                      </button>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>

        {/* Right 5 columns: Sticky Atomic Checkout Cart */}
        <div className="lg:col-span-5 lg:sticky lg:top-24">
          <GlassCard elevated className="p-6 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]/12">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#3B82F6]" strokeWidth={1.5} />
                <h2 className="text-base font-semibold text-[#F1F5F9]">
                  {t('shop.cartTitle')}
                </h2>
              </div>
              {user && (
                <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
                  <Wallet className="w-3.5 h-3.5 text-[#3B82F6]" strokeWidth={1.5} />
                  <span className="font-tabular text-[#E2E8F0]">
                    {user.isInfiniteBalance
                      ? `∞ ฿ (${t('shop.ownerInfinite')})`
                      : formatThbFromSatang(user.balanceSatang)}
                  </span>
                </div>
              )}
            </div>

            {receipt ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30">
                  <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" strokeWidth={1.5} />
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[#F1F5F9]">
                      {t('shop.orderSuccessTitle')}
                    </h3>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      {t('shop.orderSuccessSubtitle')}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  {receipt.orders.map((ord) => {
                    const deliveredList: DeliveredAccountEntry[] =
                      ord.deliveredAccounts && ord.deliveredAccounts.length > 0
                        ? ord.deliveredAccounts
                        : ord.deliveredAccountUsername
                        ? [
                            {
                              username: ord.deliveredAccountUsername,
                              password: ord.deliveredAccountPassword || '',
                            },
                          ]
                        : [];

                    return (
                      <div
                        key={ord.id}
                        className="p-3.5 rounded-lg bg-[#060913]/75 border border-[#E2E8F0]/12 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-tabular text-[#60A5FA]">{ord.id}</p>
                            <p className="text-[#E2E8F0] font-medium truncate">
                              {ord.productNameSnapshot} × {ord.quantity}
                            </p>
                          </div>
                          <span className="font-tabular text-sm font-semibold text-[#F1F5F9] shrink-0">
                            {formatThbFromSatang(ord.totalSatang)}
                          </span>
                        </div>

                        {deliveredList.length > 0 && (
                          <div className="p-3 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/30 space-y-2.5">
                            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#60A5FA]">
                              <span className="inline-flex items-center gap-1.5">
                                <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
                                <span>
                                  {t('shop.deliveredAccountTitle')}
                                  {deliveredList.length > 1 ? ` (${deliveredList.length})` : ''}
                                </span>
                              </span>
                            </div>
                            <div className="space-y-2">
                              {deliveredList.map((acc, idx) => (
                                <div
                                  key={`${ord.id}-acc-${idx}`}
                                  className="grid grid-cols-1 gap-1.5 font-tabular text-xs"
                                >
                                  {deliveredList.length > 1 && (
                                    <p className="text-[10px] text-[#94A3B8]">
                                      Account #{idx + 1}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between gap-2 bg-[#060913]/70 px-2.5 py-1.5 rounded border border-[#E2E8F0]/10">
                                    <span className="text-[#94A3B8] truncate">
                                      {t('shop.accountUsername')}:{' '}
                                      <strong className="text-[#F1F5F9] font-semibold">
                                        {acc.username}
                                      </strong>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleCopyText(`${ord.id}-${idx}-u`, acc.username)
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-[#60A5FA] hover:text-white cursor-pointer shrink-0"
                                    >
                                      {copiedField === `${ord.id}-${idx}-u` ? (
                                        <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 bg-[#060913]/70 px-2.5 py-1.5 rounded border border-[#E2E8F0]/10">
                                    <span className="text-[#94A3B8] truncate">
                                      {t('shop.accountPassword')}:{' '}
                                      <strong className="text-[#F1F5F9] font-semibold">
                                        {acc.password || '—'}
                                      </strong>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleCopyText(`${ord.id}-${idx}-p`, acc.password)
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-[#60A5FA] hover:text-white cursor-pointer shrink-0"
                                    >
                                      {copiedField === `${ord.id}-${idx}-p` ? (
                                        <Check className="w-3.5 h-3.5 text-[#10B981]" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                  {acc.note && (
                                    <p className="text-[11px] text-[#94A3B8] px-1">
                                      Note: {acc.note}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#E2E8F0]/12 text-xs">
                  <span className="text-[#94A3B8]">{t('topup.receiptBalance')}</span>
                  <span className="font-tabular text-sm font-semibold text-[#10B981]">
                    {receipt.isInfiniteBalance
                      ? '∞ ฿'
                      : formatThbFromSatang(receipt.balanceSatang)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate('profile', 'tab=purchases')}
                    className="px-4 py-2.5 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors cursor-pointer"
                  >
                    {t('shop.viewPurchases')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceipt(null)}
                    className="px-4 py-2.5 text-xs font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 hover:bg-white/6 rounded-lg transition-colors cursor-pointer"
                  >
                    {t('shop.continueShopping')}
                  </button>
                </div>
              </div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-sm font-medium text-[#E2E8F0]">{t('shop.cartEmpty')}</p>
                <p className="text-xs text-[#94A3B8] max-w-xs mx-auto leading-relaxed">
                  {t('shop.cartEmptyHint')}
                </p>
              </div>
            ) : (
              <form onSubmit={handleCheckout} className="space-y-5">
                <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                  {items.map((entry) => {
                    const label =
                      locale === 'th' ? entry.product.nameTh : entry.product.nameEn;
                    return (
                      <div
                        key={entry.product.id}
                        className="p-3 rounded-lg bg-[#060913]/65 border border-[#E2E8F0]/10 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-12 h-12 rounded-md overflow-hidden bg-[#0D1321] shrink-0 p-1">
                            <ResilientImage
                              src={entry.product.imageUrl}
                              alt={label}
                              fallbackTitle={label}
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#F1F5F9] truncate">{label}</p>
                            <p className="font-tabular text-xs text-[#94A3B8] mt-0.5">
                              {formatThbFromSatang(entry.product.priceSatang)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            onClick={() => updateQty(entry.product.id, entry.quantity - 1)}
                            className="w-7 h-7 rounded border border-[#E2E8F0]/14 flex items-center justify-center text-[#94A3B8] hover:text-white cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <span className="font-tabular text-xs w-6 text-center text-[#F1F5F9]">
                            {entry.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            disabled={entry.quantity >= entry.product.stock}
                            onClick={() => updateQty(entry.product.id, entry.quantity + 1)}
                            className="w-7 h-7 rounded border border-[#E2E8F0]/14 flex items-center justify-center text-[#94A3B8] hover:text-white disabled:opacity-40 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            type="button"
                            aria-label={t('shop.remove')}
                            onClick={() => removeItem(entry.product.id)}
                            className="w-7 h-7 rounded flex items-center justify-center text-[#94A3B8] hover:text-[#EF4444] ml-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Instant Account Vault Delivery Note */}
                <div className="p-3 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/25 flex items-start gap-2.5 text-[11px] text-[#BFDBFE] leading-relaxed">
                  <KeyRound className="w-4 h-4 text-[#60A5FA] shrink-0 mt-0.5" strokeWidth={1.5} />
                  <span>{t('shop.checkoutInfo')}</span>
                </div>

                {/* Total Summary */}
                <div className="p-3.5 rounded-lg bg-[#060913]/75 border border-[#E2E8F0]/12 flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8]">{t('shop.subtotal')}</span>
                  <span className="font-tabular text-lg font-semibold text-[#F1F5F9]">
                    {formatThbFromSatang(totalSatang)}
                  </span>
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-start gap-2 text-xs text-[#FCA5A5]">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#EF4444]" strokeWidth={1.5} />
                    <span>{error}</span>
                  </div>
                )}

                {!user ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('login')}
                    className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Lock className="w-4 h-4" strokeWidth={1.5} />
                    <span>{t('shop.signInRequired')}</span>
                  </button>
                ) : insufficientBalance ? (
                  <div className="space-y-2.5">
                    <div className="p-3 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-xs text-[#FCD34D]">
                      {t('shop.insufficientBalance')}
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('topup')}
                      className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Wallet className="w-4 h-4" strokeWidth={1.5} />
                      <span>{t('shop.goTopUp')}</span>
                      <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg transition-colors active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>
                      {submitting ? t('shop.processingOrder') : t('shop.completePurchase')}
                    </span>
                    <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                )}
              </form>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
