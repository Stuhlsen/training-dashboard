const http = require("node:http");

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/admin/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "not found" } })
  );
});

server.listen(PORT, () => {
  console.log(`admin-api listening on :${PORT}`);
});
