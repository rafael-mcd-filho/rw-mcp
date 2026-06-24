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

function statusHtml(origin: string): string {
  const endpoint = `${origin}/mcp`;
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RW MCP — endpoint</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0a0b0d; --panel: #131519; --panel-2: #0f1114;
        --border: #23262d; --border-hi: #32373f;
        --text: #ECEDEE; --muted: #969ba4; --accent: #f0433a; --ok: #3dd68c;
        --r: 4px;
        --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
        --sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
        background: var(--bg); color: var(--text); font-family: var(--sans); line-height: 1.6;
        -webkit-font-smoothing: antialiased;
        background-image:
          linear-gradient(var(--border) 1px, transparent 1px),
          linear-gradient(90deg, var(--border) 1px, transparent 1px);
        background-size: 48px 48px;
      }
      body::before { content:""; position: fixed; inset: 0; pointer-events: none;
        background: radial-gradient(700px 360px at 50% 0%, rgba(240,67,58,.10), transparent 70%); }
      main {
        position: relative; width: min(560px, 100%); padding: 30px;
        border: 1px solid var(--border); border-radius: var(--r); background: var(--panel);
      }
      .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 22px; }
      .mark { display: grid; place-items: center; width: 32px; height: 32px; background: var(--accent);
        color: #fff; font-weight: 800; font-size: 13px; border-radius: var(--r); letter-spacing: -.5px; }
      .brand b { font-size: 14px; font-weight: 700; }
      .brand span { display:block; font-size: 11px; color: var(--muted); }
      h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: -.4px; }
      .badge {
        display: inline-flex; align-items: center; gap: 7px; margin: 14px 0 20px;
        padding: 6px 11px; border: 1px solid rgba(61,214,140,.28); background: rgba(61,214,140,.08);
        color: var(--ok); font-size: 12px; font-weight: 600; border-radius: var(--r); font-family: var(--mono);
      }
      .dot { width: 7px; height: 7px; background: var(--ok); border-radius: 50%; box-shadow: 0 0 0 3px rgba(61,214,140,.18); }
      p { margin: 0; color: var(--muted); font-size: 14px; }
      .ep { margin: 18px 0 0; border: 1px solid var(--border); background: var(--panel-2);
        border-radius: var(--r); padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
      .ep .k { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
      .ep code { font-family: var(--mono); font-size: 13px; color: var(--text); flex: 1; overflow-x: auto; white-space: nowrap; }
      .foot { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--border);
        display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap;
        font-family: var(--mono); font-size: 11.5px; color: var(--muted); }
      a { color: var(--accent); text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <div class="mark">RW</div>
        <div><b>RW MCP</b><span>Endpoint</span></div>
      </div>
      <h1>Endpoint MCP</h1>
      <div class="badge"><span class="dot"></span> Operacional</div>
      <p>Este endereço é consumido por clientes MCP via <b style="color:var(--text)">POST</b> (Streamable HTTP). Para conectar um assistente, use a URL abaixo.</p>
      <div class="ep">
        <span class="k">Conectar</span>
        <code>${endpoint}</code>
      </div>
      <div class="foot">
        <span><a href="/">← rw-mcp</a></span>
        <span>${commit ? "build " + commit : "streamable-http"}</span>
      </div>
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
      const proto = (req.headers["x-forwarded-proto"] as string) ?? "https";
      const host = (req.headers["x-forwarded-host"] as string) ?? req.headers.host ?? "rw-mcp.vercel.app";
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).end(statusHtml(`${proto}://${host}`));
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
