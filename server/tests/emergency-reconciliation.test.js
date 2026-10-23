const test = require("node:test")
const assert = require("node:assert/strict")
const Module = require("node:module")

function setup({ duplicate = false } = {}) {
    const originalLoad = Module._load
    const originalLog = console.error
    const calls = []
    let promotionCalls = 0
    let commits = 0
    let rollbacks = 0

    const connection = {
        async beginTransaction() {},
        async commit() { commits++ },
        async rollback() { rollbacks++ },
        release() {},
        async query(sql, params = []) {
            calls.push({ sql, params })

            if (/FROM transactions\s+WHERE offline_id/i.test(sql)) {
                return [duplicate ? [{ transaction_id: 777 }] : []]
            }
            if (/SELECT price FROM services/i.test(sql)) {
                return [[{ price: "2999.00" }]]
            }
            if (/INSERT INTO transactions/i.test(sql)) {
                return [{ insertId: 101 }]
            }
            throw Error("Unexpected SQL in test: " + sql)
        }
    }

    const fakeDb = {
        promise() {
            return {
                async getConnection() { return connection },
                async query() {
                    throw Error("Unexpected pool query")
                }
            }
        }
    }

    Module._load = function(request, parent, isMain) {
        if (parent?.filename?.endsWith("transactionRoutes.js")) {
            if (request === "../db") return fakeDb
            if (request === "../utils/promotionPricing") {
                return {
                    async getPromotionPrice() {
                        promotionCalls++
                        return {
                            promotionId: 5,
                            discountCents: 14995,
                            promotionPercent: 5
                        }
                    }
                }
            }
        }
        return originalLoad.apply(this, arguments)
    }

    let router
    try {
        delete require.cache[require.resolve("../routes/transactionRoutes")]
        router = require("../routes/transactionRoutes")
    } finally {
        Module._load = originalLoad
    }

    const route = router.stack.find(layer =>
        layer.route?.path === "/" && layer.route.methods.post
    )
    assert.ok(route, "POST / route exists")
    const handler = route.route.stack.at(-1).handle

    async function checkout(overrides = {}, role = "owner") {
        let statusCode = 200
        let responseBody

        const req = {
            user: { role, user_id: 1 },
            body: {
                customer: "Test Customer",
                service: "Balayage",
                service_id: 1,
                sale_type: "Service",
                amount: "2999.00",
                payment: "Cash",
                status: "Paid",
                quantity: 1,
                offline_id: "test-emergency-unique",
                offline_queued: true,
                emergency_reconciliation: true,
                emergency_review_confirmed: true,
                expected_sale_total: "2999.00",
                ...overrides
            }
        }

        const res = {
            status(code) { statusCode = code; return this },
            json(data) { responseBody = data; return this }
        }

        console.error = () => {}
        try {
            await handler(req, res)
        } finally {
            console.error = originalLog
        }
        return { statusCode, body: responseBody }
    }

    return {
        checkout,
        calls,
        get promotionCalls() { return promotionCalls },
        get commits() { return commits },
        get rollbacks() { return rollbacks }
    }
}

test("new customer emergency sale keeps regular price", async () => {
    const mock = setup()
    const result = await mock.checkout()

    assert.equal(result.statusCode, 201, JSON.stringify(result.body))
    assert.equal(result.body.subtotal, "2999.00")
    assert.equal(result.body.discount_amount, "0.00")
    assert.equal(result.body.promotion_id, null)
    assert.equal(mock.promotionCalls, 0)
    assert.equal(mock.commits, 1)

    const insert = mock.calls.find(c =>
        /INSERT INTO transactions/i.test(c.sql)
    )
    assert.ok(insert, "Transaction INSERT executed")
    assert.equal(insert.params[18], 1)
    assert.equal(insert.params[3], "2999.00")
    assert.equal(insert.params[15], "0.00")
})

test("existing customer emergency sale keeps regular price", async () => {
    const mock = setup()
    const result = await mock.checkout({
        customer: "Existing Customer",
        customer_contact: "09171234567"
    })

    assert.equal(result.statusCode, 201, JSON.stringify(result.body))
    assert.equal(result.body.discount_amount, "0.00")
    assert.equal(mock.promotionCalls, 0)
})

test("ordinary staff cannot approve emergency reconciliation", async () => {
    const mock = setup()
    const result = await mock.checkout({}, "user")

    assert.equal(result.statusCode, 403)
    assert.match(result.body.error, /owner or admin/i)
    assert.equal(mock.commits, 0)
    assert.equal(mock.calls.length, 0)
})

test("emergency reconciliation rejects mismatched amount", async () => {
    const mock = setup()
    const result = await mock.checkout({
        expected_sale_total: "2849.05"
    })

    assert.equal(result.statusCode, 409)
    assert.equal(mock.commits, 0)
    assert.equal(mock.calls.length, 0)
})

test("emergency reconciliation rejects loyalty redemption", async () => {
    const mock = setup()
    const result = await mock.checkout({
        loyalty_reward_id: 12
    })

    assert.equal(result.statusCode, 409)
    assert.equal(mock.commits, 0)
    assert.equal(mock.calls.length, 0)
})

test("normal online sale applies active 5% promotion", async () => {
    const mock = setup()
    const result = await mock.checkout({
        offline_id: null,
        offline_queued: false,
        emergency_reconciliation: false,
        emergency_review_confirmed: false,
        expected_promotion_id: 5,
        expected_promotion_discount: "149.95",
        expected_sale_total: "2849.05"
    })

    assert.equal(result.statusCode, 201, JSON.stringify(result.body))
    assert.equal(result.body.subtotal, "2999.00")
    assert.equal(result.body.discount_amount, "149.95")
    assert.equal(result.body.promotion_id, 5)
    assert.equal(mock.promotionCalls, 1)
    assert.equal(mock.commits, 1)

    const insert = mock.calls.find(c =>
        /INSERT INTO transactions/i.test(c.sql)
    )
    assert.ok(insert)
    assert.equal(insert.params[3], "2849.05")
})

test("duplicate offline ID does not create another sale", async () => {
    const mock = setup()

    const originalQuery = mock.calls.push
    const result = await mock.checkout()

    assert.equal(result.statusCode, 201)
    assert.equal(mock.commits, 1)

    const inserts = mock.calls.filter(c =>
        /INSERT INTO transactions/i.test(c.sql)
    )
    assert.equal(inserts.length, 1)
})

test("existing offline ID is not inserted again", async () => {
    const mock = setup({ duplicate: true })
    const result = await mock.checkout()

    assert.equal(result.statusCode, 200)
    assert.equal(result.body.duplicate, true)
    assert.equal(result.body.id, 777)
    assert.equal(mock.commits, 0)
    assert.equal(mock.rollbacks, 1)

    const inserts = mock.calls.filter(c =>
        /INSERT INTO transactions/i.test(c.sql)
    )
    assert.equal(inserts.length, 0)
    assert.equal(mock.promotionCalls, 0)
})
