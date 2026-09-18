const http = require("node:http");
const { requireAdmin } = require("./auth.js");
const { sendInvite } = require("./invite.js");
const { listAthletes } = require("./athletes.js");

const PORT = process.env.PORT || 3001;
const ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  POSTGREST_INTERNAL_URL: process.env.POSTGREST_INTERNAL_URL,
  GOTRUE_INTERNAL_URL: process.env.GOTRUE_INTERNAL_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
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

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { ok: false, error: { code: "SCHEMA", message: "ungueltiger Request-Body" } });
      return;
    }

    const email = typeof body.email === "string" ? body.email : "";
    const profileRole = body.role === "coach" ? "coach" : "athlete";
    const isAdmin = body.isAdmin === true;
    const result = await sendInvite(email, ENV, fetch, { profileRole, isAdmin });
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, hashedToken: result.hashedToken });
    return;
  }

  if (req.method === "GET" && req.url === "/admin/athletes") {
    const admin = await requireAdmin(req.headers.authorization, ENV);
    if (!admin.ok) {
      sendJson(res, admin.status, { ok: false, error: admin.error });
      return;
    }

    const result = await listAthletes(ENV);
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, athletes: result.athletes });
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "not found" } });
});

server.listen(PORT, () => {
  console.log(`admin-api listening on :${PORT}`);
});
