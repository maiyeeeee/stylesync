const express = require("express")

const router = express.Router()

const db = require("../db")

const promiseDb = db.promise()

const {

    normalizeRequiredPhone

} = require("../middleware/requirePosCustomerPhone")

router.use("/cart", require("./cartCheckoutRoutes"))

// Promotions are selected on the server, never by cashier-provided percentages.

const { getPromotionPrice } = require("../utils/promotionPricing")

const philippineToday = () => new Intl.DateTimeFormat("en-CA", {

    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"

}).format(new Date())



// Authentication and CSRF middleware remain in server.js.

router.use((req, res, next) => {

    if (!req.user) {

        return res.status(401).json({

            error: "Please sign in again.",

        })

    }

    if (!["owner", "admin", "user"].includes(req.user.role)) {

        return res.status(403).json({

            error: "Team member access is required.",

        })

    }

    next()

})

function problem(message, status = 400) {

    const error = new Error(message)

    error.status = status

    return error

}

// Work in centavos to avoid floating-point subtraction errors.

function cents(value, label, allowZero = false) {

    const text = String(value ?? "").trim()

    if (!/^\d+(\.\d{1,2})?$/.test(text)) {

        throw problem(

            `${label} must be a valid amount with up to two decimals.`

        )

    }

    const [whole, fraction = ""] = text.split(".")

    const result =

        Number(whole) * 100 +

        Number(fraction.padEnd(2, "0"))

    if (

        !Number.isSafeInteger(result) ||

        result > 9999999999 ||

        result < (allowZero ? 0 : 1)

    ) {

        throw problem(`${label} is outside the allowed range.`)

    }

    return result

}

function decimal(value) {

    return (value / 100).toFixed(2)

}

function normalizeCustomerName(value) {

    return String(value || "")

        .trim()

        .replace(/\s+/g, " ")

        .toLocaleLowerCase("en")

}

function historicalEpoch(value) {

    if (value == null || value === "") return null

    if (

        typeof value !== "string" ||

        !/^\d{4}-\d{2}-\d{2}$/.test(value)

    ) {

        throw problem("Choose a valid historical sale date.")

    }

    const [year, month, day] = value.split("-").map(Number)

    const check = new Date(Date.UTC(year, month - 1, day))

    if (

        check.getUTCFullYear() !== year ||

        check.getUTCMonth() !== month - 1 ||

        check.getUTCDate() !== day

    ) {

        throw problem("Choose a valid historical sale date.")

    }

    const parts = new Intl.DateTimeFormat("en-US", {

        timeZone: "Asia/Manila",

        year: "numeric",

        month: "2-digit",

        day: "2-digit",

    }).formatToParts(new Date())

    const part = (type) =>

        parts.find((item) => item.type === type)?.value

    const today =

        part("year") +

        "-" +

        part("month") +

        "-" +

        part("day")

    if (

        value < "2000-01-01" ||

        value >= today

    ) {

        throw problem(

            "Historical sale date must be before today in Philippine time."

        )

    }

    // Paper records have no exact transaction time.

    // Use noon in Philippine time as a neutral timestamp.

    return Date.parse(

        value + "T12:00:00+08:00"

    ) / 1000

}

function positiveId(value, label) {

    const result = Number(value)

    if (

        !Number.isSafeInteger(result) ||

        result <= 0

    ) {

        throw problem(`${label} is invalid.`)

    }

    return result

}

// Shared transaction query.

// Deposit information is returned alongside each transaction.

const transactionSelect = `

    SELECT

        t.*,

        COALESCE(

            da.amount_applied,

            0

        ) AS deposit_applied,

        t.amount - COALESCE(

            da.amount_applied,

            0

        ) AS balance_collected,

        CASE

            WHEN da.application_id IS NOT NULL

            THEN d.payment_method

            ELSE NULL

        END AS deposit_payment_method,

        COALESCE(

            NULLIF(TRIM(t.customer_contact), ''),

            a.contact_number

        ) AS customer_contact,

        a.email AS customer_email,

        DATE_FORMAT(

            a.appointment_date,

            '%Y-%m-%d'

        ) AS appointment_date,

        TIME_FORMAT(

            a.appointment_time,

            '%H:%i'

        ) AS appointment_time,

        a.status AS appointment_status

    FROM transactions t

    LEFT JOIN booking_deposit_applications da

        ON da.transaction_id = t.transaction_id

    LEFT JOIN booking_deposits d

        ON d.deposit_id = da.deposit_id

    LEFT JOIN appointments a

        ON a.id = t.appointment_id

`

// ============================================

// GET ALL TRANSACTIONS

// ============================================

router.get("/", async (req, res) => {

    try {

        const [rows] = await promiseDb.query(`

            ${transactionSelect}

            ORDER BY

                t.transaction_date DESC,

                t.transaction_id DESC

        `)

        return res.json(rows)

    } catch (error) {

        console.error(

            "Transaction history error:",

            error

        )

        return res.status(500).json({

            error: "Unable to load transactions.",

        })

    }

})





//

// GET TRANSACTION BY EMERGENCY OFFLINE ID

// Read-only lookup used by POS reconciliation.

//

