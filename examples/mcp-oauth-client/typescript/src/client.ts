import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

import { InMemoryOAuthClientProvider } from "./oauth-provider.js";

const DEFAULT_SERVER_URL = "https://seleven-mcp-sg.airudder.com/mcp/openagent_oauth";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:8090/callback";

type Config = {
  serverUrl: string;
  redirectUri: string;
  scope: string;
  toolName: string | null;
  toolArgs: Record<string, unknown>;
  autoAuthorize: boolean;
};

function readConfig(env = process.env): Config {
  return {
    serverUrl: env.MCP_SERVER_URL || DEFAULT_SERVER_URL,
    redirectUri: env.MCP_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    scope: env.MCP_SCOPE || "openid email profile",
    toolName: env.MCP_TOOL_NAME || null,
    toolArgs: parseJsonObject(env.MCP_TOOL_ARGS_JSON, "MCP_TOOL_ARGS_JSON"),
    autoAuthorize: env.MCP_OAUTH_AUTO_AUTHORIZE === "1",
  };
}

function parseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function summarizeResourceResult(result: Record<string, unknown>) {
  const contents = Array.isArray(result.contents) ? result.contents : [];
  return {
    content_count: contents.length,
    contents: contents.map((content) => {
      if (!content || typeof content !== "object") {
        return { type: typeof content };
      }
      const item = content as Record<string, unknown>;
      const text = typeof item.text === "string" ? item.text : "";
      return {
        uri: typeof item.uri === "string" ? item.uri : undefined,
        mime_type: typeof item.mimeType === "string" ? item.mimeType : undefined,
        text_bytes: Buffer.byteLength(text, "utf8"),
      };
    }),
  };
}

function emit(event: string, payload: Record<string, unknown> = {}) {
  const line = JSON.stringify({ event, ...payload, timestamp: new Date().toISOString() });
  console.log(line);
  writeLogLine(line);
}

function emitError(payload: Record<string, unknown>) {
  const line = JSON.stringify({ ...payload, timestamp: new Date().toISOString() });
  console.error(line);
  writeLogLine(line);
}

function writeLogLine(line: string) {
  const logFile = process.env.MCP_LOG_FILE;
  if (!logFile) {
    return;
  }
  fs.mkdirSync(path.dirname(logFile), { recursive: true, mode: 0o700 });
  fs.appendFileSync(logFile, `${line}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(logFile, 0o600);
  } catch {
    // Best effort only.
  }
}

async function waitForLocalCallback(redirectUri: string, authorizationUrl: URL): Promise<string> {
  const callbackUrl = new URL(redirectUri);
  if (!["127.0.0.1", "localhost"].includes(callbackUrl.hostname)) {
    throw new Error("Only localhost redirect URIs can be handled automatically by this example.");
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url || "/", callbackUrl.origin);
        if (requestUrl.pathname !== callbackUrl.pathname) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const error = requestUrl.searchParams.get("error");
        const code = requestUrl.searchParams.get("code");
        if (error) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end("Authorization failed.");
          reject(new Error(`OAuth authorization failed: ${error}`));
          server.close();
          return;
        }
        if (!code) {
          res.writeHead(400, { "content-type": "text/plain" });
          res.end("Missing code.");
          reject(new Error("OAuth callback did not include a code."));
          server.close();
          return;
        }
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("Authorization complete. You can return to the terminal.");
        resolve(code);
        server.close();
      } catch (error) {
        reject(error);
        server.close();
      }
    });
    server.listen(Number(callbackUrl.port || 80), callbackUrl.hostname, () => {
      emit("oauth_authorization_required", { authorization_url: authorizationUrl.toString() });
    });
  });
}

async function completeAuthorizationAutomatically(authorizationUrl: URL): Promise<string> {
  const response = await fetch(authorizationUrl, { redirect: "manual" });
  const location = response.headers.get("location");
  if (!location) {
    throw new Error(`Auto authorization expected a redirect, got HTTP ${response.status}.`);
  }
  const callbackUrl = new URL(location);
  const code = callbackUrl.searchParams.get("code");
  if (!code) {
    throw new Error("Auto authorization redirect did not include a code.");
  }
  return code;
}

async function getAuthorizationCode(config: Config, authorizationUrl: URL): Promise<string> {
  if (config.autoAuthorize) {
    return completeAuthorizationAutomatically(authorizationUrl);
  }
  return waitForLocalCallback(config.redirectUri, authorizationUrl);
}

async function connect(config: Config): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  let authorizationUrl: URL | null = null;
  const clientMetadata: OAuthClientMetadata = {
    client_name: "CALL-E OAuth MCP example",
    redirect_uris: [config.redirectUri],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: config.scope,
  };
  const provider = new InMemoryOAuthClientProvider(config.redirectUri, clientMetadata, (url) => {
    authorizationUrl = url;
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const client = new Client({ name: "calle-oauth-example", version: "0.0.0" }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(config.serverUrl), { authProvider: provider });
    try {
      await client.connect(transport);
      return { client, transport };
    } catch (error) {
      if (!(error instanceof UnauthorizedError)) {
        throw error;
      }
      if (!authorizationUrl) {
        throw new Error("OAuth authorization was required, but no authorization URL was produced.");
      }
      const code = await getAuthorizationCode(config, authorizationUrl);
      await transport.finishAuth(code);
      await transport.close().catch(() => {});
    }
  }

  throw new Error("OAuth connection did not complete after multiple attempts.");
}

async function runClient(config: Config): Promise<void> {
  const { client, transport } = await connect(config);
  emit("connected", { server_url: config.serverUrl, session_id: transport.sessionId || null });

  const tools = await client.listTools();
  emit("tools/list", { count: tools.tools.length, tools: tools.tools.map((tool) => tool.name) });

  if (config.toolName) {
    const result = await client.callTool({ name: config.toolName, arguments: config.toolArgs });
    emit("tools/call", { tool_name: config.toolName, result });
  }

  const resources = await client.listResources().catch((error) => {
    emit("resources/list", { skipped: true, message: error?.message || String(error) });
    return { resources: [] };
  });
  emit("resources/list", { count: resources.resources.length });

  const firstResource = resources.resources[0];
  if (firstResource) {
    const result = await client.readResource({ uri: firstResource.uri });
    emit("resources/read", { uri: firstResource.uri, result: summarizeResourceResult(result as Record<string, unknown>) });
  } else {
    emit("resources/read", { skipped: true, message: "no resources available" });
  }

  await transport.close().catch(() => {});
}

export async function main(): Promise<void> {
  const config = readConfig();
  await runClient(config);
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  main().catch((error) => {
    emitError({ ok: false, error_code: "oauth_client_error", message: error?.message || String(error) });
    process.exitCode = 1;
  });
}
