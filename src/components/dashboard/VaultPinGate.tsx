import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Lock, ShieldCheck, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onUnlocked: () => void;
  onCancel: () => void;
}

const SESSION_KEY = 'averia.personalVault.unlocked';

export function isPersonalVaultUnlocked() {
  try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; }
}

export function lockPersonalVault() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

export function VaultPinGate({ open, onUnlocked, onCancel }: Props) {
  const [mode, setMode] = useState<'loading' | 'setup' | 'confirm' | 'unlock'>('loading');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPin(''); setPin2('');
    (async () => {
      setMode('loading');
      const { data } = await supabase.rpc('has_personal_vault_pin');
      setMode(data ? 'unlock' : 'setup');
      setTimeout(() => inputRef.current?.focus(), 50);
    })();
  }, [open]);

  const submitSetup = async () => {
    if (pin.length !== 4) return toast.error('PIN must be 4 digits');
    setMode('confirm');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const submitConfirm = async () => {
    if (pin2 !== pin) { toast.error('PINs do not match'); setPin2(''); return; }
    setBusy(true);
    const { error } = await supabase.rpc('set_personal_vault_pin', { _pin: pin });
    setBusy(false);
    if (error) return toast.error('Could not set PIN');
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    toast.success('Personal Vault PIN set');
    onUnlocked();
  };

  const submitUnlock = async () => {
    if (pin.length !== 4) return toast.error('Enter your 4-digit PIN');
    setBusy(true);
    const { data, error } = await supabase.rpc('verify_personal_vault_pin', { _pin: pin });
    setBusy(false);
    if (error || !data) { toast.error('Incorrect PIN'); setPin(''); return; }
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch {}
    onUnlocked();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'setup') submitSetup();
      else if (mode === 'confirm') submitConfirm();
      else if (mode === 'unlock') submitUnlock();
    }
  };

  const pinInput = (value: string, setValue: (v: string) => void) => (
    <input
      ref={inputRef}
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onKeyDown={handleKeyPress}
      className="text-center text-3xl tracking-[1em] font-mono font-bold bg-secondary/40 border border-primary/30 rounded-xl py-4 w-full focus:outline-none focus:border-primary"
      placeholder="••••"
    />
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="bg-background/95 backdrop-blur-xl border-primary/20 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'unlock' ? <Lock className="h-4 w-4 text-primary" /> : <KeyRound className="h-4 w-4 text-primary" />}
            {mode === 'setup' && 'Set Personal Vault PIN'}
            {mode === 'confirm' && 'Confirm PIN'}
            {mode === 'unlock' && 'Personal Vault Locked'}
            {mode === 'loading' && 'Checking…'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'setup' && 'Create a 4-digit code. You will need this every session to view Personal items.'}
            {mode === 'confirm' && 'Re-enter the same 4 digits to confirm.'}
            {mode === 'unlock' && 'Enter your 4-digit PIN to unlock.'}
          </DialogDescription>
        </DialogHeader>

        {mode !== 'loading' && (
          <div className="space-y-4 py-2">
            {mode === 'confirm' ? pinInput(pin2, setPin2) : pinInput(pin, setPin)}
            <Button
              className="w-full"
              disabled={busy}
              onClick={mode === 'setup' ? submitSetup : mode === 'confirm' ? submitConfirm : submitUnlock}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              {mode === 'setup' && 'Continue'}
              {mode === 'confirm' && 'Set PIN & Unlock'}
              {mode === 'unlock' && 'Unlock Vault'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
