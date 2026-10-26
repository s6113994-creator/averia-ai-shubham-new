import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileText, Image as ImageIcon, Video as VideoIcon, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useScope } from '@/lib/scope';
import { toast } from 'sonner';

export type VaultKind = 'text' | 'photo' | 'video';
export type VaultType = 'public' | 'ghost' | 'agentic';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vaultType: VaultType;
  initialKind?: VaultKind;
  onCreated?: () => void;
}

const KINDS: { id: VaultKind; label: string; icon: typeof FileText; accept?: string }[] = [
  { id: 'text', label: 'Text', icon: FileText },
  { id: 'photo', label: 'Photo', icon: ImageIcon, accept: 'image/*' },
  { id: 'video', label: 'Video', icon: VideoIcon, accept: 'video/*' },
];

const MAX_IMG = 50 * 1024 * 1024;
const MAX_VID = 500 * 1024 * 1024;

interface DailyCount { text: number; photo: number; video: number; }
interface MonthlyCount { text: number; photo: number; video: number; }

async function fetchPublicCounts(userId: string): Promise<{ daily: DailyCount; monthly: MonthlyCount }> {
  const dayStart = new Date(); dayStart.setHours(0,0,0,0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  const { data } = await supabase.from('vault_items')
    .select('kind, created_at')
    .eq('user_id', userId).eq('vault_type', 'public')
    .gte('created_at', monthStart.toISOString());
  const empty = { text: 0, photo: 0, video: 0 };
  const daily: DailyCount = { ...empty };
  const monthly: MonthlyCount = { ...empty };
  (data || []).forEach((r: any) => {
    const k = (r.kind === 'image' ? 'photo' : r.kind) as VaultKind;
    if (k !== 'text' && k !== 'photo' && k !== 'video') return;
    monthly[k] += 1;
    if (new Date(r.created_at) >= dayStart) daily[k] += 1;
  });
  return { daily, monthly };
}

function validatePublicLimits(kind: VaultKind, daily: DailyCount, monthly: MonthlyCount): string | null {
  // Monthly caps: 10 text + 20 photo + 20 video
  const monthlyCap = { text: 10, photo: 20, video: 20 } as const;
  if (monthly[kind] >= monthlyCap[kind]) return `Monthly cap reached (${monthlyCap[kind]} ${kind}s).`;
  // Mutex daily: if any kind already used today, lock alternates
  const totalToday = daily.text + daily.photo + daily.video;
  if (totalToday > 0) {
    // figure out which channel is "active" today
    const activeKind = (['text','photo','video'] as VaultKind[]).find(k => daily[k] > 0);
    if (activeKind && activeKind !== kind) {
      return `Today's channel is locked to ${activeKind}. Try another type tomorrow.`;
    }
  }
  const dailyCap = { text: 1, photo: 2, video: 2 } as const;
  if (daily[kind] >= dailyCap[kind]) return `Daily limit reached (${dailyCap[kind]} ${kind}${dailyCap[kind] > 1 ? 's' : ''}/day).`;
  return null;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const PUBLIC_LIMITS: Record<VaultKind, { min: number; max: number; field: 'content' | 'caption' }> = {
  text:  { min: 50, max: 150, field: 'content' },
  photo: { min: 50, max: 150, field: 'caption' },
  video: { min: 10, max: 50,  field: 'caption' },
};

async function aiNewsGate(kind: VaultKind, text: string): Promise<{ ok: boolean; reason?: string }> {
  // Lightweight gate: ask Lovable AI Gateway via the existing averia-ai edge function in classify mode.
  // We POST a compact prompt and read a single-token verdict. If the call fails, default to allow but flag.
  try {
    const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/averia-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-mode': 'classify' },
      body: JSON.stringify({
        classify: true,
        kind,
        text: text.slice(0, 1500),
      }),
    });
    if (!resp.ok) return { ok: true };
    const data = await resp.json().catch(() => ({}));
    if (data?.allowed === false) return { ok: false, reason: data?.reason };
    return { ok: true };
  } catch { return { ok: true }; }
}

