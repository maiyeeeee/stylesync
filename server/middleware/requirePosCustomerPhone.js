
"use strict";

// Require a valid customer mobile number for POS transactions.
// Applies to regular checkout, cart checkout, cart preview,
// and Emergency Mode transactions when mounted on the
// transactions router in server.js.
//
// Does not modify existing historical transactions.

function normalizeRequiredPhone(value) {
  const phone = String(value ?? "")
    .replace(/[\s()-]/g, "");

  // Philippine mobile format: 09XXXXXXXXX
  if (/^09\d{9}$/.test(phone)) {
    return phone;
  }

  // International format: +639XXXXXXXXX
  if (/^\+639\d{9}$/.test(phone)) {
    return "0" + phone.slice(3);
  }

  // International format without plus: 639XXXXXXXXX
  if (/^639\d{9}$/.test(phone)) {
    return "0" + phone.slice(2);
  }

  return null;
}

function requirePosCustomerPhone(req, res, next) {
  // Only validate POST requests.
  if (req.method !== "POST") {
    return next();
  }

  // Express provides the remaining path relative to
  // the middleware's mount point.
  const requestPath =
    (req.path || "/").replace(/\/+$/, "") || "/";

  const protectedPaths = [
    "/",
    "/cart",
    "/cart/preview"
  ];

  // Leave unrelated endpoints unchanged.
  if (!protectedPaths.includes(requestPath)) {
    return next();
  }

  // Read the actual customer phone number submitted
  // by the frontend.
  const phone = normalizeRequiredPhone(
    req.body?.customer_contact
  );

  if (!phone) {
    return res.status(400).json({
      error:
        "A valid customer mobile number (09XXXXXXXXX) is required for every POS checkout, including Emergency Mode."
    });
  }

  // Normalize the number before the checkout route
  // processes or saves the transaction.
  req.body.customer_contact = phone;

  return next();
}

module.exports = requirePosCustomerPhone;
module.exports.normalizeRequiredPhone = normalizeRequiredPhone;
