// Express API with PostgreSQL & Redis
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { Pool } = require("pg");
const { createClient } = require("redis");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("combined"));

// ─── PostgreSQL ───────────────────────────────────────────────────────────────
const pgPool = new Pool({
  host:     process.env.PG_HOST     || "localhost",
  port:     parseInt(process.env.PG_PORT || "5432"),
  database: process.env.PG_DB       || "appdb",
  user:     process.env.PG_USER     || "postgres",
  password: process.env.PG_PASSWORD || "postgres",
});

async function initDB() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id        SERIAL PRIMARY KEY,
      path      TEXT        NOT NULL,
      ip        TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✅ PostgreSQL table ready");
}

// ─── Redis ────────────────────────────────────────────────────────────────────
const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.error("Redis error:", err));

// ─── Routes ───────────────────────────────────────────────────────────────────

/** Health check */
app.get("/health", async (req, res) => {
  const checks = { status: "ok", postgres: "unknown", redis: "unknown" };
  try {
    await pgPool.query("SELECT 1");
    checks.postgres = "ok";
  } catch {
    checks.postgres = "error";
    checks.status = "degraded";
  }
  try {
    await redisClient.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
    checks.status = "degraded";
  }
  res.json(checks);
});

/** Record a visit and return running total */
app.post("/api/visit", async (req, res) => {
  try {
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const path = req.body.path || "/";
    const userAgent = req.headers["user-agent"] || "";

    // Persist to Postgres
    await pgPool.query(
      "INSERT INTO visits (path, ip, user_agent) VALUES ($1, $2, $3)",
      [path, ip, userAgent]
    );

    // Increment counter in Redis
    const total = await redisClient.incr("visit_count");
    res.json({ success: true, total_visits: total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Return aggregated stats */
app.get("/api/stats", async (req, res) => {
  try {
    // Total from Redis (fast)
    const cachedTotal = await redisClient.get("visit_count");

    // Recent visits from Postgres
    const { rows: recent } = await pgPool.query(
      "SELECT path, ip, user_agent, created_at FROM visits ORDER BY created_at DESC LIMIT 10"
    );

    // Top paths
    const { rows: topPaths } = await pgPool.query(`
      SELECT path, COUNT(*) AS count
      FROM visits
      GROUP BY path
      ORDER BY count DESC
      LIMIT 5
    `);

    res.json({
      total_visits: parseInt(cachedTotal || "0"),
      recent_visits: recent,
      top_paths: topPaths,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Return all visits (paginated) */
app.get("/api/visits", async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  || "20"), 100);
    const offset = parseInt(req.query.offset || "0");
    const { rows } = await pgPool.query(
      "SELECT * FROM visits ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    const { rows: [{ count }] } = await pgPool.query("SELECT COUNT(*) FROM visits");
    res.json({ visits: rows, total: parseInt(count), limit, offset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await redisClient.connect();
    console.log("✅ Redis connected");
  } catch (err) {
    console.error("⚠️  Redis unavailable, continuing in degraded mode:", err.message);
  }
  await initDB();
  app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));
})();