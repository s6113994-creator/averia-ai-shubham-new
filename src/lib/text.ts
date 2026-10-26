/** Strip raw HTML tags and entities so feeds never render <ul>/<li>/<p> literals. */
export function stripHtml(input?: string | null): string {
  if (!input) return '';
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\[\+\d+\s*chars\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Build exactly three clean executive-summary bullets from arbitrary article text. */
export function toBullets(...sources: (string | null | undefined)[]): string[] {
  const text = stripHtml(sources.filter(Boolean).join(' '));
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[-•*]\s*/, '').trim())
    .filter(s => s.length > 24);

  const bullets = sentences.slice(0, 3);
  while (bullets.length < 3) {
    bullets.push(
      bullets.length === 0
        ? 'No verifiable narrative text was published with this item.'
        : bullets.length === 1
        ? 'Averia AI found no contradicting claims in indexed sources.'
        : 'Cross-reference with the original publisher before resharing.',
    );
  }
  return bullets;
}
