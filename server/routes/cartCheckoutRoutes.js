
const express = require('express');
const crypto = require('node:crypto');
const db = require('../db');
const { getPromotionPrice } = require('../utils/promotionPricing');

const router = express.Router();
const pool = db.promise();

const err = (message, status = 400) =>
  Object.assign(new Error(message), { status });

const id = value =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0
    ? Number(value)
    : null;

const money = value => (value / 100).toFixed(2);

const cents = value => {
  const s = String(value);

  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    throw err('Invalid catalog price.', 409);
  }

  const [whole, decimal = ''] = s.split('.');

  const result =
    Number(whole) * 100 +
    Number(decimal.padEnd(2, '0'));

  if (!Number.isSafeInteger(result) || result < 0) {
    throw err('Invalid catalog price.', 409);
  }

  return result;
};

const todayManila = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const part = type =>
    parts.find(x => x.type === type)?.value;

  return `${part('year')}-${part('month')}-${part('day')}`;
};

const normalName = value =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');

const percentageDiscount = (amount, percent) =>
  Math.round(amount * Math.round(percent * 100) / 10000);

const validate = body => {
  const customer = String(body.customer || '')
    .trim()
    .replace(/\s+/g, ' ');

  const contact = String(body.customer_contact || '').trim();

  if (!customer || customer.length > 100) {
    throw err('Enter a valid customer name.');
  }

  if (
    contact.length > 30 ||
    (contact && !/^[+0-9 ()-]{7,30}$/.test(contact))
  ) {
    throw err('Enter a valid customer contact number.');
  }

  if (
    !Array.isArray(body.items) ||
    !body.items.length ||
    body.items.length > 30
  ) {
    throw err('Choose 1–30 unique items.');
  }

  const seen = new Set();

  const entries = body.items.map(item => {
    const itemId = id(item.id);
    const quantity = Number(item.quantity);
    const type = item.type;

    if (
      !['Service', 'Product'].includes(type) ||
      !itemId ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 100 ||
      (type === 'Service' && quantity !== 1)
    ) {
      throw err('Invalid cart item or quantity.');
    }

    const key = `${type}:${itemId}`;

    if (seen.has(key)) {
      throw err('Duplicate cart item.');
    }

    seen.add(key);

    return { type, itemId, quantity };
  });

  return { customer, contact, entries };
};

