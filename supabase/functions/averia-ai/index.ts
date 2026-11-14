import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODEL = Deno.env.get("AVERIA_AI_MODEL") || "gemini-2.5-flash";

// 10-Agent Key Pool Loader (Supabase Edge Secrets)
function getAgentKeys(): { agent: string; key: string }[] {
  const pool: { agent: string; key: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = Deno.env.get(`GEMINI_API_KEY_${i}`);
    if (k && k.trim()) pool.push({ agent: `Agent-${i}`, key: k.trim() });
  }
  const fallback = Deno.env.get("GEMINI_API_KEY");
  if (fallback && fallback.trim() && pool.length === 0) {
    pool.push({ agent: "Agent-Primary", key: fallback.trim() });
  }
  return pool;
}

// 10-Agent Automatic Failover & Load Balancer
async function callGeminiWith10Agents(payload: unknown): Promise<{ response: Response; activeAgent: string }> {
  const agents = getAgentKeys();
  if (agents.length === 0) {
    throw new Error("No GEMINI_API_KEY_1..10 found in Supabase Edge Function Secrets.");
  }

  // Start from a random agent for parallel load distribution, then rotate through all 10 on failure
  const startIndex = Math.floor(Math.random() * agents.length);
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < agents.length; attempt++) {
    const current = agents[(startIndex + attempt) % agents.length];
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${current.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return { response: res, activeAgent: current.agent };
    }

    lastResponse = res;
    console.warn(`${current.agent} failed with status ${res.status}, switching to next agent...`);
  }

  return { response: lastResponse!, activeAgent: "None" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let userId: string | null = null;
    let memories: string[] = [];
    let userName = "";

    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || supabaseKey;
        const anonClient = createClient(supabaseUrl, anonKey);
        const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
        if (!authError && user) {
          userId = user.id;
          userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || "";
          const { data: mems } = await supabase
            .from("ai_memory")
            .select("key, value")
            .eq("user_id", userId)
            .limit(20);
          if (mems?.length) memories = mems.map(m => `${m.key}: ${m.value}`);
        }
      } catch (authErr) {
        console.warn("Auth lookup skipped:", authErr);
      }
    }

    const body = await req.json().catch(() => ({}));
    const { messages = [], saveMemory, forensicMode, classify, kind, text } = body as any;

    if (classify === true) {
      const prompt = `Strict content-quality classifier for a public news vault (${kind || 'text'}). Return STRICT JSON only: {"allowed": true|false, "reason": "short reason"}.\n\nSubmission:\n"""${(text || '').slice(0, 1500)}"""`;
      const { response: r } = await callGeminiWith10Agents({
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      });
      if (!r.ok) return new Response(JSON.stringify({ allowed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const j = await r.json();
      const raw = j?.choices?.[0]?.message?.content || "";
      const m = raw.match(/\{[\s\S]*\}/);
      let verdict = { allowed: true };
      if (m) { try { verdict = JSON.parse(m[0]); } catch {} }
      return new Response(JSON.stringify(verdict), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (saveMemory && userId) {
      await supabase.from("ai_memory").upsert({
        user_id: userId,
        key: saveMemory.key,
        value: saveMemory.value,
        memory_type: saveMemory.type || "preference",
      }, { onConflict: "user_id,key" }).catch(() => {});
    }

    const memoryContext = memories.length > 0 ? `\n\nUser's Memory Vault:\n${memories.join("\n")}` : "";
    const personalGreeting = userName ? `The user's name is "${userName}".` : "";
    const forensicAddon = forensicMode ? `\n\n🔬 **DEEP-CORE FORENSIC MODE ACTIVATED** — Analyze attached media with Verdict Badge, Confidence Score %, Forensic Markers, and Truth-Share Summary.` : "";

    const systemPrompt = `You are **Averia Agentic AI (V5.1)** — a 10-Agent orchestrated multimodal intelligence system with forensic-grade verification capabilities. Speak in conversational Hinglish when the user uses Hindi/Hinglish. ${personalGreeting}${forensicAddon}${memoryContext}`;

    const { response, activeAgent } = await callGeminiWith10Agents({
      model: GEMINI_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("10-Agent Pool error:", response.status, errText);
      return new Response(JSON.stringify({ error: `AI Gateway Error (${response.status})` }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Averia-Active-Agent": activeAgent,
      },
    });
  } catch (e) {
    console.error("averia-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});