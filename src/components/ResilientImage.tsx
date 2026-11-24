import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  fallbackTitle: string;
  className?: string;
  loading?: 'eager' | 'lazy';
}

export function ResilientImage({
  src,
  alt,
  fallbackTitle,
  className = '',
  loading = 'lazy',
}: ResilientImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#0D1321] via-[#131C31] to-[#060913] text-[#94A3B8] p-6 text-center ${className}`}
      >
        <ImageOff className="w-5 h-5 text-[#64748B] mb-2" strokeWidth={1.5} aria-hidden="true" />
        <span className="text-xs font-medium text-[#E2E8F0]">{fallbackTitle}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
