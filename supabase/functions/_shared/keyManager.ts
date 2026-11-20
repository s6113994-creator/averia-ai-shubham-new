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
export function sanitizeAveriaModel(model: string = "gemini-2.5-flash"): string {
  let clean = model.replace(/^google\//i, "").replace(/-preview$/i, "");
  if (clean.includes("gemini-3") || clean.includes("gemini-2.5-flash")) {
    return "gemini-2.5-flash";
  }
  if (clean.includes("gemini-2.5-pro")) {
    return "gemini-2.5-pro";
  }
  if (!clean.startsWith("gemini-")) {
    return "gemini-2.5-flash";
  }
  return clean;
}

// ==========================================
// 1. GEMINI MULTI-KEY ROTATION
// ==========================================
export async function getGeminiKeys(supabase: any): Promise<KeyRecord[]> {
  const records: KeyRecord[] = [];
  const seen = new Set<string>();

  // 1. From database table `gemini_api_keys`
  try {
    const { data, error } = await supabase
      .from("gemini_api_keys")
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
 * Call a single Gemini API key directly (non-streaming) — used by swarm agents.
 * Returns the full text content or empty string on failure.
 */
export async function callSingleGeminiKey(
  apiKey: string,
  messages: any[],
  systemPrompt: string,
  model = "gemini-2.5-flash"
): Promise<string> {
  if (!apiKey) return "";
  const isLovable = apiKey.startsWith("lovable:");
  const actualKey = isLovable ? apiKey.replace("lovable:", "") : apiKey;
  const endpoint = isLovable
    ? "https://ai.gateway.lovable.dev/v1/chat/completions"
    : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${actualKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: isLovable ? `google/${sanitizeAveriaModel(model)}` : sanitizeAveriaModel(model),
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: false,
        max_tokens: 4096,
      }),
    });
    if (!resp.ok) return "";
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

/**
 * Execute a swarm of N parallel Gemini agent calls and return all results.
 * agents: array of { role: string, systemPrompt: string }
 * Uses first N keys from pool; falls back to key[0] if fewer keys available.
 */
export async function executeSwarm(
  supabase: any,
  agents: Array<{ role: string; systemPrompt: string }>,
  userMessages: any[],
  model = "gemini-2.5-flash"
): Promise<Array<{ role: string; content: string; success: boolean }>> {
  const keys = await getGeminiKeys(supabase);
  if (keys.length === 0) return agents.map(a => ({ role: a.role, content: "", success: false }));

  const results = await Promise.allSettled(
    agents.map((agent, idx) => {
      const keyRec = keys[idx % keys.length];
      const actualKey = keyRec.api_key.startsWith("lovable:")
        ? keyRec.api_key.replace("lovable:", "")
        : keyRec.api_key;
      return callSingleGeminiKey(actualKey, userMessages, agent.systemPrompt, model);
    })
  );

  return results.map((r, idx) => ({
    role: agents[idx].role,
    content: r.status === "fulfilled" ? (r.value || "") : "",
    success: r.status === "fulfilled" && !!r.value,
  }));
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

/** Execute AI chat completion with automatic rotation across all Gemini keys */
export async function executeWithGeminiRotation(
  supabase: any,
  options: {
    messages: any[];
    stream?: boolean;
    model?: string;
    forensicMode?: boolean;
    systemPrompt?: string;
    jsonMode?: boolean;
  }
): Promise<Response> {
  const keys = await getGeminiKeys(supabase);
  if (keys.length === 0) {
    return new Response(
      JSON.stringify({ error: "No active Averia AI keys configured." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Randomize initial key offset for round-robin load distribution
  const startIdx = Math.floor(Math.random() * keys.length);
  const rotated = [...keys.slice(startIdx), ...keys.slice(0, startIdx)];

  const selectedModel = options.forensicMode ? "gemini-2.5-pro" : (options.model || "gemini-2.5-flash");
  const cleanModel = sanitizeAveriaModel(selectedModel);

  const finalMessages = [
    ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
    ...options.messages,
  ];

  let lastStatus = 500;
  let lastErrorText = "";

  for (let i = 0; i < rotated.length; i++) {
    const keyRec = rotated[i];
    const isLovable = keyRec.api_key.startsWith("lovable:");
    const actualKey = isLovable ? keyRec.api_key.replace("lovable:", "") : keyRec.api_key;

    const endpoint = isLovable
      ? "https://ai.gateway.lovable.dev/v1/chat/completions"
      : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

    const requestBody: any = {
      model: isLovable ? (options.forensicMode ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash") : cleanModel,
      messages: finalMessages,
      stream: options.stream ?? false,
    };

    if (options.jsonMode && !isLovable) {
      requestBody.response_format = { type: "json_object" };
    }

    try {
      console.log(`[Averia AI] Dispatching with key #${i + 1}/${rotated.length} (source: ${keyRec.source})...`);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${actualKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (res.ok) {
        // Record success in background
        if (keyRec.source === "database") {
          supabase
            .from("gemini_api_keys")
            .update({ last_used_at: new Date().toISOString() })
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
      console.warn(`[Averia AI] Key #${i + 1} rejected with status ${res.status}: ${lastErrorText.slice(0, 150)}`);

      // Increment error count on failure
      if (keyRec.source === "database") {
        supabase
          .from("gemini_api_keys")
          .update({ error_count: 1 })
          .eq("api_key", keyRec.api_key)
          .then(() => {})
          .catch(() => {});
      }

      if ([429, 403, 500, 502, 503, 504].includes(res.status)) {
        continue;
      }
    } catch (networkErr: any) {
      console.warn(`[Averia AI] Key #${i + 1} network exception:`, networkErr?.message);
      continue;
    }
  }

  return new Response(
    JSON.stringify({ error: "Averia AI core is temporarily rate-limited. Please retry shortly.", details: lastErrorText }),
    { status: lastStatus === 429 ? 429 : 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
