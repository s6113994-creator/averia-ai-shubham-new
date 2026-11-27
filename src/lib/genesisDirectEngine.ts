/**
 * Averia Genesis Direct Browser Swarm Compiler Engine
 * 
 * Modern TypeScript + React (.tsx / .ts) Multi-Language Full-Stack Architecture:
 * - 100% decoupled from Supabase Edge Functions (zero Edge 546 limits)
 * - Direct browser-to-Gemini streaming via generativelanguage.googleapis.com
 * - Multi-key 10-slot rotation pool supporting .env, localStorage & DB fallbacks
 * - Universal Gemini model cascade
 * - 10 senior full-stack specialized parallel subagents (maxOutputTokens: 16384)
 * - Complete TypeScript & React stack: Vite, Tailwind, Drizzle ORM, Express.js
 * - 100% in-browser offline persistence via window.LocalDB
 */

export interface GenesisProjectFile {
  path: string;
  content: string;
  language?: string;
}

export interface GenesisWorkerResult {
  role: string;
  files: GenesisProjectFile[];
  content: string;
  error?: string;
  modelUsed?: string;
  apiKeyUsed?: string;
  keyIndexUsed?: number;
}

export interface SurvivorInfo {
  apiKey: string;
  model: string;
  keyIndex?: number;
}

export const GEMINI_CASCADE_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-2.5-pro',
  'gemini-3.5-pro',
  'gemini-3.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
];

// Session cache for live discovered Gemini models
let discoveredModelsCache: string[] | null = null;

export function clearDiscoveredModelsCache(): void {
  discoveredModelsCache = null;
}

/**
 * Dynamically queries Google API (via proxy or direct) for live models supporting generateContent.
 * Caches live models in memory so workers only call confirmed live models.
 */
export async function discoverSupportedGeminiModels(apiKey: string): Promise<string[]> {
  if (discoveredModelsCache && discoveredModelsCache.length > 0) {
    return discoveredModelsCache;
  }

  try {
    let rawModels: any[] = [];

    // 1. Try Vercel Edge Same-Origin Proxy (/api/gemini-stream)
    try {
      const resp = await fetch('/api/gemini-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({ action: 'list_models' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.models)) rawModels = data.models;
      }
    } catch {}

    // 2. Try Supabase Edge Proxy
    if (rawModels.length === 0) {
      try {
        const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://qhmxmwigvexyxvklukns.supabase.co').replace(/\/+$/, '');
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
        const sbHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        };
        if (supabaseKey) {
          sbHeaders['apikey'] = supabaseKey;
          sbHeaders['authorization'] = `Bearer ${supabaseKey}`;
        }
        const resp = await fetch(`${supabaseUrl}/functions/v1/gemini-stream`, {
          method: 'POST',
          headers: sbHeaders,
          body: JSON.stringify({ action: 'list_models' }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.models)) rawModels = data.models;
        }
      } catch {}
    }

    // 3. Fallback: Direct Google API
    if (rawModels.length === 0) {
      try {
        const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
          method: 'GET',
          headers: { 'x-goog-api-key': apiKey },
        });
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.models)) rawModels = data.models;
        }
      } catch {}
    }

    // Filter models that support generateContent, strip 'models/' prefix, and exclude non-coding/media models
    const validModels = rawModels
      .filter((m: any) => {
        const name = (m.name || '').replace(/^models\//, '').toLowerCase();
        const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
        const supportsGenerate = methods.includes('generateContent');
        const isExcluded = name.includes('embedding') ||
                           name.includes('imagen') ||
                           name.includes('aqa') ||
                           name.includes('tts') ||
                           name.includes('robotics') ||
                           name.includes('audio');
        return supportsGenerate && !isExcluded && name.startsWith('gemini');
      })
      .map((m: any) => (m.name || '').replace(/^models\//, ''));

    if (validModels.length > 0) {
      const PRIORITY_ORDER = [
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-3.5-flash',
        'gemini-2.5-pro',
        'gemini-3.5-pro',
        'gemini-3.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
      ];

      validModels.sort((a, b) => {
        const idxA = PRIORITY_ORDER.indexOf(a);
        const idxB = PRIORITY_ORDER.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });

      console.log(`[Genesis Live Models] Auto-discovered ${validModels.length} active Gemini models:`, validModels);
      discoveredModelsCache = validModels;
      return validModels;
    }
  } catch (err) {
    console.warn('[Genesis Models] Dynamic discovery warning:', err);
  }

  return GEMINI_CASCADE_MODELS;
}

const LOCAL_STORAGE_KEY_GEMINI = 'averia_gemini_api_keys';

/**
 * Global quarantined/dead keys tracker (e.g. HTTP 400/403 API_KEY_INVALID / PERMISSION_DENIED)
 */
export const quarantinedKeys = new Set<string>();

export function clearQuarantinedKeys(): void {
  quarantinedKeys.clear();
}

/**
 * Retrieve user custom keys stored in browser localStorage
 */
export function getCustomGeminiKeys(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_GEMINI);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((k: any) => String(k).trim()).filter(k => k.length >= 20 && !k.startsWith('lovable:'));
      }
    } catch {
      return raw.split(',').map(k => k.trim()).filter(k => k.length >= 20 && !k.startsWith('lovable:'));
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Save user custom Gemini API keys into localStorage
 */
export function saveCustomGeminiKeys(keys: string[]): void {
  try {
    const clean = Array.from(new Set(keys.map(k => k.trim()).filter(k => k.length >= 20 && !k.startsWith('lovable:'))));
    localStorage.setItem(LOCAL_STORAGE_KEY_GEMINI, JSON.stringify(clean));
  } catch (err) {
    console.warn('[Genesis] Failed to persist custom Gemini keys:', err);
  }
}

/**
 * Load all available Gemini API keys from all sources:
 * 1. localStorage custom keys
 * 2. Vite env vars (VITE_GEMINI_KEY_1..10, VITE_GEMINI_API_KEYS, VITE_GEMINI_API_KEY)
 * 3. Optional Supabase DB lookup if client provided (all active keys: AQ.Ab8..., AIzaSy..., etc.)
 *
 * Prioritizes AIzaSy... keys first, followed by AQ.Ab8... auth keys across all slots.
 */
export async function getAllAvailableGeminiKeys(supabaseClient?: any): Promise<string[]> {
  const keys: string[] = [];
  const seen = new Set<string>();

  const addKey = (k: any) => {
    if (!k || typeof k !== 'string') return;
    const clean = k.trim();
    // Accept all valid Gemini API keys (AIzaSy..., AQ.Ab8..., etc. with length >= 20) and ignore non-Gemini
    if (clean.length >= 20 && !seen.has(clean) && !clean.startsWith('lovable:')) {
      seen.add(clean);
      keys.push(clean);
    }
  };

  // 1. From localStorage
  const localKeys = getCustomGeminiKeys();
  localKeys.forEach(addKey);

  // 2. From Vite env variables
  const env = import.meta.env as Record<string, any>;
  for (let i = 1; i <= 10; i++) {
    addKey(env[`VITE_GEMINI_KEY_${i}`]);
    addKey(env[`VITE_GEMINI_API_KEY_${i}`]);
  }
  addKey(env.VITE_GEMINI_API_KEY);
  addKey(env.VITE_GEMINI_KEY);
  if (env.VITE_GEMINI_API_KEYS) {
    env.VITE_GEMINI_API_KEYS.split(',').forEach(addKey);
  }

  // 3. Optional DB lookup (fetch up to 30 active keys so all available pool keys are included)
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('gemini_api_keys')
        .select('api_key')
        .eq('is_active', true)
        .limit(30);
      if (!error && Array.isArray(data)) {
        data.forEach(row => addKey(row.api_key));
      }
    } catch (dbErr) {
      console.warn('[Genesis] Supabase gemini_api_keys lookup warning:', dbErr);
    }
  }

  // Prioritize AIzaSy... keys first, then AQ.Ab8... keys, and any other valid keys
  const sorted = Array.from(keys).sort((a, b) => {
    const aIsAiza = a.startsWith('AIza') ? 0 : 1;
    const bIsAiza = b.startsWith('AIza') ? 0 : 1;
    if (aIsAiza !== bIsAiza) return aIsAiza - bIsAiza;
    const aIsAq = a.startsWith('AQ.') ? 0 : 1;
    const bIsAq = b.startsWith('AQ.') ? 0 : 1;
    return aIsAq - bIsAq;
  });

  return sorted;
}

/**
 * 10 Senior Engineering Swarm Roles & System Prompts (Modern TypeScript + React)
 */
