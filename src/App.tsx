import { useState, useEffect, useCallback } from 'react';
import { I18nProvider } from './context/I18nContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { AppRoute, Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { HomePage } from './pages/HomePage';
import { ShopPage } from './pages/ShopPage';
import { TopUpPage } from './pages/TopUpPage';
import { AuthPage } from './pages/AuthPage';
import { ProfilePage, ProfileTab } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';

function parseLocation(): { route: AppRoute; profileTab: ProfileTab } {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  const profileTab: ProfileTab =
    tabParam === 'activity' || tabParam === 'security' ? tabParam : 'purchases';

  if (pathname === '/topup') return { route: 'topup', profileTab };
  if (pathname === '/shop' || pathname === '/cart') return { route: 'shop', profileTab };
  if (pathname === '/profile') return { route: 'profile', profileTab };
  if (pathname === '/login') return { route: 'login', profileTab };
  if (pathname === '/register') return { route: 'register', profileTab };
  if (pathname === '/admin') return { route: 'admin', profileTab };
  return { route: 'home', profileTab };
}

function AppShell() {
  const initial = parseLocation();
  const [route, setRoute] = useState<AppRoute>(initial.route);
  const [profileTab, setProfileTab] = useState<ProfileTab>(initial.profileTab);

  useEffect(() => {
    const handlePopState = () => {
      const next = parseLocation();
      setRoute(next.route);
      setProfileTab(next.profileTab);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((nextRoute: AppRoute, query?: string) => {
    const pathMap: Record<AppRoute, string> = {
      home: '/',
      shop: '/shop',
      topup: '/topup',
      profile: '/profile',
      login: '/login',
      register: '/register',
      admin: '/admin',
    };

    const nextUrl = query ? `${pathMap[nextRoute]}?${query}` : pathMap[nextRoute];
    window.history.pushState({}, '', nextUrl);
    setRoute(nextRoute);

    if (nextRoute === 'profile' && query) {
      const params = new URLSearchParams(query);
      const t = params.get('tab');
      if (t === 'purchases' || t === 'activity' || t === 'security') {
        setProfileTab(t);
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleProfileTabChange = useCallback((nextTab: ProfileTab) => {
    setProfileTab(nextTab);
    window.history.replaceState({}, '', `/profile?tab=${nextTab}`);
  }, []);

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* 2% SVG Film-Grain Noise Overlay */}
      <div className="obsidian-noise" aria-hidden="true" />

      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar currentRoute={route} onNavigate={navigate} />

        <main className="flex-1">
          {route === 'home' && <HomePage onNavigate={navigate} />}
          {route === 'shop' && <ShopPage onNavigate={navigate} />}
          {route === 'topup' && <TopUpPage onNavigate={navigate} />}
          {route === 'login' && <AuthPage mode="login" onNavigate={navigate} />}
          {route === 'register' && <AuthPage mode="register" onNavigate={navigate} />}
          {route === 'profile' && (
            <ProfilePage
              initialTab={profileTab}
              onTabChange={handleProfileTabChange}
              onNavigate={navigate}
            />
          )}
          {route === 'admin' && <AdminPage />}
        </main>

        <Footer onNavigate={navigate} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <CartProvider>
          <AppShell />
        </CartProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
