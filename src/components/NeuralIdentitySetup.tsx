import { useEffect, useState } from 'react';
import { Sparkles, Fingerprint, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/**
 * One-time popup that forces the user to choose a Neural Identity (display name)
 * which is permanently bound to their auto-generated 8-char Averia ID.
 */
export function NeuralIdentitySetup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [averiaId, setAveriaId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, averia_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!data) return;
      setAveriaId(data.averia_id || '');
      if (!data.display_name) {
        setOpen(true);
      }
    })();
  }, [user?.id]);

  const submit = async () => {
    if (!user) return;
    const name = displayName.trim();
    if (name.length < 3 || name.length > 24) {
      toast.error('Name must be 3–24 characters');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name, full_name: name })
      .eq('user_id', user.id);
    setSubmitting(false);
    if (error) {
      toast.error('Failed to save identity');
      return;
    }
    toast.success('Neural Identity locked in');
    setOpen(false);
  };

  const copyId = async () => {
    await navigator.clipboard.writeText(averiaId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* mandatory: ignore close */ }}>
      <DialogContent
        className="glass-card border-primary/30 max-w-md sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Create Your Neural Identity
          </DialogTitle>
          <DialogDescription>
            Pick a unique name. Your permanent Averia ID is bound to it forever.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Your Permanent Averia ID
            </p>
            <button
              onClick={copyId}
              className="w-full flex items-center justify-between gap-2 text-left group"
            >
              <span className="font-mono text-lg font-bold text-primary tracking-wider flex items-center gap-2">
                <Fingerprint className="h-4 w-4" /> {averiaId || '—'}
              </span>
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
              )}
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Display Name (e.g. Agent_Aryan)
            </label>
            <Input
              autoFocus
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.replace(/\s+/g, '_'))}
              placeholder="Agent_Aryan"
              maxLength={24}
              className="bg-secondary/40"
            />
            <p className="text-[10px] text-muted-foreground mt-1">3–24 chars · spaces become underscores</p>
          </div>

          {displayName.trim().length >= 3 && (
            <div className="text-center text-sm text-muted-foreground">
              You will appear as{' '}
              <span className="font-semibold text-foreground">{displayName.trim()}</span>{' '}
              <span className="font-mono text-primary">[{averiaId}]</span>
            </div>
          )}

          <Button onClick={submit} disabled={submitting} className="w-full">
            {submitting ? 'Locking in…' : 'Lock In Identity'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
