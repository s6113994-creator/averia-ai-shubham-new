import { CSSProperties } from 'react';
import averiaLogo from '@/assets/averia-logo.png';

interface AveriaLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
  className?: string;
  animate?: boolean;
  style?: CSSProperties;
}

const sizeMap = {
  xs: 16,
  sm: 22,
  md: 32,
  lg: 44,
  xl: 64,
  hero: 128,
};

const PREMIUM_STYLE: CSSProperties = {
  imageRendering: 'crisp-edges' as const,
  objectFit: 'contain' as const,
};

export function AveriaLogo({ size = 'md', className = '', animate = false, style }: AveriaLogoProps) {
  const dim = sizeMap[size];
  const mergedStyle: CSSProperties = { ...PREMIUM_STYLE, ...style };

  return (
    <img
      src={averiaLogo}
      alt="Averia AI"
      width={dim}
      height={dim}
      className={`${animate ? 'animate-neural-pulse' : ''} ${className}`}
      style={mergedStyle}
      draggable={false}
    />
  );
}

export { PREMIUM_STYLE };
