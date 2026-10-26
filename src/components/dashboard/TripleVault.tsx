import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Lock, FileText, Image as ImageIcon, Video as VideoIcon, FolderKanban, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useReadOnlyScope } from '@/contexts/ReadOnlyScopeContext';
import { useScope } from '@/lib/scope';
import { VaultAddDialog, VaultKind } from './VaultAddDialog';
import { VaultPinGate, isPersonalVaultUnlocked, lockPersonalVault } from './VaultPinGate';
import { MediaPreviewModal } from './MediaPreviewModal';

type VaultType = 'public' | 'ghost' | 'agentic';
type Column = 'text' | 'photo' | 'video' | 'project';

interface VaultItem {
  id: string; vault_type: VaultType; kind: string;
  title: string | null; content: string | null; media_url: string | null;
  created_at: string; metadata?: any;
}

const TABS: { id: VaultType; label: string }[] = [
  { id: 'public',  label: 'Public Content' },
  { id: 'ghost',   label: 'Personal Content' },
  { id: 'agentic', label: 'Creation Content' },
];

function classify(item: VaultItem, vaultType: VaultType): Column {
  const url = item.media_url || '';
  if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url) || item.kind === 'video') return 'video';
  if (/\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url) || item.kind === 'image' || item.kind === 'photo') return 'photo';
  if (vaultType === 'agentic') return 'project';
  return 'text';
}

interface Props {
  userId?: string;
  peerWorkspaceId?: string;
}

