import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, contentType } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ success: false, error: "Content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_SEARCH_API_KEY = Deno.env.get("GOOGLE_SEARCH_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Search the web for related content using Google Search API
    let searchResults: string[] = [];
    
    if (GOOGLE_SEARCH_API_KEY) {
      try {
        // Extract key phrases from content for search
        const searchQuery = content.slice(0, 200);
        
        // Use Google Custom Search JSON API
        const searchResponse = await fetch(
          `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=017576662512468239146:omuauf_lfve&q=${encodeURIComponent(searchQuery)}&num=5`
        );
        
        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          searchResults = (searchData.items || []).map((item: any) => 
            `Source: ${item.displayLink}\nTitle: ${item.title}\nSnippet: ${item.snippet}`
          );
          console.log(`Found ${searchResults.length} search results`);
        }
      } catch (searchError) {
        console.error("Search error:", searchError);
        // Continue without search results
      }
    }

    // Step 2: Use AI to analyze and cross-verify
    const systemPrompt = `You are an expert fact-checker AI. Analyze the provided content and determine its authenticity.

Your task:
1. Evaluate the claim/content for factual accuracy
2. Cross-reference with the provided search results (if available)
3. Identify any red flags (sensationalism, lack of sources, emotional manipulation)
4. Provide a clear verdict

Respond with a JSON object:
{
  "trustScore": <number 0-100>,
  "verdict": "Real" | "Fake" | "Misleading",
  "reasoning": "<2-3 sentence explanation>",
  "redFlags": ["<list of concerns if any>"],
  "sources": ["<credible sources that support/refute the claim>"]
}`;

    const userMessage = `Content to verify (${contentType}):
${content}

${searchResults.length > 0 ? `Web search results for cross-reference:\n${searchResults.join('\n\n')}` : 'No web search results available.'}

Analyze this content and provide your fact-check verdict.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI API error:", aiResponse.status);
      const errorText = await aiResponse.text();
      console.error("AI error details:", errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    // Parse the AI response
    let result;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Parse error:", parseError);
      // Fallback result
      result = {
        trustScore: 50,
        verdict: "Misleading",
        reasoning: "Unable to fully verify. Please check multiple sources.",
        redFlags: ["Verification incomplete"],
        sources: [],
      };
    }

    console.log("Fact-check result:", result);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        searchResultsUsed: searchResults.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fact verification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
