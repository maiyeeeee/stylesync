require("./loadEnv")

const express = require("express")
const cors = require("cors")
const session = require("express-session")
const crypto = require("node:crypto")
const path = require("node:path")

const MySQLStore = require("express-mysql-session")(session)
const db = require("./db")

const authRoutes = require("./routes/authRoutes")
const serviceRoutes = require("./routes/serviceRoutes")
const appointmentRoutes = require("./routes/appointments")
const inventoryRoutes = require("./routes/inventoryRoutes")
const transactionRoutes = require("./routes/transactionRoutes")
const recommendationRoutes = require("./routes/recommendationRoutes")
const dashboardRoutes = require("./routes/dashboardRoutes")
const reportRoutes = require("./routes/reportRoutes")
const gadRoutes = require("./routes/gadRoutes")
const staffRoutes = require("./routes/staffRoutes")

const app = express()
const database = db.promise()

const PORT = Number(process.env.PORT || 5000)
const IS_PRODUCTION = process.env.NODE_ENV === "production"

const COOKIE_NAME = "stylesync.sid"
const IDLE_TIMEOUT = 30 * 60 * 1000
const ABSOLUTE_TIMEOUT = 8 * 60 * 60 * 1000

const secret = process.env.SESSION_SECRET

if (!secret || Buffer.byteLength(secret) < 32) {
  console.error(
    "Missing or invalid SESSION_SECRET. Generate a random secret and add it to .env."
  )
  process.exit(1)
}

const allowedOrigins = (
  process.env.CLIENT_ORIGINS ||
  [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
  ].join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const cookieOptions = {
  httpOnly: true,
  secure: IS_PRODUCTION,
  sameSite: "lax",
  path: "/",
}

const sessionStore = new MySQLStore(
  {
    createDatabaseTable: true,
    expiration: IDLE_TIMEOUT,
    schema: {
      tableName: "auth_sessions",
    },
  },
  database
)

app.disable("x-powered-by")

// Enable only when deployed behind one trusted reverse proxy.
if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1)
}

app.use((req, res, next) => {
  const origin = req.get("Origin")

  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      error: "This website is not allowed to access the server.",
    })
  }

  next()
})

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
)

app.use(express.json({ limit: "2mb" }))

// Preserve uploaded service images in either existing location.
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
)

app.use(
  "/uploads",
  express.static(path.join(__dirname, "../uploads"))
)

// Opening the backend address leads to the public website.
app.get("/", (req, res) => {
  res.redirect(`${allowedOrigins[0]}/`)
})

function credentialVersion(passwordHash) {
  return crypto
    .createHmac("sha256", secret)
    .update(passwordHash)
    .digest("hex")
}

function clearSession(req, res) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        reject(error)
        return
      }

      res.clearCookie(COOKIE_NAME, cookieOptions)
      resolve()
    })
  })
}

function getSessionPayload(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex")
  }

  return {
    user: req.user || null,
    csrfToken: req.session.csrfToken,
    expiresAt: req.user
      ? Math.min(
          Date.now() + IDLE_TIMEOUT,
          req.session.authenticatedAt + ABSOLUTE_TIMEOUT
        )
      : null,
  }
}

function requireUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Please log in to continue.",
    })
  }

  next()
}

function requireAdmin(req, res, next) {
  return requireUser(req, res, () => {
    if (!["admin", "owner"].includes(req.user.role)) {
      return res.status(403).json({
        error: "Administrator access is required.",
      })
    }

    next()
  })
}

function requireOwner(req, res, next) {
  return requireUser(req, res, () => {
    if (req.user.role !== "owner") {
      return res.status(403).json({
        error: "Only the owner can manage accounts.",
      })
    }

    next()
  })
}

// These helpers will also be used by the updated authRoutes.js.
app.locals.auth = {
  credentialVersion,
  clearSession,
  getSessionPayload,
  requireUser,
  requireAdmin,
  requireOwner,
}

const api = express.Router()

api.use((req, res, next) => {
  res.set("Cache-Control", "no-store")
  res.set("X-Content-Type-Options", "nosniff")
  next()
})

api.use(
  session({
    name: COOKIE_NAME,
    secret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      ...cookieOptions,
      maxAge: IDLE_TIMEOUT,
    },
  })
)

// Public website operations. Reading appointment records and all admin actions
// are deliberately excluded. Offline submissions require an admin session.
function isPublicSiteRequest(req) {
  // stylesync-payment-v1: only these token-protected booking operations are public.
  const paymentPath = req.path.replace(/\/+$/, '')
  if ((['GET', 'HEAD'].includes(req.method) && paymentPath === '/booking-payments/reservation') ||
      (req.method === 'POST' && ['/booking-payments/reserve', '/booking-payments/submit'].includes(paymentPath))) return true

  const currentPath = req.path.replace(/\/+$/, "") || "/"
  const isRead = ["GET", "HEAD"].includes(req.method)
  return (
    (isRead && currentPath === "/services") ||
    (isRead && currentPath === "/appointments/availability") ||
    (req.method === "POST" && currentPath === "/appointments" &&
      !Object.prototype.hasOwnProperty.call(req.body || {}, "offline_id"))
  )
}

