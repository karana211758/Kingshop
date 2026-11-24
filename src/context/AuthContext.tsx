import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch, setMemoryAccessToken } from '../lib/api';

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
  isInfiniteBalance?: boolean;
  balanceSatang: number;
  totalToppedUpSatang: number;
  totalSpentSatang: number;
  createdAt: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  hasAdminAccount: boolean;
  requiresAdminSecret: boolean;
  activeSessionsCount: number;
  refreshUser: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  applyAuthSession: (user: UserProfile, accessToken: string) => void;
  signInWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAdminAccount, setHasAdminAccount] = useState(true);
  const [requiresAdminSecret, setRequiresAdminSecret] = useState(false);
  const [activeSessionsCount, setActiveSessionsCount] = useState(1);

  const refreshBalance = useCallback(async () => {
    try {
      const data = await apiFetch<{
        balanceSatang: number;
        totalToppedUpSatang: number;
        totalSpentSatang: number;
        activeSessions: number;
        role: string;
        isInfiniteBalance?: boolean;
      }>('/api/user/balance');
      setActiveSessionsCount(data.activeSessions);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              balanceSatang: data.balanceSatang,
              totalToppedUpSatang: data.totalToppedUpSatang,
              totalSpentSatang: data.totalSpentSatang,
              role: data.role,
              isInfiniteBalance: Boolean(data.isInfiniteBalance),
            }
          : prev
      );
    } catch {
      // Ignored when unauthenticated
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch<{
        user: UserProfile | null;
        hasAdminAccount: boolean;
        requiresAdminSecret?: boolean;
      }>('/api/auth/me');

      setHasAdminAccount(Boolean(data.hasAdminAccount));
      setRequiresAdminSecret(Boolean(data.requiresAdminSecret));

      if (data.user) {
        setUser(data.user);
        await refreshBalance();
        return;
      }

      // Try rotating refresh cookie once on initial load if access token expired
      try {
        const refreshed = await apiFetch<{ user: UserProfile; accessToken: string }>(
          '/api/auth/refresh',
          { method: 'POST', retryOnAuth: false }
        );
        setMemoryAccessToken(refreshed.accessToken);
        setUser(refreshed.user);
        await refreshBalance();
      } catch {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [refreshBalance]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const applyAuthSession = useCallback(
    (nextUser: UserProfile, accessToken: string) => {
      setMemoryAccessToken(accessToken);
      setUser(nextUser);
      void refreshBalance();
    },
    [refreshBalance]
  );

  const signInWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    const res = await apiFetch<{ user: UserProfile; accessToken: string }>('/api/auth/firebase', {
      method: 'POST',
      body: { idToken },
    });
    setMemoryAccessToken(res.accessToken);
    setUser(res.user);
    void refreshBalance();
    return res.user;
  }, [refreshBalance]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed clearing client memory regardless
    }
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore if not signed into Firebase
    }
    setMemoryAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        hasAdminAccount,
        requiresAdminSecret,
        activeSessionsCount,
        refreshUser,
        refreshBalance,
        applyAuthSession,
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
