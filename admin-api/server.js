const http = require("node:http");
const { requireAdmin } = require("./auth.js");

const PORT = process.env.PORT || 3001;
const ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  POSTGREST_INTERNAL_URL: process.env.POSTGREST_INTERNAL_URL,
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/admin/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && req.url === "/admin/invite") {
    const admin = await requireAdmin(req.headers.authorization, ENV);
    if (!admin.ok) {
      sendJson(res, admin.status, { ok: false, error: admin.error });
      return;
    }
    // E3 ersetzt diesen Stub durch den echten GoTrue-/invite-Aufruf (V1).
    sendJson(res, 200, { ok: true, stub: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "not found" } });
});

server.listen(PORT, () => {
  console.log(`admin-api listening on :${PORT}`);
});
