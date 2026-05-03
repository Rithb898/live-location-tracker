export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  session: {
    secret: process.env.SESSION_SECRET ?? "dev-session-secret-change-me",
  },
  oidc: {
    issuer: process.env.OIDC_ISSUER ?? "",
    clientId: process.env.OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
    redirectUri: process.env.OIDC_REDIRECT_URI ?? "http://localhost:8888/auth/callback",
  },
};

