import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const NEWS_API_KEYS = [
  '2a2c607411b2488f9b5bab17af6a8ea5',
  '59ae1b46bd4046a0ade43d48c5e4417e',
  'a4e70f9af3a34627ab3f90d9aa36d811',
  '30a4ac64313f4acd8926dd1857c2fedf',
];

let currentKeyIndex = 0;

function getNextNewsKey(): string {
  const key = NEWS_API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % NEWS_API_KEYS.length;
  return key;
}

const indiaQueries: Record<string, string> = {
  general: "India news today OR breaking news India",
  technology: "India technology OR Indian tech startups OR IT India",
  sports: "India cricket OR IPL OR Indian sports OR ISL football India",
  business: "India business OR Indian economy OR Sensex OR Nifty OR RBI",
  entertainment: "Bollywood OR Indian entertainment OR Indian cinema",
  health: "India health OR Indian healthcare OR medical India",
  science: "India science OR ISRO OR Indian research",
};

const globalQueries: Record<string, string> = {
  general: "world news today OR breaking news",
  technology: "technology news OR AI OR tech innovation",
  sports: "sports news OR football OR olympics",
  business: "global economy OR stock market OR business news",
  entertainment: "entertainment news OR Hollywood OR music",
  health: "health news OR WHO OR medical breakthrough",
  science: "science discovery OR NASA OR space exploration",
};

// Queries specifically for fetching potentially misleading/fake content for the Debunked section
const debunkedQueries = [
  "fake news debunked fact check",
  "misinformation viral hoax debunked",
  "fact check false claims trending",
  "misleading news viral social media",
  "conspiracy theory debunked latest",
];

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
  );
}

async function fetchWithRotation(url: string): Promise<Response> {
  let attempts = 0;
  while (attempts < NEWS_API_KEYS.length) {
    const key = getNextNewsKey();
    attempts++;

    const res = await fetch(url, { headers: { "X-Api-Key": key } });
    if (res.ok) return res;

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
      console.warn(`[NewsAPI] Key ${attempts}/${NEWS_API_KEYS.length} failed (${res.status}), rotating...`);
      continue;
    }

    return res;
  }

  throw new Error("All NewsAPI keys exhausted");
}

