import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  AVERIA_SYSTEM_PERSONA,
  getAdminSupabase,
  executeWithNewsRotation,
  executeWithGeminiRotation,
} from "../_shared/keyManager.ts";

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

const debunkedQueries = [
  "fake news debunked fact check",
  "misinformation viral hoax debunked",
  "fact check false claims trending",
  "misleading news viral social media",
  "conspiracy theory debunked latest",
];

async function fetchWithRotation(supabase: any, urlBuilder: (key: string) => string): Promise<Response> {
  return await executeWithNewsRotation(supabase, async (apiKey: string) => {
    const url = urlBuilder(apiKey);
    return await fetch(url, { headers: { "X-Api-Key": apiKey } });
  });
}

/** Batch pre-sort: send titles to Averia AI, get back indices of fake/misleading articles */
async function preSortWithAI(supabase: any, articles: any[]): Promise<{ realArticles: any[]; debunkedArticles: any[] }> {
  if (articles.length === 0) {
    return { realArticles: articles, debunkedArticles: [] };
  }

  try {
    const titleList = articles.slice(0, 50).map((a, i) => `${i}. ${a.title}`).join("\n");
    const systemPrompt = `${AVERIA_SYSTEM_PERSONA}
You are Averia News Intelligence, an expert pre-screening system.
Given a numbered list of news headlines, identify which ones are likely FAKE or MISLEADING based on sensationalism, clickbait, known hoax patterns, or unverifiable claims.
Return ONLY a valid JSON array containing the integer indices that are fake/misleading.
If all seem legitimate, return []. Example: [2, 5, 11]`;

    const aiRes = await executeWithGeminiRotation(supabase, {
      messages: [{ role: "user", content: titleList }],
      systemPrompt,
      model: "gemini-2.5-flash",
      jsonMode: true,
      stream: false,
    });

    if (!aiRes.ok) {
      console.warn("[PreSort] Averia AI classification skipped");
      return { realArticles: articles, debunkedArticles: [] };
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    const flaggedIndices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    console.log(`[PreSort] Averia Intelligence flagged ${flaggedIndices.length}/${articles.length} articles`);

    const flaggedSet = new Set(flaggedIndices);
    const realArticles = articles.filter((_, i) => !flaggedSet.has(i));
    const debunkedArticles = articles.filter((_, i) => flaggedSet.has(i)).map(a => ({
      ...a,
      isDebunked: true,
      verdict: "misleading",
    }));

    return { realArticles, debunkedArticles };
  } catch (e) {
    console.warn("[PreSort] Pre-sorting skipped:", e);
    return { realArticles: articles, debunkedArticles: [] };
  }
}

/** Fetch specifically debunked/fact-check content */
async function fetchDebunkedContent(supabase: any): Promise<any[]> {
  try {
    const query = debunkedQueries[Math.floor(Math.random() * debunkedQueries.length)];
    const res = await fetchWithRotation(supabase, (key) =>
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=10&sortBy=publishedAt&language=en`
    );
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
        category: "debunked",
        tier: "latest",
        isDebunked: true,
        verdict: "misleading",
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
    const { category = "general", pageSize = 20, page = 1, query, fetchDebunked = false, bypassCache = false } = await req.json().catch(() => ({}));
    const supabase = getAdminSupabase();

    // Mode: fetch debunked content
    if (fetchDebunked) {
      const debunkedContent = await fetchDebunkedContent(supabase);
      const { data: dbDebunked } = await supabase
        .from("debunked_news")
        .select("*")
        .order("debunked_at", { ascending: false })
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

    // 1. Check cache first
    const cacheKey = `news:${category}:${page}:${pageSize}:${query || ""}`;
    if (!bypassCache) {
      try {
        const { data: cached } = await supabase
          .from("api_cache")
          .select("data")
          .eq("cache_key", cacheKey)
          .gt("expires_at", new Date().toISOString())
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
    }

    // 2. Fetch from NewsAPI with multi-key rotation
    const indiaSize = Math.ceil(pageSize * 0.7);
    const globalSize = pageSize - indiaSize;

    const indiaQuery = query || indiaQueries[category] || indiaQueries.general;
    const globalQuery = query ? `${query} world` : globalQueries[category] || globalQueries.general;

    const cacheBust = `&_t=${Date.now()}`;
    const indiaUrlFn = (key: string) => `https://newsapi.org/v2/everything?q=${encodeURIComponent(indiaQuery)}&pageSize=${indiaSize}&page=${page}&sortBy=publishedAt&language=en${cacheBust}`;
    const globalUrlFn = (key: string) => `https://newsapi.org/v2/everything?q=${encodeURIComponent(globalQuery)}&pageSize=${globalSize}&page=${page}&sortBy=publishedAt&language=en${cacheBust}`;

    const [indiaRes, globalRes] = await Promise.allSettled([
      fetchWithRotation(supabase, indiaUrlFn),
      fetchWithRotation(supabase, globalUrlFn),
    ]);

    let allRaw: any[] = [];
    let totalResults = 0;

    if (indiaRes.status === "fulfilled" && indiaRes.value.ok) {
      const d = await indiaRes.value.json().catch(() => ({}));
      if (d.articles) { allRaw = [...allRaw, ...d.articles]; totalResults += d.totalResults || 0; }
    }

    if (globalRes.status === "fulfilled" && globalRes.value.ok) {
      const d = await globalRes.value.json().catch(() => ({}));
      if (d.articles) { allRaw = [...allRaw, ...d.articles]; totalResults += d.totalResults || 0; }
    }

    if (allRaw.length === 0) {
      try {
        const fbRes = await fetchWithRotation(supabase, () =>
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(indiaQuery)}&pageSize=${pageSize}&page=${page}&sortBy=publishedAt&language=en`
        );
        const fbData = await fbRes.json().catch(() => ({}));
        if (fbRes.ok && fbData.articles) {
          allRaw = fbData.articles;
          totalResults = fbData.totalResults || 0;
        }
      } catch (e) {
        console.warn("[NewsAPI] Fallback failed:", e);
        try {
          const { data: stale } = await supabase
            .from("api_cache")
            .select("data")
            .like("cache_key", `news:${category}:%`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (stale?.data) {
            return new Response(JSON.stringify(stale.data), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch {}
      }
    }

    const processed = processArticles(allRaw, category);

    // 3. Pre-sort with Averia Intelligence AI
    const { realArticles, debunkedArticles } = await preSortWithAI(supabase, processed);

    // Store debunked articles in DB
    if (debunkedArticles.length > 0) {
      try {
        const inserts = debunkedArticles.map(a => ({
          title: a.title,
          claim: a.description || a.title,
          ai_reasoning: `Averia Intelligence pre-screening flagged this article as potentially misleading based on headline analysis.`,
          verdict: "Misleading",
          original_source: a.source?.name || "Unknown",
          image_url: a.urlToImage,
          evidence_links: a.url ? [a.url] : [],
          category: a.category || category,
        }));
        await supabase.from("debunked_news").upsert(inserts, { onConflict: "title" }).select();
      } catch (e) {
        console.warn("[PreSort] DB store skipped:", e);
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

    // 4. Store in cache for 6 hours
    try {
      await supabase.from("api_cache").upsert({
        cache_key: cacheKey,
        data: responseData,
        source: "newsapi",
        expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "cache_key" });
    } catch {}

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[fetch-news] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "News retrieval failed" }),
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
