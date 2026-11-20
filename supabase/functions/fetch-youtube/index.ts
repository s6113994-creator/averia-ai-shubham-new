import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  getAdminSupabase,
  executeWithYouTubeRotation,
} from "../_shared/keyManager.ts";

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type = "long", maxResults = 15, pageToken } = await req.json().catch(() => ({}));
    const supabase = getAdminSupabase();

    return await executeWithYouTubeRotation(supabase, async (apiKey: string) => {
      // Strategy 1: Videos.list (mostPopular)
      const videosParams = new URLSearchParams({
        part: "snippet,contentDetails",
        chart: "mostPopular",
        maxResults: String(maxResults),
        regionCode: "IN",
        videoCategoryId: "25", // News & Politics
        key: apiKey,
      });
      if (pageToken) videosParams.set("pageToken", pageToken);

      const videosResp = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${videosParams.toString()}`,
        { headers: { Accept: "application/json" } }
      );

      if (videosResp.status === 403 || videosResp.status === 429) {
        return videosResp; // Triggers key rotation
      }

      const videosData = await videosResp.json().catch(() => ({}));
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

      // Strategy 2: Search API fallback
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
        key: apiKey,
      });
      if (pageToken) searchParams.set("pageToken", pageToken);

      const searchResp = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
        { headers: { Accept: "application/json" } }
      );

      if (searchResp.status === 403 || searchResp.status === 429) {
        return searchResp; // Triggers key rotation
      }

      const searchData = await searchResp.json().catch(() => ({}));
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
        JSON.stringify({
          success: true,
          articles: [],
          nextPageToken: null,
          totalResults: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    });
  } catch (error: any) {
    console.error("[fetch-youtube] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "YouTube retrieval failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
