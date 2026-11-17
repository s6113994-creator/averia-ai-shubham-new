import { describe, expect, it } from 'vitest';
import { SUBSCRIPTION_PLANS } from '@/lib/subscriptionPlans';

describe('subscription catalog', () => {
  it('keeps the four monthly prices fixed', () => {
    expect(SUBSCRIPTION_PLANS.map(({ id, price }) => [id, price])).toEqual([
      ['free', 0],
      ['starter', 199],
      ['pro', 499],
      ['enterprise', 1999],
    ]);
  });

  it('keeps Free limits and ATS reward exact', () => {
    expect(SUBSCRIPTION_PLANS[0].features).toEqual([
      '10 Prompts/day',
      '3 News Verifications/day',
      '+10 ATS per public post · 500 ATS earns one month of Pro',
      '1 Joint Brain Connection',
    ]);
  });

  it('keeps Starter limits exact', () => {
    expect(SUBSCRIPTION_PLANS[1].features).toEqual([
      '100 Prompts/day',
      '25 News Verifications/day',
      '5 Single-page UI Site Generations/day',
      '3 Trade Listings',
      '2 Joint Brain Accounts',
    ]);
  });

  it('keeps Pro limits exact', () => {
    expect(SUBSCRIPTION_PLANS[2].features).toEqual([
      'Unlimited Prompts & Gemini 3 Pro Speed',
      'Unlimited News Verifications',
      'Unlimited Web/Image Generation',
      '15 Trade Listings',
      '5 Joint Brain Accounts with Granular Sharing',
    ]);
  });

  it('keeps Enterprise limits exact', () => {
    expect(SUBSCRIPTION_PLANS[3].features).toEqual([
      'Priority Speeds',
      'Custom API Key Integration',
      'Unlimited Trade Listings (0% Fee)',
      'Unlimited Joint Brain Accounts',
      'Custom 3D Shaders & VIP Badge',
    ]);
  });
});