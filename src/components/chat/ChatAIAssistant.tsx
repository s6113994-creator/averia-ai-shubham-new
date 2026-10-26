import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, X, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { streamAveria } from '@/lib/averiaChat';
import { toast } from 'sonner';

interface Msg { role: 'user' | 'assistant'; content: string }

/** Floating in-chat mini Averia agent, anchored bottom-right of the messaging workspace. */
export function ChatAIAssistant({ context }: { context?: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const send = async () => {
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs([...next, { role: 'assistant', content: '' }]);
    setBusy(true);
    try {
      const payload = context
        ? [{ role: 'system', content: `Conversation context the user may ask about:\n${context.slice(0, 4000)}` }, ...next]
        : next;
      await streamAveria(payload, (chunk) => {
        setMsgs((p) => {
          const c = [...p];
          c[c.length - 1] = { role: 'assistant', content: c[c.length - 1].content + chunk };
          return c;
        });
      });
    } catch (e: any) {
      toast.error(e.message || 'Averia is unavailable');
      setMsgs((p) => p.slice(0, -1));
    }
    setBusy(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-[130] h-12 w-12 rounded-full grid place-items-center border border-cyan-300/40 bg-cyan-400/15 backdrop-blur-xl text-cyan-200 shadow-[0_0_24px_-4px_rgba(34,211,238,0.6)] hover:bg-cyan-400/25 transition"
        title="Averia assistant"
      >
        {open ? <X className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.96 }}
            className="fixed bottom-40 right-4 md:bottom-24 md:right-6 z-[130] w-[min(92vw,340px)] h-[min(60vh,420px)] rounded-2xl border border-cyan-300/25 bg-background/80 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-cyan-300/20 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
              <p className="text-xs font-semibold">Averia in-chat assistant</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto thin-scroll px-3 py-2 space-y-2">
              {msgs.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Ask me to summarise this thread, draft a reply, or verify a claim.</p>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`text-[12px] leading-snug px-2.5 py-1.5 rounded-xl whitespace-pre-wrap ${
                  m.role === 'user' ? 'bg-primary/20 ml-8' : 'bg-secondary/50 mr-8 border border-border/40'}`}>
                  {m.content || <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
              ))}
              <div ref={endRef} />
            </div>
            <div className="p-2 border-t border-cyan-300/20 flex items-center gap-1.5">
              <Input
                value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Ask Averia…" className="h-8 text-xs bg-secondary/40"
              />
              <Button size="icon" className="h-8 w-8 shrink-0" onClick={send} disabled={busy || !text.trim()}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