export function TripleVault({ userId, peerWorkspaceId }: Props = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isReadOnly } = useReadOnlyScope();
  const { isJoint, workspaceId } = useScope();
  const envContext = isJoint && workspaceId ? `joint:${workspaceId}` : 'personal';
  const effectiveUserId = userId ?? user?.id;
  const isPeerMirror = !!peerWorkspaceId && !!userId && userId !== user?.id;

  const [active, setActive] = useState<VaultType>('public');
  const [filter, setFilter] = useState<Column>('text');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<VaultKind>('text');
  const [addVault, setAddVault] = useState<VaultType>('public');
  const [pinOpen, setPinOpen] = useState(false);
  const [pinResolved, setPinResolved] = useState(isPersonalVaultUnlocked());
  const [media, setMedia] = useState<{ kind: 'photo' | 'video'; url: string; title: string | null; caption: string | null } | null>(null);

  const load = async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    setItems([]); // hard wipe before fetching to prevent cross-scope bleed
    if (isPeerMirror && peerWorkspaceId && userId) {
      const { data, error } = await supabase.rpc('get_peer_vault_items', {
        _workspace_id: peerWorkspaceId, _target_user: userId, _vault_type: active,
      });
      if (error) { toast.error('Permission denied by peer for this vault'); setItems([]); }
      else setItems((data as VaultItem[]) ?? []);
      setLoading(false);
      return;
    }
    let q = supabase.from('vault_items').select('*')
      .eq('vault_type', active)
      .eq('environment_context', envContext)
      .order('created_at', { ascending: false });
    if (isJoint && workspaceId) {
      // Joint scope: show all posts from both peers tagged to this workspace
    } else {
      q = q.eq('user_id', effectiveUserId);
    }
    const { data } = await q;
    setItems((data as VaultItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [effectiveUserId, active, peerWorkspaceId, envContext]);

  // Default sub-filter per tab
  useEffect(() => {
    setFilter(active === 'agentic' ? 'project' : 'text');
  }, [active]);

  useEffect(() => {
    if (active !== 'ghost') return;
    if (isPeerMirror) return;
    if (!pinResolved) setPinOpen(true);
  }, [active, isPeerMirror, pinResolved]);

  useEffect(() => {
    if (isReadOnly) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { vault?: VaultType; kind?: VaultKind } | undefined;
      if (!detail?.vault || detail.vault === 'agentic') return;
      setActive(detail.vault);
      setAddVault(detail.vault);
      setAddKind(detail.kind ?? 'text');
      if (detail.vault === 'ghost' && !pinResolved) setPinOpen(true);
      else setAddOpen(true);
    };
    window.addEventListener('averia:vault-add', handler);
    return () => window.removeEventListener('averia:vault-add', handler);
  }, [isReadOnly, pinResolved]);

  const handleDelete = async (id: string) => {
    if (isReadOnly) return;
    const { error } = await supabase.from('vault_items').delete().eq('id', id);
    if (error) return toast.error('Could not delete');
    setItems(prev => prev.filter(i => i.id !== id));
    window.dispatchEvent(new CustomEvent('averia:vault-changed'));
    toast.success('Removed');
  };

  const onCreated = () => {
    load();
    window.dispatchEvent(new CustomEvent('averia:vault-changed'));
  };

  const filterOptions: { id: Column; label: string; icon: typeof FileText }[] = useMemo(() => {
    if (active === 'agentic') return [
      { id: 'project', label: 'Project', icon: FolderKanban },
      { id: 'photo',   label: 'Photo',   icon: ImageIcon },
      { id: 'video',   label: 'Video',   icon: VideoIcon },
    ];
    return [
      { id: 'text',  label: 'Text',  icon: FileText },
      { id: 'photo', label: 'Photo', icon: ImageIcon },
      { id: 'video', label: 'Video', icon: VideoIcon },
    ];
  }, [active]);

  const filtered = useMemo(
    () => items.filter(it => classify(it, active) === filter),
    [items, active, filter]
  );

  const personalLocked = active === 'ghost' && !pinResolved && !isPeerMirror;

  const openProject = (item: VaultItem) => {
    const projectId = item.metadata?.project_id || item.id;
    navigate(`/averia-ai?project=${encodeURIComponent(projectId)}&resume=${encodeURIComponent(item.id)}`);
  };

  return (
    <div id="triple-vault" className="space-y-3">
      {/* Primary tabs */}
      <div className="flex gap-1 p-1 rounded-full bg-secondary/40 border border-border/30 w-fit mx-auto sm:mx-0 overflow-x-auto">
        {TABS.map(tab => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'ghost' && !pinResolved && !isPeerMirror) { setPinOpen(true); return; }
                setActive(tab.id);
              }}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="vault-tab-pill"
                  className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-fuchsia-600 shadow"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                />
              )}
              <span className="relative flex items-center gap-1.5">
                {tab.id === 'ghost' && !pinResolved && !isPeerMirror && <Lock className="h-3 w-3" />}
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-filter chips (single row) */}
      {!personalLocked && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex gap-1 p-1 rounded-full bg-secondary/30 border border-border/20">
            {filterOptions.map(f => {
              const on = filter === f.id;
              const count = items.filter(it => classify(it, active) === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                    on ? 'bg-primary/20 text-primary border border-primary/40' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <f.icon className="h-3 w-3" /> {f.label}
                  <span className="text-[9px] opacity-70">({count})</span>
                </button>
              );
            })}
          </div>
          {!isReadOnly && active !== 'agentic' && (
            <Button size="sm" onClick={() => { setAddVault(active); setAddKind(filter === 'text' ? 'text' : filter === 'photo' ? 'photo' : 'video'); setAddOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add {filterOptions.find(f => f.id === filter)?.label}
            </Button>
          )}
        </div>
      )}

      {personalLocked ? (
        <div className="rounded-xl border border-border/40 bg-secondary/10 p-10 text-center">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm text-muted-foreground mb-3">Personal Vault is locked.</p>
          <Button size="sm" onClick={() => setPinOpen(true)}><Lock className="h-3.5 w-3.5 mr-1.5" /> Unlock with PIN</Button>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${active}-${filter}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-xl border border-border/40 bg-secondary/10 p-3 min-h-[200px]"
          >
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[0,1,2].map(i => <div key={i} className="h-32 rounded-lg bg-secondary/30 animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 py-12 text-center">— no {filterOptions.find(f => f.id === filter)?.label.toLowerCase()} entries yet —</p>
            ) : filter === 'photo' || filter === 'video' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filtered.map(item => (
                  <motion.div key={item.id} layout
                    className="group relative rounded-xl overflow-hidden border border-border/30 bg-background/40 hover:border-primary/40 transition-all cursor-pointer aspect-square"
                    onClick={() => item.media_url && setMedia({ kind: filter as 'photo'|'video', url: item.media_url, title: item.title, caption: item.content })}
                  >
                    {filter === 'photo' && item.media_url && (
                      <img src={item.media_url} alt={item.title || ''} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    )}
                    {filter === 'video' && item.media_url && (
                      <video src={item.media_url} className="absolute inset-0 w-full h-full object-cover" muted preload="metadata" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      {item.title && <p className="text-[11px] font-semibold text-white truncate">{item.title}</p>}
                      <p className="text-[9px] text-white/60">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                    {!isReadOnly && (
                      <Button variant="ghost" size="icon"
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        className="absolute top-1 right-1 h-7 w-7 bg-black/40 backdrop-blur opacity-0 group-hover:opacity-100 text-white hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : filter === 'project' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filtered.map(item => (
                  <motion.div key={item.id} layout
                    onClick={() => openProject(item)}
                    className="group cursor-pointer rounded-xl border border-border/30 bg-gradient-to-br from-primary/5 to-fuchsia-500/5 hover:border-primary/40 hover:from-primary/10 p-4 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                        <FolderKanban className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-heading font-semibold text-sm truncate">{item.title || 'Untitled project'}</p>
                        {item.content && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{item.content}</p>}
                        <div className="flex items-center gap-1.5 mt-2 text-[10px] text-primary">
                          <ExternalLink className="h-3 w-3" /> Resume in Averia AI
                        </div>
                      </div>
                      {!isReadOnly && (
                        <Button variant="ghost" size="icon"
                          onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(item => (
                  <motion.div key={item.id} layout
                    className="group rounded-lg border border-border/30 bg-background/40 hover:border-primary/40 p-3 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {item.title && <p className="text-sm font-semibold">{item.title}</p>}
                        {item.content && <p className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{item.content}</p>}
                        <p className="text-[10px] text-muted-foreground/60 mt-1.5">{new Date(item.created_at).toLocaleString()}</p>
                      </div>
                      {!isReadOnly && (
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}
                          className="shrink-0 h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      <VaultAddDialog
        open={addOpen} onOpenChange={setAddOpen}
        vaultType={addVault} initialKind={addKind}
        onCreated={onCreated}
      />

      <VaultPinGate
        open={pinOpen}
        onUnlocked={() => { setPinResolved(true); setPinOpen(false); setActive('ghost'); }}
        onCancel={() => { setPinOpen(false); if (active === 'ghost') setActive('public'); }}
      />

      <MediaPreviewModal
        open={!!media}
        onOpenChange={(o) => !o && setMedia(null)}
        kind={media?.kind ?? null}
        url={media?.url ?? null}
        title={media?.title}
        caption={media?.caption}
      />
    </div>
  );
}

export { lockPersonalVault };
