import { useState, useEffect, useCallback, useRef } from 'react';
import { FloatingAIChatBubble } from '@/components/FloatingAIChatBubble';
import { Search, RefreshCw, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { NewsCategory } from '@/types';
import { NewsSectionGrid } from '@/components/news/NewsSectionGrid';
import { classifyMediaType, type MediaNewsArticle } from '@/types/news-media';
import { dualSyncHeadlinesToYouTube, fetchTrendingVideos, deduplicateArticles, registerSeen, areAllKeysExhausted, getHistoricalFeed, getHistoricalNewsFeed } from '@/lib/youtube-client';

const categories: { value: NewsCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'technology', label: 'Technology' },
  { value: 'sports', label: 'Sports' },
  { value: 'business', label: 'Business' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'health', label: 'Health' },
  { value: 'science', label: 'Science' },
];

const LOCALSTORAGE_KEY = 'averia_news_cache';
const LOCALSTORAGE_TTL = 10 * 60 * 1000; // 10 minutes

function loadFromLocalStorage(): MediaNewsArticle[] | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY);
    if (!raw) return null;
    const { articles, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > LOCALSTORAGE_TTL) return null;
    return articles?.slice(0, 10) || null;
  } catch { return null; }
}

function saveToLocalStorage(articles: MediaNewsArticle[]) {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({
      articles: articles.slice(0, 10),
      timestamp: Date.now(),
    }));
  } catch { /* quota exceeded */ }
}

/** Strict dedup: videoId for videos, url for articles. If in both API+DB, keep API (green dot). */
function strictMergeDedup(existing: MediaNewsArticle[], incoming: MediaNewsArticle[]): MediaNewsArticle[] {
  const keyMap = new Map<string, MediaNewsArticle>();
  // Add existing first
  for (const a of existing) {
    const key = a.videoId || a.url || a.title;
    if (key) keyMap.set(key, a);
  }
  // Incoming overwrites if it's 'live' (green dot priority)
  for (const a of incoming) {
    const key = a.videoId || a.url || a.title;
    if (!key) continue;
    const prev = keyMap.get(key);
    if (!prev || a._source === 'live') {
      keyMap.set(key, a);
    }
  }
  return Array.from(keyMap.values());
}

