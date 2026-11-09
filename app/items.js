// Serverless function: checks passcodes (internal / external) and stores action items in Redis (Upstash).
const crypto = require("crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ITEMS = "deliv:items", META = "deliv:meta", SEQ = "deliv:seq";
const STATUSES = ["Open", "In progress", "Waiting", "Done"];

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REDIS_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "redis error");
  return j.result;
}

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
function roleFor(given) {
  const internal = process.env.TEAM_PASSCODE, external = process.env.EXTERNAL_PASSCODE;
  if (!internal) return { err: "TEAM_PASSCODE is not set." };
  const g = given || "";
  if (same(g, internal)) return { role: "internal" };
  if (external && same(g, external)) return { role: "external" };
  return { role: null };
}

const pairs = (flat) => { const o = {}; for (let i = 0; i < (flat || []).length; i += 2) o[flat[i]] = flat[i + 1]; return o; };
const str = (v, max) => (typeof v === "string" && v.length <= max ? v : null);

// Validates only the fields that were sent. Returns {data} or {error}.
function clean(d, creating) {
  if (!d || typeof d !== "object") return { error: "Bad data" };
  const out = {};
  if ("description" in d) { const v = str(d.description, 500); if (v === null || !v.trim()) return { error: "Description is required" }; out.description = v.trim(); }
  else if (creating) return { error: "Description is required" };
  if (creating) { const v = str(d.createdBy, 60); if (v === null || !v.trim()) return { error: "Created by is required" }; out.createdBy = v.trim(); }
  if ("due" in d) { const v = str(d.due, 10); if (v === null || (v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v))) return { error: "Bad date" }; out.due = v; }
  if ("notes" in d) { const v = str(d.notes, 2000); if (v === null) return { error: "Notes too long" }; out.notes = v; }
  if ("assignedTo" in d) { const v = str(d.assignedTo, 60); if (v === null) return { error: "Bad assignee" }; out.assignedTo = v.trim(); }
  if ("status" in d) { if (!STATUSES.includes(d.status)) return { error: "Bad status" }; out.status = d.status; }
  return { data: out };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ error: "Database is not connected yet." });
    const who = roleFor(req.headers["x-passcode"]);
    if (who.err) return res.status(500).json({ error: who.err });
    if (!who.role) { await new Promise((r) => setTimeout(r, 400)); return res.status(401).json({ error: "Wrong passcode" }); }
    const role = who.role;

    if (req.method === "GET") {
      const [flat, meta] = await Promise.all([redis(["HGETALL", ITEMS]), redis(["HGETALL", META])]);
      const items = [];
      for (const v of Object.values(pairs(flat))) { try { items.push(JSON.parse(v)); } catch (_) {} }
      items.sort((a, b) => a.id - b.id);
      let people = null; try { people = meta.people ? JSON.parse(meta.people) : null; } catch (_) {}
      return res.status(200).json({ role, items, people });
    }

    if (req.method === "POST") {
      const b = req.body || {};
      if (b.op === "create") {
        const c = clean(b.data, true);
        if (c.error) return res.status(400).json({ error: c.error });
        const id = await redis(["INCR", SEQ]);
        const now = new Date().toISOString();
        const item = { id, description: c.data.description, createdBy: c.data.createdBy, createdAt: now, createdOrg: role,
          due: c.data.due || "", notes: c.data.notes || "", status: c.data.status || "Open", assignedTo: c.data.assignedTo || "", updatedAt: now };
        await redis(["HSET", ITEMS, String(id), JSON.stringify(item)]);
        return res.status(200).json({ ok: true, item });
      }
      if (b.op === "update") {
        const id = Number(b.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
        const c = clean(b.data, false);
        if (c.error) return res.status(400).json({ error: c.error });
        const raw = await redis(["HGET", ITEMS, String(id)]);
        if (!raw) return res.status(404).json({ error: "Item not found" });
        const item = Object.assign(JSON.parse(raw), c.data, { updatedAt: new Date().toISOString() });
        await redis(["HSET", ITEMS, String(id), JSON.stringify(item)]);
        return res.status(200).json({ ok: true, item });
      }
      if (b.op === "delete") {
        if (role !== "internal") return res.status(403).json({ error: "Only the internal team can delete items." });
        const id = Number(b.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
        await redis(["HDEL", ITEMS, String(id)]);
        return res.status(200).json({ ok: true });
      }
      if (b.op === "people") {
        const names = Array.isArray(b.names) ? b.names : null;
        if (!names || names.length > 60 || names.some((n) => str(n, 60) === null || !n.trim())) return res.status(400).json({ error: "Bad list" });
        await redis(["HSET", META, "people", JSON.stringify(names)]);
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "Unknown request" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
