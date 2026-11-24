import { useState } from 'react';
import {
  Ticket,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch, ApiError } from '../lib/api';
import { formatThbFromSatang } from '../lib/format';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../context/I18nContext';
import { GlassCard } from '../components/GlassCard';
import { StatusBadge } from '../components/StatusBadge';
import { AppRoute } from '../components/Navbar';

interface TopUpPageProps {
  onNavigate: (route: AppRoute, query?: string) => void;
}

interface TopUpReceipt {
  referenceId: string;
  channel: 'TRUEMONEY_VOUCHER';
  status: 'COMPLETED' | 'NEEDS_REVIEW';
  creditedSatang: number;
  balanceSatang: number;
  note?: string;
}

const QUICK_AMOUNTS = [20, 30, 50, 100, 200, 300, 500, 1000];
const VOUCHER_REGEX = /^https:\/\/gift\.truemoney\.com\/campaign\/\?v=[a-zA-Z0-9]{10,48}$/;

export function TopUpPage({ onNavigate }: TopUpPageProps) {
  const { t } = useTranslation();
  const { user, refreshBalance } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [amountInput, setAmountInput] = useState('');
  const [voucherUrl, setVoucherUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<TopUpReceipt | null>(null);

  const numericAmount = Number(amountInput);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 10 && numericAmount <= 50000;
  const amountSatang = validAmount ? Math.round(numericAmount * 100) : 0;

  const voucherFormatValid = VOUCHER_REGEX.test(voucherUrl.trim());

  const handleConfirmTopUp = async () => {
    if (!validAmount || !voucherFormatValid) return;
    setError('');
    setSubmitting(true);
    try {
      const res = await apiFetch<TopUpReceipt>('/api/topup/confirm', {
        method: 'POST',
        body: {
          channel: 'TRUEMONEY_VOUCHER',
          amountThb: numericAmount,
          voucherUrl: voucherUrl.trim(),
        },
      });
      setReceipt(res);
      setStep(4);
      await refreshBalance();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Top-up submission failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setAmountInput('');
    setVoucherUrl('');
    setReceipt(null);
    setError('');
  };

  const stepLabels = [
    { num: 1, label: t('topup.step2') },
    { num: 2, label: t('topup.step3') },
    { num: 3, label: t('topup.step4') },
    { num: 4, label: t('topup.step5') },
  ];

  const channelDisplay = t('topup.channelVoucherName');

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-8">
      {/* Header & Horizontal 4-Step Progress Bar */}
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#F1F5F9]">
            {t('topup.title')}
          </h1>
          <p className="text-sm text-[#94A3B8]">{t('topup.subtitle')}</p>
        </div>

        <GlassCard className="p-3 sm:p-4 overflow-x-auto">
          <ol className="flex items-center justify-between min-w-[460px] gap-2">
            {stepLabels.map((item, idx) => {
              const isCompleted = step > item.num;
              const isActive = step === item.num;
              return (
                <li key={item.num} className="flex items-center flex-1 last:flex-none gap-2.5">
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`w-7 h-7 rounded-full font-tabular text-xs font-semibold flex items-center justify-center border transition-colors ${
                        isCompleted
                          ? 'bg-[#10B981]/20 border-[#10B981]/50 text-[#10B981]'
                          : isActive
                          ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                          : 'bg-[#060913]/70 border-[#E2E8F0]/15 text-[#64748B]'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5" strokeWidth={2} />
                      ) : (
                        item.num
                      )}
                    </span>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        isActive
                          ? 'text-[#F1F5F9]'
                          : isCompleted
                          ? 'text-[#E2E8F0]'
                          : 'text-[#64748B]'
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                  {idx < stepLabels.length - 1 && (
                    <div
                      className={`h-px flex-1 ${
                        step > item.num ? 'bg-[#10B981]/50' : 'bg-[#E2E8F0]/12'
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </GlassCard>
      </div>

      {!user ? (
        <GlassCard elevated className="p-8 text-center space-y-4 max-w-lg mx-auto">
          <Lock className="w-7 h-7 text-[#3B82F6] mx-auto" strokeWidth={1.5} />
          <p className="text-sm text-[#E2E8F0]">{t('topup.signInPrompt')}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors cursor-pointer"
            >
              {t('nav.signIn')}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="px-5 py-2.5 text-sm font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 hover:bg-white/6 rounded-lg transition-colors cursor-pointer"
            >
              {t('nav.createAccount')}
            </button>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Interactive Step Panels */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <GlassCard elevated className="p-6 sm:p-8 space-y-6">
                  {error && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 flex items-start gap-2.5 text-xs text-[#FCA5A5]"
                    >
                      <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" strokeWidth={1.5} />
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Active Channel Header */}
                  <div className="p-4 rounded-xl bg-[#3B82F6]/10 border border-[#3B82F6]/30 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span className="w-10 h-10 rounded-lg bg-[#3B82F6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA] shrink-0">
                        <Ticket className="w-5 h-5" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#F1F5F9] truncate">
                          {t('topup.channelVoucherName')}
                        </p>
                        <p className="text-xs text-[#94A3B8] truncate">
                          {t('topup.channelVoucherDesc')}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-medium text-[#10B981] shrink-0 hidden sm:inline">
                      {t('topup.channelVoucherBadge')}
                    </span>
                  </div>

                  {/* STEP 1: AMOUNT */}
                  {step === 1 && (
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-[#F1F5F9]">
                          {t('topup.amountHeading')}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#94A3B8]">
                          {t('topup.amountSubtext')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="topup-amount-thb"
                          className="block text-xs font-medium text-[#E2E8F0]"
                        >
                          {t('topup.amountLabel')}
                        </label>
                        <div className="relative">
                          <input
                            id="topup-amount-thb"
                            type="number"
                            min={10}
                            max={50000}
                            step="1"
                            value={amountInput}
                            onChange={(e) => setAmountInput(e.target.value)}
                            placeholder={t('topup.amountPlaceholder')}
                            className="w-full pl-4 pr-12 py-3 text-base font-tabular rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/18 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-tabular text-base font-semibold text-[#94A3B8] select-none">
                            ฿
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <p className="text-xs font-medium text-[#94A3B8]">
                          {t('topup.quickAmountLabel')}
                        </p>
                        <div className="grid grid-cols-4 gap-2.5">
                          {QUICK_AMOUNTS.map((preset) => {
                            const selected = numericAmount === preset;
                            return (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setAmountInput(String(preset))}
                                className={`py-2.5 px-2 text-xs sm:text-sm font-tabular font-medium rounded-lg border transition-colors active:scale-[0.98] cursor-pointer whitespace-nowrap ${
                                  selected
                                    ? 'bg-[#3B82F6] border-[#60A5FA] text-white'
                                    : 'bg-[#060913]/65 border-[#E2E8F0]/12 text-[#E2E8F0] hover:border-[#E2E8F0]/30'
                                }`}
                              >
                                {preset.toLocaleString('en-US')}฿
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="p-3.5 rounded-lg bg-[#3B82F6]/10 border border-[#3B82F6]/25 flex items-start gap-2.5 text-xs text-[#BFDBFE] leading-relaxed">
                        <Info className="w-4 h-4 text-[#60A5FA] shrink-0 mt-0.5" strokeWidth={1.5} />
                        <span>{t('topup.voucherAmountNote')}</span>
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={!validAmount}
                          onClick={() => {
                            setError('');
                            setStep(2);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-40 rounded-lg transition-colors active:scale-[0.98] cursor-pointer"
                        >
                          <span>{t('topup.continue')}</span>
                          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2: GIFT VOUCHER URL */}
                  {step === 2 && (
                    <div className="space-y-6">
                      <div className="space-y-2">
                        <label
                          htmlFor="voucher-url-input"
                          className="block text-xs font-medium text-[#E2E8F0]"
                        >
                          {t('topup.voucherUrlLabel')}
                        </label>
                        <input
                          id="voucher-url-input"
                          type="url"
                          value={voucherUrl}
                          onChange={(e) => setVoucherUrl(e.target.value)}
                          placeholder={t('topup.voucherUrlPlaceholder')}
                          className="w-full px-3.5 py-3 text-sm font-tabular rounded-lg bg-[#060913]/80 border border-[#E2E8F0]/18 text-[#F1F5F9] placeholder:text-[#64748B] focus:border-[#3B82F6] transition-colors"
                        />
                        {voucherUrl.trim().length > 0 && (
                          <p
                            className={`text-xs ${
                              voucherFormatValid ? 'text-[#10B981]' : 'text-[#EF4444]'
                            }`}
                          >
                            {voucherFormatValid
                              ? t('topup.voucherValid')
                              : t('topup.voucherInvalid')}
                          </p>
                        )}
                      </div>

                      <div className="p-4 rounded-lg bg-[#060913]/65 border border-[#E2E8F0]/12 space-y-2.5">
                        <h3 className="text-xs font-semibold text-[#E2E8F0]">
                          {t('topup.voucherGuideTitle')}
                        </h3>
                        <ol className="space-y-1.5 text-xs text-[#94A3B8] list-decimal list-inside leading-relaxed">
                          <li>{t('topup.voucherGuide1')}</li>
                          <li>{t('topup.voucherGuide2')}</li>
                          <li>{t('topup.voucherGuide3')}</li>
                        </ol>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setStep(1)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 hover:bg-white/6 rounded-lg transition-colors cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                          <span>{t('topup.back')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={!voucherFormatValid}
                          onClick={() => {
                            setError('');
                            setStep(3);
                          }}
                          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-40 rounded-lg transition-colors active:scale-[0.98] cursor-pointer"
                        >
                          <span>{t('topup.continue')}</span>
                          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: CONFIRM */}
                  {step === 3 && (
                    <div className="space-y-6">
                      <div className="space-y-1">
                        <h2 className="text-lg font-semibold text-[#F1F5F9]">
                          {t('topup.confirmHeading')}
                        </h2>
                        <p className="text-xs sm:text-sm text-[#94A3B8]">
                          {t('topup.confirmSubtext')}
                        </p>
                      </div>

                      <dl className="divide-y divide-[#E2E8F0]/10 rounded-lg border border-[#E2E8F0]/12 bg-[#060913]/65 text-sm">
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.confirmChannel')}</dt>
                          <dd className="text-xs sm:text-sm font-medium text-[#F1F5F9] text-right">
                            {channelDisplay}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.confirmAmount')}</dt>
                          <dd className="font-tabular text-sm font-semibold text-[#60A5FA]">
                            {formatThbFromSatang(amountSatang)}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.confirmDetail')}</dt>
                          <dd className="font-tabular text-xs text-[#E2E8F0] truncate max-w-[260px]">
                            {voucherUrl.trim()}
                          </dd>
                        </div>
                      </dl>

                      <div className="pt-2 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 hover:bg-white/6 rounded-lg transition-colors cursor-pointer"
                        >
                          <ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
                          <span>{t('topup.back')}</span>
                        </button>

                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleConfirmTopUp()}
                          className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] disabled:opacity-50 rounded-lg transition-colors active:scale-[0.98] cursor-pointer"
                        >
                          <span>
                            {submitting ? t('topup.submittingTopup') : t('topup.confirmButton')}
                          </span>
                          <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: DONE */}
                  {step === 4 && receipt && (
                    <div className="space-y-6">
                      <div
                        className={`p-4 rounded-xl border flex items-start gap-3 ${
                          receipt.status === 'COMPLETED'
                            ? 'bg-[#10B981]/10 border-[#10B981]/30'
                            : 'bg-[#F59E0B]/10 border-[#F59E0B]/30'
                        }`}
                      >
                        {receipt.status === 'COMPLETED' ? (
                          <CheckCircle2
                            className="w-6 h-6 text-[#10B981] shrink-0 mt-0.5"
                            strokeWidth={1.5}
                          />
                        ) : (
                          <AlertTriangle
                            className="w-6 h-6 text-[#F59E0B] shrink-0 mt-0.5"
                            strokeWidth={1.5}
                          />
                        )}
                        <div className="space-y-1">
                          <h2 className="text-lg font-semibold text-[#F1F5F9]">
                            {receipt.status === 'COMPLETED'
                              ? t('topup.doneCompleted')
                              : t('topup.doneNeedsReview')}
                          </h2>
                          {receipt.status === 'NEEDS_REVIEW' && (
                            <p className="text-xs text-[#FDE68A] leading-relaxed">
                              {t('topup.doneNeedsReviewNote')}
                            </p>
                          )}
                        </div>
                      </div>

                      <dl className="divide-y divide-[#E2E8F0]/10 rounded-lg border border-[#E2E8F0]/12 bg-[#060913]/65 text-sm">
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.receiptStatus')}</dt>
                          <dd>
                            <StatusBadge status={receipt.status} />
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.receiptRef')}</dt>
                          <dd className="font-tabular text-xs font-medium text-[#60A5FA]">
                            {receipt.referenceId}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.receiptChannel')}</dt>
                          <dd className="text-xs font-medium text-[#E2E8F0]">{channelDisplay}</dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.receiptCredited')}</dt>
                          <dd className="font-tabular text-base font-semibold text-[#10B981]">
                            {formatThbFromSatang(receipt.creditedSatang, true)}
                          </dd>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between gap-4">
                          <dt className="text-xs text-[#94A3B8]">{t('topup.receiptBalance')}</dt>
                          <dd className="font-tabular text-base font-semibold text-[#F1F5F9]">
                            {user?.isInfiniteBalance
                              ? '∞ ฿'
                              : formatThbFromSatang(receipt.balanceSatang)}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => onNavigate('shop')}
                          className="px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors cursor-pointer"
                        >
                          {t('topup.goToShop')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onNavigate('profile', 'tab=activity')}
                          className="px-5 py-2.5 text-sm font-medium text-[#E2E8F0] border border-[#E2E8F0]/15 hover:bg-white/6 rounded-lg transition-colors cursor-pointer"
                        >
                          {t('topup.viewProfileHistory')}
                        </button>
                        <button
                          type="button"
                          onClick={resetWizard}
                          className="px-4 py-2.5 text-xs font-medium text-[#94A3B8] hover:text-white transition-colors ml-auto cursor-pointer"
                        >
                          {t('topup.startAnother')}
                        </button>
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right Column: Always-Visible Sticky Glass "Top-up summary" Card */}
          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <GlassCard elevated className="p-6 space-y-5">
              <h2 className="text-base font-semibold text-[#F1F5F9] pb-3 border-b border-[#E2E8F0]/12">
                {t('topup.summaryTitle')}
              </h2>

              <dl className="space-y-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-xs text-[#94A3B8]">{t('topup.summaryAmount')}</dt>
                  <dd className="font-tabular text-sm font-medium text-[#E2E8F0]">
                    {validAmount ? formatThbFromSatang(amountSatang) : '—'}
                  </dd>
                </div>

                <div className="flex items-start justify-between gap-3">
                  <dt className="text-xs text-[#94A3B8] shrink-0">{t('topup.summaryChannel')}</dt>
                  <dd className="text-xs font-medium text-[#E2E8F0] text-right">
                    {channelDisplay}
                  </dd>
                </div>

                <div className="pt-4 border-t border-[#E2E8F0]/12 flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-medium text-[#E2E8F0]">
                    {t('topup.summaryTransfer')}
                  </dt>
                  <dd className="font-tabular text-xl font-semibold text-[#60A5FA]">
                    {validAmount ? formatThbFromSatang(amountSatang) : '—'}
                  </dd>
                </div>
              </dl>
            </GlassCard>
          </div>
        </div>
      )}
    </div>
  );
}
