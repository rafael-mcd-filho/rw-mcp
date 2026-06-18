// Servidor HTTP standalone do MCP — para rodar na VPS (aaPanel) como serviço.
// Expõe o MCP em POST /mcp (Streamable HTTP) e serve os PDFs gerados em /files.

import http from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";

const accessToken = process.env.META_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;
const allowlist = process.env.META_ACCOUNT_ALLOWLIST?.split(",").filter(Boolean);
const SECRET = process.env.MCP_SECRET;
const PORT = Number(process.env.PORT ?? 3000);
const REPORTS_DIR =
  process.env.META_REPORT_OUTPUT_DIR ?? join(homedir(), "Documents", "Relatorios-Meta");

if (!accessToken) {
  console.error("Erro: META_ACCESS_TOKEN é obrigatório.");
  process.exit(1);
}

/** Serve um PDF gerado, com proteção contra path traversal. */
function serveFile(name: string, res: http.ServerResponse): void {
  const safe = basename(decodeURIComponent(name));
  if (!/^[A-Za-z0-9._-]+\.pdf$/.test(safe)) {
    res.writeHead(400).end("Nome inválido");
    return;
  }
  const file = join(REPORTS_DIR, safe);
  if (!existsSync(file)) {
    res.writeHead(404).end("Arquivo não encontrado");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${safe}"`,
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Download dos PDFs gerados
  if (req.method === "GET" && url.pathname.startsWith("/files/")) {
    serveFile(url.pathname.slice("/files/".length), res);
    return;
  }

  // Status / info
  if (req.method === "GET" && (url.pathname === "/mcp" || url.pathname === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: "rw-mcp", transport: "streamable-http", endpoint: "/mcp" }));
    return;
  }

  // Endpoint MCP
  if (req.method === "POST" && url.pathname === "/mcp") {
    if (SECRET && req.headers.authorization !== `Bearer ${SECRET}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const mcp = createMcpServer(accessToken!, adAccountId, allowlist);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.error(`rw-mcp HTTP ouvindo na porta ${PORT} (POST /mcp, GET /files/<arquivo>.pdf)`);
});
