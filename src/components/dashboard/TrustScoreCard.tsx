import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Award, Crown, Plus, Globe2, EyeOff, FileText, Image as ImageIcon, Video as VideoIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useReadOnlyScope } from '@/contexts/ReadOnlyScopeContext';
import { useScope } from '@/lib/scope';
import { toast } from 'sonner';

interface KindCounts { text: number; photo: number; video: number; }
interface TrustData {
  score: number;
  level: string;
  publicCounts: KindCounts;
  personalTotal: number;
  creationTotal: number;
}

const GOAL = 500;

export function TrustScoreCard({ userId, name }: { userId?: string; name?: string } = {}) {
  const { user } = useAuth();
  const { isReadOnly } = useReadOnlyScope();
  const scope = useScope();
  const profileContext: 'personal' | 'joint' = scope.isJoint ? 'joint' : 'personal';
  const envTag = scope.isJoint && scope.workspaceId ? `joint:${scope.workspaceId}` : 'personal';
  const effectiveUserId = userId ?? user?.id;
  const [data, setData] = useState<TrustData | null>(null);
  const [loading, setLoading] = useState(true);

  const classify = (kind: string, mediaUrl: string | null): 'text' | 'photo' | 'video' => {
    const url = mediaUrl || '';
    if (/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(url) || kind === 'video') return 'video';
    if (/\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url) || kind === 'image' || kind === 'photo') return 'photo';
    return 'text';
  };

  const load = useCallback(async () => {
    if (!effectiveUserId) return;
    setLoading(true);
    const { data: items } = await supabase
      .from('vault_items')
      .select('vault_type, kind, media_url, environment_context')
      .eq('user_id', effectiveUserId);
    const publicCounts: KindCounts = { text: 0, photo: 0, video: 0 };
    let personalTotal = 0, creationTotal = 0;
    (items || []).forEach((r: any) => {
      const ctx = r.environment_context || 'personal';
      // Scope-isolate: only count items in the active profile's workspace container
      if (ctx !== envTag) return;
      if (r.vault_type === 'public') publicCounts[classify(r.kind, r.media_url)]++;
      else if (r.vault_type === 'ghost') personalTotal++;
      else if (r.vault_type === 'agentic') creationTotal++;
    });
    // Trust Score dynamically = aggregate count of actual visible items × 10 (matches backend formula & TripleVault tabs)
    const publicTotal = publicCounts.text + publicCounts.photo + publicCounts.video;
    const dynamicScore = publicTotal * 10;
    const level = dynamicScore >= 1000 ? 'Master Investigator'
      : dynamicScore >= 400 ? 'Sentinel'
      : dynamicScore >= 100 ? 'Scout' : 'Novice';
    setData({
      score: dynamicScore,
      level,
      publicCounts,
      personalTotal,
      creationTotal,
    });
    setLoading(false);
  }, [effectiveUserId, envTag]);

  useEffect(() => { load(); }, [load]);

  // Auto-claim Pro cycle when score reaches goal
  useEffect(() => {
    if (!data || isReadOnly || !user || effectiveUserId !== user.id) return;
    if (data.score < GOAL) return;
    (async () => {
      const { data: res } = await supabase.rpc('claim_ats_pro_cycle');
      if (res && (res as any).unlocked) {
        toast.success('🎉 Pro unlocked free for ₹499 plan — ATS cycle reset!', { duration: 6000 });
        load();
      }
    })();
  }, [data, isReadOnly, user, effectiveUserId, load]);

  // Refresh when external code dispatches "averia:vault-changed"
  useEffect(() => {
    const h = () => load();
    window.addEventListener('averia:vault-changed', h);
    return () => window.removeEventListener('averia:vault-changed', h);
  }, [load]);

  const openVault = (vault: 'public' | 'ghost', kind: 'text' | 'photo' | 'video') => {
    window.dispatchEvent(new CustomEvent('averia:vault-add', { detail: { vault, kind } }));
    document.getElementById('triple-vault')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading || !data) {
    return <div className="glass-card rounded-2xl p-6 h-40 animate-pulse bg-secondary/20" />;
  }

  const progress = Math.min(100, Math.round((data.score / GOAL) * 100));
  const gradient = data.score >= GOAL ? 'from-amber-400 via-yellow-500 to-amber-600' : 'from-purple-500 to-fuchsia-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-background via-background to-primary/10 p-5"
    >
      <div className={`absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-30 bg-gradient-to-br ${gradient}`} />

      <div className="flex items-start justify-between gap-4 relative">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3" /> {name ? `${name}'s Trust Score` : 'Averia Trust Score'}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <motion.span
              key={data.score}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="font-heading text-4xl font-bold gradient-text"
            >
              {data.score}
            </motion.span>
            <span className="text-xs text-muted-foreground">/ {GOAL} ATS</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isReadOnly && (
            <Popover>
              <PopoverTrigger asChild>
                <button aria-label="Add to vault" className="h-8 w-8 rounded-full bg-primary/15 hover:bg-primary/25 border border-primary/30 flex items-center justify-center text-primary">
                  <Plus className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5 glass-card border-primary/20">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Add to Public</div>
                {[
                  { kind: 'text' as const, icon: FileText, label: 'Text' },
                  { kind: 'photo' as const, icon: ImageIcon, label: 'Photo' },
                  { kind: 'video' as const, icon: VideoIcon, label: 'Video' },
                ].map(o => (
                  <button key={o.kind} onClick={() => openVault('public', o.kind)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-primary/10 text-sm">
                    <o.icon className="h-3.5 w-3.5 text-cyan-400" /> {o.label}
                  </button>
                ))}
                <div className="border-t border-border/30 my-1" />
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Add to Personal</div>
                {[
                  { kind: 'text' as const, icon: FileText, label: 'Text' },
                  { kind: 'photo' as const, icon: ImageIcon, label: 'Photo' },
                  { kind: 'video' as const, icon: VideoIcon, label: 'Video' },
                ].map(o => (
                  <button key={o.kind} onClick={() => openVault('ghost', o.kind)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-primary/10 text-sm">
                    <o.icon className="h-3.5 w-3.5 text-slate-300" /> {o.label}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gradient-to-r ${gradient} text-white shadow-lg`}>
            {data.score >= GOAL ? <Crown className="h-3.5 w-3.5" /> : <Award className="h-3.5 w-3.5" />}
            <span className="text-xs font-bold whitespace-nowrap">{data.level}</span>
          </div>
        </div>
      </div>

      {/* Public Content progress bar */}
      <div className="mt-4 relative">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>Public Content</span>
          <span>{data.score} / {GOAL}</span>
        </div>
        <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full bg-gradient-to-r ${gradient}`}
          />
        </div>
      </div>

      {/* Text | Photo | Video counters (Public) */}
      <div className="grid grid-cols-3 gap-2 mt-4 relative">
        <Counter icon={FileText} label="Text" value={data.publicCounts.text} />
        <Counter icon={ImageIcon} label="Photo" value={data.publicCounts.photo} />
        <Counter icon={VideoIcon} label="Video" value={data.publicCounts.video} />
      </div>

      <p className="mt-2.5 text-[10px] text-muted-foreground/80 text-center">
        Personal: <span className="text-foreground/80">{data.personalTotal}</span> · Creation: <span className="text-foreground/80">{data.creationTotal}</span>
      </p>
    </motion.div>
  );
}

function Counter({ icon: Icon, label, value }: { icon: typeof Shield; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-secondary/30 border border-border/40 px-2 py-2 text-center">
      <Icon className="h-3.5 w-3.5 mx-auto text-primary/80 mb-1" />
      <div className="font-heading font-bold text-sm">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}
