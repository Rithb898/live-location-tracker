import { Router } from "express";
import type { Router as ExpressRouter } from "express";
import { exchangeCodeForToken, fetchUserInfo, generateState, getAuthorizationUrl } from "../services/oidc.js";

export const authRouter: ExpressRouter = Router();

authRouter.get("/login", async (req, res) => {
  try {
    const state = generateState();
    req.session.state = state;
    const url = await getAuthorizationUrl(state);
    res.redirect(url);
  } catch (error) {
    console.error("auth/login failed", error);
    res.status(500).json({ error: "Login init failed" });
  }
});

authRouter.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const state = req.query.state;
    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).json({ error: "Missing callback params" });
      return;
    }
    if (!req.session.state || req.session.state !== state) {
      res.status(400).json({ error: "Invalid state" });
      return;
    }
    delete req.session.state;

    const accessToken = await exchangeCodeForToken(code);
    const userInfo = await fetchUserInfo(accessToken);
    req.session.user = { id: userInfo.sub };
    if (userInfo.email) req.session.user.email = userInfo.email;
    if (userInfo.name) req.session.user.name = userInfo.name;
    if (userInfo.preferred_username) req.session.user.preferred_username = userInfo.preferred_username;
    if (userInfo.picture) req.session.user.picture = userInfo.picture;
    res.redirect("/");
  } catch (error) {
    console.error("auth/callback failed", error);
    res.status(500).json({ error: "Authentication failed" });
  }
});

authRouter.get("/me", (req, res) => {
  if (!req.session.user) {
    res.json({ authenticated: false, user: null });
    return;
  }
  res.json({ authenticated: true, user: req.session.user });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});
