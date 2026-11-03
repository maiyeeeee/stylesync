
/**
 * Contract tests for multi-item cart checkout.
 *
 * Uses a mocked SQL connection.
 * Does NOT contact TiDB or modify real database records.
 */

const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const routePath = path.resolve(
  __dirname,
  '../routes/cartCheckoutRoutes.js'
)

function harness({
  insufficient = false,
  duplicate = false,
  loyalty = false
} = {}) {
  const queries = []
  let committed = 0
  let rolledBack = 0

  const connection = {
    async beginTransaction() {},

    async commit() {
      committed++
    },

    async rollback() {
      rolledBack++
    },

    release() {},

    async query(sql, params = []) {
      queries.push({ sql, params })

      // Mock an existing customer with an issued loyalty reward.
      if (loyalty && /FROM\s+customers\s+WHERE\s+TRIM/i.test(sql)) {
        return [[{
          customer_id: 10,
          customer_name: 'Test Customer'
        }]]
      }

      if (loyalty && /FROM\s+ig_loyalty_policy/i.test(sql)) {
        return [[{
          enabled: 1,
          max_override_percent: 100
        }]]
      }

      if (loyalty && /FROM\s+ig_loyalty_rewards/i.test(sql)) {
        return [[{
          reward_id: 55,
          reward_percent: 5,
          issued_by: 1
        }]]
      }

      if (loyalty && /UPDATE\s+ig_loyalty_rewards/i.test(sql)) {
        return [{ affectedRows: 1 }]
      }

      // Duplicate checkout protection.
      if (/FROM\s+transactions\s+WHERE\s+offline_id/i.test(sql)) {
        return [
          duplicate ? [{ transaction_id: 99 }] : []
        ]
      }

      // Mock available service and duration.
      if (/FROM\s+services\s+WHERE/i.test(sql)) {
        return [[{
          service: 'Haircut',
          price: '350.00',
          status: 'Available',
          duration_minutes: 60
        }]]
      }

      // Mock available inventory.
      if (/FROM\s+inventory\s+WHERE/i.test(sql)) {
        return [[{
          name: 'Hair Mask',
          price: '450.00',
          stock: insufficient ? 0 : 10,
          alertLevel: 2
        }]]
      }

      // Mock selected staff row for transaction locking.
      if (/FROM\s+staff\s+WHERE\s+staff_id/i.test(sql)) {
        return [[{ staff_id: 8 }]]
      }

      // Mock parent transaction creation.
      if (/INSERT\s+INTO\s+transactions\b/i.test(sql)) {
        return [{
          insertId: 41,
          affectedRows: 1
        }]
      }

      // Mock purchased item creation.
      if (/INSERT\s+INTO\s+transaction_items\b/i.test(sql)) {
        return [{
          insertId: 1,
          affectedRows: 1
        }]
      }

      // Mock walk-in staff assignment creation.
      if (/INSERT\s+INTO\s+walkin_staff_assignments\b/i.test(sql)) {
        return [{
          insertId: 1,
          affectedRows: 1
        }]
      }

      // Mock stock deduction.
      if (/UPDATE\s+inventory\b/i.test(sql)) {
        return [{
          affectedRows: 1
        }]
      }

      // Mock inventory movement creation.
      if (/INSERT\s+INTO\s+inventory_movements\b/i.test(sql)) {
        return [{
          insertId: 1,
          affectedRows: 1
        }]
      }

      // Other queries return empty result sets.
      return [[]]
    }
  }

  const original = Module._load

  try {
    Module._load = function (request, parent, isMain) {
      if (parent?.filename === routePath) {
        if (request === '../db') {
          return {
            promise: () => ({
              getConnection: async () => connection
            })
          }
        }

        // Deterministic staff availability for contract tests.
        if (request === '../lib/walkinStaff') {
          return {
            manilaDate: () => '2026-11-03',
            manilaTime: () => '12:00',

            interval: (startTime, duration) => {
              const [hour, minute] = startTime
                .split(':')
                .map(Number)

              const endMinutes =
                hour * 60 + minute + Number(duration)

              const endHour = Math.floor(endMinutes / 60)
              const endMinute = endMinutes % 60

              return {
                startTime,
                endTime:
                  String(endHour).padStart(2, '0') +
                  ':' +
                  String(endMinute).padStart(2, '0')
              }
            },

            qualifiedStaff: async () => [
              { staff_id: 8 }
            ],

            reserveWalkin: async () => {}
          }
        }
      }

      return original.apply(this, arguments)
    }

    delete require.cache[routePath]

    const router = require(routePath)

    const layer = router.stack.find(
      x => x.route?.path === '/' && x.route.methods.post
    )

    if (!layer) {
      throw new Error(
        'POST / cart checkout route not found.'
      )
    }

    return {
      handler: layer.route.stack.at(-1).handle,
      queries,
      stats: () => ({
        committed,
        rolledBack
      })
    }
  } finally {
    Module._load = original
    delete require.cache[routePath]
  }
}

// Base checkout:
// Haircut: ₱350.00
// Hair Mask: ₱450.00 x 2 = ₱900.00
// Total: ₱1,250.00
//
// No promotion or loyalty discount in the default fixture.

const payload = {
  customer: 'Test Customer',
  customer_contact: '09000000021',
  payment: 'Cash',
  payment_confirmed: true,

  checkout_key:
    'bb6ec4a5-24dd-43df-85d1-2c931e80a13b',

  expected_total: '1250.00',
  expected_discount_amount: '0.00',
  expected_reward_id: null,

  items: [
    {
      type: 'Service',
      id: 1,
      quantity: 1,
      staff_id: 8,
      start_time: '13:00'
    },
    {
      type: 'Product',
      id: 2,
      quantity: 2
    }
  ]
}

