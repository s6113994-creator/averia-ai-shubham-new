import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type = "long", maxResults = 15, pageToken } = await req.json();
    const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

    if (!YOUTUBE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "YouTube API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Strategy 1: Try Videos.list (mostPopular in India, News category)
    const videosParams = new URLSearchParams({
      part: "snippet,contentDetails",
      chart: "mostPopular",
      maxResults: String(maxResults),
      regionCode: "IN",
      videoCategoryId: "25", // News & Politics
      key: YOUTUBE_API_KEY,
    });
    if (pageToken) videosParams.set("pageToken", pageToken);

    console.log(`Trying YouTube Videos.list for ${type}...`);
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

        // Filter by type
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

      console.log(`YouTube Videos.list returned ${articles.length} ${type} videos`);

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
    } else {
      console.log("Videos.list failed or returned 0:", videosData.error?.message || "no items");
    }

    // Strategy 2: Try Search API
    const searchQuery = type === "short"
      ? "India news shorts trending viral action breaking today"
      : "India news today trending report breaking world";

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
      key: YOUTUBE_API_KEY,
    });
    if (pageToken) searchParams.set("pageToken", pageToken);

    console.log(`Trying YouTube Search API for ${type}...`);
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

      console.log(`YouTube Search API returned ${articles.length} ${type} videos`);

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

    console.error("Both YouTube methods failed. Search error:", searchData.error?.message || "unknown");

    // Return empty with helpful error
    return new Response(
      JSON.stringify({
        success: true,
        articles: [],
        nextPageToken: null,
        totalResults: 0,
        debug: `Videos.list: ${videosData.error?.message || "0 items"}, Search: ${searchData.error?.message || "0 items"}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}
