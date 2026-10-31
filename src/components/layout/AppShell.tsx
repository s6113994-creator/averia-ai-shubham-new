import { useState, useEffect, ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { User } from '@supabase/supabase-js';
import {
  Plus, Search, Image as ImageIcon, TrendingUp, MessageSquare, Globe,
  MoreVertical, Copy, Sparkles, LogOut, Crown, PanelLeftClose, PanelLeft, FolderOpen,
  ShieldCheck, LayoutDashboard, Settings,
} from 'lucide-react';
import { AveriaLogo } from '@/components/AveriaLogo';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { NotificationCenter } from '@/components/NotificationCenter';
import { AccountSwitcher } from '@/components/joint/AccountSwitcher';
import { GlobalProfileAnchor } from '@/components/GlobalProfileAnchor';
import { useScope } from '@/lib/scope';


interface Conv { id: string; title: string; updated_at: string; }
interface Proj { id: string; title: string; created_at: string; metadata: any; }

const VELO_KEY = 'averia.model.velo';
const ENGINE_KEY = 'averia.model.active';

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  if (!user) return <>{children}</>;
  return <AuthenticatedAppShell user={user} signOut={signOut}>{children}</AuthenticatedAppShell>;
}

function AuthenticatedAppShell({ children, user, signOut }: { children: ReactNode; user: User; signOut: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const scope = useScope();
  const profileContext: 'personal' | 'joint' = scope.isJoint ? 'joint' : 'personal';

  const [open, setOpen] = useState(!isMobile);
  useEffect(() => { setOpen(!isMobile); }, [isMobile]);

  const [chatSearch, setChatSearch] = useState('');
  const [convs, setConvs] = useState<Conv[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [highlightConv, setHighlightConv] = useState<Conv | null>(null);
  const [highlightText, setHighlightText] = useState<string>('');

  const refreshConvs = async () => {
    if (!user) return;
    // Strict profile-context isolation: joint scope loads shared_ai_conversations
    // for the active workspace only; personal scope loads the caller's own ai_conversations only.
    if (profileContext === 'joint' && scope.workspaceId) {
      const { data } = await supabase
        .from('shared_ai_conversations')
        .select('id, title, updated_at')
        .eq('workspace_id', scope.workspaceId)
        .order('updated_at', { ascending: false })
        .limit(30);
      setConvs((data as any) || []);
    } else {
      const { data } = await supabase
        .from('ai_conversations')
        .select('id, title, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(30);
      setConvs((data as any) || []);
    }
  };
  const refreshProjects = async () => {
    if (!user) return;
    // Feed / project partitioning by environment_context tag.
    const envTag = profileContext; // 'personal' | 'joint'
    const { data } = await supabase
      .from('vault_items')
      .select('id, title, created_at, metadata, environment_context')
      .eq('user_id', user.id)
      .eq('vault_type', 'agentic')
      .eq('kind', 'project')
      .order('created_at', { ascending: false })
      .limit(40);
    const filtered = (data || []).filter((p: any) => (p.environment_context || 'personal') === envTag);
    setProjects(filtered as any);
  };
  useEffect(() => {
    // Cleanup on profile switch — wipe residual state instantly then refetch clean.
    setConvs([]);
    setProjects([]);
    setActiveConvId(null);
    refreshConvs(); refreshProjects();
    const onChange = () => { refreshConvs(); refreshProjects(); };
    const onActive = (e: any) => setActiveConvId(e?.detail?.id ?? null);
    window.addEventListener('averia:vault-changed', onChange);
    window.addEventListener('averia:conv-changed', onChange);
    window.addEventListener('averia:active-conv', onActive as any);
    return () => {
      window.removeEventListener('averia:vault-changed', onChange);
      window.removeEventListener('averia:conv-changed', onChange);
      window.removeEventListener('averia:active-conv', onActive as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profileContext, scope.workspaceId]);

  const newChat = () => {
    navigate('/averia-ai');
    window.dispatchEvent(new CustomEvent('averia:new-chat'));
    if (isMobile) setOpen(false);
  };
  const selectConv = (id: string) => {
    setActiveConvId(id);
    navigate('/averia-ai');
    window.dispatchEvent(new CustomEvent('averia:select-conv', { detail: { id } }));
    if (isMobile) setOpen(false);
  };
  const startImage = () => {
    navigate('/averia-ai?q=' + encodeURIComponent('Generate an image of '));
    if (isMobile) setOpen(false);
  };
  const goto = (path: string) => { navigate(path); if (isMobile) setOpen(false); };

  const filteredConvs = chatSearch.trim()
    ? convs.filter(c => (c.title || '').toLowerCase().includes(chatSearch.toLowerCase()))
    : convs;

  const displayName =
    (user.user_metadata as any)?.full_name || (user.user_metadata as any)?.name || user.email?.split('@')[0] || 'User';
  const avatarUrl = (user.user_metadata as any)?.avatar_url || null;

  const copyThread = async (conv: Conv) => {
    const { data } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    const txt = (data || []).map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    try {
      await navigator.clipboard.writeText(txt || conv.title);
      toast.success('Copied full thread');
    } catch { toast.error('Copy failed'); }
  };
  const highlight = async (conv: Conv) => {
    const { data } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });
    const bullets = (data || []).slice(-8)
      .map((m: any) => `• ${m.role === 'user' ? 'You' : 'Averia'}: ${(m.content || '').replace(/\s+/g, ' ').slice(0, 140)}`)
      .join('\n');
    setHighlightConv(conv);
    setHighlightText(bullets || 'No messages yet.');
  };

  const sidebarWidth = open ? (isMobile ? '80vw' : 256) : 0;

  const Sidebar = (
    <motion.aside
      initial={false}
      animate={{ width: sidebarWidth }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className={`shrink-0 bg-sidebar flex flex-col overflow-x-hidden overflow-y-hidden [&_*]:box-border ${
        isMobile ? 'fixed top-0 bottom-0 left-0 z-[60] shadow-2xl' : 'relative z-30'
      }`}
      style={{ width: sidebarWidth as any, maxWidth: sidebarWidth as any }}
    >
      {/* ================= ZONE A — Fixed Top ================= */}
      <div className="shrink-0 sticky top-0 z-20 bg-sidebar">
        {/* Brand row */}
        <div className="h-14 px-4 flex items-center justify-between gap-2">
          <Link to="/averia-ai" className="flex items-center gap-2 min-w-0" onClick={() => isMobile && setOpen(false)}>
            <div className="w-7 h-7 flex items-center justify-center shrink-0"><AveriaLogo size="sm" /></div>
            <span className="font-heading font-semibold text-[15px] tracking-wide truncate" style={{ color: '#FFFFFF' }}>
              Averia AI
            </span>
          </Link>
          <button
            onClick={() => goto('/pricing')}
            data-preserve-global-button
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-md hover:bg-secondary transition-all"
          >
            Upgrade
          </button>
          <button
            onClick={() => setOpen(false)}
            className="bg-transparent border-0 shadow-none p-1.5 text-[#EDEDED] hover:text-white cursor-pointer h-7 w-7 rounded-md flex items-center justify-center transition-colors shrink-0"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="p-2.5 space-y-1.5">
          <button
            onClick={newChat}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-full bg-white/[0.07] text-[15px] font-medium hover:bg-white/[0.12] transition truncate"
          >
            <Plus className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">New chat</span>
          </button>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-[17px] w-[17px] text-muted-foreground pointer-events-none" />
            <input
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
              placeholder="Search chats"
              className="w-full h-12 pl-11 pr-3 rounded-full bg-white/[0.04] border-0 text-[15px] outline-none focus:bg-white/[0.08] placeholder:text-muted-foreground/80"
            />
          </div>

          <button
            onClick={startImage}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-full text-[15px] text-foreground/90 hover:bg-white/[0.07] transition truncate"
          >
            <ImageIcon className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">Images</span>
          </button>
          <button onClick={() => goto('/dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-full text-[15px] hover:bg-white/[0.07] transition truncate ${location.pathname.startsWith('/dashboard') ? 'bg-white/10 text-foreground font-medium' : 'text-foreground/90'}`}>
            <LayoutDashboard className="h-[18px] w-[18px] shrink-0" /> <span className="truncate">Dashboard</span>
          </button>
        </div>
      </div>

      {/* ================= Unified lower navigation and history scroll ================= */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => goto('/news')} className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-3 text-sm transition hover:bg-white/[0.07] ${location.pathname === '/news' || location.pathname === '/debunked' ? 'bg-white/10 text-foreground font-medium' : 'text-foreground/90'}`}>
            <Globe className="h-[18px] w-[18px] shrink-0" /><span className="truncate">News</span>
          </button>
          <button onClick={() => goto('/trade')} className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-3 text-sm transition hover:bg-white/[0.07] ${location.pathname.startsWith('/trade') ? 'bg-white/10 text-foreground font-medium' : 'text-foreground/90'}`}>
            <TrendingUp className="h-[18px] w-[18px] shrink-0" /><span className="truncate">Trade</span>
          </button>
          <button onClick={() => goto('/chat')} className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-3 text-sm transition hover:bg-white/[0.07] ${location.pathname === '/chat' ? 'bg-white/10 text-foreground font-medium' : 'text-foreground/90'}`}>
            <MessageSquare className="h-[18px] w-[18px] shrink-0" /><span className="truncate">User chats</span>
          </button>
          <button onClick={() => goto('/scanner')} className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-3 text-sm transition hover:bg-white/[0.07] ${location.pathname === '/scanner' ? 'bg-white/10 text-foreground font-medium' : 'text-foreground/90'}`}>
            <ShieldCheck className="h-[18px] w-[18px] shrink-0" /><span className="truncate">Verify</span>
          </button>
        </div>
        <button onClick={() => goto('/projects')} className={`mt-1 flex w-full items-center gap-3 rounded-full px-4 py-3 text-[15px] transition hover:bg-white/[0.07] ${location.pathname === '/projects' ? 'bg-white/10 text-foreground font-medium' : 'text-foreground/90'}`}>
          <FolderOpen className="h-[18px] w-[18px] shrink-0" /><span>All Projects</span>
        </button>

        <section className="mt-2 border-b border-white/5 pb-2">
          <div className="sticky top-0 z-10 bg-sidebar/95 px-3 pt-3 pb-1.5 text-xs tracking-wide text-muted-foreground backdrop-blur">Recent Projects</div>
          <div className="space-y-1">
          {projects.length === 0 && <div className="px-4 py-2.5 text-[14px] text-muted-foreground/80">No projects yet</div>}
          {projects.map(p => {
            const published = !!(p.metadata && (p.metadata as any).published);
            return (
              <button
                key={p.id}
                onClick={() => { navigate(`/averia-ai?project=${p.id}&resume=1`); if (isMobile) setOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-full text-[15px] text-foreground/90 hover:bg-white/[0.07] transition min-w-0"
              >
                <span className="truncate flex-1 text-left min-w-0">{p.title || 'Untitled Project'}</span>
                {published && <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/10 text-foreground/80 shrink-0">Live</span>}
              </button>
            );
          })}
          </div>
        </section>

        <div className="sticky top-0 z-10 bg-sidebar/95 px-5 pt-4 pb-1.5 text-[12px] tracking-wide text-muted-foreground backdrop-blur">Recent Chats</div>
        <div className="px-2.5 pb-4 space-y-1">
          {filteredConvs.length === 0 && <div className="px-4 py-2.5 text-[14px] text-muted-foreground/80">No conversations yet</div>}
          {filteredConvs.map(c => {
            const isActive = activeConvId === c.id;
            return (
              <div
                key={c.id}
                className={`group relative flex items-center rounded-full transition min-w-0 ${
                  isActive ? 'bg-white/10' : 'hover:bg-white/[0.07]'
                }`}
              >
                <button
                  onClick={() => selectConv(c.id)}
                  className={`flex-1 min-w-0 px-4 py-3 text-left text-[15px] truncate ${
                    isActive ? 'text-foreground font-medium' : 'text-foreground/90'
                  }`}
                  title={c.title}
                >
                  {c.title || 'New chat'}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition shrink-0"
                      aria-label="Chat options"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => copyThread(c)}>
                      <Copy className="h-4 w-4 mr-2" /> Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => highlight(c)}>
                      <Sparkles className="h-4 w-4 mr-2" /> Highlight
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>

        {/* Account controls stay in the same scroll region as navigation and history. */}
        <div className="mt-auto px-2.5 pb-3 pt-4 flex items-center gap-1.5 border-t border-white/5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 flex-1 min-w-0 hover:bg-white/[0.07] rounded-full px-2.5 py-2 transition">
                <UserAvatar url={avatarUrl} name={displayName} size="sm" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-[14px] font-medium truncate">{displayName}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-52 z-[120]" sideOffset={8} collisionPadding={12}>
              <DropdownMenuItem onClick={() => navigate('/dashboard')}>Dashboard</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/dashboard/settings')}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/pricing')}>
                <Crown className="h-4 w-4 mr-2" /> Upgrade
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={async () => { await signOut(); navigate('/'); }}>
                <LogOut className="h-4 w-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            onClick={() => navigate('/dashboard/settings')}
            className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/[0.07] transition"
            aria-label="Settings"
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <div className="flex items-center gap-0.5 shrink-0">
            <AccountSwitcher />
            <NotificationCenter />
          </div>
        </div>
      </div>

    </motion.aside>
  );

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {isMobile && open && (
        <div
          className="fixed inset-0 z-[55] bg-background/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}
      {Sidebar}

      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-app-chrome
          className="fixed top-3 left-3 z-[45] h-11 w-11 rounded-full bg-white/[0.07] backdrop-blur-xl flex items-center justify-center hover:bg-secondary/60 transition"
          aria-label="Open sidebar"
          title="Open sidebar"
        >
          <PanelLeft className="h-[18px] w-[18px]" />
        </button>
      )}

      {/* Global top-right profile anchor — uploaded DP, dual-avatar in Joint. Click => Dashboard. */}
      <GlobalProfileAnchor />


      <main className="app-ambient-mesh flex-1 min-w-0 overflow-auto relative pt-16 sm:pt-20 px-4 sm:px-6 md:px-8">
        {children}
      </main>


      <Dialog open={!!highlightConv} onOpenChange={(v) => !v && setHighlightConv(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Thread highlights
            </DialogTitle>
            <DialogDescription className="truncate">{highlightConv?.title}</DialogDescription>
          </DialogHeader>
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed bg-secondary/30 border border-border rounded-lg p-3 max-h-[50vh] overflow-auto">
            {highlightText}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
