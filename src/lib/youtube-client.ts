/**
 * Client-side YouTube Data API v3 fetcher with multi-key rotation,
 * lifetime Supabase archiving, hybrid infinite scroll, and zero-dedup.
 */
import type { MediaNewsArticle } from '@/types/news-media';
import { supabase } from '@/integrations/supabase/client';

// ─── AUTH HELPER: Ensure valid session before DB calls ────────
async function ensureValidSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const now = Math.floor(Date.now() / 1000);
      if (session.expires_at && session.expires_at - now < 60) {
        await supabase.auth.refreshSession();
      }
    }
  } catch {
    // Silent - let the request proceed, it may work with anon key
  }
}

const YOUTUBE_API_KEYS = [
  'AIzaSyAZE0y8xD7Y1NIOY4G-KkybHOb2Kzx7NCQ',
  'AIzaSyBZzw5iDWA3quIj76m4u8S8pq4uE9Q3zsM',
  'AIzaSyDGPUneOQFjK7GPqDp6RU-D3oxGoGwT96U',
  'AIzaSyCf53hTWT_UGoVzD57Qgd5E6xaH0QGgEOg',
  'AIzaSyCM5dviM3L0xYaISvY1R0dds5bxAk5PK7o',
  'AIzaSyC7oL9Xgx7ycI6HhDZ84Ub2wfdOX-2NpDc',
  'AIzaSyBdXk0-0EXJV-EkVXL3Rr_iEFOFaC-7c6U',
  'AIzaSyA3m2k602asEdkbkP5NziInkKysUn9t_Sw',
  'AIzaSyC_giw7hu-NYf6mzxOF5oDBrBGE_JOkSwQ',
  'AIzaSyB2PIrCjOzCc3cPWVoWLSQyv_825TKzAHU',
];

let currentKeyIndex = 0;
const deadKeys = new Set<number>();

// ─── DAILY KEY RESET: Clear dead keys when a new UTC day starts ───
let lastResetDay = new Date().toISOString().slice(0, 10);

function resetDeadKeysIfNewDay() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDay) {
    console.log(`[YouTube] New day detected (${today}), resetting all ${deadKeys.size} dead keys`);
    deadKeys.clear();
    currentKeyIndex = 0;
    lastResetDay = today;
  }
}

// ─── GLOBAL SESSION DEDUP ─────────────────────────────────────
// This Set persists for the entire browser session, ensuring ZERO repeats
const globalSeenVideoIds = new Set<string>();
const globalSeenArticleKeys = new Set<string>();

export function getGlobalSeenIds() {
  return { globalSeenVideoIds, globalSeenArticleKeys };
}

export function registerSeen(article: MediaNewsArticle) {
  if (article.videoId) globalSeenVideoIds.add(article.videoId);
  const key = article.videoId || article.url || article.title;
  if (key) globalSeenArticleKeys.add(key);
}

export function isAlreadySeen(article: MediaNewsArticle): boolean {
  if (article.videoId && globalSeenVideoIds.has(article.videoId)) return true;
  const key = article.videoId || article.url || article.title;
  return globalSeenArticleKeys.has(key);
}

export function deduplicateArticles(articles: MediaNewsArticle[]): MediaNewsArticle[] {
  return articles.filter(a => {
    if (isAlreadySeen(a)) return false;
    registerSeen(a);
    return true;
  });
}
// ────────────────────────────────────────────────────────────────

const PRIMARY_LOOKBACK_HOURS = 24;
const FALLBACK_LOOKBACK_HOURS = 24 * 7;
const CACHE_CYCLE_BATCH_SIZE = 10;
const cacheCycleCursor: Record<'long' | 'short', number> = { long: 0, short: 0 };
const TEMPORARY_ROTATION_REASONS = new Set([
  'quotaExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'dailyLimitExceeded',
  'accessNotConfigured',
  'backendError',
  'internalError',
]);

// ─── LIFETIME ARCHIVE EXPIRY (30 days instead of 6h) ──────────
const ARCHIVE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
// Short-term cache for dedup (6h)
const CACHE_EXPIRY_MS = 6 * 60 * 60 * 1000;

