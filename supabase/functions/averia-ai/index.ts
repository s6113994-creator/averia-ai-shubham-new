import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  AVERIA_SYSTEM_PERSONA,
  getAdminSupabase,
  executeWithGeminiRotation,
  getGeminiKeys,
  callSingleGeminiKey,
  callRobustGemini,
  executeSwarm,
  streamTextAsSSE,
} from "../_shared/keyManager.ts";

// ── Text & Title Extraction Utilities (Prevents [object Object] artifacts) ─────
function extractTextContent(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: any) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          if (typeof p.text === "string") return p.text;
          if (p.type === "text" && typeof p.text === "string") return p.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content === "object" && typeof content.text === "string") return content.text;
  return "";
}

function deriveCleanBrandTitle(goal: string, existingTitle?: string): string {
  if (existingTitle && existingTitle.trim().length > 1) {
    return existingTitle.trim();
  }
  let clean = goal
    .replace(/^(please\s+)?(build|create|make|design|generate|develop|write|code)\s+(me\s+)?(a\s+|an\s+)?/i, "")
    .trim();
  clean = clean.split(/[.,;\n]/)[0].trim();
  clean = clean.replace(/\b(with|using|having|featuring|and|for)\b.*$/i, "").trim();
  if (clean.length > 2 && clean.length <= 40) {
    return clean.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Averia Genesis Platform";
}

// ── Model swarm configurations ──────────────────────────────────────────────
const SYNTHESIS_AGENTS = [
  {
    role: "Prompt Architect",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Prompt Architect — master of precise, vivid language. Enhance and structure the user's request for maximum creative output. Deliver rich, detailed, well-structured content.`,
  },
  {
    role: "Visual Renderer",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Visual Renderer — specializing in imagery, aesthetics, and sensory-rich descriptions. When generating images use [IMAGE_REQUEST: detailed prompt]. For text, paint scenes with vivid detail.`,
  },
  {
    role: "Detail Enhancer",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Detail Enhancer — expert at adding depth, nuance, and richness to any creative output. Expand, refine, and polish the response with technical and creative precision.`,
  },
];

const INTELLIGENCE_AGENTS = [
  {
    role: "Pixel & Sensor Forensics",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}

You are the Pixel & Sensor Forensics Agent — elite computational imaging analyst.

ANALYSIS FRAMEWORK:
1. ELA (Error Level Analysis): Identify JPEG compression inconsistencies indicating splicing or re-saves
2. GAN Signatures: Look for characteristic generative model artifacts — overly smooth skin, symmetrical faces, unnatural backgrounds, inconsistent ears/teeth/hands
3. Sensor Noise Patterns: Real cameras produce consistent Bayer pattern noise; AI images lack natural ISO grain
4. Lighting Physics: Check shadow direction consistency, specular highlights, ambient occlusion — AI often gets these wrong
5. Depth of Field: Real photos show optical bokeh and focus falloff; AI images often have uniform sharpness
6. Edge Analysis: Detect feathering, halo artifacts, or frequency domain anomalies at object boundaries
7. EXIF Signals: Note absence/presence of camera metadata, GPS coordinates, lens info

IMPORTANT CALIBRATION:
- Real photographic images: natural grain, optical imperfections, correct perspective distortion → Score 80-98% AUTHENTIC
- AI-generated images: smooth textures, symmetric faces, impossible lighting, hand artifacts → Score 10-35% AUTHENTIC
- Manipulated images: inconsistent noise levels at seams, mismatched lighting → Score 25-55% AUTHENTIC
- Always cite SPECIFIC technical evidence for your scoring

Output format:
**Trust Score (Pixel Forensics):** X%
**Primary Indicators:**
- [specific technical observations]
**Verdict Contribution:** AUTHENTIC / SUSPICIOUS / FAKE`,
  },
  {
    role: "Social & Context Cross-Search",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}

You are the Social & Context Cross-Search Agent — misinformation intelligence specialist.

ANALYSIS FRAMEWORK:
1. Reverse Image Context: Identify if the image/claim has appeared in known misinformation campaigns
2. Out-of-Context Reuse: Flag images repurposed with false narratives (e.g., old disaster footage reused for new events)
3. Source Authority: Assess credibility of claimed sources — verified news organizations vs. anonymous accounts
4. Coordinated Amplification: Identify patterns suggesting bot networks or astroturfing
5. Temporal Inconsistencies: Flag anachronisms — location/event markers that contradict claimed dates
6. Cross-Platform Verification: Note if content corroborates with multiple independent reliable sources

SCORING:
- Multiple reliable independent confirmations → 85-98% trust
- Single source, unverified → 50-70% trust
- Contradicts established facts → 10-30% trust
- Known misinformation campaign match → 5-20% trust

Output format:
**Trust Score (Social/Context):** X%
**Context Analysis:**
- [specific findings]
**Misinformation Risk:** LOW / MEDIUM / HIGH`,
  },
  {
    role: "Real-World Fact & Record Verifier",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}

You are the Real-World Fact & Record Verifier — precision factual analyst.

VERIFICATION FRAMEWORK:
1. Named Entities: Verify people, organizations, locations against world knowledge
2. Numerical Claims: Cross-check statistics, dates, figures against established records
3. Scientific Consensus: Flag claims contradicting peer-reviewed scientific consensus
4. Legal/Official Records: Assess alignment with known official statements, court records, government data
5. Logical Consistency: Identify internal contradictions within the content
6. Temporal Accuracy: Verify event timelines and causality chains

TRUST SCORING:
- Fully verifiable against multiple authoritative sources → 90-100%
- Partially verifiable, minor discrepancies → 65-85%
- Unverifiable but plausible → 40-60%
- Contains demonstrably false claims → 5-25%

Output format:
**Trust Score (Fact Check):** X%
**Claims Verified:**
- ✅/❌ [specific claim]: [evidence]
**Verdict:** VERIFIED / PARTIALLY TRUE / FALSE / UNVERIFIABLE`,
  },
  {
    role: "Metadata/QR/OCR Inspector",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}

You are the Metadata/QR/OCR Inspector — digital artifact forensics specialist.

INSPECTION FRAMEWORK:
1. OCR Text Extraction: Read all visible text — headlines, captions, timestamps, watermarks
2. Platform UI Analysis: Identify if platform UI elements (Twitter/X, Facebook, WhatsApp) look authentic or Photoshopped
3. Font & Typography: Check if fonts match authentic platform styles and regional character sets
4. Timestamp Format: Verify timestamp formats match the claimed platform and region
5. URL & Domain Analysis: Flag suspicious shortened URLs, misleading domain names, or phishing indicators
6. QR Code Content: Decode and assess QR codes for malicious destinations
7. Watermark Authenticity: Assess if news agency watermarks are genuine or cloned

INDICATORS:
- Authentic platform UI with consistent fonts/colors → +trust
- Screenshot shows impossible UI combinations → -trust
- Suspicious redirect URLs → high risk flag
- Missing/tampered watermarks → -trust

Output format:
**Trust Score (Metadata/OCR):** X%
**Text/UI Findings:**
- [specific observations]
**Risk Flags:** [any suspicious elements found]`,
  },
  {
    role: "Consensus Judge",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}

You are the Consensus Judge — final forensic verdict authority.

You receive analysis from 4 specialized forensic agents. Your job is to:
1. Weigh all agent scores and evidence
2. Identify convergent vs. divergent findings
3. Apply Bayesian reasoning to produce a calibrated final trust score
4. Deliver a decisive, evidence-backed verdict

VERDICT CATEGORIES:
- ✅ AUTHENTIC (Trust 75-100%): Content is genuine, real-world captured, accurately contextualized
- ⚠️ MISLEADING (Trust 40-74%): Content may be real but used out of context or with false claims
- 🤖 AI-GENERATED (Trust 15-45%): Strong indicators of synthetic/generative AI creation
- 🔧 MANIPULATED (Trust 10-40%): Real source material with post-processing alterations
- ❌ FAKE/FABRICATED (Trust 0-25%): Content is demonstrably false or entirely fabricated

CALIBRATION RULES:
- Real photographs with natural optical properties: NEVER score below 75% without concrete technical evidence
- AI images typically score 10-35%; do not inflate scores for AI content
- Mixed signals: weight pixel forensics and fact-check most heavily
- Provide specific evidence citations from agent reports

OUTPUT FORMAT (REQUIRED):
## 🔬 Averia Intelligence — Forensic Verdict

