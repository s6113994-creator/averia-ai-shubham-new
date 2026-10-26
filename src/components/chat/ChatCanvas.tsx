import { useRef, useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Eraser, PenLine, Code2, Send } from 'lucide-react';

/**
 * Shared whiteboard / code canvas. Drawings are flattened to a PNG file and code is
 * shared as a snippet message, so both land in the real message stream.
 */
export function ChatCanvas({
  open, onOpenChange, onSendImage, onSendCode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSendImage: (file: File) => Promise<void> | void;
  onSendCode: (code: string) => Promise<void> | void;
}) {
  const [tab, setTab] = useState<'draw' | 'code'>('draw');
  const [code, setCode] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, c.width, c.height);
  }, [open, tab]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * e.currentTarget.width,
      y: ((e.clientY - r.top) / r.height) * e.currentTarget.height,
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, c.width, c.height);
  };

  const shareDraw = async () => {
    const c = canvasRef.current!;
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    await onSendImage(new File([blob], `canvas-${Date.now()}.png`, { type: 'image/png' }));
    onOpenChange(false);
  };

  const shareCode = async () => {
    if (!code.trim()) return;
    await onSendCode(code);
    setCode('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-card max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Shared canvas</DialogTitle>
          <DialogDescription className="text-xs">Sketch or write code together — the result posts straight into the thread.</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          {(['draw', 'code'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border transition ${
                tab === t ? 'bg-cyan-400/15 border-cyan-300/40 text-cyan-200' : 'border-border/50 text-muted-foreground hover:bg-secondary/40'}`}>
              {t === 'draw' ? <PenLine className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
              {t === 'draw' ? 'Whiteboard' : 'Code canvas'}
            </button>
          ))}
        </div>

        {tab === 'draw' ? (
          <>
            <canvas
              ref={canvasRef} width={880} height={460}
              onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
              className="w-full rounded-xl border border-cyan-300/25 touch-none bg-[#0a0a12]"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clear} className="gap-1.5"><Eraser className="h-3.5 w-3.5" /> Clear</Button>
              <Button size="sm" onClick={shareDraw} className="gap-1.5 flex-1"><Send className="h-3.5 w-3.5" /> Share board</Button>
            </div>
          </>
        ) : (
          <>
            <Textarea value={code} onChange={(e) => setCode(e.target.value)} rows={14}
              placeholder="// collaborative snippet" className="font-mono text-xs bg-secondary/40 thin-scroll" />
            <Button size="sm" onClick={shareCode} disabled={!code.trim()} className="gap-1.5"><Send className="h-3.5 w-3.5" /> Share code</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