function normalizeQuery(query: string): string {
  return query
    .replace(/\bbreaking\s+news\s+action\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTodayStart(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

function buildSearchParams({
  query,
  type,
  maxResults,
  pageToken,
  lookbackHours,
}: {
  query: string;
  type: 'long' | 'short';
  maxResults: number;
  pageToken?: string | null;
  lookbackHours: number;
}) {
  // Force publishedAfter to TODAY for primary window, fallback uses lookbackHours
  const publishedAfter = lookbackHours <= 24
    ? getTodayStart()
    : new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults: String(maxResults),
    regionCode: 'IN',
    relevanceLanguage: 'en',
    order: 'date',
    publishedAfter,
    videoDuration: type === 'short' ? 'short' : 'medium',
    safeSearch: 'moderate',
    key: '',
  });

  if (pageToken) params.set('pageToken', pageToken);
  return params;
}

function getNextKey(): string | null {
  if (deadKeys.size >= YOUTUBE_API_KEYS.length) return null;
  let attempts = 0;
  while (attempts < YOUTUBE_API_KEYS.length) {
    if (!deadKeys.has(currentKeyIndex)) {
      const key = YOUTUBE_API_KEYS[currentKeyIndex];
      currentKeyIndex = (currentKeyIndex + 1) % YOUTUBE_API_KEYS.length;
      return key;
    }
    currentKeyIndex = (currentKeyIndex + 1) % YOUTUBE_API_KEYS.length;
    attempts++;
  }
  return null;
}

export function areAllKeysExhausted(): boolean {
  return deadKeys.size >= YOUTUBE_API_KEYS.length;
}

export interface YouTubeSearchResult {
  articles: MediaNewsArticle[];
  nextPageToken: string | null;
}

// ─── Cache Layer ────────────────────────────────────────────────

async function getCache(key: string): Promise<YouTubeSearchResult | null> {
  try {
    await ensureValidSession();
    const { data, error } = await supabase
      .from('api_cache')
      .select('data')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error && error.message?.includes('JWT expired')) {
      await supabase.auth.refreshSession();
      const retry = await supabase
        .from('api_cache')
        .select('data')
        .eq('cache_key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (retry.data?.data) return retry.data.data as unknown as YouTubeSearchResult;
      return null;
    }
    if (data?.data) {
      console.log(`[Cache HIT] ${key}`);
      return data.data as unknown as YouTubeSearchResult;
    }
  } catch (e) {
    console.warn('[Cache] Read error:', e);
  }
  return null;
}

/** Lifetime archive: upsert to Supabase with 30-day expiry */
async function archiveToCache(key: string, value: YouTubeSearchResult, source = 'youtube') {
  try {
    await ensureValidSession();
    await supabase.from('api_cache').upsert({
      cache_key: key,
      data: value as any,
      source,
      expires_at: new Date(Date.now() + ARCHIVE_EXPIRY_MS).toISOString(),
    }, { onConflict: 'cache_key' });
    console.log(`[Archive] Saved ${value.articles.length} items → ${key}`);
  } catch (e) {
    console.warn('[Archive] Write error:', e);
  }
}

/** Also save individual video records for lifetime search */
async function archiveIndividualVideos(articles: MediaNewsArticle[], type: 'long' | 'short') {
  await ensureValidSession();
  for (const article of articles) {
    if (!article.videoId) continue;
    const key = `vid:${type}:${article.videoId}`;
    try {
      await supabase.from('api_cache').upsert({
        cache_key: key,
        data: { articles: [article] } as any,
        source: 'youtube-individual',
        expires_at: new Date(Date.now() + ARCHIVE_EXPIRY_MS).toISOString(),
      }, { onConflict: 'cache_key' });
    } catch {
      // Silent fail for individual archives
    }
  }
}

/** Get historical data from last N days for hybrid feed */
export async function getHistoricalFeed(
  type: 'long' | 'short',
  offset = 0,
  limit = 15,
): Promise<YouTubeSearchResult> {
  try {
    await ensureValidSession();
    const { data } = await supabase
      .from('api_cache')
      .select('data, created_at')
      .or(`cache_key.like.yt:${type}:%,cache_key.like.vid:${type}:%`)
      .order('created_at', { ascending: false })
      .range(offset, offset + 50);

    if (!data || data.length === 0) return { articles: [], nextPageToken: null };

    const allArticles: MediaNewsArticle[] = [];
    for (const row of data) {
      const cached = row.data as unknown as YouTubeSearchResult;
      if (!cached?.articles?.length) continue;
      for (const article of cached.articles) {
        if (!article.videoId || isAlreadySeen(article)) continue;
        allArticles.push({ ...article, _source: 'archived' as const });
      }
    }

    allArticles.sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));

    const page = allArticles.slice(0, limit);
    const hasMore = allArticles.length > limit;

    return {
      articles: page,
      nextPageToken: hasMore ? `archive:${type}:${offset + 50}` : null,
    };
  } catch (e) {
    console.warn('[Historical] Fetch error:', e);
    return { articles: [], nextPageToken: null };
  }
}

