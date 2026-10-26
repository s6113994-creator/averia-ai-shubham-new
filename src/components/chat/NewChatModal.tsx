import { useEffect, useState } from 'react';
import { Search, MessageSquarePlus, Fingerprint } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ChatProfile {
  user_id: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  averia_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (p: ChatProfile) => void;
}

/** Live Averia-ID / name search against real profiles. Mirrors the Joint partner picker. */
export function NewChatModal({ open, onOpenChange, onPick }: Props) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ChatProfile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setQ(''); setItems([]); return; }
    let active = true;
    const term = q.trim();
    if (!term) { setItems([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const upper = term.toUpperCase();
      const idCandidate = upper.startsWith('AV-') ? upper : `AV-${upper}`;
      const { data } = await supabase
        .from('profiles')
        .select('user_id, full_name, display_name, avatar_url, averia_id')
        .neq('user_id', user?.id ?? '')
        .or(`averia_id.ilike.${idCandidate}%,display_name.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(12);
      if (active) { setItems((data ?? []) as ChatProfile[]); setLoading(false); }
    }, 220);
    return () => { active = false; clearTimeout(t); };
  }, [q, open, user?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card border-primary/20 max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" /> Find Contact by Averia ID
          </DialogTitle>
          <DialogDescription>
            Enter their 8-char Averia ID (e.g. <span className="font-mono text-primary">AV-JYQYZ3EB</span>). Name search also works.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="AV-XXXXXXXX or name…"
            className="pl-9 bg-secondary/40 font-mono uppercase placeholder:font-sans placeholder:normal-case"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1 thin-scroll">
          {!q.trim() && <p className="text-sm text-muted-foreground text-center py-6">Type an Averia ID or name to search</p>}
          {loading && q.trim() && <p className="text-sm text-muted-foreground text-center py-6">Searching…</p>}
          {!loading && q.trim() && items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No agent found</p>
          )}
          {items.map((p) => {
            const name = p.display_name || p.full_name || 'Unnamed';
            return (
              <button
                key={p.user_id}
                onClick={() => { onPick(p); onOpenChange(false); }}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-primary/10 transition-colors text-left border border-transparent hover:border-primary/30"
              >
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                  {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <span className="text-sm font-semibold">{name.charAt(0).toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{name}</p>
                  <p className="text-[11px] font-mono text-primary truncate">{p.averia_id}</p>
                </div>
                <MessageSquarePlus className="h-4 w-4 text-primary shrink-0" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
