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
import { requestJson } from "@call-e/core/http";
import { callMcpTool, listMcpTools } from "@call-e/core/mcp-client";

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
  });
  result.plan_id.toUpperCase();

  const status = await requestJson<{ ok: boolean }>("GET", "https://example.test/status");
  status.ok.valueOf();
}

void consumePublicTypes;