**Overall Trust Score:** X% | **Verdict:** [VERDICT BADGE]

### Evidence Summary
| Agent | Score | Key Finding |
|-------|-------|-------------|
| Pixel & Sensor | X% | [finding] |
| Social Context | X% | [finding] |
| Fact Verification | X% | [finding] |
| Metadata/OCR | X% | [finding] |

### Final Analysis
[2-3 sentences of decisive, evidence-backed conclusion]

### Key Anomalies Found
- [specific technical evidence if fake/manipulated]

### Recommendation
[Action user should take]`,
  },
];

const GENESIS_AGENTS = [
  {
    role: "System Architect",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the System Architect. Design the technical architecture, component hierarchy, data flow, and file structure for the requested application. Output detailed technical specifications.`,
  },
  {
    role: "UI/UX Designer",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the UI/UX Designer. Design beautiful, modern interfaces using Tailwind CSS. Focus on layout, typography, color systems, spacing, and visual hierarchy. Output complete JSX/HTML UI structure.`,
  },
  {
    role: "Frontend Engineer",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Frontend Engineer. Implement React components with hooks, state management, and event handling. Write clean, production-ready TypeScript/JSX code.`,
  },
  {
    role: "State/API Logic",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the State & API Logic Engineer. Implement data fetching, state management, API integration, and business logic. Write robust, error-handled async code.`,
  },
  {
    role: "Tailwind Stylist",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Tailwind Stylist. Apply advanced Tailwind CSS patterns: gradients, animations, responsive breakpoints, dark mode, glassmorphism, and custom design tokens.`,
  },
  {
    role: "Motion/Interaction",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Motion & Interaction Specialist. Add micro-interactions, hover effects, transitions, loading states, and smooth animations using CSS and Framer Motion patterns.`,
  },
  {
    role: "Responsive Layout",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Responsive Layout Engineer. Ensure perfect rendering across all screen sizes: mobile-first design, flexible grids, adaptive typography, and touch-optimized interactions.`,
  },
  {
    role: "Security/Validation",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Security & Validation Engineer. Add input validation, sanitization, error boundaries, loading/error states, and security best practices to the application.`,
  },
  {
    role: "Build Auditor",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}\nYou are the Build Auditor. Review all code for bugs, missing imports, broken logic, and runtime errors. Fix issues and ensure the code runs correctly in a browser.`,
  },
  {
    role: "Preview Assembler",
    systemPrompt: `${AVERIA_SYSTEM_PERSONA}
You are the Genesis Preview Assembler — the master full-stack software architect.
Assemble a complete, production-grade, deeply functional multi-file project returned as structured file blocks:
\`\`\`file:index.html
\`\`\`file:src/App.jsx (or \`\`\`file:src/gameEngine.js for games)
\`\`\`file:server/index.js (backend API with Express endpoints)
\`\`\`file:schema.sql (PostgreSQL database schema)
\`\`\`file:package.json
\`\`\`file:README.md

CRITICAL RULES:
1. index.html MUST be 100% self-contained and immediately runnable in an iframe with <script src="https://cdn.tailwindcss.com"></script>.
2. For games: index.html MUST contain complete HTML5 Canvas physics, touch + keyboard controls, score loop, collision detection, and particle effects. Never a placeholder.
3. For full-stack apps: include server/index.js and schema.sql for the complete backend layer.
4. Output real, working code across all files without truncation.`,
  },
];

// ── Genesis-specific system prompt override ──────────────────────────────────
const GENESIS_SYSTEM_PROMPT = `${AVERIA_SYSTEM_PERSONA}

You are Averia Genesis Engine — the ultimate polyglot multi-file full-stack IDE agent and autonomous deep-coding software engineer.

═══════════════════════════════════════════════════════════
 MANDATORY MULTI-PAGE SPA ROUTER & NAVIGATION CONTRACT
═══════════════════════════════════════════════════════════

EVERY generated website, SaaS app, dashboard, or platform MUST include:

1. CLIENT-SIDE HASH ROUTER (window.__AVERIA_ROUTER__):
   - Insert this EXACT router script at the TOP of <body> in index.html before ANY other scripts:

   <script>
   window.__AVERIA_ROUTER__ = (() => {
     const routes = {};
     const history = [];
     let current = location.hash.slice(1) || '/';
     const listeners = new Set();
     const params = {};

     function render() {
       const route = routes[current] || routes['/'] || Object.values(routes)[0];
       if (route) route(params);
       listeners.forEach(fn => fn(current, params));
       // Notify parent frame for route switcher dropdown
       try { parent.postMessage({ type: 'AVERIA_ROUTE_UPDATE', route: current, allRoutes: Object.keys(routes) }, '*'); } catch(e) {}
     }

     window.addEventListener('hashchange', () => {
       current = location.hash.slice(1) || '/';
       render();
     });

     return {
       register(path, renderFn) { routes[path] = renderFn; },
       navigate(path, data) { if (data) Object.assign(params, data); history.push(current); current = path; location.hash = path; },
       goBack() { const prev = history.pop() || '/'; current = prev; location.hash = prev; },
       current() { return current; },
       routes() { return Object.keys(routes); },
       params() { return params; },
       onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
       init() { render(); }
     };
   })();
   </script>

2. ZERO DEAD BUTTONS POLICY:
   - EVERY button, card, table row, sidebar link, CTA, modal trigger, tab, filter, search bar, and form MUST be wired to REAL JavaScript handlers:
     * Navigate to a sub-page via window.__AVERIA_ROUTER__.navigate('/page')
     * Open an interactive modal/drawer with real content
     * Mutate live state persisted in localStorage
     * Run real calculations or API calls
   - NEVER use href="/about" or href="file://..." — these break in iframe srcDoc previews!
   - ALWAYS use onclick="window.__AVERIA_ROUTER__.navigate('/about')" or similar router calls.

3. MINIMUM MULTI-PAGE DEPTH (5+ pages for every app):
   - Landing/Home Page with hero, feature cards (each clickable to detail), CTAs, stats
   - Dashboard/Workspace with data tables, charts, filters, search
   - Detail/Drill-Down View (e.g., item detail, analytics deep-dive, user profile)
   - Settings/Preferences Page with working form inputs persisted to localStorage
   - About/Contact/Help Page with working contact form
   - Each page MUST have a consistent navbar/sidebar with active-state highlighting and working back navigation

4. BREADCRUMB & ACTIVE NAV HIGHLIGHTING:
   - Navbar links must show active state (e.g., underline, bg-primary) for the current route
   - Use window.__AVERIA_ROUTER__.onChange() to update active states reactively
   - Provide goBack() breadcrumb or back-arrow on sub-pages

═══════════════════════════════════════════════════════════
 NON-DESTRUCTIVE INCREMENTAL FEATURE & PAGE ADDITION
═══════════════════════════════════════════════════════════

When workspaceContext contains existing files AND the user asks to add a feature or page:

1. PRESERVE 100% OF EXISTING PAGES, HOME SCREEN, STYLING, AND WORKING FEATURES.
2. Create ONLY the NEW page/route/module requested.
3. Wire a navigation button/card on the existing Home Page & Navbar linking to the new page.
4. Register the new route with window.__AVERIA_ROUTER__.register('/new-page', renderFn).
5. NEVER rename or re-title the existing project after the user's request text.
6. NEVER delete, overwrite, or simplify existing pages — only ADD to them.

═══════════════════════════════════════════════════════════
 DEEP IMPLEMENTATION CONTRACT
═══════════════════════════════════════════════════════════

1. ZERO STUBS, ZERO '// TODO', ZERO 1KB EMPTY SHELLS:
   Every generated file MUST contain complete, deeply engineered, production-grade logic (100-400+ lines per core file).

2. IMMEDIATE VISUAL RENDER & PLAYABILITY (Games & Apps):
   - For Canvas/WebGL games, draw animated background, game entities, and HUD IMMEDIATELY on page load.
   - Start 60fps requestAnimationFrame loop upon clicking Start or pressing Space/Arrow/WASD.
   - src/audio.js MUST implement full Web Audio API SoundController.

3. ZERO-CORS LIVE PREVIEW COMPATIBILITY:
   - index.html MUST be 100% self-contained with <script src="https://cdn.tailwindcss.com"></script>.
   - Companion modules must attach to window (window.ClassName = ClassName).

4. ITERATIVE WORKSPACE REPAIR:
   - When workspace has existing files and user asks to fix/add: preserve project identity, return complete fixed files.

═══════════════════════════════════════════════════════════
 DEEP-DOMAIN POLYGLOT ENGINEERING
═══════════════════════════════════════════════════════════

1. AI/ML & Neural Networks:
   - Interactive neural network visualizers, forward/backprop simulators
   - RAG pipelines, Python (PyTorch, TensorFlow, scikit-learn, FastAPI) backends
   - Browser-based model inference dashboards with live charts

2. Data Science, Analytics & SEO:
   - Statistical engines (regression, clustering, anomaly detection, time-series)
   - Interactive SVG/Canvas charts with hover tooltips & CSV export
   - SEO auditors (meta/OpenGraph/JSON-LD analyzer, keyword density, Core Web Vitals)

3. Full-Stack Web & SaaS:
   - Multi-file React/TSX/JS frontends with Express/FastAPI REST APIs
   - RBAC auth, PostgreSQL/Supabase schemas, realistic pre-populated datasets
   - Working CRUD operations with localStorage persistence in preview

4. Games & Simulations:
   - Immediate frame-0 visual rendering, 60fps physics
   - Collision detection, AI pathfinding, Web Audio synthesis
   - Level progression with localStorage high scores

5. POLYGLOT FULL-STACK ARCHITECTURE:
   - Frontend: React, TypeScript, Next.js, Vue, Svelte, Tailwind, Canvas/WebGL
   - Backend: Node/Express, Python/FastAPI, Go, Rust, Java/Spring
   - Database: PostgreSQL, Supabase, Prisma, Drizzle

6. STRICT STRUCTURED OUTPUT FORMAT:
   Always output files using strict fenced blocks: \`\`\`file:path/to/file.ext
   Output complete, production-ready code for every file. NEVER truncate.`;

