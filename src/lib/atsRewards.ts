export const ATS_PER_PUBLIC_POST = 10;
export const ATS_PRO_REWARD_THRESHOLD = 500;

export function getPublicAtsScore(publicPostCount: number): number {
  return Math.max(0, Math.floor(publicPostCount)) * ATS_PER_PUBLIC_POST;
}

export function isAtsProRewardReady(score: number): boolean {
  return score >= ATS_PRO_REWARD_THRESHOLD;
}