async function priceCart(conn, body, lock) {
  const { customer, contact, entries } = validate(body);

  let subtotal = 0;
  let serviceSubtotal = 0;
  let promoTotal = 0;

  for (const x of entries) {
    if (x.type === 'Service') {
      const [rows] = await conn.query(
        `SELECT service, price, status
         FROM services
         WHERE service_id=?
         ${lock ? 'FOR UPDATE' : ''}`,
        [x.itemId]
      );

      if (
        !rows.length ||
        rows[0].status !== 'Available'
      ) {
        throw err('Service unavailable.', 409);
      }

      x.name = rows[0].service;
      x.unit = cents(rows[0].price);

      const promo = await getPromotionPrice(
        conn,
        x.itemId,
        money(x.unit),
        todayManila()
      );

      x.promoId = promo.promotionId;
      x.promoDiscount = promo.discountCents;

      serviceSubtotal += x.unit;
      promoTotal += x.promoDiscount;
    } else {
      const [rows] = await conn.query(
        `SELECT name, price, stock, alertLevel
         FROM inventory
         WHERE id=?
         ${lock ? 'FOR UPDATE' : ''}`,
        [x.itemId]
      );

      if (
        !rows.length ||
        Number(rows[0].stock) < x.quantity
      ) {
        throw err(
          'Product unavailable or insufficient stock.',
          409
        );
      }

      x.name = rows[0].name;
      x.unit = cents(rows[0].price);
      x.remaining =
        Number(rows[0].stock) - x.quantity;
      x.alertLevel = Number(rows[0].alertLevel);
      x.promoDiscount = 0;
      x.promoId = null;
    }

    x.line = x.unit * x.quantity;

    if (!Number.isSafeInteger(x.line)) {
      throw err('Cart amount too large.');
    }

    subtotal += x.line;
  }

  if (subtotal < 1 || subtotal > 999999999) {
    throw err('Cart total outside allowed range.', 409);
  }

  let reward = null;
  let loyaltyDiscount = 0;

  if (serviceSubtotal && contact) {
    const [customers] = await conn.query(
      `SELECT customer_id, customer_name
       FROM customers
       WHERE TRIM(contact_number)=?
       LIMIT 2`,
      [contact]
    );

    if (customers.length > 1) {
      throw err(
        'Duplicate customer profiles. Ask owner to resolve.',
        409
      );
    }

    if (customers.length === 1) {
      if (
        normalName(customers[0].customer_name) !==
        normalName(customer)
      ) {
        throw err(
          'Customer name and registered contact do not match.',
          409
        );
      }

      if (lock) {
        await conn.query(
          `SELECT customer_id
           FROM customers
           WHERE customer_id=?
           FOR UPDATE`,
          [customers[0].customer_id]
        );
      }

      const [[policy]] = await conn.query(
        `SELECT enabled, max_override_percent
         FROM ig_loyalty_policy
         WHERE policy_id=1`
      );

      if (policy && Number(policy.enabled)) {
        const [rewards] = await conn.query(
          `SELECT reward_id, reward_percent, issued_by
           FROM ig_loyalty_rewards
           WHERE customer_id=?
             AND reward_status='issued'
           ORDER BY reward_id DESC
           ${lock ? 'FOR UPDATE' : 'LIMIT 2'}`,
          [customers[0].customer_id]
        );

        if (rewards.length > 1) {
          throw err(
            'Multiple issued rewards require owner review.',
            409
          );
        }

        if (rewards.length === 1) {
          const rate = Number(
            rewards[0].reward_percent
          );

          if (
            !Number.isFinite(rate) ||
            rate <= 0 ||
            rate > 100 ||
            rate > Number(policy.max_override_percent)
          ) {
            throw err(
              'Invalid owner-issued loyalty reward.',
              409
            );
          }

          reward = {
            id: Number(rewards[0].reward_id),
            customerId: Number(
              customers[0].customer_id
            ),
            issuedBy: rewards[0].issued_by,
            percent: rate
          };

          loyaltyDiscount = percentageDiscount(
            serviceSubtotal,
            rate
          );
        }
      }
    }
  }

  // Automatically choose the discount with
  // the greater actual peso savings.
  // Promotion wins ties to preserve loyalty.
  const winner =
    reward && loyaltyDiscount > promoTotal
      ? 'loyalty'
      : promoTotal > 0
        ? 'promotion'
        : null;

  const discount =
    winner === 'loyalty'
      ? loyaltyDiscount
      : promoTotal;

  const total = subtotal - discount;

  if (total < 1) {
    throw err(
      'Discounted checkout total must remain positive.',
      409
    );
  }

  // Allocate discounts to service lines only.
  // Preserve the exact total in centavos.
  if (winner === 'loyalty') {
    let allocated = 0;

    const services = entries.filter(
      x => x.type === 'Service'
    );

    services.forEach((x, i) => {
      x.discount =
        i === services.length - 1
          ? discount - allocated
          : Math.floor(
              discount * x.unit / serviceSubtotal
            );

      allocated += x.discount;
    });
  } else {
    entries.forEach(x => {
      x.discount =
        winner === 'promotion'
          ? x.promoDiscount
          : 0;
    });
  }

  entries.forEach(x => {
    x.finalLine = x.line - x.discount;
  });

  return {
    customer,
    contact,
    entries,
    subtotal,
    serviceSubtotal,
    promoTotal,
    loyaltyDiscount,
    reward,
    winner,
    discount,
    total
  };
}

function summary(cart) {
  return {
    subtotal: money(cart.subtotal),
    promotion_discount: money(cart.promoTotal),
    loyalty_discount: money(cart.loyaltyDiscount),
    discount_type: cart.winner,
    discount_amount: money(cart.discount),
    amount: money(cart.total),
    reward_id: cart.reward?.id || null,
    reward_percent: cart.reward?.percent || null,
    reward_will_be_redeemed:
      cart.winner === 'loyalty',

    items: cart.entries.map(x => ({
      type: x.type,
      id: x.itemId,
      name: x.name,
      quantity: x.quantity,
      unit_price: money(x.unit),
      line_total: money(x.line),
      discount_amount: money(x.discount),
      final_line_total: money(x.finalLine),
      promotion_id: x.promoId
    }))
  };
}

