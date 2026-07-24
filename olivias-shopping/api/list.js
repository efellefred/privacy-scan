export default async function handler(req, res) {
  const code = req.headers["x-sync-code"];
  if (!process.env.SYNC_CODE || code !== process.env.SYNC_CODE) {
    res.status(401).json({ error: "bad sync code" });
    return;
  }

  const base = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!base || !token) {
    res.status(500).json({ error: "storage not configured" });
    return;
  }
  const auth = { Authorization: "Bearer " + token };

  if (req.method === "GET") {
    const r = await fetch(base + "/get/olivias-list", { headers: auth });
    if (!r.ok) {
      res.status(502).json({ error: "storage read failed" });
      return;
    }
    const data = await r.json();
    res.setHeader("cache-control", "no-store");
    res.status(200).json(data.result ? JSON.parse(data.result) : null);
  } else if (req.method === "PUT") {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (!body || body.length > 512 * 1024) {
      res.status(413).json({ error: "list too large" });
      return;
    }
    const r = await fetch(base + "/set/olivias-list", { method: "POST", headers: auth, body });
    if (!r.ok) {
      res.status(502).json({ error: "storage write failed" });
      return;
    }
    res.status(200).json({ ok: true });
  } else {
    res.status(405).json({ error: "method not allowed" });
  }
}
