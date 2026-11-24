import { ReactNode, MouseEvent } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  elevated?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = '',
  interactive = false,
  elevated = false,
  onClick,
}: GlassCardProps) {
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    event.currentTarget.style.setProperty('--mouse-x', `${x}px`);
    event.currentTarget.style.setProperty('--mouse-y', `${y}px`);
  };

  return (
    <div
      onMouseMove={handleMouseMove}
      onClick={onClick}
      className={`${elevated ? 'glass-surface-elevated' : 'glass-surface'} ${
        interactive ? 'glass-specular-interactive' : ''
      } rounded-xl ${className}`}
    >
      {children}
    </div>
  );
}
