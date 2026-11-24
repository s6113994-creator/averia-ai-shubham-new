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
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.5-pro',
  'gemini-2.5-flash-lite',
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
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-3.5-pro',
        'gemini-2.5-flash-lite',
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

RULES: Start immediately on line 1 with \`\`\`typescript:src/lib/dataSdk.ts. ZERO conversational prose. Complete TypeScript only.`
    },

    logic_engine: {
      roleName: 'Core Logic & Analytics Engine',
      targetFiles: 'src/lib/engine.ts',
      prompt: `You are the Lead Core Logic & Analytics Architect in the Genesis full-stack compiler swarm.
Your job is to generate the core business calculation algorithms or interactive engine for "${resolvedTitle}" (${userGoal}):
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

RULES: Start immediately on line 1 with \`\`\`typescript:src/lib/engine.ts. ZERO conversational prose. Complete TypeScript only.`
    },

    ui_shell: {
      roleName: 'UI Shell & Design System',
      targetFiles: 'index.html, src/styles.css, src/components/ui.tsx',
      prompt: `You are the UI Shell & Design System Architect in the Genesis full-stack compiler swarm.
Your job is to generate the modern responsive HTML5 shell, CSS design system, and reusable React UI primitives for "${resolvedTitle}" (${userGoal}):
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

RULES: Start immediately on line 1 with \`\`\`tsx:src/pages/HomePage.tsx. ZERO conversational prose. Complete TypeScript React only.`
    },

    sub_pages: {
      roleName: 'Sub-Pages & Nested Views Specialist',
      targetFiles: 'src/pages/AppPages.tsx',
      prompt: `You are the Senior Application Views Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the deep secondary React TSX pages and detail views for "${resolvedTitle}" (${userGoal}):
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

RULES: Start immediately on line 1 with \`\`\`tsx:src/pages/AppPages.tsx. ZERO conversational prose. Complete TypeScript React only.`
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

/**
 * Extract fenced code blocks with language and path metadata
 */
export function extractFencedProjectFiles(text: string): GenesisProjectFile[] {
  const files: GenesisProjectFile[] = [];
  if (!text) return files;

  // Regex matching ```[lang]:[filepath] ... ``` or ```file:[filepath] ... ```
  const regex = /```(?:([a-zA-Z0-9_\-]+):)?(?:file:)?([^\n\r]+?)\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawPath = match[2].trim();
    if (!rawPath.includes('.') && !rawPath.includes('/') && !rawPath.includes('\\')) {
      continue;
    }
    const cleanPath = rawPath.replace(/^[\\\/]+/, '').replace(/^file:/i, '').trim();
    const content = match[3];
    const language = match[1] || (
      cleanPath.endsWith('.html') ? 'html' :
      cleanPath.endsWith('.css') ? 'css' :
      cleanPath.endsWith('.sql') ? 'sql' :
      cleanPath.endsWith('.json') ? 'json' :
      cleanPath.endsWith('.tsx') ? 'tsx' :
      cleanPath.endsWith('.ts') ? 'typescript' : 'javascript'
    );

    files.push({
      path: cleanPath,
      content,
      language,
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
