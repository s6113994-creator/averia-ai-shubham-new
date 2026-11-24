/**
 * Averia Genesis Direct Browser Swarm Compiler Engine
 * 
 * 100% decoupled from Supabase Edge Functions:
 * - Direct browser-to-Gemini streaming via generativelanguage.googleapis.com
 * - Multi-key 10-slot rotation pool supporting .env, localStorage & DB fallbacks
 * - Official universal Gemini model cascade
 * - 10 senior full-stack specialized parallel subagents (maxOutputTokens: 16384)
 * - Zero Supabase/AveriaDB cloud dependency in generated apps (powered by window.LocalDB)
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
      // Might be comma-separated string
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
 * 10 Senior Engineering Swarm Roles & System Prompts
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
      roleName: 'System Architect',
      targetFiles: 'package.json, .env.example, README.md',
      prompt: `You are the Principal System Architect in the Genesis full-stack compiler swarm.
Your job is to generate THREE essential project manifest files for "${resolvedTitle}" (${userGoal}):
1. \`\`\`json:package.json — Production manifest with name "${resolvedTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}", scripts ("dev": "vite", "build": "vite build", "preview": "vite preview", "server": "node server/index.js"), and dependencies (express, cors, dotenv).
2. \`\`\`markdown:README.md — Comprehensive engineering documentation detailing: system architecture, multi-page route table, database schema, state management contract, and offline in-browser execution with window.LocalDB.
3. \`\`\`bash:.env.example — Environment variable template with PORT=3001, NODE_ENV=development.

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`json:package.json. ZERO conversational prose. Every file must be complete and production ready.`
    },

    db_engineer: {
      roleName: 'Database Architect',
      targetFiles: 'schema.sql',
      prompt: `You are the Lead Database Architect in the Genesis full-stack compiler swarm.
Your job is to generate a comprehensive, production-grade PostgreSQL/SQLite database schema for "${resolvedTitle}" (${userGoal}):
\`\`\`sql:schema.sql — Complete relational DDL with:
- CREATE TABLE IF NOT EXISTS statements for all domain entities (users, items/products/games, orders/sessions, activities, settings, stats/leaderboards)
- Primary keys (UUID or AUTOINCREMENT), foreign key constraints with ON DELETE CASCADE, NOT NULL checks, and domain constraints
- B-tree indices on high-cardinality foreign keys, search columns, and created_at timestamps
- Rich, authentic seed data: At least 12-16 realistic, fully populated domain records with authentic names, prices/scores, categories, tags, and status fields

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`sql:schema.sql. ZERO conversational prose. Deep, complete SQL only.`
    },

    backend_api: {
      roleName: 'Backend REST API Engineer',
      targetFiles: 'server/index.js',
      prompt: `You are the Senior Backend Engineer in the Genesis full-stack compiler swarm.
Your job is to generate a complete Node.js / Express.js REST API server for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:server/index.js — Complete Node.js / Express.js REST API with:
- const express = require('express'); const cors = require('cors');
- Middleware: cors(), express.json()
- Domain CRUD endpoints:
  * GET /api/items (with search, category filter, and sorting)
  * GET /api/items/:id
  * POST /api/items
  * PATCH /api/items/:id
  * DELETE /api/items/:id
- Domain action routes (e.g. /api/checkout, /api/action, /api/stats, /api/leaderboard)
- Health check: GET /api/health
- In-memory mock database pre-populated with 12 authentic records
- Port binding: const PORT = process.env.PORT || 3001; app.listen(PORT, ...)

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:server/index.js. ZERO conversational prose. Complete backend code only.`
    },

    data_sdk: {
      roleName: 'Data & Local Persistence SDK',
      targetFiles: 'src/data.js',
      prompt: `You are the Principal Client Data Architect in the Genesis full-stack compiler swarm.
Your job is to generate the robust client-side data management layer for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:src/data.js — Complete state & data SDK wired to window.__AVERIA_APP__ and backed by window.LocalDB:
- Deep authentic initial dataset (12-16 realistic domain items with id, name, category, status, metrics, tags, image placeholder)
- window.AveriaStore reactive state manager with:
  * list(col, query), get(col, id), create(col, item), update(col, id, patch), remove(col, id), clear(col)
  * search(col, term), filter(col, predicate), sort(col, key, asc)
  * subscribe(event, cb), notify(event, data)
- 100% OFFLINE BROWSER PERSISTENCE:
  Calls window.LocalDB (or localStorage) so every created app/game immediately persists real data in the browser without any external cloud server!
  Auto-seed collections on boot if empty!
- REGISTRATION:
  if (window.__AVERIA_APP__) window.__AVERIA_APP__.register('data', AveriaStore);
  window.AveriaStore = AveriaStore;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:src/data.js. ZERO conversational prose. Complete browser JS only.`
    },

    logic_engine: {
      roleName: 'Core Logic / 60FPS Engine',
      targetFiles: 'src/engine.js',
      prompt: `You are the Lead Interactive Engine Architect in the Genesis full-stack compiler swarm.
Your job is to generate the core interactive engine and calculation algorithms for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:src/engine.js — Core calculations, business logic, or 60FPS game loop:
- IF THE PROMPT IS A GAME:
  * Full 60FPS requestAnimationFrame canvas loop with delta-time smoothing
  * Player physics: velocity, acceleration, friction, jumping/movement, boundaries
  * Multiple intelligent AI opponents or dynamic obstacle spawners with difficulty scaling
  * Particle explosion & collision effect systems (visual feedback on hits/scores)
  * PROCEDURAL WEB AUDIO API SYNTHESIZER: window.AveriaSound with zero external audio assets! Generates real-time sound effects for jump, laser/fire, hit/damage, score/collect, powerup, game over, and victory fanfare!
  * Combo counter, power-up timers, and high-score cloud leaderboard sync via AveriaStore
- IF THE PROMPT IS SAAS / E-COMMERCE / TOOL:
  * Multi-metric statistical aggregators, tax/discount/shipping calculation engines
  * Multi-dimensional data filtering & sorting matrix
  * Interactive SVG chart generation (area charts, bar graphs, trendlines with tooltips)
  * Audit logging & workflow state machine transitions
- REGISTRATION:
  if (window.__AVERIA_APP__) window.__AVERIA_APP__.register('engine', AveriaEngine);
  window.AveriaEngine = AveriaEngine;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:src/engine.js. ZERO conversational prose. Complete browser JS only.`
    },

    ui_shell: {
      roleName: 'Design System & UI Shell',
      targetFiles: 'index.html, src/styles.css, src/components/UI.js',
      prompt: `You are the UI Shell Architect in the Genesis full-stack compiler swarm.
Your job is to generate THREE essential UI files for "${resolvedTitle}" (${userGoal}):
1. \`\`\`html:index.html — Full modern responsive HTML5 shell matching world-class Lovable / Claude Code quality:
   - <script src="https://cdn.tailwindcss.com"></script> and modern styling matching the domain
   - Responsive Header/Navbar with brand icon & title "${resolvedTitle}", search bar, category navigation tabs, active view indicator, and action badges (cart count, player health/level, user profile)
   - Main app viewport: <main id="app" class="flex-1 w-full min-h-[calc(100vh-4rem)] p-4 md:p-6"></main>
   - Modal root container: <div id="modal-root"></div>
   - Toast notification container: <div id="toast-container" class="fixed bottom-5 right-5 z-50 flex flex-col gap-2"></div>
   - Script tags in strict topological order:
     <script src="src/data.js"></script>
     <script src="src/components/UI.js"></script>
     <script src="src/engine.js"></script>
     <script src="src/router.js"></script>
     <script src="src/pages/HomePage.js"></script>
     <script src="src/pages/AppPages.js"></script>
     <script src="src/qaGuard.js"></script>
2. \`\`\`css:src/styles.css — Modern CSS design system with custom animations, glassmorphism tokens, and responsive scrollbars.
3. \`\`\`javascript:src/components/UI.js — Reusable UI component library (buttons, badges, modal dialogs, metric cards, toast alerts) attaching to window.UI.

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`html:index.html. ZERO conversational prose. Complete code only.`
    },

    spa_router: {
      roleName: 'Deep Multi-Page SPA Router',
      targetFiles: 'src/router.js',
      prompt: `You are the SPA Router Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the robust client-side nested router for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:src/router.js — Robust client-side hash router wired to window.__AVERIA_APP__:
- Route registry: window.__AVERIA_APP__.route(path, renderFn)
- Deep nested route support:
  * '/' -> HomePage.render()
  * '/explore' or '/catalog'
  * '/detail' or '/detail/:id' (with automatic URL parameter extraction)
  * '/workspace' or '/play' or '/dashboard'
  * '/analytics' or '/leaderboard'
  * '/admin' or '/inventory'
  * '/settings' or '/profile'
- Navigation methods:
  * window.__AVERIA_APP__.navigate(path, params)
  * window.__AVERIA_APP__.goBack()
  * window.__AVERIA_APP__.currentRoute
- Breadcrumb tracking and active tab highlight synchronization
- Post-message route telemetry to parent preview pane:
  try { window.parent.postMessage({ type: 'AVERIA_ROUTE_UPDATE', route, allRoutes }, '*'); } catch(e) {}
- Dual registration:
  if (window.__AVERIA_APP__) window.__AVERIA_APP__.register('router', router);
  window.__AVERIA_ROUTER__ = window.__AVERIA_ROUTER__ || router;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:src/router.js. ZERO conversational prose. Complete browser JS only.`
    },

    home_view: {
      roleName: 'Home View Specialist',
      targetFiles: 'src/pages/HomePage.js',
      prompt: `You are the Lead Frontend View Architect in the Genesis full-stack compiler swarm.
Your job is to generate the primary interactive Home / Main view for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:src/pages/HomePage.js — Primary view implementation rendering into document.getElementById('app'):
- IF THE APPLICATION IS A GAME:
  * Full-screen responsive HTML5 <canvas id="game-canvas" class="w-full max-w-4xl mx-auto rounded-xl shadow-2xl border border-slate-700 bg-slate-900"></canvas>
  * Controls HUD (Score, Level, Health bar, Sound toggle, Pause/Play, Restart)
  * Touch on-screen buttons for mobile + Keyboard arrow/WASD listeners
  * Launch game engine loop via window.AveriaEngine.start()
- IF THE APPLICATION IS SAAS / E-COMMERCE / TOOL:
  * High-impact Hero section with primary CTA and search/filter bar
  * Live KPI / Metric summary cards (Total Revenue, Active Users, Performance, Conversion)
  * Interactive Card Grid / Data Table with real-time category filtering, sorting, and search
  * Quick-action buttons wired to window.__AVERIA_APP__.navigate('/detail', { id }) and modals
- REGISTRATION:
  if (window.__AVERIA_APP__) {
    window.__AVERIA_APP__.route('/', function(params) { HomePage.render(params); });
    window.__AVERIA_APP__.register('home', HomePage);
  }
  window.HomePage = HomePage;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:src/pages/HomePage.js. ZERO conversational prose. Complete browser JS only.`
    },

    sub_pages: {
      roleName: 'Sub-Pages & Nested Views Specialist',
      targetFiles: 'src/pages/AppPages.js',
      prompt: `You are the Senior Application Views Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the deep secondary views, detail pages, and modals for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:src/pages/AppPages.js — Complete multi-page views implementation rendering into document.getElementById('app'):
- Implement all secondary routes:
  1. renderExplore(params) or renderCatalog(params) — Rich searchable and filterable catalog with grid/list toggles
  2. renderDetail(params) — In-depth view for a selected item/entity with image gallery, specs, action buttons, and review/activity log
  3. renderAnalytics(params) or renderLeaderboard(params) — Interactive data charts, metrics breakdown, or top player leaderboard
  4. renderAdmin(params) or renderWorkspace(params) — Full management view: Create new entity form with validation, edit/delete actions, and status toggles
  5. renderSettings(params) — User preferences, theme toggle, notifications, and local storage reset button
- ZERO DEAD BUTTONS: Every navigation link or button MUST call window.__AVERIA_APP__.navigate(...)
- REGISTRATION:
  if (window.__AVERIA_APP__) {
    window.__AVERIA_APP__.register('pages', AppPages);
  }
  window.AppPages = AppPages;

MANDATORY: STRICT VALID BROWSER JAVASCRIPT. ZERO TypeScript syntax errors.
SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:src/pages/AppPages.js. ZERO conversational prose. Complete browser JS only.`
    },

    qa_security: {
      roleName: 'QA & Runtime Integrator',
      targetFiles: 'src/qaGuard.js',
      prompt: `You are the Lead QA & Security Engineer in the Genesis full-stack compiler swarm.
Your job is to generate the quality assurance, security, and self-healing guard for "${resolvedTitle}" (${userGoal}):
\`\`\`javascript:src/qaGuard.js — Client-side security and self-healing runtime:
- sanitizeHTML(str): Robust XSS protection against script injection
- safeJSONParse(str, fallback): Bulletproof JSON parsing
- getFallbackSVG(label, width, height): High-quality dynamic SVG data-URI generator for missing images
- showToast(message, type): Toast alert notification manager
- runHealthCheck(): Verifies that window.__AVERIA_APP__, AveriaStore, AveriaEngine, HomePage, and AppPages are properly mounted and functional
- REGISTRATION:
  if (window.__AVERIA_APP__) window.__AVERIA_APP__.register('qa', QAGuard);
  window.QAGuard = QAGuard;

SHARED ARCHITECTURAL CONTRACT:
${contract}

RULES: Start immediately on line 1 with \`\`\`javascript:src/qaGuard.js. ZERO conversational prose. Complete browser JS only.`
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
    // Exclude if path is just a language name without extension/slash
    if (!rawPath.includes('.') && !rawPath.includes('/') && !rawPath.includes('\\')) {
      continue;
    }
    const cleanPath = rawPath.replace(/^[\\\/]+/, '').replace(/^file:/i, '').trim();
    const content = match[3];
    const language = match[1] || (cleanPath.endsWith('.html') ? 'html' : cleanPath.endsWith('.css') ? 'css' : cleanPath.endsWith('.sql') ? 'sql' : cleanPath.endsWith('.json') ? 'json' : 'javascript');

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
  const userPrompt = `Generate the production-grade code for "${resolvedTitle}" (${userGoal}). Follow your role and architectural contract strictly.`;

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
              // Handle candidates delta in Google Gemini format
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

        // Normalize paths according to canonical role targets
        parsedFiles = parsedFiles.map(f => {
          if (role === 'ui_shell' && (f.path.includes('ui_shell') || f.path.endsWith('.html'))) {
            return { ...f, path: 'index.html' };
          }
          if (role === 'home_view' && (f.path.includes('home_view') || f.path.endsWith('HomePage.js') || f.path.endsWith('home.js'))) {
            return { ...f, path: 'src/pages/HomePage.js' };
          }
          if (role === 'sub_pages' && (f.path.includes('sub_pages') || f.path.endsWith('AppPages.js') || f.path.endsWith('pages.js'))) {
            return { ...f, path: 'src/pages/AppPages.js' };
          }
          if (role === 'spa_router' && f.path.includes('router')) {
            return { ...f, path: 'src/router.js' };
          }
          if (role === 'logic_engine' && f.path.includes('engine')) {
            return { ...f, path: 'src/engine.js' };
          }
          if (role === 'data_sdk' && (f.path.includes('data') || f.path.includes('store'))) {
            return { ...f, path: 'src/data.js' };
          }
          if (role === 'qa_security' && (f.path.includes('qa') || f.path.includes('guard'))) {
            return { ...f, path: 'src/qaGuard.js' };
          }
          return f;
        });

        // Single fallback if code block missing fence name
        if (parsedFiles.length === 0 && fullText.trim().length > 30) {
          const CANONICAL_TARGETS: Record<string, string> = {
            architect: 'package.json',
            db_engineer: 'schema.sql',
            backend_api: 'server/index.js',
            data_sdk: 'src/data.js',
            logic_engine: 'src/engine.js',
            ui_shell: 'index.html',
            spa_router: 'src/router.js',
            home_view: 'src/pages/HomePage.js',
            sub_pages: 'src/pages/AppPages.js',
            qa_security: 'src/qaGuard.js',
          };
          const target = CANONICAL_TARGETS[role] || 'src/module.js';
          let clean = fullText.trim().replace(/^```[a-zA-Z0-9_\-]+(?::[^\n\r]*)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
          parsedFiles.push({
            path: target,
            content: clean,
            language: target.endsWith('.html') ? 'html' : target.endsWith('.sql') ? 'sql' : target.endsWith('.json') ? 'json' : 'javascript',
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