/** Get historical news articles (non-video) from Supabase archive */
export async function getHistoricalNewsFeed(
  offset = 0,
  limit = 20,
): Promise<{ articles: MediaNewsArticle[]; hasMore: boolean }> {
  try {
    const { data } = await supabase
      .from('api_cache')
      .select('data, created_at')
      .like('cache_key', 'news:%')
      .order('created_at', { ascending: false })
      .range(offset, offset + 60);

    if (!data || data.length === 0) return { articles: [], hasMore: false };

    const allArticles: MediaNewsArticle[] = [];
    for (const row of data) {
      const payload = row.data as any;
      const articles = Array.isArray(payload?.articles) ? payload.articles : [];
      for (const article of articles) {
        if (!article?.title || article.title === '[Removed]') continue;
        const key = article.url || article.title;
        if (globalSeenArticleKeys.has(key)) continue;
        globalSeenArticleKeys.add(key);
        allArticles.push({
          ...article,
          mediaType: article.mediaType || 'text',
          _source: 'archived' as const,
        });
      }
    }

    allArticles.sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));
    const page = allArticles.slice(0, limit);
    return { articles: page, hasMore: allArticles.length > limit };
  } catch (e) {
    console.warn('[HistoricalNews] Fetch error:', e);
    return { articles: [], hasMore: false };
  }
}
/** Get cached results with cyclic pagination fallback */
async function getFallbackCache(type: 'long' | 'short'): Promise<YouTubeSearchResult | null> {
  try {
    const { data } = await supabase
      .from('api_cache')
      .select('data')
      .like('cache_key', `yt:${type}:%`)
      .order('created_at', { ascending: false })
      .limit(80);

    if (!data || data.length === 0) return null;

    const allArticles: MediaNewsArticle[] = [];

    for (const row of data) {
      const cached = row.data as unknown as YouTubeSearchResult;
      if (!cached?.articles?.length) continue;

      for (const article of cached.articles) {
        if (!article.videoId || isAlreadySeen(article)) continue;
        allArticles.push(article);
      }
    }

    if (allArticles.length === 0) return null;

    // Sort by date for freshness
    allArticles.sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));

    const randomOffset = Math.floor(Math.random() * Math.min(allArticles.length, 20));
    const cursor = (cacheCycleCursor[type] + randomOffset) % allArticles.length;
    const batchSize = Math.min(CACHE_CYCLE_BATCH_SIZE, allArticles.length);
    const primarySlice = allArticles.slice(cursor, cursor + batchSize);
    const wrapped =
      primarySlice.length < batchSize
        ? [...primarySlice, ...allArticles.slice(0, batchSize - primarySlice.length)]
        : primarySlice;

    cacheCycleCursor[type] = (cursor + wrapped.length) % allArticles.length;

    console.log(`[Cache FALLBACK] Serving ${wrapped.length}/${allArticles.length} cached ${type} videos`);

    return {
      articles: wrapped,
      nextPageToken: `cache:${type}:${cacheCycleCursor[type]}`,
    };
  } catch (e) {
    console.warn('[Cache] Fallback error:', e);
  }

  return null;
}

