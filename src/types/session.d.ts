import "express-session";

declare module "express-session" {
  interface SessionData {
    state?: string;
    user?: {
      id: string;
      email?: string;
      name?: string;
      preferred_username?: string;
      picture?: string;
    };
  }
}