export function VaultAddDialog({ open, onOpenChange, vaultType, initialKind = 'text', onCreated }: Props) {
  const { user } = useAuth();
  const { isJoint, workspaceId } = useScope();
  const envContext = isJoint && workspaceId ? `joint:${workspaceId}` : 'personal';
  const [kind, setKind] = useState<VaultKind>(initialKind);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setKind(initialKind); setTitle(''); setContent(''); setFile(null); } }, [open, initialKind]);

  const handleSubmit = async () => {
    if (!user) return;

    // Enforce caps + word limits + AI news gate ONLY on Public vault
    if (vaultType === 'public' && !isJoint) {
      const { daily, monthly } = await fetchPublicCounts(user.id);
      const err = validatePublicLimits(kind, daily, monthly);
      if (err) { toast.error(err); return; }

      const lim = PUBLIC_LIMITS[kind];
      const words = countWords(content);
      if (words < lim.min || words > lim.max) {
        toast.error(`${kind === 'video' ? 'Video' : kind === 'photo' ? 'Photo' : 'Text'} requires ${lim.min}–${lim.max} words (you wrote ${words}).`);
        return;
      }

      // News classification gate for Public posts only
      const gate = await aiNewsGate(kind, `${title}\n\n${content}`);
      if (!gate.ok) {
        toast.error('Please upload real news or informative or useful content');
        return;
      }
    }

    setSubmitting(true);
    try {
      let media_url: string | null = null;
      if (kind !== 'text') {
        if (!file) { toast.error('Pick a file'); setSubmitting(false); return; }
        const max = kind === 'photo' ? MAX_IMG : MAX_VID;
        if (file.size > max) { toast.error(`File too large (max ${kind === 'photo' ? '50MB' : '500MB'})`); setSubmitting(false); return; }
        const ext = file.name.split('.').pop() || (kind === 'photo' ? 'jpg' : 'mp4');
        const path = `${user.id}/${vaultType}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from('vault-media').upload(path, file, { upsert: false });
        if (upErr) { toast.error('Upload failed: ' + upErr.message); setSubmitting(false); return; }
        const { data: signed } = await supabase.storage.from('vault-media').createSignedUrl(path, 60 * 60 * 24 * 365);
        media_url = signed?.signedUrl ?? null;
      } else {
        if (!content.trim()) { toast.error('Content cannot be empty'); setSubmitting(false); return; }
      }

      const { error } = await supabase.from('vault_items').insert({
        user_id: user.id,
        vault_type: vaultType,
        kind,
        title: title.trim() || null,
        content: kind === 'text' ? content.trim() : (content.trim() || null),
        media_url,
        environment_context: envContext,
      });
      if (error) { toast.error('Could not save'); setSubmitting(false); return; }
      toast.success('Saved to vault');
      onCreated?.();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background/95 backdrop-blur-xl border-primary/20 max-w-md">
        <DialogHeader>
          <DialogTitle>New {vaultType === 'public' ? 'Public' : vaultType === 'ghost' ? 'Personal' : 'Creation'} entry</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1.5 p-1 rounded-full bg-secondary/40 border border-border/30">
          {KINDS.map(k => (
            <button
              key={k.id}
              onClick={() => { setKind(k.id); setFile(null); }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                kind === k.id ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <k.icon className="h-3.5 w-3.5" /> {k.label}
            </button>
          ))}
        </div>

        <div className="space-y-3 mt-2">
          <Input placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value.slice(0, 120))} />
          {kind === 'text' ? (
            <Textarea
              placeholder={vaultType === 'ghost' ? 'Private notes only you can see…' : 'Share an insight or evidence…'}
              value={content} onChange={e => setContent(e.target.value.slice(0, 4000))} rows={5}
            />
          ) : (
            <>
              <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 bg-secondary/20 hover:bg-secondary/30 cursor-pointer py-8 transition-colors">
                <Upload className="h-6 w-6 text-primary" />
                <span className="text-xs text-muted-foreground">{file ? file.name : `Tap to pick a ${kind}`}</span>
                <input type="file" className="hidden" accept={kind === 'photo' ? 'image/*' : 'video/*'} onChange={e => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <Textarea placeholder="Caption (optional)" rows={2} value={content} onChange={e => setContent(e.target.value.slice(0, 500))} />
            </>
          )}

          {vaultType === 'public' && (
            <div className="text-[10px] text-muted-foreground leading-relaxed space-y-1">
              <p>Public limits: 1 text OR 2 photos OR 2 videos per day · monthly cap 10 / 20 / 20 · +10 ATS per upload.</p>
              <p>Word count: <span className="text-foreground font-mono">{countWords(content)}</span> · required <span className="font-mono">{PUBLIC_LIMITS[kind].min}–{PUBLIC_LIMITS[kind].max}</span>. AI gate accepts only news / informative / useful content.</p>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitting} className="w-full">
            {submitting ? 'Saving…' : 'Save to Vault'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
