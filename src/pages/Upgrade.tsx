import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Crown, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { UPIPaymentModal } from '@/components/UPIPaymentModal';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  SUBSCRIPTION_PLANS,
  isSubscriptionPlanId,
  type SubscriptionPlan,
  type SubscriptionPlanId,
} from '@/lib/subscriptionPlans';

function PlanCard({
  plan,
  index,
  isCurrent,
  onSelect,
}: {
  plan: SubscriptionPlan;
  index: number;
  isCurrent: boolean;
  onSelect: (plan: SubscriptionPlan) => void;
}) {
  const featured = Boolean(plan.badge);

  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      className={`group relative flex flex-col rounded-3xl border p-7 shadow-2xl transition duration-300 hover:-translate-y-1 ${
        featured
          ? 'border-white/20 bg-[#252534]/80 glow-primary'
          : 'border-white/10 bg-[#1A1A24]/70'
      }`}
    >
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-[#252534] px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground shadow-xl">
            {plan.id === 'enterprise' ? <Crown className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {plan.badge}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-xl font-bold">{plan.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
        </div>
        {isCurrent && (
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[11px] font-medium text-success">
            Current plan
          </span>
        )}
      </div>

      <div className="mt-6 flex items-baseline gap-1.5">
        <span className="font-heading text-4xl font-bold">
          {plan.price === 0 ? '₹0' : `₹${plan.price}`}
        </span>
        <span className="text-sm text-muted-foreground">{plan.period}</span>
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground/90">{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        className="mt-7 w-full"
        variant={featured ? 'default' : 'outline'}
        onClick={() => onSelect(plan)}
        disabled={isCurrent}
      >
        {isCurrent ? 'Your current plan' : plan.cta}
      </Button>
    </motion.article>
  );
}

export default function Upgrade() {
  const { user, loading: authLoading } = useAuth();
  const [currentTier, setCurrentTier] = useState<SubscriptionPlanId | null>(null);
  const [payingPlan, setPayingPlan] = useState<SubscriptionPlanId | null>(null);

  useEffect(() => {
    if (!user) {
      setCurrentTier(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const tier = data?.subscription_tier;
        setCurrentTier(isSubscriptionPlanId(tier) ? tier : 'free');
      })
      .catch(() => { if (!cancelled) setCurrentTier(null); });
    return () => { cancelled = true; };
  }, [user]);

  const handleSelect = (plan: SubscriptionPlan) => {
    if (plan.id === 'free') {
      if (!user) {
        window.location.href = '/auth?mode=signup';
        return;
      }
      toast.success('You already have access to the Free plan');
      return;
    }
    if (!user) {
      toast.error('Please sign in to upgrade');
      window.location.href = '/auth';
      return;
    }
    setPayingPlan(plan.id);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-sm font-medium">
            <Zap className="h-4 w-4 text-primary" />
            Subscription Plans
          </span>
          <h1 className="mt-6 font-heading text-4xl font-bold md:text-5xl">
            Upgrade <span className="gradient-text">Averia AI</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Four tiers, one catalog. Payments are verified in the Admin Vault before a tier unlocks.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2 xl:grid-cols-4">
          {SUBSCRIPTION_PLANS.map((plan, index) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              index={index}
              isCurrent={!authLoading && user !== null && currentTier === plan.id}
              onSelect={handleSelect}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mt-20 grid max-w-4xl gap-6 md:grid-cols-3"
        >
          {[
            {
              icon: Zap,
              title: 'UPI Payments',
              desc: 'Pay by QR or app deep link, then submit the UTR for verification.',
            },
            {
              icon: ShieldCheck,
              title: 'Admin Verified',
              desc: 'A request stays pending until an admin approves the transaction.',
            },
            {
              icon: Crown,
              title: 'No Auto Unlock',
              desc: 'Your tier is granted by the database, never by the browser.',
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-[#1A1A24]/70 p-6 text-center shadow-2xl transition hover:-translate-y-1"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/[0.06]">
                <item.icon className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-heading font-semibold">{item.title}</h4>
              <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>

      <UPIPaymentModal
        open={payingPlan !== null}
        onOpenChange={(open) => { if (!open) setPayingPlan(null); }}
        planId={payingPlan ?? 'pro'}
      />
    </Layout>
  );
}
