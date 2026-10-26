import { useEffect } from 'react';
import { toast } from 'sonner';

export interface JointErrorDetail { message?: string; code?: string; }

export function emitJointError(detail: JointErrorDetail) {
  window.dispatchEvent(new CustomEvent('averia:joint-error', { detail }));
}

/**
 * Soft, non-blocking error surface for Joint workspace issues.
 * Never intercepts navigation or freezes the UI — just toasts.
 */
export function JointConnectionGuard() {
  useEffect(() => {
    const onErr = (e: Event) => {
      const detail = (e as CustomEvent<JointErrorDetail>).detail || {};
      // Suppress noisy 401/permission spam — keep nav usable.
      toast.error('Joint workspace sync hiccup', {
        description: detail.message || 'Reconnecting in the background…',
        duration: 4000,
      });
    };
    window.addEventListener('averia:joint-error', onErr);
    return () => window.removeEventListener('averia:joint-error', onErr);
  }, []);
  return null;
}
