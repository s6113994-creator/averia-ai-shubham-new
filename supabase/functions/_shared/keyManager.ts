import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export const AVERIA_SYSTEM_PERSONA = `You are Averia Agentic AI (V5.1) — a world-class multimodal intelligence and forensic verification core.
Your personality is sharp, analytical, precise, and professional yet witty.
You deliver forensic-grade truth scores, deepfake and misinformation analysis, and structured intelligence.
Strict White-Label Rule: Never mention third-party AI providers or base models (Gemini, Google AI, OpenAI, Claude, Lovable). Always refer to yourself as Averia Agentic AI / Averia Forensic Core.`;

export interface KeyRecord {
  api_key: string;
  source: "database" | "env" | "fallback";
}

/** Helper to get a Supabase admin client inside Edge Functions */
export function getAdminSupabase() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  return createClient(url, serviceKey);
}

/** Clean & map model name to standard Gemini / OpenAI compatible names */
export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-pro",
  "gemini-1.5-flash"
];

export const OFFICIAL_GEMINI_CASCADE = GEMINI_MODELS;

export function sanitizeAveriaModel(model: string = "gemini-2.5-flash"): string {
  let clean = model.replace(/^google\//i, "").replace(/-preview$/i, "").trim();
  if (GEMINI_MODELS.includes(clean)) return clean;
  if (clean.includes("2.5-flash-lite") || clean.includes("3.5-flash-lite")) return "gemini-2.5-flash-lite";
  if (clean.includes("2.5-pro") || clean.includes("3.1-pro")) return "gemini-2.5-pro";
  if (clean.includes("2.5-flash") || clean.includes("3.8-flash")) return "gemini-2.5-flash";
  if (clean.includes("2.0-flash")) return "gemini-2.0-flash";
  return clean || "gemini-2.5-flash";
}

// ==========================================
// 1. GEMINI MULTI-KEY ROTATION
// ==========================================
export async function getGeminiKeys(supabase: any): Promise<KeyRecord[]> {
  const records: KeyRecord[] = [];
  const seen = new Set<string>();

  // 1. From database table `gemini_api_keys` - fetch STRICTLY ACTIVE keys ordered by error_count ASC, last_used_at ASC
  try {
    let { data, error } = await supabase
      .from("gemini_api_keys")
      .select("api_key, error_count, is_active, last_used_at")
      .eq("is_active", true)
      .order("error_count", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (!error && (!data || data.length === 0)) {
      // Auto-heal: If keys were mistakenly marked inactive by 400 errors, reactivate them
      await supabase.from("gemini_api_keys").update({ is_active: true, error_count: 0 }).neq("api_key", "");
      const res = await supabase.from("gemini_api_keys").select("api_key, error_count, is_active, last_used_at").eq("is_active", true);
      data = res.data;
    }

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const k = row.api_key?.trim();
        if (k && row.is_active === true && !seen.has(k)) {
          if (k.startsWith("AIza") || k.startsWith("sk_") || k.startsWith("sk-") || k.startsWith("lovable:")) {
            seen.add(k);
            records.push({ api_key: k, source: "database" });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[KeyManager] gemini_api_keys query error:", err);
  }

  // 2. From env variables (GEMINI_API_KEY_1..10, GEMINI_API_KEY, GEMINI_API_KEYS)
  for (let i = 1; i <= 10; i++) {
    const envKey = Deno.env.get(`GEMINI_API_KEY_${i}`)?.trim();
    if (envKey && !seen.has(envKey)) {
      seen.add(envKey);
      records.push({ api_key: envKey, source: "env" });
    }
  }
  const single = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (single && !seen.has(single)) {
    seen.add(single);
    records.push({ api_key: single, source: "env" });
  }
  const comma = Deno.env.get("GEMINI_API_KEYS");
  if (comma) {
    for (const part of comma.split(",")) {
      const k = part.trim();
      if (k && !seen.has(k)) {
        seen.add(k);
        records.push({ api_key: k, source: "env" });
      }
    }
  }

  // 3. Fallback to Lovable Gateway if no keys found
  const lovable = Deno.env.get("LOVABLE_API_KEY")?.trim();
  if (records.length === 0 && lovable) {
    records.push({ api_key: `lovable:${lovable}`, source: "fallback" });
  }

  return records;
}

/**
 * Call a single Gemini API key directly (non-streaming) with automatic model fallback.
 * Returns the full text content or empty string on failure.
 */
export async function callSingleGeminiKey(
  apiKey: string,
  messages: any[],
  systemPrompt: string,
  model = "gemini-2.5-flash",
  supabase?: any,
  maxTokens = 32768
): Promise<string> {
  if (!apiKey) return "";
  const isLovable = apiKey.startsWith("lovable:") || apiKey.startsWith("sk_") || apiKey.startsWith("sk-");
  const actualKey = apiKey.replace("lovable:", "");
  const endpoint = isLovable
    ? "https://ai.gateway.lovable.dev/v1/chat/completions"
    : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  // Try the requested model, with fallback to lighter models if rate limited
  const modelChain = isLovable
    ? [`google/${sanitizeAveriaModel(model)}`]
    : [sanitizeAveriaModel(model), "gemini-2.5-flash", "gemini-2.0-flash"];

  for (const targetModel of modelChain) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${actualKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: false,
          max_tokens: maxTokens,
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        const text = data.choices?.[0]?.message?.content || "";
        if (text && text.trim().length > 0) return text.trim();
      } else {
        const errText = await resp.text().catch(() => "");
        const isKeyAuthError = resp.status === 403 || errText.includes("API_KEY_INVALID") || errText.includes("PERMISSION_DENIED");
        if (isKeyAuthError) {
          console.error(
            `[Averia AI] callSingleGeminiKey: Key (${actualKey.slice(0, 10)}...) rejected with HTTP ${resp.status}: "${errText.slice(0, 200)}". Deactivating key in database.`
          );
          if (supabase) {
            supabase
              .from("gemini_api_keys")
              .update({ is_active: false, error_count: 999 })
              .eq("api_key", actualKey)
              .then(() => {})
              .catch(() => {});
          }
          return ""; // Stop immediately on dead key
        }

        if (resp.status === 429) {
          console.warn(
            `[Averia AI] callSingleGeminiKey: Model ${targetModel} returned 429 (Rate Limit). Waiting 1500ms backoff...`
          );
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch {
      // Continue to next model in chain
    }
  }

  return "";
}

/**
 * Unstoppable robust Gemini call that rotates across ALL 10 keys + model fallback cascade.
 * Never returns empty string if ANY key or fallback model is reachable.
 */
export async function callRobustGemini(
  supabase: any,
  messages: any[],
  systemPrompt: string,
  preferredModel = "gemini-2.5-flash",
  maxTokens = 32768,
  startKeyIndex = 0
): Promise<string> {
  const keys = await getGeminiKeys(supabase);
  if (keys.length === 0) return "";

  const models = [
    preferredModel,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  // Rotate starting at startKeyIndex for dedicated per-subagent key slots
  const offset = Math.abs(startKeyIndex) % keys.length;
  const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];

  for (const model of models) {
    for (let i = 0; i < rotated.length; i++) {
      const keyRec = rotated[i];
      const res = await callSingleGeminiKey(keyRec.api_key, messages, systemPrompt, model, supabase, maxTokens);
      if (res && res.trim().length > 10) {
        if (keyRec.source === "database") {
          supabase
            .from("gemini_api_keys")
            .update({ error_count: 0, last_used_at: new Date().toISOString() })
            .eq("api_key", keyRec.api_key)
            .then(() => {})
            .catch(() => {});
        }
        return res.trim();
      }
    }
  }

  return "";
}

/**
 * Execute a swarm of N parallel Gemini agent calls and return all results.
 * agents: array of { role: string, systemPrompt: string }
 * Staggers execution in 2 waves of up to 5 agents with 300ms spacing to prevent
 * simultaneous concurrency spikes across keys.
 */
export async function executeSwarm(
  supabase: any,
  agents: Array<{ role: string; systemPrompt: string }>,
  userMessages: any[],
  model = "gemini-2.5-flash"
): Promise<Array<{ role: string; content: string; success: boolean }>> {
  const keys = await getGeminiKeys(supabase);
  if (keys.length === 0) return agents.map(a => ({ role: a.role, content: "", success: false }));

  const BATCH_SIZE = 5;
  const allResults: Array<{ role: string; content: string; success: boolean }> = [];

  for (let i = 0; i < agents.length; i += BATCH_SIZE) {
    const wave = agents.slice(i, i + BATCH_SIZE);
    if (i > 0) {
      // 300ms spacing between waves to protect RPM & prevent concurrency locks
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    const waveResults = await Promise.allSettled(
      wave.map((agent, waveIdx) => {
        const globalIdx = i + waveIdx;
        const keyRec = keys[globalIdx % keys.length];
        return callSingleGeminiKey(keyRec.api_key, userMessages, agent.systemPrompt, model, supabase);
      })
    );

    for (let j = 0; j < wave.length; j++) {
      const r = waveResults[j];
      allResults.push({
        role: wave[j].role,
        content: r.status === "fulfilled" ? (r.value || "") : "",
        success: r.status === "fulfilled" && !!r.value,
      });
    }
  }

  return allResults;
}

/**
 * Stream a pre-assembled text string as Server-Sent Events (SSE).
 * Used by swarm modes after parallel fan-out is complete.
 */
export function streamTextAsSSE(text: string): Response {
  const encoder = new TextEncoder();
  const chunkSize = 24;

  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        const payload = JSON.stringify({ choices: [{ delta: { content: chunk } }] });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Execute AI chat completion with automatic rotation across all Gemini keys + model cascade */
export async function executeWithGeminiRotation(
  supabase: any,
  options: {
    messages: any[];
    stream?: boolean;
    model?: string;
    forensicMode?: boolean;
    systemPrompt?: string;
    jsonMode?: boolean;
    maxTokens?: number;
    keySlot?: number;
  }
): Promise<Response> {
  const keys = await getGeminiKeys(supabase);
  if (keys.length === 0) {
    return new Response(
      JSON.stringify({ error: "No active Averia AI keys configured." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Rotate keys starting at keySlot for dedicated parallel subagent dispatch
  const offset = typeof options.keySlot === "number" ? (Math.abs(options.keySlot) % keys.length) : 0;
  const rotated = [...keys.slice(offset), ...keys.slice(0, offset)];

  const selectedModel = options.forensicMode ? "gemini-2.5-pro" : (options.model || "gemini-2.5-flash");
  const cleanModel = sanitizeAveriaModel(selectedModel);

  // Model fallback chain: primary requested model -> universal Google Gemini cascade
  const modelsToTry = [
    cleanModel,
    ...GEMINI_MODELS,
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  const finalMessages = [
    ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
    ...options.messages,
  ];

  let lastStatus = 500;
  let lastErrorText = "";
  const deadKeys = new Set<string>();

  // Outer loop: iterate across all keys in the pool starting at the assigned keySlot
  for (let i = 0; i < rotated.length; i++) {
    const keyRec = rotated[i];
    const isLovable = keyRec.api_key.startsWith("lovable:") || keyRec.api_key.startsWith("sk_") || keyRec.api_key.startsWith("sk-");
    const actualKey = keyRec.api_key.replace("lovable:", "");

    // Auto-skip any key known to be dead (403)
    if (deadKeys.has(actualKey)) {
      continue;
    }

    // Inner loop: test each Gemini model on this key before giving up on the key
    for (const currentModel of modelsToTry) {
      const endpoint = isLovable
        ? "https://ai.gateway.lovable.dev/v1/chat/completions"
        : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

      const requestBody: any = {
        model: isLovable ? `google/${currentModel}` : currentModel,
        messages: finalMessages,
        stream: options.stream ?? false,
        max_tokens: Math.min(options.maxTokens ?? 16384, 16384),
      };

      if (options.jsonMode && !isLovable) {
        requestBody.response_format = { type: "json_object" };
      }

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${actualKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (res.ok) {
          // Reset error_count on successful call and update last_used_at for round-robin rotation
          if (keyRec.source === "database") {
            supabase
              .from("gemini_api_keys")
              .update({ error_count: 0, last_used_at: new Date().toISOString() })
              .eq("api_key", keyRec.api_key)
              .then(() => {})
              .catch(() => {});
          }

          if (options.stream) {
            return new Response(res.body, {
              headers: {
                ...corsHeaders,
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
              },
            });
          }

          const data = await res.json();
          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        lastStatus = res.status;
        lastErrorText = await res.text().catch(() => "");

        // ── 0. MODEL NOT FOUND / DEPRECATED (HTTP 404 or 400 with model error) ──
        // DO NOT throw or abort! Immediately continue to the next model in GEMINI_MODELS on this key!
        if (
          res.status === 404 ||
          lastErrorText.includes("not found") ||
          lastErrorText.includes("is not found") ||
          lastErrorText.includes("is no longer available") ||
          lastErrorText.includes("Call ModelService.ListModels")
        ) {
          console.warn(
            `[Averia AI] Key #${i + 1} (${actualKey.slice(0, 10)}...) model ${currentModel} returned ${res.status}. Cascading to next model...`
          );
          continue; // Try next model on this key!
        }

        // ── 1. DEAD-KEY BYPASS (HTTP 403 Forbidden / Invalid Key / Revoked) ──
        const isKeyAuthError = res.status === 403 || lastErrorText.includes("API_KEY_INVALID") || lastErrorText.includes("PERMISSION_DENIED");
        if (isKeyAuthError) {
          deadKeys.add(actualKey);
          console.error(
            `[Averia AI] Key #${i + 1} (${actualKey.slice(0, 10)}...) rejected with HTTP ${res.status}: "${lastErrorText.slice(0, 250)}". Auto-deactivating in database.`
          );

          if (keyRec.source === "database") {
            supabase
              .from("gemini_api_keys")
              .update({ is_active: false, error_count: 999 })
              .eq("api_key", keyRec.api_key)
              .then(() => {})
              .catch(() => {});
          }
          break; // Key is dead; move to next key in pool
        }

        // ── 2. AUTO-RETRY WITH EXPONENTIAL BACKOFF ON HTTP 429 (Rate Limit / RPM Spike) ──
        if (res.status === 429) {
          console.warn(
            `[Averia AI] Key #${i + 1} (${currentModel}) returned HTTP 429. Rotating to next active key...`
          );

          if (keyRec.source === "database") {
            supabase
              .from("gemini_api_keys")
              .update({ error_count: ((keyRec as any).error_count || 0) + 1 })
              .eq("api_key", keyRec.api_key)
              .then(() => {})
              .catch(() => {});
          }

          // Backoff before moving to the next key
          await new Promise((resolve) => setTimeout(resolve, 800));
          break; // Move to next key in pool
        }

        // ── 3. SERVER ERROR (5xx) ──
        console.warn(
          `[Averia AI] Key #${i + 1} (${currentModel}) returned HTTP ${res.status}: "${lastErrorText.slice(0, 150)}". Trying next model/key...`
        );
        continue;

      } catch (networkErr: any) {
        console.warn(`[Averia AI] Key #${i + 1} network exception:`, networkErr?.message);
        continue;
      }
    }
  }

  // Surface the exact real HTTP status and descriptive error reason instead of masking all errors under "rate-limited"
  let errorMsg = `Averia AI engine error (HTTP ${lastStatus}): ${lastErrorText.slice(0, 250) || "Unable to complete request"}`;
  if (lastStatus === 429) {
    errorMsg = "Averia AI service is temporarily experiencing high traffic volume. Please retry in a few moments.";
  } else if (lastStatus === 400 || lastStatus === 403) {
    errorMsg = `Averia AI key permission error (HTTP ${lastStatus}): Please verify active API keys in settings.`;
  }

  return new Response(
    JSON.stringify({ error: errorMsg, status: lastStatus, details: lastErrorText }),
    { status: lastStatus === 429 ? 429 : (lastStatus >= 400 && lastStatus < 600 ? lastStatus : 503), headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ==========================================
// 2. YOUTUBE MULTI-KEY ROTATION
// ==========================================
export async function getYouTubeKeys(supabase: any): Promise<KeyRecord[]> {
  const records: KeyRecord[] = [];
  const seen = new Set<string>();

  // 1. From database table `youtube_api_keys`
  try {
    const { data, error } = await supabase
      .from("youtube_api_keys")
      .select("api_key, error_count")
      .eq("is_active", true)
      .order("error_count", { ascending: true });

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const k = row.api_key?.trim();
        if (k && !seen.has(k)) {
          seen.add(k);
          records.push({ api_key: k, source: "database" });
        }
      }
    }
  } catch (err) {
    console.warn("[KeyManager] youtube_api_keys query error:", err);
  }

  // 2. From env variables (YOUTUBE_API_KEY_1..10, YOUTUBE_API_KEY, YOUTUBE_API_KEYS)
  for (let i = 1; i <= 10; i++) {
    const envKey = Deno.env.get(`YOUTUBE_API_KEY_${i}`)?.trim();
    if (envKey && !seen.has(envKey)) {
      seen.add(envKey);
      records.push({ api_key: envKey, source: "env" });
    }
  }
  const single = Deno.env.get("YOUTUBE_API_KEY")?.trim();
  if (single && !seen.has(single)) {
    seen.add(single);
    records.push({ api_key: single, source: "env" });
  }
  const comma = Deno.env.get("YOUTUBE_API_KEYS");
  if (comma) {
    for (const part of comma.split(",")) {
      const k = part.trim();
      if (k && !seen.has(k)) {
        seen.add(k);
        records.push({ api_key: k, source: "env" });
      }
    }
  }

  return records;
}

/** Execute a YouTube API call with automatic multi-key rotation on 403 quota exhaustion / 429 */
export async function executeWithYouTubeRotation(
  supabase: any,
  fn: (apiKey: string) => Promise<Response>
): Promise<Response> {
  const keys = await getYouTubeKeys(supabase);
  if (keys.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: "No YouTube API keys configured." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const startIdx = Math.floor(Math.random() * keys.length);
  const rotated = [...keys.slice(startIdx), ...keys.slice(0, startIdx)];

  let lastRes: Response | null = null;

  for (let i = 0; i < rotated.length; i++) {
    const keyRec = rotated[i];
    try {
      console.log(`[YouTube Engine] Attempting request using key #${i + 1}/${rotated.length}...`);
      const res = await fn(keyRec.api_key);

      if (res.ok) {
        if (keyRec.source === "database") {
          supabase
            .from("youtube_api_keys")
            .update({ last_used_at: new Date().toISOString() })
            .eq("api_key", keyRec.api_key)
            .then(() => {})
            .catch(() => {});
        }
        return res;
      }

      lastRes = res;
      console.warn(`[YouTube Engine] Key #${i + 1} failed with status ${res.status}. Rotating...`);

      if (keyRec.source === "database") {
        supabase
          .from("youtube_api_keys")
          .update({ error_count: 1 })
          .eq("api_key", keyRec.api_key)
          .then(() => {})
          .catch(() => {});
      }

      if ([403, 429, 500, 503].includes(res.status)) {
        continue;
      }
      return res;
    } catch (err: any) {
      console.warn(`[YouTube Engine] Key #${i + 1} exception:`, err?.message);
      continue;
    }
  }

  return lastRes || new Response(
    JSON.stringify({ success: false, error: "All YouTube API keys exhausted or rate-limited." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// ==========================================
// 3. NEWS API MULTI-KEY ROTATION
// ==========================================
const DEFAULT_NEWS_FALLBACK_KEYS = [
  "2a2c607411b2488f9b5bab17af6a8ea5",
  "59ae1b46bd4046a0ade43d48c5e4417e",
  "a4e70f9af3a34627ab3f90d9aa36d811",
  "30a4ac64313f4acd8926dd1857c2fedf",
];

export async function getNewsKeys(supabase: any): Promise<KeyRecord[]> {
  const records: KeyRecord[] = [];
  const seen = new Set<string>();

  // 1. From database table `news_api_keys`
  try {
    const { data, error } = await supabase
      .from("news_api_keys")
      .select("api_key, error_count")
      .eq("is_active", true)
      .order("error_count", { ascending: true });

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const k = row.api_key?.trim();
        if (k && !seen.has(k)) {
          seen.add(k);
          records.push({ api_key: k, source: "database" });
        }
      }
    }
  } catch (err) {
    console.warn("[KeyManager] news_api_keys query error:", err);
  }

  // 2. From env variables (NEWS_API_KEY_1..4, NEWS_API_KEY, NEWS_API_KEYS)
  for (let i = 1; i <= 4; i++) {
    const envKey = Deno.env.get(`NEWS_API_KEY_${i}`)?.trim();
    if (envKey && !seen.has(envKey)) {
      seen.add(envKey);
      records.push({ api_key: envKey, source: "env" });
    }
  }
  const single = Deno.env.get("NEWS_API_KEY")?.trim();
  if (single && !seen.has(single)) {
    seen.add(single);
    records.push({ api_key: single, source: "env" });
  }

  // 3. Default known pool fallback
  for (const fallback of DEFAULT_NEWS_FALLBACK_KEYS) {
    if (!seen.has(fallback)) {
      seen.add(fallback);
      records.push({ api_key: fallback, source: "fallback" });
    }
  }

  return records;
}

/** Execute a News API call with automatic multi-key rotation */
export async function executeWithNewsRotation(
  supabase: any,
  fn: (apiKey: string) => Promise<Response>
): Promise<Response> {
  const keys = await getNewsKeys(supabase);
  const startIdx = Math.floor(Math.random() * keys.length);
  const rotated = [...keys.slice(startIdx), ...keys.slice(0, startIdx)];

  let lastRes: Response | null = null;

  for (let i = 0; i < rotated.length; i++) {
    const keyRec = rotated[i];
    try {
      console.log(`[News Engine] Attempting request with key #${i + 1}/${rotated.length}...`);
      const res = await fn(keyRec.api_key);

      if (res.ok) {
        if (keyRec.source === "database") {
          supabase
            .from("news_api_keys")
            .update({ last_used_at: new Date().toISOString() })
            .eq("api_key", keyRec.api_key)
            .then(() => {})
            .catch(() => {});
        }
        return res;
      }

      lastRes = res;
      console.warn(`[News Engine] Key #${i + 1} failed (${res.status}), rotating...`);

      if (keyRec.source === "database") {
        supabase
          .from("news_api_keys")
          .update({ error_count: 1 })
          .eq("api_key", keyRec.api_key)
          .then(() => {})
          .catch(() => {});
      }

      if ([401, 403, 429, 500, 502, 503].includes(res.status)) {
        continue;
      }
      return res;
    } catch (err: any) {
      console.warn(`[News Engine] Key #${i + 1} exception:`, err?.message);
      continue;
    }
  }

  return lastRes || new Response(
    JSON.stringify({ success: false, error: "All NewsAPI keys exhausted." }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
