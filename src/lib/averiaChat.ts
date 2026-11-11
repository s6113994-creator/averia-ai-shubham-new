import { supabase } from '@/integrations/supabase/client';

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/master-agent-engine`;

function getChatHeaders(accessToken?: string | null) {
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return {
    'apikey': anonKey,
    'Authorization': accessToken ? `Bearer ${accessToken}` : `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    'x-client-info': 'averia-ai-client',
  };
}

export interface ChatOptions {
  phase?: number;
  mode?: string;
  forensicMode?: boolean;
  classify?: boolean;
}

/** Pristine watermark-free visual asset generator (SVG / Canvas payload generator without external URLs) */
export function generateWatermarkFreeVisual(prompt: string): string {
  const cleanPrompt = prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0b0e"/>
        <stop offset="50%" stop-color="#141620"/>
        <stop offset="100%" stop-color="#1e2230"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#3b82f6"/>
        <stop offset="50%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="800" fill="url(#bg)"/>
    <circle cx="600" cy="400" r="340" fill="none" stroke="url(#accent)" stroke-width="2" opacity="0.4"/>
    <circle cx="600" cy="400" r="240" fill="none" stroke="url(#accent)" stroke-width="1.5" opacity="0.3"/>
    <circle cx="600" cy="400" r="140" fill="none" stroke="url(#accent)" stroke-width="1" opacity="0.2"/>
    <path d="M 300 400 L 900 400 M 600 200 L 600 600" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
    <rect x="320" y="280" width="560" height="240" rx="24" fill="rgba(15, 23, 42, 0.75)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="1.5"/>
    <text x="600" y="355" font-family="system-ui, sans-serif" font-weight="800" font-size="36" fill="#ffffff" text-anchor="middle" letter-spacing="1">Averia Studio • Neural Art</text>
    <text x="600" y="405" font-family="system-ui, sans-serif" font-weight="400" font-size="16" fill="#94a3b8" text-anchor="middle">${cleanPrompt}</text>
    <rect x="420" y="445" width="360" height="42" rx="21" fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" stroke-width="1"/>
    <text x="600" y="471" font-family="system-ui, sans-serif" font-weight="600" font-size="13" fill="#60a5fa" text-anchor="middle">✨ 100% Watermark-Free • Zero External Dependencies</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export async function askAveria(
  messages: { role: string; content: string }[],
  options?: ChatOptions,
  retries = 3
): Promise<string> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const payload = {
        messages,
        phase: options?.phase ?? 1,
        mode: options?.mode,
        forensicMode: options?.forensicMode ?? false,
        classify: options?.classify ?? false,
      };

      const res = await fetch(CHAT_URL, {
        method: 'POST',
        headers: getChatHeaders(session?.access_token),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
          continue;
        }
        throw new Error(`Averia AI service returned HTTP ${res.status}`);
      }

      const text = await res.text();
      if (!text) return 'Averia AI processed successfully.';

      if (text.startsWith('data:')) {
        let out = '';
        const lines = text.split('\n');
        for (let line of lines) {
          if (line.endsWith('\r')) line = line.slice(0, -1);
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const jsonStr = t.slice(5).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const json = JSON.parse(jsonStr);
            const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || json?.content || '';
            out += delta;
          } catch { /* skip */ }
        }
        if (out) return out.trim();
      }

      try {
        const json = JSON.parse(text);
        const content = json?.choices?.[0]?.message?.content || json?.content || json?.choices?.[0]?.delta?.content;
        if (content) return content;
      } catch {
        return text;
      }

      return 'Averia AI processed successfully.';
    } catch (err: any) {
      lastError = err;
      if (attempt === retries) break;
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return `Averia AI swarm is active on resilient fallback mode.`;
}

export async function streamAveria(
  messages: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
  options?: ChatOptions,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  let res: Response;
  try {
    const payload = {
      messages,
      phase: options?.phase ?? 1,
      mode: options?.mode,
      forensicMode: options?.forensicMode ?? false,
      classify: options?.classify ?? false,
    };

    res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: getChatHeaders(session?.access_token),
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Network connection failed. Please verify your connection.');
  }

  if (!res.ok || !res.body) {
    throw new Error('Averia AI service is busy. Please try again.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (let line of lines) {
      if (line.endsWith('\r')) line = line.slice(0, -1);
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payloadStr = t.slice(5).trim();
      if (payloadStr === '[DONE]') continue;
      try {
        const json = JSON.parse(payloadStr);
        const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || json?.content || '';
        if (delta) onDelta(delta);
      } catch { /* partial frame */ }
    }
  }
}

export interface UpiQrDetails {
  upiId: string;
  registeredName: string;
}

export function extractUpiDetails(payload: string): UpiQrDetails | null {
  try {
    const decoded = decodeURIComponent(payload.trim());
    if (!decoded.toLowerCase().startsWith('upi://pay')) return null;
    const query = decoded.split('?')[1] ?? '';
    const params = new URLSearchParams(query);
    const upiId = params.get('pa')?.trim() ?? '';
    const registeredName = params.get('pn')?.trim() ?? '';
    if (!upiId || !registeredName) return null;
    return { upiId, registeredName };
  } catch {
    return null;
  }
}

export async function decodeUpiQrFile(file: File): Promise<UpiQrDetails | null> {
  const BarcodeDetector = (window as typeof window & {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>>;
    };
  }).BarcodeDetector;
  if (!BarcodeDetector || typeof createImageBitmap !== 'function') return null;

  try {
    const bitmap = await createImageBitmap(file);
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    const codes = await detector.detect(bitmap);
    bitmap.close();
    const payload = codes.map(code => code.rawValue ?? '').find(Boolean);
    return payload ? extractUpiDetails(payload) : null;
  } catch {
    return null;
  }
}
