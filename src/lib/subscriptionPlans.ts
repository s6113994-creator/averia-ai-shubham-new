export type SubscriptionPlanId = 'free' | 'starter' | 'pro' | 'enterprise';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  price: number;
  period: string;
  badge?: string;
  features: string[];
  tagline: string;
  cta: string;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    period: '/month',
    features: [
      '10 Prompts/day',
      '3 News Verifications/day',
      '+10 ATS per public post · 500 ATS earns one month of Pro',
      '1 Joint Brain Connection',
    ],
    tagline: 'Everything you need to try the AI for free',
    cta: 'Start Free',
  },
  {
    id: 'starter',
    name: 'Starter',
    price: 199,
    period: '/month',
    features: [
      '100 Prompts/day',
      '25 News Verifications/day',
      '5 Single-page UI Site Generations/day',
      '3 Trade Listings',
      '2 Joint Brain Accounts',
    ],
    tagline: 'For daily makers building and shipping',
    cta: 'Upgrade to Starter',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 499,
    period: '/month',
    badge: 'Most Popular',
    features: [
      'Unlimited Prompts & Gemini 3 Pro Speed',
      'Unlimited News Verifications',
      'Unlimited Web/Image Generation',
      '15 Trade Listings',
      '5 Joint Brain Accounts with Granular Sharing',
    ],
    tagline: 'Unlimited everything for power users',
    cta: 'Upgrade to Pro',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 1999,
    period: '/month',
    badge: 'VIP Access',
    features: [
      'Priority Speeds',
      'Custom API Key Integration',
      'Unlimited Trade Listings (0% Fee)',
      'Unlimited Joint Brain Accounts',
      'Custom 3D Shaders & VIP Badge',
    ],
    tagline: 'Priority throughput and zero marketplace fees',
    cta: 'Upgrade to Enterprise',
  },
];

export function getSubscriptionPlan(planId: SubscriptionPlanId): SubscriptionPlan {
  return SUBSCRIPTION_PLANS.find((plan) => plan.id === planId) ?? SUBSCRIPTION_PLANS[0];
}

export function isSubscriptionPlanId(value: string | null | undefined): value is SubscriptionPlanId {
  return SUBSCRIPTION_PLANS.some((plan) => plan.id === value);
}