import { motion } from 'framer-motion';
import { Check, Crown, Zap, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { toast } from 'sonner';
import { UPIPaymentModal } from '@/components/UPIPaymentModal';
import { SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/lib/subscriptionPlans';

const planDescriptions: Record<SubscriptionPlan['id'], string> = {
  free: 'Start with the essentials',
  starter: 'More room for daily work',
  pro: 'For power users and professionals',
  enterprise: 'Advanced access for teams',
  enterprise_max: 'Expanded plan details are being finalized',
};

export default function Pricing() {
  const { user } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (plan.comingSoon) {
      toast.info('Enterprise Max is coming soon.');
      return;
    }
    if (plan.id === 'free') {
      if (!user) {
        window.location.href = '/auth?mode=signup';
      } else {
        toast.success('You already have access to the Free plan!');
      }
      return;
    }

    if (!user) {
      toast.error('Please sign in to upgrade');
      window.location.href = '/auth';
      return;
    }

    setSelectedPlan(plan);
    setShowPayment(true);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mb-6">
              <Crown className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Pricing Plans</span>
            </span>
            <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">
              Choose Your <span className="gradient-text">Plan</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Start free and upgrade when you need more power. All plans include our core AI fact-checking technology.
            </p>
          </motion.div>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5 max-w-[90rem] mx-auto">
          {SUBSCRIPTION_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative glass-card rounded-2xl p-6 ${
                plan.badge === 'Most Popular' ? 'border-primary/50 glow-primary' : 'border-border/50'
              }`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="font-heading text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{planDescriptions[plan.id]}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-heading text-4xl font-bold">
                  {plan.price === 0 ? 'Free' : `₹${plan.price.toLocaleString('en-IN')}`}
                  </span>
                  {plan.price > 0 && !plan.comingSoon && (
                    <span className="text-muted-foreground">{plan.period}</span>
                  )}
                  {plan.comingSoon && <span className="text-muted-foreground">/month</span>}
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="h-5 w-5 text-primary shrink-0" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
                {plan.comingSoon && <li className="text-sm text-muted-foreground">Feature limits to be announced</li>}
              </ul>

              <Button
                onClick={() => handleSelectPlan(plan)}
                className={`w-full ${plan.badge === 'Most Popular' ? 'glow-primary' : ''}`}
                variant={plan.badge === 'Most Popular' ? 'default' : 'outline'}
                disabled={plan.comingSoon}
              >
                {plan.comingSoon ? 'Coming soon' : plan.id === 'free' ? 'Get Started' : `Choose ${plan.name}`}
              </Button>
            </motion.div>
          ))}
        </div>

        {/* Features Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-24 max-w-4xl mx-auto"
        >
          <h2 className="font-heading text-3xl font-bold text-center mb-12">
            Why <span className="gradient-text">Upgrade</span> to Pro?
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Unlimited Scans',
                desc: 'No daily limits. Scan as much as you need.',
              },
              {
                icon: Shield,
                title: 'Deepfake Detection',
                desc: 'Advanced AI to detect manipulated media.',
              },
              {
                icon: Crown,
                title: 'Ad-Free Experience',
                desc: 'Focus on what matters without distractions.',
              },
            ].map((feature) => (
              <div key={feature.title} className="glass-card p-6 rounded-xl text-center">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-heading font-semibold mb-2">{feature.title}</h4>
                <p className="text-muted-foreground text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-24 max-w-3xl mx-auto"
        >
          <h2 className="font-heading text-3xl font-bold text-center mb-12">
            Frequently Asked <span className="gradient-text">Questions</span>
          </h2>

          <div className="space-y-4">
            {[
              {
                q: 'Can I cancel anytime?',
                a: 'Yes, you can cancel your subscription at any time. You\'ll continue to have access until the end of your billing period.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept UPI payments (GPay, PhonePe, Paytm, etc.) with secure manual verification powered by AI.',
              },
              {
                q: 'Is there a refund policy?',
                a: 'Yes, we offer a 7-day money-back guarantee. If you\'re not satisfied, contact support for a full refund.',
              },
              {
                q: 'How accurate is the AI?',
                a: 'Our AI has a 99.2% accuracy rate, verified through independent audits and continuous improvement.',
              },
            ].map((faq) => (
              <div key={faq.q} className="glass-card p-6 rounded-xl">
                <h4 className="font-heading font-semibold mb-2">{faq.q}</h4>
                <p className="text-muted-foreground text-sm">{faq.a}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* UPI Payment Modal */}
      <UPIPaymentModal
        open={showPayment}
        onOpenChange={setShowPayment}
        planName={selectedPlan?.name || 'Pro'}
        amount={selectedPlan?.price || 499}
        planId={selectedPlan?.id ?? 'pro'}
      />
    </Layout>
  );
}
