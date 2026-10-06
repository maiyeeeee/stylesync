import {
    useEffect,
    useRef,
    useState,
} from "react"

import {
    LuRefreshCw,
} from "react-icons/lu"

import {
    API_URL,
    apiFetch,
} from "../lib/sessionApi"

import {
    Button,
} from "../components/ui/button"

const peso = (value) =>
    Number(
        value || 0,
    ).toLocaleString(
        "en-PH",
        {
            style: "currency",
            currency: "PHP",
        },
    )

const field =
    "block text-sm font-medium text-purple-900"

const formatBookingNumber = (row) => {
    const value = Number(
        row?.booking_number,
    )

    if (
        Number.isSafeInteger(value) &&
        value > 0
    ) {
        return `#${String(value).padStart(
            3,
            "0",
        )}`
    }

    return "#—"
}

const emptyPaymentForm = {
    reference: "",
    amount: "",
    note: "",
    confirm_received: false,
}

const emptyDeclineForm = {
    reason: "",
    suggestedDate: "",
    suggestedTime: "",
}

export default function AdminPaymentReview() {
    const [
        rows,
        setRows,
    ] = useState([])

    const [
        chosen,
        setChosen,
    ] = useState(null)

    const [
        form,
        setForm,
    ] = useState(
        emptyPaymentForm,
    )

    const [
        declineForm,
        setDeclineForm,
    ] = useState(
        emptyDeclineForm,
    )

    const [
        showDeclineForm,
        setShowDeclineForm,
    ] = useState(false)

    const [
        error,
        setError,
    ] = useState("")

    const [
        message,
        setMessage,
    ] = useState("")

    const [
        loading,
        setLoading,
    ] = useState(true)

    const [
        busy,
        setBusy,
    ] = useState(false)

    const lock =
        useRef(false)

    async function load(
        signal,
    ) {
        setLoading(true)

        try {
            const response =
                await apiFetch(
                    `${API_URL}/booking-payments/review`,
                    {
                        signal,
                    },
                )

            const data =
                await response.json()

            if (
                !response.ok ||
                !Array.isArray(
                    data,
                )
            ) {
                throw new Error(
                    data?.error ||
                        "Cannot load payments.",
                )
            }

            setRows(data)
        } catch (err) {
            if (
                !signal?.aborted
            ) {
                setError(
                    err.message ||
                        "Cannot load payments.",
                )
            }
        } finally {
            if (
                !signal?.aborted
            ) {
                setLoading(false)
            }
        }
    }

    useEffect(() => {
        const controller =
            new AbortController()

        load(
            controller.signal,
        )

        return () =>
            controller.abort()
    }, [])

    function openReview(
        row,
    ) {
        setChosen(row)

        setForm({
            reference:
                row.submitted_reference ||
                "",

            amount:
                row.submitted_amount ||
                "",

            note:
                row.review_note ||
                "",

            confirm_received:
                false,
        })

        setDeclineForm({
            reason:
                row.decline_reason ||
                "",

            suggestedDate:
                row.suggested_date
                    ? String(
                          row.suggested_date,
                      ).slice(
                          0,
                          10,
                      )
                    : "",

            suggestedTime:
                row.suggested_time
                    ? String(
                          row.suggested_time,
                      ).slice(
                          0,
                          5,
                      )
                    : "",
        })

        setShowDeclineForm(
            false,
        )

        setError("")
        setMessage("")
    }

    function closeReview() {
        if (busy) {
            return
        }

        setChosen(null)

        setForm(
            emptyPaymentForm,
        )

        setDeclineForm(
            emptyDeclineForm,
        )

        setShowDeclineForm(
            false,
        )

        setError("")
    }

    function validateVerify() {
        if (
            !form.confirm_received
        ) {
            setError(
                "Check the receiving GCash account and confirm receipt first.",
            )

            return false
        }

        if (
            !form.reference.trim()
        ) {
            setError(
                "Enter the actual received payment reference.",
            )

            return false
        }

        if (
            !form.amount ||
            Number(
                form.amount,
            ) <= 0
        ) {
            setError(
                "Enter the actual received payment amount.",
            )

            return false
        }

        return true
    }

    async function verifyPayment() {
        const response =
            await apiFetch(
                `${API_URL}/booking-payments/review/${chosen.deposit_id}`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify({
                            ...form,

                            action:
                                "verify",
                        }),
                },
            )

        const data =
            await response
                .json()
                .catch(
                    () => ({}),
                )

        if (
            !response.ok
        ) {
            throw new Error(
                data?.error ||
                    "Cannot verify payment.",
            )
        }

        return data
    }

    async function rejectPayment() {
        const reason =
            form.note.trim()

        if (!reason) {
            throw new Error(
                "Enter a payment rejection reason.",
            )
        }

        const response =
            await apiFetch(
                `${API_URL}/booking-payments/review/${chosen.deposit_id}`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify({
                            ...form,

                            note:
                                reason,

                            action:
                                "reject",
                        }),
                },
            )

        const data =
            await response
                .json()
                .catch(
                    () => ({}),
                )

        if (
            !response.ok
        ) {
            throw new Error(
                data?.error ||
                    "Cannot reject payment.",
            )
        }

        return data
    }

    async function updateAppointment(
        status,
        extra = {},
    ) {
        const response =
            await apiFetch(
                `${API_URL}/appointments/${chosen.appointment_id}/status`,
                {
                    method:
                        "PUT",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify({
                            status,
                            ...extra,
                        }),
                },
            )

        const data =
            await response
                .json()
                .catch(
                    () => ({}),
                )

        if (
            !response.ok
        ) {
            throw new Error(
                data?.error ||
                    "Cannot update appointment.",
            )
        }

        return data
    }

    async function review(
        action,
    ) {
        if (
            lock.current ||
            !chosen
        ) {
            return
        }

        const paymentNeedsVerification =
            chosen.payment_status ===
            "Awaiting Verification"

        if (
            [
                "verify",
                "verify-and-approve",
                "verify-and-decline",
            ].includes(
                action,
            ) &&
            paymentNeedsVerification &&
            !validateVerify()
        ) {
            return
        }

        if (
            action ===
                "reject" &&
            !form.note.trim()
        ) {
            setError(
                "Enter a payment rejection reason.",
            )

            return
        }

        if (
            action ===
            "verify-and-decline"
        ) {
            const reason =
                declineForm.reason.trim()

            if (
                !reason ||
                !declineForm.suggestedDate ||
                !declineForm.suggestedTime
            ) {
                setError(
                    "Enter an appointment decline reason and a suggested alternative date and time.",
                )

                setShowDeclineForm(
                    true,
                )

                return
            }
        }

        lock.current = true

        setBusy(true)
        setError("")
        setMessage("")

        try {
            if (
                action ===
                "reject"
            ) {
                const result =
                    await rejectPayment()

                setChosen(null)

                setMessage(
                    result?.message ||
                        "Payment rejected and reservation released.",
                )

                await load()

                return
            }

            if (
                paymentNeedsVerification
            ) {
                await verifyPayment()
            }

            if (
                action ===
                "verify"
            ) {
                setChosen(null)

                setMessage(
                    "Payment verified. The appointment is now pending final approval.",
                )

                await load()

                return
            }

            if (
                action ===
                "verify-and-approve"
            ) {
                try {
                    const approval =
                        await updateAppointment(
                            "Approved",
                        )

                    setChosen(null)

                    setMessage(
                        approval?.message ||
                            "Payment verified and appointment approved.",
                    )
                } catch (
                    approvalError
                ) {
                    setChosen(null)

                    setError(
                        `Payment was verified successfully, but the appointment was not approved: ${approvalError.message}`,
                    )
                }

                await load()

                return
            }

            if (
                action ===
                "verify-and-decline"
            ) {
                try {
                    const decline =
                        await updateAppointment(
                            "Declined",
                            {
                                decline_reason:
                                    declineForm.reason.trim(),

                                suggested_date:
                                    declineForm.suggestedDate,

                                suggested_time:
                                    declineForm.suggestedTime,
                            },
                        )

                    setChosen(null)

                    setShowDeclineForm(
                        false,
                    )

                    setMessage(
                        decline?.message ||
                            "Payment verified and appointment declined.",
                    )
                } catch (
                    declineError
                ) {
                    setChosen(null)

                    setError(
                        `Payment was verified successfully, but the appointment was not declined: ${declineError.message}`,
                    )
                }

                await load()

                return
            }
        } catch (err) {
            setError(
                err.message ||
                    "Unable to complete this action.",
            )

            await load()
                .catch(
                    () => {},
                )
        } finally {
            lock.current = false

            setBusy(false)
        }
    }

    const awaitingVerification =
        chosen?.payment_status ===
        "Awaiting Verification"

    const paymentVerified =
        chosen?.payment_status ===
        "Verified"

    const appointmentStatus =
        chosen?.appointment_status ||
        ""

    const appointmentPending =
        appointmentStatus ===
            "Pending" ||
        appointmentStatus ===
            "Pending Validation" ||
        (
            !appointmentStatus &&
            (
                awaitingVerification ||
                paymentVerified
            )
        )

    const canDecideAppointment =
        (
            awaitingVerification ||
            paymentVerified
        ) &&
        appointmentPending

    return (
        <div className="space-y-6">
            <header className="dashboard-heading">
                <div className="flex flex-wrap items-start justify-between gap-5">
                    <div>
                        <p className="eyebrow">
                            DEPOSITS AWAITING YOU
                        </p>

                        <h1>
                            Confirm what has arrived.
                        </h1>

                        <p className="dashboard-subtitle">
                            Check each deposit against your GCash account,
                            then decide what should happen to the appointment.
                        </p>
                    </div>

                    <Button
                        disabled={
                            busy ||
                            loading
                        }
                        onClick={() =>
                            load()
                        }
                        variant="outline"
                        size="sm"
                        className="bg-white"
                    >
                        <LuRefreshCw />

                        Refresh
                    </Button>
                </div>
            </header>

            {error && (
                <p
                    role="alert"
                    className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </p>
            )}

            {message && (
                <p
                    role="status"
                    className="rounded-xl bg-green-50 p-4 text-sm text-green-800"
                >
                    {message}
                </p>
            )}

            {chosen && (
                <section className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-purple-950">
                                Payment details for booking{" "}
                                {formatBookingNumber(chosen)}
                                {" — "}
                                {chosen.customer_name}
                            </h2>

                            <p className="mt-2 text-sm text-gray-500">
                                Receiving account shown to customer:{" "}
                                {chosen.receiving_name}
                                {" · "}
                                {chosen.receiving_number}
                            </p>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            disabled={
                                busy
                            }
                            onClick={
                                closeReview
                            }
                        >
                            Close
                        </Button>
                    </div>

                    <div className="mb-5 mt-4 grid gap-2 rounded-xl bg-purple-50 p-4 text-sm text-gray-700 md:grid-cols-2">
                        <p>
                            Required deposit:{" "}
                            {peso(
                                chosen.required_amount,
                            )}
                        </p>

                        <p>
                            Submitted amount:{" "}
                            {peso(
                                chosen.submitted_amount,
                            )}
                        </p>

                        <p>
                            Customer reference:{" "}
                            {chosen.submitted_reference ||
                                "Not provided"}
                        </p>

                        <p>
                            Payment status:{" "}
                            <strong>
                                {chosen.payment_status}
                            </strong>
                        </p>

                        <p>
                            Appointment status:{" "}
                            <strong>
                                {chosen.appointment_status ||
                                    "Pending Validation"}
                            </strong>
                        </p>

                        <p>
                            Service:{" "}
                            <strong>
                                {chosen.service}
                            </strong>
                        </p>
                    </div>
                                        {awaitingVerification && (
                        <fieldset
                            disabled={
                                busy
                            }
                            className="grid gap-4 md:grid-cols-2"
                        >
                            <label
                                className={
                                    field
                                }
                            >
                                Actual received reference

                                <input
                                    className="input-field mt-2"
                                    value={
                                        form.reference
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                reference:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                    }
                                />
                            </label>

                            <label
                                className={
                                    field
                                }
                            >
                                Actual received amount (₱)

                                <input
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    className="input-field mt-2"
                                    value={
                                        form.amount
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                amount:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                    }
                                />
                            </label>

                            <label
                                className={`${field} md:col-span-2`}
                            >
                                Payment review note / payment rejection reason

                                <p className="mt-1 text-xs font-normal leading-5 text-gray-500">
                                    Use this only for payment-related issues,
                                    such as incorrect amount, invalid reference,
                                    or payment not received. Do not use this
                                    field for schedule or appointment concerns.
                                </p>

                                <textarea
                                    className="input-field mt-2"
                                    maxLength={
                                        500
                                    }
                                    value={
                                        form.note
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                note:
                                                    event
                                                        .target
                                                        .value,
                                            }),
                                        )
                                    }
                                />
                            </label>

                            <label className="flex gap-3 text-sm text-gray-600 md:col-span-2">
                                <input
                                    type="checkbox"
                                    className="accent-purple-700"
                                    checked={
                                        form.confirm_received
                                    }
                                    onChange={(
                                        event,
                                    ) =>
                                        setForm(
                                            (
                                                current,
                                            ) => ({
                                                ...current,

                                                confirm_received:
                                                    event
                                                        .target
                                                        .checked,
                                            }),
                                        )
                                    }
                                />

                                <span>
                                    I checked the receiving account and
                                    confirmed this payment was received.
                                </span>
                            </label>
                        </fieldset>
                    )}

                    {paymentVerified && (
                        <div className="mb-5 rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
                            <p className="font-semibold">
                                Payment already verified.
                            </p>

                            <p className="mt-1">
                                You can now approve or decline the appointment
                                without checking or verifying the payment again.
                            </p>
                        </div>
                    )}

                    {showDeclineForm &&
                        canDecideAppointment && (
                            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50/40 p-5">
                                <h3 className="font-bold text-red-900">
                                    Decline appointment
                                </h3>

                                <p className="mt-1 text-sm leading-6 text-gray-600">
                                    Use this when the payment is valid, but the
                                    requested appointment cannot be approved.
                                    The customer will receive the appointment
                                    decline reason and suggested alternative
                                    schedule.
                                </p>

                                <div className="mt-4 grid gap-4 md:grid-cols-2">
                                    <label
                                        className={`${field} md:col-span-2`}
                                    >
                                        Appointment decline reason

                                        <textarea
                                            className="input-field mt-2"
                                            maxLength={
                                                500
                                            }
                                            placeholder="Example: No staff is available for the selected schedule."
                                            value={
                                                declineForm.reason
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setDeclineForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,

                                                        reason:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                        />
                                    </label>

                                    <label
                                        className={
                                            field
                                        }
                                    >
                                        Suggested alternative date

                                        <input
                                            type="date"
                                            className="input-field mt-2"
                                            value={
                                                declineForm.suggestedDate
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setDeclineForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,

                                                        suggestedDate:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                        />
                                    </label>

                                    <label
                                        className={
                                            field
                                        }
                                    >
                                        Suggested alternative time

                                        <input
                                            type="time"
                                            className="input-field mt-2"
                                            value={
                                                declineForm.suggestedTime
                                            }
                                            onChange={(
                                                event,
                                            ) =>
                                                setDeclineForm(
                                                    (
                                                        current,
                                                    ) => ({
                                                        ...current,

                                                        suggestedTime:
                                                            event
                                                                .target
                                                                .value,
                                                    }),
                                                )
                                            }
                                        />
                                    </label>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-3">
                                    <Button
                                        type="button"
                                        disabled={
                                            busy ||
                                            (
                                                awaitingVerification &&
                                                !form.confirm_received
                                            )
                                        }
                                        onClick={() =>
                                            review(
                                                "verify-and-decline",
                                            )
                                        }
                                        className="bg-red-700 text-white hover:bg-red-800"
                                    >
                                        {busy
                                            ? "Processing…"
                                            : paymentVerified
                                              ? "Decline appointment"
                                              : "Verify payment & decline appointment"}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={
                                            busy
                                        }
                                        onClick={() =>
                                            setShowDeclineForm(
                                                false,
                                            )
                                        }
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                    {canDecideAppointment && (
                        <div className="mt-5">
                            <p className="mb-3 text-sm font-semibold text-purple-950">
                                Choose what happens next:
                            </p>

                            <div className="flex flex-wrap gap-3">
                                {awaitingVerification && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={
                                            busy ||
                                            !form.confirm_received
                                        }
                                        onClick={() =>
                                            review(
                                                "verify",
                                            )
                                        }
                                    >
                                        {busy
                                            ? "Processing…"
                                            : "Verify payment only"}
                                    </Button>
                                )}

                                <Button
                                    type="button"
                                    disabled={
                                        busy ||
                                        (
                                            awaitingVerification &&
                                            !form.confirm_received
                                        )
                                    }
                                    onClick={() =>
                                        review(
                                            "verify-and-approve",
                                        )
                                    }
                                    className="bg-green-700 text-white hover:bg-green-800"
                                >
                                    {busy
                                        ? "Processing…"
                                        : paymentVerified
                                          ? "Approve appointment"
                                          : "Verify payment & approve appointment"}
                                </Button>

                                <Button
                                    type="button"
                                    disabled={
                                        busy ||
                                        (
                                            awaitingVerification &&
                                            !form.confirm_received
                                        )
                                    }
                                    onClick={() => {
                                        setError("")

                                        setShowDeclineForm(
                                            true,
                                        )
                                    }}
                                    className="bg-amber-50 text-amber-800 hover:bg-amber-100"
                                >
                                    {paymentVerified
                                        ? "Decline appointment"
                                        : "Verify payment & decline appointment"}
                                </Button>

                                {awaitingVerification && (
                                    <Button
                                        type="button"
                                        disabled={
                                            busy
                                        }
                                        onClick={() =>
                                            review(
                                                "reject",
                                            )
                                        }
                                        className="bg-red-50 text-red-700 hover:bg-red-100"
                                    >
                                        {busy
                                            ? "Processing…"
                                            : "Reject payment"}
                                    </Button>
                                )}

                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={
                                        busy
                                    }
                                    onClick={
                                        closeReview
                                    }
                                >
                                    Close
                                </Button>
                            </div>

                            <p className="mt-3 text-xs leading-5 text-gray-500">
                                Reject payment only when there is a payment
                                problem. If the payment is valid but the
                                appointment cannot be accommodated, use
                                Verify payment & decline appointment instead.
                            </p>
                        </div>
                    )}

                    {!canDecideAppointment && (
                        <div className="mt-5 space-y-4">
                            {chosen.review_note && (
                                <div className="rounded-xl border border-purple-100 p-4 text-sm text-gray-600">
                                    <p className="font-medium text-purple-950">
                                        Payment review note
                                    </p>

                                    <p className="mt-1">
                                        {chosen.review_note}
                                    </p>
                                </div>
                            )}

                            {chosen.appointment_status ===
                                "Declined" &&
                                chosen.decline_reason && (
                                    <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800">
                                        <p className="font-semibold">
                                            Appointment decline reason
                                        </p>

                                        <p className="mt-1">
                                            {chosen.decline_reason}
                                        </p>

                                        {chosen.suggested_date &&
                                            chosen.suggested_time && (
                                                <p className="mt-2">
                                                    Suggested alternative:{" "}
                                                    {chosen.suggested_date}
                                                    {" at "}
                                                    {String(
                                                        chosen.suggested_time,
                                                    ).slice(
                                                        0,
                                                        5,
                                                    )}
                                                </p>
                                            )}
                                    </div>
                                )}

                            {!chosen.review_note &&
                                !chosen.decline_reason && (
                                    <div className="rounded-xl border border-purple-100 p-4 text-sm text-gray-600">
                                        No review note was recorded.
                                    </div>
                                )}

                            <Button
                                type="button"
                                variant="outline"
                                disabled={
                                    busy
                                }
                                onClick={
                                    closeReview
                                }
                            >
                                Close details
                            </Button>
                        </div>
                    )}
                </section>
            )}

            <div className="overflow-x-auto rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                        <tr>
                            {[
                                "Booking",
                                "Service / date",
                                "Deposit",
                                "Reference",
                                "Payment",
                                "Appointment",
                                "Payment Review",
                            ].map(
                                (
                                    heading,
                                ) => (
                                    <th
                                        className="p-3 text-gray-500"
                                        key={
                                            heading
                                        }
                                    >
                                        {heading}
                                    </th>
                                ),
                            )}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-purple-100">
                        {rows.map(
                            (
                                row,
                            ) => (
                                <tr
                                    key={
                                        row.deposit_id
                                    }
                                >
                                    <td className="p-3">
                                        {formatBookingNumber(row)}
                                        {" · "}
                                        {row.customer_name}

                                        <br />

                                        {row.contact_number}
                                    </td>

                                    <td className="p-3">
                                        {row.service}

                                        <br />

                                        {row.appointment_date}
                                    </td>

                                    <td className="p-3">
                                        {peso(
                                            row.required_amount,
                                        )}
                                    </td>

                                    <td className="p-3">
                                        {row.submitted_reference ||
                                            "—"}
                                    </td>

                                    <td className="p-3">
                                        {row.payment_status}
                                    </td>

                                    <td className="p-3">
                                        {row.appointment_status ||
                                            "—"}
                                    </td>

                                    <td className="p-3">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            disabled={
                                                busy ||
                                                loading
                                            }
                                            onClick={() =>
                                                openReview(
                                                    row,
                                                )
                                            }
                                        >
                                            {row.payment_status ===
                                            "Awaiting Verification"
                                                ? "Review Payment"
                                                : row.payment_status ===
                                                        "Verified" &&
                                                    row.appointment_status ===
                                                        "Pending"
                                                  ? "Complete Appointment Review"
                                                  : "View Details"}
                                        </Button>
                                    </td>
                                </tr>
                            ),
                        )}

                        {!rows.length && (
                            <tr>
                                <td
                                    colSpan={
                                        7
                                    }
                                    className="p-8 text-center text-gray-500"
                                >
                                    {loading
                                        ? "Loading…"
                                        : "No submitted payments yet."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
