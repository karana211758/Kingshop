import { useState, useEffect } from 'react';
import {
  ArrowRight,
  Wallet,
  ShieldCheck,
  Zap,
  Clock3,
  ShoppingBag,
  Plus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { apiFetch } from '../lib/api';
import { formatThbFromSatang } from '../lib/format';
import { ProductItem, useCart } from '../context/CartContext';
import { useTranslation } from '../context/I18nContext';
import { GlassCard } from '../components/GlassCard';
import { ResilientImage } from '../components/ResilientImage';
import { AppRoute } from '../components/Navbar';

const HERO_VAULT_IMAGE = '/src/assets/images/hero_king_camera_vault_1795430088861.jpg';
const CATEGORIES = ['ALL', 'Titan', 'Mythic', 'Godly'] as const;

interface HomePageProps {
  onNavigate: (route: AppRoute) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  const { locale, t } = useTranslation();
  const { addItem } = useCart();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('ALL');
  const [addedId, setAddedId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ products: ProductItem[] }>('/api/products')
      .then((res) => {
        if (active) setProducts(res.products);
      })
      .catch(() => {
        if (active) setProducts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleProducts =
    category === 'ALL'
      ? products
      : products.filter((p) => p.category.toLowerCase() === category.toLowerCase());

  const handleQuickAdd = (product: ProductItem) => {
    addItem(product, 1);
    setAddedId(product.id);
    window.setTimeout(() => setAddedId(null), 1200);
  };

  const handleBuyNow = (product: ProductItem) => {
    addItem(product, 1);
    onNavigate('shop');
  };

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8 sm:pt-12 space-y-16">
      {/* Asymmetric Obsidian Bento Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Main Proposition Tile */}
        <GlassCard elevated className="lg:col-span-7 p-6 sm:p-9 flex flex-col justify-between gap-8">
          <div className="space-y-5">
            <p className="font-tabular text-xs tracking-wider text-[#60A5FA]">
              {t('hero.kicker')}
            </p>
            <h1 className="text-[clamp(2rem,3.8vw,3.35rem)] font-semibold tracking-tight leading-[1.08] text-[#F1F5F9]">
              {t('hero.title')}
            </h1>
            <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed max-w-[56ch]">
              {t('hero.description')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate('shop')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              <span>{t('hero.browseCatalog')}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('topup')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-[#E2E8F0] bg-white/5 hover:bg-white/10 border border-[#E2E8F0]/14 rounded-lg transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
            >
              <Wallet className="w-4 h-4 text-[#60A5FA]" strokeWidth={1.5} aria-hidden="true" />
              <span>{t('hero.topUpWallet')}</span>
            </button>
          </div>
        </GlassCard>

        {/* Visual Showcase + Bento Stat Column */}
        <div className="lg:col-span-5 grid grid-cols-1 gap-5">
          <GlassCard className="overflow-hidden p-2">
            <div className="aspect-[16/9] w-full overflow-hidden rounded-lg bg-[#060913]">
              <ResilientImage
                src={HERO_VAULT_IMAGE}
                alt="KING CAMERA SHOP machined obsidian cinema vault pedestal"
                fallbackTitle="KING CAMERA SHOP"
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          </GlassCard>

          <div className="grid grid-cols-3 gap-3.5">
            <GlassCard className="p-4 flex flex-col justify-between gap-2">
              <Zap className="w-4 h-4 text-[#3B82F6]" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="font-tabular text-lg font-semibold text-[#F1F5F9]">
                  {t('hero.statInstantValue')}
                </p>
                <p className="text-xs font-medium text-[#E2E8F0] mt-0.5">
                  {t('hero.statInstantTitle')}
                </p>
              </div>
            </GlassCard>

            <GlassCard className="p-4 flex flex-col justify-between gap-2">
              <ShieldCheck className="w-4 h-4 text-[#10B981]" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="font-tabular text-lg font-semibold text-[#F1F5F9]">
                  {t('hero.statLedgerValue')}
                </p>
                <p className="text-xs font-medium text-[#E2E8F0] mt-0.5">
                  {t('hero.statLedgerTitle')}
                </p>
              </div>
            </GlassCard>

            <GlassCard className="p-4 flex flex-col justify-between gap-2">
              <Clock3 className="w-4 h-4 text-[#94A3B8]" strokeWidth={1.5} aria-hidden="true" />
              <div>
                <p className="font-tabular text-lg font-semibold text-[#F1F5F9]">
                  {t('hero.statDeliveryValue')}
                </p>
                <p className="text-xs font-medium text-[#E2E8F0] mt-0.5">
                  {t('hero.statDeliveryTitle')}
                </p>
              </div>
            </GlassCard>
          </div>
        </div>
      </section>

      {/* Featured Unit Catalog Grid */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F1F5F9]">
              {t('shop.title')}
            </h2>
            <p className="text-sm text-[#94A3B8]">{t('shop.subtitle')}</p>
          </div>

          <div
            role="tablist"
            aria-label="Filter units by category"
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

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-4xl">
            {[1, 2].map((skeleton) => (
              <div
                key={skeleton}
                className="glass-surface rounded-xl p-5 space-y-4 animate-pulse"
              >
                <div className="aspect-[4/3] rounded-lg bg-white/5" />
                <div className="h-4 w-2/3 rounded bg-white/8" />
                <div className="h-3 w-full rounded bg-white/5" />
                <div className="h-9 w-full rounded-lg bg-white/6" />
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`grid gap-6 ${
              visibleProducts.length <= 2
                ? 'grid-cols-1 sm:grid-cols-2 max-w-4xl'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
            }`}
          >
            {visibleProducts.map((product) => {
              const name = locale === 'th' ? product.nameTh : product.nameEn;
              const desc = locale === 'th' ? product.descriptionTh : product.descriptionEn;
              const outOfStock = product.stock <= 0;

              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <GlassCard
                    interactive
                    className="h-full flex flex-col justify-between p-5 gap-4"
                  >
                    <div className="space-y-4">
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-[radial-gradient(circle_at_50%_45%,rgba(59,130,246,0.16),rgba(6,9,19,0.96)_76%)] border border-[#E2E8F0]/10 flex items-center justify-center">
                        <ResilientImage
                          src={product.imageUrl}
                          alt={name}
                          fallbackTitle={name}
                          className="w-full h-full object-contain p-4 transition-transform duration-300 hover:scale-[1.04]"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-[#94A3B8]">
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
                        <h3 className="text-base font-semibold text-[#F1F5F9] leading-snug">
                          {name}
                        </h3>
                        <p className="text-xs text-[#94A3B8] leading-relaxed line-clamp-2">
                          {desc}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#E2E8F0]/10 space-y-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-tabular text-xl font-semibold text-[#E2E8F0]">
                          {formatThbFromSatang(product.priceSatang)}
                        </span>
                        {product.hasAutoAccountDelivery && (
                          <span className="text-[11px] font-medium text-[#60A5FA]">
                            {t('shop.autoDeliveryTag')}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => handleQuickAdd(product)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[#E2E8F0]/15 bg-white/4 hover:bg-white/10 text-[#E2E8F0] disabled:opacity-40 transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
                          <span>{addedId === product.id ? t('profile.copied') : t('shop.addToCart')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={outOfStock}
                          onClick={() => handleBuyNow(product)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#3B82F6] hover:bg-[#60A5FA] text-white disabled:opacity-40 transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
                        >
                          <span>{t('shop.buyNow')}</span>
                          <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