router.get("/offline/:offlineId", async (req, res) => {

    res.set("Cache-Control", "no-store")



    const offlineId = String(req.params.offlineId || "").trim()



    if (!offlineId || offlineId.length > 64) {

        return res.status(400).json({

            error: "Invalid offline ID.",

        })

    }



    try {

        const [rows] = await promiseDb.query(

            `${transactionSelect}

             WHERE t.offline_id = ?

             LIMIT 1`,

            [offlineId]

        )



       if (!rows.length) {

    return res.status(200).json({

        found: false,

    })

}



        return res.json({

            found: true,

            transaction: rows[0],

        })

    } catch (error) {

        console.error("Offline transaction lookup error:", error)

        return res.status(500).json({

            error: "Unable to verify the emergency transaction.",

        })

    }

})



//

// ============================================

// PART 2 — APPOINTMENT CHECKOUT LOOKUP

// ============================================

//

// Only approved/completed appointments that have not

// already been checked out should appear in the POS.

router.get("/checkout-appointments", async (req, res) => {

    try {

        const [rows] = await promiseDb.query(`

            SELECT

                a.id,

                a.customer_name,

                a.contact_number,

                a.service,

                a.service_id,

                DATE_FORMAT(

                    a.appointment_date,

                    '%Y-%m-%d'

                ) AS appointment_date,

                TIME_FORMAT(

                    a.appointment_time,

                    '%H:%i'

                ) AS appointment_time,

                a.status,

                COALESCE(d.service_total, s.price) AS service_total,

                COALESCE(d.original_service_total, d.service_total, s.price) AS original_service_total,

                d.promotion_id AS locked_promotion_id,

                d.promotion_percent AS locked_promotion_percent,

                d.promotion_discount AS locked_promotion_discount,

                d.payment_status,

                CASE

                    WHEN d.payment_status = 'Verified'

                    THEN d.verified_amount

                    ELSE 0

                END AS verified_deposit

            FROM appointments a

            LEFT JOIN services s

                ON s.service_id = a.service_id

            LEFT JOIN booking_deposits d

                ON d.appointment_id = a.id

            WHERE a.status IN (

                'Approved',

                'Completed'

            )

            AND NOT EXISTS (

                SELECT 1

                FROM transactions t

                WHERE t.appointment_id = a.id

            )

            AND NOT EXISTS (

                SELECT 1

                FROM booking_deposit_applications da

                WHERE da.deposit_id = d.deposit_id

            )

            ORDER BY

                a.appointment_date DESC,

                a.appointment_time DESC

        `)

        return res.json(rows)

    } catch (error) {

        console.error(

            "Appointment checkout lookup error:",

            error

        )

        return res.status(500).json({

            error: "Unable to load checkout appointments.",

        })

    }

})

//

// ============================================

// OWNER-ISSUED LOYALTY REWARD PREVIEW

// ============================================

//

// This endpoint is read-only.

//

// Staff can VIEW an available owner-issued reward,

// but cannot issue, change, or redeem one here.

//

// Redemption happens only inside POST /transactions.

//

// Authenticated POS quote: use the same pricing helper as checkout.

// No customer or loyalty details are returned by this endpoint.

router.get("/price-preview", async (req, res) => {

    try {

        const serviceId = positiveId(req.query.service_id, "Service")

        const [[service]] = await promiseDb.query(

            "SELECT price FROM services WHERE service_id = ? LIMIT 1", [serviceId]

        )

        if (!service) return res.status(404).json({ error: "Service not found." })

        const pricing = await getPromotionPrice(

            promiseDb, serviceId, service.price, philippineToday()

        )

        res.set("Cache-Control", "no-store")

        return res.json({

            service_id: serviceId,

            original_service_total: decimal(pricing.originalCents),

            promotion_id: pricing.promotionId,

            promotion_percent: pricing.promotionPercent,

            promotion_title: pricing.promotionTitle,

            promotion_discount: decimal(pricing.discountCents),

            service_total: decimal(pricing.totalCents),

        })

    } catch (error) {

        if (error.status) return res.status(error.status).json({ error: error.message })

        console.error("POS price preview failed:", error)

        return res.status(500).json({ error: "Unable to preview current service price." })

    }

})



