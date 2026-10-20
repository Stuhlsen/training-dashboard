const http = require("node:http");
const { requireAdmin, requireUser } = require("./auth.js");
const {
  searchIngredients,
  previewRecipe,
  submitRecipe,
  updateRecipe,
  deleteRecipe,
  submitIngredientRequest,
} = require("./recipes.js");
const { sendInvite } = require("./invite.js");
const { listUsers, banUser, unbanUser, deleteUser, resendUserLink, setVerifiedAuthor } = require("./users.js");
const { decideRecipe } = require("./recipe-review.js");
const { deleteRecipeComment } = require("./recipe-comments.js");

const PORT = process.env.PORT || 3001;
const ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  POSTGREST_INTERNAL_URL: process.env.POSTGREST_INTERNAL_URL,
  GOTRUE_INTERNAL_URL: process.env.GOTRUE_INTERNAL_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  // Kommagetrennte Liste von User-IDs (eine ID bleibt gültig); leer → null
  SUPER_ADMIN_IDS: parseIdList(process.env.SUPER_ADMIN_ID),
};

/** "id1, id2" → ["id1","id2"]; leer/fehlend → null (Opt-in-Einschränkung aus). */
function parseIdList(raw) {
  const ids = String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return ids.length > 0 ? ids : null;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const MAX_BODY_CHARS = 256 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_CHARS) {
        reject(new Error("Body zu gross"));
        req.destroy();
      }
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

const RECIPE_ID_PATH = /^\/api\/recipes\/[^/]+$/;

function matchApiRoute(method, pathname) {
  if (method === "GET" && pathname === "/api/ingredients") return "ingredients";
  if (method === "POST" && pathname === "/api/recipes/preview") return "preview";
  if (method === "POST" && pathname === "/api/recipes") return "submit";
  if (method === "PUT" && RECIPE_ID_PATH.test(pathname)) return "update";
  if (method === "DELETE" && RECIPE_ID_PATH.test(pathname)) return "delete";
  if (method === "POST" && pathname === "/api/ingredient-requests") return "ingredient-request";
  return null;
}

