const express = require("express")
const bcrypt = require("bcrypt")
const crypto = require("node:crypto")
const { rateLimit } = require("express-rate-limit")
const db = require("../db")

const router = express.Router()
const database = db.promise()

const validRoles = ["owner", "admin", "user"]

const dummyPasswordHash = bcrypt.hashSync("invalid-account-placeholder", 12)

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many login attempts. Please try again in 15 minutes.",
    },
})

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many registration attempts. Please try again later.",
    },
})

function requireOwner(req, res, next) {
    return req.app.locals.auth.requireOwner(req, res, next)
}

function publicUser(user) {
    return {
        user_id: user.user_id,
        username: user.username,
        role: user.role,
    }
}

// LOGIN
router.post("/login", loginLimiter, async (req, res, next) => {
    try {
        const body = req.body || {}
        const suppliedIdentifier = body.identifier ?? body.username

        const identifier =
            typeof suppliedIdentifier === "string" ? suppliedIdentifier.trim().toLowerCase() : ""

        const password = typeof body.password === "string" ? body.password : ""

        if (
            !identifier ||
            identifier.length > 254 ||
            !password ||
            Buffer.byteLength(password) > 72
        ) {
            return res.status(400).json({
                error: "Enter your username or email and password.",
            })
        }

        const [users] = await database.query(
            `SELECT user_id, username, email, password, role, account_status
       FROM users
       WHERE LOWER(TRIM(username)) = ?
          OR LOWER(TRIM(email)) = ?
       LIMIT 2`,
            [identifier, identifier],
        )

        const user = users.length === 1 ? users[0] : null

        const passwordMatches = await bcrypt.compare(password, user?.password || dummyPasswordHash)

        if (!user || !passwordMatches || !["owner", "admin"].includes(user.role)) {
            return res.status(401).json({
                error: "Incorrect username/email or password.",
            })
        }

        // Reveal approval status only after verifying the password.
        if (user.account_status !== "Active") {
            return res.status(403).json({
                error:
                    user.account_status === "Pending"
                        ? "Your registration is awaiting the salon owner's approval."
                        : "Your account is not approved. Please contact the salon owner.",
            })
        }

        await new Promise((resolve, reject) => {
            req.session.regenerate((error) => {
                if (error) return reject(error)
                resolve()
            })
        })

        req.session.userId = user.user_id
        req.session.authenticatedAt = Date.now()

        req.session.credentialVersion = req.app.locals.auth.credentialVersion(user.password)

        req.user = publicUser(user)

        const payload = req.app.locals.auth.getSessionPayload(req)

        await new Promise((resolve, reject) => {
            req.session.save((error) => {
                if (error) return reject(error)
                resolve()
            })
        })

        return res.json({
            ...payload,
            message: "Login successful.",
            redirectTo: "/admin",
        })
    } catch (error) {
        next(error)
    }
})

// SHARED ACCOUNT CREATION
async function createAccount(req, res, next, managedByOwner) {
    try {
        const body = req.body || {}

        const username = typeof body.username === "string" ? body.username.trim() : ""

        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

        const password = typeof body.password === "string" ? body.password : ""

        // Public registration cannot grant owner privileges or Active status.
        const role = managedByOwner ? body.role : "admin"
        const accountStatus = managedByOwner ? "Active" : "Pending"

        if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
            return res.status(400).json({
                error: "Username must be 3–50 characters using letters, numbers, dots, underscores, or hyphens.",
            })
        }

        const emailRequired = !managedByOwner

        if (
            (emailRequired || email) &&
            (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        ) {
            return res.status(400).json({
                error: "Enter a valid email address.",
            })
        }

        if (password.length < 8 || Buffer.byteLength(password) > 72) {
            return res.status(400).json({
                error: "Password must contain at least 8 characters and at most 72 bytes.",
            })
        }

        if (!managedByOwner && body.confirmPassword !== password) {
            return res.status(400).json({
                error: "Passwords do not match.",
            })
        }

        if (!validRoles.includes(role)) {
            return res.status(400).json({
                error: "Invalid account role.",
            })
        }

        const normalizedEmail = email || null

        const [existing] = await database.query(
            `SELECT user_id
       FROM users
       WHERE LOWER(TRIM(username)) = ?
          OR LOWER(TRIM(email)) = ?
          OR LOWER(TRIM(username)) = ?
       LIMIT 1`,
            [username.toLowerCase(), normalizedEmail, normalizedEmail],
        )

        if (existing.length > 0) {
            return res.status(409).json({
                error: "That username or email is already registered.",
            })
        }

        const passwordHash = await bcrypt.hash(password, 12)

        const [result] = await database.query(
            `INSERT INTO users
         (username, email, password, role, account_status)
       VALUES (?, ?, ?, ?, ?)`,
            [username, normalizedEmail, passwordHash, role, accountStatus],
        )

        return res.status(201).json({
            message: managedByOwner
                ? "Account created successfully."
                : "Registration submitted. Please wait for the salon owner's approval before logging in.",
            user_id: result.insertId,
        })
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({
                error: "That username or email is already registered.",
            })
        }

        next(error)
    }
}

