import { Eye, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AccessMirrorBanner({ peerName, onExit }: { peerName: string; onExit: () => void }) {
  return (
    <div className="sticky top-16 z-30 mb-4">
      <div className="glass-card border border-amber-400/40 bg-amber-500/10 text-amber-100 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <p className="text-xs sm:text-sm font-semibold truncate">
            Mirror access — viewing <span className="underline">{peerName}</span> · read-only
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit} className="h-7 px-2 text-amber-100 hover:bg-amber-500/20">
          <X className="h-3.5 w-3.5 mr-1" /> Exit
        </Button>
      </div>
    </div>
  );
}
