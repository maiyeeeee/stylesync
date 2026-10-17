
"use strict";

const express = require("express");
const db = require("../db");

const router = express.Router();
const pool = db.promise();

// IMPORTANT:
// server.js must mount this router behind requireOwner.
// Existing global CSRF protection must remain enabled.

// A transaction belongs to a customer when its saved contact
// matches, or when its linked appointment supplies the contact.
// The appointment fallback is used only if transaction contact
// is NULL or blank.
const CONTACT_MATCH = `
  COALESCE(
    NULLIF(TRIM(t.customer_contact), ''),
    NULLIF(TRIM(a.contact_number), '')
  )
`;

function fail(res, code, message) {
  return res.status(code).json({ error: message });
}

function id(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function pct(value) {
  const s = String(value ?? "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;

  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 100
    ? n
    : null;
}

function handleError(res, error) {
  console.error("Customer intelligence:", error);

  return fail(
    res,
    500,
    "Unable to complete the customer request."
  );
}

// ==========================================
// GET CUSTOMER DIRECTORY
// ==========================================

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "")
      .trim()
      .slice(0, 100);

    const pattern = `%${search.replace(
      /[\\%_]/g,
      "\\$&"
    )}%`;

    const [rows] = await pool.query(
      `
      SELECT
        c.customer_id,
        c.customer_name,
        c.contact_number,
        c.email,
        c.gender,
        c.birthdate,
        c.customer_type,

        (
          SELECT COUNT(*)
          FROM customers c2
          WHERE TRIM(c2.contact_number) =
                TRIM(c.contact_number)
        ) AS matching_profiles,

        (
          SELECT COUNT(DISTINCT t.transaction_id)
          FROM transactions t
          LEFT JOIN appointments a
            ON a.id = t.appointment_id
          WHERE ${CONTACT_MATCH} =
                TRIM(c.contact_number)
            AND t.status = 'Paid'
            AND t.sale_type = 'Service'
        ) AS paid_service_visits,

        (
          SELECT COALESCE(SUM(t.amount), 0)
          FROM transactions t
          LEFT JOIN appointments a
            ON a.id = t.appointment_id
          WHERE ${CONTACT_MATCH} =
                TRIM(c.contact_number)
            AND t.status = 'Paid'
        ) AS total_spending,

        (
          SELECT COUNT(*)
          FROM ig_loyalty_rewards r
          WHERE r.customer_id = c.customer_id
            AND r.reward_status = 'issued'
        ) AS active_rewards

      FROM customers c

      WHERE c.customer_name LIKE ?
         OR c.contact_number LIKE ?
         OR c.email LIKE ?

      ORDER BY c.customer_name ASC, c.customer_id ASC
      LIMIT 300
      `,
      [pattern, pattern, pattern]
    );

    return res.json(rows);
  } catch (error) {
    return handleError(res, error);
  }
});

// ==========================================
// GET CUSTOMER PROFILE
// ==========================================

