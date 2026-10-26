import { useEffect, useState } from 'react';
import { AveriaLogo } from '@/components/AveriaLogo';

/**
 * Blurred ambient veil rendered during environment / theme switches so the
 * brief auth-screen flash never bleeds through. Triggered by the
 * `sessionStorage.averia.switching` flag set right before a hard reload.
 */
export function SwitchVeil() {
  const [show, setShow] = useState(() => {
    try { return sessionStorage.getItem('averia.switching') === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => {
      try { sessionStorage.removeItem('averia.switching'); } catch {}
      setShow(false);
    }, 700);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[9999] backdrop-blur-2xl bg-background/80 flex items-center justify-center pointer-events-auto">
      <div className="flex flex-col items-center gap-4">
        <AveriaLogo size="xl" animate />
        <div className="h-1 w-32 rounded-full bg-secondary/40 overflow-hidden">
          <div className="h-full w-1/2 bg-gradient-to-r from-primary to-accent animate-pulse" />
        </div>
        <p className="text-xs text-muted-foreground uppercase tracking-widest">Switching environment…</p>
      </div>
    </div>
  );
}