// PUBLIC STAFF REGISTRATION: always Pending.
router.post("/signup", signupLimiter, (req, res, next) => {
    return createAccount(req, res, next, false)
})

// OWNER-MANAGED ACCOUNT CREATION
router.post("/register", requireOwner, (req, res, next) => {
    return createAccount(req, res, next, true)
})

// LIST ACCOUNTS: owner only.
router.get("/users", requireOwner, async (req, res, next) => {
    try {
        const [users] = await database.query(
            `SELECT user_id, username, email, role, account_status, created_at
       FROM users
       ORDER BY created_at DESC`,
        )

        res.json(users)
    } catch (error) {
        next(error)
    }
})

// TRANSACTION HELPER
async function transaction(work) {
    const connection = await database.getConnection()

    try {
        await connection.beginTransaction()

        const result = await work(connection)

        await connection.commit()

        return result
    } catch (error) {
        await connection.rollback()
        throw error
    } finally {
        connection.release()
    }
}

function problem(message, status = 400) {
    return Object.assign(new Error(message), {
        httpStatus: status,
    })
}

function registrationError(error, res, next) {
    if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
            error: "That username or email is already registered.",
        })
    }

    if (error.httpStatus) {
        return res.status(error.httpStatus).json({
            error: error.message,
        })
    }

    next(error)
}

// APPROVE OR REJECT STAFF REGISTRATION
router.patch("/users/:id/approval", requireOwner, async (req, res, next) => {
    try {
        const id = Number(req.params.id)
        const decision = req.body?.decision

        if (!Number.isSafeInteger(id) || id < 1 || !["approve", "reject"].includes(decision)) {
            throw problem("Choose a valid pending account and approval decision.")
        }

        const [result] = await database.query(
            `UPDATE users
         SET account_status = ?
         WHERE user_id = ?
           AND role = 'admin'
           AND account_status = 'Pending'`,
            [decision === "approve" ? "Active" : "Rejected", id],
        )

        if (result.affectedRows !== 1) {
            throw problem("This request is no longer pending. Refresh the accounts list.", 409)
        }

        res.json({
            message:
                decision === "approve"
                    ? "Staff registration approved. They can now log in."
                    : "Staff registration rejected.",
        })
    } catch (error) {
        registrationError(error, res, next)
    }
})

// OWNER INVITATIONS
const invitationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => String(req.user.user_id),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many invitation attempts. Please try again later.",
    },
})

router.get("/owner-invitations", requireOwner, async (req, res, next) => {
    try {
        const [invitations] = await database.query(
            `SELECT
           invitation_id,
           email,
           created_at,
           expires_at,
           used_at,
           revoked_at,
           CASE
             WHEN used_at IS NOT NULL THEN 'Used'
             WHEN revoked_at IS NOT NULL THEN 'Revoked'
             WHEN expires_at <= UTC_TIMESTAMP() THEN 'Expired'
             ELSE 'Pending'
           END AS status
         FROM owner_invitations
         ORDER BY invitation_id DESC
         LIMIT 100`,
        )

        res.json(invitations)
    } catch (error) {
        next(error)
    }
})