router.get("/:id", async (req, res) => {
  const customerId = id(req.params.id);

  if (!customerId) {
    return fail(res, 400, "Invalid customer ID.");
  }

  try {
    const [[customer]] = await pool.query(
      `
      SELECT *
      FROM customers
      WHERE customer_id = ?
      `,
      [customerId]
    );

    if (!customer) {
      return fail(res, 404, "Customer not found.");
    }

    const contact = String(
      customer.contact_number || ""
    ).trim();

    const [[duplicates]] = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM customers
      WHERE TRIM(contact_number) = ?
      `,
      [contact]
    );

    // Count only paid service transactions as visits.
    // Product sales can contribute to spending, but not
    // to the number of service visits.
    const [[stats]] = await pool.query(
      `
      SELECT
        COUNT(
          DISTINCT CASE
            WHEN t.status = 'Paid'
             AND t.sale_type = 'Service'
            THEN t.transaction_id
          END
        ) AS paid_service_visits,

        COALESCE(
          SUM(
            CASE
              WHEN t.status = 'Paid'
              THEN t.amount
              ELSE 0
            END
          ),
          0
        ) AS total_spending,

        MAX(
          CASE
            WHEN t.status = 'Paid'
             AND t.sale_type = 'Service'
            THEN t.transaction_date
          END
        ) AS last_service_visit

      FROM transactions t
      LEFT JOIN appointments a
        ON a.id = t.appointment_id

      WHERE ${CONTACT_MATCH} = ?
      `,
      [contact]
    );

    // Favorite services are based on paid service records.
    const [services] = await pool.query(
      `
      SELECT
        t.service,
        COUNT(*) AS visits,
        COALESCE(SUM(t.amount), 0) AS spending

      FROM transactions t
      LEFT JOIN appointments a
        ON a.id = t.appointment_id

      WHERE ${CONTACT_MATCH} = ?
        AND t.status = 'Paid'
        AND t.sale_type = 'Service'

      GROUP BY t.service
      ORDER BY visits DESC, spending DESC
      LIMIT 10
      `,
      [contact]
    );

    // Include all matching transaction statuses in history.
    const [history] = await pool.query(
      `
      SELECT
        t.transaction_id,
        t.appointment_id,
        t.service,
        t.amount,
        t.sale_type,
        t.status,
        t.transaction_date,
        t.historical_date_only,
        t.discount_amount,
        t.discount_type

      FROM transactions t
      LEFT JOIN appointments a
        ON a.id = t.appointment_id

      WHERE ${CONTACT_MATCH} = ?

      ORDER BY
        t.transaction_date DESC,
        t.transaction_id DESC

      LIMIT 100
      `,
      [contact]
    );

    const [rewards] = await pool.query(
      `
      SELECT
        reward_id,
        reward_percent,
        reward_status,
        issue_reason,
        issued_by,
        issued_at,
        redeemed_transaction_id,
        redeemed_at

      FROM ig_loyalty_rewards
      WHERE customer_id = ?

      ORDER BY reward_id DESC
      `,
      [customerId]
    );

    const [[policy]] = await pool.query(
      `
      SELECT
        min_paid_visits,
        suggested_percent,
        max_override_percent,
        enabled

      FROM ig_loyalty_policy
      WHERE policy_id = 1
      `
    );

    const eligible = Boolean(
      policy &&
      Number(policy.enabled) &&
      Number(duplicates.count) === 1 &&
      Number(stats.paid_service_visits) >=
        Number(policy.min_paid_visits)
    );

    return res.json({
      customer,
      matching_profiles: Number(duplicates.count),
      stats,
      favorite_services: services,
      transactions: history,
      rewards,
      policy: policy || null,
      eligible,
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// ==========================================
// OWNER: ISSUE LOYALTY REWARD
// ==========================================

// Lock the customer row to serialize owner reward changes.
// No reward is issued automatically after a visit.

router.post("/:id/rewards", async (req, res) => {
  const customerId = id(req.params.id);

  if (!customerId) {
    return fail(res, 400, "Invalid customer ID.");
  }

  const conn = await pool
    .getConnection()
    .catch(() => null);

  if (!conn) {
    return fail(res, 500, "Database unavailable.");
  }

  try {
    await conn.beginTransaction();

    const [[customer]] = await conn.query(
      `
      SELECT customer_id, contact_number
      FROM customers
      WHERE customer_id = ?
      FOR UPDATE
      `,
      [customerId]
    );

    if (!customer) {
      await conn.rollback();
      return fail(res, 404, "Customer not found.");
    }

    const contact = String(
      customer.contact_number || ""
    ).trim();

    if (!contact) {
      await conn.rollback();
      return fail(
        res,
        409,
        "Customer has no contact number."
      );
    }

    // Prevent rewards when multiple profiles share
    // the same contact number.
    const [[dup]] = await conn.query(
      `
      SELECT COUNT(*) AS n
      FROM customers
      WHERE TRIM(contact_number) = ?
      `,
      [contact]
    );

    if (Number(dup.n) !== 1) {
      await conn.rollback();

      return fail(
        res,
        409,
        "Multiple customer profiles share this contact. Resolve duplicates before issuing rewards."
      );
    }

    const [[policy]] = await conn.query(
      `
      SELECT *
      FROM ig_loyalty_policy
      WHERE policy_id = 1
      `
    );

    if (!policy || !Number(policy.enabled)) {
      await conn.rollback();

      return fail(
        res,
        409,
        "Loyalty rewards are disabled."
      );
    }

    // Re-check eligibility on the backend.
    // This includes historical paid transactions linked
    // through their appointment contact.
    const [[visits]] = await conn.query(
      `
      SELECT COUNT(DISTINCT t.transaction_id) AS n

      FROM transactions t
      LEFT JOIN appointments a
        ON a.id = t.appointment_id

      WHERE ${CONTACT_MATCH} = ?
        AND t.status = 'Paid'
        AND t.sale_type = 'Service'
      `,
      [contact]
    );

    if (
      Number(visits.n) <
      Number(policy.min_paid_visits)
    ) {
      await conn.rollback();

      return fail(
        res,
        409,
        "Customer has not reached the required paid service visits."
      );
    }

    // Only one active issued reward per customer.
    const [[active]] = await conn.query(
      `
      SELECT COUNT(*) AS n
      FROM ig_loyalty_rewards
      WHERE customer_id = ?
        AND reward_status = 'issued'
      `,
      [customerId]
    );

    if (Number(active.n) > 0) {
      await conn.rollback();

      return fail(
        res,
        409,
        "An issued reward already exists for this customer."
      );
    }

    const percent =
      req.body?.reward_percent == null
        ? Number(policy.suggested_percent)
        : pct(req.body.reward_percent);

    if (
      !percent ||
      percent > Number(policy.max_override_percent)
    ) {
      await conn.rollback();

      return fail(
        res,
        400,
        "Invalid reward percentage or above policy limit."
      );
    }

    const reason = String(
      req.body?.issue_reason || ""
    ).trim();

    if (reason.length > 255) {
      await conn.rollback();

      return fail(
        res,
        400,
        "Reason is too long."
      );
    }

    const ownerId = id(req.user?.user_id);

    if (!ownerId) {
      await conn.rollback();

      return fail(
        res,
        403,
        "Owner session required."
      );
    }

    const [result] = await conn.query(
      `
      INSERT INTO ig_loyalty_rewards
      (
        customer_id,
        reward_percent,
        reward_status,
        issue_reason,
        issued_by
      )
      VALUES (?, ?, 'issued', ?, ?)
      `,
      [
        customerId,
        percent.toFixed(2),
        reason || null,
        ownerId,
      ]
    );

    await conn.commit();

    return res.status(201).json({
      reward_id: result.insertId,
      reward_status: "issued",
      reward_percent: percent,
    });
  } catch (error) {
    await conn.rollback().catch(() => {});
    return handleError(res, error);
  } finally {
    conn.release();
  }
});

// ==========================================
// OWNER: EDIT OR REVOKE LOYALTY REWARD
// ==========================================

router.patch(
  "/:id/rewards/:rewardId",
  async (req, res) => {
    const customerId = id(req.params.id);
    const rewardId = id(req.params.rewardId);

    if (!customerId || !rewardId) {
      return fail(res, 400, "Invalid ID.");
    }

    const action = String(
      req.body?.action || ""
    );

    if (!["edit", "revoke"].includes(action)) {
      return fail(
        res,
        400,
        "Action must be edit or revoke."
      );
    }

    const conn = await pool
      .getConnection()
      .catch(() => null);

    if (!conn) {
      return fail(
        res,
        500,
        "Database unavailable."
      );
    }

    try {
      await conn.beginTransaction();

      const [[customer]] = await conn.query(
        `
        SELECT customer_id
        FROM customers
        WHERE customer_id = ?
        FOR UPDATE
        `,
        [customerId]
      );

      if (!customer) {
        await conn.rollback();

        return fail(
          res,
          404,
          "Customer not found."
        );
      }

      const [[reward]] = await conn.query(
        `
        SELECT *
        FROM ig_loyalty_rewards
        WHERE reward_id = ?
          AND customer_id = ?
        FOR UPDATE
        `,
        [rewardId, customerId]
      );

      if (!reward) {
        await conn.rollback();

        return fail(
          res,
          404,
          "Reward not found."
        );
      }

      if (reward.reward_status !== "issued") {
        await conn.rollback();

        return fail(
          res,
          409,
          "Only unredeemed issued rewards can be changed."
        );
      }

      if (action === "revoke") {
        await conn.query(
          `
          UPDATE ig_loyalty_rewards
          SET reward_status = 'revoked'
          WHERE reward_id = ?
          `,
          [rewardId]
        );
      } else {
        const [[policy]] = await conn.query(
          `
          SELECT max_override_percent
          FROM ig_loyalty_policy
          WHERE policy_id = 1
          `
        );

        const percent = pct(
          req.body?.reward_percent
        );

        if (
          !percent ||
          !policy ||
          percent >
            Number(policy.max_override_percent)
        ) {
          await conn.rollback();

          return fail(
            res,
            400,
            "Invalid reward percentage or above policy limit."
          );
        }

        const reason = String(
          req.body?.issue_reason || ""
        ).trim();

        if (!reason || reason.length > 255) {
          await conn.rollback();

          return fail(
            res,
            400,
            "Provide a reason (up to 255 characters) for the change."
          );
        }

        await conn.query(
          `
          UPDATE ig_loyalty_rewards
          SET
            reward_percent = ?,
            issue_reason = ?
          WHERE reward_id = ?
          `,
          [
            percent.toFixed(2),
            reason,
            rewardId,
          ]
        );
      }

      await conn.commit();

      return res.json({
        message:
          action === "revoke"
            ? "Reward revoked."
            : "Reward updated.",
      });
    } catch (error) {
      await conn.rollback().catch(() => {});
      return handleError(res, error);
    } finally {
      conn.release();
    }
  }
);

module.exports = router;
