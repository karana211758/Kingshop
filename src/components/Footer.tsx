import { useState } from 'react';
import { Camera, X, Shield } from 'lucide-react';
import { useTranslation } from '../context/I18nContext';
import { AppRoute } from './Navbar';

interface FooterProps {
  onNavigate: (route: AppRoute) => void;
}

type LegalModalType = 'terms' | 'privacy' | 'cookies' | null;

export function Footer({ onNavigate }: FooterProps) {
  const { t, locale } = useTranslation();
  const [activeModal, setActiveModal] = useState<LegalModalType>(null);
  const [prefCookiesEnabled, setPrefCookiesEnabled] = useState(true);

  return (
    <>
      <footer className="mt-20 border-t border-[#E2E8F0]/10 bg-[#060913]/85 pb-24 lg:pb-10">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#E2E8F0]/10">
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => onNavigate('home')}
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#F1F5F9] cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#3B82F6]" strokeWidth={1.5} aria-hidden="true" />
                <span>KING CAMERA SHOP</span>
              </button>
              <p className="text-xs text-[#94A3B8] max-w-md">{t('footer.disclaimer')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#94A3B8]">
              <button
                type="button"
                onClick={() => setActiveModal('terms')}
                className="hover:text-[#F1F5F9] transition-colors cursor-pointer"
              >
                {t('footer.terms')}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('privacy')}
                className="hover:text-[#F1F5F9] transition-colors cursor-pointer"
              >
                {t('footer.privacy')}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('cookies')}
                className="hover:text-[#F1F5F9] transition-colors cursor-pointer"
              >
                {t('footer.cookies')}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#64748B]">
            <p>{t('footer.copyright')}</p>
            <p className="font-tabular">UTC+07:00 · Asia/Bangkok</p>
          </div>
        </div>
      </footer>

      {activeModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="w-full max-w-lg glass-surface-elevated rounded-xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#E2E8F0]/12">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#3B82F6]" strokeWidth={1.5} />
                <h2 className="text-base font-semibold text-[#F1F5F9]">
                  {activeModal === 'terms'
                    ? t('footer.terms')
                    : activeModal === 'privacy'
                    ? t('footer.privacy')
                    : t('footer.cookies')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                aria-label={t('legal.close')}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            </div>

            {activeModal === 'terms' && (
              <div className="space-y-3 text-sm text-[#94A3B8] leading-relaxed">
                <p>
                  {locale === 'th'
                    ? 'สินค้าใน KING CAMERA SHOP เป็นไอเทมดิจิทัลสำหรับเกม Camera Tower Defense ยอดเครดิตในกระเป๋าเงินจะถูกบันทึกด้วยหน่วยสตางค์และตรวจสอบผ่านธุรกรรมฝั่งเซิร์ฟเวอร์เท่านั้น'
                    : 'All items sold on KING CAMERA SHOP are digital units for Camera Tower Defense. Wallet balances are denominated in integer satang and settled exclusively via server-side PostgreSQL transactions.'}
                </p>
                <p>
                  {locale === 'th'
                    ? 'กรุณาตรวจสอบชื่อผู้ใช้งาน Roblox ให้ถูกต้องก่อนกดยืนยัน หากไม่สามารถจัดส่งได้ แอดมินสามารถดำเนินการคืนเงินกลับเข้ากระเป๋าเงินแบบอัตโนมัติได้ทันที'
                    : 'Buyers are responsible for providing an accurate Roblox username at checkout. If an order cannot be delivered, an administrator may issue an atomic refund back to your KING CAMERA SHOP wallet.'}
                </p>
              </div>
            )}

            {activeModal === 'privacy' && (
              <div className="space-y-3 text-sm text-[#94A3B8] leading-relaxed">
                <p>
                  {locale === 'th'
                    ? 'เราเก็บเฉพาะชื่อผู้ใช้ อีเมล รหัสผ่านที่เข้ารหัสด้วย bcrypt และบันทึกความปลอดภัยแบบปิดบังเลข IP บางส่วน ไม่มีการขอหรือจัดเก็บเบอร์โทรศัพท์ของลูกค้า'
                    : 'We collect only your username, normalized email, salted bcrypt password hash, and masked IP security audit records. Customer phone numbers are never requested or stored.'}
                </p>
                <p>
                  {locale === 'th'
                    ? 'คุณสามารถตรวจสอบอุปกรณ์ที่เข้าสู่ระบบอยู่และยกเลิกเซสชันทั้งหมดได้ทุกเมื่อจากหน้าโปรไฟล์'
                    : 'You may inspect active device sessions and revoke all other sessions at any time from your Profile Security tab.'}
                </p>
              </div>
            )}

            {activeModal === 'cookies' && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-lg border border-[#E2E8F0]/12 bg-[#060913]/60 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#E2E8F0]">
                      {t('legal.essentialCookies')}
                    </p>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      {t('legal.essentialCookiesDesc')}
                    </p>
                  </div>
                  <span className="font-tabular text-xs text-[#10B981] shrink-0">ON</span>
                </div>

                <div className="p-3.5 rounded-lg border border-[#E2E8F0]/12 bg-[#060913]/60 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#E2E8F0]">
                      {t('legal.preferenceCookies')}
                    </p>
                    <p className="text-xs text-[#94A3B8] leading-relaxed">
                      {t('legal.preferenceCookiesDesc')}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefCookiesEnabled}
                    onClick={() => setPrefCookiesEnabled((prev) => !prev)}
                    className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
                      prefCookiesEnabled ? 'bg-[#3B82F6]' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                        prefCookiesEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#60A5FA] rounded-lg transition-colors cursor-pointer"
              >
                {activeModal === 'cookies' ? t('legal.savePreferences') : t('legal.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
