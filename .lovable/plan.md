## Averia Agentic AI Persistent Workspace — Scope Confirmation

This spec is very large. Before I burn a full budget wave, confirm the priorities. I will implement all of the below unless you say otherwise.

### 1. Root routing & shell (Section 0.5 + Section 1)
- Authenticated `/` renders the new **AveriaWorkspace** shell (Averia AI takes over as the landing view).
- Global `Header` (horizontal navbar) hidden inside this shell only. Other pages (Pricing, Dashboard, News direct URLs, Chat direct URLs) keep the Header untouched.
- BootLauncher default-launch preference still respected.

### 2. Persistent Left Sidebar (Section 2) — ChatGPT/Gemini style
- New `AveriaSidebar` component, `isSidebarOpen` boolean state, hardware-accelerated slide transform, right pane flexes to 100% when collapsed.
- Header row: existing purple "Averia AI" wordmark (unchanged) + collapse `[]` icon.
- Below: `+ New chat`, `🔍 Search chats` (filters Recent list live), `🖼 Images` (jumps to image-mode).
- **Other** group: `Trade` (visual-only for now, no data), `User chats`, `News` — click swaps the RIGHT pane only (in-place mount of existing `Chat` and `News` page components), sidebar never unmounts.
- **Engine card**: `Averia 1.0 Axion` with toggle + `upgrade >` link + coin progress bar + "0 coins reset on 01 Jun" line. Below: three model toggles (`Intelligence`, `Synth`, `Velo`) that write into the active model context.
- **All Project** section: dynamically maps `user_projects` table (already exists via agentic AI). No dummy data. Each card shows title + created date + `[Published]` badge when deployed.
- **Recent** chat history from `ai_conversations`, each row has `⋮` menu → **Copy** (writes full thread to clipboard) and **Highlight** (popover with AI bullet summary).

### 3. Central workspace (Section 3)
- Top ribbon: `+ Add Users` pill (opens modal → enter Averia ID → injects peer into current conversation as multi-user shared session), `+ Add Project` pill (opens modal → name + optional repo URL → creates row in `user_projects`), right side `▲ Upgrade` → `/pricing`, avatar (single or dual-overlap based on active joint workspace).
- Greeting: `Command the network, {firstName}` centered.
- Prompt bar: `+ Ask Averia` left label (opens existing + menu for attachments/camera/paste — already built), center model selector dropdown (Velo/Synth/Intelligence), right mic button using Web Speech API.
- Image paste + file attachment already work in current AveriaAI; I'll port that logic into the new shell.

### 4. Publish button for projects (Section 2 sub-item)
- `[Public]` button in top-right of the project preview area inside a project workspace. Click → creates/updates a `project_publishes` row with a shareable slug (`/p/:slug` public route serving the project's stored HTML/code). Card shows `[Published]` ribbon.
- **NOTE**: True external sandbox execution of arbitrary user code is a much larger infra task. I will ship a read-only published preview route that renders the project's stored code inside a sandboxed iframe. Full arbitrary-npm-package server execution is out of scope for this wave — say so if you need it and I'll design a separate phase.

### 5. Explicit non-touches (Section 0)
- No changes to Real News internals, Debunked page, Chat page internals, Pricing, Dashboard internals, logo styling, joint account logic, reels loop.

### Out-of-scope in this wave (call out to confirm)
- Real Trade data integration (rendered as neutral placeholder tab).
- Full multi-tenant sandboxed code execution for published projects (delivered as sandboxed iframe preview only).
- Real-time multi-user simultaneous chat with the AI from separate devices — I'll wire the DB layer (`shared_ai_conversations` already exists) and the invite flow, but end-to-end streaming to N devices needs a websocket layer; I'll use Supabase realtime on the messages table which is close enough for chat sync.

### Files created
- `src/pages/AveriaWorkspace.tsx` (new root)
- `src/components/averia/AveriaSidebar.tsx`
- `src/components/averia/EngineCard.tsx`
- `src/components/averia/ProjectsList.tsx`
- `src/components/averia/RecentChats.tsx` (with ⋮ menu + Highlight modal)
- `src/components/averia/AddUsersModal.tsx`
- `src/components/averia/AddProjectModal.tsx`
- `src/components/averia/PromptBar.tsx` (mic + model select + attachments)
- `src/pages/PublishedProject.tsx` (`/p/:slug` sandboxed iframe view)
- Migration: `project_publishes` table + RLS/grants

### Files edited
- `src/App.tsx` — new `/` route for authed users, `/p/:slug`
- `src/pages/Index.tsx` — redirect authed → workspace
- Reuse existing `Chat.tsx` and `News.tsx` as embedded panes (no internal edits)

**Confirm to proceed, or trim.** If you just say "go", I'll build all of the above in one shot.