/** Fuzzy keyword search in cache (DB-first query mode) */
async function searchCacheByQuery(type: 'long' | 'short', query: string): Promise<YouTubeSearchResult | null> {
  try {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length > 2)
      .slice(0, 3);

    if (words.length === 0) return null;

    const pattern = `yt:${type}:%${words[0]}%`;
    const { data } = await supabase
      .from('api_cache')
      .select('data')
      .like('cache_key', pattern)
      .order('created_at', { ascending: false })
      .limit(40);

    if (!data || data.length === 0) return null;

    const allArticles: MediaNewsArticle[] = [];

    for (const row of data) {
      const cached = row.data as unknown as YouTubeSearchResult;
      if (!cached?.articles?.length) continue;

      for (const article of cached.articles) {
        const haystack = `${article.title || ''} ${article.description || ''}`.toLowerCase();
        const matches = words.every(word => haystack.includes(word));
        if (!matches || !article.videoId || isAlreadySeen(article)) continue;
        allArticles.push(article);
      }
    }

    if (allArticles.length === 0) return null;

    // Sort by date
    allArticles.sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));

    const cursor = cacheCycleCursor[type] % allArticles.length;
    const batchSize = Math.min(CACHE_CYCLE_BATCH_SIZE, allArticles.length);
    const primarySlice = allArticles.slice(cursor, cursor + batchSize);
    const wrapped =
      primarySlice.length < batchSize
        ? [...primarySlice, ...allArticles.slice(0, batchSize - primarySlice.length)]
        : primarySlice;

    cacheCycleCursor[type] = (cursor + wrapped.length) % allArticles.length;

    const cycleTag = Date.now();
    const cycledArticles = wrapped.map((article, index) => ({
      ...article,
      id: `${article.id || `yt-${type}-${article.videoId || 'cache'}`}-search-cycle-${cycleTag}-${index}`,
    }));

    return {
      articles: cycledArticles,
      nextPageToken: `cache-search:${type}:${cacheCycleCursor[type]}`,
    };
  } catch (e) {
    console.warn('[Cache] Fuzzy search error:', e);
    return null;
  }
}

// ─── Global Archive Search (for GlobalSearch component) ────────

export async function searchFullArchive(query: string, limit = 30): Promise<MediaNewsArticle[]> {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 4);
  if (words.length === 0) return [];

  try {
    // Search across all cache types
    const { data } = await supabase
      .from('api_cache')
      .select('data, created_at')
      .or(`cache_key.like.%${words[0]}%,source.eq.youtube-individual,source.eq.newsapi,source.eq.youtube`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!data?.length) return [];

    const results: MediaNewsArticle[] = [];
    const seen = new Set<string>();

    for (const row of data) {
      const payload = row.data as any;
      const articles = Array.isArray(payload?.articles) ? payload.articles : [];

      for (const article of articles) {
        if (!article?.title || article.title === '[Removed]') continue;

        const haystack = `${article.title} ${article.description || ''}`.toLowerCase();
        // Prioritize description matches
        const descMatch = words.every(w => (article.description || '').toLowerCase().includes(w));
        const titleMatch = words.every(w => haystack.includes(w));

        if (!descMatch && !titleMatch) continue;

        const key = article.videoId || article.url || article.title;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          ...article,
          // Boost score for description matches
          _searchScore: descMatch ? 2 : 1,
        });
      }
    }

    // Sort: description matches first, then by date
    results.sort((a, b) => {
      const scoreA = (a as any)._searchScore || 0;
      const scoreB = (b as any)._searchScore || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '');
    });

    return results.slice(0, limit);
  } catch (e) {
    console.warn('[ArchiveSearch] Error:', e);
    return [];
  }
}

// ─── YouTube API with Key Rotation ──────────────────────────────

async function fetchWithRotation(baseParams: URLSearchParams): Promise<{ ok: boolean; data: any }> {
  let attempts = 0;
  const maxAttempts = YOUTUBE_API_KEYS.length;

  while (attempts < maxAttempts) {
    const key = getNextKey();
    if (!key) break;

    const keyIdx = YOUTUBE_API_KEYS.indexOf(key);
    const params = new URLSearchParams(baseParams);
    params.set('key', key);
    attempts++;

    try {
      // Cache-bust: append unique timestamp to force fresh results
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}&_t=${Date.now()}`);
      const data = await res.json();

      if (res.ok && data.items?.length > 0) {
        return { ok: true, data };
      }

      const reason = data?.error?.errors?.[0]?.reason as string | undefined;
      const shouldRotateKey =
        TEMPORARY_ROTATION_REASONS.has(reason || '') ||
        res.status === 403 ||
        res.status === 429 ||
        res.status >= 500;

      if (shouldRotateKey) {
        console.warn(`[YouTube] Key #${keyIdx} unavailable (${reason || res.status}), rotating...`);
        deadKeys.add(keyIdx);
        continue;
      }

      return { ok: false, data };
    } catch (err) {
      console.error(`[YouTube] Network error on key #${keyIdx}:`, err);
      deadKeys.add(keyIdx);
      if (attempts >= maxAttempts) throw err;
    }
  }

  return { ok: false, data: { error: { message: 'All API keys exhausted' } } };
}

