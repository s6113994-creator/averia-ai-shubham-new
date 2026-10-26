import { ShieldCheck, XCircle } from 'lucide-react';

interface VerificationBadgeProps {
  score: number;
  debunked?: boolean;
  className?: string;
}

/**
 * Single source of truth for verification chips.
 * - Debunked mode → ONLY the red Debunked badge.
 * - Score < 50 → no badge at all.
 * - Otherwise → monochrome Verified chip.
 */
export function VerificationBadge({ score, debunked, className = '' }: VerificationBadgeProps) {
  if (debunked) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-full bg-destructive/15 text-destructive ${className}`}
        title="Debunked by Averia AI"
      >
        <XCircle className="h-3.5 w-3.5" />
        Debunked
      </span>
    );
  }
  if (score < 50) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-full bg-white/[0.08] text-foreground ${className}`}
      title="Verified by Averia AI"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Verified
    </span>
  );
}