router.get("/loyalty-preview", async (req, res) => {

    try {

        const appointmentId = req.query.appointment_id

            ? positiveId(

                  req.query.appointment_id,

                  "Appointment"

              )

            : null

        const inputContact = String(

            req.query.customer_contact || ""

        ).trim()

        // A booked appointment must use the contact

        // saved on the appointment, not a POS override.

        let contact = inputContact

        let appointmentCustomerName = null

        if (appointmentId) {

            const [[appointment]] = await promiseDb.query(

                `

                SELECT

                    customer_name,

                    contact_number

                FROM appointments

                WHERE id = ?

                `,

                [appointmentId]

            )

            if (!appointment) {

                throw problem(

                    "Appointment not found.",

                    404

                )

            }

            contact = String(

                appointment.contact_number || ""

            ).trim()

            appointmentCustomerName =

                appointment.customer_name

        }

        if (

            !contact ||

            contact.length < 7 ||

            contact.length > 30

        ) {

            return res.json({

                available: false,

                reward: null,

                reason: "Valid customer contact required.",

            })

        }

        // Never select an arbitrary customer when

        // duplicate phone numbers exist.

        const [customers] = await promiseDb.query(

            `

            SELECT

                customer_id,

                customer_name

            FROM customers

            WHERE TRIM(contact_number) = ?

            LIMIT 2

            `,

            [contact]

        )

        if (customers.length !== 1) {

            return res.json({

                available: false,

                reward: null,

                reason:

                    customers.length > 1

                        ? "Duplicate customer profiles."

                        : "Customer profile not found.",

            })

        }

        // A booked appointment must belong to the

        // matching registered customer.

        if (

            appointmentCustomerName &&

            normalizeCustomerName(

                appointmentCustomerName

            ) !==

                normalizeCustomerName(

                    customers[0].customer_name

                )

        ) {

            return res.json({

                available: false,

                reward: null,

                reason:

                    "Appointment and registered customer details do not match.",

            })

        }

        const [[policy]] = await promiseDb.query(`

            SELECT enabled

            FROM ig_loyalty_policy

            WHERE policy_id = 1

        `)

        if (!policy || !Number(policy.enabled)) {

            return res.json({

                available: false,

                reward: null,

                reason: "Loyalty rewards are disabled.",

            })

        }

        const [rewards] = await promiseDb.query(

            `

            SELECT

                reward_id,

                reward_percent

            FROM ig_loyalty_rewards

            WHERE customer_id = ?

              AND reward_status = 'issued'

            ORDER BY reward_id DESC

            LIMIT 2

            `,

            [customers[0].customer_id]

        )

        // More than one issued reward is ambiguous.

        // The owner must resolve that first.

        if (rewards.length !== 1) {

            return res.json({

                available: false,

                reward: null,

                reason:

                    rewards.length > 1

                        ? "Multiple issued rewards require owner review."

                        : "No issued reward.",

            })

        }

        return res.json({

            available: true,

            reward: {

                reward_id: rewards[0].reward_id,

                reward_percent: Number(

                    rewards[0].reward_percent

                ),

            },

        })

    } catch (error) {

        console.error(

            "Loyalty preview error:",

            error

        )

        return res.status(

            error.status || 500

        ).json({

            error: error.status

                ? error.message

                : "Unable to check loyalty reward.",

        })

    }

})

//

// ============================================

// PART 3 — CREATE TRANSACTION

// ============================================

//