// ─── Main Search Function ───────────────────────────────────────

function passesVerificationChecks(item: any): boolean {
  const publishedAt = item?.snippet?.publishedAt;
  if (!publishedAt) return false;

  const publishedMs = Date.parse(publishedAt);
  if (Number.isNaN(publishedMs)) return false;

  if (publishedMs > Date.now() + 2 * 60 * 60 * 1000) return false;

  const title = (item?.snippet?.title || '').trim();
  if (title.length < 6 || title === '[Removed]') return false;

  const desc = (item?.snippet?.description || '').toLowerCase();
  const titleLower = title.toLowerCase();

  // Filter out static/low-quality content (quotes, memes, text-only reels)
  const staticIndicators = ['quote', 'motivation', 'meme', 'static image', 'whatsapp status', 'shayari', 'poem'];
  const isStaticContent = staticIndicators.some(s => titleLower.includes(s) || desc.includes(s));
  if (isStaticContent) return false;

  // Reduce cricket frequency by 80% — keep only 1 in 5 cricket videos
  const cricketTerms = ['cricket', 'ipl', 'bcci', 'wicket', 'sixer', 'boundary', 'innings'];
  const isCricket = cricketTerms.some(t => titleLower.includes(t));
  if (isCricket && Math.random() > 0.2) return false;

  return Boolean(item?.id?.videoId);
}

function mapYouTubeItems(items: any[], type: 'long' | 'short'): MediaNewsArticle[] {
  return items
    .filter((item: any) => passesVerificationChecks(item))
    .map((item: any, idx: number) => {
      const videoId = item.id.videoId;
      const s = item.snippet || {};
      const isShort = type === 'short';

      return {
        id: `yt-${type}-${videoId}-${Date.now()}-${idx}`,
        title: s.title,
        description: s.description?.substring(0, 300) || null,
        url: isShort ? `https://www.youtube.com/shorts/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`,
        urlToImage: s.thumbnails?.high?.url || s.thumbnails?.medium?.url || null,
        publishedAt: s.publishedAt,
        source: { id: null, name: s.channelTitle || 'YouTube India' },
        author: s.channelTitle || null,
        content: null,
        category: 'general',
        tier: (idx < 3 ? 'top' : idx < 8 ? 'trending' : 'latest') as 'top' | 'trending' | 'latest',
        mediaType: isShort ? ('short_video' as const) : ('long_video' as const),
        videoId,
        _source: 'live' as const,
        _fetchedAt: new Date().toISOString(),
      };
    });
}

