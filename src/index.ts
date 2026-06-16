import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";

const accessToken = process.env.META_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;

if (!accessToken || !adAccountId) {
  console.error(
    "Erro: META_ACCESS_TOKEN e META_AD_ACCOUNT_ID são obrigatórios."
  );
  process.exit(1);
}

const server = createMcpServer(accessToken, adAccountId);
const transport = new StdioServerTransport();
await server.connect(transport);