// Invoke the Express handler without an HTTP server.
async function call(handler, body = payload) {
  let status = 200
  let response

  const res = {
    status(n) {
      status = n
      return this
    },

    json(x) {
      response = x
      return this
    }
  }

  await handler(
    {
      user: {
        role: 'admin',
        user_id: 1
      },
      body
    },
    res
  )

  return { status, response }
}

// TEST 1
test(
  'atomic mixed checkout writes one parent, two lines, one stock movement',
  async () => {
    const h = harness()
    const r = await call(h.handler)

    assert.equal(r.status, 201, JSON.stringify(r.response))
    assert.equal(r.response.amount, '1250.00')

    assert.equal(
      h.queries.filter(x =>
        /INSERT\s+INTO\s+transactions\b/i.test(x.sql)
      ).length,
      1
    )

    assert.equal(
      h.queries.filter(x =>
        /INSERT\s+INTO\s+transaction_items\b/i.test(x.sql)
      ).length,
      2
    )

    assert.equal(
      h.queries.filter(x =>
        /INSERT\s+INTO\s+walkin_staff_assignments\b/i.test(x.sql)
      ).length,
      1
    )

    assert.equal(
      h.queries.filter(x =>
        /INSERT\s+INTO\s+inventory_movements\b/i.test(x.sql)
      ).length,
      1
    )

    assert.equal(h.stats().committed, 1)
    assert.equal(h.stats().rolledBack, 0)
  }
)

// TEST 2
test(
  'insufficient product stock rolls back and does not insert a sale',
  async () => {
    const h = harness({ insufficient: true })
    const r = await call(h.handler)

    assert.equal(r.status, 409)
    assert.equal(h.stats().rolledBack, 1)

    assert.equal(
      h.queries.filter(x =>
        /INSERT\s+INTO\s+transactions\b/i.test(x.sql)
      ).length,
      0
    )
  }
)

// TEST 3
test(
  'duplicate checkout key returns original transaction without another insert',
  async () => {
    const h = harness({ duplicate: true })
    const r = await call(h.handler)

    assert.equal(r.status, 200)
    assert.equal(r.response.duplicate, true)
    assert.equal(r.response.id, 99)

    assert.equal(
      h.queries.filter(x =>
        /INSERT\s+INTO\s+transactions\b/i.test(x.sql)
      ).length,
      0
    )

    assert.equal(h.stats().committed, 0)
  }
)

// TEST 4
test(
  'rejects unconfirmed payment before acquiring database connection',
  async () => {
    const h = harness()

    const r = await call(h.handler, {
      ...payload,
      payment_confirmed: false
    })

    assert.equal(r.status, 400)
    assert.equal(h.queries.length, 0)
  }
)

// TEST 5
test(
  'saves customer contact on the parent mixed checkout',
  async () => {
    const h = harness()

    const r = await call(h.handler, {
      ...payload,
      customer_contact: '09000000021'
    })

    assert.equal(r.status, 201, JSON.stringify(r.response))

    const insert = h.queries.find(x =>
      /INSERT\s+INTO\s+transactions\b/i.test(x.sql)
    )

    assert.ok(insert, 'Expected parent transaction INSERT')
    assert.match(insert.sql, /customer_contact/)
    assert.equal(insert.params[1], '09000000021')
  }
)

// TEST 6
test(
  'rejects malformed contact before any database query',
  async () => {
    const h = harness()

    const r = await call(h.handler, {
      ...payload,
      customer_contact: 'not-a-number'
    })

    assert.equal(r.status, 400)
    assert.equal(h.queries.length, 0)
  }
)

// TEST 7
test(
  'rejects checkout without customer phone number',
  async () => {
    const h = harness()

    const r = await call(h.handler, {
      ...payload,
      customer_contact: ''
    })

    assert.equal(r.status, 400)
    assert.equal(h.queries.length, 0)
  }
)

// TEST 8
test(
  'accepts and normalizes +63 mobile number',
  async () => {
    const h = harness()

    const r = await call(h.handler, {
      ...payload,
      customer_contact: '+639000000021'
    })

    assert.equal(r.status, 201, JSON.stringify(r.response))

    const insert = h.queries.find(x =>
      /INSERT\s+INTO\s+transactions\b/i.test(x.sql)
    )

    assert.ok(insert)
    assert.equal(insert.params[1], '09000000021')
  }
)

// TEST 9
test(
  'loyalty discount applies only to service, not products',
  async () => {
    const h = harness({ loyalty: true })

    const r = await call(h.handler, {
      ...payload,
      expected_total: '1232.50',
      expected_discount_amount: '17.50',
      expected_reward_id: 55
    })

    assert.equal(r.status, 201, JSON.stringify(r.response))
    assert.equal(r.response.discount_type, 'loyalty')
    assert.equal(r.response.discount_amount, '17.50')
    assert.equal(r.response.amount, '1232.50')

    const service = r.response.items.find(
      x => x.type === 'Service'
    )

    const product = r.response.items.find(
      x => x.type === 'Product'
    )

    assert.ok(service)
    assert.ok(product)

    assert.equal(service.discount_amount, '17.50')
    assert.equal(service.final_line_total, '332.50')

    assert.equal(product.discount_amount, '0.00')
    assert.equal(product.final_line_total, '900.00')

    assert.equal(r.response.reward_status, 'redeemed')
    assert.equal(h.stats().committed, 1)
    assert.equal(h.stats().rolledBack, 0)
  }
)