// Fahrplan 25 S1a/S1b — /api/*: jeder eingeloggte User (kein Admin noetig).
async function handleApi(req, res, url) {
  const route = matchApiRoute(req.method, url.pathname);
  if (!route) return false;

  const user = requireUser(req.headers.authorization, ENV);
  if (!user.ok) {
    sendJson(res, user.status, { ok: false, error: user.error });
    return true;
  }

  try {
    if (route === "ingredients") {
      sendJson(res, 200, { ok: true, ingredients: await searchIngredients(url.searchParams.get("q")) });
      return true;
    }
    if (route === "delete") {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const result = await deleteRecipe(id, user.sub, ENV);
      sendJson(res, result.status, result.ok ? { ok: true } : { ok: false, error: result.error });
      return true;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { ok: false, error: { code: "SCHEMA", message: "ungueltiger Request-Body" } });
      return true;
    }
    let result;
    if (route === "preview") result = await previewRecipe(body, user.sub);
    else if (route === "update") {
      result = await updateRecipe(decodeURIComponent(url.pathname.split("/")[3]), body, user.sub, ENV);
    } else if (route === "ingredient-request") {
      result = await submitIngredientRequest(body, user.sub, ENV);
    } else result = await submitRecipe(body, user.sub, ENV);

    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
    } else if (route === "preview") {
      sendJson(res, 200, { ok: true, ...result.preview });
    } else if (route === "update") {
      sendJson(res, 200, { ok: true, recipe: result.recipe });
    } else if (route === "ingredient-request") {
      sendJson(res, 201, { ok: true, request: result.request });
    } else {
      sendJson(res, 201, { ok: true, recipe: result.recipe });
    }
  } catch {
    sendJson(res, 500, { ok: false, error: { code: "UNKNOWN", message: "interner Fehler" } });
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (await handleApi(req, res, url)) return;

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

    // Opt-in super-admin restriction: wenn SUPER_ADMIN_ID gesetzt ist, dürfen
    // nur die dort gelisteten Admins weitere Admins anlegen (nicht jeder Admin).
    if (isAdmin && ENV.SUPER_ADMIN_IDS && !ENV.SUPER_ADMIN_IDS.includes(admin.sub)) {
      sendJson(res, 403, { ok: false, error: { code: "UNKNOWN", message: "nur ein Super-Admin darf Admins anlegen" } });
      return;
    }

    const result = await sendInvite(email, ENV, fetch, { profileRole, isAdmin });
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, hashedToken: result.hashedToken });
    return;
  }

  if (req.method === "GET" && req.url === "/admin/users") {
    const admin = await requireAdmin(req.headers.authorization, ENV);
    if (!admin.ok) {
      sendJson(res, admin.status, { ok: false, error: admin.error });
      return;
    }

    const result = await listUsers(ENV);
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, users: result.users });
    return;
  }

  // Fahrplan 30 B4: Rezept in Pruefung freigeben / mit Grund ablehnen (nur Admin)
  const decisionMatch =
    req.method === "POST" ? req.url.match(/^\/admin\/recipes\/([^/]+)\/(approve|reject)$/) : null;
  if (decisionMatch) {
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

    const [, recipeId, decision] = decisionMatch;
    const result = await decideRecipe(recipeId, decision, body.reason, admin.sub, ENV);
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true, status: result.status });
    return;
  }

  // Fahrplan 30 B5: Kommentar zu einem Rezept löschen (nur Admin, mit Audit-Eintrag)
  const commentDeleteMatch =
    req.method === "DELETE" ? req.url.match(/^\/admin\/recipe-comments\/([^/]+)$/) : null;
  if (commentDeleteMatch) {
    const admin = await requireAdmin(req.headers.authorization, ENV);
    if (!admin.ok) {
      sendJson(res, admin.status, { ok: false, error: admin.error });
      return;
    }

    const result = await deleteRecipeComment(commentDeleteMatch[1], admin.sub, ENV);
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  const actionMatch =
    req.method === "POST"
      ? req.url.match(/^\/admin\/users\/([^/]+)\/(ban|unban|resend|verify-author|unverify-author)$/)
      : null;
  if (actionMatch) {
    const admin = await requireAdmin(req.headers.authorization, ENV);
    if (!admin.ok) {
      sendJson(res, admin.status, { ok: false, error: admin.error });
      return;
    }

    const [, userId, action] = actionMatch;
    const fn = {
      ban: banUser,
      unban: unbanUser,
      resend: resendUserLink,
      "verify-author": (id, actorId, env) => setVerifiedAuthor(id, true, actorId, env),
      "unverify-author": (id, actorId, env) => setVerifiedAuthor(id, false, actorId, env),
    }[action];
    const result = await fn(userId, admin.sub, ENV);
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    if (action === "resend") {
      sendJson(res, 200, { ok: true, hashedToken: result.hashedToken, type: result.type });
      return;
    }
    if (action === "verify-author" || action === "unverify-author") {
      sendJson(res, 200, { ok: true, isVerifiedAuthor: result.isVerifiedAuthor });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  const deleteMatch = req.method === "DELETE" ? req.url.match(/^\/admin\/users\/([^/]+)$/) : null;
  if (deleteMatch) {
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

    const [, userId] = deleteMatch;
    const confirmEmail = typeof body.confirmEmail === "string" ? body.confirmEmail : "";
    const result = await deleteUser(userId, confirmEmail, admin.sub, ENV);
    if (!result.ok) {
      sendJson(res, result.status, { ok: false, error: result.error });
      return;
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "not found" } });
});

if (require.main === module) {
  if (!ENV.SUPER_ADMIN_IDS) {
    console.warn("SUPER_ADMIN_ID nicht gesetzt: jeder Admin darf weitere Admins anlegen");
  }
  server.listen(PORT, () => {
    console.log(`admin-api listening on :${PORT}`);
  });
}

module.exports = { server };
