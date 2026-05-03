import { config } from "../config.js";

type OidcEndpoints = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
};

let cachedEndpoints: OidcEndpoints | null = null;
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Missing OIDC field: ${field}`);
  return value;
}

async function discoverEndpoints(): Promise<OidcEndpoints> {
  if (cachedEndpoints) return cachedEndpoints;

  const response = await fetch(`${config.oidc.issuer}/.well-known/openid-configuration`);
  if (!response.ok) throw new Error(`Failed OIDC discovery: ${response.status}`);
  const body = (await response.json()) as Record<string, string>;

  const endpoints: OidcEndpoints = {
    authorization_endpoint: requireString(body.authorization_endpoint, "authorization_endpoint"),
    token_endpoint: requireString(body.token_endpoint, "token_endpoint"),
    userinfo_endpoint: requireString(body.userinfo_endpoint, "userinfo_endpoint"),
  };
  if (typeof body.end_session_endpoint === "string") {
    endpoints.end_session_endpoint = body.end_session_endpoint;
  }
  cachedEndpoints = endpoints;

  return cachedEndpoints;
}

export function generateState(): string {
  return crypto.randomUUID();
}

export async function getAuthorizationUrl(state: string): Promise<string> {
  const endpoints = await discoverEndpoints();
  const params = new URLSearchParams({
    client_id: config.oidc.clientId,
    redirect_uri: config.oidc.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state,
  });
  return `${endpoints.authorization_endpoint}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const endpoints = await discoverEndpoints();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.oidc.redirectUri,
    client_id: config.oidc.clientId,
    client_secret: config.oidc.clientSecret,
  });

  const response = await fetch(endpoints.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status}`);
  const json = (await response.json()) as Record<string, string>;
  return requireString(json.access_token, "access_token");
}

export async function fetchUserInfo(accessToken: string) {
  const endpoints = await discoverEndpoints();
  const response = await fetch(endpoints.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`User info failed: ${response.status}`);
  return (await response.json()) as {
    sub: string;
    email?: string;
    name?: string;
    preferred_username?: string;
    picture?: string;
  };
}
