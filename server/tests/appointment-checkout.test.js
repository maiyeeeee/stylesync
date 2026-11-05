
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const requirePosCustomerPhone = require(
    "../middleware/requirePosCustomerPhone"
);

function setup(appointmentContact) {
    const originalLoad = Module._load;
    const calls = [];

    let commits = 0;
    let rollbacks = 0;

    const connection = {
        async beginTransaction() {},

        async commit() {
            commits++;
        },

        async rollback() {
            rollbacks++;
        },

        release() {},

        async query(sql, params = []) {
            calls.push({ sql, params });

            if (
                /FROM appointments/i.test(sql) &&
                /FOR UPDATE/i.test(sql)
            ) {
                return [[{
                    id: 10,
                    customer_name: "Appointment Customer",
                    contact_number: appointmentContact,
                    service: "Balayage",
                    service_id: 1,
                    status: "Approved"
                }]];
            }

            if (
                /FROM transactions/i.test(sql) &&
                /WHERE appointment_id/i.test(sql)
            ) {
                return [[]];
            }

            if (
                /FROM booking_deposits/i.test(sql)
            ) {
                return [[]];
            }

            if (
                /SELECT price FROM services/i.test(sql)
            ) {
                return [[{ price: "2999.00" }]];
            }

            if (
                /FROM customers/i.test(sql) &&
                /contact_number/i.test(sql)
            ) {
                return [[]];
            }

            if (/INSERT INTO transactions/i.test(sql)) {
                return [{ insertId: 101 }];
            }

            throw new Error(
                "Unexpected SQL in appointment test: " + sql
            );
        }
    };

    const fakeDb = {
        promise() {
            return {
                async getConnection() {
                    return connection;
                },

                async query() {
                    throw new Error(
                        "Unexpected pool query"
                    );
                }
            };
        }
    };

    Module._load = function(request, parent, isMain) {
        if (
            parent?.filename?.endsWith(
                "transactionRoutes.js"
            ) &&
            request === "../db"
        ) {
            return fakeDb;
        }

        return originalLoad.apply(this, arguments);
    };

    let router;

    try {
        delete require.cache[
            require.resolve("../routes/transactionRoutes")
        ];

        router = require("../routes/transactionRoutes");
    } finally {
        Module._load = originalLoad;
    }

    const route = router.stack.find(layer =>
        layer.route?.path === "/" &&
        layer.route.methods.post
    );

    assert.ok(route, "Appointment checkout route exists");

    const handler = route.route.stack.at(-1).handle;

    async function checkout(posPhone = "09171234567") {
        let statusCode = 200;
        let responseBody;
        let nextCalled = false;

        const req = {
            method: "POST",
            path: "/",
            user: {
                role: "owner",
                user_id: 1
            },
            body: {
                appointment_id: 10,
                customer: "Appointment Customer",
                customer_contact: posPhone,
                service: "Balayage",
                service_id: 1,
                sale_type: "Service",
                amount: "2999.00",
                payment: "Cash",
                status: "Paid",
                quantity: 1,
                expected_deposit_amount: "0.00"
            }
        };

        const res = {
            status(code) {
                statusCode = code;
                return this;
            },

            json(data) {
                responseBody = data;
                return this;
            }
        };

        requirePosCustomerPhone(req, res, () => {
            nextCalled = true;
        });

        if (nextCalled) {
            // Expected 409 responses may be logged by the route.
            // The test verifies their status and rollback.
            const originalError = console.error;
            console.error = () => {};

            try {
                await handler(req, res);
            } finally {
                console.error = originalError;
            }
        }

        return {
            statusCode,
            body: responseBody
        };
    }

    return {
        checkout,
        calls,

        get commits() {
            return commits;
        },

        get rollbacks() {
            return rollbacks;
        }
    };
}

test(
    "appointment checkout rejects missing saved phone",
    async () => {
        const mock = setup(null);
        const result = await mock.checkout();

        assert.equal(result.statusCode, 409);
        assert.match(
            result.body.error,
            /no valid customer mobile number/i
        );
        assert.equal(mock.commits, 0);
        assert.equal(mock.rollbacks, 1);

        assert.equal(
            mock.calls.filter(c =>
                /INSERT INTO transactions/i.test(c.sql)
            ).length,
            0
        );
    }
);

test(
    "appointment checkout rejects invalid saved phone",
    async () => {
        const mock = setup("12345");
        const result = await mock.checkout();

        assert.equal(result.statusCode, 409);
        assert.match(
            result.body.error,
            /no valid customer mobile number/i
        );
        assert.equal(mock.commits, 0);
        assert.equal(mock.rollbacks, 1);
    }
);

test(
    "appointment checkout rejects mismatched POS phone",
    async () => {
        const mock = setup("09171234567");

        const result = await mock.checkout(
            "09987654321"
        );

        assert.equal(result.statusCode, 409);
        assert.match(
            result.body.error,
            /does not match/i
        );
        assert.equal(mock.commits, 0);
        assert.equal(mock.rollbacks, 1);

        assert.equal(
            mock.calls.filter(c =>
                /INSERT INTO transactions/i.test(c.sql)
            ).length,
            0
        );
    }
);

test(
    "appointment checkout accepts matching +63 phone",
    async () => {
        const mock = setup("+639171234567");

        const result = await mock.checkout(
            "09171234567"
        );

        assert.equal(
            result.statusCode,
            201,
            JSON.stringify(result.body)
        );

        assert.equal(mock.commits, 1);

        const insert = mock.calls.find(c =>
            /INSERT INTO transactions/i.test(c.sql)
        );

        assert.ok(insert, "Transaction was inserted");

        // Current-sale INSERT: customer_contact is
        // parameter index 11 (zero-based).
        assert.equal(
            insert.params[11],
            "09171234567"
        );
    }
);
