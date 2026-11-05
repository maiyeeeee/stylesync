
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const requirePosCustomerPhone = require(
    "../middleware/requirePosCustomerPhone"
);

const {
    normalizeRequiredPhone
} = require(
    "../middleware/requirePosCustomerPhone"
);

function runMiddleware({
    path = "/",
    method = "POST",
    customer_contact
} = {}) {
    let nextCalled = false;
    let statusCode = 200;
    let responseBody;

    const req = {
        method,
        path,
        body: {
            customer_contact
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

    return {
        nextCalled,
        statusCode,
        body: responseBody,
        normalizedContact: req.body.customer_contact
    };
}

test(
    "Emergency Mode rejects missing customer phone",
    () => {
        const result = runMiddleware({
            path: "/",
            customer_contact: ""
        });

        assert.equal(result.statusCode, 400);
        assert.equal(result.nextCalled, false);

        assert.match(
            result.body.error,
            /customer mobile number/i
        );
    }
);

test(
    "Emergency Mode rejects malformed customer phone",
    () => {
        const result = runMiddleware({
            path: "/",
            customer_contact: "12345"
        });

        assert.equal(result.statusCode, 400);
        assert.equal(result.nextCalled, false);
    }
);

test(
    "Emergency Mode accepts a valid 09 mobile number",
    () => {
        const result = runMiddleware({
            path: "/",
            customer_contact: "09171234567"
        });

        assert.equal(result.nextCalled, true);
        assert.equal(
            result.normalizedContact,
            "09171234567"
        );
    }
);

test(
    "Emergency Mode normalizes +63 mobile number",
    () => {
        const result = runMiddleware({
            path: "/",
            customer_contact: "+639171234567"
        });

        assert.equal(result.nextCalled, true);
        assert.equal(
            result.normalizedContact,
            "09171234567"
        );
    }
);

test(
    "cart checkout rejects missing customer phone",
    () => {
        const result = runMiddleware({
            path: "/cart",
            customer_contact: null
        });

        assert.equal(result.statusCode, 400);
        assert.equal(result.nextCalled, false);
    }
);

test(
    "cart preview rejects missing customer phone",
    () => {
        const result = runMiddleware({
            path: "/cart/preview",
            customer_contact: ""
        });

        assert.equal(result.statusCode, 400);
        assert.equal(result.nextCalled, false);
    }
);

test(
    "phone middleware does not block GET history",
    () => {
        const result = runMiddleware({
            path: "/",
            method: "GET"
        });

        assert.equal(result.nextCalled, true);
    }
);

test(
    "phone middleware does not block unrelated POST routes",
    () => {
        const result = runMiddleware({
            path: "/unrelated",
            customer_contact: ""
        });

        assert.equal(result.nextCalled, true);
    }
);

test(
    "phone normalizer rejects invalid numbers",
    () => {
        assert.equal(
            normalizeRequiredPhone("12345"),
            null
        );

        assert.equal(
            normalizeRequiredPhone(""),
            null
        );

        assert.equal(
            normalizeRequiredPhone(undefined),
            null
        );
    }
);
