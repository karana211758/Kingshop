import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import enDict from '../../locales/en.json';
import thDict from '../../locales/th.json';

export type Locale = 'en' | 'th';

type DictShape = typeof enDict;

const DICTIONARIES: Record<Locale, DictShape> = {
  en: enDict,
  th: thDict as DictShape,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  t: (path: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readLocaleCookie(): Locale {
  if (typeof document === 'undefined') return 'en';
  const match = document.cookie.match(/(?:^|;\s*)kcs_lang=(en|th)/);
  return match ? (match[1] as Locale) : 'en';
}

function writeLocaleCookie(locale: Locale) {
  if (typeof document === 'undefined') return;
  document.cookie = `kcs_lang=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readLocaleCookie());

  useEffect(() => {
    document.documentElement.lang = locale;
    writeLocaleCookie(locale);
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
  };

  const toggleLocale = () => {
    setLocaleState((prev) => (prev === 'en' ? 'th' : 'en'));
  };

  const t = (keyPath: string): string => {
    const parts = keyPath.split('.');
    let cursor: unknown = DICTIONARIES[locale];
    for (const part of parts) {
      if (cursor && typeof cursor === 'object' && part in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[part];
      } else {
        cursor = undefined;
        break;
      }
    }
    if (typeof cursor === 'string') return cursor;

    // Fallback to English dictionary
    let fallback: unknown = DICTIONARIES.en;
    for (const part of parts) {
      if (fallback && typeof fallback === 'object' && part in (fallback as Record<string, unknown>)) {
        fallback = (fallback as Record<string, unknown>)[part];
      } else {
        return keyPath;
      }
    }
    return typeof fallback === 'string' ? fallback : keyPath;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, toggleLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within I18nProvider');
  }
  return ctx;
}
