import { useEffect, useState } from 'react';
import { Share2, Check, X, LayoutDashboard, Brain, MessageSquare, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface JA {
  id: string; user_a: string; user_b: string;
  permissions_a: Record<string, boolean>;
  permissions_b: Record<string, boolean>;
}

interface PeerLabel { user_id: string; display_name: string | null; full_name: string | null; averia_id: string | null; }

const ITEMS = [
  { key: 'dashboard', label: 'Personal Dashboard',         icon: LayoutDashboard },
  { key: 'agentic',   label: 'Personal Averia Agentic AI', icon: Brain },
  { key: 'chat',      label: 'Personal User Chat',         icon: MessageSquare },
] as const;

/**
 * Personal-Dashboard widget: shows exactly what I'm sharing with each linked partner
 * and what each partner shares back with me.
 */
export function SharingSummaryCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<{ ja: JA; peer: PeerLabel | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: jas } = await supabase
        .from('joint_accounts')
        .select('id, user_a, user_b, permissions_a, permissions_b, active')
        .eq('active', true)
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
      const active = (jas || []) as unknown as JA[];
      if (active.length === 0) { setRows([]); setLoading(false); return; }
      const peerIds = active.map(j => j.user_a === user.id ? j.user_b : j.user_a);
      const { data: profiles } = await supabase
        .from('profiles').select('user_id, display_name, full_name, averia_id')
        .in('user_id', peerIds);
      const map = new Map((profiles || []).map(p => [p.user_id, p as PeerLabel]));
      setRows(active.map(ja => ({ ja, peer: map.get(ja.user_a === user.id ? ja.user_b : ja.user_a) ?? null })));
      setLoading(false);
    })();
  }, [user]);

  if (loading || rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-background p-4">
      <div className="flex items-center gap-2 mb-3">
        <Share2 className="h-4 w-4 text-primary" />
        <h3 className="font-heading font-bold text-sm">Active Shares</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{rows.length} link{rows.length > 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-3">
        {rows.map(({ ja, peer }) => {
          const mine = (user!.id === ja.user_a ? ja.permissions_a : ja.permissions_b) || {};
          const theirs = (user!.id === ja.user_a ? ja.permissions_b : ja.permissions_a) || {};
          const name = peer?.display_name || peer?.full_name || 'Partner';
          return (
            <div key={ja.id} className="rounded-xl border border-border/40 bg-background/40 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-3.5 w-3.5 text-primary" />
                <p className="font-heading font-semibold text-xs">with {name}</p>
                {peer?.averia_id && <span className="text-[10px] font-mono text-primary/80 ml-auto">{peer.averia_id}</span>}
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                <PermColumn title="You → Partner" perms={mine} />
                <PermColumn title="Partner → You" perms={theirs} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PermColumn({ title, perms }: { title: string; perms: Record<string, boolean> }) {
  return (
    <div className="rounded-lg border border-border/30 bg-secondary/20 p-2.5">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">{title}</p>
      <div className="space-y-1">
        {ITEMS.map(it => {
          const on = !!perms[it.key];
          const Icon = it.icon;
          return (
            <div key={it.key} className={`flex items-center gap-2 text-[11px] ${on ? 'text-foreground' : 'text-muted-foreground/60 line-through'}`}>
              <Icon className="h-3 w-3" />
              <span className="flex-1 truncate">{it.label}</span>
              {on
                ? <Check className="h-3 w-3 text-success" />
                : <X className="h-3 w-3 text-muted-foreground/40" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
