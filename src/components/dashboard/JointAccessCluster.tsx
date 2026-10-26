import { useEffect, useState } from 'react';
import { LayoutDashboard, Brain, MessageSquare, Lock, MessagesSquare } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useScope } from '@/lib/scope';
import { toast } from 'sonner';

interface Props {
  peerName: string;
  peerId: string | null;
  mirrorPeer: boolean;
  onToggleMirror: () => void;
}

/**
 * Access cluster shown in JOINT scope. The first three icons reflect discrete
 * permissions granted (or revoked) by the partner. The "Joint Chat" icon is
 * always available — it opens the peer-to-peer chat thread inside the active
 * Joint Workspace and does not require partner grants.
 */
export function JointAccessCluster({ peerName, peerId, mirrorPeer, onToggleMirror }: Props) {
  const navigate = useNavigate();
  const scope = useScope();
  const [grants, setGrants] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!scope.workspaceId) { setGrants({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('get_peer_grants_to_me', { _workspace_id: scope.workspaceId });
      if (!cancelled && data) setGrants(data as Record<string, boolean>);
    })();
    return () => { cancelled = true; };
  }, [scope.workspaceId]);

  const btn = 'relative h-9 w-9 rounded-full bg-secondary/50 hover:bg-primary/20 border border-border/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors disabled:cursor-not-allowed';
  const lockedCls = 'opacity-40 pointer-events-none bg-secondary/20 border-dashed';

  const gated: Array<{ label: string; key: string; icon: typeof LayoutDashboard; action: () => void; active?: boolean }> = [
    { label: `${peerName}'s Dashboard`, key: 'dashboard', icon: LayoutDashboard, action: onToggleMirror, active: mirrorPeer },
    { label: `${peerName}'s Agentic AI`, key: 'agentic', icon: Brain, action: () => navigate('/averia-ai?mirror=peer') },
    { label: `${peerName}'s Chat History`, key: 'chat', icon: MessageSquare, action: () => navigate('/chat?mirror=peer') },
  ];

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground mr-1">Access</span>
      {gated.map((it) => {
        const granted = !!grants[it.key];
        const locked = !granted || !peerId;
        return (
          <Tooltip key={it.label}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={it.label}
                disabled={locked}
                onClick={() => locked ? toast.info(`${peerName} has not shared this yet`) : it.action()}
                className={`${btn} ${locked ? lockedCls : ''} ${it.active ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 hover:bg-amber-500/30' : ''}`}
              >
                <it.icon className="h-4 w-4" />
                {locked && (
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-destructive/80 flex items-center justify-center border border-background">
                    <Lock className="h-2 w-2 text-white" />
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{locked ? `${peerName} has not shared this` : it.label}</TooltipContent>
          </Tooltip>
        );
      })}

      {/* Always-on Joint Chat (peer-to-peer messaging inside the workspace) */}
      <div className="mx-1 h-6 w-px bg-border/40" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Joint Chat"
            onClick={() => peerId ? navigate(`/chat?peer=${encodeURIComponent(peerId)}&joint=1`) : toast.info('Partner not linked')}
            className={`${btn} bg-gradient-to-br from-primary/30 to-fuchsia-600/30 border-primary/40 text-primary hover:text-white hover:bg-primary`}
          >
            <MessagesSquare className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Joint Chat — message {peerName}</TooltipContent>
      </Tooltip>
    </div>
  );
}
