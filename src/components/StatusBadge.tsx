import { CheckCircle2, Clock3, AlertTriangle, XCircle } from 'lucide-react';
import { useTranslation } from '../context/I18nContext';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();

  let toneClasses = 'text-[#94A3B8] border-[#94A3B8]/25 bg-[#94A3B8]/8';
  let Icon = Clock3;

  if (['DELIVERED', 'COMPLETED', 'SUCCESS'].includes(status)) {
    toneClasses = 'text-[#10B981] border-[#10B981]/30 bg-[#10B981]/10';
    Icon = CheckCircle2;
  } else if (['PENDING_DELIVERY', 'PENDING', 'NEEDS_REVIEW'].includes(status)) {
    toneClasses = 'text-[#F59E0B] border-[#F59E0B]/30 bg-[#F59E0B]/10';
    Icon = status === 'NEEDS_REVIEW' ? AlertTriangle : Clock3;
  } else if (['REFUNDED', 'FAILED'].includes(status)) {
    toneClasses = 'text-[#EF4444] border-[#EF4444]/30 bg-[#EF4444]/10';
    Icon = XCircle;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap ${toneClasses}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span>{t(`status.${status}`)}</span>
    </span>
  );
}