/** Batch pre-sort: send titles to AI, get back indices of fake/misleading articles */
async function preSortWithAI(articles: any[]): Promise<{ realArticles: any[]; debunkedArticles: any[] }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY || articles.length === 0) {
    return { realArticles: articles, debunkedArticles: [] };
  }

  try {
    const titleList = articles.slice(0, 50).map((a, i) => `${i}. ${a.title}`).join('\n');

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are Averia Intelligence, a news pre-screening AI. Given a numbered list of news headlines, identify which ones are likely FAKE or MISLEADING based on sensationalism, known misinformation patterns, clickbait, or unverifiable claims. Return ONLY a JSON array of the index numbers that are fake/misleading. If all seem legitimate, return an empty array []. Example: [2, 5, 11]`
          },
          { role: "user", content: titleList }
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.warn("[PreSort] AI returned", aiResponse.status);
      return { realArticles: articles, debunkedArticles: [] };
    }

    const data = await aiResponse.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    const flaggedIndices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    console.log(`[PreSort] Averia Intelligence flagged ${flaggedIndices.length}/${articles.length} articles`);

    const flaggedSet = new Set(flaggedIndices);
    const realArticles = articles.filter((_, i) => !flaggedSet.has(i));
    const debunkedArticles = articles.filter((_, i) => flaggedSet.has(i)).map(a => ({
      ...a,
      isDebunked: true,
      verdict: 'misleading',
    }));

    return { realArticles, debunkedArticles };
  } catch (e) {
    console.error("[PreSort] Error:", e);
    return { realArticles: articles, debunkedArticles: [] };
  }
}

/** Fetch specifically debunked/fact-check content to populate the Debunked section */
async function fetchDebunkedContent(): Promise<any[]> {
  try {
    const query = debunkedQueries[Math.floor(Math.random() * debunkedQueries.length)];
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=10&sortBy=publishedAt&language=en`;
    const res = await fetchWithRotation(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || [])
      .filter((a: any) => a.title && a.title !== "[Removed]" && a.description)
      .map((article: any, index: number) => ({
        id: `debunked-${Date.now()}-${index}`,
        title: article.title,
        description: article.description,
        url: article.url,
        urlToImage: article.urlToImage,
        source: article.source,
        publishedAt: article.publishedAt,
        author: article.author,
        content: article.content,
        category: 'debunked',
        tier: 'latest',
        isDebunked: true,
        verdict: 'misleading',
      }));
  } catch (e) {
    console.warn("[Debunked] Fetch error:", e);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { category = "general", pageSize = 20, page = 1, query, fetchDebunked = false, bypassCache = false } = await req.json();
    const supabase = getSupabase();

    // Special mode: fetch debunked content
    if (fetchDebunked) {
      const debunkedContent = await fetchDebunkedContent();
      
      // Also fetch from DB
      const { data: dbDebunked } = await supabase
        .from('debunked_news')
        .select('*')
        .order('debunked_at', { ascending: false })
        .limit(30);
      
      return new Response(JSON.stringify({
        success: true,
        articles: [],
        debunkedArticles: debunkedContent,
        dbDebunked: dbDebunked || [],
        totalResults: debunkedContent.length,
        page: 1,
        pageSize: 10,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Check cache first (skip if bypassCache is set for fresh init)
    const cacheKey = `news:${category}:${page}:${pageSize}:${query || ''}`;
    if (!bypassCache) {
      try {
        const { data: cached } = await supabase
          .from('api_cache')
          .select('data')
          .eq('cache_key', cacheKey)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();

        if (cached?.data) {
          console.log(`[Cache HIT] ${cacheKey}`);
          return new Response(JSON.stringify(cached.data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        console.warn("[Cache] Read error:", e);
      }
    } else {
      console.log(`[Cache BYPASS] Fresh fetch requested for ${cacheKey}`);
    }

    // 2. Fetch from API with key rotation
    const indiaSize = Math.ceil(pageSize * 0.7);
    const globalSize = pageSize - indiaSize;

    const indiaQuery = query || indiaQueries[category] || indiaQueries.general;
    const globalQuery = query ? `${query} world` : globalQueries[category] || globalQueries.general;

    const cacheBust = `&_t=${Date.now()}`;
    const indiaUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(indiaQuery)}&pageSize=${indiaSize}&page=${page}&sortBy=publishedAt&language=en${cacheBust}`;
    const globalUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(globalQuery)}&pageSize=${globalSize}&page=${page}&sortBy=publishedAt&language=en${cacheBust}`;

    const [indiaRes, globalRes] = await Promise.allSettled([
      fetchWithRotation(indiaUrl),
      fetchWithRotation(globalUrl),
    ]);

    let allRaw: any[] = [];
    let totalResults = 0;

    if (indiaRes.status === "fulfilled" && indiaRes.value.ok) {
      const d = await indiaRes.value.json();
      if (d.articles) { allRaw = [...allRaw, ...d.articles]; totalResults += d.totalResults || 0; }
    }

    if (globalRes.status === "fulfilled" && globalRes.value.ok) {
      const d = await globalRes.value.json();
      if (d.articles) { allRaw = [...allRaw, ...d.articles]; totalResults += d.totalResults || 0; }
    }

    if (allRaw.length === 0) {
      try {
        const fbUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(indiaQuery)}&pageSize=${pageSize}&page=${page}&sortBy=publishedAt&language=en`;
        const fbRes = await fetchWithRotation(fbUrl);
        const fbData = await fbRes.json();
        if (fbRes.ok && fbData.articles) {
          allRaw = fbData.articles;
          totalResults = fbData.totalResults || 0;
        }
      } catch (e) {
        console.warn("[NewsAPI] All fallback keys failed:", e);
        try {
          const { data: stale } = await supabase
            .from('api_cache')
            .select('data')
            .like('cache_key', `news:${category}:%`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (stale?.data) {
            console.log(`[Cache STALE FALLBACK] ${category}`);
            return new Response(JSON.stringify(stale.data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch {}
      }
    }

    const processed = processArticles(allRaw, category);

    // 3. PRE-SORT with Averia Intelligence AI
    const { realArticles, debunkedArticles } = await preSortWithAI(processed);

    // Store debunked articles in the database
    if (debunkedArticles.length > 0) {
      try {
        const inserts = debunkedArticles.map(a => ({
          title: a.title,
          claim: a.description || a.title,
          ai_reasoning: `Averia Intelligence pre-screening flagged this article as potentially misleading based on headline analysis.`,
          verdict: 'Misleading',
          original_source: a.source?.name || 'Unknown',
          image_url: a.urlToImage,
          evidence_links: a.url ? [a.url] : [],
          category: a.category || category,
        }));
        await supabase.from('debunked_news').upsert(inserts, { onConflict: 'title' }).select();
        console.log(`[PreSort] Stored ${inserts.length} debunked articles`);
      } catch (e) {
        console.warn("[PreSort] DB store error:", e);
      }
    }

    const responseData = {
      success: true,
      articles: realArticles,
      debunkedArticles,
      totalResults,
      page,
      pageSize,
    };

    // 4. Store in cache
    try {
      await supabase.from('api_cache').upsert({
        cache_key: cacheKey,
        data: responseData,
        source: 'newsapi',
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'cache_key' });
    } catch (e) {
      console.warn("[Cache] Write error:", e);
    }

    console.log(`Fetched ${realArticles.length} real + ${debunkedArticles.length} debunked for: ${category}, page ${page}`);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching news:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function isValidForVerification(article: any): boolean {
  if (!article?.title || article.title === "[Removed]") return false;
  if (!article?.description) return false;
  if (!article?.url || !/^https?:\/\//i.test(article.url)) return false;

  const publishedMs = Date.parse(article.publishedAt || "");
  if (Number.isNaN(publishedMs)) return false;
  if (publishedMs > Date.now() + 60 * 60 * 1000) return false;

  return true;
}

function processArticles(rawArticles: any[], category: string) {
  const seenUrls = new Set<string>();

  return (rawArticles || [])
    .filter((article: any) => isValidForVerification(article))
    .filter((article: any) => {
      if (seenUrls.has(article.url)) return false;
      seenUrls.add(article.url);
      return true;
    })
    .map((article: any, index: number) => ({
      id: `${Date.now()}-${category}-${index}`,
      title: article.title,
      description: article.description,
      url: article.url,
      urlToImage: article.urlToImage,
      source: article.source,
      publishedAt: article.publishedAt,
      author: article.author,
      content: article.content,
      category: category,
      tier: index < 3 ? "top" : index < 8 ? "trending" : "latest",
    }));
}
