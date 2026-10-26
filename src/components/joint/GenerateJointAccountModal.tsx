import { useState } from 'react';
import { Users, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { PartnerPickerPopup } from './PartnerPickerPopup';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const PERMISSION_KEYS = [
  { key: 'dashboard', label: 'Share my personal dashboard' },
  { key: 'agentic',   label: 'Share my personal Averia Agentic AI chatbot' },
  { key: 'chat',      label: 'Share my personal user chat' },
] as const;

type PermKey = typeof PERMISSION_KEYS[number]['key'];
type Perms = Record<PermKey, boolean>;

const defaultPerms: Perms = { dashboard: true, agentic: false, chat: true };

interface Partner { user_id: string; full_name: string | null; display_name?: string | null; averia_id?: string; }

export function GenerateJointAccountModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [perms, setPerms] = useState<Perms>(defaultPerms);
  const [partnerPerms, setPartnerPerms] = useState<Perms>(defaultPerms);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPartner(null);
    setPerms(defaultPerms);
    setPartnerPerms(defaultPerms);
  };

  const submit = async () => {
    if (!user || !partner) return;
    setSubmitting(true);
    const { error } = await supabase.from('joint_account_requests').insert({
      from_user: user.id,
      to_user: partner.user_id,
      from_permissions: perms,
      to_permissions: partnerPerms,
      status: 'pending',
    });
    setSubmitting(false);
    if (error) {
      toast.error('Failed to send invite');
      return;
    }
    toast.success('Joint Account invite sent');
    reset();
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
        <DialogContent className="glass-card border-primary/20 max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Joint Intelligence Account
            </DialogTitle>
            <DialogDescription>
              Form a shared workspace with a trusted partner. Both keep your own login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Partner picker */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Partner</p>
              {partner ? (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors text-left"
                >
                  <Users className="h-5 w-5 text-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{partner.display_name || partner.full_name || 'Unnamed'}</p>
                    <p className="text-xs font-mono text-primary truncate">{partner.averia_id}</p>
                  </div>
                  <span className="text-xs text-primary">Change</span>
                </button>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
                  <Users className="h-4 w-4" /> Pick by Averia ID
                </Button>
              )}
            </div>

            {/* Permission matrices */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/50 p-3 bg-secondary/20">
                <p className="text-xs font-semibold mb-2">You share with partner</p>
                {PERMISSION_KEYS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 py-1.5 cursor-pointer">
                    <Checkbox
                      checked={perms[p.key]}
                      onCheckedChange={(v) => setPerms((s) => ({ ...s, [p.key]: !!v }))}
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
              <div className="rounded-lg border border-border/50 p-3 bg-secondary/20">
                <p className="text-xs font-semibold mb-2">Request from partner</p>
                {PERMISSION_KEYS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 py-1.5 cursor-pointer">
                    <Checkbox
                      checked={partnerPerms[p.key]}
                      onCheckedChange={(v) => setPartnerPerms((s) => ({ ...s, [p.key]: !!v }))}
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={submit} disabled={!partner || submitting} className="w-full">
              {submitting ? 'Sending…' : 'Send Joint Account Invite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PartnerPickerPopup open={pickerOpen} onOpenChange={setPickerOpen} onPick={setPartner} />
    </>
  );
}