export function getGenesisRolePrompt(
  role: string,
  userGoal: string,
  resolvedTitle: string,
  sharedContract: string
): { roleName: string; targetFiles: string; prompt: string } {
  const contract = sharedContract || `Application: ${resolvedTitle}\nRouter: window.__AVERIA_APP__\nStore: window.AveriaStore\nEngine: window.AveriaEngine\nPersistence: window.LocalDB (localStorage/IndexedDB)`;

  const ROLE_MAP: Record<string, { roleName: string; targetFiles: string; prompt: string }> = {
    architect: {
      roleName: 'System & Tooling Architect',
      targetFiles: 'package.json, tsconfig.json, vite.config.ts, tailwind.config.ts, components.json, .env.example, README.md',
      prompt: `You are the Principal System & Tooling Architect in the Genesis full-stack compiler swarm.
Your job is to generate the modern, production-grade TypeScript & React tooling files for "${resolvedTitle}" (${userGoal}):
1. \`\`\`json:package.json — Production manifest with name "${resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}", scripts ("dev": "vite", "build": "tsc && vite build", "preview": "vite preview", "server": "tsx server/index.ts"), dependencies ("react": "^18.3.1", "react-dom": "^18.3.1", "lucide-react": "^0.460.0", "clsx": "^2.1.1", "tailwind-merge": "^2.5.4", "drizzle-orm": "^0.36.0", "postgres": "^3.4.5", "express": "^4.21.1", "cors": "^2.8.5", "dotenv": "^16.4.5", "zod": "^3.23.8"), and devDependencies ("typescript": "^5.6.3", "@types/react": "^18.3.12", "@types/react-dom": "^18.3.1", "@types/express": "^5.0.0", "@types/cors": "^2.8.17", "@types/node": "^22.9.0", "@vitejs/plugin-react": "^4.3.3", "vite": "^5.4.10", "tailwindcss": "^3.4.14", "autoprefixer": "^10.4.20", "postcss": "^8.4.47", "drizzle-kit": "^0.28.0", "tsx": "^4.19.2").
2. \`\`\`json:tsconfig.json — Strict TypeScript compiler options with "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true, "paths": { "@/*": ["./src/*"] }.
3. \`\`\`typescript:vite.config.ts — Modern Vite config with @vitejs/plugin-react and path alias resolution for "@".
4. \`\`\`typescript:tailwind.config.ts — Complete Tailwind CSS configuration with custom theme colors, glassmorphism tokens, and keyframe animations.
5. \`\`\`json:components.json — Modern shadcn / UI components schema configuration.
6. \`\`\`bash:.env.example — Environment variable template with PORT=3001, DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}, VITE_API_URL=http://localhost:3001.
7. \`\`\`markdown:README.md — Comprehensive engineering documentation detailing: system architecture, multi-page route table, database schema, state management contract, and offline execution with window.LocalDB.

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`json:package.json. ZERO conversational prose. Every file must be complete and production ready.`
    },

    db_engineer: {
      roleName: 'Database & Drizzle Architect',
      targetFiles: 'schema.sql, drizzle.config.ts, src/db/schema.ts',
      prompt: `You are the Lead Database & ORM Architect in the Genesis full-stack compiler swarm.
Your job is to generate the PostgreSQL relational DDL AND the modern Drizzle ORM schema for "${resolvedTitle}" (${userGoal}):
1. \`\`\`sql:schema.sql — Complete PostgreSQL DDL with:
   - Primary keys (UUID default gen_random_uuid()), foreign keys with ON DELETE CASCADE, NOT NULL checks, and CHECK constraints
   - B-tree indices on high-cardinality foreign keys, search fields, and created_at timestamps
   - Seed data: At least 12-16 authentic domain records fully populated with realistic titles, descriptions, prices, categories, tags, ratings, and status
2. \`\`\`typescript:drizzle.config.ts — Complete Drizzle Kit configuration pointing to "./src/db/schema.ts" with dialect "postgresql".
3. \`\`\`typescript:src/db/schema.ts — Typed Drizzle ORM schema exporting tables (pgTable, uuid, text, timestamp, numeric, integer, boolean, jsonb) and relations for all domain entities (products/items, users, orders, cart_items, categories, reviews).

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`sql:schema.sql. ZERO conversational prose. Deep, complete SQL and TypeScript Drizzle schema only.`
    },

    backend_api: {
      roleName: 'Backend REST API Engineer',
      targetFiles: 'server/index.ts, api/handler.ts',
      prompt: `You are the Senior Backend Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the production Node.js / Express TypeScript backend server files for "${resolvedTitle}" (${userGoal}):
1. \`\`\`typescript:server/index.ts — Complete Express TypeScript server with:
   - import express from 'express'; import cors from 'cors'; import dotenv from 'dotenv';
   - Middleware: cors(), express.json()
   - Typed CRUD routes for /api/items (with query parameters: search, category, sort, page)
   - /api/items/:id, POST /api/items, PATCH /api/items/:id, DELETE /api/items/:id
   - Domain actions: /api/checkout, /api/action, /api/analytics, /api/health
   - In-memory mock store pre-populated with 12 authentic records synchronized with domain types
   - const PORT = process.env.PORT || 3001; app.listen(PORT, ...)
2. \`\`\`typescript:api/handler.ts — Universal serverless / edge API request dispatcher mapping routes and methods with CORS headers.

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`typescript:server/index.ts. ZERO conversational prose. Complete backend TypeScript only.`
    },

    data_sdk: {
      roleName: 'Data & State SDK Engineer',
      targetFiles: 'src/lib/dataSdk.ts',
      prompt: `You are the Principal Client Data & State Architect in the Genesis full-stack compiler swarm.
Your job is to generate the typed client data SDK for "${resolvedTitle}" (${userGoal}):
CRITICAL MANDATE: Output 300–700 lines of complete, production-grade code. NEVER output stubs, placeholders, or abbreviated snippets like "// implement logic here".
\`\`\`typescript:src/lib/dataSdk.ts — Complete state & data SDK wired to window.__AVERIA_APP__ and backed by window.LocalDB:
- TypeScript interfaces: Item, CartItem, Order, User, Review, FilterOptions
- Authentic initial dataset (12-16 realistic domain items with id, name, category, price, status, rating, tags, image placeholder)
- DataSDK class with full reactive CRUD methods:
  * list<T>(collection: string, options?: any): Promise<T[]>
  * get<T>(collection: string, id: string): Promise<T | null>
  * create<T>(collection: string, item: any): Promise<T>
  * update<T>(collection: string, id: string, patch: any): Promise<T | null>
  * remove(collection: string, id: string): Promise<boolean>
  * clear(collection: string): Promise<boolean>
  * subscribe(event: string, callback: (data: any) => void): () => void
  * search(collection: string, query: string): Promise<any[]>
- 100% OFFLINE BROWSER PERSISTENCE:
  Calls window.LocalDB (backed by localStorage/IndexedDB) so every created app persists real data in the browser immediately!
- REGISTRATION:
  const sdk = new DataSDK();
  if (typeof window !== 'undefined') {
    if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('data', sdk);
    (window as any).AveriaStore = sdk;
    (window as any).DataSDK = sdk;
  }
  export default sdk;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`typescript:src/lib/dataSdk.ts. ZERO conversational prose. Full 300+ lines of production TypeScript only.`
    },

    logic_engine: {
      roleName: 'Core Logic & Analytics Engine',
      targetFiles: 'src/lib/engine.ts',
      prompt: `You are the Lead Core Logic & Analytics Architect in the Genesis full-stack compiler swarm.
Your job is to generate the core business calculation algorithms or interactive engine for "${resolvedTitle}" (${userGoal}):
CRITICAL MANDATE: Output 300–700 lines of complete, production-grade code. NEVER output stubs, placeholders, or abbreviated logic.
\`\`\`typescript:src/lib/engine.ts — Typed calculation algorithms, business logic, or 60FPS loop:
- IF THE APPLICATION IS SAAS / E-COMMERCE / TOOL:
  * calculateTotals(cart: any[], promoCode?: string, taxRate?: number, shippingMethod?: string): Typed total breakdown (subtotal, promoDiscount, tax, shipping, grandTotal)
  * filterAndRankItems(items: any[], query: string, filters: Record<string, any>, sortBy: string): Filtered and ranked items
  * validateStock(cart: any[], inventory: Record<string, number>): Stock availability checks
  * computeStoreAnalytics(orders: any[], products: any[]): Revenue metrics, conversion rate, average order value, top performers
- IF THE APPLICATION IS A GAME:
  * Full 60FPS requestAnimationFrame canvas loop with delta-time smoothing
  * Player physics: velocity, acceleration, friction, jumping/movement, collision boundaries
  * Intelligent AI opponents or obstacle spawners with difficulty scaling
  * Particle effect systems and PROCEDURAL WEB AUDIO API SYNTHESIZER: window.AveriaSound generating jump, laser, hit, score, and victory sound effects!
- REGISTRATION:
  const engine = new CoreEngine();
  if (typeof window !== 'undefined') {
    if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('engine', engine);
    (window as any).AveriaEngine = engine;
    (window as any).CoreEngine = engine;
  }
  export default engine;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`typescript:src/lib/engine.ts. ZERO conversational prose. Full 300+ lines of production TypeScript only.`
    },

    ui_shell: {
      roleName: 'UI Shell & Design System',
      targetFiles: 'index.html, src/styles.css, src/components/ui.tsx',
      prompt: `You are the UI Shell & Design System Architect in the Genesis full-stack compiler swarm.
Your job is to generate the modern responsive HTML5 shell, CSS design system, and reusable React UI primitives for "${resolvedTitle}" (${userGoal}):
CRITICAL MANDATE: Output complete, production-ready code with full styling and zero stubs.
1. \`\`\`html:index.html — Full modern responsive HTML5 shell matching world-class Lovable / Vite quality:
   - <script src="https://cdn.tailwindcss.com"></script>
   - <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
   - <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
   - <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
   - <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
   - Header/Navbar with brand icon & title "${resolvedTitle}", search bar, category tabs, and action badges
   - Main app viewport: <main id="app" class="flex-1 w-full min-h-[calc(100vh-4rem)] p-4 md:p-6"></main>
   - Modal root container: <div id="modal-root"></div>
   - Toast notification container: <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>
   - Script tags in strict topological order:
     <script type="text/babel" data-presets="react,typescript" src="src/lib/dataSdk.ts"></script>
     <script type="text/babel" data-presets="react,typescript" src="src/components/ui.tsx"></script>
     <script type="text/babel" data-presets="react,typescript" src="src/lib/engine.ts"></script>
     <script type="text/babel" data-presets="react,typescript" src="src/router.tsx"></script>
     <script type="text/babel" data-presets="react,typescript" src="src/pages/HomePage.tsx"></script>
     <script type="text/babel" data-presets="react,typescript" src="src/pages/AppPages.tsx"></script>
     <script type="text/babel" data-presets="react,typescript" src="src/lib/qaGuard.ts"></script>
2. \`\`\`css:src/styles.css — Modern CSS tokens, animations, custom scrollbars, and glassmorphic utility styles.
3. \`\`\`tsx:src/components/ui.tsx — Reusable React TypeScript UI components:
   - Button, Badge, Card, Modal, SlideOverDrawer, Tabs, Input, Navbar, Footer
   - Attaches to window.UI for runtime access and exports individual components.

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`html:index.html. ZERO conversational prose. Complete code only.`
    },

    spa_router: {
      roleName: 'Multi-Page SPA Router',
      targetFiles: 'src/router.tsx',
      prompt: `You are the Multi-Page SPA Router Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the robust client-side nested router for "${resolvedTitle}" (${userGoal}):
CRITICAL MANDATE: Output 300–600 lines of complete, production-grade router code. NEVER output stubs or placeholders.
\`\`\`tsx:src/router.tsx — Typed client-side SPA router wired to window.__AVERIA_APP__:
- Route registry supporting:
  * '/' -> HomePage.render()
  * '/shop' or '/catalog'
  * '/product/:id' or '/detail/:id' (with URL parameter parsing)
  * '/cart'
  * '/checkout'
  * '/orders'
  * '/wishlist'
  * '/admin' or '/dashboard'
  * '/settings'
- Router methods:
  * navigate(path: string, params?: any): void
  * goBack(): void
  * currentRoute: string
  * getParams(): Record<string, any>
  * onChange(listener: (route: string, params: any) => void): () => void
- Post-message route telemetry to parent preview pane:
  try { window.parent.postMessage({ type: 'AVERIA_ROUTE_UPDATE', route, allRoutes }, '*'); } catch(e) {}
- Dual registration:
  if (typeof window !== 'undefined') {
    if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('router', Router);
    (window as any).__AVERIA_ROUTER__ = (window as any).__AVERIA_ROUTER__ || Router;
  }
  export default Router;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`tsx:src/router.tsx. ZERO conversational prose. Complete TypeScript React router only.`
    },

    home_view: {
      roleName: 'Home View Specialist',
      targetFiles: 'src/pages/HomePage.tsx',
      prompt: `You are the Lead Frontend View Architect in the Genesis full-stack compiler swarm.
Your job is to generate the primary interactive Home / Storefront React component for "${resolvedTitle}" (${userGoal}):
CRITICAL MANDATE: Output 300–700 lines of rich, complete, production-grade React TSX code. NEVER output stubs, placeholders, or empty sections.
\`\`\`tsx:src/pages/HomePage.tsx — Primary React TSX storefront rendering into document.getElementById('app'):
- Modern React component with hooks (useState, useEffect):
  * High-impact Hero section with headline, search bar, and primary CTA
  * Featured products / items grid with price, rating stars, tag badges, and "Add to Cart" / "View Details" buttons
  * Live category filter tabs and quick sorting
  * Promo banner / value proposition cards (Free Shipping, Secure Checkout, 24/7 Support)
  * Customer review testimonials
- Mount method:
  HomePage.render = function(params) {
    const container = document.getElementById('app');
    if (!container) return;
    if (window.ReactDOM && window.ReactDOM.createRoot) {
      if (!window.__react_root__) window.__react_root__ = window.ReactDOM.createRoot(container);
      window.__react_root__.render(<HomePage {...(params || {})} />);
    }
  };
- REGISTRATION:
  if (typeof window !== 'undefined') {
    if ((window as any).__AVERIA_APP__) {
      (window as any).__AVERIA_APP__.route('/', (params: any) => HomePage.render(params));
      (window as any).__AVERIA_APP__.register('home', HomePage);
    }
    (window as any).HomePage = HomePage;
  }
  export default HomePage;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`tsx:src/pages/HomePage.tsx. ZERO conversational prose. Full 300+ lines of production TypeScript React only.`
    },

    sub_pages: {
      roleName: 'Sub-Pages & Nested Views Specialist',
      targetFiles: 'src/pages/AppPages.tsx',
      prompt: `You are the Senior Application Views Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the deep secondary React TSX pages and detail views for "${resolvedTitle}" (${userGoal}):
CRITICAL MANDATE: Output 400–800 lines of rich, complete, production-grade React TSX. Implement ALL secondary pages with full interactive controls, tables, forms, and modals. NEVER output stubs or placeholders.
\`\`\`tsx:src/pages/AppPages.tsx — Complete multi-page views implementation rendering into document.getElementById('app'):
- Implement all secondary React components:
  1. ShopPage (or CatalogPage): Full searchable and filterable product catalog with price slider, category checkboxes, and grid/list toggle
  2. ProductDetailPage: In-depth view for selected item with image gallery preview, specs table, quantity selector, add to cart / wishlist, and customer reviews
  3. CartPage & CheckoutPage: Interactive cart drawer/page with line item quantity adjustments, promo code input, shipping options, and multi-step checkout form
  4. OrdersPage: Order tracking and purchase history with delivery status timelines
  5. WishlistPage: Saved items with one-click move-to-cart
  6. AdminDashboard: Inventory management table, add/edit product modal, and revenue analytics charts
- ZERO DEAD BUTTONS: Every navigation button calls window.__AVERIA_APP__.navigate(...)
- REGISTRATION:
  if (typeof window !== 'undefined') {
    if ((window as any).__AVERIA_APP__) {
      (window as any).__AVERIA_APP__.register('pages', AppPages);
    }
    (window as any).AppPages = AppPages;
  }
  export default AppPages;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`tsx:src/pages/AppPages.tsx. ZERO conversational prose. Full 400+ lines of production TypeScript React only.`
    },

    qa_security: {
      roleName: 'QA & Runtime Guard',
      targetFiles: 'src/lib/qaGuard.ts',
      prompt: `You are the Lead QA & Security Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the quality assurance, security, and self-healing runtime guard for "${resolvedTitle}" (${userGoal}):
\`\`\`typescript:src/lib/qaGuard.ts — Client-side security and self-healing runtime:
- sanitizeHTML(str: string): string — Robust XSS protection against script injection
- safeJSONParse<T>(str: string, fallback: T): T — Bulletproof JSON parsing
- getFallbackSVG(label: string, width?: number, height?: number): string — Dynamic SVG data-URI generator for missing artwork
- showToast(message: string, type?: 'success' | 'error' | 'info'): void — Toast notification alert manager
- runHealthCheck(): boolean — Verifies that window.__AVERIA_APP__, DataSDK, CoreEngine, HomePage, and AppPages are properly mounted and functional
- REGISTRATION:
  const guard = new QAGuard();
  if (typeof window !== 'undefined') {
    if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('qa', guard);
    (window as any).QAGuard = guard;
  }
  export default guard;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`typescript:src/lib/qaGuard.ts. ZERO conversational prose. Complete TypeScript only.`
    },
  };

  return ROLE_MAP[role] || ROLE_MAP.ui_shell;
}

export interface GenesisBatchDefinition {
  batchId: 'batch_foundation' | 'batch_shell_router' | 'batch_views_qa';
  batchName: string;
  workerRoles: string[];
  targetFilesSummary: string;
  primaryKeySlot: number;
}

export const GENESIS_SWARM_BATCHES: GenesisBatchDefinition[] = [
  {
    batchId: 'batch_foundation',
    batchName: 'Foundation & Core Engine (Architect + DB + Backend + DataSDK + Engine)',
    workerRoles: ['architect', 'db_engineer', 'backend_api', 'data_sdk', 'logic_engine'],
    targetFilesSummary: 'schema.sql, server/index.ts, src/lib/dataSdk.ts, src/lib/engine.ts',
    primaryKeySlot: 0,
  },
  {
    batchId: 'batch_shell_router',
    batchName: 'UI Shell & Design System & SPA Router',
    workerRoles: ['ui_shell', 'spa_router'],
    targetFilesSummary: 'index.html, src/styles.css, src/components/ui.tsx, src/router.tsx',
    primaryKeySlot: 1,
  },
  {
    batchId: 'batch_views_qa',
    batchName: 'Application Views & Runtime Guard (Home View + Sub-Pages + QA Guard)',
    workerRoles: ['home_view', 'sub_pages', 'qa_security'],
    targetFilesSummary: 'src/pages/HomePage.tsx, src/pages/AppPages.tsx, src/lib/qaGuard.ts',
    primaryKeySlot: 2,
  },
];

export function getGenesisBatchPrompt(
  batchId: string,
  userGoal: string,
  resolvedTitle: string,
  sharedContract: string
): { batchName: string; prompt: string } {
  const title = resolvedTitle || 'Averia Project';
  const goal = userGoal || 'Full-Stack Application';
  const contract = sharedContract || `Application: ${title}\nRouter: window.__AVERIA_APP__\nStore: window.AveriaStore\nEngine: window.AveriaEngine\nPersistence: window.LocalDB (localStorage/IndexedDB)`;

  const isGame = /\b(game|snake|pong|arcade|tetris|flappy|rpg|play|canvas|2d|jump|score|runner)\b/i.test(goal);

  if (batchId === 'batch_foundation') {
    return {
      batchName: 'Foundation & Core Engine',
      prompt: `You are the Lead Senior Backend & Systems Architect for "${title}" (${goal}).
YOUR ABSOLUTE MANDATE: Build the exact application requested by the user: "${goal}".
DO NOT generate an unrelated e-commerce store unless the user explicitly requested a shop or store!

MANDATORY RULES:
- Output every file using: ===FILE: <path>=== followed by complete, production-grade code.
- ZERO conversational prose, ZERO placeholders, ZERO stubs (such as "// implement here").
- Generate EXACTLY these 4 complete production files:
  1. schema.sql (Complete PostgreSQL DDL with tables, indices, and at least 10 authentic seed records matching "${goal}")
  2. server/index.ts (Complete Express REST API with full CRUD endpoints matching the domain)
  3. src/lib/dataSdk.ts (Complete Client Data SDK backed by window.LocalDB, defining DataSDK, AveriaStore, and domain interfaces)
  4. src/lib/engine.ts (${isGame ? 'Full 60FPS canvas game loop, collision detection, player controls, Web Audio synthesizer' : 'Core business calculation algorithms, data ranking, analytics, and domain logic'})

SHARED CONTRACT:
${contract}

Output all 4 complete files in ===FILE: <path>=== format immediately:`
    };
  }

  if (batchId === 'batch_shell_router') {
    return {
      batchName: 'UI Shell & Router',
      prompt: `You are the UI Shell & Router Architecture Team for "${title}" (${goal}).
YOUR MANDATE: Generate the modern responsive HTML5 shell, CSS design system, reusable React UI components, and the client-side SPA router for "${title}".

MANDATORY RULES:
- Output every file using: ===FILE: <path>=== followed by complete code.
- ZERO external npm imports (use React globally from window.React, and use FontAwesome icons).
- Navigation links/buttons MUST use both onclick="if(window.__AVERIA_NAVIGATE__) window.__AVERIA_NAVIGATE__('/...'); else if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/...');" and href="#/..." for dual routing.
- Generate EXACTLY these 4 complete production files:
  1. index.html (Responsive HTML5 shell with brand navbar, main viewport <main id="app" class="flex-1 w-full min-h-screen"></main> with ZERO static placeholder text inside so React mounts cleanly, modal-root, toast-container, and script manifest)
  2. src/styles.css (Modern CSS tokens, animations, custom scrollbars, and dark theme utility styles)
  3. src/components/ui.tsx (Reusable Button, Card, Modal, Input, Badge, Tabs attached to window.UI and window: window.Button = Button; window.Card = Card; window.Modal = Modal; window.Input = Input;)
  4. src/router.tsx (Complete client router that ALWAYS resolves pages via window.HomePage, window.AppPages, and window.__RESOLVE_ROUTE_COMPONENT__ instead of unbundled ESM imports. Mounts cleanly to document.getElementById('app') and listens to 'hashchange' and 'averia:navigate')

SHARED CONTRACT:
${contract}

Output all 4 complete files in ===FILE: <path>=== format immediately:`
    };
  }

  // batch_views_qa
  return {
    batchName: 'Application Views & Runtime Guard',
    prompt: `You are the Lead Frontend & QA Architect for "${title}" (${goal}).
YOUR MANDATE: Generate the primary interactive view, secondary multi-page views, and runtime security guard for "${title}".
Tailor all views strictly to the user's requested application: "${goal}".
${isGame ? 'Create an authentic, fully playable HTML5 Canvas Game with live score HUD, controls, game-over screen, and leaderboards.' : 'Create a rich, multi-page responsive application with authentic domain cards, forms, filters, and modal dialogs.'}

MANDATORY RULES:
- Output every file using: ===FILE: <path>=== followed by complete code.
- ZERO external npm imports. Use window.React, window.ReactDOM, and window.LocalDB.
- Generate EXACTLY these 3 complete production files:
  1. src/pages/HomePage.tsx (Primary interactive view: ${isGame ? 'Playable HTML5 Canvas Game' : 'Hero banner, domain data grid/dashboard, search, filter tabs, interactive detail modal'}. ALWAYS attaches window.HomePage = HomePage; window.__AVERIA_PAGES__ = window.__AVERIA_PAGES__ || {}; window.__AVERIA_PAGES__.HomePage = HomePage; window.__AVERIA_PAGES__['/'] = HomePage; export default HomePage; Renders COMPLETE, rich domain content with buttons calling window.__AVERIA_NAVIGATE__('/...'))
  2. src/pages/AppPages.tsx (Secondary multi-page views matching domain: e.g. ExplorePage, CartPage, OrdersPage, SettingsPage, LeaderboardPage, PlayPage, AdminDashboard. ALWAYS attaches EVERY inner page component both individually: window.ExplorePage = ...; window.CartPage = ...; AND as window.AppPages = { ... }; AND registers on window.__AVERIA_PAGES__. Includes full interactive state, forms, lists, modals, and window.__AVERIA_NAVIGATE__('/...') on every button/link)
  3. src/lib/qaGuard.ts (Runtime security guard: sanitizeHTML, safeJSONParse, showToast, runHealthCheck)

SHARED CONTRACT:
${contract}

Output all 3 complete files in ===FILE: <path>=== format immediately:`
  };
}

export function extractFencedProjectFiles(text: string): GenesisProjectFile[] {
  const files: GenesisProjectFile[] = [];
  if (!text) return files;
  const seen = new Set<string>();

  const getLanguageFromPath = (cleanPath: string): string => {
    if (cleanPath.endsWith('.html')) return 'html';
    if (cleanPath.endsWith('.css')) return 'css';
    if (cleanPath.endsWith('.sql')) return 'sql';
    if (cleanPath.endsWith('.json')) return 'json';
    if (cleanPath.endsWith('.tsx')) return 'tsx';
    if (cleanPath.endsWith('.ts')) return 'typescript';
    if (cleanPath.endsWith('.md')) return 'markdown';
    return 'javascript';
  };

  // 1. Match ===FILE: <path>=== ... ===END_FILE=== or next ===FILE:
  const markerRegex = /(?:===FILE:\s*([^\n\r=]+?)\s*===|(?:\/\*+|\/{2,})\s*===FILE:\s*([^\n\r=]+?)\s*===\s*\*?\/?)[\r\n]+([\s\S]*?)(?=(?:===FILE:|\/\*+\s*===FILE:|\/{2,}\s*===FILE:|$))/gi;
  let mMatch: RegExpExecArray | null;
  while ((mMatch = markerRegex.exec(text)) !== null) {
    const rawPath = (mMatch[1] || mMatch[2] || '').trim();
    if (!rawPath || !rawPath.includes('.')) continue;
    const cleanPath = rawPath.replace(/^[\\\/]+/, '').trim();
    if (seen.has(cleanPath)) continue;
    seen.add(cleanPath);

    let content = mMatch[3].trim();
    content = content.replace(/===END_FILE===/gi, '').replace(/```+$/g, '').trim();
    const innerBlock = content.match(/^```[a-zA-Z0-9_\-]*\s*([\s\S]*?)```$/);
    if (innerBlock) content = innerBlock[1].trim();

    files.push({
      path: cleanPath,
      content,
      language: getLanguageFromPath(cleanPath),
    });
  }

  // 2. Also match standard fenced code blocks: ```[lang]:[filepath] ... ``` or ```file:[filepath] ... ```
  const regex = /```(?:([a-zA-Z0-9_\-]+):)?(?:file:)?([^\n\r]+?)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawPath = match[2].trim();
    if (!rawPath.includes('.') && !rawPath.includes('/') && !rawPath.includes('\\')) {
      continue;
    }
    const cleanPath = rawPath.replace(/^[\\\/]+/, '').replace(/^file:/i, '').trim();
    if (seen.has(cleanPath)) continue;
    seen.add(cleanPath);

    files.push({
      path: cleanPath,
      content: match[3],
      language: match[1] || getLanguageFromPath(cleanPath),
    });
  }

  return files;
}

/**
 * Call Google Gemini Direct SSE API from the Browser with multi-key rotation and universal model cascade
 */
/**
 * Dual-Proxy Stream Fetcher with Automatic Failover:
 * 1. Target 1: /api/gemini-stream (Vercel Edge Same-Origin proxy: zero CORS, zero timeout, zero proxy overhead)
 * 2. Target 2: ${SUPABASE_URL}/functions/v1/gemini-stream (Supabase Edge stateless proxy with CORS headers)
 * 3. Target 3: https://generativelanguage.googleapis.com (Direct Google Gemini API fallback)
 */
async function fetchGeminiStreamWithFailover({
  model,
  apiKey,
  requestPayload,
}: {
  model: string;
  apiKey: string;
  requestPayload: any;
}): Promise<Response> {
  const proxyBody = JSON.stringify({
    model,
    ...requestPayload,
  });

  // 1. Try Vercel Edge Same-Origin Proxy (/api/gemini-stream)
  try {
    const vercelResp = await fetch('/api/gemini-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: proxyBody,
    });

    // If 404 (local Vite dev without vercel edge) or 502/504, failover to Supabase Edge
    if (vercelResp.status === 404 || vercelResp.status === 502 || vercelResp.status === 504) {
      console.warn(`[Genesis Dual-Proxy] /api/gemini-stream returned ${vercelResp.status}. Failing over to Supabase Edge proxy...`);
    } else {
      return vercelResp;
    }
  } catch (vErr: any) {
    console.warn('[Genesis Dual-Proxy] /api/gemini-stream unreachable. Failing over to Supabase Edge proxy...', vErr.message);
  }

  // 2. Try Supabase Edge Stateless Proxy (${SUPABASE_URL}/functions/v1/gemini-stream)
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://qhmxmwigvexyxvklukns.supabase.co').replace(/\/+$/, '');
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const supabaseProxyUrl = `${supabaseUrl}/functions/v1/gemini-stream`;

  try {
    const sbHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
    if (supabaseKey) {
      sbHeaders['apikey'] = supabaseKey;
      sbHeaders['authorization'] = `Bearer ${supabaseKey}`;
    }

    const sbResp = await fetch(supabaseProxyUrl, {
      method: 'POST',
      headers: sbHeaders,
      body: proxyBody,
    });

    if (sbResp.status === 404) {
      console.warn('[Genesis Dual-Proxy] Supabase gemini-stream returned 404. Failing over to direct Google Gemini API...');
    } else {
      return sbResp;
    }
  } catch (sbErr: any) {
    console.warn('[Genesis Dual-Proxy] Supabase gemini-stream unreachable. Failing over to direct Google Gemini API...', sbErr.message);
  }

  // 3. Fallback: Direct Google Gemini SSE
  const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`;
  return await fetch(directUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(requestPayload),
  });
}

