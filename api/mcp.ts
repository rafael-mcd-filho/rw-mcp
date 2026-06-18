import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "../src/server.js";

const MCP_INFO = {
  ok: true,
  name: "rw-mcp",
  transport: "streamable-http",
  endpoint: "/mcp",
  commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
};

function acceptsHtml(req: VercelRequest): boolean {
  const accept = req.headers.accept;
  const value = Array.isArray(accept) ? accept.join(",") : accept ?? "";
  return value.includes("text/html");
}

function statusHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RW MCP - endpoint</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px;
        background: #f6f7f9;
        color: #17181c;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(680px, 100%);
        padding: 32px;
        border: 1px solid #dde1e7;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 18px 45px rgba(20, 24, 32, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 26px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #626875;
        line-height: 1.6;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin: 20px 0 24px;
        padding: 8px 12px;
        border: 1px solid rgba(23, 128, 61, 0.24);
        border-radius: 999px;
        color: #17803d;
        background: rgba(23, 128, 61, 0.08);
        font-size: 14px;
        font-weight: 700;
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #17803d;
      }
      code {
        padding: 3px 7px;
        border-radius: 6px;
        background: #f0f2f5;
        color: #242833;
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Endpoint MCP</h1>
      <div class="status"><span class="dot"></span> Operacional</div>
      <p>
        Este endereco e usado por clientes MCP via POST. Para conectar no Claude,
        use <code>https://rw-mcp.vercel.app/mcp</code>.
      </p>
    </main>
  </body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method === "GET") {
    if (acceptsHtml(req)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).end(statusHtml());
      return;
    }

    res.status(200).json(MCP_INFO);
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Autenticação opcional via MCP_SECRET
  const secret = process.env.MCP_SECRET;
  if (secret) {
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const allowlist = process.env.META_ACCOUNT_ALLOWLIST?.split(",").filter(Boolean);

  if (!accessToken) {
    res.status(500).json({ error: "Server not configured" });
    return;
  }

  try {
    const server = createMcpServer(accessToken, adAccountId, allowlist);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless — funciona bem com serverless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
}
