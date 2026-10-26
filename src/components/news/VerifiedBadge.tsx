import { ShieldCheck } from 'lucide-react';

/** Compact monochrome verification chip — Gemini-style, no watermark text. */
export function VerifiedBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-full bg-black/50 text-foreground backdrop-blur-md ${className}`}
      title="Verified by Averia AI"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      Verified
    </span>
  );
}
