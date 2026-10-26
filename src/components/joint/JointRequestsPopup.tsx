import { useEffect, useState } from 'react';
import { Inbox, Check, X, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

interface Req {
  id: string;
  from_user: string;
  to_user: string;
  from_permissions: Record<string, boolean>;
  to_permissions: Record<string, boolean>;
  status: string;
  created_at: string;
  partner?: { full_name: string | null; averia_id: string | null };
}

const PERMISSION_KEYS = [
  { key: 'dashboard', label: 'Personal Dashboard' },
  { key: 'agentic',   label: 'Personal Averia AI' },
  { key: 'chat',      label: 'Personal Chat' },
] as const;

export function JointRequestsPopup({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [confirming, setConfirming] = useState<Req | null>(null);
  const [myPerms, setMyPerms] = useState<Record<string, boolean>>({});

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('joint_account_requests')
      .select('*')
      .or(`from_user.eq.${user.id},to_user.eq.${user.id}`)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as Req[];
    const otherIds = Array.from(new Set(rows.map((r) => (r.from_user === user.id ? r.to_user : r.from_user))));
    let profilesMap: Record<string, { full_name: string | null; averia_id: string | null }> = {};
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, full_name, averia_id')
        .in('user_id', otherIds);
      (profs ?? []).forEach((p: any) => { profilesMap[p.user_id] = { full_name: p.full_name, averia_id: p.averia_id }; });
    }
    const enriched = rows.map((r) => ({ ...r, partner: profilesMap[r.from_user === user.id ? r.to_user : r.from_user] }));
    setIncoming(enriched.filter((r) => r.to_user === user.id && r.status === 'pending'));
    setOutgoing(enriched.filter((r) => r.from_user === user.id));
  };

  useEffect(() => { if (open) load(); }, [open, user?.id]);

  const accept = async () => {
    if (!confirming || !user) return;
    const finalPerms = { ...confirming.to_permissions, ...myPerms };
    const { error: e1 } = await supabase
      .from('joint_account_requests')
      .update({ status: 'accepted', to_permissions: finalPerms })
      .eq('id', confirming.id);
    if (e1) { toast.error('Failed to accept'); return; }
    const { error: e2 } = await supabase.from('joint_accounts').insert({
      user_a: confirming.from_user,
      user_b: confirming.to_user,
      permissions_a: confirming.from_permissions,
      permissions_b: finalPerms,
    });
    if (e2) { toast.error('Failed to create joint account'); return; }
    toast.success('Joint Account created');
    setConfirming(null);
    setMyPerms({});
    load();
  };

  const decline = async (r: Req) => {
    await supabase.from('joint_account_requests').update({ status: 'declined' }).eq('id', r.id);
    toast.success('Declined');
    load();
  };

  const cancel = async (r: Req) => {
    await supabase.from('joint_account_requests').update({ status: 'cancelled' }).eq('id', r.id);
    load();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="glass-card border-primary/20 max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" /> Joint Account Requests
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">INCOMING</h3>
              {incoming.length === 0 && <p className="text-sm text-muted-foreground">No pending invites</p>}
              {incoming.map((r) => (
                <div key={r.id} className="rounded-lg border border-border/50 bg-secondary/20 p-3 mb-2">
                  <p className="font-medium">{r.partner?.full_name || r.partner?.averia_id || 'Someone'}</p>
                  <p className="text-xs text-muted-foreground mb-2">wants to form a Joint Account</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => { setConfirming(r); setMyPerms(r.to_permissions || {}); }}>
                      <Check className="h-3.5 w-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => decline(r)}>
                      <X className="h-3.5 w-3.5" /> Decline
                    </Button>
                  </div>
                </div>
              ))}
            </section>

            <section>
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">OUTGOING</h3>
              {outgoing.length === 0 && <p className="text-sm text-muted-foreground">No sent invites</p>}
              {outgoing.map((r) => (
                <div key={r.id} className="rounded-lg border border-border/50 bg-secondary/20 p-3 mb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.partner?.full_name || r.partner?.averia_id || '—'}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {r.status}
                    </p>
                  </div>
                  {r.status === 'pending' && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(r)}>Cancel</Button>
                  )}
                </div>
              ))}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirming} onOpenChange={(v) => { if (!v) setConfirming(null); }}>
        <DialogContent className="glass-card border-primary/20 max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm what you share</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border border-border/50 p-3 bg-secondary/20 space-y-1">
            {PERMISSION_KEYS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 py-1.5 cursor-pointer">
                <Checkbox
                  checked={!!myPerms[p.key]}
                  onCheckedChange={(v) => setMyPerms((s) => ({ ...s, [p.key]: !!v }))}
                />
                <span className="text-sm">{p.label}</span>
              </label>
            ))}
          </div>
          <Button onClick={accept} className="w-full">Create Joint Account</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