export async function searchYouTube(
  query: string,
  type: 'long' | 'short',
  maxResults = 10,
  pageToken?: string | null,
): Promise<YouTubeSearchResult> {
  const normalizedQuery = normalizeQuery(query) || (type === 'short' ? 'India news shorts today' : 'India news latest');

  // Archive pagination: serve from DB
  if (pageToken?.startsWith('archive:')) {
    const parts = pageToken.split(':');
    const offset = parseInt(parts[2] || '0', 10);
    return getHistoricalFeed(type, offset, 15);
  }

  // Cache-cycle token path
  if (pageToken?.startsWith('cache:') || pageToken?.startsWith('cache-search:')) {
    const queryFallback = await searchCacheByQuery(type, normalizedQuery);
    if (queryFallback) return queryFallback;

    // Try historical feed when cache-cycle is exhausted
    const historical = await getHistoricalFeed(type, 0, 15);
    if (historical.articles.length > 0) return historical;

    const fallback = await getFallbackCache(type);
    return fallback || { articles: [], nextPageToken: null };
  }

  // 1) Reset dead keys if a new day has started (API quotas reset daily)
  resetDeadKeysIfNewDay();

  const searchWindows = [PRIMARY_LOOKBACK_HOURS, FALLBACK_LOOKBACK_HOURS];

  // 2) Live API search with 24h -> 7d widening
  for (const lookbackHours of searchWindows) {
    const tokenForAttempt = pageToken || null;
    const cacheKey = `yt:${type}:h${lookbackHours}:${normalizedQuery.toLowerCase().slice(0, 80)}:${maxResults}:${tokenForAttempt || ''}`;

    // BYPASS CACHE on first page load (no pageToken) to force fresh API results
    if (pageToken) {
      const cached = await getCache(cacheKey);
      if (cached) return cached;
    }

    if (deadKeys.size >= YOUTUBE_API_KEYS.length) {
      console.warn(`[YouTube] All keys exhausted while searching ${type}, switching to hybrid archive`);
      break;
    }

    const params = buildSearchParams({
      query: normalizedQuery,
      type,
      maxResults,
      pageToken: tokenForAttempt,
      lookbackHours,
    });

    try {
      const { ok, data } = await fetchWithRotation(params);
      if (!ok || !data?.items?.length) {
        console.warn(`[YouTube] No ${type} results in ${lookbackHours}h window`);
        continue;
      }

      const articles = mapYouTubeItems(data.items, type);
      if (articles.length === 0) {
        console.warn(`[YouTube] ${type} response had no valid items in ${lookbackHours}h window`);
        continue;
      }

      const result: YouTubeSearchResult = { articles, nextPageToken: data.nextPageToken || null };

      // Lifetime archive: both batch and individual
      archiveToCache(cacheKey, result).catch(() => {});
      archiveIndividualVideos(articles, type).catch(() => {});

      console.log(`[YouTube] ${type}: ${articles.length} videos, window=${lookbackHours}h, nextPage=${result.nextPageToken ? 'yes' : 'no'}`);
      return result;
    } catch (err) {
      console.error(`[YouTube] Network error (${type}, ${lookbackHours}h):`, err);
    }
  }

  // 3) HYBRID FALLBACK: Seamlessly switch to archive when API quota is hit
  console.log(`[Hybrid] API exhausted for ${type}, seamlessly switching to archive mode`);

  const queryFallback = await searchCacheByQuery(type, normalizedQuery);
  if (queryFallback) return queryFallback;

  // Try historical feed from last 5 days
  const historical = await getHistoricalFeed(type, 0, 15);
  if (historical.articles.length > 0) return historical;

  const fallback = await getFallbackCache(type);
  return fallback || { articles: [], nextPageToken: null };
}

// ─── Dual-Sync: Match NewsAPI headlines to YouTube ──────────────

export async function dualSyncHeadlinesToYouTube(
  headlines: string[],
  maxPerHeadline = 2,
): Promise<{ long: MediaNewsArticle[]; short: MediaNewsArticle[] }> {
  const longVideos: MediaNewsArticle[] = [];
  const shortVideos: MediaNewsArticle[] = [];

  if (deadKeys.size >= YOUTUBE_API_KEYS.length) {
    console.warn('[DualSync] All keys dead, serving from archive');
    const [longFallback, shortFallback] = await Promise.all([
      getHistoricalFeed('long', 0, 15),
      getHistoricalFeed('short', 0, 15),
    ]);
    return {
      long: longFallback?.articles || [],
      short: shortFallback?.articles || [],
    };
  }

  const selected = headlines.slice(0, 6);

  const promises = selected.map(async (headline) => {
    const shortQuery = `${headline} shorts India`;
    const longQuery = `${headline} India news report`;

    const [longRes, shortRes] = await Promise.allSettled([
      searchYouTube(longQuery, 'long', maxPerHeadline),
      searchYouTube(shortQuery, 'short', maxPerHeadline),
    ]);

    if (longRes.status === 'fulfilled') longVideos.push(...longRes.value.articles);
    if (shortRes.status === 'fulfilled') shortVideos.push(...shortRes.value.articles);
  });

  await Promise.all(promises);

  return {
    long: deduplicateArticles(longVideos),
    short: deduplicateArticles(shortVideos),
  };
}

// ─── Standalone Trending Fetch ──────────────────────────────────

export async function fetchTrendingVideos(
  type: 'long' | 'short',
  maxResults = 15,
  pageToken?: string | null,
  customQuery?: string,
): Promise<YouTubeSearchResult> {
  const query = customQuery || (
    type === 'short'
      ? 'India breaking news viral shorts action highlight today'
      : 'India news today trending latest world report breaking'
  );
  return searchYouTube(query, type, maxResults, pageToken);
}
