const express = require("express")
const crypto = require("node:crypto")
const bcrypt = require("bcrypt")
const { Resend } = require("resend")
const { rateLimit } = require("express-rate-limit")

const database = require("../db").promise()

const router = express.Router()

const digest = (value) =>
    crypto
        .createHash("sha256")
        .update(value)
        .digest("hex")

const genericMessage =
    "If an active owner or staff account uses that email, a reset link will be sent. Check your inbox and spam folder."

const invalidMessage =
    "This reset link is invalid or expired. Request a new one."

const requestLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        error:
            "Too many requests. Please try again in 15 minutes.",
    },
})

const resetLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,

    message: {
        error:
            "Too many attempts. Please try again in 15 minutes.",
    },
})

function mailSettings() {
    const env = process.env

    const url = new URL(
        String(env.APP_URL || ""),
    )

    const local = [
        "localhost",
        "127.0.0.1",
        "[::1]",
    ].includes(url.hostname)

    if (
        !env.RESEND_API_KEY ||
        !env.RESEND_FROM ||
        url.username ||
        url.password ||
        !(
            url.protocol === "https:" ||
            (
                url.protocol === "http:" &&
                local
            )
        )
    ) {
        throw new Error(
            "Invalid mail configuration",
        )
    }

    return {
        origin: url.origin,

        from: String(
            env.RESEND_FROM,
        ).trim(),

        resend: new Resend(
            String(
                env.RESEND_API_KEY,
            ).trim(),
        ),
    }
}

async function issueReset(
    email,
    mail,
) {
    const connection =
        await database.getConnection()

    let delivery

    try {
        await connection.beginTransaction()

        const [users] =
            await connection.query(
                `SELECT
                    user_id,
                    email,
                    password,
                    role,
                    account_status

                 FROM users

                 WHERE LOWER(TRIM(email)) = ?

                 FOR UPDATE`,
                [email],
            )

        const user =
            users[0]

        if (
            users.length !== 1 ||
            user.account_status !==
                "Active" ||
            ![
                "owner",
                "admin",
            ].includes(
                user.role,
            )
        ) {
            await connection.rollback()

            return
        }

        const [counts] =
            await connection.query(
                `SELECT COUNT(*) AS total

                 FROM password_resets

                 WHERE user_id = ?

                   AND created_at >
                       DATE_SUB(
                           UTC_TIMESTAMP(),
                           INTERVAL 1 HOUR
                       )`,
                [
                    user.user_id,
                ],
            )

        if (
            Number(
                counts[0]
                    .total,
            ) >= 3
        ) {
            await connection.rollback()

            return
        }

        const token =
            crypto
                .randomBytes(32)
                .toString("hex")

        const hash =
            digest(token)

        await connection.query(
            `INSERT INTO password_resets
             (
                 token_hash,
                 user_id,
                 credential_hash,
                 created_at,
                 expires_at
             )

             VALUES
             (
                 ?,
                 ?,
                 ?,
                 UTC_TIMESTAMP(),
                 DATE_ADD(
                     UTC_TIMESTAMP(),
                     INTERVAL 30 MINUTE
                 )
             )`,
            [
                hash,
                user.user_id,
                digest(
                    user.password,
                ),
            ],
        )

        await connection.commit()

        delivery = {
            to:
                user.email.trim(),

            hash,

            token,
        }
    } catch (error) {
        await connection
            .rollback()
            .catch(() => {})

        throw error
    } finally {
        connection.release()
    }

    if (!delivery) {
        return
    }

    const link =
        `${mail.origin}/forgot-password#token=${delivery.token}`

    try {
        const result =
            await mail.resend.emails.send({
                from:
                    mail.from,

                to: [
                    delivery.to,
                ],

                subject:
                    "Reset your StyleSync password",

                text:
                    "A password reset was requested for your StyleSync account.\n\n" +

                    `Open this private link:\n${link}\n\n` +

                    "The link expires in 30 minutes and works once. " +

                    "If you did not request this, ignore this email. " +

                    "Your password has not changed.",
            })

        if (
            result?.error
        ) {
            const error =
                new Error(
                    result.error
                        .message ||
                        "Unable to send reset email.",
                )

            error.code =
                result.error
                    .name ||
                "RESEND_ERROR"

            throw error
        }

        console.log(
            "Password reset email sent.",
        )
    } catch (error) {
        /*
         * If email delivery fails, remove
         * the token so an unsent reset link
         * is not left active in the database.
         */
        await database.query(
            `DELETE FROM password_resets
             WHERE token_hash = ?`,
            [
                delivery.hash,
            ],
        )

        throw error
    }
}