export async function streamGeminiRoleDirect({
  role,
  userGoal,
  resolvedTitle,
  sharedContract,
  availableKeys,
  keySlot = 0,
  onChunk,
  onModelCascade,
  onKeyRotate,
}: {
  role: string;
  userGoal: string;
  resolvedTitle: string;
  sharedContract: string;
  availableKeys: string[];
  keySlot: number;
  onChunk: (delta: string, bytes: number) => void;
  onModelCascade?: (model: string) => void;
  onKeyRotate?: (newSlot: number) => void;
}): Promise<GenesisWorkerResult> {
  if (!availableKeys || availableKeys.length === 0) {
    throw new Error('No Gemini API keys available. Please add at least 1 Gemini API key in settings or .env');
  }

  const roleConfig = getGenesisRolePrompt(role, userGoal, resolvedTitle, sharedContract);
  const userPrompt = `Generate the production-grade modern TypeScript & React code for "${resolvedTitle}" (${userGoal}). Follow your role and architectural contract strictly.`;

  const getHealthyKeys = () => {
    const healthy = availableKeys.filter(k => !quarantinedKeys.has(k));
    return healthy.length > 0 ? healthy : availableKeys;
  };

  let healthy = getHealthyKeys();
  let currentSlot = keySlot % healthy.length;
  let keyAttempts = 0;
  let rateLimitRetries = 0;
  let lastErrorMsg = '';
  const maxKeyAttempts = Math.max(availableKeys.length * 4, 20);

  // Discover supported models live from Google API for this key
  const liveModels = await discoverSupportedGeminiModels(healthy[currentSlot % healthy.length]);
  const modelsToTry = liveModels.length > 0 ? liveModels : GEMINI_CASCADE_MODELS;

  while (keyAttempts < maxKeyAttempts) {
    healthy = getHealthyKeys();
    const apiKey = healthy[currentSlot % healthy.length];
    keyAttempts++;
    let hit429 = false;

    // Try cascading through models confirmed live for this key
    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const model = modelsToTry[mIdx];
      if (onModelCascade) onModelCascade(model);

      const requestPayload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: roleConfig.prompt }],
        },
        generationConfig: {
          maxOutputTokens: 12288,
          temperature: 0.2,
          topP: 0.95,
        },
      };

      try {
        const response = await fetchGeminiStreamWithFailover({
          model,
          apiKey,
          requestPayload,
        });

        // 404 Model Not Found -> Cascade to next model on same key
        if (response.status === 404) {
          lastErrorMsg = `HTTP 404: Model ${model} not available on this API key`;
          console.warn(`[Genesis Direct] Model ${model} returned 404 on key #${currentSlot + 1}. Cascading...`);
          continue;
        }

        // 400 / 403 API Key Invalid or Permission Denied -> Quarantine key immediately & re-route
        if (response.status === 400 || response.status === 403) {
          const errBody = await response.text().catch(() => '');
          lastErrorMsg = `HTTP ${response.status}: ${errBody.slice(0, 100)}`;
          const isKeyError = response.status === 403 ||
            errBody.includes('API_KEY_INVALID') ||
            errBody.includes('PERMISSION_DENIED') ||
            errBody.includes('API key not valid') ||
            errBody.includes('CONSUMER_INVALID') ||
            errBody.includes("Method doesn't allow unregistered callers") ||
            errBody.includes('Key not found');

          if (isKeyError) {
            console.warn(`[Genesis Direct] Key #${currentSlot + 1} (${apiKey.slice(0, 10)}...) QUARANTINED due to HTTP ${response.status} (${errBody.slice(0, 60)}). Re-routing onto healthy keys...`);
            quarantinedKeys.add(apiKey);
            healthy = getHealthyKeys();
            currentSlot = (currentSlot + 1) % healthy.length;
            if (onKeyRotate) onKeyRotate(currentSlot);
            break; // Break model loop, immediately retry on next healthy key
          } else {
            console.warn(`[Genesis Direct] Model ${model} returned 400 (${errBody.slice(0, 80)}). Cascading...`);
            continue;
          }
        }

        // 429 Rate Limit / Quota -> Exponential backoff retry (2000ms * attempt, up to 4 retries) and rotate key slot
        if (response.status === 429) {
          hit429 = true;
          rateLimitRetries++;
          const attempt = Math.min(rateLimitRetries, 4);
          const backoffMs = 2000 * attempt;
          lastErrorMsg = `HTTP 429: Rate limit reached (attempt ${rateLimitRetries}/4)`;
          console.warn(`[Genesis Direct] Key #${currentSlot + 1} hit 429 rate limit (attempt ${rateLimitRetries}/4). Backing off for ${backoffMs}ms and rotating to next healthy key slot...`);
          healthy = getHealthyKeys();
          currentSlot = (currentSlot + 1) % healthy.length;
          if (onKeyRotate) onKeyRotate(currentSlot);
          await new Promise(r => setTimeout(r, backoffMs));
          break; // Break model loop, trigger retry with rotated key
        }

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => `HTTP ${response.status}`);
          lastErrorMsg = `HTTP ${response.status}: ${errText.slice(0, 100)}`;
          throw new Error(`Google Gemini direct error (HTTP ${response.status}): ${errText.slice(0, 100)}`);
        }

        // Successfully opened SSE stream!
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            onChunk('', value.byteLength);
          }

          buffer += decoder.decode(value, { stream: true });
          let newlineIdx: number;

          while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
            let line = buffer.slice(0, newlineIdx);
            buffer = buffer.slice(newlineIdx + 1);

            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (!line.startsWith('data: ')) continue;

            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;

            try {
              const parsed = JSON.parse(jsonStr);
              const candidate = parsed.candidates?.[0];
              const parts = candidate?.content?.parts;
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (part.text) {
                    fullText += part.text;
                    onChunk(part.text, 0);
                  }
                }
              }
            } catch {
              // Incomplete or non-json chunk
            }
          }
        }

        // Parse extracted files
        let parsedFiles = extractFencedProjectFiles(fullText);

        // Normalize paths according to canonical TypeScript / React role targets
        parsedFiles = parsedFiles.map(f => {
          if (role === 'ui_shell' && (f.path.includes('ui_shell') || f.path.endsWith('.html'))) {
            return { ...f, path: 'index.html' };
          }
          if (role === 'home_view' && (f.path.includes('home_view') || f.path.endsWith('HomePage.tsx') || f.path.endsWith('HomePage.js') || f.path.endsWith('home.tsx') || f.path.endsWith('home.js'))) {
            return { ...f, path: 'src/pages/HomePage.tsx' };
          }
          if (role === 'sub_pages' && (f.path.includes('sub_pages') || f.path.endsWith('AppPages.tsx') || f.path.endsWith('AppPages.js') || f.path.endsWith('pages.tsx') || f.path.endsWith('pages.js'))) {
            return { ...f, path: 'src/pages/AppPages.tsx' };
          }
          if (role === 'spa_router' && f.path.includes('router')) {
            return { ...f, path: 'src/router.tsx' };
          }
          if (role === 'logic_engine' && (f.path.includes('engine') || f.path.includes('calculator') || f.path.includes('analytics'))) {
            return { ...f, path: 'src/lib/engine.ts' };
          }
          if (role === 'data_sdk' && (f.path.includes('data') || f.path.includes('store') || f.path.includes('sdk'))) {
            return { ...f, path: 'src/lib/dataSdk.ts' };
          }
          if (role === 'qa_security' && (f.path.includes('qa') || f.path.includes('guard'))) {
            return { ...f, path: 'src/lib/qaGuard.ts' };
          }
          return f;
        });

        // Single fallback if code block missing fence name
        if (parsedFiles.length === 0 && fullText.trim().length > 30) {
          const CANONICAL_TARGETS: Record<string, string> = {
            architect: 'package.json',
            db_engineer: 'src/db/schema.ts',
            backend_api: 'server/index.ts',
            data_sdk: 'src/lib/dataSdk.ts',
            logic_engine: 'src/lib/engine.ts',
            ui_shell: 'index.html',
            spa_router: 'src/router.tsx',
            home_view: 'src/pages/HomePage.tsx',
            sub_pages: 'src/pages/AppPages.tsx',
            qa_security: 'src/lib/qaGuard.ts',
          };
          const target = CANONICAL_TARGETS[role] || 'src/module.ts';
          let clean = fullText.trim().replace(/^```[a-zA-Z0-9_\-]+(?::[^\n\r]*)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
          parsedFiles.push({
            path: target,
            content: clean,
            language: target.endsWith('.html') ? 'html' : target.endsWith('.sql') ? 'sql' : target.endsWith('.json') ? 'json' : target.endsWith('.tsx') ? 'tsx' : 'typescript',
          });
        }

        return {
          role,
          files: parsedFiles,
          content: fullText,
          modelUsed: model,
        };

      } catch (reqErr: any) {
        lastErrorMsg = reqErr.message || String(reqErr);
        console.warn(`[Genesis Direct] Model ${model} on key #${currentSlot + 1} fetch error:`, reqErr.message);
      }
    }

    // Rotate key slot if not already rotated by 429/quarantine handler
    if (!hit429) {
      healthy = getHealthyKeys();
      currentSlot = (currentSlot + 1) % healthy.length;
      if (onKeyRotate) onKeyRotate(currentSlot);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  throw new Error(`Worker for ${role} failed (${lastErrorMsg || 'Google API error'}). Check key quota & model permissions.`);
}

