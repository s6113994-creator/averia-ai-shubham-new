// Averia Universal Multi-Tenant Backend Runtime
// Provides real CRUD REST API + Auth for every Genesis-generated app
// Routes: /projects/:projectId/:collection  (GET, POST, PATCH, DELETE)
//         /auth/signup, /auth/login, /auth/me

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/keyManager.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(msg: string, status = 400) {
  return json({ error: msg }, status);
}

// ── Seed data for common collections ──────────────────────────────────────────
const SEED_DATA: Record<string, object[]> = {
  products: [
    { id: "p1", name: "Wireless Headphones Pro", price: 129.99, category: "Electronics", stock: 42, rating: 4.8, image: null, description: "Premium wireless headphones with 40h battery life and active noise cancellation." },
    { id: "p2", name: "Ergonomic Office Chair", price: 349.99, category: "Furniture", stock: 15, rating: 4.6, image: null, description: "Lumbar-support office chair with breathable mesh and adjustable armrests." },
    { id: "p3", name: "Mechanical Keyboard TKL", price: 89.99, category: "Electronics", stock: 78, rating: 4.7, image: null, description: "Tenkeyless mechanical keyboard with blue switches and RGB backlight." },
    { id: "p4", name: "Minimalist Desk Lamp", price: 45.00, category: "Home", stock: 120, rating: 4.5, image: null, description: "LED desk lamp with 5 brightness levels and USB charging port." },
    { id: "p5", name: "Cold Brew Coffee Maker", price: 29.99, category: "Kitchen", stock: 55, rating: 4.9, image: null, description: "1-gallon cold brew maker with extra-fine mesh filter and airtight lid." },
    { id: "p6", name: "Yoga Mat Premium", price: 68.00, category: "Fitness", stock: 33, rating: 4.7, image: null, description: "Non-slip natural rubber yoga mat, 6mm thick, with carrying strap." },
  ],
  orders: [
    { id: "o1", customer: "Alice Johnson", items: ["Wireless Headphones Pro"], total: 129.99, status: "Delivered", date: "2026-11-01" },
    { id: "o2", customer: "Bob Smith", items: ["Ergonomic Office Chair", "Desk Lamp"], total: 394.99, status: "Processing", date: "2026-11-18" },
    { id: "o3", customer: "Carol White", items: ["Mechanical Keyboard TKL"], total: 89.99, status: "Shipped", date: "2026-11-20" },
  ],
  users: [
    { id: "u1", name: "Alice Johnson", email: "alice@example.com", role: "Customer", joined: "2026-09-15", orders: 7, spent: 892.50 },
    { id: "u2", name: "Bob Smith", email: "bob@example.com", role: "Customer", joined: "2026-10-02", orders: 3, spent: 394.99 },
    { id: "u3", name: "Admin User", email: "admin@averia.ai", role: "Admin", joined: "2026-01-01", orders: 0, spent: 0 },
  ],
  leads: [
    { id: "l1", name: "TechCorp Inc", email: "sales@techcorp.com", stage: "Discovery", value: 12000, rep: "Alice" },
    { id: "l2", name: "StartupXYZ", email: "cto@startupxyz.io", stage: "Proposal", value: 5500, rep: "Bob" },
    { id: "l3", name: "Enterprise Ltd", email: "procurement@ent.com", stage: "Negotiation", value: 85000, rep: "Carol" },
  ],
  tasks: [
    { id: "t1", title: "Design landing page wireframes", priority: "High", status: "Done", assignee: "Alice", due: "2026-11-10" },
    { id: "t2", title: "Integrate payment gateway", priority: "Critical", status: "In Progress", assignee: "Bob", due: "2026-11-25" },
    { id: "t3", title: "Write API documentation", priority: "Medium", status: "Todo", assignee: "Carol", due: "2026-12-01" },
    { id: "t4", title: "Setup CI/CD pipeline", priority: "High", status: "In Progress", assignee: "Dave", due: "2026-11-28" },
  ],
  posts: [
    { id: "b1", title: "10 Tips to Scale Your SaaS", author: "Alice", category: "Growth", published: true, views: 2847, date: "2026-11-05" },
    { id: "b2", title: "Building Real-Time Apps with Supabase", author: "Bob", category: "Tech", published: true, views: 5112, date: "2026-11-12" },
    { id: "b3", title: "The Future of AI-Powered Development", author: "Carol", category: "AI", published: false, views: 0, date: "2026-11-22" },
  ],
};

