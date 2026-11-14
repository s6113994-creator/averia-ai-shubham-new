import { supabase } from '@/integrations/supabase/client';

/** One-shot helper around the streaming averia-ai edge function. Returns full text. */
export async function askAveria(messages: { role: string; content: string }[]): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/averia-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  if (res.status === 429) throw new Error('Averia is rate limited — try again in a moment.');
  if (res.status === 402) throw new Error('AI credits exhausted. Add credits to continue.');
  if (!res.ok || !res.body) throw new Error('Averia AI is unavailable right now.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try { out += JSON.parse(payload)?.choices?.[0]?.delta?.content ?? ''; } catch { /* partial */ }
    }
  }
  return out.trim();
}

/** Streams a reply, invoking onDelta for each token chunk. */
export async function streamAveria(
  messages: { role: string; content: string }[],
  onDelta: (chunk: string) => void,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/averia-ai`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  });
  if (res.status === 429) throw new Error('Averia is rate limited — try again in a moment.');
  if (res.status === 402) throw new Error('AI credits exhausted. Add credits to continue.');
  if (!res.ok || !res.body) throw new Error('Averia AI is unavailable right now.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch { /* partial frame */ }
    }
  }
}

export interface UpiQrDetails {
  upiId: string;
  registeredName: string;
}

/** Extracts the payment address and registered name from a decoded UPI QR payload. */
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

/** Uses the browser QR detector when available, then applies the same UPI parser. */
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
