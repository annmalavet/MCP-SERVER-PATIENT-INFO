import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { server } from "./server"
import "./tools"


const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({
  origin: '*', 
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
  exposedHeaders: ['Mcp-Session-Id'], 
}));
app.use(cors({ origin: true, methods: ["POST","OPTIONS"] }));
app.get("/", (_req,res)=>res.status(200).send("Service up. Use POST / or /mcp"));
app.get("/mcp", (_req,res)=>res.status(405).send("Use POST /mcp"));
app.options("/",  (_req,res)=>res.sendStatus(204));
app.options("/mcp",(_req,res)=>res.sendStatus(204));
const PORT = process.env.PORT || 8080;

app.post("/", serveMcp);
app.post("/mcp", serveMcp);

async function serveMcp(req: express.Request, res: express.Response) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const cleanup = () => { try { transport.close(); } catch {} };
  res.once("finish", cleanup);
  res.once("close",  cleanup);

  const hr: any = (transport as any).handleRequest;
  if (typeof hr === "function" && hr.length >= 4) {
    await hr.call(transport, req, res, req.body, server);
  } else {
    // older SDK
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
}


const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`MCP server w tool list listening on port ${port}`);
});
