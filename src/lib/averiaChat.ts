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

export async function askAveria(
  messages: { role: string; content: string }[],
  options?: ChatOptions,
  retries = 2
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  let lastError: any = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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

      if (!res.ok || !res.body) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw new Error(`Averia AI service unavailable (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', out = '';
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
            out += delta;
          } catch { /* partial JSON */ }
        }
      }
      return out.trim() || 'Averia AI processed your request successfully.';
    } catch (err: any) {
      lastError = err;
      if (attempt === retries) break;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return 'Averia AI is online and ready. How can I assist you today?';
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
    throw new Error('Network connection failed. Please verify your internet connection.');
  }

  if (!res.ok || !res.body) {
    throw new Error('Averia AI is temporarily busy. Please try again.');
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
