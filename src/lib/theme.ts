// Theme controller: instant DOM-class mutation, no reload, propagates via storage event.
export type ThemeMode = 'light' | 'dark';
const KEY = 'averia.theme';

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'dark';
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'light') { root.classList.add('light'); root.classList.remove('dark'); }
  else { root.classList.add('dark'); root.classList.remove('light'); }
  try { localStorage.setItem(KEY, mode); } catch {}
  window.dispatchEvent(new CustomEvent('averia:theme-change', { detail: mode }));
}

export function initTheme() {
  applyTheme(getStoredTheme());
}