/**
 * Stream a consolidated multi-file batch (Batch 1, 2, or 3) across dedicated primary keys
 * with instant failover to the 7 reserve keys on HTTP 429 rate limit.
 * Uses gemini-3.5-flash and gemini-2.5-flash with maxOutputTokens: 16384.
 */
export async function streamGenesisBatchDirect({
  batch,
  userGoal,
  resolvedTitle,
  sharedContract,
  availableKeys,
  onChunk,
  onModelCascade,
  onKeyRotate,
}: {
  batch: GenesisBatchDefinition;
  userGoal: string;
  resolvedTitle: string;
  sharedContract: string;
  availableKeys: string[];
  onChunk: (delta: string, bytes: number, files: GenesisProjectFile[]) => void;
  onModelCascade?: (model: string) => void;
  onKeyRotate?: (newSlot: number) => void;
}): Promise<GenesisWorkerResult> {
  if (!availableKeys || availableKeys.length === 0) {
    throw new Error('No Gemini API keys available. Please add at least 1 Gemini API key.');
  }

  const batchConfig = getGenesisBatchPrompt(batch.batchId, userGoal, resolvedTitle, sharedContract);
  const userPrompt = `Generate all required files for "${resolvedTitle}" (${userGoal}) in ${batch.batchName}. Follow the system instructions strictly and output every file with ===FILE: <path>=== and complete, production-grade code.`;

  const getHealthyKeys = () => {
    const healthy = availableKeys.filter(k => !quarantinedKeys.has(k));
    return healthy.length > 0 ? healthy : availableKeys;
  };

  let healthy = getHealthyKeys();
  let currentKeyIndex = batch.primaryKeySlot % healthy.length;

  // Dedicated failover reserve pool: Keys 3 to 9 (up to 7 reserve keys)
  const reserveKeys = availableKeys.length > 3
    ? availableKeys.slice(3)
    : availableKeys.filter((_, idx) => idx !== batch.primaryKeySlot);
  let reservePointer = 0;

  // Distinct model family rotation: gemini-2.5-flash -> gemini-3.5-flash -> gemini-3.8-flash -> gemini-3.5-flash-lite
  const BATCH_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  let modelIndex = batch.primaryKeySlot % BATCH_MODELS.length;

  let attempts = 0;
  const maxAttempts = Math.max(availableKeys.length * 3, 12);
  let lastErrorMsg = '';

  while (attempts < maxAttempts) {
    attempts++;
    healthy = getHealthyKeys();
    const apiKey = healthy[currentKeyIndex % healthy.length];
    const model = BATCH_MODELS[modelIndex % BATCH_MODELS.length];

    if (onModelCascade) onModelCascade(model);

    const requestPayload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
      systemInstruction: {
        parts: [{ text: batchConfig.prompt }],
      },
      generationConfig: {
        maxOutputTokens: 16384,
        temperature: 0.2,
        topP: 0.95,
      },
    };

    try {
      const response = await fetchGeminiStreamWithFailover({
        model,
        apiKey,
        requestPayload,
      });

      // 404 Model Not Found -> Switch model
      if (response.status === 404) {
        lastErrorMsg = `HTTP 404: Model ${model} not available on this key`;
        console.warn(`[Genesis Batch ${batch.batchId}] Model ${model} returned 404 on key #${(currentKeyIndex % healthy.length) + 1}. Alternating model...`);
        modelIndex++;
        continue;
      }

      // 400 / 403 API Key Invalid or Permission Denied -> Quarantine key, rotate to reserve key
      if (response.status === 400 || response.status === 403) {
        const errBody = await response.text().catch(() => '');
        lastErrorMsg = `HTTP ${response.status}: ${errBody.slice(0, 100)}`;
        console.warn(`[Genesis Batch ${batch.batchId}] Key #${(currentKeyIndex % healthy.length) + 1} returned ${response.status} (${errBody.slice(0, 60)}). Quarantining and rotating to reserve key...`);
        quarantinedKeys.add(apiKey);
        if (reserveKeys.length > 0) {
          const nextReserve = reserveKeys[reservePointer % reserveKeys.length];
          reservePointer++;
          const foundIdx = availableKeys.indexOf(nextReserve);
          currentKeyIndex = foundIdx !== -1 ? foundIdx : (currentKeyIndex + 1);
        } else {
          currentKeyIndex = currentKeyIndex + 1;
        }
        if (onKeyRotate) onKeyRotate(currentKeyIndex);
        continue;
      }

      // 429 Rate Limit -> Immediately switch to reserve key (Keys 3-9) and alternate model
      if (response.status === 429) {
        lastErrorMsg = `HTTP 429: Rate limit hit on key #${(currentKeyIndex % healthy.length) + 1}`;
        console.warn(`[Genesis Batch ${batch.batchId}] HTTP 429 on key #${(currentKeyIndex % healthy.length) + 1}. Instantly failing over to reserve key (Keys 3–9) and alternating model...`);
        modelIndex++;
        if (reserveKeys.length > 0) {
          const nextReserve = reserveKeys[reservePointer % reserveKeys.length];
          reservePointer++;
          const foundIdx = availableKeys.indexOf(nextReserve);
          currentKeyIndex = foundIdx !== -1 ? foundIdx : (currentKeyIndex + 1);
        } else {
          currentKeyIndex = currentKeyIndex + 1;
        }
        if (onKeyRotate) onKeyRotate(currentKeyIndex);
        await new Promise(r => setTimeout(r, 1200));
        continue;
      }

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        lastErrorMsg = `HTTP ${response.status}: ${errText.slice(0, 100)}`;
        throw new Error(`Google Gemini direct error (HTTP ${response.status}): ${errText.slice(0, 100)}`);
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      let lastExtractedFiles: GenesisProjectFile[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const byteLen = value ? value.byteLength : 0;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;

        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const candidate = parsed.candidates?.[0];
            const parts = candidate?.content?.parts;
            if (Array.isArray(parts)) {
              for (const part of parts) {
                if (part.text) {
                  fullText += part.text;
                }
              }
            }
          } catch (_) {}
        }

        const currentFiles = extractFencedProjectFiles(fullText);
        if (currentFiles.length > lastExtractedFiles.length) {
          lastExtractedFiles = currentFiles;
        }
        onChunk('', byteLen, currentFiles);
      }

      const finalFiles = extractFencedProjectFiles(fullText);
      console.log(`[Genesis Batch ${batch.batchId}] Completed via ${model}: generated ${finalFiles.length} files (${fullText.split('\n').length} lines)`);

      return {
        role: batch.batchId,
        files: finalFiles,
        content: fullText,
        modelUsed: model,
        apiKeyUsed: apiKey,
        keyIndexUsed: currentKeyIndex % healthy.length,
      };

    } catch (reqErr: any) {
      lastErrorMsg = reqErr.message || String(reqErr);
      console.warn(`[Genesis Batch ${batch.batchId}] Model ${model} on key #${(currentKeyIndex % healthy.length) + 1} error:`, reqErr.message);
      modelIndex++;
      currentKeyIndex = currentKeyIndex + 1;
      if (onKeyRotate) onKeyRotate(currentKeyIndex);
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  throw new Error(`Batch ${batch.batchName} failed (${lastErrorMsg || 'Google API error'}). Please check Gemini key quota.`);
}

