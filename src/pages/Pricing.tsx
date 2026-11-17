import { motion } from 'framer-motion';
import { Check, Crown, Zap, Shield, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';
import { toast } from 'sonner';
import { UPIPaymentModal } from '@/components/UPIPaymentModal';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: 'forever',
    description: 'Perfect for getting started',
    features: [
      { text: '5 scans per day', included: true },
      { text: 'URL scanning', included: true },
      { text: 'Basic trust scores', included: true },
      { text: 'Ad-supported', included: false },
      { text: 'Deepfake detection', included: false },
      { text: 'Priority support', included: false },
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 499,
    period: '/month',
    description: 'For power users and professionals',
    features: [
      { text: 'Unlimited scans', included: true },
      { text: 'URL, Image & Video scanning', included: true },
      { text: 'Advanced trust scores', included: true },
      { text: 'No ads', included: true },
      { text: 'Deepfake detection', included: true },
      { text: 'Priority support', included: true },
    ],
    cta: 'Upgrade to Pro',
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 4999,
    period: '/month',
    description: 'For organizations and teams',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Team management', included: true },
      { text: 'API access', included: true },
      { text: 'Custom integrations', included: true },
      { text: 'Dedicated account manager', included: true },
      { text: 'SLA guarantee', included: true },
    ],
    cta: 'Contact Sales',
    popular: false,
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);

  const handleSelectPlan = (plan: typeof plans[0]) => {
    if (plan.id === 'free') {
      if (!user) {
        window.location.href = '/auth?mode=signup';
      } else {
        toast.success('You already have access to the Free plan!');
      }
      return;
    }

    if (plan.id === 'enterprise') {
      toast.info('Our sales team will contact you shortly!');
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
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative glass-card rounded-2xl p-8 ${
                plan.popular ? 'border-primary/50 glow-primary' : 'border-border/50'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="font-heading text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-heading text-4xl font-bold">
                    {plan.price === 0 ? 'Free' : `₹${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-muted-foreground">{plan.period}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature.text} className="flex items-center gap-3">
                    {feature.included ? (
                      <Check className="h-5 w-5 text-primary shrink-0" />
                    ) : (
                      <X className="h-5 w-5 text-muted-foreground/50 shrink-0" />
                    )}
                    <span className={feature.included ? 'text-foreground' : 'text-muted-foreground/50'}>
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => handleSelectPlan(plan)}
                className={`w-full ${plan.popular ? 'glow-primary' : ''}`}
                variant={plan.popular ? 'default' : 'outline'}
              >
                {plan.cta}
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
      />
    </Layout>
  );
}
