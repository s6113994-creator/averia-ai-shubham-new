import { useEffect, useState } from 'react';
import { ChevronsUpDown, Users, User as UserIcon, Brain } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEnvironment } from '@/contexts/EnvironmentContext';

interface JA {
  id: string;
  user_a: string;
  user_b: string;
  partner?: { full_name: string | null; display_name: string | null; averia_id: string };
}

export function AccountSwitcher() {
  const { user } = useAuth();
  const { currentEnvironmentMode, activeWorkspaceId, setMode } = useEnvironment();
  const [accounts, setAccounts] = useState<JA[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('joint_accounts')
        .select('*')
        .eq('active', true)
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
      const rows = (data ?? []) as JA[];
      const otherIds = rows.map((r) => (r.user_a === user.id ? r.user_b : r.user_a));
      const map: Record<string, any> = {};
      if (otherIds.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, full_name, display_name, averia_id')
          .in('user_id', otherIds);
        (profs ?? []).forEach((p: any) => { map[p.user_id] = p; });
      }
      setAccounts(rows.map((r) => ({ ...r, partner: map[r.user_a === user.id ? r.user_b : r.user_a] })));
    })();
  }, [user?.id]);

  if (!user) return null;

  const isJoint = currentEnvironmentMode === 'JOINT';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
            isJoint
              ? 'bg-gradient-to-r from-amber-500/30 to-primary/20 border-amber-400/50 text-amber-200'
              : 'bg-gradient-to-r from-primary/20 to-primary/5 border-primary/30 text-foreground'
          }`}
          title={isJoint ? 'Joint Brain Active' : 'Personal Brain Active'}
        >
          {isJoint ? <Users className="h-3.5 w-3.5" /> : <Brain className="h-3.5 w-3.5 text-primary" />}
          <span className="hidden sm:inline">{isJoint ? 'Joint Brain' : 'Personal Brain'}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 glass-card border-primary/20 p-2 z-[120]" sideOffset={8} collisionPadding={12}>
        <p className="px-2 pt-1 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Switch Environment</p>
        <button
          onClick={() => { setOpen(false); if (isJoint) setMode('PERSONAL'); }}
          className={`w-full flex items-center gap-2 p-2 rounded-md text-left ${!isJoint ? 'bg-primary/10' : 'hover:bg-primary/10'}`}
        >
          <UserIcon className="h-4 w-4 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">Personal Brain</p>
            <p className="text-[10px] text-muted-foreground">Your private Averia AI</p>
          </div>
          {!isJoint && <span className="text-[10px] font-bold text-primary">ACTIVE</span>}
        </button>
        {accounts.length > 0 && <div className="h-px bg-border/50 my-1" />}
        {accounts.map((a) => {
          const name = a.partner?.display_name || a.partner?.full_name || 'Joint Brain';
          const active = isJoint && activeWorkspaceId === a.id;
          return (
            <button
              key={a.id}
              onClick={() => { setOpen(false); if (!active) setMode('JOINT', a.id); }}
              className={`w-full flex items-center gap-2 p-2 rounded-md text-left ${active ? 'bg-amber-500/15' : 'hover:bg-primary/10'}`}
            >
              <Users className="h-4 w-4 text-amber-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">Joint w/ {name}</p>
                <p className="text-[10px] font-mono text-primary truncate">{a.partner?.averia_id}</p>
              </div>
              {active && <span className="text-[10px] font-bold text-amber-300">ACTIVE</span>}
            </button>
          );
        })}
        <p className="px-2 pt-2 pb-1 text-[10px] text-muted-foreground/70">
          Switching reloads the entire Averia AI into the chosen ecosystem.
        </p>

      </PopoverContent>
    </Popover>
  );
}
