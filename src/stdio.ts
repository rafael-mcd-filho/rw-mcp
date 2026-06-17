import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

const accessToken = process.env.META_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;
const allowlist = process.env.META_ACCOUNT_ALLOWLIST?.split(",").filter(Boolean);

if (!accessToken) {
  console.error("Erro: META_ACCESS_TOKEN e obrigatorio.");
  process.exit(1);
}

const server = createMcpServer(accessToken, adAccountId, allowlist);
const transport = new StdioServerTransport();
await server.connect(transport);