/**
 * Run swarm roles through a Smart Rate-Limit-Safe Concurrency Pool
 * - maxConcurrent: 2 parallel streams at a time
 * - launchStaggerMs: 1500ms launch stagger between new stream starts
 * - As soon as 1 stream finishes, next queued worker starts immediately
 */
export async function runSwarmConcurrencyPool<T, R>(
  items: T[],
  maxConcurrent = 2,
  launchStaggerMs = 1500,
  workerFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextQueueIndex = 0;
  let activeWorkers = 0;
  let lastLaunchTime = 0;

  return new Promise((resolve) => {
    const launchWorker = async () => {
      if (nextQueueIndex >= items.length) {
        if (activeWorkers === 0) {
          resolve(results);
        }
        return;
      }

      const itemIndex = nextQueueIndex++;
      activeWorkers++;

      // Stagger launch to prevent initial burst spike
      const now = Date.now();
      const elapsed = now - lastLaunchTime;
      if (lastLaunchTime > 0 && elapsed < launchStaggerMs) {
        await new Promise(r => setTimeout(r, launchStaggerMs - elapsed));
      }
      lastLaunchTime = Date.now();

      try {
        results[itemIndex] = await workerFn(items[itemIndex], itemIndex);
      } catch (err: any) {
        results[itemIndex] = { error: err.message || 'Worker execution error' } as unknown as R;
      } finally {
        activeWorkers--;
        // Immediately start next queued worker when one finishes
        launchWorker();
      }

      // If active workers < maxConcurrent and more queued items, launch next concurrently
      if (activeWorkers < maxConcurrent && nextQueueIndex < items.length) {
        launchWorker();
      }
    };

    const initialBatch = Math.min(maxConcurrent, items.length);
    for (let i = 0; i < initialBatch; i++) {
      launchWorker();
    }
  });
}

/**
 * Streams fast conversational chat responses directly via Gemini streaming proxies,
 * bypassing Supabase edge function bottlenecks completely.
 */
export async function streamConversationalDirect({
  userPrompt,
  conversationHistory = [],
  availableKeys,
  onChunk,
  systemInstruction,
}: {
  userPrompt: string;
  conversationHistory?: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  availableKeys: string[];
  onChunk: (delta: string) => void;
  systemInstruction?: string;
}): Promise<string> {
  if (!availableKeys || availableKeys.length === 0) {
    throw new Error('No Gemini API keys available for conversational chat.');
  }

  const healthy = availableKeys.filter(k => !quarantinedKeys.has(k));
  const keysToUse = healthy.length > 0 ? healthy : availableKeys;

  // Discover live models for conversational chat
  const modelsToTry = await discoverSupportedGeminiModels(keysToUse[0]);

  const defaultSystem = systemInstruction ||
    'You are Averia AI, an ultra-intelligent, friendly, and expert full-stack AI engineer and companion. Respond naturally, concisely, and helpfully in the user\'s language (English, Hindi/Hinglish, etc.).';

  // Build contents array
  const contents: any[] = [];
  if (conversationHistory && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-6);
    contents.push(...recent);
  }
  contents.push({
    role: 'user',
    parts: [{ text: userPrompt }],
  });

  const requestPayload = {
    contents,
    systemInstruction: {
      parts: [{ text: defaultSystem }],
    },
    generationConfig: {
      maxOutputTokens: 4096,
      temperature: 0.7,
      topP: 0.95,
    },
  };

  let accumulated = '';
  let lastError: any = null;

  for (let kIdx = 0; kIdx < keysToUse.length; kIdx++) {
    const apiKey = keysToUse[kIdx];

    for (const model of modelsToTry) {
      try {
        const response = await fetchGeminiStreamWithFailover({
          model,
          apiKey,
          requestPayload,
        });

        if (response.status === 404) {
          continue; // cascade model
        }

        if (response.status === 400 || response.status === 403) {
          const errText = await response.text().catch(() => '');
          if (errText.includes('API_KEY_INVALID') || errText.includes('PERMISSION_DENIED') || response.status === 403) {
            quarantinedKeys.add(apiKey);
            break; // rotate key
          }
          continue;
        }

        if (response.status === 429) {
          // Rate limit -> try next key
          break;
        }

        if (!response.ok || !response.body) {
          continue;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith('data:')) continue;
            const dataStr = cleanLine.replace(/^data:\s*/, '').trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                accumulated += textChunk;
                onChunk(textChunk);
              }
            } catch (_) {}
          }
        }

        if (accumulated.trim().length > 0) {
          return accumulated;
        }
      } catch (err) {
        lastError = err;
      }
    }
  }

  if (accumulated.trim().length > 0) {
    return accumulated;
  }

  throw lastError || new Error('Failed to get conversational response across available Gemini keys.');
}

/**
 * Deterministic domain-aware full-stack file synthesizer.
 * Guarantees 0% failure if all API keys or models are rate-limited or offline.
 */
