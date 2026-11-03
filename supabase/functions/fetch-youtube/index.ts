import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_YOUTUBE_KEYS = [
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

function getYouTubeKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k1 = Deno.env.get(`YOUTUBE_API_KEY_${i}`);
    const k2 = Deno.env.get(`VITE_YOUTUBE_API_${i}`);
    if (k1 && !keys.includes(k1)) keys.push(k1);
    if (k2 && !keys.includes(k2)) keys.push(k2);
  }
  const primary1 = Deno.env.get("YOUTUBE_API_KEY");
  const primary2 = Deno.env.get("VITE_YOUTUBE_API_KEY");
  if (primary1 && !keys.includes(primary1)) keys.unshift(primary1);
  if (primary2 && !keys.includes(primary2)) keys.unshift(primary2);
  for (const defKey of DEFAULT_YOUTUBE_KEYS) {
    if (!keys.includes(defKey)) keys.push(defKey);
  }
  return keys;
}

let keyIdx = 0;
function getNextKey(keys: string[]): string {
  if (keys.length === 0) return DEFAULT_YOUTUBE_KEYS[0];
  const k = keys[keyIdx % keys.length];
  keyIdx = (keyIdx + 1) % keys.length;
  return k;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let reqPayload: any = {};
    try {
      reqPayload = await req.json();
    } catch {
      const urlObj = new URL(req.url);
      reqPayload = {
        type: urlObj.searchParams.get("type") || "long",
        maxResults: urlObj.searchParams.get("maxResults") || urlObj.searchParams.get("max_results") || 15,
        pageToken: urlObj.searchParams.get("pageToken") || urlObj.searchParams.get("page_token"),
        query: urlObj.searchParams.get("query"),
      };
    }

    const type = reqPayload?.type || "long";
    const maxResults = Number(reqPayload?.maxResults || reqPayload?.max_results || 15);
    const pageToken = reqPayload?.pageToken || reqPayload?.page_token;
    const query = reqPayload?.query;

    const keys = getYouTubeKeys();
    const apiKey = getNextKey(keys);

    // Strategy 1: Try Videos.list (mostPopular in India, News category)
    const videosParams = new URLSearchParams({
      part: "snippet,contentDetails",
      chart: "mostPopular",
      maxResults: String(maxResults),
      regionCode: "IN",
      videoCategoryId: "25", // News & Politics
      key: apiKey,
    });
    if (pageToken && !pageToken.startsWith("cache")) videosParams.set("pageToken", pageToken);

    const videosResp = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`,
      { headers: { Accept: "application/json" } }
    );
    const videosData = await videosResp.json();

    if (videosResp.ok && videosData.items?.length > 0) {
      const articles = videosData.items.map((item: any, index: number) => {
        const videoId = item.id;
        const snippet = item.snippet || {};
        const duration = item.contentDetails?.duration || "";
        const secs = parseDuration(duration);
        const isShort = secs > 0 && secs <= 90;

        if (type === "short" && !isShort) return null;
        if (type === "long" && isShort) return null;

        return {
          id: `yt-${type}-${videoId}-${Date.now()}`,
          title: snippet.title || "Untitled Video",
          description: snippet.description?.substring(0, 300) || null,
          url: isShort
            ? `https://www.youtube.com/shorts/${videoId}`
            : `https://www.youtube.com/watch?v=${videoId}`,
          urlToImage: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || null,
          publishedAt: snippet.publishedAt || new Date().toISOString(),
          source: { id: null, name: snippet.channelTitle || "YouTube India" },
          author: snippet.channelTitle || null,
          content: null,
          category: "general",
          tier: index < 3 ? "top" : index < 8 ? "trending" : "latest",
          mediaType: isShort ? "short_video" : "long_video",
          videoId: videoId,
        };
      }).filter(Boolean);

      if (articles.length > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            articles,
            nextPageToken: videosData.nextPageToken || null,
            totalResults: videosData.pageInfo?.totalResults || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Strategy 2: Try Search API
    const searchQuery = query || (type === "short"
      ? "India news shorts trending viral action breaking today"
      : "India news today trending report breaking world");

    const searchParams = new URLSearchParams({
      part: "snippet",
      q: searchQuery,
      type: "video",
      maxResults: String(maxResults),
      regionCode: "IN",
      relevanceLanguage: "en",
      order: "date",
      videoDuration: type === "short" ? "short" : "medium",
      safeSearch: "moderate",
      key: apiKey,
    });
    if (pageToken && !pageToken.startsWith("cache")) searchParams.set("pageToken", pageToken);

    const searchResp = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
      { headers: { Accept: "application/json" } }
    );
    const searchData = await searchResp.json();

    if (searchResp.ok && searchData.items?.length > 0) {
      const articles = searchData.items
        .filter((item: any) => item.id?.videoId)
        .map((item: any, index: number) => {
          const videoId = item.id.videoId;
          const snippet = item.snippet || {};
          const isShort = type === "short";

          return {
            id: `yt-${type}-${videoId}-${Date.now()}`,
            title: snippet.title || "Untitled Video",
            description: snippet.description?.substring(0, 300) || null,
            url: isShort
              ? `https://www.youtube.com/shorts/${videoId}`
              : `https://www.youtube.com/watch?v=${videoId}`,
            urlToImage: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || null,
            publishedAt: snippet.publishedAt || new Date().toISOString(),
            source: { id: null, name: snippet.channelTitle || "YouTube India" },
            author: snippet.channelTitle || null,
            content: null,
            category: "general",
            tier: index < 3 ? "top" : index < 8 ? "trending" : "latest",
            mediaType: isShort ? "short_video" : "long_video",
            videoId: videoId,
          };
        });

      return new Response(
        JSON.stringify({
          success: true,
          articles,
          nextPageToken: searchData.nextPageToken || null,
          totalResults: searchData.pageInfo?.totalResults || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: searchData.error?.message || "YouTube API query returned no results" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-youtube error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
