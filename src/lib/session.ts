import session from "express-session";
import type { Request, Response, NextFunction } from "express";
import type { RequestHandler } from "express";
import { config } from "../config.js";

export const sessionMiddleware: RequestHandler = session({
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.nodeEnv === "production" ? "auto" : false,
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: "lax",
  },
});

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
