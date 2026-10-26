import { Crown, BadgeCheck } from 'lucide-react';
import { motion } from 'framer-motion';

interface ProBadgeProps {
  variant?: 'small' | 'medium' | 'large';
  showText?: boolean;
}

export function ProBadge({ variant = 'small', showText = true }: ProBadgeProps) {
  const sizes = {
    small: {
      container: 'px-2 py-0.5 text-xs gap-1',
      icon: 'h-3 w-3',
    },
    medium: {
      container: 'px-3 py-1 text-sm gap-1.5',
      icon: 'h-4 w-4',
    },
    large: {
      container: 'px-4 py-2 text-base gap-2',
      icon: 'h-5 w-5',
    },
  };

  const config = sizes[variant];

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center ${config.container} rounded-full font-semibold`}
      style={{
        background: 'linear-gradient(135deg, hsl(210 100% 50%) 0%, hsl(220 100% 60%) 100%)',
        color: 'white',
        boxShadow: '0 0 12px hsla(210, 100%, 50%, 0.4)',
      }}
    >
      <BadgeCheck className={config.icon} />
      {showText && <span>Pro Verified</span>}
    </motion.span>
  );
}

interface ProCrownBadgeProps {
  className?: string;
}

export function ProCrownBadge({ className = '' }: ProCrownBadgeProps) {
  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`inline-flex items-center gap-1 px-2 py-1 bg-primary/20 text-primary text-xs rounded-full ${className}`}
    >
      <Crown className="h-3 w-3" />
      Pro Member
    </motion.span>
  );
}
