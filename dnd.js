// dnd.js — the ENTIRE multiplayer backend in one file. Zero config needed.
// Deploy this to Vercel and it just works. Endpoints are chosen with ?do=...
//   POST ?do=create                          -> { code, dm_key }
//   GET  ?do=get&code=ABC123                  -> { state, actions, updated_at }
//   POST ?do=state  { code, dm_key, state }   -> DM updates the game
//   POST ?do=action { code, player, action }  -> a player submits an action
//   POST ?do=clear  { code, dm_key }          -> DM clears the inbox
//
// These two values are PUBLIC by design (project URL + publishable key); the
// table is guarded by Row Level Security and the dm_key check below.

const URL = "https://dtniddxwahgozagncnda.supabase.co";
const KEY = "sb_publishable_szwNgS3WUNybhtJaFVmiRg_2eQ2A5YR";
const TBL = `${URL}/rest/v1/dnd_games`;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`,
            "Content-Type": "application/json", Prefer: "return=representation" };

async function getGame(code) {
  const r = await fetch(`${TBL}?code=eq.${encodeURIComponent(code)}&select=*`, { headers: H });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
async function insertGame(row) {
  const r = await fetch(TBL, { method: "POST", headers: H, body: JSON.stringify(row) });
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}
async function patchGame(code, patch) {
  const r = await fetch(`${TBL}?code=eq.${encodeURIComponent(code)}`,
    { method: "PATCH", headers: H, body: JSON.stringify(patch) });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
function rnd(n, a) { let s = ""; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random()*a.length)]; return s; }
function send(res, status, obj) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(status).send(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const code = (q.code || body.code || "").toUpperCase();
    const op = q.do || body.do;

    if (op === "create") {
      const newCode = rnd(6, "ABCDEFGHJKMNPQRSTUVWXYZ23456789");
      const dm_key = rnd(24, "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
      await insertGame({ code: newCode, dm_key,
        state: body.state || { scene: "The adventure begins...", turn: 1, party: [], map_url: "", log: [] },
        actions: [] });
      return send(res, 200, { code: newCode, dm_key });
    }
    if (op === "get") {
      const g = await getGame(code);
      if (!g) return send(res, 404, { error: "No game with that code" });
      return send(res, 200, { code: g.code, state: g.state, actions: g.actions, updated_at: g.updated_at });
    }
    if (op === "state") {
      const g = await getGame(code);
      if (!g) return send(res, 404, { error: "No game with that code" });
      if (body.dm_key !== g.dm_key) return send(res, 403, { error: "Wrong DM key" });
      const u = await patchGame(code, { state: body.state || g.state });
      return send(res, 200, { ok: true, updated_at: u.updated_at });
    }
    if (op === "action") {
      const g = await getGame(code);
      if (!g) return send(res, 404, { error: "No game with that code" });
      const actions = Array.isArray(g.actions) ? g.actions : [];
      actions.push({ player: body.player || "Player", action: body.action || "", at: new Date().toISOString() });
      await patchGame(code, { actions });
      return send(res, 200, { ok: true, count: actions.length });
    }
    if (op === "clear") {
      const g = await getGame(code);
      if (!g) return send(res, 404, { error: "No game with that code" });
      if (body.dm_key !== g.dm_key) return send(res, 403, { error: "Wrong DM key" });
      await patchGame(code, { actions: [] });
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: "Unknown ?do= operation" });
  } catch (e) {
    return send(res, 500, { error: String(e) });
  }
};
