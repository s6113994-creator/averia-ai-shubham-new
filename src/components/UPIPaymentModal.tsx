import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  CheckCircle2, Copy, CreditCard, Loader2, QrCode, ShieldCheck, Smartphone,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  getSubscriptionPlan,
  type SubscriptionPlanId,
} from '@/lib/subscriptionPlans';

export const UPI_PAYEE_ID = 'ganeshrajak123451@okhdfcbank';
export const UPI_PAYEE_NAME = 'Averia AI';

// The database trigger rejects anything that is not exactly 12 digits.
const UTR_PATTERN = /^\d{12}$/;

interface UPIPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: SubscriptionPlanId;
}

type UpiApp = { id: string; label: string; scheme: string; accent: string };

const UPI_APPS: UpiApp[] = [
  { id: 'gpay', label: 'Google Pay', scheme: 'tez://upi/pay', accent: 'from-blue-500/25 to-blue-500/5' },
  { id: 'phonepe', label: 'PhonePe', scheme: 'phonepe://pay', accent: 'from-violet-500/25 to-violet-500/5' },
  { id: 'paytm', label: 'Paytm', scheme: 'paytmmp://pay', accent: 'from-teal-500/25 to-teal-500/5' },
];

export function UPIPaymentModal({ open, onOpenChange, planId }: UPIPaymentModalProps) {
  const { user } = useAuth();
  const plan = getSubscriptionPlan(planId);
  const [utrNumber, setUtrNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const springX = useSpring(tiltX, { stiffness: 220, damping: 22 });
  const springY = useSpring(tiltY, { stiffness: 220, damping: 22 });
  const rotateX = useTransform(springX, [-1, 1], [7, -7]);
  const rotateY = useTransform(springY, [-1, 1], [-9, 9]);
  const glareX = useTransform(springY, [-1, 1], ['62%', '38%']);
  const glareY = useTransform(springX, [-1, 1], ['58%', '42%']);

  const intentParams = useMemo(
    () => new URLSearchParams({
      pa: UPI_PAYEE_ID,
      pn: UPI_PAYEE_NAME,
      am: String(plan.price),
      cu: 'INR',
      tn: `Averia AI ${plan.name} subscription`,
      tr: `AVERIA-${plan.id.toUpperCase()}-${Date.now().toString().slice(-8)}`,
    }),
    [plan.id, plan.price],
  );

  const upiIntentUrl = `upi://pay?${intentParams.toString()}`;
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(upiIntentUrl, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#EDEDED', light: '#1A1A24' },
    })
      .then((url) => { if (!cancelled) setQrCodeUrl(url); })
      .catch(() => { if (!cancelled) setQrCodeUrl(null); });
    return () => { cancelled = true; };
  }, [open, upiIntentUrl]);

  useEffect(() => {
    if (!open) {
      setUtrNumber('');
      setSubmitted(false);
      setSubmitting(false);
      tiltX.set(0);
      tiltY.set(0);
    }
  }, [open, tiltX, tiltY]);

  const copyUpiId = async () => {
    try {
      await navigator.clipboard.writeText(UPI_PAYEE_ID);
      toast.success('UPI ID copied');
    } catch {
      toast.error('Could not copy the UPI ID');
    }
  };

  const openUpiApp = (scheme: string) => {
    window.location.href = `${scheme}?${intentParams.toString()}`;
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('Please sign in before paying');
      return;
    }
    const trimmedUtr = utrNumber.trim();
    if (!UTR_PATTERN.test(trimmedUtr)) {
      toast.error('Enter the 12-digit UPI transaction ID from your payment app');
      return;
    }

    setSubmitting(true);
    try {
      // The database trigger owns the amount, status and receipt fields; the
      // browser only states which plan was bought and which UTI was paid with.
      const { error } = await supabase.from('payment_requests').insert({
        user_id: user.id,
        plan: plan.id,
        amount: plan.price,
        utr_number: trimmedUtr,
        status: 'pending',
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('This UTR has already been submitted');
        } else {
          throw error;
        }
        return;
      }

      setSubmitted(true);
      toast.success('Payment request submitted to Admin Vault. Verification takes 2-5 mins.');
    } catch (error) {
      console.error('Payment submission error:', error);
      toast.error('Could not submit the payment request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] overflow-hidden border-0 bg-transparent p-0 shadow-none">
        <DialogHeader className="sr-only">
          <DialogTitle>Upgrade to {plan.name}</DialogTitle>
          <DialogDescription>Pay securely via UPI and submit your transaction ID for verification.</DialogDescription>
        </DialogHeader>

        <motion.div
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            tiltY.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1);
            tiltX.set(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
          }}
          onPointerLeave={() => { tiltX.set(0); tiltY.set(0); }}
          className="relative rounded-3xl border border-white/10 bg-[#1A1A24]/90 p-6 shadow-2xl backdrop-blur-2xl sm:p-7"
        >
          <motion.div
            aria-hidden
            style={{ left: glareX, top: glareY }}
            className="pointer-events-none absolute h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-3xl"
          />

          {submitted ? (
            <div className="relative flex flex-col items-center py-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <h3 className="font-heading text-xl font-bold">Payment request submitted</h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Payment request submitted to Admin Vault. Verification takes 2-5 mins.
              </p>
              <div className="mt-5 w-full rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{plan.name}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">₹{plan.price}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">UTR</span>
                  <span className="font-mono text-xs">{utrNumber.trim()}</span>
                </div>
              </div>
              <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          ) : (
            <>
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Upgrade to</p>
                  <h3 className="font-heading text-2xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2 text-right">
                  <p className="font-heading text-2xl font-bold">₹{plan.price}</p>
                  <p className="text-[11px] text-muted-foreground">{plan.period}</p>
                </div>
              </div>

              <div className="relative mt-6 grid gap-5 sm:grid-cols-[168px_1fr]">
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-2xl border border-white/10 bg-[#252534] p-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)]">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="UPI QR code" className="h-36 w-36 rounded-lg" />
                    ) : (
                      <div className="flex h-36 w-36 items-center justify-center rounded-lg bg-white/5">
                        <QrCode className="h-8 w-8 animate-pulse text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="text-center text-[11px] leading-4 text-muted-foreground">
                    Scan with any UPI app
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">UPI ID</p>
                        <p className="truncate font-mono text-sm">{UPI_PAYEE_ID}</p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={copyUpiId} aria-label="Copy UPI ID">
                        <Copy />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {UPI_APPS.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => openUpiApp(app.scheme)}
                        className={`group flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-gradient-to-b ${app.accent} px-2 py-3 text-xs font-medium shadow-2xl transition hover:-translate-y-1 hover:border-white/25 active:scale-95`}
                      >
                        <Smartphone className="h-5 w-5 text-white/90" />
                        {app.label}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.href = upiIntentUrl}
                  >
                    <CreditCard /> Pay ₹{plan.price} with any UPI app
                  </Button>
                </div>
              </div>

              <div className="relative mt-6 space-y-4 border-t border-white/10 pt-5">
                <div className="space-y-2">
                  <Label htmlFor="upi-utr">UTR / Transaction ID</Label>
                  <Input
                    id="upi-utr"
                    value={utrNumber}
                    onChange={(event) => setUtrNumber(event.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="123456789012"
                    inputMode="numeric"
                    maxLength={12}
                    className="border-white/10 bg-white/[0.05] font-mono tracking-wide"
                  />
                  <p className="text-xs text-muted-foreground">
                    The 12-digit reference in your UPI app under transaction details. Required for approval.
                  </p>
                </div>

                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
                  Submit for verification
                </Button>

                <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Admin-verified activation · tier unlocks after approval
                </div>
              </div>
            </>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
