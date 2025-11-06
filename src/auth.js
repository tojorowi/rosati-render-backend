export function requireBearer(req, res, next) {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    // For MVP, accept a single static token set as an env or in your MDM config.
    const expected = process.env.BEARER_TOKEN || "dev-token";
    if (token !== expected) return res.status(401).json({ error: "unauthorized" });
    next();
  }