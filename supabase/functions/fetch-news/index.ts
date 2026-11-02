import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_NEWS_KEYS = [
  '2a2c607411b2488f9b5bab17af6a8ea5',
  '59ae1b46bd4046a0ade43d48c5e4417e',
  'a4e70f9af3a34627ab3f90d9aa36d811',
  '30a4ac64313f4acd8926dd1857c2fedf',
];

function getNewsKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 4; i++) {
    const k = Deno.env.get(`NEWS_API_KEY_${i}`) || Deno.env.get(`VITE_NEWS_API_${i}`);
    if (k && !keys.includes(k)) keys.push(k);
  }
  const primary = Deno.env.get("NEWS_API_KEY") || Deno.env.get("VITE_NEWS_API_KEY");
  if (primary && !keys.includes(primary)) keys.unshift(primary);
  for (const defKey of DEFAULT_NEWS_KEYS) {
    if (!keys.includes(defKey)) keys.push(defKey);
  }
  return keys;
}

let currentKeyIndex = 0;
function getNextNewsKey(keys: string[]): string {
  if (keys.length === 0) return DEFAULT_NEWS_KEYS[0];
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
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

const debunkedQueries = [
  "fake news debunked fact check",
  "misinformation viral hoax debunked",
  "fact check false claims trending",
  "misleading news viral social media",
  "conspiracy theory debunked latest",
];

async function fetchWithRotation(url: string): Promise<Response> {
  const keys = getNewsKeys();
  let attempts = 0;
  while (attempts < keys.length) {
    const key = getNextNewsKey(keys);
    attempts++;

    const res = await fetch(url, { headers: { "X-Api-Key": key } });
    if (res.ok) return res;

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500) {
      console.warn(`[NewsAPI] Key ${attempts}/${keys.length} failed (${res.status}), rotating...`);
      continue;
    }

    return res;
  }

  throw new Error("All NewsAPI keys exhausted");
}

async function preSortWithAI(articles: any[]): Promise<{ realArticles: any[]; debunkedArticles: any[] }> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY");
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
      return { realArticles: articles, debunkedArticles: [] };
    }

    const data = await aiResponse.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    const flaggedIndices: number[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const flaggedSet = new Set(flaggedIndices);
    const realArticles = articles.filter((_, i) => !flaggedSet.has(i));
    const debunkedArticles = articles.filter((_, i) => flaggedSet.has(i)).map(a => ({
      ...a,
      isDebunked: true,
      verdict: 'misleading',
    }));

    return { realArticles, debunkedArticles };
  } catch {
    return { realArticles: articles, debunkedArticles: [] };
  }
}

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
        publishedAt: article.publishedAt,
        source: article.source,
        author: article.author,
        content: article.content,
        isDebunked: true,
        verdict: 'misleading',
        trustScore: Math.floor(Math.random() * 30) + 10,
      }));
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const urlObj = new URL(req.url);
    const category = urlObj.searchParams.get("category") || "general";
    const region = urlObj.searchParams.get("region") || "in";
    const page = parseInt(urlObj.searchParams.get("page") || "1", 10);
    const pageSize = parseInt(urlObj.searchParams.get("pageSize") || "15", 10);

    let queryParam = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body.query) queryParam = body.query;
    }

    const queryMap = region === "global" ? globalQueries : indiaQueries;
    const baseQuery = queryMap[category] || queryMap.general;
    const finalQuery = queryParam ? `${queryParam} ${baseQuery}` : baseQuery;

    const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(finalQuery)}&pageSize=${pageSize}&page=${page}&sortBy=publishedAt&language=en`;
    const res = await fetchWithRotation(newsUrl);

    if (!res.ok) {
      const errText = await res.text();
      return new Response(
        JSON.stringify({ success: false, error: `NewsAPI error: ${errText}` }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const rawArticles = (data.articles || []).filter((a: any) => a.title && a.title !== "[Removed]" && a.description);

    const { realArticles, debunkedArticles } = await preSortWithAI(rawArticles);
    const debunkedExtra = await fetchDebunkedContent();

    return new Response(
      JSON.stringify({
        success: true,
        articles: realArticles,
        debunked: [...debunkedArticles, ...debunkedExtra],
        debunkedArticles: [...debunkedArticles, ...debunkedExtra],
        totalResults: data.totalResults || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-news error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
