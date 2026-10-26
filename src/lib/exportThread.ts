/** Thread export utilities: password-encrypted JSON and printable PDF. */

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function deriveKey(password: string, salt: BufferSource) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  );
}

/** AES-256-GCM encrypted JSON archive — needs the password to open. */
export async function exportEncryptedJson(name: string, data: unknown, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data, null, 2)),
  );
  const b64 = (b: ArrayBuffer | Uint8Array) =>
    btoa(String.fromCharCode(...new Uint8Array(b as ArrayBuffer)));
  const envelope = {
    format: 'averia-encrypted-thread-v1',
    algorithm: 'AES-256-GCM / PBKDF2-SHA256 150k',
    salt: b64(salt), iv: b64(iv), payload: b64(cipher),
  };
  download(`${name}.averia.json`, new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' }));
}

/** Opens a print-ready transcript; the browser's print dialog saves it as PDF. */
export function exportPrintablePdf(title: string, rows: { who: string; when: string; body: string }[]) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;background:#fff;color:#111;padding:32px;}
    h1{font-size:18px;margin:0 0 4px}
    .meta{font-size:11px;color:#666;margin-bottom:18px}
    .row{border-bottom:1px solid #eee;padding:8px 0}
    .who{font-size:11px;font-weight:700}
    .when{font-size:10px;color:#888;margin-left:6px}
    .body{font-size:12px;white-space:pre-wrap;margin-top:2px}
  </style></head><body>
  <h1>${title}</h1>
  <div class="meta">Exported from Averia AI · ${new Date().toLocaleString()}</div>
  ${rows.map((r) => `<div class="row"><span class="who">${r.who}</span><span class="when">${r.when}</span><div class="body">${
    r.body.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
  }</div></div>`).join('')}
  <script>window.onload=()=>window.print()<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

/** Builds a downloadable calendar reminder from a detected task. */
export function downloadIcs(title: string, when: Date) {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Averia AI//Chat//EN', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(when)}`, `DTEND:${stamp(new Date(when.getTime() + 30 * 60000))}`,
    `SUMMARY:${title.replace(/\n/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  download('averia-reminder.ics', new Blob([ics], { type: 'text/calendar' }));
}
