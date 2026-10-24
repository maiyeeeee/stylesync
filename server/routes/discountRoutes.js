
"use strict";

// Mount with:
// api.use('/discounts', requireAdmin, require('./routes/discountRoutes'))
// Requires the additive-only SQL migration in 01_discount_foundation.sql.

const express = require("express");
const db = require("../db");

const router = express.Router();
const database = db.promise();

const isOwner = (req) => req.user?.role === "owner";

const ownerOnly = (req, res, next) =>
  isOwner(req)
    ? next()
    : res.status(403).json({
        error: "Only the owner can change discounts.",
      });

const fail = (res, err) => {
  console.error("Discount API error:", err);

  res.status(err.status || 500).json({
    error: err.status
      ? err.message
      : "Discount operation failed.",
  });
};

const bad = (message) =>
  Object.assign(new Error(message), { status: 400 });

const percent = (value, name) => {
  const v = Number(value);

  if (
    !Number.isFinite(v) ||
    v <= 0 ||
    v > 100 ||
    !/^\d+(\.\d{1,2})?$/.test(String(value))
  ) {
    throw bad(
      `${name} must be between 0 and 100 with at most two decimals.`
    );
  }

  return v.toFixed(2);
};

const dateOnly = (value) => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw bad("Dates must be YYYY-MM-DD.");
  }

  const d = new Date(`${value}T00:00:00Z`);

  if (
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value
  ) {
    throw bad("Invalid date.");
  }

  return value;
};

const positiveIds = (value) => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > 100
  ) {
    throw bad("Choose at least one eligible service.");
  }

  const ids = [...new Set(value.map(Number))];

  if (
    ids.some(
      (id) => !Number.isSafeInteger(id) || id < 1
    )
  ) {
    throw bad("Invalid service ID.");
  }

  return ids;
};

// ==========================================
// LOYALTY POLICY
// ==========================================

// Staff/admin may view suggestions.
// Only the owner can change discount policies.

router.get("/policy", async (req, res) => {
  try {
    const [[policy]] = await database.query(
      "SELECT * FROM ig_loyalty_policy WHERE policy_id = 1"
    );

    res.json(policy || null);
  } catch (err) {
    fail(res, err);
  }
});

router.put("/policy", ownerOnly, async (req, res) => {
  try {
    const visits = Number(req.body?.min_paid_visits);

    if (
      !Number.isSafeInteger(visits) ||
      visits < 1 ||
      visits > 10000
    ) {
      throw bad("Invalid paid-visit threshold.");
    }

    const suggested = percent(
      req.body?.suggested_percent,
      "Suggested discount"
    );

    const maximum = percent(
      req.body?.max_override_percent,
      "Maximum override"
    );

    if (Number(maximum) < Number(suggested)) {
      throw bad(
        "Maximum override must be at least the suggested discount."
      );
    }

    if (typeof req.body?.enabled !== "boolean") {
      throw bad("Enabled must be true or false.");
    }

    await database.query(
      `UPDATE ig_loyalty_policy
       SET min_paid_visits = ?,
           suggested_percent = ?,
           max_override_percent = ?,
           enabled = ?,
           updated_by = ?
       WHERE policy_id = 1`,
      [
        visits,
        suggested,
        maximum,
        req.body.enabled ? 1 : 0,
        req.user.user_id,
      ]
    );

    res.json({
      message: "Loyalty policy updated.",
    });
  } catch (err) {
    fail(res, err);
  }
});

// ==========================================
// PROMOTIONS
// ==========================================

router.get("/promotions", async (req, res) => {
  try {
    const [rows] = await database.query(
      `SELECT
         p.*,
         GROUP_CONCAT(
           ps.service_id
           ORDER BY ps.service_id
         ) AS service_ids
       FROM ig_promotions p
       LEFT JOIN ig_promotion_services ps
         ON ps.promotion_id = p.promotion_id
       GROUP BY p.promotion_id
       ORDER BY p.starts_on DESC,
                p.promotion_id DESC`
    );

    res.json(
      rows.map((r) => ({
        ...r,
        service_ids: r.service_ids
          ? r.service_ids.split(",").map(Number)
          : [],
      }))
    );
  } catch (err) {
    fail(res, err);
  }
});

