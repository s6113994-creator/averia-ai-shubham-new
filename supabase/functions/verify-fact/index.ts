import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  corsHeaders,
  AVERIA_SYSTEM_PERSONA,
  getAdminSupabase,
  executeWithGeminiRotation,
} from "../_shared/keyManager.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, contentType } = await req.json().catch(() => ({}));

    if (!content) {
      return new Response(
        JSON.stringify({ success: false, error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = getAdminSupabase();
    const GOOGLE_SEARCH_API_KEY = Deno.env.get("GOOGLE_SEARCH_API_KEY");

    // Step 1: Search the web for related content if search API key is available
    let searchResults: string[] = [];
    if (GOOGLE_SEARCH_API_KEY) {
      try {
        const searchQuery = content.slice(0, 200);
        const searchResponse = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=017576662512468239146:omuauf_lfve&q=${encodeURIComponent(searchQuery)}&num=5`
        );
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          searchResults = (searchData.items || []).map((item: any) =>
            `Source: ${item.displayLink}\nTitle: ${item.title}\nSnippet: ${item.snippet}`
          );
        }
      } catch (searchError) {
        console.warn("[verify-fact] Search query skipped:", searchError);
      }
    }

    // Step 2: Averia Fact Verification Prompt
    const systemPrompt = `${AVERIA_SYSTEM_PERSONA}
Analyze the provided content and determine its authenticity and factual accuracy.
1. Evaluate the claim/content for factual accuracy.
2. Cross-reference with web search data if provided.
3. Identify manipulation or deception red flags.
4. Return a structured JSON object with these exact keys:
{
  "trustScore": <number 0-100>,
  "verdict": "Real" | "Fake" | "Misleading",
  "reasoning": "<2-3 sentence technical explanation>",
  "redFlags": ["<list of concerns or anomalies>"],
  "sources": ["<credible corroborating or debunking sources>"]
}`;

    const userMessage = `Content to verify (${contentType || "text"}):
${content}

${searchResults.length > 0 ? `Corroborating search data:\n${searchResults.join("\n\n")}` : "No external web search results available."}

Analyze this content thoroughly and output your structured JSON verdict.`;

    const aiRes = await executeWithGeminiRotation(supabase, {
      messages: [{ role: "user", content: userMessage }],
      systemPrompt,
      model: "gemini-2.5-flash",
      jsonMode: true,
      stream: false,
    });

    if (!aiRes.ok) {
      return aiRes;
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let result;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(rawContent);
      }
    } catch {
      result = {
        trustScore: 50,
        verdict: "Misleading",
        reasoning: rawContent || "Analysis complete but unformatted.",
        redFlags: ["Unconventional formatting"],
        sources: [],
      };
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[verify-fact] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Fact verification failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