router.post(
    "/forgot-password",
    requestLimit,
    (req, res) => {
        const email =
            typeof req.body
                ?.email ===
            "string"
                ? req.body.email
                      .trim()
                      .toLowerCase()
                : ""

        const validEmail =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/

        if (
            email.length >
                254 ||
            !validEmail.test(
                email,
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Enter a valid email address.",
                })
        }

        let mail

        try {
            mail =
                mailSettings()
        } catch {
            return res
                .status(503)
                .json({
                    error:
                        "Email recovery is not configured yet. Please contact the system administrator.",
                })
        }

        /*
         * Respond before checking the
         * database so email addresses
         * cannot be used to discover
         * existing accounts.
         */
        res.json({
            message:
                genericMessage,
        })

        void issueReset(
            email,
            mail,
        ).catch(
            (error) => {
                console.error(
                    "Password reset email failed:",
                    {
                        code:
                            error.code ||
                            error.name ||
                            "RESEND_FAILED",

                        message:
                            error.message,
                    },
                )
            },
        )
    },
)

router.post(
    "/reset-password",
    resetLimit,
    async (
        req,
        res,
    ) => {
        const {
            token,
            password,
            confirmPassword,
        } =
            req.body || {}

        if (
            typeof token !==
                "string" ||
            !/^[a-f0-9]{64}$/.test(
                token,
            )
        ) {
            return res
                .status(400)
                .json({
                    error:
                        invalidMessage,
                })
        }

        if (
            typeof password !==
                "string" ||
            password.length <
                8 ||
            Buffer.byteLength(
                password,
            ) > 72
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Use at least 8 characters and at most 72 bytes.",
                })
        }

        if (
            password !==
            confirmPassword
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Passwords do not match.",
                })
        }

        let connection

        try {
            const hash =
                digest(token)

            const [matches] =
                await database.query(
                    `SELECT user_id

                     FROM password_resets

                     WHERE token_hash = ?`,
                    [
                        hash,
                    ],
                )

            if (
                !matches.length
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            invalidMessage,
                    })
            }

            connection =
                await database.getConnection()

            await connection
                .beginTransaction()

            const [users] =
                await connection.query(
                    `SELECT
                        user_id,
                        password,
                        role,
                        account_status

                     FROM users

                     WHERE user_id = ?

                     FOR UPDATE`,
                    [
                        matches[0]
                            .user_id,
                    ],
                )

            const [resets] =
                await connection.query(
                    `SELECT
                        credential_hash

                     FROM password_resets

                     WHERE token_hash = ?

                       AND user_id = ?

                       AND used_at IS NULL

                       AND expires_at >
                           UTC_TIMESTAMP()

                     FOR UPDATE`,
                    [
                        hash,

                        matches[0]
                            .user_id,
                    ],
                )

            const user =
                users[0]

            if (
                !user ||
                !resets.length ||
                user.account_status !==
                    "Active" ||
                ![
                    "owner",
                    "admin",
                ].includes(
                    user.role,
                ) ||
                resets[0]
                    .credential_hash !==
                    digest(
                        user.password,
                    )
            ) {
                await connection
                    .rollback()

                return res
                    .status(400)
                    .json({
                        error:
                            invalidMessage,
                    })
            }

            const samePassword =
                await bcrypt.compare(
                    password,
                    user.password,
                )

            if (
                samePassword
            ) {
                await connection
                    .rollback()

                return res
                    .status(400)
                    .json({
                        error:
                            "Choose a password different from your current password.",
                    })
            }

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12,
                )

            await connection.query(
                `UPDATE users

                 SET password = ?

                 WHERE user_id = ?`,
                [
                    passwordHash,
                    user.user_id,
                ],
            )

            await connection.query(
                `UPDATE password_resets

                 SET used_at =
                     UTC_TIMESTAMP()

                 WHERE user_id = ?

                   AND used_at IS NULL`,
                [
                    user.user_id,
                ],
            )

            await connection.commit()

            return res.json({
                message:
                    "Password updated. Log in with your new password.",
            })
        } catch (error) {
            if (
                connection
            ) {
                await connection
                    .rollback()
                    .catch(
                        () => {},
                    )
            }

            console.error(
                "Password reset failed:",
                {
                    code:
                        error.code ||
                        error.name ||
                        "RESET_FAILED",

                    message:
                        error.message,
                },
            )

            return res
                .status(500)
                .json({
                    error:
                        "Unable to reset the password. Please try again.",
                })
        } finally {
            if (
                connection
            ) {
                connection.release()
            }
        }
    },
)

module.exports = router
