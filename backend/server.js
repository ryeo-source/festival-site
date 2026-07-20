import "dotenv/config";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_KEY env vars");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    name: "Autumn Light Festival API",
    endpoints: [
      "/health",
      "/api/festival",
      "/api/programs",
      "/api/programs/:id/clicks",
      "/api/programs/:id/click",
      "/api/artists",
      "/api/tickets",
      "/api/faqs",
      "/api/notices",
      "/api/guestbook"
    ]
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/festival", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("festivals")
      .select("*")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) { next(e); }
});

app.get("/api/programs", async (req, res, next) => {
  try {
    const [progs, counts] = await Promise.all([
      supabase.from("programs").select("*").order("sort_order", { ascending: true }),
      supabase.from("program_click_counts").select("program_id,clicks")
    ]);
    if (progs.error) throw progs.error;
    if (counts.error) throw counts.error;
    const map = {};
    (counts.data || []).forEach((c) => { map[c.program_id] = Number(c.clicks) || 0; });
    const merged = (progs.data || []).map((p) => ({ ...p, clicks: map[p.id] || 0 }));
    res.json(merged);
  } catch (e) { next(e); }
});

app.get("/api/programs/:id/clicks", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("program_click_counts")
      .select("program_id,clicks")
      .eq("program_id", req.params.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ program_id: req.params.id, clicks: Number(data?.clicks) || 0 });
  } catch (e) { next(e); }
});

app.post("/api/programs/:id/click", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data: prog, error: pe } = await supabase
      .from("programs")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (pe) throw pe;
    if (!prog) return res.status(404).json({ error: "프로그램이 존재하지 않습니다." });

    const { error: ie } = await supabase
      .from("program_clicks")
      .insert({ program_id: id });
    if (ie) throw ie;

    const { data: cnt } = await supabase
      .from("program_click_counts")
      .select("clicks")
      .eq("program_id", id)
      .maybeSingle();
    res.json({ program_id: id, clicks: Number(cnt?.clicks) || 0 });
  } catch (e) { next(e); }
});

app.get("/api/artists", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("artists")
      .select("*")
      .order("performance_at", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

app.get("/api/tickets", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("ticket_tiers")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

app.get("/api/faqs", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("faqs")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

app.get("/api/notices", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("notices")
      .select("*")
      .order("published_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

app.get("/api/guestbook", async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("guestbook")
      .select("id,author_name,message,is_pinned,created_at")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) { next(e); }
});

app.post("/api/guestbook", async (req, res, next) => {
  try {
    const author_name = (req.body?.author_name || "").toString().trim();
    const message = (req.body?.message || "").toString().trim();
    if (!author_name || !message) {
      return res.status(400).json({ error: "author_name과 message는 필수입니다." });
    }
    if (author_name.length > 50 || message.length > 1000) {
      return res.status(400).json({ error: "작성자 50자, 메시지 1000자 이내여야 합니다." });
    }
    const { data: fest } = await supabase
      .from("festivals")
      .select("id")
      .eq("is_active", true)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fest) return res.status(404).json({ error: "활성 축제가 없습니다." });

    const { data, error } = await supabase
      .from("guestbook")
      .insert({ festival_id: fest.id, author_name, message, is_public: true })
      .select("id,author_name,message,created_at")
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { next(e); }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(PORT, () => console.log(`Autumn Light Festival API running on :${PORT}`));