router.post("/owner-invitations", requireOwner, invitationLimiter, async (req, res, next) => {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : ""

        const password = req.body?.currentPassword

        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw problem("Enter the real owner's email address.")
        }

        if (typeof password !== "string" || !password || Buffer.byteLength(password) > 72) {
            throw problem("Enter your current owner password to authorize the invitation.")
        }

        const token = crypto.randomBytes(32).toString("hex")

        const hash = crypto.createHash("sha256").update(token).digest("hex")

        const invitationId = await transaction(async (connection) => {
            const [owners] = await connection.query(
                `SELECT user_id, password, role, account_status
           FROM users
           WHERE user_id = ?
           FOR UPDATE`,
                [req.user.user_id],
            )

            const owner = owners[0]

            if (!owner || owner.role !== "owner" || owner.account_status !== "Active") {
                throw problem("Owner access is no longer available.", 403)
            }

            if (!(await bcrypt.compare(password, owner.password))) {
                throw problem("Current owner password is incorrect.")
            }

            const [existing] = await connection.query(
                `SELECT user_id
           FROM users
           WHERE LOWER(TRIM(email)) = ?
           LIMIT 1`,
                [email],
            )

            if (existing.length) {
                throw problem(
                    "That email already belongs to an account. Use a different email for the new owner account.",
                    409,
                )
            }

            const [result] = await connection.query(
                `INSERT INTO owner_invitations
             (token_hash, email, invited_by, expires_at)
           VALUES (
             ?,
             ?,
             ?,
             DATE_ADD(UTC_TIMESTAMP(), INTERVAL 24 HOUR)
           )`,
                [hash, email, req.user.user_id],
            )

            return result.insertId
        })

        // Return the raw token only once. Store only its SHA-256 hash.
        res.status(201).json({
            invitation_id: invitationId,
            token,
            expiresInHours: 24,
            message:
                "Invitation created. Share it privately with the owner; it expires in 24 hours.",
        })
    } catch (error) {
        registrationError(error, res, next)
    }
})

router.delete("/owner-invitations/:id", requireOwner, async (req, res, next) => {
    try {
        const id = Number(req.params.id)

        if (!Number.isSafeInteger(id) || id < 1) {
            throw problem("Invalid invitation.")
        }

        const [result] = await database.query(
            `UPDATE owner_invitations
         SET revoked_at = UTC_TIMESTAMP()
         WHERE invitation_id = ?
           AND used_at IS NULL
           AND revoked_at IS NULL`,
            [id],
        )

        if (result.affectedRows !== 1) {
            throw problem("This invitation was already used or revoked.", 409)
        }

        res.json({
            message: "Invitation revoked.",
        })
    } catch (error) {
        registrationError(error, res, next)
    }
})

// PUBLIC OWNER REGISTRATION: valid private invitation required.
router.post("/owner-registration", signupLimiter, async (req, res, next) => {
    try {
        const body = req.body || {}

        const username = typeof body.username === "string" ? body.username.trim() : ""

        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

        const password = body.password
        const token = body.token

        if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
            throw problem("Username must be 3–50 letters, numbers, dots, underscores, or hyphens.")
        }

        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw problem("Enter the email address used for your owner invitation.")
        }

        if (
            typeof password !== "string" ||
            password.length < 8 ||
            Buffer.byteLength(password) > 72
        ) {
            throw problem("Password must contain at least 8 characters and at most 72 bytes.")
        }

        if (body.confirmPassword !== password) {
            throw problem("Passwords do not match.")
        }

        if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
            throw problem("A valid owner invitation is required.")
        }

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex")

        const passwordHash = await bcrypt.hash(password, 12)

        const userId = await transaction(async (connection) => {
            const [invitations] = await connection.query(
                `SELECT i.invitation_id, i.email
           FROM owner_invitations i
           INNER JOIN users u ON u.user_id = i.invited_by
           WHERE i.token_hash = ?
             AND i.used_at IS NULL
             AND i.revoked_at IS NULL
             AND i.expires_at > UTC_TIMESTAMP()
             AND u.role = 'owner'
             AND u.account_status = 'Active'
           FOR UPDATE`,
                [tokenHash],
            )

            const invitation = invitations[0]

            if (!invitation || invitation.email.toLowerCase() !== email) {
                throw problem(
                    "The invitation is invalid, expired, already used, or belongs to another email.",
                )
            }

            const [existing] = await connection.query(
                `SELECT user_id
           FROM users
           WHERE LOWER(TRIM(username)) = ?
              OR LOWER(TRIM(email)) = ?
              OR LOWER(TRIM(username)) = ?
           LIMIT 1`,
                [username.toLowerCase(), email, email],
            )

            if (existing.length) {
                throw problem("That username or email is already registered.", 409)
            }

            const [result] = await connection.query(
                `INSERT INTO users
             (username, email, password, role, account_status)
           VALUES (?, ?, ?, 'owner', 'Active')`,
                [username, email, passwordHash],
            )

            await connection.query(
                `UPDATE owner_invitations
           SET used_at = UTC_TIMESTAMP()
           WHERE invitation_id = ?`,
                [invitation.invitation_id],
            )

            return result.insertId
        })

        // Registration does not automatically log in the new owner.
        res.status(201).json({
            user_id: userId,
            message: "Your owner account is ready. Log in using your new details.",
        })
    } catch (error) {
        registrationError(error, res, next)
    }
})