router.post("/", async (req, res) => {

    let connection

    let inTransaction = false

    try {

        const body = req.body || {}

        const appointmentId =

            body.appointment_id == null ||

            body.appointment_id === ""

                ? null

                : positiveId(

                      body.appointment_id,

                      "Appointment"

                  )

        const saleType =

            body.sale_type || "Service"

        if (

            !["Service", "Product"].includes(saleType)

        ) {

            throw problem(

                "Select Service or Product."

            )

        }

        const saleEpoch = historicalEpoch(

            body.historical_date

        )

        if (

            saleEpoch != null &&

            (

                appointmentId ||

                saleType !== "Service"

            )

        ) {

            throw problem(

                "Historical dates are available for walk-in service sales only."

            )

        }

        const payment = String(

            body.payment || ""

        )

        if (

            !["Cash", "GCash"].includes(payment) &&

            !(

                saleEpoch != null &&

                payment === "Not recorded"

            )

        ) {

            throw problem(

                "Select Cash or GCash, or use Not recorded for a historical sale."

            )

        }

        const status =

            body.status || "Paid"

        if (

            !["Paid", "Pending"].includes(status)

        ) {

            throw problem(

                "Invalid payment status."

            )

        }

        // Booked appointments can only be checked out

        // as paid service transactions.

        if (

            appointmentId &&

            (

                saleType !== "Service" ||

                status !== "Paid"

            )

        ) {

            throw problem(

                "Appointment checkout must be a paid service transaction."

            )

        }

        const quantity = Number(

            body.quantity ?? 1

        )

        if (

            !Number.isSafeInteger(quantity) ||

            quantity < 1

        ) {

            throw problem(

                "Quantity must be a positive whole number."

            )

        }

        if (

            appointmentId &&

            quantity !== 1

        ) {

            throw problem(

                "Check out one appointment at a time."

            )

        }

        // The subtotal arrives from POS.

        // Discount calculation will be performed

        // by the server, not by the cashier.

        const subtotal = cents(

            body.amount,

            "Sale subtotal"

        )

        let total = subtotal

        let originalSubtotal = subtotal

        let promo = null

        let winningPromotionId = null

        let discountType = null

        let serviceId = null

        const offlineId = body.offline_id

            ? String(body.offline_id)

            : null

        // Explicit staff-reviewed emergency reconciliation; never infer from offline_id.

        const emergencyReconciliation = body.emergency_reconciliation === true

        if (emergencyReconciliation) {

            if (!["owner", "admin"].includes(req.user.role)) {

                throw problem("Owner or admin approval is required for emergency reconciliation.", 403)

            }

            if (!offlineId || appointmentId || saleType !== "Service" ||

                saleEpoch != null || status !== "Paid" || quantity !== 1 ||

                body.offline_queued !== true || body.emergency_review_confirmed !== true ||

                !["Cash", "GCash"].includes(payment)) {

                throw problem("Invalid emergency reconciliation details.", 409)

            }

            if (body.loyalty_reward_id != null && body.loyalty_reward_id !== "") {

                throw problem("Emergency reconciliation cannot redeem a loyalty reward.", 409)

            }

            if (cents(body.expected_sale_total, "Reviewed emergency total") !== subtotal) {

                throw problem("Reviewed emergency total must match the recorded amount.", 409)

            }

        }

        if (

            offlineId &&

            offlineId.length > 64

        ) {

            throw problem(

                "The transaction identifier is too long."

            )

        }

        let customer = String(

            body.customer || ""

        ).trim()

        let service = String(

            body.service || ""

        ).trim()

        let depositAmount = 0

        let depositId = null

        let itemId = null

        const customerContactInput = String(

            body.customer_contact || ""

        ).trim()

        if (

            customerContactInput.length > 30

        ) {

            throw problem(

                "Customer contact is too long."

            )

        }

        let customerContact =

            customerContactInput || null

        // Staff cannot directly supply discount

        // percentages or approval decisions.

        const rewardId =

            body.loyalty_reward_id == null ||

            body.loyalty_reward_id === ""

                ? null

                : positiveId(

                      body.loyalty_reward_id,

                      "Loyalty reward"

                  )

        if (

            body.discount_decision != null ||

            body.discount_percent != null ||

            body.discount_amount != null ||

            body.discount_approved_by != null

        ) {

            throw problem(

                "POS discounts must use an owner-issued loyalty reward."

            )

        }

        if (

            rewardId &&

            (

                saleEpoch != null ||

                status !== "Paid" ||

                saleType !== "Service"

            )

        ) {

            throw problem(

                "Loyalty rewards apply only to current paid service checkouts."

            )

        }

        // Offline-queued transactions cannot carry

        // a loyalty reward for automatic redemption.

        if (

            body.offline_queued === true &&

            rewardId

        ) {

            throw problem(

                "Offline queued transactions cannot redeem loyalty rewards."

            )

        }

        // These variables will be populated only

        // after the reward is verified by the database.

        let discountPercent = 0

        let discountAmount = 0

        let discountReason = null

        let redeemedRewardId = null

        let rewardIssuedBy = null

        let rewardCustomerId = null

        let loyaltyDiscount = 0

        let loyaltyPercent = 0

        let loyaltyReward = null

        connection =

            await promiseDb.getConnection()

        await connection.beginTransaction()

        inTransaction = true

        // ============================================

        // EMERGENCY MODE IDEMPOTENCY

        // ============================================

        //

        // Re-sending the same queued transaction

        // must not create another sale.

        if (offlineId) {

            const [duplicates] =

                await connection.query(

                    `

                    SELECT transaction_id

                    FROM transactions

                    WHERE offline_id = ?

                    `,

                    [offlineId]

                )

            if (duplicates.length) {

                await connection.rollback()

                inTransaction = false

                return res.json({

                    message:

                        "Transaction already saved.",

                    id:

                        duplicates[0].transaction_id,

                    duplicate: true,

                })

            }

        }

        // ============================================

        // BOOKED APPOINTMENT CHECKOUT

        // ============================================

        if (appointmentId) {

            const [appointments] =

                await connection.query(

                    `

                    SELECT *

                    FROM appointments

                    WHERE id = ?

                    FOR UPDATE

                    `,

                    [appointmentId]

                )

            if (!appointments.length) {

                throw problem(

                    "Appointment not found.",

                    404

                )

            }

            const appointment =

                appointments[0]

            if (

                !["Approved", "Completed"].includes(

                    appointment.status

                )

            ) {

                throw problem(

                    "Only approved or completed appointments can be checked out.",

                    409

                )

            }

            // Prevent duplicate checkout.

            const [existing] =

                await connection.query(

                    `

                    SELECT transaction_id

                    FROM transactions

                    WHERE appointment_id = ?

                    FOR UPDATE

                    `,

                    [appointmentId]

                )

            if (existing.length) {

                throw problem(

                    "This appointment already has a transaction. Refresh the history.",

                    409

                )

            }

            // The appointment record is authoritative.

            // The appointment record remains authoritative

// for the customer's identity and booked service.

customer = appointment.customer_name

service = appointment.service



// Require the appointment's saved phone number

// to be valid before completing checkout.

const appointmentPhone = normalizeRequiredPhone(

    appointment.contact_number

)



if (!appointmentPhone) {

    throw problem(

        "This appointment has no valid customer mobile number. Please ask the owner to correct the appointment contact before checkout.",

        409

    )

}



// Prevent a cashier from accidentally using

// another customer's phone number.

if (customerContact !== appointmentPhone) {

    throw problem(

        "The POS customer phone number does not match the appointment contact. Refresh the appointment details before checkout.",

        409

    )

}



customerContact = appointmentPhone

            // ========================================

            // VERIFIED BOOKING DEPOSIT

            // ========================================

            const [deposits] =

                await connection.query(

                    `

                    SELECT *

                    FROM booking_deposits

                    WHERE appointment_id = ?

                    FOR UPDATE

                    `,

                    [appointmentId]

                )

            if (deposits.length) {

                const deposit =

                    deposits[0]

                if (

                    deposit.payment_status ===

                        "Awaiting Verification" ||

                    deposit.payment_status ===

                        "Awaiting Payment"

                ) {

                    throw problem(

                        "Resolve this booking's payment status before checkout.",

                        409

                    )

                }

                const [applications] =

                    await connection.query(

                        `

                        SELECT application_id

                        FROM booking_deposit_applications

                        WHERE deposit_id = ?

                        FOR UPDATE

                        `,

                        [deposit.deposit_id]

                    )

                if (applications.length) {

                    throw problem(

                        "This deposit has already been applied.",

                        409

                    )

                }

                if (

                    deposit.payment_status ===

                    "Verified"

                ) {

                    depositAmount = cents(

                        deposit.verified_amount,

                        "Verified deposit"

                    )

                    depositId =

                        deposit.deposit_id

                }

            }

            // Locked booking price is authoritative even if the promo expires.

            const [[serviceRow]] = await connection.query(

                "SELECT price FROM services WHERE service_id = ?", [appointment.service_id]

            )

            if (!serviceRow) throw problem("Booked service no longer exists.", 409)

            const saved = deposits[0] || null

            originalSubtotal = cents(

                saved?.original_service_total ?? saved?.service_total ?? serviceRow.price,

                "Original booking price"

            )

            if (subtotal !== originalSubtotal) {

                throw problem("The booking price changed. Refresh the appointment in POS.", 409)

            }

            if (saved?.promotion_id != null) {

                const lockedDiscount = cents(saved.promotion_discount, "Locked promotion discount", true)

                const lockedPercent = Number(saved.promotion_percent)

                if (!Number.isFinite(lockedPercent) || lockedPercent <= 0 || lockedPercent > 100 ||

                    lockedDiscount <= 0 || lockedDiscount >= originalSubtotal ||

                    originalSubtotal - lockedDiscount !== cents(saved.service_total, "Booked promotional total")) {

                    throw problem("Booking promotion snapshot is inconsistent. Contact the owner.", 409)

                }

                promo = { promotionId: Number(saved.promotion_id),

                    discountCents: lockedDiscount, promotionPercent: lockedPercent }

            } else if (saved?.original_service_total != null &&

                       cents(saved.service_total, "Booked service total") !== originalSubtotal) {

                throw problem("Booking price snapshot is inconsistent. Contact the owner.", 409)

            }

            serviceId = Number(appointment.service_id)



            // Reject stale frontend deposit values.

            const expectedDeposit = cents(

                body.expected_deposit_amount,

                "Displayed deposit",

                true

            )

            if (

                expectedDeposit !== depositAmount

            ) {

                throw problem(

                    "The deposit changed. Refresh and select the appointment again.",

                    409

                )

            }

            if (

                depositAmount > total

            ) {

                throw problem(

                    "The verified deposit exceeds the sale subtotal.",

                    409

                )

            }

        } else if (

            saleType === "Product"

        ) {

            // ========================================

            // PRODUCT SALE AND STOCK DEDUCTION

            // ========================================

            itemId = positiveId(

                body.item_id,

                "Product"

            )

            const [products] =

                await connection.query(

                    `

                    SELECT

                        name,

                        stock,

                        alertLevel

                    FROM inventory

                    WHERE id = ?

                    FOR UPDATE

                    `,

                    [itemId]

                )

            if (!products.length) {

                throw problem(

                    "Product not found.",

                    404

                )

            }

            const product =

                products[0]

            if (

                Number(product.stock) <

                quantity

            ) {

                throw problem(

                    "Not enough stock available.",

                    409

                )

            }

            service = product.name

            const newStock =

                Number(product.stock) -

                quantity

            const stockStatus =

                newStock === 0

                    ? "Out of Stock"

                    : newStock <=

                      Number(product.alertLevel)

                        ? "Low Stock"

                        : "In Stock"

            await connection.query(

                `

                UPDATE inventory

                SET

                    stock = ?,

                    status = ?

                WHERE id = ?

                `,

                [

                    newStock,

                    stockStatus,

                    itemId,

                ]

            )

        }

        // Current walk-in services: validate base price and discover active promo.

        // Historical sales are deliberately excluded from promotions.

        if (!appointmentId && saleType === "Service" && saleEpoch == null) {

            if (body.offline_queued === true && !emergencyReconciliation) {

                throw problem("Current service pricing and promotions require online checkout.", 409)

            }

            serviceId = positiveId(body.service_id, "Service")

            const [[selectedService]] = await connection.query(

                "SELECT price FROM services WHERE service_id = ?", [serviceId]

            )

            if (!selectedService) throw problem("Service no longer exists.", 409)

            originalSubtotal = cents(selectedService.price, "Service price")

            if (subtotal !== originalSubtotal) {

                throw problem("The service price changed. Refresh POS before checkout.", 409)

            }

            if (!emergencyReconciliation) {

                const quote = await getPromotionPrice(

                    connection, serviceId, decimal(originalSubtotal), philippineToday()

                )

                if (quote.promotionId && quote.discountCents > 0) {

                    promo = { promotionId: quote.promotionId,

                        discountCents: quote.discountCents, promotionPercent: quote.promotionPercent }

                }

            }

        }



        // ============================================

        // PART 4 — OWNER-ISSUED LOYALTY REWARD

        // ============================================

        //

        // A customer with an issued reward cannot

        // silently be checked out at full price.

        //

        // The cashier cannot choose the percentage.

        // Only the owner's issued reward is accepted.

        //

        // Historical sales, product sales, and pending

        // payments do not redeem loyalty rewards.

        //

        // IMPORTANT:

        // An offline-queued paid service with an issued

        // reward will be rejected during synchronization

        // rather than silently skipping that reward.

        // ============================================

       const loyaltyEligible =

    !emergencyReconciliation &&

    saleType === "Service" &&

    saleEpoch == null &&

    status === "Paid"

        let matchedCustomerId = null

        if (loyaltyEligible && customerContact) {

            if (

                customerContact.length < 7 ||

                customerContact.length > 30

            ) {

                throw problem(

                    "A valid customer contact is required for loyalty checkout.",

                    409

                )

            }

            const [matchingProfiles] =

                await connection.query(

                    `

                    SELECT

                        customer_id,

                        customer_name

                    FROM customers

                    WHERE TRIM(contact_number) = ?

                    LIMIT 2

                    `,

                    [customerContact]

                )

            if (matchingProfiles.length > 1) {

                throw problem(

                    "Multiple registered customers use this contact number. Ask the owner to resolve the duplicate before checkout.",

                    409

                )

            }

            if (matchingProfiles.length === 1) {

                const matchedProfile =

                    matchingProfiles[0]

                matchedCustomerId =

                    matchedProfile.customer_id

                // A matching phone number alone is not

                // enough to apply someone else's reward.

                if (

                    normalizeCustomerName(customer) !==

                    normalizeCustomerName(

                        matchedProfile.customer_name

                    )

                ) {

                    throw problem(

                        "The customer name and contact do not match the registered customer profile. Verify the details before checkout.",

                        409

                    )

                }

                // Lock the customer before reading rewards.

                // Owner issuance/edit/revocation must use

                // the same lock order to avoid races.

                const [lockedCustomers] =

                    await connection.query(

                        `

                        SELECT customer_id

                        FROM customers

                        WHERE customer_id = ?

                        FOR UPDATE

                        `,

                        [matchedCustomerId]

                    )

                if (lockedCustomers.length !== 1) {

                    throw problem(

                        "Customer profile no longer exists.",

                        409

                    )

                }

                // Only enforce rewards while the

                // loyalty program is enabled.

                const [[policy]] =

                    await connection.query(

                        `

                        SELECT

                            enabled,

                            max_override_percent

                        FROM ig_loyalty_policy

                        WHERE policy_id = 1

                        `

                    )

                if (policy && Number(policy.enabled)) {

                    const [issuedRewards] =

                        await connection.query(

                            `

                            SELECT

                                reward_id,

                                reward_percent,

                                issued_by

                            FROM ig_loyalty_rewards

                            WHERE customer_id = ?

                              AND reward_status = 'issued'

                            ORDER BY reward_id DESC

                            FOR UPDATE

                            `,

                            [matchedCustomerId]

                        )

                    if (issuedRewards.length > 1) {

                        throw problem(

                            "Multiple issued loyalty rewards require owner review.",

                            409

                        )

                    }

                    if (issuedRewards.length === 1) {

                        const reward = issuedRewards[0]

                        // The POS must send the exact

                        // reward shown in its preview.

                        if (!rewardId) {

                            throw problem(

                                "An owner-issued loyalty reward is available. Refresh checkout to apply it automatically.",

                                409

                            )

                        }

                        if (

                            Number(reward.reward_id) !==

                            rewardId

                        ) {

                            throw problem(

                                "The loyalty reward changed. Refresh checkout.",

                                409

                            )

                        }

                        const percent = Number(

                            reward.reward_percent

                        )

                        const maximumPercent = Number(

                            policy.max_override_percent

                        )

                        if (

                            !Number.isFinite(percent) ||

                            !Number.isFinite(maximumPercent) ||

                            percent <= 0 ||

                            percent > maximumPercent ||

                            percent > 100

                        ) {

                            throw problem(

                                "The owner-issued reward percentage is invalid.",

                                409

                            )

                        }

                        // Compare rewards after resolving the promotion.

                        loyaltyPercent = percent

                        loyaltyDiscount = Math.round(

                            originalSubtotal * Math.round(percent * 100) / 10000

                        )

                        loyaltyReward = { id: Number(reward.reward_id),

                            issuedBy: reward.issued_by, customerId: matchedCustomerId }

                    } else if (rewardId) {

                        throw problem(

                            "The loyalty reward is no longer available. Refresh checkout.",

                            409

                        )

                    }

                } else if (rewardId) {

                    throw problem(

                        "Loyalty rewards are currently disabled.",

                        409

                    )

                }

            } else if (rewardId) {

                throw problem(

                    "The registered loyalty customer could not be found.",

                    409

                )

            }

        }

        // Never accept a reward for an ineligible sale

        // or a missing registered customer contact.

        if (rewardId && !loyaltyReward) {

            throw problem(

                "This loyalty reward cannot be applied to the transaction.",

                409

            )

        }

        // Prevent the cashier from collecting an amount based on a stale quote.

        // Current walk-in service checkout must explicitly acknowledge the

        // server's promotion identity, discount and final amount.

        if (!emergencyReconciliation && !appointmentId && saleType === "Service" && saleEpoch == null) {

            const expectedPromoId = body.expected_promotion_id == null

                ? null : positiveId(body.expected_promotion_id, "Expected promotion")

            const expectedPromoDiscount = cents(

                body.expected_promotion_discount, "Expected promotion discount", true

            )

            const actualPromoId = promo?.promotionId ?? null

            const actualPromoDiscount = promo?.discountCents ?? 0

            if (expectedPromoId !== actualPromoId ||

                expectedPromoDiscount !== actualPromoDiscount) {

                throw problem("The promotion changed. Refresh the POS price preview before collecting payment.", 409)

            }

        }

        // One winning discount on ORIGINAL price. Promotion wins ties.

        if (promo?.discountCents > 0 && promo.discountCents >= loyaltyDiscount) {

            discountType = "promotion"

            discountAmount = promo.discountCents

            discountPercent = promo.promotionPercent

            discountReason = "Service promotion"

            winningPromotionId = promo.promotionId

            // Do not redeem an issued reward when promotion wins.

        } else if (loyaltyReward && loyaltyDiscount > 0) {

            discountType = "loyalty"

            discountAmount = loyaltyDiscount

            discountPercent = loyaltyPercent

            discountReason = "Owner-issued one-time loyalty reward"

            redeemedRewardId = loyaltyReward.id

            rewardIssuedBy = loyaltyReward.issuedBy

            rewardCustomerId = loyaltyReward.customerId

        }

        total = originalSubtotal - discountAmount

        if (!appointmentId && saleType === "Service" && saleEpoch == null) {

            const expectedTotal = cents(body.expected_sale_total, "Expected sale total")

            if (expectedTotal !== total) {

                throw problem("The checkout total changed. Refresh the price and loyalty preview before collecting payment.", 409)

            }

        }

        if (total < 1) throw problem("Discounted sale total must remain positive.", 409)



        // Offline-queued sales must not redeem rewards.

        // This is a synchronization rule, not a trusted

        // authorization boundary. An offline sale with an

        // issued reward is held for staff resolution.

        if (

            body.offline_queued === true &&

            redeemedRewardId

        ) {

            throw problem(

                "This offline sale has an issued loyalty reward. Resolve the checkout online before synchronizing.",

                409

            )

        }

        // Recheck after the discount has been calculated.

        // A verified deposit must never exceed the total.

        if (depositAmount > total) {

            throw problem(

                "The verified deposit exceeds the discounted total. Resolve the excess payment before checkout.",

                409

            )

        }

        if (

            !customer ||

            customer.length > 100 ||

            !service ||

            service.length > 150

        ) {

            throw problem(

                "Enter a valid customer and item/service name."

            )

        }

        // ============================================

        // PART 5 — SAVE TRANSACTION

        // ============================================

        //

        // The transaction amount is the discounted

        // final total, before subtracting a verified

        // booking deposit.

        //

        // The booking deposit is recorded separately

        // so the receipt can show the balance collected.

        // ============================================

        const [result] = await connection.query(

            `

            INSERT INTO transactions (

                appointment_id,

                customer,

                service,

                amount,

                payment,

                status,

                sale_type,

                item_id,

                quantity,

                offline_id,

                transaction_date,

                historical_date_only,

                customer_contact,

                subtotal,

                discount_type,

                discount_percent,

                discount_amount,

                discount_decision,

                discount_reason,

                discount_approved_by,

                promotion_id

            )

VALUES (

    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,

    ${

        saleEpoch == null

            ? "CURRENT_TIMESTAMP"

            : "FROM_UNIXTIME(?)"

    },

    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?

)

            `,

            [

                appointmentId,

                customer,

                service,

                decimal(total),

                payment,

                status,

                saleType,

                itemId,

                quantity,

                offlineId,

                ...(saleEpoch == null

                    ? []

                    : [saleEpoch]),

                saleEpoch == null ? 0 : 1,

                customerContact,

                decimal(originalSubtotal),

                discountType,

                discountType ? discountPercent.toFixed(2) : null,

                decimal(discountAmount),

                discountType ? "apply" : null,

emergencyReconciliation

    ? "Emergency regular-price reconciliation (owner/admin reviewed)"

    : (discountType ? discountReason : null),

emergencyReconciliation

    ? req.user.user_id

    : (redeemedRewardId ? rewardIssuedBy : null),

winningPromotionId,

            ]

        )

        // ============================================

        // AUTOMATIC POS INVENTORY MOVEMENT RECORD

        // ============================================

        //

        // Product stock was already deducted in Part 3.

        // Do NOT deduct stock a second time.

        //

        // This entry is saved in the same SQL transaction

        // as the POS sale.

        // ============================================

        if (saleType === "Product") {

            await connection.query(

                `

                INSERT INTO inventory_movements (

                    item_id,

                    quantity_change,

                    reason,

                    offline_id

                )

                VALUES (?, ?, ?, NULL)

                `,

                [

                    itemId,

                    -quantity,

                    `POS product sale #${result.insertId}`,

                ]

            )

        }

        // ============================================

        // VERIFIED BOOKING DEPOSIT APPLICATION

        // ============================================

        //

        // The deposit is applied once to the sale.

        // It is not deducted from the transaction.amount

        // column because transaction.amount stores the

        // final service price after the loyalty discount.

        // ============================================

        if (depositId) {

            const userId = positiveId(

                req.user.user_id,

                "Signed-in user"

            )

            await connection.query(

                `

                INSERT INTO booking_deposit_applications (

                    deposit_id,

                    transaction_id,

                    amount_applied,

                    applied_by

                )

                VALUES (?, ?, ?, ?)

                `,

                [

                    depositId,

                    result.insertId,

                    decimal(depositAmount),

                    userId,

                ]

            )

        }

        // ============================================

        // PART 6 — REDEEM OWNER-ISSUED LOYALTY REWARD

        // ============================================

        //

        // Redeem only after the transaction has been

        // inserted successfully.

        //

        // This UPDATE is inside the same SQL transaction

        // as the sale, inventory movement, and deposit.

        //

        // If anything fails before COMMIT, the rollback

        // restores the reward to its previous state.

        // ============================================

        if (redeemedRewardId) {

            const [redemption] =

                await connection.query(

                    `

                    UPDATE ig_loyalty_rewards

                    SET

                        reward_status = 'redeemed',

                        redeemed_transaction_id = ?,

                        redeemed_at = CURRENT_TIMESTAMP

                    WHERE reward_id = ?

                      AND customer_id = ?

                      AND reward_status = 'issued'

                      AND redeemed_transaction_id IS NULL

                    `,

                    [

                        result.insertId,

                        redeemedRewardId,

                        rewardCustomerId,

                    ]

                )

            if (redemption.affectedRows !== 1) {

                throw problem(

                    "The loyalty reward is no longer available. Refresh checkout.",

                    409

                )

            }

        }



        // ============================================

        // COMMIT THE COMPLETE CHECKOUT

        // ============================================

        //

        // The following operations succeed together:

        //

        // 1. POS transaction

        // 2. Product inventory movement, if applicable

        // 3. Booking deposit application, if applicable

        // 4. One-time loyalty redemption, if applicable

        // ============================================

        await connection.commit()

        inTransaction = false

        // ============================================

        // SUCCESS RESPONSE

        // ============================================

        return res.status(201).json({

            message:

                "Transaction saved successfully.",

            id: result.insertId,

            subtotal: decimal(originalSubtotal),

            discount_type: discountType,

            promotion_id: winningPromotionId,

            // Discount authorized by the owner-issued

            // reward, not by cashier input.

            discount_amount:

                decimal(discountAmount),

            discount_decision:

                discountType ? "apply" : null,

            discount_percent:

                discountType ? discountPercent : 0,

            // Deposit is already paid and verified.

            deposit_applied:

                decimal(depositAmount),

            // Amount still collected at checkout.

            balance_collected:

                decimal(total - depositAmount),

            // Final transaction amount, including

            // any loyalty discount but before deposit.

            amount: decimal(total),

            // Loyalty reward details.

            reward_id:

                redeemedRewardId,

            reward_status:

                redeemedRewardId

                    ? "redeemed"

                    : null,

        })

    } catch (error) {

        // ============================================

        // ROLLBACK ON FAILURE

        // ============================================

        if (connection && inTransaction) {

            await connection

                .rollback()

                .catch((rollbackError) => {

                    console.error(

                        "Transaction rollback error:",

                        rollbackError

                    )

                })

            inTransaction = false

        }

        // ============================================

        // EMERGENCY MODE DUPLICATE HANDLING

        // ============================================

        //

        // A queued offline transaction may be retried.

        // If its offline_id was already saved, return

        // the existing transaction rather than creating

        // a duplicate.

        // ============================================

        if (

            error.code === "ER_DUP_ENTRY" &&

            req.body?.offline_id &&

            connection

        ) {

            try {

                const [duplicates] =

                    await connection.query(

                        `

                        SELECT transaction_id

                        FROM transactions

                        WHERE offline_id = ?

                        `,

                        [

                            String(

                                req.body.offline_id

                            ),

                        ]

                    )

                if (duplicates.length) {

                    return res.json({

                        message:

                            "Transaction already saved.",

                        id:

                            duplicates[0]

                                .transaction_id,

                        duplicate: true,

                    })

                }

            } catch (lookupError) {

                console.error(

                    "Offline duplicate lookup error:",

                    lookupError

                )

            }

        }

        // ============================================

        // SAFE ERROR RESPONSE

        // ============================================

        console.error(

            "Transaction checkout error:",

            error

        )

        const statusCode =

            error.status ||

            (

                error.code === "ER_DUP_ENTRY"

                    ? 409

                    : 500

            )

        return res.status(statusCode).json({

            error:

                error.code === "ER_DUP_ENTRY"

                    ? "This payment or transaction has already been recorded. Refresh the history."

                    : error.status

                        ? error.message

                        : "Unable to save the transaction. Please try again.",

        })

    } finally {

        // Always release the pooled connection.

        connection?.release()

    }

})

module.exports = router
