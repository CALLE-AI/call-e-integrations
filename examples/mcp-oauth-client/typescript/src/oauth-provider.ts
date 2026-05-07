import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientProvider, OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";

export class InMemoryOAuthClientProvider implements OAuthClientProvider {
  private clientInfo?: OAuthClientInformationMixed;
  private savedTokens?: OAuthTokens;
  private savedCodeVerifier?: string;
  private savedDiscovery?: OAuthDiscoveryState;
  private readonly onRedirect: (url: URL) => void;

  constructor(
    private readonly redirectUri: string | URL,
    private readonly metadata: OAuthClientMetadata,
    onRedirect?: (url: URL) => void,
    public readonly clientMetadataUrl?: string
  ) {
    this.onRedirect = onRedirect || ((url) => console.log(`authorization_url: ${url.toString()}`));
  }

  get redirectUrl(): string | URL {
    return this.redirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return this.metadata;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.clientInfo;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed): void {
    this.clientInfo = clientInformation;
  }

  tokens(): OAuthTokens | undefined {
    return this.savedTokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.savedTokens = tokens;
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    this.onRedirect(authorizationUrl);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.savedCodeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.savedCodeVerifier) {
      throw new Error("No OAuth code verifier has been saved.");
    }
    return this.savedCodeVerifier;
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    this.savedDiscovery = state;
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return this.savedDiscovery;
  }
}
