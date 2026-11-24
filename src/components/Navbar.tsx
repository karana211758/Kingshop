import {
  Camera,
  Home,
  Wallet,
  ShoppingBag,
  User,
  Shield,
  LogOut,
  Languages,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useTranslation } from '../context/I18nContext';
import { formatThbFromSatang } from '../lib/format';

export type AppRoute =
  | 'home'
  | 'topup'
  | 'shop'
  | 'profile'
  | 'login'
  | 'register'
  | 'admin';

interface NavbarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute, query?: string) => void;
}

export function Navbar({ currentRoute, onNavigate }: NavbarProps) {
  const { user, logout } = useAuth();
  const { totalCount } = useCart();
  const { locale, toggleLocale, t } = useTranslation();

  const handleSignOut = async () => {
    await logout();
    onNavigate('home');
  };

  const navItems: { route: AppRoute; label: string; badge?: number }[] = [
    { route: 'home', label: t('nav.home') },
    { route: 'topup', label: t('nav.topup') },
    { route: 'shop', label: `${t('nav.shop')} / ${t('nav.cart')}`, badge: totalCount },
    { route: 'profile', label: t('nav.profile') },
  ];

  return (
    <>
      {/* Desktop & Mobile Top Frosted Glass Navbar */}
      <header className="sticky top-0 z-40 glass-surface border-x-0 border-t-0 rounded-none">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer group"
          >
            <span className="w-8 h-8 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/35 flex items-center justify-center text-[#60A5FA] group-hover:border-[#60A5FA]/60 transition-colors">
              <Camera className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="text-sm sm:text-base font-semibold tracking-tight text-[#F1F5F9]">
              KING CAMERA SHOP
            </span>
          </button>

          {/* Desktop Navigation Links */}
          <nav aria-label="Primary navigation" className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const active = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => onNavigate(item.route)}
                  className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-2 ${
                    active
                      ? 'text-white bg-white/8 border border-[#E2E8F0]/14'
                      : 'text-[#94A3B8] hover:text-[#F1F5F9] border border-transparent'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="font-tabular text-xs px-1.5 py-0.5 rounded bg-[#3B82F6] text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
            {(user?.role === 'ADMIN' || user?.role === 'OWNER') && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5 ${
                  currentRoute === 'admin'
                    ? 'text-white bg-[#3B82F6]/20 border border-[#3B82F6]/40'
                    : 'text-[#60A5FA] hover:text-white border border-transparent'
                }`}
              >
                <Shield className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                <span>{t('nav.admin')}</span>
              </button>
            )}
          </nav>

          {/* Right Controls: Live Balance Pill + EN/TH Toggle + Auth */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Persistent Live Balance Pill */}
            <button
              type="button"
              onClick={() => onNavigate(user ? 'topup' : 'login')}
              title={user?.isInfiniteBalance ? t('shop.ownerInfinite') : t('nav.balance')}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0D1321]/90 border transition-colors cursor-pointer whitespace-nowrap ${
                user?.isInfiniteBalance
                  ? 'border-[#3B82F6]/45 hover:border-[#60A5FA]'
                  : 'border-[#E2E8F0]/14 hover:border-[#3B82F6]/50'
              }`}
            >
              <Wallet className="w-3.5 h-3.5 text-[#3B82F6]" strokeWidth={1.5} aria-hidden="true" />
              <span className="font-tabular text-xs sm:text-sm font-medium text-[#E2E8F0]">
                {user?.isInfiniteBalance
                  ? '∞ ฿'
                  : formatThbFromSatang(user ? user.balanceSatang : 0)}
              </span>
              {user?.role === 'OWNER' && (
                <span className="hidden sm:inline text-[10px] font-tabular font-semibold tracking-wide text-[#60A5FA]">
                  OWNER
                </span>
              )}
            </button>

            {/* EN / TH Language Toggle */}
            <button
              type="button"
              onClick={toggleLocale}
              aria-label="Toggle language between English and Thai"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0D1321]/80 border border-[#E2E8F0]/14 hover:border-[#E2E8F0]/30 text-xs font-medium text-[#E2E8F0] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Languages className="w-3.5 h-3.5 text-[#94A3B8]" strokeWidth={1.5} aria-hidden="true" />
              <span className="font-tabular">{locale.toUpperCase()}</span>
            </button>

            {/* Desktop Auth / Account Actions */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('profile')}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#E2E8F0]/12 bg-white/4 hover:bg-white/8 text-xs font-medium text-[#E2E8F0] transition-colors cursor-pointer whitespace-nowrap max-w-[140px]"
                  >
                    <User className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{user.username}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    aria-label={t('nav.signOut')}
                    title={t('nav.signOut')}
                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0]/12 text-[#94A3B8] hover:text-white hover:border-[#E2E8F0]/30 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('login')}
                    className="px-3 py-1.5 text-xs font-medium text-[#E2E8F0] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t('nav.signIn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('register')}
                    className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap"
                  >
                    {t('nav.createAccount')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Frosted Floating Bottom Navigation Dock */}
      <nav
        aria-label="Mobile dock navigation"
        className="lg:hidden fixed bottom-3 left-3 right-3 z-40 glass-surface-elevated rounded-2xl px-2 py-1.5"
      >
        <div className="grid grid-cols-4 gap-1">
          {[
            { route: 'home' as AppRoute, label: t('nav.home'), Icon: Home },
            { route: 'shop' as AppRoute, label: t('nav.shop'), Icon: ShoppingBag, badge: totalCount },
            { route: 'topup' as AppRoute, label: t('nav.topup'), Icon: Wallet },
            { route: (user ? 'profile' : 'login') as AppRoute, label: user ? t('nav.profile') : t('nav.signIn'), Icon: User },
          ].map(({ route, label, Icon, badge }) => {
            const active =
              currentRoute === route || (route === 'login' && currentRoute === 'register');
            return (
              <button
                key={route}
                type="button"
                onClick={() => onNavigate(route)}
                className={`relative flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
                  active ? 'text-white bg-[#3B82F6]/20' : 'text-[#94A3B8] hover:text-[#E2E8F0]'
                }`}
              >
                <Icon className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                <span className="truncate max-w-full px-1">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="absolute top-1 right-4 font-tabular text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-[#3B82F6] text-white">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
