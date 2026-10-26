import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Download, FileText, Pause, Play, X, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getCached, putCached } from './mediaCache';

/** Resolves a private chat-media object to a local blob URL, caching it in IndexedDB. */
export function useChatMedia(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      const cached = await getCached(path);
      if (cached) {
        objectUrl = URL.createObjectURL(cached);
        if (alive) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl);
        return;
      }
      const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600);
      if (!data?.signedUrl) return;
      if (alive) setUrl(data.signedUrl);
      try {
        const blob = await (await fetch(data.signedUrl)).blob();
        await putCached(path, blob);
      } catch { /* offline cache best effort */ }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return url;
}

/* ---------------- Glassmorphic waveform audio card ---------------- */
export function AudioWave({ path, name, compact }: { path: string; name?: string; compact?: boolean }) {
  const url = useChatMedia(path);
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = useRef<number[]>(Array.from({ length: 34 }, (_, i) => 22 + Math.abs(Math.sin(i * 1.7)) * 70));

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) { document.querySelectorAll('audio').forEach((el) => el !== a && el.pause()); a.play(); }
    else a.pause();
  };

  return (
    <div className={`flex items-center gap-2.5 rounded-2xl border border-cyan-400/30 bg-cyan-400/5 backdrop-blur-xl px-3 py-2 ${compact ? 'w-full' : 'min-w-[220px]'}`}>
      <button
        onClick={toggle}
        className="h-8 w-8 shrink-0 rounded-full grid place-items-center bg-cyan-400/20 border border-cyan-300/40 text-cyan-200 hover:bg-cyan-400/30 transition"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-[2px] h-7">
          {bars.current.map((h, i) => {
            const on = (i / bars.current.length) * 100 <= progress;
            return (
              <span
                key={i}
                style={{ height: `${h}%` }}
                className={`flex-1 rounded-full transition-colors ${on ? 'bg-cyan-300' : 'bg-cyan-300/25'} ${playing && on ? 'animate-pulse' : ''}`}
              />
            );
          })}
        </div>
        {name && <p className="text-[9px] text-cyan-200/70 truncate mt-0.5">{name}</p>}
      </div>
      {url && (
        <audio
          ref={ref} src={url} preload="metadata" className="hidden"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0); }}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (a.duration) setProgress((a.currentTime / a.duration) * 100);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Fullscreen lightbox ---------------- */
export function MediaLightbox({ path, kind, name, onClose }: { path: string; kind: string; name?: string; onClose: () => void }) {
  const url = useChatMedia(path);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-[300] bg-black/92 backdrop-blur-xl flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute top-3 right-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {kind === 'image' && (
          <>
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="h-9 w-9 grid place-items-center rounded-full bg-white/10 text-white"><ZoomOut className="h-4 w-4" /></button>
            <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="h-9 w-9 grid place-items-center rounded-full bg-white/10 text-white"><ZoomIn className="h-4 w-4" /></button>
          </>
        )}
        {url && <a href={url} download={name || 'attachment'} className="h-9 w-9 grid place-items-center rounded-full bg-white/10 text-white"><Download className="h-4 w-4" /></a>}
        <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-full bg-white/10 text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-w-[94vw] max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
        {!url ? (
          <div className="h-48 w-72 rounded-xl bg-white/10 animate-pulse" />
        ) : kind === 'video' ? (
          <video src={url} controls autoPlay className="max-h-[88vh] max-w-[94vw] rounded-xl" />
        ) : kind === 'voice' ? (
          <div className="w-[min(92vw,420px)]"><AudioWave path={path} name={name} compact /></div>
        ) : kind === 'image' ? (
          <img src={url} alt={name || 'media'} style={{ transform: `scale(${zoom})` }} className="max-h-[88vh] max-w-[94vw] rounded-xl transition-transform origin-center" />
        ) : (
          <a href={url} download={name} className="flex items-center gap-2 text-white bg-white/10 px-5 py-4 rounded-xl">
            <FileText className="h-5 w-5" /> {name || 'Download file'}
          </a>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

/* ---------------- Inline bubble media ---------------- */
export function ChatMedia({
  path, kind, name, onOpen,
}: { path: string; kind: string; name?: string; onOpen?: () => void }) {
  const url = useChatMedia(path);
  if (kind === 'voice') return <AudioWave path={path} name={name} />;
  if (!url) return <div className="h-24 w-44 rounded-xl bg-secondary/40 animate-pulse" />;
  if (kind === 'image') {
    return <img src={url} alt={name || 'attachment'} onClick={onOpen} className="rounded-xl max-h-56 object-cover cursor-zoom-in" />;
  }
  if (kind === 'video') {
    return <video src={url} controls playsInline onClick={onOpen} className="rounded-xl max-h-56 cursor-pointer" />;
  }
  return (
    <button onClick={onOpen} className="flex items-center gap-2 text-xs underline">
      <FileText className="h-3.5 w-3.5" /> {name || 'Open file'}
    </button>
  );
}
