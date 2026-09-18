const test = require("node:test")
const assert = require("node:assert/strict")
const { addMinutes, intervalsOverlap, timeToMinutes } = require("../lib/time")

test("calculates the full service interval", () => {
    assert.equal(addMinutes("13:00", 90), "14:30")
})

test("supports back-to-back appointment boundaries", () => {
    assert.equal(timeToMinutes("14:30"), timeToMinutes(addMinutes("13:00", 90)))
    assert.equal(intervalsOverlap("14:30", "15:00", "13:00", "14:30"), false)
})

test("detects any overlap within the full duration", () => {
    assert.equal(intervalsOverlap("14:00", "15:00", "13:00", "14:30"), true)
    assert.equal(intervalsOverlap("12:30", "13:30", "13:00", "14:30"), true)
    assert.equal(intervalsOverlap("13:15", "14:00", "13:00", "14:30"), true)
})

test("rejects invalid or next-day intervals", () => {
    assert.throws(() => addMinutes("23:30", 60))
    assert.throws(() => addMinutes("09:00", 0))
})