/**
 * Preview checkout without saving anything.
 */
router.post('/preview', async (req, res) => {
  let conn;

  try {
    if (
      !req.user ||
      !['owner', 'admin', 'user'].includes(req.user.role)
    ) {
      throw err('Not authorized.', 403);
    }

    conn = await pool.getConnection();

    res.set('Cache-Control', 'no-store');

    res.json(
      summary(
        await priceCart(
          conn,
          req.body || {},
          false
        )
      )
    );
  } catch (e) {
    if (!e.status) {
      console.error('Cart preview error:', e);
    }

    res.status(e.status || 500).json({
      error: e.status
        ? e.message
        : 'Unable to preview checkout.'
    });
  } finally {
    conn?.release();
  }
});

/**
 * Save complete multi-item checkout.
 */
router.post('/', async (req, res) => {
  let conn;
  let begun = false;

  try {
    if (
      !req.user ||
      !['owner', 'admin', 'user'].includes(req.user.role)
    ) {
      throw err('Not authorized.', 403);
    }

    const body = req.body || {};

    if (!['Cash', 'GCash'].includes(body.payment)) {
      throw err('Select Cash or GCash.');
    }

    if (
      body.payment === 'GCash' &&
      !String(body.payment_reference || '').trim()
    ) {
      throw err('Verified GCash reference required.');
    }

    if (body.payment_confirmed !== true) {
      throw err('Confirm payment before saving.');
    }

    if (
      body.emergency_reconciliation ||
      body.offline_queued ||
      body.appointment_id ||
      body.historical_date
    ) {
      throw err(
        'This checkout supports current walk-in sales only.'
      );
    }

    const key = String(body.checkout_key || '');

if (
  !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(key)
) {
  throw err('Invalid checkout key.');
}

// Validate customer name, contact, and cart items
// BEFORE opening a database connection.
validate(body);

conn = await pool.getConnection();

await conn.beginTransaction();
begun = true;
    // Prevent the same checkout from being recorded twice.
    const [existing] = await conn.query(
      `SELECT transaction_id
       FROM transactions
       WHERE offline_id=?
       FOR UPDATE`,
      [key]
    );

    if (existing.length) {
      await conn.rollback();
      begun = false;

      return res.json({
        duplicate: true,
        id: existing[0].transaction_id
      });
    }

    // Recalculate prices and discounts on the server.
    const cart = await priceCart(
      conn,
      body,
      true
    );

    // Confirm the cashier reviewed the current quote.
    if (
      String(body.expected_total) !==
        money(cart.total) ||
      String(body.expected_discount_amount) !==
        money(cart.discount) ||
      (
        body.expected_reward_id == null
          ? null
          : id(body.expected_reward_id)
      ) !== (cart.reward?.id || null)
    ) {
      throw err(
        'Discount or cart prices changed. Refresh the checkout preview before collecting payment.',
        409
      );
    }

    const discountPercent =
      cart.winner === 'loyalty'
        ? cart.reward.percent
        : null;

    const [result] = await conn.query(
      `INSERT INTO transactions
       (
         customer,
         customer_contact,
         service,
         amount,
         payment,
         status,
         sale_type,
         item_id,
         quantity,
         offline_id,
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
         ?, ?, ?, ?, ?,
         'Paid', 'Mixed', NULL, 1,
         ?, ?, ?, ?, ?, ?, ?, ?, ?
       )`,
      [
        cart.customer,
        cart.contact || null,
        `Multi-item checkout (${cart.entries.length} items)`,
        money(cart.total),
        body.payment,
        key,
        money(cart.subtotal),
        cart.winner,
        discountPercent == null
          ? null
          : discountPercent.toFixed(2),
        money(cart.discount),
        cart.winner ? 'apply' : null,
        cart.winner === 'loyalty'
          ? 'Owner-issued one-time loyalty reward'
          : cart.winner === 'promotion'
            ? 'Service promotions'
            : null,
        cart.winner === 'loyalty'
          ? cart.reward.issuedBy
          : null,
        null
      ]
    );

    // Save each service and product separately.
    for (const x of cart.entries) {
      await conn.query(
        `INSERT INTO transaction_items
         (
           transaction_id,
           item_type,
           catalog_id,
           item_name,
           quantity,
           unit_price,
           line_total,
           discount_amount,
           final_line_total,
           promotion_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          result.insertId,
          x.type,
          x.itemId,
          x.name,
          x.quantity,
          money(x.unit),
          money(x.line),
          money(x.discount),
          money(x.finalLine),
          cart.winner === 'promotion'
            ? x.promoId
            : null
        ]
      );

      // Deduct stock only for products.
      if (x.type === 'Product') {
        const status =
          x.remaining === 0
            ? 'Out of Stock'
            : x.remaining <= x.alertLevel
              ? 'Low Stock'
              : 'In Stock';

        const [stock] = await conn.query(
          `UPDATE inventory
           SET stock=?, status=?
           WHERE id=? AND stock>=?`,
          [
            x.remaining,
            status,
            x.itemId,
            x.quantity
          ]
        );

        if (stock.affectedRows !== 1) {
          throw err(
            'Product stock changed.',
            409
          );
        }

        // Record an auditable inventory movement.
        await conn.query(
          `INSERT INTO inventory_movements
           (
             item_id,
             quantity_change,
             reason,
             offline_id
           )
           VALUES (?, ?, ?, NULL)`,
          [
            x.itemId,
            -x.quantity,
            `Multi-item checkout #${result.insertId}`
          ]
        );
      }
    }

    // Redeem loyalty only if it beats the promotion.
    if (cart.winner === 'loyalty') {
      const [updated] = await conn.query(
        `UPDATE ig_loyalty_rewards
         SET
           reward_status='redeemed',
           redeemed_transaction_id=?,
           redeemed_at=CURRENT_TIMESTAMP
         WHERE reward_id=?
           AND customer_id=?
           AND reward_status='issued'
           AND redeemed_transaction_id IS NULL`,
        [
          result.insertId,
          cart.reward.id,
          cart.reward.customerId
        ]
      );

      if (updated.affectedRows !== 1) {
        throw err(
          'Loyalty reward changed. Refresh checkout.',
          409
        );
      }
    }

    // Commit the transaction, items, stock and reward together.
    await conn.commit();
    begun = false;

    res.status(201).json({
      id: result.insertId,
      ...summary(cart),
      reward_status:
        cart.winner === 'loyalty'
          ? 'redeemed'
          : null
    });
  } catch (e) {
    if (conn && begun) {
      await conn.rollback().catch(rollbackError =>
        console.error(
          'Cart rollback error:',
          rollbackError
        )
      );
    }

    if (e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error:
          'Checkout may already be recorded. Verify transaction history before retrying.'
      });
    }

    if (!e.status) {
      console.error('Cart checkout error:', e);
    }

    res.status(e.status || 500).json({
      error: e.status
        ? e.message
        : 'Unable to complete checkout.'
    });
  } finally {
    conn?.release();
  }
});

/**
 * Fetch purchased items for receipt/history.
 */
router.get('/:transactionId', async (req, res) => {
  try {
    if (
      !req.user ||
      !['owner', 'admin', 'user'].includes(req.user.role)
    ) {
      throw err('Not authorized.', 403);
    }

    const transactionId = id(
      req.params.transactionId
    );

    if (!transactionId) {
      throw err('Invalid transaction ID.');
    }

    const [rows] = await pool.query(
      `SELECT
         item_type AS type,
         catalog_id AS id,
         item_name AS name,
         quantity,
         unit_price,
         line_total,
         discount_amount,
         final_line_total,
         promotion_id
       FROM transaction_items
       WHERE transaction_id=?
       ORDER BY item_id`,
      [transactionId]
    );

    res.json(rows);
  } catch (e) {
    if (!e.status) {
      console.error('Cart items error:', e);
    }

    res.status(e.status || 500).json({
      error: e.status
        ? e.message
        : 'Unable to load items.'
    });
  }
});

module.exports = router;
