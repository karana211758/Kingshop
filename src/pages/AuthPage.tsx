import { useState, FormEvent } from 'react';
import {
  Eye,
  EyeOff,
  Check,
  X,
  AlertCircle,
  Lock,
  ArrowRight,
  Chrome,
} from 'lucide-react';
import { apiFetch, ApiError } from '../lib/api';
import { evaluatePasswordStrength } from '../lib/format';
import { useAuth, UserProfile } from '../context/AuthContext';
import { useTranslation } from '../context/I18nContext';
import { GlassCard } from '../components/GlassCard';
import { AppRoute } from '../components/Navbar';

interface AuthPageProps {
  mode: 'login' | 'register';
  onNavigate: (route: AppRoute) => void;
}

export function AuthPage({ mode, onNavigate }: AuthPageProps) {
  const { t } = useTranslation();
  const { applyAuthSession, signInWithGoogle } = useAuth();

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register fields (Username + Email only, NO phone number)
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = evaluatePasswordStrength(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const strengthLabel =
    strength.score <= 1
      ? t('auth.strengthWeak')
      : strength.score === 2
      ? t('auth.strengthFair')
      : strength.score === 3
      ? t('auth.strengthStrong')
      : t('auth.strengthExcellent');

  const strengthColor =
    strength.score <= 1
      ? 'bg-[#EF4444]'
      : strength.score === 2
      ? 'bg-[#F59E0B]'
      : strength.score === 3
      ? 'bg-[#3B82F6]'
      : 'bg-[#10B981]';

  const handleLoginSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: UserProfile; accessToken: string }>('/api/auth/login', {
        method: 'POST',
        body: {
          identifier: identifier.trim(),
          password: loginPassword,
        },
      });
      applyAuthSession(res.user, res.accessToken);
      onNavigate('profile');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setError(t('auth.rateLimited'));
        } else if (err.status === 401) {
          setError(t('auth.invalidCredentials'));
        } else {
          setError(err.message);
        }
      } else {
        setError(t('auth.invalidCredentials'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    if (!strength.isValid) {
      setError(t('auth.newPasswordPlaceholder'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch<{ user: UserProfile; accessToken: string }>('/api/auth/register', {
        method: 'POST',
        body: {
          username: username.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
        },
      });
      applyAuthSession(res.user, res.accessToken);
      onNavigate('profile');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to create account.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      onNavigate('profile');
    } catch (err: any) {
      setError(err?.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-10 sm:pt-16">
      <GlassCard elevated className="p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5">
          <div className="w-10 h-10 rounded-lg bg-[#3B82F6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#60A5FA] mb-3">
            <Lock className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F1F5F9]">
            {mode === 'login' ? t('auth.signInTitle') : t('auth.registerTitle')}
          </h1>
          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed">
            {mode === 'login' ? t('auth.signInSubtitle') : t('auth.registerSubtitle')}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-start gap-2 text-xs text-[#FCA5A5]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#EF4444]" strokeWidth={1.5} />
            <span>{error}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-id" className="block text-xs font-medium text-[#E2E8F0]">
                {t('auth.identifierLabel')}
              </label>
              <input
                id="login-id"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t('auth.identifierPlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="login-pw" className="block text-xs font-medium text-[#E2E8F0]">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="login-pw"
                  type={showLoginPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  className="w-full pl-3.5 pr-11 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  aria-label={showLoginPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#94A3B8] hover:text-[#E2E8F0] cursor-pointer"
                >
                  {showLoginPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg transition-colors active:scale-[0.98] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t('auth.submitSignIn')}</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="reg-username" className="block text-xs font-medium text-[#E2E8F0]">
                {t('auth.usernameLabel')}
              </label>
              <input
                id="reg-username"
                type="text"
                autoComplete="username"
                required
                minLength={3}
                maxLength={20}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-email" className="block text-xs font-medium text-[#E2E8F0]">
                {t('auth.emailLabel')}
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="reg-pw" className="block text-xs font-medium text-[#E2E8F0]">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative">
                <input
                  id="reg-pw"
                  type={showRegPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.newPasswordPlaceholder')}
                  className="w-full pl-3.5 pr-11 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((prev) => !prev)}
                  aria-label={showRegPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#94A3B8] hover:text-[#E2E8F0] cursor-pointer"
                >
                  {showRegPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>

              {/* Live Password Strength Meter */}
              {password.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1 flex-1 mr-3">
                      {[1, 2, 3, 4].map((bar) => (
                        <span
                          key={bar}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            strength.score >= bar ? strengthColor : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-medium text-[#E2E8F0]">{strengthLabel}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {[
                      { ok: strength.hasLength, label: t('auth.reqLength') },
                      { ok: strength.hasUpper, label: t('auth.reqUpper') },
                      { ok: strength.hasLower, label: t('auth.reqLower') },
                      { ok: strength.hasNumber, label: t('auth.reqNumber') },
                      { ok: strength.hasSymbol, label: t('auth.reqSymbol') },
                    ].map((req) => (
                      <span
                        key={req.label}
                        className={`inline-flex items-center gap-1 ${
                          req.ok ? 'text-[#10B981]' : 'text-[#64748B]'
                        }`}
                      >
                        {req.ok ? (
                          <Check className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        ) : (
                          <X className="w-3 h-3 shrink-0" strokeWidth={1.75} />
                        )}
                        <span>{req.label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="reg-confirm" className="block text-xs font-medium text-[#E2E8F0]">
                {t('auth.confirmPasswordLabel')}
              </label>
              <div className="relative">
                <input
                  id="reg-confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  className="w-full pl-3.5 pr-11 py-2.5 text-sm rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/15 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-[#94A3B8] hover:text-[#E2E8F0] cursor-pointer"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.5} />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
              {passwordMismatch && (
                <p className="text-xs text-[#EF4444]">{t('auth.passwordMismatch')}</p>
              )}
              {passwordsMatch && (
                <p className="text-xs text-[#10B981]">{t('auth.passwordMatch')}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting || passwordMismatch}
              className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg transition-colors active:scale-[0.98] inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t('auth.submitRegister')}</span>
              <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </form>
        )}

        <div className="relative flex items-center py-1">
          <div className="flex-1 border-t border-[#E2E8F0]/12" />
          <span className="px-3 text-xs text-[#64748B]">{t('auth.orContinueWith')}</span>
          <div className="flex-1 border-t border-[#E2E8F0]/12" />
        </div>

        <button
          type="button"
          disabled={googleLoading}
          onClick={() => void handleGoogleAuth()}
          className="w-full py-2.5 px-4 text-sm font-medium text-[#E2E8F0] bg-white/5 hover:bg-white/10 border border-[#E2E8F0]/15 rounded-lg transition-colors active:scale-[0.98] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Chrome className="w-4 h-4 text-[#60A5FA]" strokeWidth={1.5} />
          <span>{t('auth.googleSignIn')}</span>
        </button>

        <div className="pt-2 border-t border-[#E2E8F0]/10 text-center text-xs text-[#94A3B8]">
          {mode === 'login' ? (
            <>
              <span>{t('auth.noAccount')} </span>
              <button
                type="button"
                onClick={() => onNavigate('register')}
                className="text-[#60A5FA] hover:text-white font-medium cursor-pointer"
              >
                {t('nav.createAccount')}
              </button>
            </>
          ) : (
            <>
              <span>{t('auth.haveAccount')} </span>
              <button
                type="button"
                onClick={() => onNavigate('login')}
                className="text-[#60A5FA] hover:text-white font-medium cursor-pointer"
              >
                {t('nav.signIn')}
              </button>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