// Verify authenticated requests against MySQL. Public pages need no login.
api.use(async (req, res, next) => {
  try {
    if (isPublicSiteRequest(req) || !req.session.userId) {
      return next()
    }

    const authenticatedAt = req.session.authenticatedAt

    if (
      !Number.isFinite(authenticatedAt) ||
      Date.now() - authenticatedAt >= ABSOLUTE_TIMEOUT
    ) {
      await clearSession(req, res)

      return res.status(401).json({
        error: "Your session expired. Please log in again.",
      })
    }

    const [users] = await database.query(
      `SELECT user_id, username, role, password, account_status
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [req.session.userId]
    )

    const user = users[0]

    if (!user || user.account_status !== "Active" || !["admin", "owner", "user"].includes(user.role)) {
      await clearSession(req, res)

      return res.status(401).json({
        error: "Your account is no longer available.",
      })
    }

    if (
      req.session.credentialVersion !== credentialVersion(user.password)
    ) {
      await clearSession(req, res)

      return res.status(401).json({
        error: "Your login is no longer valid. Please log in again.",
      })
    }

    req.user = {
      user_id: user.user_id,
      username: user.username,
      role: user.role,
    }

    next()
  } catch (error) {
    next(error)
  }
})

// Session bootstrap and admin login are accessible before authentication.
const publicAuthPaths = new Set([
  "/auth/session",
  "/auth/login",
  "/auth/logout",
  "/auth/signup",
  "/auth/owner-registration",
  "/auth/forgot-password",
  "/auth/reset-password",
])

api.use((req, res, next) => {
  const currentPath = req.path.replace(/\/+$/, "")

  if (publicAuthPaths.has(currentPath) || isPublicSiteRequest(req)) {
    return next()
  }

  return requireUser(req, res, next)
})

// Protect every state-changing request with a CSRF token.
api.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next()
  }

  const supplied = Buffer.from(req.get("X-CSRF-Token") || "")
  const expected = Buffer.from(req.session.csrfToken || "")

  const valid =
    expected.length > 0 &&
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)

  if (!valid) {
    return res.status(403).json({
      error: "Your security token expired. Refresh and try again.",
      code: "CSRF_INVALID",
    })
  }

  next()
})

api.get("/auth/session", (req, res) => {
  res.json(getSessionPayload(req))
})

api.post("/auth/logout", async (req, res, next) => {
  try {
    await clearSession(req, res)

    res.json({
      message: "Logged out successfully.",
    })
  } catch (error) {
    next(error)
  }
})

// Existing account-management endpoints require the actual owner session.
api.use("/auth/register", requireOwner)
api.use("/auth/users", requireOwner)
api.use("/auth", require("./routes/passwordResetRoutes"))
api.use("/auth", authRoutes)
api.use("/auth", authRoutes)

// Visitors can browse services without logging in.
// Only administrators can add, edit, or delete them.
require('./routes/bookingPaymentRoutes')(api, { requireAdmin, requireOwner })

api.use(
  "/services",
  (req, res, next) => {
    if (["GET", "HEAD"].includes(req.method)) {
      return next()
    }

    return requireAdmin(req, res, next)
  },
  serviceRoutes
)

// Customers can check availability and submit normal bookings.
// Administration and offline synchronization require admin privileges.
api.use(
  "/appointments",
  (req, res, next) => {
    const currentPath = req.path.replace(/\/+$/, "") || "/"

    const checkingAvailability =
      ["GET", "HEAD"].includes(req.method) &&
      currentPath === "/availability"

    const submittingBooking =
      req.method === "POST" &&
      currentPath === "/" &&
      !Object.prototype.hasOwnProperty.call(req.body || {}, "offline_id")

    if (checkingAvailability || submittingBooking) {
      return next()
    }

    return requireAdmin(req, res, next)
  },
  appointmentRoutes
)

api.use("/staff", requireAdmin, staffRoutes)
api.use("/inventory", requireAdmin, inventoryRoutes)
api.use("/transactions", requireAdmin, transactionRoutes)
api.use("/recommendations", requireAdmin, recommendationRoutes)
api.use("/dashboard", requireAdmin, dashboardRoutes)
api.use("/reports", requireAdmin, reportRoutes)
api.use("/gad", requireAdmin, gadRoutes)

api.get("/test-db", requireAdmin, async (req, res, next) => {
  try {
    await database.query("SELECT 1")

    res.json({
      message: "Database connected successfully.",
    })
  } catch (error) {
    next(error)
  }
})

// New API URLs, including /api/auth/session and /api/auth/logout.
app.use("/api", api)

// Preserve existing API addresses while updating the frontend files.
// Both address formats use the same authentication and authorization.
app.use("/", api)

app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found.",
  })
})

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error)
  }

  console.error("Request failed:", error.code || error.name)

  res.status(error.status === 400 ? 400 : 500).json({
    error:
      error.status === 400
        ? "Invalid request."
        : "Unable to complete the request. Please try again.",
  })
})

async function startServer() {
  await database.query("SELECT 1")
  await sessionStore.onReady()

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`StyleSync server running on port ${PORT}`)
  })
}

startServer().catch((error) => {
  console.error(
    "Server startup failed. Check the database connection and session-table permissions.",
    error.code || error.message
  )

  process.exit(1)
})