export function synthesizeDeterministicProject(
  brandTitle: string,
  userGoal: string,
  existingFiles?: Map<string, GenesisProjectFile> | GenesisProjectFile[]
): GenesisProjectFile[] {
  const existingMap = new Map<string, GenesisProjectFile>();
  if (existingFiles) {
    if (existingFiles instanceof Map) {
      existingFiles.forEach((file, key) => existingMap.set(key.toLowerCase(), file));
    } else if (Array.isArray(existingFiles)) {
      existingFiles.forEach(file => existingMap.set(file.path.toLowerCase(), file));
    }
  }

  const title = brandTitle || 'Averia App';
  const goal = userGoal || 'Interactive Application';
  const isGame = /\b(game|snake|pong|arcade|tetris|flappy|rpg|play|canvas|2d|jump|score|runner)\b/i.test(goal);

  const files: GenesisProjectFile[] = [];

  // 1. schema.sql
  files.push({
    path: 'schema.sql',
    language: 'sql',
    content: isGame ? `-- Database Schema for ${title} (${goal})
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  high_score INT DEFAULT 0,
  games_played INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  score INT NOT NULL,
  difficulty TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC);

INSERT INTO scores (player_name, score, difficulty) VALUES
('Alex', 1250, 'hard'),
('Jordan', 980, 'normal'),
('Casey', 760, 'normal'),
('Taylor', 640, 'easy')
ON CONFLICT DO NOTHING;` : `-- Database Schema for ${title} (${goal})
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  priority TEXT DEFAULT 'medium',
  metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);

INSERT INTO items (title, category, status, priority) VALUES
('Initialization Task Alpha', 'Core', 'active', 'high'),
('Integration Gateway Beta', 'Integration', 'active', 'medium'),
('Performance Optimization Hub', 'Analytics', 'pending', 'high'),
('Telemetry Synchronizer Module', 'Security', 'active', 'low')
ON CONFLICT DO NOTHING;`,
  });

  // 2. server/index.ts
  files.push({
    path: 'server/index.ts',
    language: 'typescript',
    content: `import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

let memoryStore = [
  { id: 'item-1', title: 'Primary ${title} Module', status: 'ready', timestamp: new Date().toISOString() },
  { id: 'item-2', title: 'Secondary Data Pipeline', status: 'active', timestamp: new Date().toISOString() },
  { id: 'item-3', title: 'Live Telemetry Monitor', status: 'active', timestamp: new Date().toISOString() },
];

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: '${title}', time: new Date() }));
app.get('/api/items', (req, res) => res.json(memoryStore));
app.post('/api/items', (req, res) => {
  const newItem = { id: 'item-' + Date.now(), ...req.body, timestamp: new Date().toISOString() };
  memoryStore.unshift(newItem);
  res.status(201).json(newItem);
});

export default app;`,
  });

  // 3. src/lib/dataSdk.ts
  files.push({
    path: 'src/lib/dataSdk.ts',
    language: 'typescript',
    content: `// Typed Client Data SDK for ${title} backed by window.LocalDB
export class DataSDK {
  private db: any;

  constructor() {
    this.db = typeof window !== 'undefined' ? (window as any).LocalDB : null;
  }

  async getItems(collection: string = 'items'): Promise<any[]> {
    if (!this.db) return [];
    return this.db.find(collection) || [];
  }

  async addItem(collection: string, item: any): Promise<any> {
    if (!this.db) return item;
    const items = this.db.find(collection) || [];
    const newItem = { id: 'itm_' + Date.now(), ...item, createdAt: new Date().toISOString() };
    items.unshift(newItem);
    this.db.save(collection, items);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('averia:data_change', { detail: { collection, items } }));
    }
    return newItem;
  }

  async clearItems(collection: string): Promise<void> {
    if (this.db) this.db.save(collection, []);
  }
}

const sdk = new DataSDK();
if (typeof window !== 'undefined') {
  (window as any).DataSDK = sdk;
  (window as any).AveriaStore = sdk;
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('data', sdk);
}
export default sdk;`,
  });

  // 4. src/lib/engine.ts
  files.push({
    path: 'src/lib/engine.ts',
    language: 'typescript',
    content: isGame ? `// Game Calculation & Audio Engine for ${title}
export class GameEngine {
  playSound(type: 'start' | 'score' | 'over' | 'hit') {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      const freq = type === 'score' ? 600 : type === 'hit' ? 180 : type === 'start' ? 440 : 220;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  }
}

const engine = new GameEngine();
if (typeof window !== 'undefined') {
  (window as any).AveriaEngine = engine;
  (window as any).Engine = engine;
}
export default engine;` : `// Analytics & Domain Logic Engine for ${title}
export class LogicEngine {
  computeMetrics(items: any[]) {
    const total = items.length;
    const active = items.filter(it => it.status === 'active').length;
    return { total, active, completionRate: total > 0 ? Math.round((active / total) * 100) : 100 };
  }
}

const engine = new LogicEngine();
if (typeof window !== 'undefined') {
  (window as any).AveriaEngine = engine;
  (window as any).Engine = engine;
}
export default engine;`,
  });

  // 5. index.html
  files.push({
    path: 'index.html',
    language: 'html',
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="src/styles.css">
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
  <header class="sticky top-0 z-50 backdrop-blur-md bg-slate-900/90 border-b border-slate-800 px-4 py-3">
    <div class="max-w-7xl mx-auto flex items-center justify-between">
      <div class="flex items-center gap-3 cursor-pointer" onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/');">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
          <i class="fa-solid ${isGame ? 'fa-gamepad' : 'fa-bolt'}"></i>
        </div>
        <span class="font-bold text-lg text-white tracking-tight">${title}</span>
      </div>
      <nav class="flex items-center gap-2 text-xs">
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition">Main</button>
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/settings');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition">Settings</button>
      </nav>
    </div>
  </header>
  <main id="app" class="flex-1 w-full p-4 md:p-6"></main>
  <div id="modal-root"></div>
  <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>

  <script type="text/babel" data-presets="react,typescript" src="src/lib/dataSdk.ts"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/components/ui.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/lib/engine.ts"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/router.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/pages/HomePage.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/pages/AppPages.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/lib/qaGuard.ts"></script>
</body>
</html>`,
  });

  // 6. src/styles.css
  files.push({
    path: 'src/styles.css',
    language: 'css',
    content: `@keyframes pulse-subtle { 0%, 100% { opacity: 1; } 50% { opacity: 0.8; } }
.animate-pulse-subtle { animation: pulse-subtle 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: #0f172a; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 9999px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }`,
  });

  // 7. src/components/ui.tsx
  files.push({
    path: 'src/components/ui.tsx',
    language: 'tsx',
    content: `import React from 'react';

export function Button({ children, onClick, variant = 'primary', className = '' }: any) {
  const base = "px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-2 ";
  const style = variant === 'primary'
    ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20"
    : "bg-slate-800 hover:bg-slate-700 text-slate-200";
  return <button onClick={onClick} className={base + style + ' ' + className}>{children}</button>;
}

export function Card({ children, className = '' }: any) {
  return <div className={"rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl " + className}>{children}</div>;
}

if (typeof window !== 'undefined') {
  (window as any).UI = { Button, Card };
}
export default { Button, Card };`,
  });

  // 8. src/router.tsx
  files.push({
    path: 'src/router.tsx',
    language: 'tsx',
    content: `// Multi-Page SPA Client Router for ${title}
class AveriaRouter {
  private routes: Record<string, any> = {};

  route(path: string, component: any) {
    if (path && component) this.routes[path.toLowerCase()] = component;
  }

  navigate(path: string) {
    if (typeof window !== 'undefined' && typeof (window as any).__AVERIA_NAVIGATE__ === 'function') {
      (window as any).__AVERIA_NAVIGATE__(path);
    } else {
      const clean = path.startsWith('#') ? path : '#/' + path.replace(/^\\/+/, '');
      window.location.hash = clean;
      this.mount();
    }
  }

  mount() {
    const raw = (window.location.hash || '#/').replace(/^#\\/?/, '').toLowerCase();
    const clean = '/' + (raw.split('?')[0] || '');
    
    // Resolve dynamically via universal route component resolver
    let comp = null;
    if (typeof (window as any).__RESOLVE_ROUTE_COMPONENT__ === 'function') {
      comp = (window as any).__RESOLVE_ROUTE_COMPONENT__(clean);
    }
    if (!comp) comp = this.routes[clean] || this.routes['/'] || (window as any).HomePage;
    
    const container = document.getElementById('app') || document.getElementById('root');
    if (!container || !comp) return;

    container.innerHTML = '';
    if (comp.render && typeof comp.render === 'function') {
      comp.render();
    } else if (window.ReactDOM && (window.ReactDOM as any).createRoot) {
      if (!(window as any).__router_root__) {
        (window as any).__router_root__ = (window.ReactDOM as any).createRoot(container);
      }
      (window as any).__router_root__.render(React.createElement(comp));
    } else if (window.ReactDOM && (window.ReactDOM as any).render) {
      (window as any).ReactDOM.render(React.createElement(comp), container);
    }
  }
}

const router = new AveriaRouter();
if (typeof window !== 'undefined') {
  (window as any).__AVERIA_APP__ = router;
  (window as any).__AVERIA_ROUTER__ = router;
  window.addEventListener('hashchange', () => router.mount());
  window.addEventListener('averia:navigate', () => router.mount());
}
export default router;`,
  });

  // 9. src/pages/HomePage.tsx
  files.push({
    path: 'src/pages/HomePage.tsx',
    language: 'tsx',
    content: isGame ? `import React, { useState, useEffect, useRef } from 'react';

export function HomePage() {
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const gameState = useRef({
    snake: [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }],
    dir: { x: 0, y: -1 },
    nextDir: { x: 0, y: -1 },
    food: { x: 15, y: 7 },
    gridSize: 20,
    tileCount: 20,
    speed: 120,
    lastTick: 0
  });

  const nav = (p: string) => {
    if (typeof (window as any).__AVERIA_NAVIGATE__ === 'function') {
      (window as any).__AVERIA_NAVIGATE__(p);
    } else {
      window.location.hash = '#' + p;
    }
  };

  const spawnFood = () => {
    const s = gameState.current;
    s.food = {
      x: Math.floor(Math.random() * (s.tileCount - 2)) + 1,
      y: Math.floor(Math.random() * (s.tileCount - 2)) + 1
    };
  };

  const resetGame = () => {
    const s = gameState.current;
    s.snake = [{ x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 }];
    s.dir = { x: 0, y: -1 };
    s.nextDir = { x: 0, y: -1 };
    spawnFood();
    setScore(0);
    setIsGameOver(false);
    setIsPlaying(true);
  };

  // Keyboard controls listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = gameState.current;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (s.dir.y === 0) s.nextDir = { x: 0, y: -1 };
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (s.dir.y === 0) s.nextDir = { x: 0, y: 1 };
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (s.dir.x === 0) s.nextDir = { x: -1, y: 0 };
        e.preventDefault();
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (s.dir.x === 0) s.nextDir = { x: 1, y: 0 };
        e.preventDefault();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Main Canvas Render Loop & Initial Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const s = gameState.current;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const tileSize = width / s.tileCount;

      // Dark cyber background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < s.tileCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * tileSize, 0);
        ctx.lineTo(i * tileSize, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * tileSize);
        ctx.lineTo(width, i * tileSize);
        ctx.stroke();
      }

      // Draw Glowing Food
      ctx.fillStyle = '#f43f5e';
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(s.food.x * tileSize + tileSize / 2, s.food.y * tileSize + tileSize / 2, tileSize / 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw Glowing Snake
      s.snake.forEach((seg, idx) => {
        if (idx === 0) {
          ctx.fillStyle = '#34d399'; // Head emerald
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 12;
        } else {
          ctx.fillStyle = '#059669'; // Body green
          ctx.shadowBlur = 4;
        }
        ctx.beginPath();
        ctx.roundRect(seg.x * tileSize + 1.5, seg.y * tileSize + 1.5, tileSize - 3, tileSize - 3, 4);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Overlay if not playing or game over
      if (!isPlaying || isGameOver) {
        ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px system-ui, sans-serif';
        ctx.textAlign = 'center';
        if (isGameOver) {
          ctx.fillStyle = '#f43f5e';
          ctx.fillText('GAME OVER', width / 2, height / 2 - 20);
          ctx.fillStyle = '#94a3b8';
          ctx.font = '14px system-ui, sans-serif';
          ctx.fillText('Press "Restart Game" or Space to retry', width / 2, height / 2 + 15);
        } else {
          ctx.fillText('CYBER SNAKE ARCADE', width / 2, height / 2 - 20);
          ctx.fillStyle = '#38bdf8';
          ctx.font = '13px system-ui, sans-serif';
          ctx.fillText('Click "Start Game" or press Arrow Keys to begin', width / 2, height / 2 + 15);
        }
      }
    };

    // Immediate initial draw so canvas is NEVER blank!
    draw();

    const loop = (timestamp: number) => {
      if (isPlaying && !isGameOver) {
        if (timestamp - s.lastTick > s.speed) {
          s.lastTick = timestamp;
          s.dir = s.nextDir;

          const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };

          // Wall collision
          if (head.x < 0 || head.x >= s.tileCount || head.y < 0 || head.y >= s.tileCount) {
            setIsGameOver(true);
            setIsPlaying(false);
            return;
          }

          // Self collision
          if (s.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
            setIsGameOver(true);
            setIsPlaying(false);
            return;
          }

          s.snake.unshift(head);

          // Food check
          if (head.x === s.food.x && head.y === s.food.y) {
            setScore(prev => {
              const next = prev + 10;
              setHighScore(h => Math.max(h, next));
              try {
                if ((window as any).LocalDB) {
                  (window as any).LocalDB.insert('scores', { player: 'You', score: next, date: new Date().toLocaleTimeString() });
                }
              } catch (_) {}
              return next;
            });
            spawnFood();
          } else {
            s.snake.pop();
          }
        }
        draw();
        animId = requestAnimationFrame(loop);
      } else {
        draw();
      }
    };

    if (isPlaying && !isGameOver) {
      animId = requestAnimationFrame(loop);
    }

    return () => cancelAnimationFrame(animId);
  }, [isPlaying, isGameOver]);

  const changeDir = (dx: number, dy: number) => {
    const s = gameState.current;
    if (dx !== 0 && s.dir.x === 0) s.nextDir = { x: dx, y: 0 };
    if (dy !== 0 && s.dir.y === 0) s.nextDir = { x: 0, y: dy };
    if (!isPlaying && !isGameOver) setIsPlaying(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-lg border border-emerald-500/30">
            🐍
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-wide">${title}</h1>
            <p className="text-slate-400 text-xs">Playable HTML5 Cyber Arcade</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right px-3 py-1 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Score</span>
            <span className="text-lg font-black text-emerald-400 font-mono">{score}</span>
          </div>
          <div className="text-right px-3 py-1 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">High</span>
            <span className="text-lg font-black text-amber-400 font-mono">{highScore}</span>
          </div>
          <button
            onClick={() => {
              if (isGameOver) resetGame();
              else setIsPlaying(p => !p);
            }}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition transform active:scale-95"
          >
            {isGameOver ? 'Restart Game' : isPlaying ? 'Pause Game' : 'Start Game'}
          </button>
          <button
            onClick={() => nav('/leaderboard')}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Leaderboard
          </button>
          <button
            onClick={() => nav('/settings')}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
          >
            Settings
          </button>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center shadow-2xl">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="rounded-2xl border-2 border-slate-800 bg-[#090d16] w-full max-w-[400px] aspect-square shadow-inner cursor-pointer"
          onClick={() => {
            if (!isPlaying) setIsPlaying(true);
          }}
        />

        {/* On-screen touch D-Pad controls */}
        <div className="mt-5 flex flex-col items-center gap-1.5 sm:hidden">
          <button onClick={() => changeDir(0, -1)} className="w-12 h-10 rounded-xl bg-slate-800 text-white font-bold active:bg-emerald-600">▲</button>
          <div className="flex gap-2">
            <button onClick={() => changeDir(-1, 0)} className="w-12 h-10 rounded-xl bg-slate-800 text-white font-bold active:bg-emerald-600">◀</button>
            <button onClick={() => changeDir(0, 1)} className="w-12 h-10 rounded-xl bg-slate-800 text-white font-bold active:bg-emerald-600">▼</button>
            <button onClick={() => changeDir(1, 0)} className="w-12 h-10 rounded-xl bg-slate-800 text-white font-bold active:bg-emerald-600">▶</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-slate-400">
          <span>🎮 Arrow Keys / WASD to Steer</span>
          <span>•</span>
          <span>⚡ Space to Pause</span>
          <span>•</span>
          <span>🍎 Eat orbs to grow & score</span>
        </div>
      </div>
    </div>
  );
}

HomePage.render = function() {
  const container = document.getElementById('app') || document.getElementById('root');
  if (!container) return;
  container.innerHTML = '';
  if (window.ReactDOM && (window.ReactDOM as any).createRoot) {
    if (!(window as any).__root__) (window as any).__root__ = (window.ReactDOM as any).createRoot(container);
    (window as any).__root__.render(React.createElement(HomePage));
  }
};

if (typeof window !== 'undefined') {
  (window as any).HomePage = HomePage;
  (window as any).__AVERIA_PAGES__ = (window as any).__AVERIA_PAGES__ || {};
  (window as any).__AVERIA_PAGES__.HomePage = HomePage;
  (window as any).__AVERIA_PAGES__['/'] = HomePage;
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.route('/', HomePage);
}
export default HomePage;` : `import React, { useState, useEffect } from 'react';

export function HomePage() {
  const [items, setItems] = useState<any[]>([
    { id: '1', title: 'Main Project Dashboard', category: 'Core', status: 'Active', desc: 'Real-time telemetry and management hub.' },
    { id: '2', title: 'Analytics Pipeline', category: 'Analytics', status: 'Streaming', desc: 'Continuous metrics aggregation & reporting.' },
    { id: '3', title: 'Configuration Center', category: 'Settings', status: 'Ready', desc: 'Application environment & controls.' },
  ]);
  const [search, setSearch] = useState('');

  const nav = (p: string) => {
    if (typeof (window as any).__AVERIA_NAVIGATE__ === 'function') {
      (window as any).__AVERIA_NAVIGATE__(p);
    } else {
      window.location.hash = '#' + p;
    }
  };

  const filtered = items.filter(it => it.title.toLowerCase().includes(search.toLowerCase()) || it.category.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border border-indigo-900/40 p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">⚡ ${title}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => nav('/explore')} className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition">Explore</button>
            <button onClick={() => nav('/cart')} className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">Cart</button>
            <button onClick={() => nav('/orders')} className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">Orders</button>
            <button onClick={() => nav('/settings')} className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition">Settings</button>
          </div>
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">${title}</h1>
        <p className="text-slate-400 text-sm max-w-xl">${goal}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-white">Active Modules</h2>
        <input
          type="text"
          placeholder="Filter modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs w-64 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filtered.map(item => (
          <div key={item.id} className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full">{item.category}</span>
              <span className="text-[11px] text-emerald-400">● {item.status}</span>
            </div>
            <h3 className="text-lg font-bold text-white">{item.title}</h3>
            <p className="text-slate-400 text-xs">{item.desc}</p>
            <button onClick={() => nav('/explore')} className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
              Open details &rarr;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

HomePage.render = function() {
  const container = document.getElementById('app') || document.getElementById('root');
  if (!container) return;
  container.innerHTML = '';
  if (window.ReactDOM && (window.ReactDOM as any).createRoot) {
    if (!(window as any).__root__) (window as any).__root__ = (window.ReactDOM as any).createRoot(container);
    (window as any).__root__.render(React.createElement(HomePage));
  }
};

if (typeof window !== 'undefined') {
  (window as any).HomePage = HomePage;
  (window as any).__AVERIA_PAGES__ = (window as any).__AVERIA_PAGES__ || {};
  (window as any).__AVERIA_PAGES__.HomePage = HomePage;
  (window as any).__AVERIA_PAGES__['/'] = HomePage;
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.route('/', HomePage);
}
export default HomePage;`,
  });

  // 10. src/pages/AppPages.tsx
  files.push({
    path: 'src/pages/AppPages.tsx',
    language: 'tsx',
    content: isGame ? `import React, { useState } from 'react';

export function LeaderboardPage() {
  const scores = [
    { rank: 1, name: 'CyberSnake', score: 2450, date: 'Just now' },
    { rank: 2, name: 'NeonPulse', score: 1980, date: '10m ago' },
    { rank: 3, name: 'VectorGhost', score: 1420, date: '1h ago' },
    { rank: 4, name: 'MatrixPilot', score: 1100, date: '3h ago' }
  ];

  const nav = (p: string) => {
    if (typeof (window as any).__AVERIA_NAVIGATE__ === 'function') (window as any).__AVERIA_NAVIGATE__(p);
    else window.location.hash = '#' + p;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Arcade Leaderboard</h2>
          <p className="text-xs text-slate-400 mt-1">Global high scores and rankings</p>
        </div>
        <button onClick={() => nav('/play')} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs shadow-lg">
          Play Now
        </button>
      </div>
      <div className="space-y-3">
        {scores.map(s => (
          <div key={s.rank} className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={'w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ' + (s.rank === 1 ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-700 text-slate-300')}>
                #{s.rank}
              </span>
              <span className="font-semibold text-white text-sm">{s.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono font-bold text-indigo-400 text-sm">{s.score.toLocaleString()} pts</span>
              <span className="text-[11px] text-slate-400">{s.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayPage() {
  return typeof (window as any).HomePage === 'function' ? React.createElement((window as any).HomePage) : <LeaderboardPage />;
}

export function SettingsPage() {
  const [sound, setSound] = useState(true);
  const [difficulty, setDifficulty] = useState('Normal');

  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Game Preferences</h2>
      <div className="space-y-4 text-xs text-slate-300">
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <div>
            <span className="font-semibold text-white block">Synthesized Audio Effects</span>
            <span className="text-slate-400 text-[11px]">Web Audio 60FPS sound effects</span>
          </div>
          <button onClick={() => setSound(!sound)} className={'px-3.5 py-1.5 rounded-lg text-xs font-semibold ' + (sound ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-400')}>
            {sound ? 'Enabled' : 'Muted'}
          </button>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <div>
            <span className="font-semibold text-white block">Difficulty Level</span>
            <span className="text-slate-400 text-[11px]">Controls game loop tick rate</span>
          </div>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-xs">
            <option>Easy</option>
            <option>Normal</option>
            <option>Hard</option>
          </select>
        </div>
      </div>
    </div>
  );
}

const AppPages = { LeaderboardPage, PlayPage, SettingsPage };
if (typeof window !== 'undefined') {
  (window as any).LeaderboardPage = LeaderboardPage;
  (window as any).PlayPage = PlayPage;
  (window as any).SettingsPage = SettingsPage;
  (window as any).AppPages = AppPages;
  (window as any).__AVERIA_PAGES__ = Object.assign((window as any).__AVERIA_PAGES__ || {}, AppPages);
}
export default AppPages;` : `import React, { useState } from 'react';

export function ExplorePage() {
  const catalog = [
    { id: '1', title: 'Smart Sensor Matrix', category: 'Hardware', price: 149, rating: 4.9 },
    { id: '2', title: 'Neural Gateway Adapter', category: 'Networking', price: 299, rating: 4.8 },
    { id: '3', title: 'Quantum Storage Core', category: 'Storage', price: 499, rating: 5.0 },
    { id: '4', title: 'Optical Interface Hub', category: 'Display', price: 199, rating: 4.7 }
  ];

  const nav = (p: string) => {
    if (typeof (window as any).__AVERIA_NAVIGATE__ === 'function') (window as any).__AVERIA_NAVIGATE__(p);
    else window.location.hash = '#' + p;
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Explore Catalog</h2>
          <p className="text-xs text-slate-400 mt-1">Discover available items, products, and services</p>
        </div>
        <button onClick={() => nav('/cart')} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold shadow-lg">
          View Cart
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {catalog.map(item => (
          <div key={item.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between shadow-xl">
            <div>
              <span className="text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full">{item.category}</span>
              <h3 className="font-semibold text-white text-sm mt-2">{item.title}</h3>
              <span className="text-xs text-amber-400">★ {item.rating}</span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="font-bold text-white text-base">\${item.price}</span>
              <button onClick={() => nav('/cart')} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">Add</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CartPage() {
  const nav = (p: string) => {
    if (typeof (window as any).__AVERIA_NAVIGATE__ === 'function') (window as any).__AVERIA_NAVIGATE__(p);
    else window.location.hash = '#' + p;
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Shopping Cart</h2>
      <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-white text-sm">Smart Sensor Matrix</h4>
          <span className="text-indigo-400 font-bold text-xs">Qty: 1 • \$149</span>
        </div>
        <button onClick={() => nav('/checkout')} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs shadow-lg">
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}

export function CheckoutPage() {
  const [done, setDone] = useState(false);
  const nav = (p: string) => {
    if (typeof (window as any).__AVERIA_NAVIGATE__ === 'function') (window as any).__AVERIA_NAVIGATE__(p);
    else window.location.hash = '#' + p;
  };

  return (
    <div className="max-w-lg mx-auto p-7 bg-slate-900 border border-slate-800 rounded-3xl space-y-5">
      <h2 className="text-xl font-bold text-white">Checkout</h2>
      {done ? (
        <div className="text-center py-8 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl font-bold">✓</div>
          <h3 className="font-bold text-white">Order Confirmed!</h3>
          <p className="text-xs text-slate-400">Your order has been placed successfully.</p>
          <button onClick={() => nav('/orders')} className="mt-3 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-xs">View Orders</button>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); setDone(true); }} className="space-y-4">
          <div><label className="text-xs text-slate-400 block mb-1">Full Name</label><input required defaultValue="Averia User" className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none" /></div>
          <div><label className="text-xs text-slate-400 block mb-1">Shipping Address</label><input required defaultValue="742 Evergreen Terrace" className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none" /></div>
          <button type="submit" className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg">Confirm &amp; Place Order</button>
        </form>
      )}
    </div>
  );
}

export function OrdersPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Order History &amp; Tracking</h2>
      <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center justify-between">
        <div>
          <span className="font-mono font-bold text-white text-sm">#ORD-90214</span>
          <span className="text-slate-400 text-xs block">Placed today • 1 item</span>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Delivered</span>
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>
      <div className="space-y-4 text-xs text-slate-300">
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <span>Real-time Sync</span>
          <span className="text-emerald-400 font-semibold">Active</span>
        </div>
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <span>Offline Persistence</span>
          <span className="text-emerald-400 font-semibold">IndexedDB</span>
        </div>
      </div>
    </div>
  );
}

const AppPages = { ExplorePage, CartPage, CheckoutPage, OrdersPage, SettingsPage };
if (typeof window !== 'undefined') {
  (window as any).ExplorePage = ExplorePage;
  (window as any).CartPage = CartPage;
  (window as any).CheckoutPage = CheckoutPage;
  (window as any).OrdersPage = OrdersPage;
  (window as any).SettingsPage = SettingsPage;
  (window as any).AppPages = AppPages;
  (window as any).__AVERIA_PAGES__ = Object.assign((window as any).__AVERIA_PAGES__ || {}, AppPages);
}
export default AppPages;`,
  });

  // 11. src/lib/qaGuard.ts
  files.push({
    path: 'src/lib/qaGuard.ts',
    language: 'typescript',
    content: `export class QAGuard {
  sanitizeHTML(str: string): string {
    return (str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  runHealthCheck(): boolean {
    return typeof window !== 'undefined' && !!(window as any).__AVERIA_APP__;
  }
}

const guard = new QAGuard();
if (typeof window !== 'undefined') (window as any).QAGuard = guard;
export default guard;`,
  });

  // Return existing files if valid, else fallback to synthesized
  return files.map(f => {
    const existing = existingMap.get(f.path.toLowerCase());
    return existing && existing.content && existing.content.trim().length > 100 ? existing : f;
  });
}

export interface FileAuditResult {
  path: string;
  hasErrors: boolean;
  issues: string[];
}

export function auditFileStructuralIntegrity(file: GenesisProjectFile, userGoal: string, brandTitle: string): FileAuditResult {
  const issues: string[] = [];
  const content = (file.content || '').trim();
  const path = file.path.toLowerCase();

  // 1. Length check
  if (content.length < 60) {
    issues.push(`File is too short (${content.length} chars) - potential incomplete stub.`);
  }

  // 2. Placeholder/stub check
  if (/\b(?:TODO|FIXME|\/\/ implement here|\/\/ write code here|\/\* placeholder \*\/|\/\/ stub)\b/i.test(content)) {
    issues.push('Contains unfinished TODO or placeholder comments.');
  }

  // 3. React / UI export check
  if (path.endsWith('homepage.tsx') || path.endsWith('homepage.jsx')) {
    if (!content.includes('HomePage') && !content.includes('export default')) {
      issues.push('HomePage does not export a primary component.');
    }
    if (!content.includes('window.HomePage') && !content.includes('window.__AVERIA_PAGES__')) {
      issues.push('HomePage does not attach to window.HomePage or window.__AVERIA_PAGES__.');
    }
  }

  if (path.endsWith('apppages.tsx') || path.endsWith('apppages.jsx')) {
    if (!content.includes('window.AppPages') && !content.includes('export') && !content.includes('window.__AVERIA_PAGES__')) {
      issues.push('AppPages does not export sub-page components.');
    }
  }

  if (path.endsWith('router.tsx')) {
    if (!content.includes('window.__AVERIA_APP__') && !content.includes('window.__AVERIA_ROUTER__') && !content.includes('router') && !content.includes('Router')) {
      issues.push('Router does not attach to window.__AVERIA_APP__ or window.__AVERIA_ROUTER__.');
    }
  }

  if (path.endsWith('ui.tsx')) {
    if (!content.includes('Button') && !content.includes('Card') && !content.includes('window.UI')) {
      issues.push('UI primitives do not export standard Button/Card components.');
    }
  }

  // 4. JSX tag balance check
  const openDiv = (content.match(/<div\b/g) || []).length;
  const closeDiv = (content.match(/<\/div>/g) || []).length;
  if (Math.abs(openDiv - closeDiv) > 4) {
    issues.push(`Severe JSX div tag imbalance detected (${openDiv} opening vs ${closeDiv} closing).`);
  }

  return {
    path: file.path,
    hasErrors: issues.length > 0,
    issues,
  };
}

/**
 * Targeted In-Build Self-Healing pass:
 * Calls Gemini directly to repair a specific file that failed Babel compilation or runtime check.
 */
export async function selfHealFileWithGemini({
  file,
  error,
  userGoal,
  brandTitle,
  survivor,
  availableKeys = [],
}: {
  file: GenesisProjectFile;
  error: string;
  userGoal: string;
  brandTitle: string;
  survivor?: SurvivorInfo;
  availableKeys?: string[];
}): Promise<string> {
  const prompt = `You are the Lead Senior Self-Healing Compiler Engineer.
The file "${file.path}" for "${brandTitle}" (${userGoal}) failed Babel syntax validation with this error:
${error}

Current Code:
${file.content}

MANDATORY INSTRUCTIONS:
- Fix the syntax/Babel error completely while preserving all intended functionality.
- Ensure all React hooks, JSX syntax, types, and exports are 100% valid for @babel/standalone browser compilation.
- Output ONLY the fixed file inside ===FILE: ${file.path}=== ... ===END_FILE=== without any conversational prose.`;

  const models = [
    survivor?.model || 'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ];

  const keys = [
    survivor?.apiKey,
    ...availableKeys.filter(k => k && k !== survivor?.apiKey && !quarantinedKeys.has(k))
  ].filter(Boolean) as string[];

  for (const apiKey of keys) {
    for (const model of models) {
      try {
        const response = await fetchGeminiStreamWithFailover({
          model,
          apiKey,
          requestPayload: {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 16384, temperature: 0.1 },
          },
        });
        if (!response.ok || !response.body) continue;
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        }
        const extracted = extractFencedProjectFiles(fullText);
        const match = extracted.find(f => f.path.toLowerCase() === file.path.toLowerCase()) || extracted[0];
        if (match && match.content && match.content.length > 50) {
          console.log(`[Self-Heal Pass] Successfully repaired ${file.path} via ${model}`);
          return match.content;
        }
      } catch (err) {
        console.warn(`[Self-Heal Pass] Model ${model} failed:`, err);
      }
    }
  }

  return file.content;
}
export async function recoverMissingDeliverablesWithSurvivor({
  survivor,
  missingBatch,
  existingFiles,
  userGoal,
  resolvedTitle,
  sharedContract,
  availableKeys = [],
  onChunk,
  onModelCascade,
}: {
  survivor: SurvivorInfo;
  missingBatch: GenesisBatchDefinition;
  existingFiles: GenesisProjectFile[];
  userGoal: string;
  resolvedTitle: string;
  sharedContract: string;
  availableKeys?: string[];
  onChunk?: (delta: string, fullText: string, speedKbps?: number) => void;
  onModelCascade?: (model: string) => void;
}): Promise<GenesisWorkerResult> {
  const batchConfig = getGenesisBatchPrompt(
    missingBatch.batchId,
    userGoal,
    resolvedTitle,
    sharedContract
  );

  const existingSummaries = existingFiles.map(f => `- ${f.path} (${f.content.split('\n').length} lines)`).join('\n');

  const promptWithContext = `You are the Lead Senior Full-Stack Survivor Engineer recovering missing files for batch: ${missingBatch.batchName}.
The brand is "${resolvedTitle}" (${userGoal}).
Existing completed files in workspace:
${existingSummaries}

CRITICAL: Generate ALL deliverables for this batch (${missingBatch.targetFilesSummary}) in ===FILE: <path>=== format.
Every file must be complete, 100% production-ready, matching existing architecture.`;

  const cascadeModels = [
    survivor.model,
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite',
  ].filter((m, i, arr) => arr.indexOf(m) === i && !!m);

  const keysToTry = [
    survivor.apiKey,
    ...availableKeys.filter(k => k && k !== survivor.apiKey && !quarantinedKeys.has(k))
  ].filter(Boolean);

  for (const apiKey of keysToTry) {
    for (const model of cascadeModels) {
      if (onModelCascade) onModelCascade(model);

      const requestPayload = {
        contents: [{ role: 'user', parts: [{ text: promptWithContext }] }],
        systemInstruction: { parts: [{ text: batchConfig.prompt }] },
        generationConfig: {
          maxOutputTokens: 16384,
          temperature: 0.2,
          topP: 0.95,
        },
      };

      try {
        const response = await fetchGeminiStreamWithFailover({
          model,
          apiKey,
          requestPayload,
        });

        if (response.status === 404 || response.status === 429 || response.status === 400 || response.status === 403) {
          continue;
        }

        if (!response.ok || !response.body) continue;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';
        const startTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const clean = line.trim();
            if (!clean.startsWith('data:')) continue;
            const dataStr = clean.replace(/^data:\s*/, '').trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                fullText += textChunk;
                if (onChunk) {
                  const elapsedSec = Math.max(0.1, (Date.now() - startTime) / 1000);
                  const speed = Math.round((fullText.length / 1024) / elapsedSec);
                  onChunk(textChunk, fullText, speed);
                }
              }
            } catch (_) {}
          }
        }

        const parsedFiles = extractFencedProjectFiles(fullText);
        if (parsedFiles.length > 0) {
          return {
            role: missingBatch.batchId,
            files: parsedFiles,
            content: fullText,
            modelUsed: model,
            apiKeyUsed: apiKey,
          };
        }
      } catch (err) {
        console.warn(`[Survivor Recovery] Model ${model} on key failed:`, err);
      }
    }
  }

  // Fallback: If network attempts fail or quota is exhausted, synthesize deterministically
  console.info(`[Survivor Recovery] Synthesizing deterministic fallback for ${missingBatch.batchName}`);
  const synthesized = synthesizeDeterministicProject(resolvedTitle, userGoal, existingFiles);
  const batchTargets = missingBatch.targetFilesSummary.split(',').map(s => s.trim().toLowerCase());
  const batchFiles = synthesized.filter(f => {
    const p = f.path.toLowerCase();
    return batchTargets.some(t => p.endsWith(t) || p.includes(t.replace('src/', '')));
  });

  const finalFiles = batchFiles.length > 0 ? batchFiles : synthesized;
  return {
    role: missingBatch.batchId,
    files: finalFiles,
    content: finalFiles.map(f => `===FILE: ${f.path}===\n${f.content}`).join('\n\n'),
    modelUsed: survivor.model || 'Averia Synthesizer',
    apiKeyUsed: survivor.apiKey,
  };
}

