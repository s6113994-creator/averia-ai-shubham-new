const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Strict news date format: "MMM DD, YYYY" (e.g. Aug 5, 2026).
 * Never renders numeric locale dates like 8/5/2026.
 */
export function formatNewsDate(input?: string | number | Date | null): string {
  if (!input) return '';
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Heuristic display trust score used across news surfaces. */
export function displayTrustScore(article: { isDebunked?: boolean; tier?: string }): number {
  if (article.isDebunked) return 15;
  if (article.tier === 'top') return 92;
  if (article.tier === 'trending') return 78;
  return 65;
}
