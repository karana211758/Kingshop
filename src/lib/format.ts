export function formatThbFromSatang(satang: number, showSign = false): string {
  const baht = satang / 100;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(baht));

  if (showSign) {
    if (satang > 0) return `+${formatted} ฿`;
    if (satang < 0) return `-${formatted} ฿`;
  }
  return satang < 0 ? `-${formatted} ฿` : `${formatted} ฿`;
}

export function formatBangkokTimestamp(isoOrDate: string | Date, locale: 'en' | 'th' = 'en'): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatBangkokDate(isoOrDate: string | Date, locale: 'en' | 'th' = 'en'): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  hasLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  isValid: boolean;
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const hasLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const passed = [hasLength, hasUpper, hasLower, hasNumber, hasSymbol].filter(Boolean).length;
  let score: 0 | 1 | 2 | 3 | 4 = 0;
  if (password.length > 0) {
    if (passed <= 2) score = 1;
    else if (passed === 3) score = 2;
    else if (passed === 4) score = 3;
    else score = 4;
  }

  return {
    score,
    hasLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSymbol,
    isValid: hasLength && hasUpper && hasLower && hasNumber && hasSymbol,
  };
}
