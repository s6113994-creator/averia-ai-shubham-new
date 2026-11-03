/**
 * Client-side YouTube Data API v3 fetcher routing exclusively through Supabase Edge Functions.
 * Zero hardcoded API keys on the frontend.
 */
import type { MediaNewsArticle } from '@/types/news-media';
import { supabase } from '@/integrations/supabase/client';

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
    // Silent
  }
}

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

const ARCHIVE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_CYCLE_BATCH_SIZE = 10;
const cacheCycleCursor: Record<'long' | 'short', number> = { long: 0, short: 0 };

function normalizeQuery(query: string): string {
  return query
    .replace(/\bbreaking\s+news\s+action\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function areAllKeysExhausted(): boolean {
  return false;
}

export interface YouTubeSearchResult {
  articles: MediaNewsArticle[];
  nextPageToken: string | null;
}

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

    return {
      articles: wrapped,
      nextPageToken: `cache:${type}:${cacheCycleCursor[type]}`,
    };
  } catch (e) {
    console.warn('[Cache] Fallback error:', e);
  }

  return null;
}

export async function searchFullArchive(query: string, limit = 30): Promise<MediaNewsArticle[]> {
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2).slice(0, 4);
  if (words.length === 0) return [];

  try {
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
        const descMatch = words.every(w => (article.description || '').toLowerCase().includes(w));
        const titleMatch = words.every(w => haystack.includes(w));

        if (!descMatch && !titleMatch) continue;

        const key = article.videoId || article.url || article.title;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          ...article,
          _searchScore: descMatch ? 2 : 1,
        });
      }
    }

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

export async function searchYouTube(
  query: string,
  type: 'long' | 'short',
  maxResults = 10,
  pageToken?: string | null,
): Promise<YouTubeSearchResult> {
  const normalizedQuery = normalizeQuery(query) || (type === 'short' ? 'India news shorts today' : 'India news latest');

  if (pageToken?.startsWith('archive:')) {
    const parts = pageToken.split(':');
    const offset = parseInt(parts[2] || '0', 10);
    return getHistoricalFeed(type, offset, 15);
  }

  if (pageToken?.startsWith('cache:') || pageToken?.startsWith('cache-search:')) {
    const historical = await getHistoricalFeed(type, 0, 15);
    if (historical.articles.length > 0) return historical;
    const fallback = await getFallbackCache(type);
    return fallback || { articles: [], nextPageToken: null };
  }

  try {
    await ensureValidSession();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-youtube`, {
      method: 'POST',
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: normalizedQuery, type, maxResults, pageToken }),
    });
    const data = await res.json();

    if (res.ok && data?.success && data?.articles) {
      return {
        articles: data.articles,
        nextPageToken: data.nextPageToken || null,
      };
    }
  } catch (e) {
    console.warn('[YouTube Edge Function] Fallback to cache/archive:', e);
  }

  const historical = await getHistoricalFeed(type, 0, 15);
  if (historical.articles.length > 0) return historical;

  const fallback = await getFallbackCache(type);
  return fallback || { articles: [], nextPageToken: null };
}

export async function dualSyncHeadlinesToYouTube() {
  return { success: true };
}

export const fetchTrendingVideos = searchYouTube;
