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
    targetFilesSummary: 'package.json, schema.sql, src/db/schema.ts, server/index.ts, src/lib/dataSdk.ts, src/lib/engine.ts',
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
  const contract = sharedContract || `Application: ${resolvedTitle}\nRouter: window.__AVERIA_APP__\nStore: window.AveriaStore\nEngine: window.AveriaEngine\nPersistence: window.LocalDB (localStorage/IndexedDB)`;

  if (batchId === 'batch_foundation') {
    return {
      batchName: 'Foundation & Core Engine',
      prompt: `You are the Lead Foundation & Core Backend Team in the Genesis full-stack compiler swarm.
Your job is to generate all configuration, PostgreSQL relational schema, Drizzle ORM models, Express backend REST API, client DataSDK, and core calculation logic for "${resolvedTitle}" (${userGoal}).

MANDATORY RULES:
- Output every file using: ===FILE: <path>=== followed by complete code.
- ZERO conversational prose, ZERO placeholders, ZERO stubs (such as "// implement logic here").
- Provide authentic, production-grade code for every single file.

Generate these complete files:

===FILE: package.json===
{
  "name": "${resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "server": "tsx server/index.ts"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.460.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.4",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.5",
    "express": "^4.21.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@types/express": "^5.0.0",
    "@types/cors": "^2.8.17",
    "@types/node": "^22.9.0",
    "@vitejs/plugin-react": "^4.3.3",
    "vite": "^5.4.10",
    "tailwindcss": "^3.4.14",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.19.2"
  }
}

===FILE: tsconfig.json===
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "server"]
}

===FILE: vite.config.ts===
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
});

===FILE: tailwind.config.ts===
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#6366f1',
          foreground: '#ffffff',
        },
      },
    },
  },
  plugins: [],
};

===FILE: schema.sql===
-- Complete PostgreSQL DDL for ${resolvedTitle}
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'customer',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  image_url TEXT,
  stock_count INT DEFAULT 100,
  rating NUMERIC(3, 2) DEFAULT 4.8,
  review_count INT DEFAULT 24,
  is_featured BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending',
  shipping_address JSONB NOT NULL,
  items JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_featured ON items(is_featured);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- At least 12 authentic seed domain records
INSERT INTO items (name, slug, description, price, category, rating, review_count, is_featured, stock_count, image_url) VALUES
('Quantum Core Alpha', 'quantum-core-alpha', 'High-performance next-generation processing unit with low latency.', 299.99, 'Hardware', 4.9, 128, true, 45, 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500'),
('Nebula Cloud Workspace', 'nebula-cloud-workspace', 'Collaborative real-time cloud workstation with enterprise encryption.', 49.00, 'Software', 4.8, 86, true, 999, 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500'),
('Titanium Precision Sensor', 'titanium-precision-sensor', 'Industrial grade optical sensor with sub-millimeter tracking accuracy.', 159.50, 'Sensors', 4.7, 54, false, 32, 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500'),
('Apex Wireless Controller', 'apex-wireless-controller', 'Zero-latency ergonomic game & drone controller with haptic feedback.', 89.99, 'Accessories', 4.8, 210, true, 80, 'https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?w=500'),
('Synapse Neural Module', 'synapse-neural-module', 'Edge AI coprocessor capable of 40 TOPS tensor operations.', 450.00, 'Hardware', 4.9, 64, true, 20, 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=500'),
('CyberShield Guard Pro', 'cybershield-guard-pro', 'Hardware security dongle with automated biometric key rotation.', 119.00, 'Security', 4.6, 92, false, 65, 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=500'),
('Vortex Smart Display', 'vortex-smart-display', 'Ultra-thin OLED telemetry dashboard with customizable gauges.', 219.99, 'Displays', 4.7, 43, false, 18, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500'),
('Chrono Power Hub 240W', 'chrono-power-hub-240w', 'GaN fast charger with dynamic power distribution and LCD wattage monitor.', 79.99, 'Power', 4.9, 310, true, 120, 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500'),
('OmniStream Gateway', 'omnistream-gateway', 'Multi-band wireless mesh gateway with Wi-Fi 7 and 10GbE uplink.', 349.00, 'Networking', 4.8, 77, true, 25, 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=500'),
('Starlight Audio Studio', 'starlight-audio-studio', 'Professional reference DAC with studio-grade headphone amplification.', 189.00, 'Audio', 4.9, 150, false, 40, 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=500'),
('Vector Tracking Gimbal', 'vector-tracking-gimbal', '3-axis brushless stabilizer with AI object tracking and gesture control.', 259.00, 'Cameras', 4.6, 68, false, 30, 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=500'),
('Flux Matrix RGB Ring', 'flux-matrix-rgb-ring', 'Programmable ambient lighting ring with reactive audio spectrum sync.', 64.99, 'Lighting', 4.5, 115, false, 95, 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500')
ON CONFLICT DO NOTHING;

===FILE: src/db/schema.ts===
import { pgTable, uuid, text, numeric, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique().notNull(),
  role: text('role').default('customer'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  category: text('category').notNull(),
  tags: text('tags').array().default([]),
  imageUrl: text('image_url'),
  stockCount: integer('stock_count').default(100),
  rating: numeric('rating', { precision: 3, scale: 2 }).default('4.8'),
  reviewCount: integer('review_count').default(24),
  isFeatured: boolean('is_featured').default(false),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  orderNumber: text('order_number').unique().notNull(),
  totalAmount: numeric('total_amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').default('pending'),
  shippingAddress: jsonb('shipping_address').notNull(),
  items: jsonb('items').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const ordersRelations = relations(orders, ({ one }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
}));

===FILE: drizzle.config.ts===
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/${resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}',
  },
} satisfies Config;

===FILE: server/index.ts===
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// In-memory store synchronized with domain records
let itemsStore = [
  { id: 'itm-1', name: 'Quantum Core Alpha', slug: 'quantum-core-alpha', price: 299.99, category: 'Hardware', rating: 4.9, reviewCount: 128, isFeatured: true, stockCount: 45, imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500' },
  { id: 'itm-2', name: 'Nebula Cloud Workspace', slug: 'nebula-cloud-workspace', price: 49.00, category: 'Software', rating: 4.8, reviewCount: 86, isFeatured: true, stockCount: 999, imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500' },
  { id: 'itm-3', name: 'Titanium Precision Sensor', slug: 'titanium-precision-sensor', price: 159.50, category: 'Sensors', rating: 4.7, reviewCount: 54, isFeatured: false, stockCount: 32, imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500' },
  { id: 'itm-4', name: 'Apex Wireless Controller', slug: 'apex-wireless-controller', price: 89.99, category: 'Accessories', rating: 4.8, reviewCount: 210, isFeatured: true, stockCount: 80, imageUrl: 'https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?w=500' },
  { id: 'itm-5', name: 'Synapse Neural Module', slug: 'synapse-neural-module', price: 450.00, category: 'Hardware', rating: 4.9, reviewCount: 64, isFeatured: true, stockCount: 20, imageUrl: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=500' },
  { id: 'itm-6', name: 'CyberShield Guard Pro', slug: 'cybershield-guard-pro', price: 119.00, category: 'Security', rating: 4.6, reviewCount: 92, isFeatured: false, stockCount: 65, imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=500' },
  { id: 'itm-7', name: 'Vortex Smart Display', slug: 'vortex-smart-display', price: 219.99, category: 'Displays', rating: 4.7, reviewCount: 43, isFeatured: false, stockCount: 18, imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500' },
  { id: 'itm-8', name: 'Chrono Power Hub 240W', slug: 'chrono-power-hub-240w', price: 79.99, category: 'Power', rating: 4.9, reviewCount: 310, isFeatured: true, stockCount: 120, imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500' }
];

let ordersStore: any[] = [];

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: '${resolvedTitle}', uptime: process.uptime() });
});

app.get('/api/items', (req, res) => {
  const { query, category, sort } = req.query;
  let result = [...itemsStore];
  if (typeof category === 'string' && category && category !== 'All') {
    result = result.filter(i => i.category.toLowerCase() === category.toLowerCase());
  }
  if (typeof query === 'string' && query.trim()) {
    const q = query.toLowerCase();
    result = result.filter(i => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }
  if (sort === 'price_asc') result.sort((a, b) => a.price - b.price);
  if (sort === 'price_desc') result.sort((a, b) => b.price - a.price);
  if (sort === 'rating') result.sort((a, b) => b.rating - a.rating);
  res.json({ items: result, total: result.length });
});

app.get('/api/items/:id', (req, res) => {
  const item = itemsStore.find(i => i.id === req.params.id || i.slug === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

app.post('/api/checkout', (req, res) => {
  const { items, customer, paymentMethod } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Cart is empty' });
  const orderNumber = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
  const total = items.reduce((sum: number, it: any) => sum + (it.price * (it.quantity || 1)), 0);
  const newOrder = {
    id: 'ord-' + Date.now(),
    orderNumber,
    items,
    customer,
    totalAmount: total,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };
  ordersStore.push(newOrder);
  res.status(201).json({ success: true, order: newOrder });
});

app.get('/api/analytics', (req, res) => {
  const totalSales = ordersStore.reduce((acc, o) => acc + o.totalAmount, 0);
  res.json({
    totalRevenue: totalSales,
    totalOrders: ordersStore.length,
    activeItems: itemsStore.length,
    conversionRate: '4.8%',
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(\`[${resolvedTitle}] Server running on port \${PORT}\`);
});

===FILE: src/lib/dataSdk.ts===
// Complete Typed Client Data SDK backed by window.LocalDB
export interface Item {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  price: number;
  category: string;
  tags?: string[];
  imageUrl?: string;
  stockCount?: number;
  rating?: number;
  reviewCount?: number;
  isFeatured?: boolean;
}

export interface CartItem extends Item {
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  items: CartItem[];
  totalAmount: number;
  status: string;
  customer?: any;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export class DataSDK {
  private listeners: Record<string, Array<(data: any) => void>> = {};

  constructor() {
    this.seedInitialData();
  }

  private seedInitialData() {
    try {
      const existing = (window as any).LocalDB ? (window as any).LocalDB.find('items') : [];
      if (!existing || existing.length === 0) {
        const initialItems: Item[] = [
          { id: 'itm-1', name: 'Quantum Core Alpha', price: 299.99, category: 'Hardware', rating: 4.9, reviewCount: 128, isFeatured: true, stockCount: 45, imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500', description: 'Next-gen processing unit with sub-millisecond tensor pipeline.' },
          { id: 'itm-2', name: 'Nebula Cloud Workspace', price: 49.00, category: 'Software', rating: 4.8, reviewCount: 86, isFeatured: true, stockCount: 999, imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500', description: 'Collaborative real-time cloud workstation with enterprise encryption.' },
          { id: 'itm-3', name: 'Titanium Precision Sensor', price: 159.50, category: 'Sensors', rating: 4.7, reviewCount: 54, isFeatured: false, stockCount: 32, imageUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500', description: 'Industrial grade optical sensor with sub-millimeter tracking accuracy.' },
          { id: 'itm-4', name: 'Apex Wireless Controller', price: 89.99, category: 'Accessories', rating: 4.8, reviewCount: 210, isFeatured: true, stockCount: 80, imageUrl: 'https://images.unsplash.com/photo-1600080972464-8e5f35f63d08?w=500', description: 'Zero-latency ergonomic game & drone controller with haptic feedback.' },
          { id: 'itm-5', name: 'Synapse Neural Module', price: 450.00, category: 'Hardware', rating: 4.9, reviewCount: 64, isFeatured: true, stockCount: 20, imageUrl: 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=500', description: 'Edge AI coprocessor capable of 40 TOPS tensor operations.' },
          { id: 'itm-6', name: 'CyberShield Guard Pro', price: 119.00, category: 'Security', rating: 4.6, reviewCount: 92, isFeatured: false, stockCount: 65, imageUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=500', description: 'Hardware security dongle with automated biometric key rotation.' },
          { id: 'itm-7', name: 'Vortex Smart Display', price: 219.99, category: 'Displays', rating: 4.7, reviewCount: 43, isFeatured: false, stockCount: 18, imageUrl: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500', description: 'Ultra-thin OLED telemetry dashboard with customizable gauges.' },
          { id: 'itm-8', name: 'Chrono Power Hub 240W', price: 79.99, category: 'Power', rating: 4.9, reviewCount: 310, isFeatured: true, stockCount: 120, imageUrl: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500', description: 'GaN fast charger with dynamic power distribution and LCD wattage monitor.' }
        ];
        if ((window as any).LocalDB) {
          (window as any).LocalDB.seed('items', initialItems);
        }
      }
    } catch (e) {
      console.warn('[DataSDK seed]', e);
    }
  }

  async list<T>(collection: string, filter?: Record<string, any>): Promise<T[]> {
    if (typeof window !== 'undefined' && (window as any).LocalDB) {
      return (window as any).LocalDB.find(collection, filter) || [];
    }
    return [];
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    if (typeof window !== 'undefined' && (window as any).LocalDB) {
      return (window as any).LocalDB.findById(collection, id);
    }
    return null;
  }

  async create<T>(collection: string, item: any): Promise<T> {
    if (typeof window !== 'undefined' && (window as any).LocalDB) {
      const res = (window as any).LocalDB.insert(collection, item);
      this.emit(collection, { action: 'insert', item: res });
      return res;
    }
    return item;
  }

  async update<T>(collection: string, id: string, patch: any): Promise<T | null> {
    if (typeof window !== 'undefined' && (window as any).LocalDB) {
      const res = (window as any).LocalDB.update(collection, id, patch);
      this.emit(collection, { action: 'update', item: res });
      return res;
    }
    return null;
  }

  async remove(collection: string, id: string): Promise<boolean> {
    if (typeof window !== 'undefined' && (window as any).LocalDB) {
      const res = (window as any).LocalDB.delete(collection, id);
      this.emit(collection, { action: 'delete', id });
      return res;
    }
    return true;
  }

  subscribe(collection: string, callback: (event: any) => void): () => void {
    if (!this.listeners[collection]) this.listeners[collection] = [];
    this.listeners[collection].push(callback);
    return () => {
      this.listeners[collection] = this.listeners[collection].filter(fn => fn !== callback);
    };
  }

  private emit(collection: string, payload: any) {
    const list = this.listeners[collection] || [];
    for (const fn of list) {
      try { fn(payload); } catch (err) { console.warn('[DataSDK emit err]', err); }
    }
  }
}

const dataSdk = new DataSDK();
if (typeof window !== 'undefined') {
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('data', dataSdk);
  (window as any).AveriaStore = dataSdk;
  (window as any).DataSDK = dataSdk;
}
export default dataSdk;

===FILE: src/lib/engine.ts===
// Core Business Logic & Analytics Calculation Engine
export class CoreEngine {
  calculateTotals(cart: Array<{ price: number; quantity?: number }>, promoCode?: string, taxRate = 0.08, shippingMethod = 'standard') {
    const subtotal = cart.reduce((sum, item) => sum + (Number(item.price) * (item.quantity || 1)), 0);
    let promoDiscount = 0;
    if (promoCode && promoCode.toUpperCase() === 'AVERIA10') {
      promoDiscount = subtotal * 0.10;
    } else if (promoCode && promoCode.toUpperCase() === 'VIP20') {
      promoDiscount = subtotal * 0.20;
    }
    const discounted = Math.max(0, subtotal - promoDiscount);
    const tax = discounted * taxRate;
    const shipping = subtotal > 100 || shippingMethod === 'free' ? 0 : 15.00;
    const grandTotal = discounted + tax + shipping;

    return {
      subtotal: Number(subtotal.toFixed(2)),
      promoDiscount: Number(promoDiscount.toFixed(2)),
      tax: Number(tax.toFixed(2)),
      shipping: Number(shipping.toFixed(2)),
      grandTotal: Number(grandTotal.toFixed(2)),
    };
  }

  filterAndRankItems<T extends { name: string; category?: string; price: number; rating?: number }>(
    items: T[],
    query = '',
    filters: { category?: string; maxPrice?: number; minRating?: number } = {},
    sortBy = 'featured'
  ): T[] {
    let result = [...items];
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q)));
    }
    if (filters.category && filters.category !== 'All') {
      result = result.filter(i => i.category?.toLowerCase() === filters.category?.toLowerCase());
    }
    if (filters.maxPrice) {
      result = result.filter(i => i.price <= (filters.maxPrice || Infinity));
    }
    if (filters.minRating) {
      result = result.filter(i => (i.rating || 0) >= (filters.minRating || 0));
    }

    if (sortBy === 'price_asc') result.sort((a, b) => a.price - b.price);
    else if (sortBy === 'price_desc') result.sort((a, b) => b.price - a.price);
    else if (sortBy === 'rating') result.sort((a, b) => (b.rating || 0) - (a.rating || 0));

    return result;
  }

  validateStock(cart: Array<{ id: string; quantity: number }>, inventory: Record<string, number>) {
    const issues: Array<{ id: string; requested: number; available: number }> = [];
    for (const item of cart) {
      const available = inventory[item.id] ?? 99;
      if (item.quantity > available) {
        issues.push({ id: item.id, requested: item.quantity, available });
      }
    }
    return { valid: issues.length === 0, issues };
  }

  computeStoreAnalytics(orders: any[], products: any[]) {
    const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const averageOrderValue = orders.length > 0 ? (totalRevenue / orders.length) : 0;
    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalOrders: orders.length,
      averageOrderValue: Number(averageOrderValue.toFixed(2)),
      activeProducts: products.length,
    };
  }
}

const engine = new CoreEngine();
if (typeof window !== 'undefined') {
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('engine', engine);
  (window as any).AveriaEngine = engine;
  (window as any).CoreEngine = engine;
}
export default engine;

===FILE: .env.example===
PORT=3001
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/${resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}
VITE_API_URL=http://localhost:3001

===FILE: README.md===
# ${resolvedTitle}

Production-grade full-stack TypeScript + React application synthesized by Averia Genesis Swarm.

## Architecture
- Frontend: React 18, Tailwind CSS, Vite, TypeScript
- Offline Engine: window.LocalDB with reactive DataSDK
- Calculation Engine: CoreEngine with analytics & pricing algorithms
- Database: PostgreSQL & Drizzle ORM
- Backend: Express REST API with full CRUD endpoints

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with ===FILE: package.json===. Complete code only.`
    };
  }

  if (batchId === 'batch_shell_router') {
    return {
      batchName: 'UI Shell & Router',
      prompt: `You are the UI Shell & Router Architecture Team in the Genesis full-stack compiler swarm.
Your job is to generate the modern responsive HTML5 shell, CSS design system, reusable React UI components, and the client-side SPA router for "${resolvedTitle}" (${userGoal}).

MANDATORY RULES:
- Output every file using: ===FILE: <path>=== followed by complete code.
- ZERO conversational prose, ZERO placeholders, ZERO stubs.
- Output complete, production-grade implementations.

Generate these complete files:

===FILE: index.html===
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${resolvedTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="src/styles.css">
</head>
<body class="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white">
  <!-- Top Navigation Bar -->
  <header class="sticky top-0 z-50 backdrop-blur-md bg-slate-900/90 border-b border-slate-800">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 cursor-pointer" onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/');">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <i class="fa-solid fa-bolt text-white text-lg"></i>
        </div>
        <span class="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
          ${resolvedTitle}
        </span>
      </div>

      <div class="hidden md:flex items-center gap-1 text-sm font-medium">
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">Home</button>
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/catalog');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">Catalog</button>
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/cart');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors flex items-center gap-1.5">
          <i class="fa-solid fa-cart-shopping"></i> Cart
        </button>
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/orders');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors">Orders</button>
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/admin');" class="px-3 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors flex items-center gap-1.5 text-indigo-400">
          <i class="fa-solid fa-chart-line"></i> Admin
        </button>
      </div>

      <div class="flex items-center gap-3">
        <button onclick="if(window.__AVERIA_APP__) window.__AVERIA_APP__.navigate('/cart');" class="relative p-2 rounded-xl bg-slate-800/80 border border-slate-700 hover:border-slate-600 text-slate-200 transition-colors">
          <i class="fa-solid fa-cart-shopping text-sm"></i>
          <span id="nav-cart-badge" class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center">0</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Root Application Viewport -->
  <main id="app" class="flex-1 w-full min-h-[calc(100vh-4rem)] p-4 md:p-6"></main>

  <!-- Dynamic Modal & Toast Mounts -->
  <div id="modal-root"></div>
  <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>

  <!-- Topological Script Manifest -->
  <script type="text/babel" data-presets="react,typescript" src="src/lib/dataSdk.ts"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/components/ui.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/lib/engine.ts"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/router.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/pages/HomePage.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/pages/AppPages.tsx"></script>
  <script type="text/babel" data-presets="react,typescript" src="src/lib/qaGuard.ts"></script>
</body>
</html>

===FILE: src/styles.css===
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body {
  background-color: #0b0f19;
  color: #f8fafc;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-x: hidden;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: #0f172a;
}
::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover {
  background: #475569;
}

.glass-card {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(51, 65, 85, 0.6);
}

===FILE: src/components/ui.tsx===
// Reusable React TypeScript UI components
import React from 'react';

export const Button = ({ children, variant = 'primary', size = 'md', className = '', ...props }: any) => {
  const base = "font-medium transition-all duration-150 inline-flex items-center justify-center rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes: Record<string, string> = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-5 py-2.5 text-base gap-2.5",
  };
  const variants: Record<string, string> = {
    primary: "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95",
    secondary: "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700",
    outline: "border border-slate-700 hover:bg-slate-800/60 text-slate-300 hover:text-white",
    ghost: "hover:bg-slate-800/60 text-slate-300 hover:text-white",
    destructive: "bg-rose-600 hover:bg-rose-500 text-white",
  };
  return (
    <button className={\`\${base} \${sizes[size] || sizes.md} \${variants[variant] || variants.primary} \${className}\`} {...props}>
      {children}
    </button>
  );
};

export const Badge = ({ children, variant = 'default', className = '' }: any) => {
  const variants: Record<string, string> = {
    default: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={\`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border \${variants[variant] || variants.default} \${className}\`}>
      {children}
    </span>
  );
};

export const Card = ({ children, className = '', ...props }: any) => (
  <div className={\`bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl \${className}\`} {...props}>
    {children}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
          <h3 className="font-bold text-lg text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <i class="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const UI = { Button, Badge, Card, Modal };
if (typeof window !== 'undefined') {
  (window as any).UI = UI;
}
export default UI;

===FILE: src/router.tsx===
// Client-side SPA Router
export class ClientRouter {
  private routes: Record<string, (params?: any) => void> = {};
  public currentRoute = '/';
  private listeners: Array<(route: string, params: any) => void> = [];

  constructor() {
    this.setupHistoryListener();
  }

  private normalize(path: string): string {
    if (!path) return '/';
    let p = path.trim();
    if (p.startsWith('#/')) p = p.slice(1);
    if (p.startsWith('#')) p = p === '#' ? '/' : p.slice(1);
    if (!p.startsWith('/')) p = '/' + p;
    return p;
  }

  private setupHistoryListener() {
    if (typeof window === 'undefined') return;
    window.addEventListener('popstate', () => {
      const path = window.location.hash ? this.normalize(window.location.hash) : '/';
      this.navigate(path);
    });
  }

  register(path: string, handler: (params?: any) => void) {
    const clean = this.normalize(path);
    this.routes[clean] = handler;
  }

  route(path: string, handler: (params?: any) => void) {
    this.register(path, handler);
  }

  navigate(path: string, params: any = {}) {
    const clean = this.normalize(path);
    this.currentRoute = clean;

    if (typeof window !== 'undefined' && window.location) {
      window.location.hash = clean === '/' ? '' : clean;
      try {
        window.parent.postMessage({
          type: 'AVERIA_ROUTE_UPDATE',
          route: clean,
          allRoutes: Object.keys(this.routes)
        }, '*');
      } catch (_) {}
    }

    const handler = this.routes[clean];
    if (typeof handler === 'function') {
      handler(params);
    } else {
      // Route matching with params like /product/:id
      let matched = false;
      for (const pattern of Object.keys(this.routes)) {
        if (pattern.includes(':')) {
          const regexStr = '^' + pattern.replace(/:([a-zA-Z0-9_]+)/g, '(?<$1>[^/]+)') + '$';
          const rx = new RegExp(regexStr);
          const m = clean.match(rx);
          if (m) {
            this.routes[pattern]({ ...params, ...(m.groups || {}) });
            matched = true;
            break;
          }
        }
      }
      if (!matched && this.routes['/']) {
        this.routes['/'](params);
      }
    }

    for (const listener of this.listeners) {
      try { listener(clean, params); } catch (e) { console.warn('[Router listener err]', e); }
    }
  }

  onChange(listener: (route: string, params: any) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

const router = new ClientRouter();
if (typeof window !== 'undefined') {
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('router', router);
  (window as any).__AVERIA_ROUTER__ = router;
  (window as any).Router = router;
}
export default router;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with ===FILE: index.html===. Complete code only.`
    };
  }

  // batch_views_qa
  return {
    batchName: 'Application Views & QA Guard',
    prompt: `You are the Lead Application Views & QA Guard Team in the Genesis full-stack compiler swarm.
Your job is to generate the rich, complete, interactive React TSX pages (HomePage.tsx and AppPages.tsx) and the self-healing runtime guard (qaGuard.ts) for "${resolvedTitle}" (${userGoal}).

CRITICAL MANDATE:
- Output every file using: ===FILE: <path>=== followed by complete code.
- ZERO conversational prose, ZERO placeholders, ZERO stubs.
- HomePage.tsx MUST BE 400+ LINES OF RICH CODE with full hero, category tabs, product cards, filters, and modals.
- AppPages.tsx MUST BE 500+ LINES OF RICH CODE implementing ShopPage, ProductDetailPage, CartPage, CheckoutPage, OrdersPage, WishlistPage, and AdminDashboard.
- qaGuard.ts MUST BE A COMPLETE self-healing guard.

Generate these complete files:

===FILE: src/pages/HomePage.tsx===
import React, { useState, useEffect } from 'react';

export function HomePage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('featured');
  const [cartCount, setCartCount] = useState(0);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const categories = ['All', 'Hardware', 'Software', 'Sensors', 'Accessories', 'Security', 'Power'];

  useEffect(() => {
    loadItems();
    updateCartCount();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const store = (window as any).AveriaStore;
      if (store && typeof store.list === 'function') {
        const data = await store.list('items');
        if (data && data.length > 0) {
          setItems(data);
          setLoading(false);
          return;
        }
      }
      // Direct LocalDB fallback
      const local = (window as any).LocalDB ? (window as any).LocalDB.find('items') : [];
      setItems(local || []);
    } catch (err) {
      console.warn('[HomePage loadItems err]', err);
    } finally {
      setLoading(false);
    }
  };

  const updateCartCount = () => {
    try {
      const cart = (window as any).LocalDB ? (window as any).LocalDB.find('cart') : [];
      const total = (cart || []).reduce((sum: number, it: any) => sum + (it.quantity || 1), 0);
      setCartCount(total);
      const badge = document.getElementById('nav-cart-badge');
      if (badge) badge.innerText = String(total);
    } catch (_) {}
  };

  const handleAddToCart = async (item: any) => {
    try {
      const localDb = (window as any).LocalDB;
      if (localDb) {
        const cart = localDb.find('cart') || [];
        const existing = cart.find((c: any) => c.id === item.id);
        if (existing) {
          localDb.update('cart', existing._id, { quantity: (existing.quantity || 1) + 1 });
        } else {
          localDb.insert('cart', { ...item, quantity: 1 });
        }
        updateCartCount();
        if ((window as any).QAGuard && typeof (window as any).QAGuard.showToast === 'function') {
          (window as any).QAGuard.showToast(\`Added \${item.name} to cart!\`, 'success');
        }
      }
    } catch (err) {
      console.warn('[handleAddToCart err]', err);
    }
  };

  // Filter items using CoreEngine or client filter
  let filtered = [...items];
  if (category !== 'All') {
    filtered = filtered.filter(i => i.category === category);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || (i.category && i.category.toLowerCase().includes(q)));
  }
  if (sortBy === 'price_asc') filtered.sort((a, b) => a.price - b.price);
  if (sortBy === 'price_desc') filtered.sort((a, b) => b.price - a.price);
  if (sortBy === 'rating') filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-fadeIn">
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border border-indigo-900/40 p-8 md:p-14 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
            <i class="fa-solid fa-sparkles"></i> Next-Generation Full-Stack Experience
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            ${resolvedTitle}
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            ${userGoal}. Seamlessly powered by responsive client architecture, real-time calculation algorithms, and offline browser persistence.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => {
                const el = document.getElementById('catalog-view');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              Explore Products <i class="fa-solid fa-arrow-right text-xs"></i>
            </button>
            <button
              onClick={() => {
                if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.navigate('/catalog');
              }}
              className="px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm border border-slate-700 transition-colors"
            >
              View Full Catalog
            </button>
          </div>
        </div>
      </div>

      {/* Value Propositions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-xl shrink-0">
            <i class="fa-solid fa-bolt"></i>
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm">Ultra-Fast Performance</h4>
            <p className="text-slate-400 text-xs mt-0.5">Zero latency client-side execution with LocalDB cache.</p>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-xl shrink-0">
            <i class="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm">Offline First Reliability</h4>
            <p className="text-slate-400 text-xs mt-0.5">100% offline persistence guaranteed in browser storage.</p>
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-xl shrink-0">
            <i class="fa-solid fa-credit-card"></i>
          </div>
          <div>
            <h4 className="font-semibold text-white text-sm">Secure Instant Checkout</h4>
            <p className="text-slate-400 text-xs mt-0.5">Automated order routing with promo discount calculations.</p>
          </div>
        </div>
      </div>

      {/* Catalog & Filter Bar */}
      <div id="catalog-view" className="space-y-6 pt-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Featured Collection</h2>
            <p className="text-slate-400 text-xs mt-1">Discover items curated specifically for your requirements</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500 w-48 md:w-64 transition-colors"
              />
            </div>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="featured">Featured</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        </div>

        {/* Category Pill Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={\`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all \${category === cat ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'}\`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Product Cards Grid */}
        {loading ? (
          <div className="text-center py-20 text-slate-400 font-mono text-sm">
            <i class="fa-solid fa-spinner fa-spin text-indigo-400 text-xl mb-3 block"></i>
            Loading domain catalog...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/40 border border-slate-800 rounded-3xl">
            <i class="fa-solid fa-box-open text-slate-500 text-3xl mb-3 block"></i>
            <h3 className="text-white font-semibold text-base">No items match your criteria</h3>
            <p className="text-slate-400 text-xs mt-1">Try adjusting your search terms or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filtered.map(item => (
              <div
                key={item.id}
                className="group rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 p-4 flex flex-col justify-between transition-all duration-200 hover:-translate-y-1 shadow-xl"
              >
                <div className="space-y-3">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-800">
                    <img
                      src={item.imageUrl || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500'}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-slate-950/80 backdrop-blur-md text-slate-300 font-medium text-[10px] border border-slate-700/60">
                      {item.category}
                    </span>
                  </div>

                  <div>
                    <h3 className="font-semibold text-white text-sm line-clamp-1 group-hover:text-indigo-400 transition-colors">
                      {item.name}
                    </h3>
                    <p className="text-slate-400 text-xs line-clamp-2 mt-1">
                      {item.description || 'Enterprise domain solution with high reliability.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-amber-400 text-xs">
                    <i class="fa-solid fa-star"></i>
                    <span className="font-bold text-white">{item.rating || 4.8}</span>
                    <span className="text-slate-500 text-[11px]">({item.reviewCount || 24})</span>
                  </div>
                </div>

                <div className="pt-4 mt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Price</span>
                    <span className="font-bold text-white text-base">\${Number(item.price).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs transition-colors"
                      title="Quick View"
                    >
                      <i class="fa-solid fa-eye"></i>
                    </button>
                    <button
                      onClick={() => handleAddToCart(item)}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 active:scale-95 shadow-md shadow-indigo-600/20"
                    >
                      <i class="fa-solid fa-cart-plus"></i> Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick View Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedItem(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
            >
              <i class="fa-solid fa-xmark text-lg"></i>
            </button>
            <div className="space-y-4">
              <div className="aspect-video rounded-2xl overflow-hidden bg-slate-800">
                <img src={selectedItem.imageUrl} alt={selectedItem.name} className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                  {selectedItem.category}
                </span>
                <h3 className="text-xl font-bold text-white mt-2">{selectedItem.name}</h3>
                <p className="text-slate-300 text-xs leading-relaxed mt-2">{selectedItem.description}</p>
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <span className="text-2xl font-extrabold text-white">\${Number(selectedItem.price).toFixed(2)}</span>
                <button
                  onClick={() => {
                    handleAddToCart(selectedItem);
                    setSelectedItem(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors flex items-center gap-2"
                >
                  <i class="fa-solid fa-cart-plus"></i> Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

HomePage.render = function(params: any) {
  const container = document.getElementById('app');
  if (!container) return;
  if (window.ReactDOM && (window.ReactDOM as any).createRoot) {
    if (!(window as any).__react_root__) {
      (window as any).__react_root__ = (window.ReactDOM as any).createRoot(container);
    }
    (window as any).__react_root__.render(<HomePage {...(params || {})} />);
  }
};

if (typeof window !== 'undefined') {
  if ((window as any).__AVERIA_APP__) {
    (window as any).__AVERIA_APP__.route('/', (params: any) => HomePage.render(params));
    (window as any).__AVERIA_APP__.register('home', HomePage);
  }
  (window as any).HomePage = HomePage;
}
export default HomePage;

===FILE: src/pages/AppPages.tsx===
// Complete Secondary Multi-Page Views (Catalog, Cart, Checkout, Orders, Admin)
import React, { useState, useEffect } from 'react';

export function ShopPage() {
  const [items, setItems] = useState<any[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const list = (window as any).LocalDB ? (window as any).LocalDB.find('items') : [];
    setItems(list || []);
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Product Catalog</h2>
        <input
          type="text"
          placeholder="Filter catalog..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.filter(i => i.name.toLowerCase().includes(query.toLowerCase())).map(i => (
          <div key={i.id} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <h3 className="font-semibold text-white">{i.name}</h3>
            <p className="text-xs text-slate-400 mt-1">{i.description}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="font-bold text-indigo-400">\${Number(i.price).toFixed(2)}</span>
              <button
                onClick={() => {
                  (window as any).LocalDB.insert('cart', { ...i, quantity: 1 });
                  if ((window as any).QAGuard) (window as any).QAGuard.showToast('Added to cart!', 'success');
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CartPage() {
  const [cart, setCart] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>({ subtotal: 0, tax: 0, shipping: 0, grandTotal: 0 });

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = () => {
    const local = (window as any).LocalDB ? (window as any).LocalDB.find('cart') : [];
    setCart(local || []);
    if ((window as any).AveriaEngine) {
      const calc = (window as any).AveriaEngine.calculateTotals(local || []);
      setTotals(calc);
    }
  };

  const updateQty = (id: string, delta: number) => {
    const item = cart.find(c => c.id === id);
    if (!item) return;
    const newQty = (item.quantity || 1) + delta;
    if (newQty <= 0) {
      (window as any).LocalDB.delete('cart', item._id);
    } else {
      (window as any).LocalDB.update('cart', item._id, { quantity: newQty });
    }
    loadCart();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <i class="fa-solid fa-cart-shopping text-indigo-400"></i> Your Shopping Cart
      </h2>
      {cart.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-3xl">
          <p className="text-slate-400 text-sm">Your cart is currently empty.</p>
          <button
            onClick={() => (window as any).__AVERIA_APP__.navigate('/')}
            className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-3">
            {cart.map(item => (
              <div key={item.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="font-semibold text-white text-sm truncate">{item.name}</h4>
                  <span className="text-indigo-400 text-xs font-bold">\${Number(item.price).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQty(item.id, -1)} className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center">-</button>
                  <span className="text-sm font-bold text-white w-6 text-center">{item.quantity || 1}</span>
                  <button onClick={() => updateQty(item.id, 1)} className="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 h-fit">
            <h3 className="font-bold text-white text-sm">Order Summary</h3>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex justify-between"><span>Subtotal:</span><span>\${totals.subtotal}</span></div>
              <div className="flex justify-between"><span>Estimated Tax:</span><span>\${totals.tax}</span></div>
              <div className="flex justify-between"><span>Shipping:</span><span>{totals.shipping === 0 ? 'FREE' : \`\$\${totals.shipping}\`}</span></div>
              <div className="border-t border-slate-800 pt-2 flex justify-between font-bold text-white text-sm">
                <span>Total:</span><span className="text-indigo-400">\${totals.grandTotal}</span>
              </div>
            </div>
            <button
              onClick={() => (window as any).__AVERIA_APP__.navigate('/checkout')}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CheckoutPage() {
  const [formData, setFormData] = useState({ name: '', email: '', address: '', card: '' });
  const [placed, setPlaced] = useState(false);

  const handleSubmit = (e: any) => {
    e.preventDefault();
    const cart = (window as any).LocalDB ? (window as any).LocalDB.find('cart') : [];
    const total = (cart || []).reduce((sum: number, it: any) => sum + (it.price * (it.quantity || 1)), 0);
    const order = {
      orderNumber: 'ORD-' + Math.floor(100000 + Math.random() * 900000),
      items: cart,
      totalAmount: total,
      customer: formData,
      status: 'confirmed',
      createdAt: new Date().toLocaleDateString(),
    };
    (window as any).LocalDB.insert('orders', order);
    (window as any).LocalDB.clear('cart');
    setPlaced(true);
  };

  if (placed) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4 bg-slate-900 border border-slate-800 rounded-3xl p-8">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-2xl mx-auto">
          <i class="fa-solid fa-check"></i>
        </div>
        <h2 className="text-xl font-bold text-white">Order Confirmed!</h2>
        <p className="text-xs text-slate-400">Thank you for your order. We have received your request and will process it immediately.</p>
        <button
          onClick={() => (window as any).__AVERIA_APP__.navigate('/orders')}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
        >
          View Your Orders
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-7 space-y-5">
      <h2 className="text-xl font-bold text-white">Checkout Details</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Full Name</label>
          <input
            required
            type="text"
            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Email Address</label>
          <input
            required
            type="email"
            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Shipping Address</label>
          <textarea
            required
            rows={2}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
            value={formData.address}
            onChange={e => setFormData({ ...formData, address: e.target.value })}
          />
        </div>
        <button type="submit" className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors">
          Place Order
        </button>
      </form>
    </div>
  );
}

export function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const list = (window as any).LocalDB ? (window as any).LocalDB.find('orders') : [];
    setOrders(list || []);
  }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <i class="fa-solid fa-receipt text-indigo-400"></i> Your Order History
      </h2>
      {orders.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-3xl">
          <p className="text-slate-400 text-sm">No past orders found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((ord, idx) => (
            <div key={idx} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <span className="font-bold text-white text-sm">{ord.orderNumber}</span>
                  <span className="text-[11px] text-slate-400 block">{ord.createdAt}</span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {ord.status}
                </span>
              </div>
              <div className="text-xs text-slate-300 space-y-1">
                {(ord.items || []).map((it: any, i: number) => (
                  <div key={i} className="flex justify-between">
                    <span>{it.quantity}x {it.name}</span>
                    <span className="font-mono">\${Number(it.price * (it.quantity || 1)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800/60 font-bold text-sm text-white">
                <span>Total Amount:</span>
                <span className="text-indigo-400">\${Number(ord.totalAmount).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<any>({ totalRevenue: 0, totalOrders: 0, activeItems: 0 });

  useEffect(() => {
    const orders = (window as any).LocalDB ? (window as any).LocalDB.find('orders') : [];
    const items = (window as any).LocalDB ? (window as any).LocalDB.find('items') : [];
    if ((window as any).AveriaEngine) {
      setStats((window as any).AveriaEngine.computeStoreAnalytics(orders || [], items || []));
    }
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-white flex items-center gap-2">
        <i class="fa-solid fa-chart-line text-indigo-400"></i> Store Administration
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Total Store Revenue</span>
          <h3 className="text-3xl font-extrabold text-white mt-2">\${stats.totalRevenue || '0.00'}</h3>
        </div>
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Total Completed Orders</span>
          <h3 className="text-3xl font-extrabold text-white mt-2">{stats.totalOrders || 0}</h3>
        </div>
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-xs text-slate-400">Active Catalog Items</span>
          <h3 className="text-3xl font-extrabold text-white mt-2">{stats.activeItems || 0}</h3>
        </div>
      </div>
    </div>
  );
}

export const AppPages = {
  ShopPage,
  CartPage,
  CheckoutPage,
  OrdersPage,
  AdminDashboard,
};

if (typeof window !== 'undefined') {
  if ((window as any).__AVERIA_APP__) {
    (window as any).__AVERIA_APP__.register('pages', AppPages);
    (window as any).__AVERIA_APP__.route('/catalog', () => {
      const c = document.getElementById('app');
      if (c && window.ReactDOM) (window.ReactDOM as any).createRoot(c).render(<ShopPage />);
    });
    (window as any).__AVERIA_APP__.route('/cart', () => {
      const c = document.getElementById('app');
      if (c && window.ReactDOM) (window.ReactDOM as any).createRoot(c).render(<CartPage />);
    });
    (window as any).__AVERIA_APP__.route('/checkout', () => {
      const c = document.getElementById('app');
      if (c && window.ReactDOM) (window.ReactDOM as any).createRoot(c).render(<CheckoutPage />);
    });
    (window as any).__AVERIA_APP__.route('/orders', () => {
      const c = document.getElementById('app');
      if (c && window.ReactDOM) (window.ReactDOM as any).createRoot(c).render(<OrdersPage />);
    });
    (window as any).__AVERIA_APP__.route('/admin', () => {
      const c = document.getElementById('app');
      if (c && window.ReactDOM) (window.ReactDOM as any).createRoot(c).render(<AdminDashboard />);
    });
  }
  (window as any).AppPages = AppPages;
}
export default AppPages;

===FILE: src/lib/qaGuard.ts===
// Quality Assurance & Runtime Security Guard
export class QAGuard {
  sanitizeHTML(str: string): string {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[tag] || tag));
  }

  safeJSONParse<T>(str: string, fallback: T): T {
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  }

  showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-slate-800';
    toast.className = \`px-4 py-2.5 rounded-xl text-xs font-semibold text-white shadow-xl transition-all duration-300 flex items-center gap-2 border border-white/10 \${bg}\`;
    toast.innerHTML = \`<span>\${this.sanitizeHTML(message)}</span>\`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  runHealthCheck(): boolean {
    const app = typeof window !== 'undefined' && !!(window as any).__AVERIA_APP__;
    const store = typeof window !== 'undefined' && !!(window as any).AveriaStore;
    const engine = typeof window !== 'undefined' && !!(window as any).AveriaEngine;
    console.log('[QAGuard HealthCheck]', { app, store, engine });
    return app && store && engine;
  }
}

const guard = new QAGuard();
if (typeof window !== 'undefined') {
  if ((window as any).__AVERIA_APP__) (window as any).__AVERIA_APP__.register('qa', guard);
  (window as any).QAGuard = guard;
}
export default guard;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with ===FILE: src/pages/HomePage.tsx===. Complete code only.`
  };
}

/**
 * Extract project files supporting ===FILE: <path>=== and standard ```lang:<path> fences
 */
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

  // Alternate models: gemini-3.5-flash and gemini-2.5-flash with maxOutputTokens: 16384
  const BATCH_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.5-pro'];
  let modelIndex = 0;

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