// ── Ensure averia_app_data table exists (graceful skip if already created) ────
async function ensureTable(supabase: ReturnType<typeof createClient>) {
  try {
    await supabase.rpc("averia_ensure_app_data_table").maybeSingle();
  } catch {
    // Table may already exist; ignore
  }
}

// ── Seed a collection with default data if empty ─────────────────────────────
async function maybeSeedCollection(
  supabase: ReturnType<typeof createClient>,
  projectId: string,
  collection: string
) {
  const seed = SEED_DATA[collection];
  if (!seed) return;

  const { count } = await supabase
    .from("averia_app_data")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("collection", collection);

  if (!count || count === 0) {
    const rows = seed.map((item: any) => ({
      project_id: projectId,
      collection,
      record_id: item.id || crypto.randomUUID(),
      data: item,
    }));
    await supabase.from("averia_app_data").insert(rows);
  }
}

// ── COLLECTION CRUD HANDLER ───────────────────────────────────────────────────
async function handleCollection(
  req: Request,
  projectId: string,
  collection: string,
  url: URL
): Promise<Response> {
  const supabase = adminClient();
  await maybeSeedCollection(supabase, projectId, collection);

  // ── GET — List with optional filter/search/sort ───────────────────────────
  if (req.method === "GET") {
    let query = supabase
      .from("averia_app_data")
      .select("record_id, data, created_at")
      .eq("project_id", projectId)
      .eq("collection", collection)
      .order("created_at", { ascending: false });

    // ?search=keyword → filter by any string field in data
    const search = url.searchParams.get("search");
    if (search) {
      query = query.ilike("data->>name", `%${search}%`);
    }
    // ?limit=N
    const limit = parseInt(url.searchParams.get("limit") || "200", 10);
    query = query.limit(Math.min(limit, 500));

    const { data, error } = await query;
    if (error) return err(error.message, 500);
    const records = (data || []).map((r: any) => ({
      _id: r.record_id,
      ...r.data,
      _created_at: r.created_at,
    }));
    return json({ collection, projectId, count: records.length, records });
  }

  // ── POST — Create new record ──────────────────────────────────────────────
  if (req.method === "POST") {
    let body: any = {};
    try { body = await req.json(); } catch { return err("Invalid JSON body"); }
    const record_id = body.id || body._id || crypto.randomUUID();
    const { data: existing } = await supabase
      .from("averia_app_data")
      .select("record_id")
      .eq("project_id", projectId)
      .eq("collection", collection)
      .eq("record_id", record_id)
      .maybeSingle();
    if (existing) {
      return err(`Record ${record_id} already exists. Use PATCH to update.`, 409);
    }
    const { error } = await supabase.from("averia_app_data").insert({
      project_id: projectId,
      collection,
      record_id,
      data: { ...body, id: record_id },
    });
    if (error) return err(error.message, 500);
    return json({ success: true, _id: record_id, ...body, id: record_id }, 201);
  }

  return err(`Method ${req.method} not supported on collection endpoint`, 405);
}

// ── RECORD CRUD HANDLER (single record by ID) ─────────────────────────────────
async function handleRecord(
  req: Request,
  projectId: string,
  collection: string,
  recordId: string
): Promise<Response> {
  const supabase = adminClient();

  // ── GET single ───────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("averia_app_data")
      .select("record_id, data, created_at")
      .eq("project_id", projectId)
      .eq("collection", collection)
      .eq("record_id", recordId)
      .maybeSingle();
    if (error) return err(error.message, 500);
    if (!data) return err("Record not found", 404);
    return json({ _id: data.record_id, ...data.data, _created_at: data.created_at });
  }

  // ── PATCH — Update fields ─────────────────────────────────────────────────
  if (req.method === "PATCH") {
    let patch: any = {};
    try { patch = await req.json(); } catch { return err("Invalid JSON body"); }
    const { data: existing, error: fetchErr } = await supabase
      .from("averia_app_data")
      .select("data")
      .eq("project_id", projectId)
      .eq("collection", collection)
      .eq("record_id", recordId)
      .maybeSingle();
    if (fetchErr) return err(fetchErr.message, 500);
    if (!existing) return err("Record not found", 404);
    const merged = { ...existing.data, ...patch, id: recordId };
    const { error } = await supabase
      .from("averia_app_data")
      .update({ data: merged })
      .eq("project_id", projectId)
      .eq("collection", collection)
      .eq("record_id", recordId);
    if (error) return err(error.message, 500);
    return json({ success: true, _id: recordId, ...merged });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { error } = await supabase
      .from("averia_app_data")
      .delete()
      .eq("project_id", projectId)
      .eq("collection", collection)
      .eq("record_id", recordId);
    if (error) return err(error.message, 500);
    return json({ success: true, deleted: recordId });
  }

  return err(`Method ${req.method} not supported on record endpoint`, 405);
}