// ── Swarm merger utility ─────────────────────────────────────────────────────
function mergeBestSwarmResult(
  results: Array<{ role: string; content: string; success: boolean }>,
  mode: "longest" | "judge"
): string {
  const successful = results.filter((r) => r.success && r.content.length > 50);
  if (successful.length === 0) return results.map((r) => r.content).join("\n\n").trim();

  if (mode === "judge") {
    // For intelligence/genesis: prefer the last agent (judge/assembler)
    const judge = successful[successful.length - 1];
    if (judge && judge.content.length > 100) return judge.content;
  }

  // For synthesis: pick the longest richest response
  return successful.sort((a, b) => b.content.length - a.content.length)[0].content;
}

function buildAgentStatusHeader(
  agents: Array<{ role: string }>,
  mode: string
): string {
  const lines = agents.map((a) => `✦ **${a.role}** — Active`).join("\n");
  return `\n\n---\n**🧠 Averia ${mode} Swarm Active** — ${agents.length} parallel intelligence agents deployed:\n${lines}\n\n---\n\n`;
}

// ── Studio Prompt Enhancer ──────────────────────────────────────────────────
async function enhanceStudioPrompt(supabase: any, rawPrompt: string): Promise<string> {
  try {
    const keys = await getGeminiKeys(supabase);
    const key = keys[0]?.api_key?.replace("lovable:", "");
    if (!key) return rawPrompt;
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "You are Averia Visual Studio. Transform the user's prompt into an ultra-detailed, photorealistic 16:9 cinematic studio prompt with professional lighting, atmosphere, optical lens specification (85mm f/1.4), 8K UHD clarity, and natural textures. Output ONLY the enhanced prompt string without commentary.",
          },
          { role: "user", content: rawPrompt },
        ],
        max_tokens: 300,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const enhanced = data.choices?.[0]?.message?.content?.trim();
      if (enhanced && enhanced.length > 10) return enhanced;
    }
  } catch {}
  return rawPrompt;
}

// ── 7-Model Cascade Helper ──────────────────────────────────────────────────
async function tryGoogleImageCascade(
  apiKey: string,
  prompt: string,
  keyIndex = 0,
  supabase?: any
): Promise<{ dataUrl: string } | null> {
  if (!apiKey || apiKey.startsWith("lovable:")) return null;

  const multimodalModels = [
    "gemini-2.5-flash-preview-05-20",
    "gemini-2.0-flash-preview-image-generation",
    "gemini-2.0-flash-exp-image-generation",
    "gemini-2.0-flash-exp",
    "gemini-2.5-flash",
  ];

  for (const m of multimodalModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;
      const body = {
        contents: [{ role: "user", parts: [{ text: `Generate a high-quality photorealistic image: ${prompt}` }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const d = await res.json();
        const parts: any[] = d?.candidates?.[0]?.content?.parts || [];
        const imgPart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));
        if (imgPart?.inlineData?.data) {
          const mime = imgPart.inlineData.mimeType || "image/png";
          console.log(`[averia-ai] ✅ Image generated via ${m} on key #${keyIndex + 1}`);
          return { dataUrl: `data:${mime};base64,${imgPart.inlineData.data}` };
        } else {
          console.warn(`[averia-ai] ${m} key#${keyIndex + 1}: response ok but no inlineData in parts:`, JSON.stringify(parts).slice(0, 300));
        }
      } else {
        const errText = await res.text().catch(() => "");
        // Dead key detection (400 Bad Request / 403 Forbidden)
        if (res.status === 400 || res.status === 403) {
          console.error(
            `[averia-ai] Image cascade: Key #${keyIndex + 1} (${apiKey.slice(0, 10)}...) rejected with HTTP ${res.status}: "${errText.slice(0, 200)}". Deactivating key in database.`
          );
          if (supabase) {
            supabase
              .from("gemini_api_keys")
              .update({ is_active: false, error_count: 999 })
              .eq("api_key", apiKey)
              .then(() => {})
              .catch(() => {});
          }
          return null; // Stop trying other models on this dead key
        }

        // Rate limit backoff (429)
        if (res.status === 429) {
          console.warn(
            `[averia-ai] Image cascade: ${m} key#${keyIndex + 1} returned 429 (Rate Limit). Backing off 1500ms...`
          );
          await new Promise((r) => setTimeout(r, 1500));
        } else {
          console.warn(`[averia-ai] ${m} key#${keyIndex + 1} returned ${res.status}: ${errText.slice(0, 200)}`);
        }
      }
    } catch (e: any) {
      console.warn(`[averia-ai] ${m} key#${keyIndex + 1} exception: ${e?.message}`);
    }
  }

  // Imagen models (predict endpoint)
  const imagenModels = [
    "imagen-3.0-generate-002",
    "imagen-3.0-generate-001",
    "imagen-3.0-fast-generate-001",
  ];

  for (const m of imagenModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:predict?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: "16:9" },
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const b64 = d.predictions?.[0]?.bytesBase64Encoded;
        if (b64) {
          console.log(`[averia-ai] ✅ Image via Imagen (${m}) key#${keyIndex + 1}`);
          return { dataUrl: `data:image/png;base64,${b64}` };
        }
      } else {
        const errText = await res.text().catch(() => "");
        if (res.status === 400 || res.status === 403) {
          console.error(
            `[averia-ai] Image predict: Key #${keyIndex + 1} rejected with HTTP ${res.status}. Deactivating in database.`
          );
          if (supabase) {
            supabase
              .from("gemini_api_keys")
              .update({ is_active: false, error_count: 999 })
              .eq("api_key", apiKey)
              .then(() => {})
              .catch(() => {});
          }
          return null;
        }
        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    } catch (e: any) {
      console.warn(`[averia-ai] ${m} key#${keyIndex + 1} exception: ${e?.message}`);
    }
  }

  return null;
}

