import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ShieldCheck, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as any;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface Deal {
  id: string; creator_id: string; counterparty_id: string; title: string; terms: string;
  amount: number | null; status: string; signed_by: string[]; locked_hash: string | null; created_at: string;
}

/** Escrow deal locker — signed, immutable agreement records stored in the backend. */
export function EscrowDialog({
  open, onOpenChange, userId, peerId, envTag, onPosted,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  userId: string; peerId: string; envTag: string;
  onPosted: (title: string, dealId: string) => void;
}) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [title, setTitle] = useState('');
  const [terms, setTerms] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await sb.from('chat_escrow_deals').select('*')
      .eq('environment_context', envTag)
      .or(`and(creator_id.eq.${userId},counterparty_id.eq.${peerId}),and(creator_id.eq.${peerId},counterparty_id.eq.${userId})`)
      .order('created_at', { ascending: false });
    setDeals((data ?? []) as Deal[]);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, peerId, envTag]);

  const create = async () => {
    if (!title.trim() || !terms.trim()) return;
    setBusy(true);
    const hash = await sha256(`${title}|${terms}|${amount}|${userId}|${peerId}|${Date.now()}`);
    const { data, error } = await sb.from('chat_escrow_deals').insert({
      creator_id: userId, counterparty_id: peerId, environment_context: envTag,
      title: title.trim(), terms: terms.trim(),
      amount: amount ? Number(amount) : null,
      signed_by: [userId], locked_hash: hash,
    }).select().single();
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deal locked and signed');
    onPosted(title.trim(), data.id);
    setTitle(''); setTerms(''); setAmount('');
    load();
  };

  const sign = async (d: Deal) => {
    const signers = Array.from(new Set([...(d.signed_by ?? []), userId]));
    const status = signers.length >= 2 ? 'locked' : 'pending';
    const { error } = await sb.from('chat_escrow_deals').update({ signed_by: signers, status }).eq('id', d.id);
    if (error) { toast.error(error.message); return; }
    toast.success(status === 'locked' ? 'Agreement fully signed & frozen' : 'Signature recorded');
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-300" /> Escrow deal locker</DialogTitle>
          <DialogDescription className="text-xs">Freeze an immutable, dual-signed agreement record with this contact.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deal title" className="h-8 text-xs bg-secondary/40" />
          <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={4} placeholder="Terms of the agreement…" className="text-xs bg-secondary/40" />
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="Amount (optional)" className="h-8 text-xs bg-secondary/40" />
          <Button size="sm" className="w-full gap-1.5" disabled={busy || !title.trim() || !terms.trim()} onClick={create}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Lock & sign deal
          </Button>
        </div>

        <div className="max-h-56 overflow-y-auto thin-scroll space-y-1.5 pt-1">
          {deals.map((d) => {
            const signed = (d.signed_by ?? []).includes(userId);
            return (
              <div key={d.id} className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12px] font-semibold truncate">{d.title}</p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${d.status === 'locked'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/15 text-amber-200 border-amber-500/40'}`}>{d.status}</span>
                </div>
                <p className="text-[10px] text-muted-foreground whitespace-pre-wrap mt-0.5">{d.terms}</p>
                {d.amount != null && <p className="text-[10px] mt-0.5">Amount: {d.amount}</p>}
                <p className="text-[9px] font-mono text-muted-foreground truncate mt-0.5">#{d.locked_hash?.slice(0, 24)}</p>
                {!signed && d.status !== 'locked' && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1.5" onClick={() => sign(d)}>Counter-sign</Button>
                )}
              </div>
            );
          })}
          {deals.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-3">No deals recorded yet</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