// DELETE ACCOUNT: owner only.
router.delete("/users/:id", requireOwner, async (req, res, next) => {
    try {
        const userId = Number(req.params.id)

        if (!Number.isSafeInteger(userId) || userId < 1) {
            return res.status(400).json({
                error: "Invalid account ID.",
            })
        }

        if (userId === Number(req.user.user_id)) {
            return res.status(400).json({
                error: "You cannot delete your own account.",
            })
        }

        const affectedRows = await transaction(async (connection) => {
            const [owners] = await connection.query(
                `SELECT user_id
           FROM users
           WHERE role = 'owner'
             AND account_status = 'Active'
           ORDER BY user_id
           FOR UPDATE`,
            )

            const actingOwnerExists = owners.some(
                (owner) => Number(owner.user_id) === Number(req.user.user_id),
            )

            if (!actingOwnerExists) {
                throw problem("Owner access is no longer available.", 403)
            }

            const deletingOwner = owners.some((owner) => Number(owner.user_id) === userId)

            if (deletingOwner && owners.length <= 1) {
                throw problem("The last active owner cannot be deleted.")
            }

            const [result] = await connection.query("DELETE FROM users WHERE user_id = ?", [userId])

            if (!result.affectedRows) {
                throw problem("Account not found.", 404)
            }

            return result.affectedRows
        })

        res.json({
            message: "Account deleted successfully.",
            affectedRows,
        })
    } catch (error) {
        registrationError(error, res, next)
    }
})

// CHANGE OWN PASSWORD
const passwordChangeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => String(req.user.user_id),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many password change attempts. Try again in 15 minutes.",
    },
})

router.post(
    "/change-password",
    (req, res, next) => {
        return req.app.locals.auth.requireUser(req, res, next)
    },
    passwordChangeLimiter,
    async (req, res, next) => {
        try {
            const { currentPassword, newPassword, confirmPassword } = req.body || {}

            if (
                typeof currentPassword !== "string" ||
                !currentPassword ||
                Buffer.byteLength(currentPassword) > 72 ||
                typeof newPassword !== "string" ||
                typeof confirmPassword !== "string"
            ) {
                return res.status(400).json({
                    error: "Complete all three password fields.",
                })
            }

            if (newPassword.length < 8 || Buffer.byteLength(newPassword) > 72) {
                return res.status(400).json({
                    error: "New password must contain at least 8 characters and at most 72 bytes.",
                })
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    error: "New passwords do not match.",
                })
            }

            const [users] = await database.query(
                `SELECT user_id, password
         FROM users
         WHERE user_id = ?
         LIMIT 1`,
                [req.user.user_id],
            )

            const user = users[0]

            if (
                !user ||
                req.session.credentialVersion !==
                    req.app.locals.auth.credentialVersion(user.password)
            ) {
                return res.status(401).json({
                    error: "Please log in again.",
                })
            }

            if (!(await bcrypt.compare(currentPassword, user.password))) {
                return res.status(400).json({
                    error: "Current password is incorrect.",
                })
            }

            if (await bcrypt.compare(newPassword, user.password)) {
                return res.status(400).json({
                    error: "Choose a password different from your current password.",
                })
            }

            const passwordHash = await bcrypt.hash(newPassword, 12)

            const [result] = await database.query(
                `UPDATE users
         SET password = ?
         WHERE user_id = ?
           AND CAST(password AS BINARY) = CAST(? AS BINARY)`,
                [passwordHash, req.user.user_id, user.password],
            )

            if (result.affectedRows !== 1) {
                return res.status(409).json({
                    error: "The account changed during this request. Please log in again.",
                })
            }

            // Changing the hash invalidates previous login sessions.
            try {
                await req.app.locals.auth.clearSession(req, res)
            } catch (error) {
                console.error(
                    "Session cleanup failed after password change:",
                    error.code || error.name,
                )
            }

            return res.json({
                message: "Password updated. Please log in with your new password.",
            })
        } catch (error) {
            next(error)
        }
    },
)

// Required so server.js receives the Express router.
module.exports = router
