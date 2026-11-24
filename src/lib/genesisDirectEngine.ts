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
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
];

const LOCAL_STORAGE_KEY_GEMINI = 'averia_gemini_api_keys';

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
        return parsed.map((k: any) => String(k).trim()).filter(k => k.length > 5);
      }
    } catch {
      return raw.split(',').map(k => k.trim()).filter(k => k.length > 5);
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
    const clean = Array.from(new Set(keys.map(k => k.trim()).filter(k => k.length > 5)));
    localStorage.setItem(LOCAL_STORAGE_KEY_GEMINI, JSON.stringify(clean));
  } catch (err) {
    console.warn('[Genesis] Failed to persist custom Gemini keys:', err);
  }
}

/**
 * Load all available Gemini API keys from all sources:
 * 1. localStorage custom keys
 * 2. Vite env vars (VITE_GEMINI_KEY_1..10, VITE_GEMINI_API_KEYS, VITE_GEMINI_API_KEY)
 * 3. Optional Supabase DB lookup if client provided
 */
export async function getAllAvailableGeminiKeys(supabaseClient?: any): Promise<string[]> {
  const keys: string[] = [];
  const seen = new Set<string>();

  const addKey = (k: any) => {
    if (!k || typeof k !== 'string') return;
    const clean = k.trim();
    if (clean.length > 5 && !seen.has(clean) && !clean.startsWith('lovable:')) {
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

  // 3. Optional DB lookup
  if (supabaseClient && keys.length < 10) {
    try {
      const { data, error } = await supabaseClient
        .from('gemini_api_keys')
        .select('api_key')
        .eq('is_active', true)
        .limit(15);
      if (!error && Array.isArray(data)) {
        data.forEach(row => addKey(row.api_key));
      }
    } catch {}
  }

  return keys;
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

  let currentSlot = keySlot % availableKeys.length;
  let keyAttempts = 0;
  const maxKeyAttempts = Math.min(availableKeys.length * 2, 8);

  while (keyAttempts < maxKeyAttempts) {
    const apiKey = availableKeys[currentSlot];
    keyAttempts++;

    // Try cascading through models for this key
    for (let mIdx = 0; mIdx < GEMINI_CASCADE_MODELS.length; mIdx++) {
      const model = GEMINI_CASCADE_MODELS[mIdx];
      if (onModelCascade) onModelCascade(model);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

      const requestBody = {
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
          maxOutputTokens: 16384,
          temperature: 0.2,
          topP: 0.95,
        },
      };

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        // 404 Model Not Found -> Cascade to next model on same key
        if (response.status === 404) {
          console.warn(`[Genesis Direct] Model ${model} returned 404 on key #${currentSlot + 1}. Cascading...`);
          continue;
        }

        // 429 Rate Limit / Quota -> Rotate key immediately
        if (response.status === 429) {
          console.warn(`[Genesis Direct] Key #${currentSlot + 1} hit 429 rate limit. Rotating key...`);
          break; // Break model loop, trigger key rotation
        }

        // 400 Bad Request (unsupported feature or model mismatch) -> Cascade model
        if (response.status === 400) {
          const errBody = await response.text().catch(() => '');
          console.warn(`[Genesis Direct] Model ${model} returned 400 (${errBody.slice(0, 80)}). Cascading...`);
          continue;
        }

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => `HTTP ${response.status}`);
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
        console.warn(`[Genesis Direct] Model ${model} on key #${currentSlot + 1} fetch error:`, reqErr.message);
      }
    }

    // Rotate key slot
    currentSlot = (currentSlot + 1) % availableKeys.length;
    if (onKeyRotate) onKeyRotate(currentSlot);
    await new Promise(r => setTimeout(r, 400));
  }

  throw new Error(`Worker for ${role} failed across all Gemini models and available keys.`);
}
