import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  AVERIA_SYSTEM_PERSONA,
  getAdminSupabase,
  executeWithGeminiRotation,
  getGeminiKeys,
} from "../_shared/keyManager.ts";

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getAdminSupabase();

    // 1. Authenticate user & load memory
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let memories: string[] = [];
    let userName = "";

    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const anonClient = createClient(supabaseUrl, anonKey);
        const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
        if (!authError && user) {
          userId = user.id;
          userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";

          const { data: mems } = await supabase
            .from("ai_memory")
            .select("key, value")
            .eq("user_id", userId)
            .limit(20);
          if (mems?.length) {
            memories = mems.map((m: any) => `${m.key}: ${m.value}`);
          }
        }
      } catch (authErr) {
        console.warn("[Averia Auth] Context lookup skipped:", authErr);
      }
    }

    // 2. Parse request payload
    const body = await req.json().catch(() => ({}));
    const { messages, conversationId, saveMemory, mode, forensicMode, classify, kind, text } = body as any;

    // Save memory if requested
    if (saveMemory && userId) {
      await supabase.from("ai_memory").upsert({
        user_id: userId,
        key: saveMemory.key,
        value: saveMemory.value,
        memory_type: saveMemory.type || "preference",
      }, { onConflict: "user_id,key" }).catch(() => {});
    }

    // ====== LIGHTWEIGHT CLASSIFICATION GATE ======
    if (classify === true) {
      const prompt = `You are Averia Agentic AI's content-quality classifier for a public news vault.
A user submitted a ${kind || "text"} entry. Decide if it qualifies as:
- legitimate news / trending announcement / useful global data / informative public content (=> allowed: true)
- OR fake news / spam / personal-only chatter / non-informative ramble (=> allowed: false).

Respond as STRICT JSON only: {"allowed": true|false, "reason": "short explanation"}.

Submission:
"""${(text || "").slice(0, 1500)}"""`;

      try {
        const aiRes = await executeWithGeminiRotation(supabase, {
          messages: [{ role: "user", content: prompt }],
          systemPrompt: AVERIA_SYSTEM_PERSONA,
          model: "gemini-2.5-flash",
          jsonMode: true,
        });

        if (aiRes.ok) {
          const j = await aiRes.json();
          const raw = j?.choices?.[0]?.message?.content || "";
          const m = raw.match(/\{[\s\S]*\}/);
          let verdict: { allowed: boolean; reason?: string } = { allowed: true };
          if (m) { try { verdict = JSON.parse(m[0]); } catch {} }
          return new Response(JSON.stringify(verdict), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {
        // Fallback allow on classification error
      }
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== IMAGE GENERATION MODE ======
    if (mode === "image") {
      const imagePrompt = messages?.[messages.length - 1]?.content || "";
      const keys = await getGeminiKeys(supabase);

      // --- PRIMARY: Try Gemini 2.0 Flash native multimodal image output (responseModalities: IMAGE) ---
      for (const keyRec of keys) {
        if (keyRec.api_key.startsWith("lovable:")) continue; // Skip lovable keys for primary Gemini attempt
        try {
          const geminiImageUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${keyRec.api_key}`;
          const geminiResp = await fetch(geminiImageUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `Generate a high quality image: ${imagePrompt}` }] }],
              generationConfig: {
                responseModalities: ["TEXT", "IMAGE"],
              },
            }),
          });

          if (geminiResp.status === 429 || geminiResp.status === 403) {
            // Rate limit or quota — try next key
            continue;
          }

          if (geminiResp.ok) {
            const geminiData = await geminiResp.json();
            // Find inline image part in response
            const parts: any[] = geminiData?.candidates?.[0]?.content?.parts || [];
            const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
            if (imagePart?.inlineData?.data) {
              const mime = imagePart.inlineData.mimeType || "image/png";
              const formatted = {
                choices: [{
                  message: {
                    images: [{
                      image_url: { url: `data:${mime};base64,${imagePart.inlineData.data}` },
                    }],
                  },
                }],
              };
              return new Response(JSON.stringify(formatted), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
            // Gemini responded but no image part — model doesn't support IMAGE modality on this key/region, break loop
            break;
          }
        } catch {
          continue;
        }
      }

      // --- SECONDARY: Try Gemini 2.5 Flash Preview image generation endpoint ---
      for (const keyRec of keys) {
        if (keyRec.api_key.startsWith("lovable:")) continue;
        try {
          const flash25Url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${keyRec.api_key}`;
          const flash25Resp = await fetch(flash25Url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: `Generate a high quality image: ${imagePrompt}` }] }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
            }),
          });
          if (flash25Resp.status === 429 || flash25Resp.status === 403) continue;
          if (flash25Resp.ok) {
            const d = await flash25Resp.json();
            const parts: any[] = d?.candidates?.[0]?.content?.parts || [];
            const imgPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
            if (imgPart?.inlineData?.data) {
              const mime = imgPart.inlineData.mimeType || "image/png";
              return new Response(JSON.stringify({
                choices: [{ message: { images: [{ image_url: { url: `data:${mime};base64,${imgPart.inlineData.data}` } }] } }],
              }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            break;
          }
        } catch {
          continue;
        }
      }

      // --- FALLBACK: Pollinations.ai — zero-cost, no API key required, always works ---
      try {
        const seed = Math.floor(Math.random() * 999999);
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=1024&nologo=true&seed=${seed}&model=flux`;
        // Pollinations returns the image directly as binary — we fetch and convert to base64
        const pollResp = await fetch(pollinationsUrl);
        if (pollResp.ok) {
          const imgBuffer = await pollResp.arrayBuffer();
          const uint8 = new Uint8Array(imgBuffer);
          let binary = "";
          for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
          const base64 = btoa(binary);
          const contentType = pollResp.headers.get("Content-Type") || "image/jpeg";
          const formatted = {
            choices: [{
              message: {
                images: [{
                  image_url: { url: `data:${contentType};base64,${base64}` },
                }],
              },
            }],
          };
          console.log("[averia-ai] Image served via Pollinations.ai fallback");
          return new Response(JSON.stringify(formatted), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (pollErr) {
        console.error("[averia-ai] Pollinations fallback failed:", pollErr);
      }

      return new Response(
        JSON.stringify({ error: "Image synthesis is temporarily busy. Please retry shortly." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ====== CHAT MODE (Streaming with automatic Gemini Key Rotation) ======
    const memoryContext = memories.length > 0 ? `\n\nUser Memory Vault:\n${memories.join("\n")}` : "";
    const personalGreeting = userName ? `The user's name is "${userName}". Greet them naturally when appropriate.` : "";

    const forensicAddon = forensicMode ? `
🔬 **DEEP-CORE FORENSIC VERIFICATION ACTIVE** — The user submitted media attachments.
Analyze all provided frames, spectrograms, text or URL data with maximum scientific rigor:
1. 🎯 Verdict Badge: ✅ AUTHENTIC / ❌ FAKE / ⚠️ MISLEADING / 🤖 AI-GENERATED / 🔧 MANIPULATED
2. 📊 Confidence Score: Exact percentage (e.g. "98.7% Synthetic Artifact Detection")
3. 🔍 Forensic Markers: Bullet list of specific anomalies found
4. 👻 AI Ghost Footprint: Spatial coordinate/region of manipulation
5. 🎙️ Voice/Audio Analysis: Frequency anomalies, synthetic formant signatures
6. 📝 Forensic Transcript: Claim vs. Verified Ground Truth
7. 🌐 Earliest Ingestion Footprint: Origin trail
8. 🔗 Domain/Metadata Authenticity
9. 📇 Truth-Share Summary
` : "";

    const systemPrompt = `${AVERIA_SYSTEM_PERSONA}
${personalGreeting}

Your capabilities:
1. Deep Forensic Verification: Detect deepfakes, AI generation, and manipulation across text/image/video/audio.
2. News Verification: Verify claims with real-time trust scores (0-100%).
3. Code Generation: Generate complete React/Tailwind code in \`\`\`jsx or \`\`\`html blocks for instant live preview.
4. Image Generation: Output [IMAGE_REQUEST: detailed prompt] format.
5. Memory & Intelligence Vault: Remember preferences and context.
${forensicAddon}
${memoryContext}`;

    return await executeWithGeminiRotation(supabase, {
      messages: messages || [],
      systemPrompt,
      stream: true,
      forensicMode: Boolean(forensicMode),
    });
  } catch (err: any) {
    console.error("[averia-ai] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Averia AI encountered an unexpected error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