// ── AUTH HANDLERS ─────────────────────────────────────────────────────────────
async function handleAuth(req: Request, segment: string): Promise<Response> {
  const supabase = adminClient();
  let body: any = {};
  try { body = await req.json(); } catch { /* no-op */ }

  if (segment === "signup") {
    if (!body.email || !body.password) return err("email and password required");
    const { data, error } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { name: body.name || body.email.split("@")[0], role: body.role || "Customer" },
    });
    if (error) return err(error.message);
    return json({ success: true, user: { id: data.user.id, email: data.user.email, name: body.name || body.email.split("@")[0] } }, 201);
  }

  if (segment === "login") {
    if (!body.email || !body.password) return err("email and password required");
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "");
    const { data, error } = await userClient.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) return err(error.message, 401);
    return json({
      success: true,
      token: data.session?.access_token,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        name: data.user?.user_metadata?.name,
        role: data.user?.user_metadata?.role || "Customer",
      },
    });
  }

  if (segment === "me") {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return err("Authorization header required", 401);
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return err("Invalid or expired token", 401);
    return json({
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name,
      role: data.user.user_metadata?.role || "Customer",
    });
  }

  return err("Unknown auth endpoint", 404);
}

// ── COLLECTIONS INSPECTOR — list all collections for a project ─────────────────
async function handleInspect(projectId: string): Promise<Response> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("averia_app_data")
    .select("collection, record_id, data, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return err(error.message, 500);

  // Group by collection
  const grouped: Record<string, any[]> = {};
  for (const row of (data || [])) {
    if (!grouped[row.collection]) grouped[row.collection] = [];
    grouped[row.collection].push({ _id: row.record_id, ...row.data, _created_at: row.created_at });
  }

  return json({ projectId, collections: Object.keys(grouped), data: grouped });
}

// ── CLEAR — delete all records in a collection ─────────────────────────────────
async function handleClear(projectId: string, collection: string): Promise<Response> {
  const supabase = adminClient();
  const { error } = await supabase
    .from("averia_app_data")
    .delete()
    .eq("project_id", projectId)
    .eq("collection", collection);
  if (error) return err(error.message, 500);
  return json({ success: true, cleared: collection, projectId });
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);

  // Skip the edge function name prefix ("averia-backend")
  const segments = pathParts[0] === "averia-backend" ? pathParts.slice(1) : pathParts;

  try {
    // /auth/:segment
    if (segments[0] === "auth") {
      return await handleAuth(req, segments[1] || "");
    }

    // /inspect/:projectId — full DB view for UI inspector
    if (segments[0] === "inspect" && segments[1]) {
      return await handleInspect(segments[1]);
    }

    // /projects/:projectId/clear/:collection
    if (segments[0] === "projects" && segments[3] === "clear") {
      return await handleClear(segments[1], segments[2] || "all");
    }

    // /projects/:projectId/:collection/:recordId
    if (segments[0] === "projects" && segments[1] && segments[2] && segments[3]) {
      return await handleRecord(req, segments[1], segments[2], segments[3]);
    }

    // /projects/:projectId/:collection
    if (segments[0] === "projects" && segments[1] && segments[2]) {
      return await handleCollection(req, segments[1], segments[2], url);
    }

    // /health
    if (segments[0] === "health" || segments.length === 0) {
      return json({ status: "ok", service: "averia-backend", version: "2.0.0" });
    }

    return err("Route not found. Valid: /projects/:id/:collection, /auth/signup|login|me, /inspect/:id", 404);
  } catch (e: any) {
    console.error("[averia-backend] Unhandled error:", e);
    return err(e?.message || "Internal server error", 500);
  }
});