export default function News() {
  const { user } = useAuth();
  const [realNews, setRealNews] = useState<MediaNewsArticle[]>(() => loadFromLocalStorage() || []);
  const [debunkedNews, setDebunkedNews] = useState<MediaNewsArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedCategory, setSelectedCategory] = useState<NewsCategory | 'all'>('all');
  const [savedNews, setSavedNews] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [loadingMoreNews, setLoadingMoreNews] = useState(false);
  const [loadingMoreLong, setLoadingMoreLong] = useState(false);
  const [loadingMoreShort, setLoadingMoreShort] = useState(false);

  // Pagination state
  const [newsPage, setNewsPage] = useState(1);
  const [hasMoreNews, setHasMoreNews] = useState(true);
  const [ytPageTokens, setYtPageTokens] = useState<{ long: string | null; short: string | null }>({ long: null, short: null });
  const [hasMoreVideos, setHasMoreVideos] = useState<{ long: boolean; short: boolean }>({ long: true, short: true });
  // Archive offset for hybrid feed
  const [archiveOffset, setArchiveOffset] = useState<{ long: number; short: number; news: number }>({ long: 0, short: 0, news: 0 });

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const buildNewsCacheKey = useCallback((page: number, pageSize: number) => {
    const categoryKey = selectedCategory === 'all' ? 'general' : selectedCategory;
    return `news:${categoryKey}:${page}:${pageSize}:${searchQuery || ''}`;
  }, [selectedCategory, searchQuery]);

  const archiveNewsToCache = useCallback(async (key: string, articles: MediaNewsArticle[]) => {
    if (!articles.length) return;
    try {
      // Refresh session if needed before DB write
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.expires_at && session.expires_at - Math.floor(Date.now() / 1000) < 60) {
        await supabase.auth.refreshSession();
      }
      await supabase.from('api_cache').upsert({
        cache_key: key,
        data: { articles } as any,
        source: 'newsapi',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' });
    } catch (e) {
      console.warn('[Archive] News cache write error:', e);
    }
  }, []);

  const searchApiCacheFirst = useCallback(async (query: string): Promise<MediaNewsArticle[]> => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const word = normalized.split(/\s+/).find(w => w.length > 2) || normalized;
    const categoryKey = selectedCategory === 'all' ? '' : selectedCategory;

    try {
      // Ensure valid session before search queries
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.expires_at && session.expires_at - Math.floor(Date.now() / 1000) < 60) {
        await supabase.auth.refreshSession();
      }
      const [newsResult, longResult, shortResult] = await Promise.all([
        supabase
          .from('api_cache')
          .select('data, created_at')
          .like('cache_key', categoryKey ? `news:${categoryKey}:%${word}%` : `news:%${word}%`)
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('api_cache')
          .select('data, created_at')
          .like('cache_key', `yt:long:%${word}%`)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('api_cache')
          .select('data, created_at')
          .like('cache_key', `yt:short:%${word}%`)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const rows = [
        ...(newsResult.data || []),
        ...(longResult.data || []),
        ...(shortResult.data || []),
      ];

      const collected: MediaNewsArticle[] = [];
      for (const row of rows) {
        const payload = row.data as any;
        const payloadArticles = Array.isArray(payload?.articles) ? payload.articles : [];

        for (const article of payloadArticles) {
          if (!article?.title || !article?.url || article.title === '[Removed]') continue;

          const haystack = `${article.title} ${article.description || ''}`.toLowerCase();
          if (!haystack.includes(word)) continue;

          collected.push({
            ...article,
            mediaType: article.mediaType || classifyMediaType(article),
            isDebunked: false,
          });
        }
      }

      const seen = new Set<string>();
      const deduped = collected.filter((article) => {
        const key = article.videoId || article.url || article.title;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a, b) => Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || ''));
      return deduped;
    } catch (error) {
      console.warn('[Cache Search] failed:', error);
      return [];
    }
  }, [selectedCategory]);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setNewsPage(1);
    setHasMoreNews(true);
    setYtPageTokens({ long: null, short: null });
    setHasMoreVideos({ long: true, short: true });

    try {
      const searchText = searchQuery.trim();

      // Database-first search path
      if (searchText) {
        const cachedSearch = await searchApiCacheFirst(searchText);
        if (cachedSearch.length > 0) {
          setRealNews(cachedSearch);
          setHasMoreVideos({
            long: cachedSearch.some(a => a.mediaType === 'long_video'),
            short: cachedSearch.some(a => a.mediaType === 'short_video'),
          });
          setHasMoreNews(cachedSearch.some(a => !['long_video', 'short_video'].includes(a.mediaType)));
          setLoading(false);
          return;
        }
      }

      // PARALLEL: Fetch from API AND Supabase archive simultaneously
      const [newsResult, archiveLongRes, archiveShortRes, archiveNewsRes] = await Promise.allSettled([
        supabase.functions.invoke('fetch-news', {
          body: {
            category: selectedCategory === 'all' ? 'general' : selectedCategory,
            pageSize: 30,
            page: 1,
            query: searchText || undefined,
            bypassCache: true, // Force fresh fetch on app init
          },
        }),
        getHistoricalFeed('long', 0, 15),
        getHistoricalFeed('short', 0, 15),
        getHistoricalNewsFeed(0, 20),
      ]);

      let newsArticles: MediaNewsArticle[] = [];
      const headlines: string[] = [];

      const newsData = newsResult.status === 'fulfilled' ? newsResult.value.data : null;
      if (newsData?.success && newsData.articles?.length > 0) {
        newsArticles = newsData.articles.map((article: any) => ({
          ...article,
          mediaType: article.mediaType || classifyMediaType(article),
          isDebunked: false,
          _source: 'live' as const,
          _fetchedAt: new Date().toISOString(),
        }));
        newsData.articles.forEach((a: any) => headlines.push(a.title));
        setHasMoreNews(newsData.articles.length >= 30);
      }

      // Merge debunked from news result
      if (newsData?.debunkedArticles?.length > 0) {
        const debunkedFromAI: MediaNewsArticle[] = newsData.debunkedArticles.map((article: any) => ({
          ...article,
          mediaType: article.mediaType || classifyMediaType(article),
          isDebunked: true,
          verdict: article.verdict || 'misleading',
        }));
        setDebunkedNews(prev => {
          const seen = new Set(prev.map(a => a.title));
          const newOnes = debunkedFromAI.filter(a => !seen.has(a.title));
          return [...newOnes, ...prev];
        });
      }

      // Collect archive results (purple dots)
      const archiveLong = archiveLongRes.status === 'fulfilled' ? archiveLongRes.value.articles : [];
      const archiveShort = archiveShortRes.status === 'fulfilled' ? archiveShortRes.value.articles : [];
      const archiveNews = archiveNewsRes.status === 'fulfilled' ? archiveNewsRes.value.articles : [];

      const longSeedQuery = searchText ? `${searchText} India latest news report` : undefined;
      const shortSeedQuery = searchText ? `${searchText} India shorts breaking` : undefined;

      // Client-side YouTube fetch: dual-sync + standalone trending
      const [dualSync, trendingLong, trendingShort] = await Promise.allSettled([
        dualSyncHeadlinesToYouTube(headlines, 2),
        fetchTrendingVideos('long', 15, null, longSeedQuery),
        fetchTrendingVideos('short', 15, null, shortSeedQuery),
      ]);

      let longVideos: MediaNewsArticle[] = [];
      let shortVideos: MediaNewsArticle[] = [];

      if (dualSync.status === 'fulfilled') {
        longVideos.push(...dualSync.value.long);
        shortVideos.push(...dualSync.value.short);
      }

      if (trendingLong.status === 'fulfilled') {
        const existingIds = new Set(longVideos.map(v => v.videoId));
        const newOnes = trendingLong.value.articles.filter(a => !existingIds.has(a.videoId));
        longVideos.push(...newOnes);
        setYtPageTokens(prev => ({ ...prev, long: trendingLong.value.nextPageToken }));
      }

      if (trendingShort.status === 'fulfilled') {
        const existingIds = new Set(shortVideos.map(v => v.videoId));
        const newOnes = trendingShort.value.articles.filter(a => !existingIds.has(a.videoId));
        shortVideos.push(...newOnes);
        setYtPageTokens(prev => ({ ...prev, short: trendingShort.value.nextPageToken }));
      }

      // Ensure every item has _source tag and _fetchedAt - MANDATORY
      const nowISO = new Date().toISOString();
      const allLive = [...longVideos, ...shortVideos, ...newsArticles];
      const allArchive = [...archiveLong, ...archiveShort, ...archiveNews];
      allLive.forEach(a => { if (!a._source) a._source = 'live'; a._fetchedAt = nowISO; });
      allArchive.forEach(a => { if (!a._source) a._source = 'archived'; });
      // STRICT MERGE: Today's (green) on top, historical (purple) below
      const merged = strictMergeDedup([], [...allLive, ...allArchive]);

      // Sort: items from last 24h (green dot) on top, then by publishedAt desc
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      merged.sort((a, b) => {
        const aTime = new Date(a._fetchedAt || a.publishedAt || '').getTime();
        const bTime = new Date(b._fetchedAt || b.publishedAt || '').getTime();
        const aIsLive = aTime >= twentyFourHoursAgo;
        const bIsLive = bTime >= twentyFourHoursAgo;
        if (aIsLive && !bIsLive) return -1;
        if (bIsLive && !aIsLive) return 1;
        return Date.parse(b.publishedAt || '') - Date.parse(a.publishedAt || '');
      });

      // Register all in global dedup
      merged.forEach(registerSeen);

      setRealNews(merged);
      setHasMoreVideos({ long: true, short: true });
      setHasMoreNews(true);

      // Save first 10 to localStorage for instant open
      saveToLocalStorage(merged);

      // Auto-archive all successful article fetches
      if (newsArticles.length > 0) {
        archiveNewsToCache(buildNewsCacheKey(1, 30), newsArticles).catch(() => {});
      }

      const longCount = merged.filter(a => a.mediaType === 'long_video').length;
      const shortCount = merged.filter(a => a.mediaType === 'short_video').length;
      console.log(`[News] Loaded: ${longCount} long videos, ${shortCount} reels, ${merged.length - longCount - shortCount} articles (live+archive)`);

    } catch (error) {
      console.error('Error fetching news:', error);
      // NEVER clear content - try archive fallback
      try {
        const [archiveLong, archiveShort, archiveNews] = await Promise.all([
          getHistoricalFeed('long', 0, 15),
          getHistoricalFeed('short', 0, 15),
          getHistoricalNewsFeed(0, 20),
        ]);
        const archiveAll = [...archiveLong.articles, ...archiveShort.articles, ...archiveNews.articles];
        if (archiveAll.length > 0) {
          setRealNews(prev => prev.length > 0 ? prev : archiveAll);
        }
      } catch { /* silent */ }
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, searchQuery, searchApiCacheFirst, archiveNewsToCache, buildNewsCacheKey]);

  // Load more news articles (infinite scroll for text/image/audio/url)
  const handleLoadMoreNews = useCallback(async () => {
    if (loadingMoreNews) return;
    setLoadingMoreNews(true);
    const nextPage = newsPage + 1;

    try {
      // PARALLEL: fetch from API AND archive simultaneously
      const [apiResult, archiveResult] = await Promise.allSettled([
        supabase.functions.invoke('fetch-news', {
          body: {
            category: selectedCategory === 'all' ? 'general' : selectedCategory,
            pageSize: 20,
            page: nextPage,
            query: searchQuery || undefined,
          },
        }),
        getHistoricalNewsFeed(archiveOffset.news, 20),
      ]);

      const apiData = apiResult.status === 'fulfilled' ? apiResult.value.data : null;
      let apiArticles: MediaNewsArticle[] = [];
      if (apiData?.success && apiData.articles?.length > 0) {
        apiArticles = apiData.articles.map((article: any) => ({
          ...article,
          mediaType: article.mediaType || classifyMediaType(article),
          isDebunked: false,
          _source: 'live' as const,
          _fetchedAt: new Date().toISOString(),
        }));
        setNewsPage(nextPage);
        archiveNewsToCache(buildNewsCacheKey(nextPage, 20), apiArticles).catch(() => {});

        if (apiData.debunkedArticles?.length > 0) {
          const debunkedFromAI: MediaNewsArticle[] = apiData.debunkedArticles.map((a: any) => ({
            ...a,
            mediaType: a.mediaType || classifyMediaType(a),
            isDebunked: true,
            verdict: a.verdict || 'misleading',
          }));
          setDebunkedNews(prev => {
            const seen = new Set(prev.map(x => x.title));
            return [...prev, ...debunkedFromAI.filter(x => !seen.has(x.title))];
          });
        }
      }

      const archiveArticles = archiveResult.status === 'fulfilled' ? archiveResult.value.articles : [];
      // Tag sources
      apiArticles.forEach(a => { if (!a._source) a._source = 'live'; });
      archiveArticles.forEach(a => { if (!a._source) a._source = 'archived'; });
      if (archiveArticles.length > 0) {
        setArchiveOffset(prev => ({ ...prev, news: prev.news + 60 }));
      }

      const combined = [...apiArticles, ...archiveArticles];
      if (combined.length > 0) {
        setRealNews(prev => {
          const merged = strictMergeDedup(prev, combined);
          merged.forEach(registerSeen);
          return merged;
        });
      }
      // NEVER stop - always keep fetching
      setHasMoreNews(true);
    } catch {
      // Fallback to archive on error
      try {
        const currentOffset = archiveOffset.news;
        const archiveResult = await getHistoricalNewsFeed(currentOffset, 20);
        if (archiveResult.articles.length > 0) {
          setRealNews(prev => strictMergeDedup(prev, archiveResult.articles));
          setArchiveOffset(prev => ({ ...prev, news: currentOffset + 60 }));
          setHasMoreNews(archiveResult.hasMore);
        }
      } catch { /* silent */ }
    } finally {
      setLoadingMoreNews(false);
    }
  }, [loadingMoreNews, newsPage, selectedCategory, searchQuery, archiveNewsToCache, buildNewsCacheKey, archiveOffset.news]);

  // Varying queries for reel quality - prioritize high-action video content
  const longVideoQueries = [
    'India news today trending latest report',
    'India breaking news analysis today',
    'India political news latest update',
    'India technology business news today',
    'India world news documentary report',
    'India defence military news today',
    'international world breaking news today',
    'global politics economy news latest',
    'India national news live report today',
    'India science space ISRO news today',
  ];
  const shortVideoQueries = [
    'India breaking news viral shorts action',
    'trending India news shorts highlight today',
    'India latest breaking shorts clip live',
    'India viral news moments shorts action',
    'world breaking news shorts highlight',
    'international news shorts viral today',
    'India national politics shorts breaking',
    'India defence action shorts news today',
    'global news highlights shorts viral',
    'India live action news shorts trending',
  ];
  const [longQueryIndex, setLongQueryIndex] = useState(0);
  const [shortQueryIndex, setShortQueryIndex] = useState(0);

  // Load more YouTube videos (client-side) - independent per type
  // PARALLEL: Always loads from both API and archive simultaneously
  const handleLoadMoreVideos = useCallback(async (type: 'long' | 'short') => {
    const isLoading = type === 'long' ? loadingMoreLong : loadingMoreShort;
    if (isLoading) return;

    const activeToken = type === 'long' ? ytPageTokens.long : ytPageTokens.short;
    const searchText = searchQuery.trim();
    const queryFromSearch = searchText
      ? type === 'long'
        ? `${searchText} India latest news report`
        : `${searchText} India shorts breaking`
      : undefined;

    if (type === 'long') setLoadingMoreLong(true);
    else setLoadingMoreShort(true);

    try {
      // PARALLEL: Fetch from API and archive at the same time
      const runApiFetch = async (): Promise<{ articles: MediaNewsArticle[]; nextPageToken: string | null }> => {
        if (areAllKeysExhausted()) return { articles: [], nextPageToken: null };
        try {
          if (activeToken) {
            const result = await fetchTrendingVideos(type, 10, activeToken, queryFromSearch);
            if (result.articles.length > 0) return result;
          }
          // Rotate queries for fresh results
          if (queryFromSearch) {
            return fetchTrendingVideos(type, 10, null, queryFromSearch);
          }
          if (type === 'long') {
            const qi = longQueryIndex % longVideoQueries.length;
            setLongQueryIndex(prev => prev + 1);
            return fetchTrendingVideos(type, 10, null, longVideoQueries[qi]);
          }
          const qi = shortQueryIndex % shortVideoQueries.length;
          setShortQueryIndex(prev => prev + 1);
          return fetchTrendingVideos(type, 10, null, shortVideoQueries[qi]);
        } catch {
          return { articles: [], nextPageToken: null };
        }
      };

      const currentOffset = archiveOffset[type];
      const [apiResult, archiveResult] = await Promise.all([
        runApiFetch(),
        getHistoricalFeed(type, currentOffset, 15),
      ]);

      if (archiveResult.articles.length > 0) {
        setArchiveOffset(prev => ({ ...prev, [type]: currentOffset + 50 }));
      }

      // Tag sources
      apiResult.articles.forEach(a => { if (!a._source) a._source = 'live'; });
      archiveResult.articles.forEach(a => { if (!a._source) a._source = 'archived'; });
      const combined = [...apiResult.articles, ...archiveResult.articles];

      if (combined.length > 0) {
        setRealNews(prev => {
          const merged = strictMergeDedup(prev, combined);
          merged.forEach(registerSeen);
          return merged;
        });
      }

      setYtPageTokens(prev => ({ ...prev, [type]: apiResult.nextPageToken || null }));
      // NEVER stop - always keep fetching
      setHasMoreVideos(prev => ({
        ...prev,
        [type]: true,
      }));
    } catch (err) {
      console.error(`[LoadMore] ${type} error:`, err);
    } finally {
      if (type === 'long') setLoadingMoreLong(false);
      else setLoadingMoreShort(false);
    }
  }, [
    loadingMoreLong,
    loadingMoreShort,
    ytPageTokens.long,
    ytPageTokens.short,
    longQueryIndex,
    shortQueryIndex,
    searchQuery,
    archiveOffset,
  ]);

  const fetchDebunked = useCallback(async () => {
    try {
      const { data: dbData } = await supabase
        .from('debunked_news')
        .select('*')
        .order('debunked_at', { ascending: false })
        .limit(30);

      const dbMapped: MediaNewsArticle[] = (dbData || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.ai_reasoning,
        url: item.evidence_links?.[0] || '#',
        urlToImage: item.image_url,
        publishedAt: item.debunked_at,
        source: { id: null, name: item.original_source || 'Unknown' },
        author: 'Averia AI',
        content: item.claim,
        category: item.category || undefined,
        mediaType: classifyMediaType({
          title: item.title,
          description: item.ai_reasoning,
          url: item.evidence_links?.[0] || '',
          urlToImage: item.image_url,
          content: item.claim,
        }),
        isDebunked: true,
        verdict: 'debunked' as const,
      }));

      const { data: freshData } = await supabase.functions.invoke('fetch-news', {
        body: { fetchDebunked: true },
      });

      let freshMapped: MediaNewsArticle[] = [];
      if (freshData?.debunkedArticles?.length > 0) {
        freshMapped = freshData.debunkedArticles.map((article: any) => ({
          ...article,
          mediaType: classifyMediaType(article),
          isDebunked: true,
          verdict: 'misleading' as const,
        }));
      }

      const allDebunked = [...freshMapped, ...dbMapped];
      const seen = new Set<string>();
      const deduped = allDebunked.filter(a => {
        if (seen.has(a.title)) return false;
        seen.add(a.title);
        return true;
      });

      setDebunkedNews(deduped);
      console.log(`[Debunked] Loaded ${deduped.length} items`);
    } catch (error) {
      console.error('Error fetching debunked news:', error);
    }
  }, []);


  useEffect(() => { fetchNews(); }, [fetchNews]);
  useEffect(() => { fetchDebunked(); }, [fetchDebunked]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== '') fetchNews();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, fetchNews]);

  const handleVerifyArticle = async (article: MediaNewsArticle) => {
    setVerifyingId(article.id);
    try {
      const { data, error } = await supabase.functions.invoke('verify-fact', {
        body: { content: `${article.title}\n\n${article.description}`, contentType: 'news' },
      });
      if (error) throw error;
      if (data?.success) {
        const verdictEmoji = data.verdict === 'Real' ? '✅' : data.verdict === 'Fake' ? '❌' : '⚠️';
        toast.success(`${verdictEmoji} ${data.verdict} (${data.trustScore}% trust)\n${data.reasoning}`, { duration: 6000 });
        if (data.verdict === 'Fake' || data.verdict === 'Misleading') {
          const debunkedArticle: MediaNewsArticle = { ...article, isDebunked: true, verdict: data.verdict === 'Fake' ? 'fake' : 'misleading' };
          setDebunkedNews((prev) => [debunkedArticle, ...prev]);
          setRealNews((prev) => prev.filter((a) => a.id !== article.id));
          toast.info('Article moved to Debunked section', { duration: 3000 });
        }
      } else {
        toast.error('Verification failed. Please try again.');
      }
    } catch {
      toast.error('Failed to verify article.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleSaveNews = async (article: MediaNewsArticle) => {
    if (!user) { toast.error('Please sign in to save articles'); return; }
    const isSaved = savedNews.has(article.id);
    if (isSaved) {
      await supabase.from('saved_news').delete().eq('user_id', user.id).eq('url', article.url);
      setSavedNews((prev) => { const next = new Set(prev); next.delete(article.id); return next; });
      toast.success('Article removed from saved');
    } else {
      await supabase.from('saved_news').insert({
        user_id: user.id, title: article.title, description: article.description,
        url: article.url, image_url: article.urlToImage, source: article.source.name,
        published_at: article.publishedAt, category: article.category,
      });
      setSavedNews((prev) => new Set(prev).add(article.id));
      toast.success('Article saved!');
    }
  };

  // Scroll progress bar
  const [scrollProgress, setScrollProgress] = useState(0);
  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        setScrollProgress((window.scrollY / scrollHeight) * 100);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <Layout>
      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-[3px] bg-transparent">
        <div
          className="h-full bg-primary transition-[width] duration-100 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
      <div className="container mx-auto px-4 pt-0 pb-3">
        {/* ROW 1 — compact: centered "News" + [+], refresh on the right */}
        <div className="sticky top-0 z-40 flex h-[52px] max-h-[52px] flex-row items-center justify-between bg-background/90 pl-14 pr-14 backdrop-blur-xl md:pl-0">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-lg md:text-xl font-semibold leading-none whitespace-nowrap">News</h1>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('averia:create-news'))}
              className="h-10 w-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition"
              aria-label="Create news"
            >
              <Plus className="h-4.5 w-4.5" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)} className="h-11 w-11 shrink-0" aria-label="Open Channi search">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => fetchNews()} disabled={loading} className="h-11 w-11 shrink-0" aria-label="Refresh news">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        <NewsSectionGrid
            realNews={realNews}
            debunkedNews={debunkedNews}
            onSave={handleSaveNews}
            onVerify={handleVerifyArticle}
            savedIds={savedNews}
            verifyingId={verifyingId}
            onLoadMoreVideos={handleLoadMoreVideos}
            onLoadMoreNews={handleLoadMoreNews}
            hasMoreVideos={hasMoreVideos}
            hasMoreNews={hasMoreNews}
            loadingMoreNews={loadingMoreNews}
            loadingMoreLong={loadingMoreLong}
            loadingMoreShort={loadingMoreShort}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={(v) => setSelectedCategory(v as NewsCategory | 'all')}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

        {searchOpen && (
          <div className="fixed inset-0 z-[150] bg-background/95 backdrop-blur-2xl" role="dialog" aria-modal="true" aria-label="Channi news search">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pb-16 pt-5 sm:px-8 sm:pt-10">
              <div className="flex items-center gap-2">
                <div className="flex min-h-14 flex-1 items-center rounded-full border border-border bg-card px-4 shadow-2xl">
                  <Search className="mr-3 h-5 w-5 shrink-0 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => event.key === 'Enter' && setSearchOpen(false)}
                    placeholder="Search news, topics, or sources"
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  />
                  {searchQuery && (
                    <Button variant="ghost" size="icon" onClick={() => setSearchQuery('')} className="h-11 w-11 shrink-0" aria-label="Clear search">
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSearchOpen(false)} className="h-11 w-11 shrink-0" aria-label="Close search">
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Button
                    key={category.value}
                    variant={selectedCategory === category.value ? 'secondary' : 'outline'}
                    onClick={() => { setSelectedCategory(category.value); setSearchOpen(false); }}
                    className="rounded-full"
                  >
                    {category.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
      <FloatingAIChatBubble />
    </Layout>
  );
}