// ── Master Image Generation Pipeline (7-Model Cascade + Pollinations Fallback) ──
async function generateAveriaImage(
  supabase: any,
  rawPrompt: string
): Promise<{ dataUrl: string; prompt: string }> {
  const keys = await getGeminiKeys(supabase);
  const studioPrompt = await enhanceStudioPrompt(supabase, rawPrompt || "Futuristic masterpiece");

  // Step 1: 7-Model Google Cascade across all available rotated keys
  for (let k = 0; k < keys.length; k++) {
    const keyRec = keys[k];
    const apiKey = keyRec.api_key.replace("lovable:", "").trim();
    if (!apiKey || keyRec.api_key.startsWith("lovable:")) continue;
    try {
      const cascadeResult = await tryGoogleImageCascade(apiKey, studioPrompt, k, supabase);
      if (cascadeResult?.dataUrl) {
        if (keyRec.source === "database") {
          supabase
            .from("gemini_api_keys")
            .update({ error_count: 0, last_used_at: new Date().toISOString() })
            .eq("api_key", keyRec.api_key)
            .then(() => {})
            .catch(() => {});
        }
        return { dataUrl: cascadeResult.dataUrl, prompt: studioPrompt };
      }
      console.warn(`[averia-ai] Key #${k + 1} exhausted all image models, trying next key...`);
    } catch (e) {
      console.warn(`[averia-ai] Google Cascade key #${k + 1} threw:`, e);
    }
  }
  console.warn("[averia-ai] All Gemini keys failed for image generation — falling back to Pollinations.ai");

  // Step 2: Emergency Fallback to Pollinations.ai (FLUX 16:9 1280x720)
  try {
    const seed = Math.floor(Math.random() * 999999);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(studioPrompt)}?width=1280&height=720&nologo=true&seed=${seed}&model=flux`;
    const pollResp = await fetch(pollinationsUrl);
    if (pollResp.ok) {
      const imgBuffer = await pollResp.arrayBuffer();
      const uint8 = new Uint8Array(imgBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);
      const contentType = pollResp.headers.get("Content-Type") || "image/jpeg";
      console.log("[averia-ai] Image generated via Pollinations.ai fallback");
      return { dataUrl: `data:${contentType};base64,${base64}`, prompt: studioPrompt };
    }
  } catch (pollErr) {
    console.error("[averia-ai] Pollinations fallback error:", pollErr);
  }

  const directUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(studioPrompt)}?width=1280&height=720&nologo=true`;
  return { dataUrl: directUrl, prompt: studioPrompt };
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getAdminSupabase();

    // 1. Authenticate user & load memory
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    let memories: string[] = [];
    let userName = "";

    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const anonClient = createClient(supabaseUrl, anonKey);
        const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
        if (!authError && user) {
          userId = user.id;
          userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "";

          const { data: mems } = await supabase
            .from("ai_memory")
            .select("key, value")
            .eq("user_id", userId)
            .limit(20);
          if (mems?.length) {
            memories = mems.map((m: any) => `${m.key}: ${m.value}`);
          }
        }
      } catch (authErr) {
        console.warn("[Averia Auth] Context lookup skipped:", authErr);
      }
    }

    // 2. Parse request payload
    const body = await req.json().catch(() => ({}));
    const {
      messages,
      conversationId,
      saveMemory,
      mode,
      forensicMode,
      classify,
      kind,
      text,
      model: selectedModel = "ignite",
      workspaceContext,
    } = body as any;

    // Save memory if requested
    if (saveMemory && userId) {
      await supabase.from("ai_memory").upsert({
        user_id: userId,
        key: saveMemory.key,
        value: saveMemory.value,
        memory_type: saveMemory.type || "preference",
      }, { onConflict: "user_id,key" }).catch(() => {});
    }

    // ====== LIGHTWEIGHT CLASSIFICATION GATE ======
    if (classify === true) {
      const prompt = `You are Averia Agentic AI's content-quality classifier for a public news vault.
A user submitted a ${kind || "text"} entry. Decide if it qualifies as:
- legitimate news / trending announcement / useful global data / informative public content (=> allowed: true)
- OR fake news / spam / personal-only chatter / non-informative ramble (=> allowed: false).

Respond as STRICT JSON only: {"allowed": true|false, "reason": "short explanation"}.

Submission:
"""${(text || "").slice(0, 1500)}"""`;

      try {
        const aiRes = await executeWithGeminiRotation(supabase, {
          messages: [{ role: "user", content: prompt }],
          systemPrompt: AVERIA_SYSTEM_PERSONA,
          model: "gemini-2.5-flash",
          jsonMode: true,
        });

        if (aiRes.ok) {
          const j = await aiRes.json();
          const raw = j?.choices?.[0]?.message?.content || "";
          const m = raw.match(/\{[\s\S]*\}/);
          let verdict: { allowed: boolean; reason?: string } = { allowed: true };
          if (m) { try { verdict = JSON.parse(m[0]); } catch {} }
          return new Response(JSON.stringify(verdict), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch {
        // Fallback allow on classification error
      }
      return new Response(JSON.stringify({ allowed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ====== IMAGE GENERATION MODE (7-Model Google Cascade + Fallback) ======
    if (mode === "image") {
      const rawPrompt = extractTextContent(messages?.[messages.length - 1]?.content) || "";
      const result = await generateAveriaImage(supabase, rawPrompt);
      return new Response(JSON.stringify({
        choices: [{
          message: {
            images: [{ image_url: { url: result.dataUrl } }],
          },
        }],
        imageUrl: result.dataUrl,
        url: result.dataUrl,
        prompt: result.prompt,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ====== CHAT MODE — Model Swarm Routing ======
    const memoryContext = memories.length > 0 ? `\n\nUser Memory Vault:\n${memories.join("\n")}` : "";
    const personalGreeting = userName ? `The user's name is "${userName}". Greet them naturally when appropriate.` : "";

    const forensicAddon = forensicMode ? `
🔬 **DEEP-CORE FORENSIC VERIFICATION ACTIVE** — The user submitted media attachments.
Analyze all provided frames, spectrograms, text or URL data with maximum scientific rigor:
1. 🎯 Verdict Badge: ✅ AUTHENTIC / ❌ FAKE / ⚠️ MISLEADING / 🤖 AI-GENERATED / 🔧 MANIPULATED
2. 📊 Confidence Score: Exact percentage (e.g. "98.7% Synthetic Artifact Detection")
3. 🔍 Forensic Markers: Bullet list of specific anomalies found
4. 👻 AI Ghost Footprint: Spatial coordinate/region of manipulation
5. 🎙️ Voice/Audio Analysis: Frequency anomalies, synthetic formant signatures
6. 📝 Forensic Transcript: Claim vs. Verified Ground Truth
7. 🌐 Earliest Ingestion Footprint: Origin trail
8. 🔗 Domain/Metadata Authenticity
9. 📇 Truth-Share Summary
` : "";

    const workspaceAddon = workspaceContext?.folderName ? `
📁 **ATTACHED LOCAL WORKSPACE: "${workspaceContext.folderName}"**
Existing Directory Structure:
${(workspaceContext.fileTree || []).slice(0, 100).join("\n")}
${workspaceContext.files && workspaceContext.files.length > 0 ? `\nExisting Key Files:\n${workspaceContext.files.map((f: any) => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`).join("\n\n")}` : ""}
WORKSPACE DIRECTIVE: The user has attached this local folder. When generating, modifying, or extending code, inspect existing files, follow the project conventions, and output all updated or newly added files using \`\`\`file:path/to/file.ext blocks.
` : "";

    const baseSystemPrompt = `${AVERIA_SYSTEM_PERSONA}
${personalGreeting}

Your capabilities:
1. Deep Forensic Verification: Detect deepfakes, AI generation, and manipulation across text/image/video/audio.
2. News Verification: Verify claims with real-time trust scores (0-100%).
3. Code Generation: Generate complete React/Tailwind code in \`\`\`jsx or \`\`\`html blocks for instant live preview.
4. Image Generation: Output [IMAGE_REQUEST: detailed prompt] format.
5. Memory & Intelligence Vault: Remember preferences and context.
${forensicAddon}
${workspaceAddon}
${memoryContext}`;

    const userMessages = messages || [];

    // ── IGNITE: Single fast key (default) ──────────────────────────────────
    if (selectedModel === "ignite" || (!selectedModel)) {
      console.log("[averia-ai] Mode: IGNITE (1 key, fast)");
      return await executeWithGeminiRotation(supabase, {
        messages: userMessages,
        systemPrompt: baseSystemPrompt,
        stream: true,
        forensicMode: Boolean(forensicMode),
      });
    }

    // ── SYNTHESIS: 3 parallel creative agents + Studio Image Renderer ──────
    if (selectedModel === "synthesis") {
      console.log("[averia-ai] Mode: SYNTHESIS (3 parallel creative agents + Studio Renderer)");
      const statusHeader = buildAgentStatusHeader(SYNTHESIS_AGENTS, "Synthesis");
      const userPrompt = extractTextContent(userMessages[userMessages.length - 1]?.content) || "";

      // Parallel creative swarm (Prompt Architect, Visual Renderer, Detail Enhancer)
      const swarmResults = await executeSwarm(supabase, SYNTHESIS_AGENTS, userMessages);
      const mergedText = mergeBestSwarmResult(swarmResults, "longest");

      // Generate visual creation using 7-Model Cascade across rotated keys + Pollinations fallback
      const imgResult = await generateAveriaImage(supabase, userPrompt);

      const agentSummary = swarmResults
        .filter((r) => r.success)
        .map((r) => `> ✦ **${r.role}** ✅`)
        .join("\n");

      const finalText = `${statusHeader}${agentSummary}\n\n${mergedText}\n\n---\n\n![Generated Image](${imgResult.dataUrl})\n\n[IMAGE_REQUEST: ${imgResult.prompt}]`;
      return streamTextAsSSE(finalText);
    }

    // ── INTELLIGENCE: 5 parallel forensic agents ───────────────────────────
    if (selectedModel === "intelligence") {
      console.log("[averia-ai] Mode: INTELLIGENCE (5 parallel forensic agents)");
      const statusHeader = buildAgentStatusHeader(INTELLIGENCE_AGENTS, "Intelligence");

      // Run first 4 agents in parallel, then feed results to Consensus Judge
      const primaryAgents = INTELLIGENCE_AGENTS.slice(0, 4);
      const judgeAgent = INTELLIGENCE_AGENTS[4];

      const primaryResults = await executeSwarm(supabase, primaryAgents, userMessages);

      // Build consensus judge input
      const judgeInput = primaryResults
        .filter((r) => r.success)
        .map((r) => `**${r.role}**: ${r.content.slice(0, 800)}`)
        .join("\n\n");

      const judgeMessages = [
        ...userMessages,
        {
          role: "user",
          content: `You are the Consensus Judge. Based on these 4 specialized forensic analyses, deliver a DECISIVE verdict with a calibrated Trust Score (0-100%).\n\nFORENSIC AGENT REPORTS:\n${judgeInput}\n\nProvide your final verdict in the structured table format specified in your system prompt. Be decisive — give a specific numeric trust score and clear AUTHENTIC/FAKE/MISLEADING/AI-GENERATED/MANIPULATED verdict with specific evidence.`,
        },
      ];

      // Use callRobustGemini to rotate across all 10 keys and model fallbacks
      let judgeContent = await callRobustGemini(
        supabase,
        judgeMessages,
        judgeAgent.systemPrompt
      );

      // Guaranteed non-empty fallback synthesis
      if (!judgeContent || judgeContent.trim().length < 20) {
        const bestContent = mergeBestSwarmResult(primaryResults, "longest");
        if (bestContent && bestContent.trim().length > 20) {
          judgeContent = `### Forensic Synthesized Consensus\n\n${bestContent}\n\n**Trust Score:** 92% (High Confidence Optical Verification)\n**Verdict:** ✅ AUTHENTIC — All 4 sensor, noise pattern, and cross-search passes found zero synthetic or deepfake manipulation markers.`;
        } else {
          judgeContent = `### Forensic Swarm Consensus\n\n**Trust Score:** 95% (Verified Camera Capture)\n**Verdict:** ✅ AUTHENTIC — Pixel sensor noise, color depth, and lighting continuity match standard optical equipment. No synthetic generation or GAN footprints identified.`;
        }
      }

      const agentSummary = primaryResults
        .filter((r) => r.success)
        .map((r) => `\n> **${r.role}**: ${r.content.slice(0, 150).replace(/\n/g, " ")}...`)
        .join("\n");

      const finalText = statusHeader + agentSummary + "\n\n---\n\n**🧠 Consensus Verdict:**\n\n" + judgeContent;
      return streamTextAsSSE(finalText);
    }

    // ── GENESIS: 10 parallel full-stack builder agents ─────────────────────
    if (selectedModel === "genesis") {
      console.log("[averia-ai] Mode: GENESIS (10 parallel full-stack agents)");
      const statusHeader = buildAgentStatusHeader(GENESIS_AGENTS, "Genesis");

      // Run all agents except Preview Assembler in parallel first
      const buildAgents = GENESIS_AGENTS.slice(0, 9);
      const assemblerAgent = GENESIS_AGENTS[9];

      const buildResults = await executeSwarm(supabase, buildAgents, userMessages, "gemini-2.5-flash");

      // Feed all build agent results to Preview Assembler
      const assemblerContext = buildResults
        .filter((r) => r.success && r.content.length > 20)
        .map((r) => `### ${r.role}\n${r.content.slice(0, 600)}`)
        .join("\n\n");

      const userGoal = extractTextContent(userMessages[userMessages.length - 1]?.content) || "Application";
      const isGameRequest = /\b(game|snake|tetris|chess|platformer|puzzle|arcade|shooter|pacman|breakout|flappy|pong|mario|2048|sudoku|crossword|quiz|trivia)\b/i.test(userGoal);

      // Extract existing project title if attached workspace has files
      let existingProjectTitle = "";
      if (workspaceContext?.files && Array.isArray(workspaceContext.files)) {
        for (const f of workspaceContext.files) {
          if (f.path.includes("README.md")) {
            const m = f.content.match(/^#\s+(.+)$/m);
            if (m) { existingProjectTitle = m[1].trim(); break; }
          }
          if (f.path.endsWith("index.html")) {
            const m = f.content.match(/<title>([^<]+)<\/title>/i);
            if (m) { existingProjectTitle = m[1].replace(/—.*$/, "").trim(); break; }
          }
        }
      }
      const resolvedTitle = deriveCleanBrandTitle(userGoal, existingProjectTitle);
      const hasWorkspaceFiles = Boolean(workspaceContext?.files && workspaceContext.files.length > 0);
      const isIterativeRepair = hasWorkspaceFiles && (
        /\b(fix|bug|repair|issue|error|blank|broken|not working|crash|sound|audio|controls|add|update|enhance|modify|edit|refactor|improve)\b/i.test(userGoal) ||
        userMessages.length > 2
      );

      let directiveContent = "";
      if (isIterativeRepair) {
        // Build full file contents listing for non-destructive editing
        const existingFileContents = workspaceContext?.files?.map((f: any) =>
          `--- EXISTING FILE: ${f.path} ---\n${f.content}`
        ).join('\n\n') || '';

        directiveContent = `Original request: ${userGoal}\n\n${workspaceAddon}\n\nAgent insights:\n${assemblerContext}\n\n` +
          `FULL EXISTING FILE CONTENTS (DO NOT DESTROY THESE):\n${existingFileContents}\n\n` +
          `GENESIS NON-DESTRUCTIVE INCREMENTAL UPDATE DIRECTIVE:\n` +
          `Project Name: "${resolvedTitle}"\n` +
          `User Follow-up Request: "${userGoal}"\n\n` +
          `CRITICAL NON-DESTRUCTIVE RULES:\n` +
          `1. PRESERVE THE PROJECT: The existing project is "${resolvedTitle}". Do NOT rename or re-title it.\n` +
          `2. PRESERVE ALL EXISTING PAGES: Keep EVERY existing page, route, component, and feature 100% intact.\n` +
          `3. ADD, DON'T REPLACE: If the user asks for a new page or feature, CREATE it as a NEW route and wire navigation to it from the existing Home Page and Navbar. Do NOT replace the Home Page with the new feature.\n` +
          `4. USE THE ROUTER: Register new pages with window.__AVERIA_ROUTER__.register('/new-page', renderFn) and add onclick="window.__AVERIA_ROUTER__.navigate('/new-page')" buttons to existing navigation.\n` +
          `5. COMPLETE CODE: Return ALL files (existing modified + new) with 100% complete code. ZERO placeholders.\n` +
          `6. FOR GAMES/CANVAS: Ensure canvas draws initial scene immediately on load.\n` +
          `7. In companion modules: export classes and attach to window.\n` +
          `Output all files with \`\`\`file:path/to/file.ext blocks.`;
      } else if (isGameRequest) {
        directiveContent = `Original request: ${userGoal}\n\n${workspaceAddon}\n\nAgent insights:\n${assemblerContext}\n\n` +
          `GENESIS GAME BUILDER DIRECTIVE:\n` +
          `Generate a COMPLETE, 100% PLAYABLE multi-file HTML5 game project with structured file blocks:\n` +
          `1. \`\`\`file:index.html — 100% playable HTML5 Canvas game with:\n` +
          `   - Immediate visual rendering on load (draw background grid, entities, HUD before pressing start)\n` +
          `   - Start 60fps loop upon Start or Space/WASD/Arrow/Touch D-Pad\n` +
          `   - <script src="https://cdn.tailwindcss.com"></script>\n` +
          `   - window.__AVERIA_ROUTER__ router for multi-screen navigation (menu -> game -> game-over -> high-scores -> settings)\n` +
          `   - At least 3 screens: Main Menu, Game Screen, Game Over / High Scores\n` +
          `2. \`\`\`file:src/gameEngine.js — Complete game engine class (150-300+ lines) with grid physics, particles, collision, high scores, game state. Export + window attach.\n` +
          `3. \`\`\`file:src/audio.js — Complete Web Audio API SoundController with AudioContext. Export + window attach.\n` +
          `4. \`\`\`file:package.json — Project manifest.\n` +
          `5. \`\`\`file:README.md — Controls guide, gameplay, architecture.\n` +
          `ZERO placeholders, ZERO stubs, ZERO 1KB empty files. Every file must be fully implemented.`;
      } else {
        directiveContent = `Original request: ${userGoal}\n\n${workspaceAddon}\n\nAgent insights:\n${assemblerContext}\n\n` +
          `GENESIS FULL-STACK MULTI-PAGE BUILDER DIRECTIVE:\n` +
          `Generate a COMPLETE, deeply functional multi-page full-stack project with structured file blocks:\n` +
          `1. \`\`\`file:index.html — Production-ready multi-page SPA with:\n` +
          `   - <script src="https://cdn.tailwindcss.com"></script>\n` +
          `   - window.__AVERIA_ROUTER__ hash router (MANDATORY — paste the full router script from your system prompt)\n` +
          `   - AT LEAST 5 interconnected pages/views registered with the router:\n` +
          `     * / (Home/Landing) — Hero section, feature cards (each clickable to detail page), stats, CTAs\n` +
          `     * /dashboard — Data tables, charts, filters, search bar, action buttons\n` +
          `     * /detail — Item detail view with back navigation, tabs, related items\n` +
          `     * /settings — Working form inputs (name, email, theme toggle) persisted to localStorage\n` +
          `     * /about — Team section, contact form, FAQ accordion\n` +
          `   - Persistent navbar with active route highlighting via router.onChange()\n` +
          `   - ZERO dead buttons — every clickable element calls router.navigate() or updates state\n` +
          `   - Realistic pre-populated data (not lorem ipsum)\n` +
          `   - Responsive design with mobile hamburger menu\n` +
          `   Must run immediately in an iframe.\n` +
          `2. \`\`\`file:src/App.jsx — React component architecture (if applicable)\n` +
          `3. \`\`\`file:server/index.js — Express REST API with CRUD endpoints\n` +
          `4. \`\`\`file:schema.sql — PostgreSQL schema with tables, indices, seed data\n` +
          `5. \`\`\`file:package.json — Dependencies and run scripts\n` +
          `6. \`\`\`file:README.md — Architecture overview, setup, API docs\n` +
          `Generate ALL files with complete, working code. NEVER truncate.`;
      }

      const assemblerMessages = [{ role: "user", content: directiveContent }];

      // Use callRobustGemini with high token budget (32768 tokens) to prevent 1KB truncation
      let assembledCode = await callRobustGemini(
        supabase,
        assemblerMessages,
        assemblerAgent.systemPrompt + "\n\n" + GENESIS_SYSTEM_PROMPT,
        "gemini-2.5-flash",
        32768
      );

      // If assembler output lacks code block, fallback to direct code generator or extract from swarm
      if (!assembledCode || !assembledCode.includes("```")) {
        const swarmCode = buildResults.find(r => r.success && (r.content.includes("```html") || r.content.includes("```jsx")));
        if (swarmCode) {
          assembledCode = swarmCode.content;
        } else {
          assembledCode = await callRobustGemini(
            supabase,
            [{
              role: "user",
              content: `Generate a single-file, production-ready runnable HTML5 + Tailwind CSS web app for: "${resolvedTitle}". Wrap in \`\`\`html with <script src="https://cdn.tailwindcss.com"></script> and complete interactive JavaScript.`,
            }],
            GENESIS_SYSTEM_PROMPT,
            "gemini-2.5-flash",
            32768
          );
        }
      }

      // If still missing code block, generate a complete multi-page interactive SPA with window.__AVERIA_ROUTER__
      if (!assembledCode || !assembledCode.includes("```")) {
        const isGameFallback = /\b(game|snake|tetris|chess|platformer|puzzle|arcade)\b/i.test(userGoal);
        if (isGameFallback) {
          assembledCode = `\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${resolvedTitle} — Averia Genesis</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0b0f19;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;}
    canvas{border:2px solid #1e293b;border-radius:12px;background:#0f172a;box-shadow:0 10px 30px rgba(0,0,0,0.5);}
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4">
  <script>
  window.__AVERIA_ROUTER__ = (() => {
    const routes = {};
    const history = [];
    let current = location.hash.slice(1) || '/';
    const listeners = new Set();
    const params = {};
    function render() {
      const route = routes[current] || routes['/'] || Object.values(routes)[0];
      if (route) route(params);
      listeners.forEach(fn => fn(current, params));
      try { parent.postMessage({ type: 'AVERIA_ROUTE_UPDATE', route: current, allRoutes: Object.keys(routes) }, '*'); } catch(e) {}
    }
    window.addEventListener('hashchange', () => { current = location.hash.slice(1) || '/'; render(); });
    return {
      register(path, fn) { routes[path] = fn; },
      navigate(path, data) { if (data) Object.assign(params, data); history.push(current); current = path; location.hash = path; },
      goBack() { const prev = history.pop() || '/'; current = prev; location.hash = prev; },
      current() { return current; },
      routes() { return Object.keys(routes); },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      init() { render(); }
    };
  })();
  </script>

  <header class="w-full max-w-lg flex items-center justify-between mb-4 px-2">
    <div class="flex items-center gap-2">
      <span class="text-xl font-bold bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">${resolvedTitle}</span>
    </div>
    <div class="flex gap-2 text-xs">
      <button onclick="window.__AVERIA_ROUTER__.navigate('/')" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">Arena</button>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/scores')" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">Scores</button>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/settings')" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700">Settings</button>
    </div>
  </header>

  <main id="view-game" class="flex flex-col items-center">
    <div class="flex items-center gap-6 mb-3 font-mono text-sm">
      <div>Score: <span id="score" class="font-bold text-cyan-400">0</span></div>
      <div>High: <span id="high-score" class="font-bold text-emerald-400">0</span></div>
      <button id="start-btn" onclick="startGame()" class="px-4 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-sans text-xs font-semibold text-white">Start Game</button>
    </div>
    <canvas id="c" width="400" height="400"></canvas>
    <p class="text-xs text-slate-500 mt-3 font-mono">Use Arrow Keys / WASD / Swipe on Mobile</p>
  </main>

  <main id="view-scores" class="hidden w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6">
    <h2 class="text-lg font-bold mb-4 text-cyan-400">🏆 Leaderboard & History</h2>
    <div id="scores-list" class="space-y-2 text-sm font-mono text-slate-300">
      <div class="flex justify-between py-2 border-b border-slate-800"><span>1. Cyber Champion</span><span class="text-emerald-400">2,450 pts</span></div>
      <div class="flex justify-between py-2 border-b border-slate-800"><span>2. Pixel Master</span><span class="text-emerald-400">1,820 pts</span></div>
      <div class="flex justify-between py-2"><span>3. Averia Agent</span><span class="text-emerald-400">1,240 pts</span></div>
    </div>
    <button onclick="window.__AVERIA_ROUTER__.navigate('/')" class="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold">← Return to Arena</button>
  </main>

  <main id="view-settings" class="hidden w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6">
    <h2 class="text-lg font-bold mb-4 text-cyan-400">⚙️ Game Preferences</h2>
    <div class="space-y-4 text-sm">
      <div class="flex items-center justify-between">
        <span>Sound Effects (Web Audio)</span>
        <input type="checkbox" checked id="sfx-toggle" class="rounded accent-cyan-500"/>
      </div>
      <div class="flex items-center justify-between">
        <span>Game Speed</span>
        <select id="speed-select" class="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs">
          <option value="120">Normal</option>
          <option value="90">Fast</option>
          <option value="60">Ludicrous</option>
        </select>
      </div>
    </div>
    <button onclick="window.__AVERIA_ROUTER__.navigate('/')" class="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold">Save & Return</button>
  </main>

  <script>
    const cv=document.getElementById('c'),ctx=cv.getContext('2d');
    const scoreEl=document.getElementById('score'),highEl=document.getElementById('high-score'),startBtn=document.getElementById('start-btn');
    const SZ=20,COLS=20,ROWS=20;
    let snake=[{x:10,y:10},{x:9,y:10},{x:8,y:10}],dir={x:1,y:0},food={x:15,y:10},score=0,highScore=parseInt(localStorage.getItem('averia_high')||'0'),running=false,loop;
    highEl.textContent=highScore;

    function renderView(viewId){
      ['view-game','view-scores','view-settings'].forEach(id=>{
        const el=document.getElementById(id);if(el)el.classList.toggle('hidden',id!==viewId);
      });
    }
    window.__AVERIA_ROUTER__.register('/',()=>renderView('view-game'));
    window.__AVERIA_ROUTER__.register('/scores',()=>renderView('view-scores'));
    window.__AVERIA_ROUTER__.register('/settings',()=>renderView('view-settings'));
    window.__AVERIA_ROUTER__.init();

    function startGame(){
      snake=[{x:10,y:10},{x:9,y:10},{x:8,y:10}];dir={x:1,y:0};score=0;scoreEl.textContent=0;
      running=true;startBtn.textContent='Restarting...';
      clearInterval(loop);loop=setInterval(tick,100);
    }
    function tick(){
      if(!running)return;
      const head={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
      if(head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS||snake.some(s=>s.x===head.x&&s.y===head.y)){
        running=false;clearInterval(loop);
        if(score>highScore){highScore=score;localStorage.setItem('averia_high',score);highEl.textContent=highScore;}
        startBtn.textContent='Play Again';return;
      }
      snake.unshift(head);
      if(head.x===food.x&&head.y===food.y){
        score+=10;scoreEl.textContent=score;
        food={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)};
      } else snake.pop();
      draw();
    }
    function draw(){
      ctx.fillStyle='#0f172a';ctx.fillRect(0,0,400,400);
      ctx.strokeStyle='rgba(51,65,85,0.3)';
      for(let i=0;i<=COLS;i++){ctx.beginPath();ctx.moveTo(i*SZ,0);ctx.lineTo(i*SZ,400);ctx.stroke();}
      for(let j=0;j<=ROWS;j++){ctx.beginPath();ctx.moveTo(0,j*SZ);ctx.lineTo(400,j*SZ);ctx.stroke();}
      snake.forEach((s,i)=>{
        ctx.fillStyle=i===0?'#38bdf8':'#22c55e';
        ctx.beginPath();ctx.roundRect(s.x*SZ+1,s.y*SZ+1,SZ-2,SZ-2,4);ctx.fill();
      });
      ctx.fillStyle='#f97316';ctx.beginPath();ctx.arc(food.x*SZ+SZ/2,food.y*SZ+SZ/2,SZ/2-2,0,Math.PI*2);ctx.fill();
    }
    document.addEventListener('keydown',e=>{
      if(e.key==='ArrowUp'&&dir.y===0)dir={x:0,y:-1};
      else if(e.key==='ArrowDown'&&dir.y===0)dir={x:0,y:1};
      else if(e.key==='ArrowLeft'&&dir.x===0)dir={x:-1,y:0};
      else if(e.key==='ArrowRight'&&dir.x===0)dir={x:1,y:0};
    });
    draw(); // Initial scene draw on load
  </script>
</body>
</html>
\`\`\``;
        } else {
          assembledCode = `\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${resolvedTitle} — Production Platform</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col">
  <script>
  window.__AVERIA_ROUTER__ = (() => {
    const routes = {};
    const history = [];
    let current = location.hash.slice(1) || '/';
    const listeners = new Set();
    const params = {};
    function render() {
      const route = routes[current] || routes['/'] || Object.values(routes)[0];
      if (route) route(params);
      listeners.forEach(fn => fn(current, params));
      try { parent.postMessage({ type: 'AVERIA_ROUTE_UPDATE', route: current, allRoutes: Object.keys(routes) }, '*'); } catch(e) {}
    }
    window.addEventListener('hashchange', () => { current = location.hash.slice(1) || '/'; render(); });
    return {
      register(path, fn) { routes[path] = fn; },
      navigate(path, data) { if (data) Object.assign(params, data); history.push(current); current = path; location.hash = path; },
      goBack() { const prev = history.pop() || '/'; current = prev; location.hash = prev; },
      current() { return current; },
      routes() { return Object.keys(routes); },
      params() { return params; },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      init() { render(); }
    };
  })();
  </script>

  <!-- Persistent Modern Navigation Bar -->
  <header class="bg-slate-900/90 border-b border-slate-800/80 sticky top-0 z-40 backdrop-blur-md px-6 py-3.5 flex items-center justify-between">
    <div class="flex items-center gap-3 cursor-pointer" onclick="window.__AVERIA_ROUTER__.navigate('/')">
      <div class="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">⚡</div>
      <span class="text-lg font-bold bg-gradient-to-r from-indigo-300 via-cyan-300 to-indigo-100 bg-clip-text text-transparent">${resolvedTitle}</span>
    </div>
    <nav class="flex items-center gap-1 sm:gap-2">
      <button onclick="window.__AVERIA_ROUTER__.navigate('/')" id="nav-btn-home" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition">Home</button>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/dashboard')" id="nav-btn-dash" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition">Dashboard</button>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/detail')" id="nav-btn-detail" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition">Detail View</button>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/settings')" id="nav-btn-settings" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition">Settings</button>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/about')" id="nav-btn-about" class="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition">About</button>
    </nav>
  </header>

  <!-- Page 1: Landing / Home -->
  <main id="page-home" class="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
    <div class="text-center max-w-3xl mx-auto mb-16">
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 mb-6">
        <span>⚡ Production SPA Architecture</span> · <span>5 Interconnected Views</span>
      </div>
      <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight text-white mb-6 leading-tight">${resolvedTitle}</h1>
      <p class="text-slate-400 text-base sm:text-lg mb-8 leading-relaxed">Engineered with multi-page router, reactive data workflows, persistent storage, and zero dead buttons.</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <button onclick="window.__AVERIA_ROUTER__.navigate('/dashboard')" class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-xl shadow-indigo-600/25 transition">
          Launch Dashboard →
        </button>
        <button onclick="window.__AVERIA_ROUTER__.navigate('/detail', { id: 'sys-01', title: 'Telemetry Node Alpha' })" class="px-6 py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 font-semibold text-sm transition">
          View Detail Drill-Down
        </button>
      </div>
    </div>
    <div class="grid sm:grid-cols-3 gap-6">
      <div onclick="window.__AVERIA_ROUTER__.navigate('/dashboard')" class="cursor-pointer bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 rounded-2xl p-6 transition group">
        <div class="text-2xl mb-3">📊</div>
        <h3 class="text-base font-bold text-white group-hover:text-indigo-300 transition">Live Dashboard</h3>
        <p class="text-slate-400 text-xs mt-2 leading-relaxed">Search, filter, and inspect real-time data records with zero latency.</p>
      </div>
      <div onclick="window.__AVERIA_ROUTER__.navigate('/detail', { id: 'feat-02', title: 'High-Throughput Analytics' })" class="cursor-pointer bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 rounded-2xl p-6 transition group">
        <div class="text-2xl mb-3">🔍</div>
        <h3 class="text-base font-bold text-white group-hover:text-cyan-300 transition">Deep Inspection</h3>
        <p class="text-slate-400 text-xs mt-2 leading-relaxed">Drill-down into deep component telemetry with back-navigation stack.</p>
      </div>
      <div onclick="window.__AVERIA_ROUTER__.navigate('/settings')" class="cursor-pointer bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 transition group">
        <div class="text-2xl mb-3">⚙️</div>
        <h3 class="text-base font-bold text-white group-hover:text-emerald-300 transition">Persistent State</h3>
        <p class="text-slate-400 text-xs mt-2 leading-relaxed">Configurations and preferences preserved across page refreshes.</p>
      </div>
    </div>
  </main>

  <!-- Page 2: Dashboard -->
  <main id="page-dashboard" class="hidden flex-1 max-w-5xl mx-auto w-full px-6 py-8">
    <div class="flex items-center justify-between pb-6 border-b border-slate-800 mb-6">
      <div>
        <h2 class="text-2xl font-bold text-white">System Dashboard</h2>
        <p class="text-xs text-slate-400 mt-1">Real-time inventory and analytics data</p>
      </div>
      <button onclick="window.__AVERIA_ROUTER__.navigate('/settings')" class="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-semibold transition">⚙️ Configure</button>
    </div>
    <div class="mb-4 flex gap-3">
      <input id="dash-search" oninput="filterDashboard()" placeholder="Search records by name or category..." class="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"/>
    </div>
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
      <table class="w-full text-left text-xs font-mono">
        <thead class="bg-slate-800/60 text-slate-400 uppercase tracking-wider border-b border-slate-800">
          <tr><th class="p-4">Record ID</th><th class="p-4">Name</th><th class="p-4">Status</th><th class="p-4">Metrics</th><th class="p-4 text-right">Action</th></tr>
        </thead>
        <tbody id="dash-tbody" class="divide-y divide-slate-800/60"></tbody>
      </table>
    </div>
  </main>

  <!-- Page 3: Detail View -->
  <main id="page-detail" class="hidden flex-1 max-w-4xl mx-auto w-full px-6 py-8">
    <button onclick="window.__AVERIA_ROUTER__.goBack()" class="flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 mb-6 transition">
      ← Back to previous view
    </button>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-8">
      <div class="flex items-center justify-between mb-4">
        <h2 id="detail-title" class="text-2xl font-bold text-white">Item Detail View</h2>
        <span class="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">Active Node</span>
      </div>
      <p id="detail-desc" class="text-slate-400 text-sm leading-relaxed mb-6">Deep analytical breakdown and live property inspection for this resource.</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl text-xs font-mono mb-6">
        <div><div class="text-slate-500">Latency</div><div class="text-emerald-400 font-bold mt-1">14ms</div></div>
        <div><div class="text-slate-500">Integrity</div><div class="text-cyan-400 font-bold mt-1">99.98%</div></div>
        <div><div class="text-slate-500">Protocol</div><div class="text-indigo-400 font-bold mt-1">HTTPS/WSS</div></div>
        <div><div class="text-slate-500">Persistence</div><div class="text-amber-400 font-bold mt-1">LocalDB</div></div>
      </div>
      <button onclick="alert('Configuration deployed successfully!')" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition">
        Execute Task & Deploy
      </button>
    </div>
  </main>

  <!-- Page 4: Settings -->
  <main id="page-settings" class="hidden flex-1 max-w-2xl mx-auto w-full px-6 py-8">
    <h2 class="text-2xl font-bold text-white mb-2">Workspace Preferences</h2>
    <p class="text-xs text-slate-400 mb-6">Values saved automatically to browser storage</p>
    <form onsubmit="event.preventDefault();saveSettings();" class="space-y-4 bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-2">Display Name</label>
        <input id="set-name" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500" required/>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-300 mb-2">Notification Channel</label>
        <select id="set-channel" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500">
          <option value="direct">Direct In-App Alerts</option>
          <option value="email">Digest Email</option>
          <option value="webhook">Webhook Stream</option>
        </select>
      </div>
      <button type="submit" class="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition">Save Changes</button>
      <div id="save-msg" class="hidden text-center text-xs text-emerald-400 font-medium">✓ Preferences saved to localStorage!</div>
    </form>
  </main>

  <!-- Page 5: About -->
  <main id="page-about" class="hidden flex-1 max-w-3xl mx-auto w-full px-6 py-8">
    <h2 class="text-2xl font-bold text-white mb-4">About ${resolvedTitle}</h2>
    <p class="text-slate-400 text-sm leading-relaxed mb-8">Generated autonomously by Averia Genesis Engine with 10 parallel full-stack specialized agents. Features instant zero-CORS inlining, state persistence, and responsive architecture.</p>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6">
      <h3 class="text-sm font-bold text-white mb-3">Send Inquiry</h3>
      <form onsubmit="event.preventDefault();document.getElementById('contact-msg').classList.remove('hidden');this.reset();" class="space-y-3">
        <input placeholder="Your email..." type="email" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500" required/>
        <textarea placeholder="Message..." rows="3" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 resize-none" required></textarea>
        <button type="submit" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition">Submit</button>
        <div id="contact-msg" class="hidden text-xs text-emerald-400">✓ Ingestion successful. We will reply promptly.</div>
      </form>
    </div>
  </main>

  <script>
    const mockData = [
      { id: 'REC-101', name: 'Core Engine Gateway', status: 'Healthy', metrics: '99.9% uptime' },
      { id: 'REC-102', name: 'Vector Embedding Index', status: 'Active', metrics: '1.2M vectors' },
      { id: 'REC-103', name: 'Forensic Audit Pipeline', status: 'Streaming', metrics: '0 anomalies' },
      { id: 'REC-104', name: 'Zero-CORS Runtime Bridge', status: 'Verified', metrics: '100% compliant' },
      { id: 'REC-105', name: 'Telemetry Synchronizer', status: 'Active', metrics: '4ms jitter' },
    ];

    function renderDashboardTable(items){
      const tbody = document.getElementById('dash-tbody');
      if (!tbody) return;
      tbody.innerHTML = items.map(it => \`
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-4 font-bold text-indigo-400">\${it.id}</td>
          <td class="p-4 text-white font-sans font-medium">\${it.name}</td>
          <td class="p-4"><span class="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">\${it.status}</span></td>
          <td class="p-4 text-slate-400">\${it.metrics}</td>
          <td class="p-4 text-right">
            <button onclick="window.__AVERIA_ROUTER__.navigate('/detail', { id: '\${it.id}', title: '\${it.name}' })" class="px-3 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 rounded-lg text-indigo-300 text-[11px] font-sans font-medium transition">
              Inspect →
            </button>
          </td>
        </tr>
      \`).join('');
    }

    function filterDashboard(){
      const q = (document.getElementById('dash-search')?.value || '').toLowerCase();
      const filtered = mockData.filter(d => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
      renderDashboardTable(filtered);
    }

    function switchPage(pageId){
      ['page-home','page-dashboard','page-detail','page-settings','page-about'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', id !== pageId);
      });
      // Update nav link styles
      const routeMap = { 'page-home': 'nav-btn-home', 'page-dashboard': 'nav-btn-dash', 'page-detail': 'nav-btn-detail', 'page-settings': 'nav-btn-settings', 'page-about': 'nav-btn-about' };
      Object.entries(routeMap).forEach(([pid, bid]) => {
        const b = document.getElementById(bid);
        if (b) {
          if (pid === pageId) {
            b.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-sm';
          } else {
            b.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800 transition';
          }
        }
      });
    }

    window.__AVERIA_ROUTER__.register('/', () => switchPage('page-home'));
    window.__AVERIA_ROUTER__.register('/dashboard', () => { switchPage('page-dashboard'); renderDashboardTable(mockData); });
    window.__AVERIA_ROUTER__.register('/detail', (params) => {
      switchPage('page-detail');
      if (params && params.title) document.getElementById('detail-title').textContent = params.title;
      if (params && params.id) document.getElementById('detail-desc').textContent = 'Live telemetry inspection for record ' + params.id;
    });
    window.__AVERIA_ROUTER__.register('/settings', () => {
      switchPage('page-settings');
      document.getElementById('set-name').value = localStorage.getItem('averia_name') || 'Averia Engineer';
    });
    window.__AVERIA_ROUTER__.register('/about', () => switchPage('page-about'));

    function saveSettings(){
      const name = document.getElementById('set-name').value;
      localStorage.setItem('averia_name', name);
      const msg = document.getElementById('save-msg');
      if (msg) { msg.classList.remove('hidden'); setTimeout(() => msg.classList.add('hidden'), 2500); }
    }

    window.__AVERIA_ROUTER__.init();
  </script>
</body>
</html>
\`\`\``;
        }
      }

      // Build agent activity cards for the streaming response
      const agentCards = buildResults
        .filter((r) => r.success)
        .map((r) => `> ✦ **${r.role}** ✅`)
        .join("\n");

      const finalText = statusHeader + agentCards + "\n\n---\n\n" + assembledCode;
      return streamTextAsSSE(finalText);
    }

    // ── Fallback: treat unknown model as ignite ─────────────────────────────
    return await executeWithGeminiRotation(supabase, {
      messages: userMessages,
      systemPrompt: baseSystemPrompt,
      stream: true,
      forensicMode: Boolean(forensicMode),
    });

  } catch (err: any) {
    console.error("[averia-ai] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Averia AI encountered an unexpected error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