router.post("/promotions", ownerOnly, async (req, res) => {
  let conn;

  try {
    const title = String(
      req.body?.title || ""
    ).trim();

    if (!title || title.length > 150) {
      throw bad(
        "Promotion title must be 1–150 characters."
      );
    }

    const rate = percent(
      req.body?.percent_off,
      "Promotion discount"
    );

    const start = dateOnly(req.body?.starts_on);
    const end = dateOnly(req.body?.ends_on);

    if (end < start) {
      throw bad(
        "End date must not precede start date."
      );
    }

    const ids = positiveIds(
      req.body?.service_ids
    );

    conn = await database.getConnection();

    await conn.beginTransaction();

    const [existing] = await conn.query(
      `SELECT service_id
       FROM services
       WHERE service_id IN (${ids
         .map(() => "?")
         .join(",")})`,
      ids
    );

    if (existing.length !== ids.length) {
      throw bad(
        "One or more services do not exist."
      );
    }

    const [result] = await conn.query(
      `INSERT INTO ig_promotions
         (title, percent_off, starts_on, ends_on, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title,
        rate,
        start,
        end,
        req.user.user_id,
      ]
    );

    for (const id of ids) {
      await conn.query(
        `INSERT INTO ig_promotion_services
           (promotion_id, service_id)
         VALUES (?, ?)`,
        [result.insertId, id]
      );
    }

    await conn.commit();

    res.status(201).json({
      message: "Promotion created.",
      promotion_id: result.insertId,
    });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
    }

    fail(res, err);
  } finally {
    conn?.release();
  }
});

router.patch(
  "/promotions/:id/status",
  ownerOnly,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        typeof req.body?.is_active !== "boolean"
      ) {
        throw bad(
          "Invalid promotion or status."
        );
      }

      const [result] = await database.query(
        `UPDATE ig_promotions
         SET is_active = ?
         WHERE promotion_id = ?`,
        [
          req.body.is_active ? 1 : 0,
          id,
        ]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          error: "Promotion not found.",
        });
      }

      res.json({
        message: "Promotion status updated.",
      });
    } catch (err) {
      fail(res, err);
    }
  }
);

// ==========================================
// LOYALTY RECOMMENDATION
// ==========================================

// Use customer contact information, not names.
// Only paid service visits qualify.
// A mixed cart with a service counts as one visit.
// Product-only purchases do not qualify.
// Owner approval is still required.

router.get(
  "/loyalty/recommendation",
  async (req, res) => {
    try {
      const contact = String(
        req.query.contact || ""
      ).trim();

      if (
        !contact ||
        contact.length > 40
      ) {
        throw bad(
          "Provide a customer contact number."
        );
      }

      const [[policy]] = await database.query(
        `SELECT *
         FROM ig_loyalty_policy
         WHERE policy_id = 1`
      );

      // Match customerRoutes.js service-visit logic.
      // Appointment contact is used only when the
      // transaction contact is missing or blank.

      const [[visits]] = await database.query(
        `SELECT
           COUNT(DISTINCT t.transaction_id)
             AS paid_visits
         FROM transactions t
         LEFT JOIN appointments a
           ON a.id = t.appointment_id
         WHERE COALESCE(
           NULLIF(TRIM(t.customer_contact), ''),
           NULLIF(TRIM(a.contact_number), '')
         ) = ?
           AND t.status = 'Paid'
           AND (
             t.sale_type = 'Service'
             OR (
               t.sale_type = 'Mixed'
               AND EXISTS (
                 SELECT 1
                 FROM transaction_items ti
                 WHERE ti.transaction_id =
                       t.transaction_id
                   AND ti.item_type = 'Service'
               )
             )
           )`,
        [contact]
      );

      // Prevent recommending a reward when
      // multiple customer profiles share a contact.

      const [[profiles]] = await database.query(
        `SELECT COUNT(*) AS matching_profiles
         FROM customers
         WHERE TRIM(contact_number) = ?`,
        [contact]
      );

      const paidVisits = Number(
        visits.paid_visits || 0
      );

      const uniqueCustomer =
        Number(profiles.matching_profiles) === 1;

      const eligible =
        Boolean(policy?.enabled) &&
        uniqueCustomer &&
        paidVisits >= Number(
          policy.min_paid_visits
        );

      res.json({
        paid_visits: paidVisits,
        eligible,
        recommended_percent: eligible
          ? Number(policy.suggested_percent)
          : 0,
        owner_approval_required: true,
        can_approve: isOwner(req),
      });
    } catch (err) {
      fail(res, err);
    }
  }
);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
