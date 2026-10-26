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
    const { title, description, source, url } = await req.json();

    if (!title) {
      return new Response(
        JSON.stringify({ success: false, error: "Title is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are Averia AI, an expert fact-checking intelligence system. Given a news article's title, description, source, and URL, perform a deep evidence analysis.

Return a JSON object with exactly this structure:
{
  "sourceTrace": {
    "origin": "<Where this news likely originated - e.g. 'Reuters Wire Service', 'Social Media Viral Post', etc.>",
    "firstReported": "<Approximate first reporting date/outlet if detectable>",
    "propagationPath": "<How it spread - e.g. 'Wire → Major outlets → Social media'>"
  },
  "crossVerification": [
    {
      "source": "<Trusted source name, e.g. 'Reuters', 'AP News', 'BBC'>",
      "stance": "confirms" | "debunks" | "partially confirms",
      "summary": "<One sentence summary of their coverage>"
    }
  ],
  "aiVerdict": {
    "classification": "Real" | "Fake" | "Misleading" | "Unverified",
    "confidence": <number 0-100>,
    "reasoning": "<2-3 sentence technical explanation of why Averia AI considers this Real or Fake, citing specific evidence patterns>"
  }
}

Provide exactly 2-3 cross-verification entries. Be specific and technical in your reasoning.`;

    const userMessage = `Analyze this news article:
Title: ${title}
Description: ${description || 'N/A'}
Source: ${source || 'Unknown'}
URL: ${url || 'N/A'}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
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
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: "AI credits exhausted. Please add funds." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    let result;
    try {
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found");
      }
    } catch {
      result = {
        sourceTrace: {
          origin: "Unable to determine",
          firstReported: "Unknown",
          propagationPath: "Unknown",
        },
        crossVerification: [
          { source: "Verification Service", stance: "unverified", summary: "Could not verify at this time." },
        ],
        aiVerdict: {
          classification: "Unverified",
          confidence: 50,
          reasoning: "Insufficient data to make a determination. Please check multiple sources manually.",
        },
      };
    }

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Evidence dive error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
