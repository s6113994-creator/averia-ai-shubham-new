import { Shield } from 'lucide-react';

interface TrustScoreBadgeProps {
  score: number;
  className?: string;
}

export function TrustScoreBadge({ score, className = '' }: TrustScoreBadgeProps) {
  const tone = score >= 40
    ? 'bg-white/[0.08] text-foreground/90'
    : 'bg-destructive/15 text-destructive';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-full ${tone} ${className}`}>
      <Shield className="h-3.5 w-3.5" />
      {score}%
    </span>
  );
}
