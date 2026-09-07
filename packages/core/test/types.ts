import {
  currentTokenDocument,
  loginWithBroker,
  tokenIsUsable,
  type BrokerLoginConfig,
} from "@call-e/core";
import { ensurePendingLogin } from "@call-e/core/broker-client";
import { readJson } from "@call-e/core/cache";
import { resolveServerUrl } from "@call-e/core/config";
import { DEFAULT_CHANNEL } from "@call-e/core/constants";
import { HttpStatusError, TransportError, causeCodeOf, requestJson } from "@call-e/core/http";
import { McpHttpError, callMcpTool, listMcpTools } from "@call-e/core/mcp-client";
import {
  publicRemoteError,
  redactSecrets,
  safeRemoteCode,
  safeRemoteString,
  sanitizeRemoteError,
  stripTerminalControls,
  type SanitizedRemoteError,
} from "@call-e/core/sanitize";

const config: BrokerLoginConfig = {
  brokerBaseUrl: "https://example.test",
  serverUrl: resolveServerUrl({
    baseUrl: "https://example.test",
    channel: DEFAULT_CHANNEL,
  }),
  authBaseUrl: "https://example.test",
  channel: DEFAULT_CHANNEL,
  scope: "openid email profile",
  clientName: "calle Login",
  cacheRoot: "/tmp/calle-core-types",
  timeoutSeconds: 15,
  minTtlSeconds: 300,
  pollTimeoutSeconds: 300,
};

interface PlanCallResult {
  plan_id: string;
  ready_to_run: boolean;
  confirm_token: string | null;
}

async function consumePublicTypes() {
  const cached = readJson("/tmp/token.json");
  if (tokenIsUsable(cached, config.minTtlSeconds)) {
    cached.token.access_token.toUpperCase();
  }

  const pending = await ensurePendingLogin(config);
  pending.pending.login_url.toUpperCase();

  const login = await loginWithBroker(config, { noBrowserOpen: true });
  login.tokenDocument.token.access_token.toUpperCase();

  const token = currentTokenDocument(config);
  token?.token.access_token.toUpperCase();

  const tools = await listMcpTools({ config });
  tools.tools?.map((tool) => tool.name);

  const result = await callMcpTool<PlanCallResult>({
    config,
    toolName: "plan_call",
    toolArguments: { goal: "Confirm the appointment" },
    timeoutSeconds: 150,
  });
  result.plan_id.toUpperCase();

  const status = await requestJson<{ ok: boolean }>("GET", "https://example.test/status");
  status.ok.valueOf();

  try {
    await requestJson("GET", "https://example.test/status");
  } catch (error) {
    if (error instanceof TransportError) {
      error.timedOut.valueOf();
      error.code?.toUpperCase();
      error.url?.toUpperCase();
    }
    if (error instanceof HttpStatusError) {
      error.statusCode?.toFixed();
      error.url?.toUpperCase();
    }
    if (error instanceof McpHttpError) {
      error.transport.valueOf();
      error.causeCode?.toUpperCase();
      error.remoteError?.message?.toUpperCase();
    }
    causeCodeOf(error)?.toUpperCase();
  }

  const shown: SanitizedRemoteError | null = publicRemoteError({ code: -32000, message: "x" });
  shown?.code?.toUpperCase();
  sanitizeRemoteError('{"error":"x"}')?.message?.toUpperCase();
  safeRemoteString(stripTerminalControls(redactSecrets("y")), 100)?.toUpperCase();
  safeRemoteCode(12)?.toUpperCase();
}

void consumePublicTypes;
