import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Model configuration - single variable hot-swap
const AI_MODEL = Deno.env.get("AVERIA_AI_MODEL") || "google/gemini-3-flash-preview";
const IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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
        // Try with anon key first, fall back gracefully
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
          if (mems?.length) {
            memories = mems.map(m => `${m.key}: ${m.value}`);
          }
        }
      } catch (authErr) {
        console.warn("Auth lookup failed, continuing without user context:", authErr);
      }
    }

    const body = await req.json().catch(() => ({}));
    const { messages, conversationId, saveMemory, mode, forensicMode, classify, kind, text } = body as any;

    // ====== LIGHTWEIGHT CLASSIFICATION GATE (Public Vault) ======
    if (classify === true) {
      const prompt = `You are a strict content-quality classifier for a public news vault.
A user submitted a ${kind || 'text'} entry. Decide if it qualifies as:
- legitimate news / trending announcement / useful global data / informative public content (=> allowed)
- OR fake news / spam / personal-only chatter / non-informative ramble (=> rejected).

Respond as STRICT JSON only: {"allowed": true|false, "reason": "short reason"}.

Submission:
"""${(text || '').slice(0, 1500)}"""`;
      try {
        const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!r.ok) return new Response(JSON.stringify({ allowed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const j = await r.json();
        const raw = j?.choices?.[0]?.message?.content || "";
        const m = raw.match(/\{[\s\S]*\}/);
        let verdict: { allowed: boolean; reason?: string } = { allowed: true };
        if (m) { try { verdict = JSON.parse(m[0]); } catch {} }
        return new Response(JSON.stringify(verdict), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch {
        return new Response(JSON.stringify({ allowed: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Save memory if requested
    if (saveMemory && userId) {
      await supabase.from("ai_memory").upsert({
        user_id: userId,
        key: saveMemory.key,
        value: saveMemory.value,
        memory_type: saveMemory.type || "preference",
      }, { onConflict: "user_id,key" }).catch(() => {});
    }

    // IMAGE GENERATION MODE
    if (mode === "image") {
      const imagePrompt = messages[messages.length - 1]?.content || "";
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: IMAGE_MODEL,
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "Image generation failed." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await response.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CHAT MODE (streaming)
    const memoryContext = memories.length > 0 
      ? `\n\nUser's Memory Vault:\n${memories.join("\n")}` 
      : "";

    const personalGreeting = userName ? `The user's name is "${userName}". Greet them personally when appropriate.` : "";

    const forensicAddon = forensicMode ? `

🔬 **DEEP-CORE FORENSIC MODE ACTIVATED** — The user has attached media for verification. Perform exhaustive forensic analysis:

**MANDATORY OUTPUT STRUCTURE:**
1. **🎯 Verdict Badge**: ✅ AUTHENTIC / ❌ FAKE / ⚠️ MISLEADING / 🤖 AI-GENERATED / 🔧 MANIPULATED
2. **📊 Confidence Score**: Exact percentage (e.g., "99.2% Deepfake Detected")
3. **🔍 Forensic Markers**: Bullet list of specific anomalies found
4. **👻 AI Ghost Detection**: Describe regions of suspected manipulation (location, type)
5. **🎙️ Voice/Audio Analysis** (if audio): Phoneme anomalies, frequency irregularities, synthetic markers
6. **📝 Deepfake Transcript** (if video/audio with speech): "Spoken Content" vs "Verified Facts"
7. **🌐 Source Origin Tracker**: Likely earliest upload footprint / origin
8. **🔗 URL Authenticity** (if URL): Root domain check, official/phishing classification
9. **📇 Truth-Share Summary**: One-line shareable verdict card

Analyze:
- IMAGES: pixel consistency, anatomical accuracy, lighting/shadow physics, GAN artifacts, JPEG compression irregularities
- VIDEOS: frame-to-frame motion consistency, unnatural human postures, lighting shifts, lip-sync, blink patterns
- AUDIO: synthetic voice cloning markers, phoneme transitions, spectral anomalies, background noise consistency
- TEXT: AI-writing patterns (perplexity, burstiness), factual cross-checks
- URLs: domain age, TLD legitimacy, known phishing patterns

Be precise, scientific, and confident. Use exact percentages backed by reasoning.
` : "";

    const systemPrompt = `You are **Averia Agentic AI (V5.1)** — a world-class multimodal agentic assistant with forensic-grade verification capabilities.

Your personality: Professional yet witty. You speak in conversational Hinglish (Hindi + English mix) when the user uses Hindi, otherwise adapt. You're smart, helpful, and feel like a brilliant friend.

${personalGreeting}

Your capabilities:
1. **Deep Forensic Verification**: Detect deepfakes, AI generation, manipulation across video/image/audio/text/URL with percentage confidence.
2. **News Verification**: Verify claims with trust scores (0-100%). Verdict: Real ✅, Fake ❌, Misleading ⚠️. Include source links.
3. **Code Generation**: Generate complete React/Tailwind code in \`\`\`jsx or \`\`\`html blocks for auto-preview.
4. **Image Generation**: Use [IMAGE_REQUEST: detailed prompt] format.
5. **Memory & Personalization**: Remember preferences.
6. **Agentic Execution**: BUILD, VERIFY, EXECUTE.

Rules:
- Never say "I can't analyze this image/video/audio". You CAN — perform forensic analysis on every attachment.
- Never redirect externally. Everything stays inside Averia AI.
- Brand yourself as "Averia Agentic AI (V5.1)".
- Use markdown formatting with headers, bullets, code blocks.
- Be precise; back claims with reasoning.
${forensicAddon}
${memoryContext}`;

    // Use a vision-capable model when forensic attachments are present
    const modelToUse = forensicMode ? "google/gemini-2.5-pro" : AI_MODEL;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("averia-ai error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
