import { useCallback, useEffect, useId, useRef, useState } from "react"
import { API_URL, apiFetch } from "../lib/sessionApi"

const panel = "rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6"
const input =
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
const button =
    "rounded-xl bg-purple-700 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"

const money = (value) =>
    Number(value || 0).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
    })

const toCents = (value) => Math.round(Number(value || 0) * 100)

function dateLabel(value) {
    const date = new Date(value)
    if (!value || Number.isNaN(date.getTime())) return "Date unavailable"

    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        timeStyle: "short",
    })
}

function dayKey(value) {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ""

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)
}

async function request(path, options) {
    const response = await apiFetch(`${API_URL}${path}`, options)
    const data = await response.json().catch(() => null)

    if (!response.ok) throw new Error(data?.error || "Request failed.")
    return data
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
            {children}
        </label>
    )
}

// One searchable input with selectable results.
function SearchSelect({ label, options, value, onChange, disabled }) {
    const id = useId()
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(0)
    const selected = options.find((option) => option.value === value)

    const matches = options.filter((option) =>
        option.label.toLowerCase().includes(query.trim().toLowerCase()),
    )

    function select(option) {
        onChange(option.value)
        setOpen(false)
        setQuery("")
        setActive(0)
    }

    return (
        <div
            className="relative"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setOpen(false)
                }
            }}
        >
            <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-700">
                {label}
            </label>

            <input
                id={id}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={`${id}-list`}
                aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
                autoComplete="off"
                disabled={disabled}
                value={open ? query : selected?.label || ""}
                placeholder="Type to search, then select…"
                className={input}
                onFocus={() => {
                    setQuery("")
                    setActive(0)
                    setOpen(true)
                }}
                onChange={(event) => {
                    setQuery(event.target.value)
                    setActive(0)
                    setOpen(true)
                    if (value) onChange("")
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape") setOpen(false)

                    if (event.key === "ArrowDown") {
                        event.preventDefault()
                        setOpen(true)
                        setActive((previous) => Math.min(previous + 1, matches.length - 1))
                    }

                    if (event.key === "ArrowUp") {
                        event.preventDefault()
                        setActive((previous) => Math.max(0, previous - 1))
                    }

                    if (event.key === "Enter" && open) {
                        event.preventDefault()
                        if (matches[active]) select(matches[active])
                    }
                }}
            />

            {open && !disabled && (
                <ul
                    id={`${id}-list`}
                    role="listbox"
                    className="absolute z-30 mt-2 max-h-64 w-full overflow-y-auto rounded-xl border border-purple-100 bg-white p-1 shadow-lg"
                >
                    {matches.length === 0 ? (
                        <li className="p-3 text-sm text-gray-500">No matches found.</li>
                    ) : (
                        matches.map((option, index) => (
                            <li
                                key={option.value}
                                id={`${id}-${index}`}
                                role="option"
                                aria-selected={option.value === value}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActive(index)}
                                onClick={() => select(option)}
                                className={`cursor-pointer rounded-lg p-3 text-sm ${
                                    index === active
                                        ? "bg-purple-50 text-purple-900"
                                        : "text-gray-700"
                                }`}
                            >
                                {option.label}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    )
}

function freshForm() {
    return {
        mode: "Walk-in",
        customer: "",
        sale_type: "Service",
        selectedId: "",
        appointmentId: "",
        quantity: "1",
        amount: "",
        payment: "Cash",
    }
}

function AdminTransactions() {
    const [transactions, setTransactions] = useState([])
    const [services, setServices] = useState([])
    const [products, setProducts] = useState([])
    const [appointments, setAppointments] = useState([])
    const [form, setForm] = useState(freshForm)
    const [receipt, setReceipt] = useState(null)
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [loadError, setLoadError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [clock, setClock] = useState(() => new Date())

    const lock = useRef(false)
    const version = useRef(0)

    // Retain the same identifier when retrying an unchanged failed submission.
    const retry = useRef(null)

    const load = useCallback(async (signal) => {
        const current = ++version.current
        setLoading(true)
        setLoadError("")

        try {
            const data = await Promise.all([
                request("/transactions", { signal }),
                request("/services", { signal }),
                request("/inventory", { signal }),
                request("/transactions/checkout-appointments", { signal }),
            ])

            if (!data.every(Array.isArray)) throw new Error("Unexpected server response.")
            if (signal?.aborted || current !== version.current) return null

            setTransactions(data[0])
            setServices(data[1])
            setProducts(data[2])
            setAppointments(data[3])
            return data[0]
        } catch (err) {
            if (!signal?.aborted && current === version.current) {
                setLoadError(err.message)
            }
            return null
        } finally {
            if (!signal?.aborted && current === version.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        load(controller.signal)
        const timer = setInterval(() => setClock(new Date()), 60000)

        return () => {
            controller.abort()
            clearInterval(timer)
        }
    }, [load])

    const booked = form.mode === "Appointment"
    const productSale = form.sale_type === "Product"
    const disabled = loading || busy || Boolean(loadError)

    const appointment = appointments.find((row) => String(row.id) === form.appointmentId)
    const items = productSale ? products : services
    const selectedItem = items.find(
        (row) => String(productSale ? row.id : row.service_id) === form.selectedId,
    )

    const deposit =
        booked && appointment?.payment_status === "Verified"
            ? Number(appointment.verified_deposit || 0)
            : 0

    const balanceCents = toCents(form.amount) - toCents(deposit)
    const unresolved =
        booked &&
        appointment &&
        (["Awaiting Payment", "Awaiting Verification"].includes(appointment.payment_status) ||
            (appointment.payment_status === "Verified" && !(deposit > 0)))

    const itemOptions = items
        .filter((row) => (productSale ? Number(row.stock) > 0 : row.status === "Available"))
        .map((row) => ({
            value: String(productSale ? row.id : row.service_id),
            label: `${productSale ? row.name : row.service} — ${money(row.price)}${
                productSale ? ` · ${row.stock} in stock` : ""
            }`,
        }))

    const appointmentOptions = appointments.map((row) => ({
        value: String(row.id),
        label: `#${row.id} · ${row.customer_name} · ${row.contact_number} · ${row.service} · ${row.appointment_date} ${row.appointment_time}`,
    }))

    function change(name, value) {
        setForm((previous) => ({ ...previous, [name]: value }))
    }

    function selectAppointment(id) {
        const row = appointments.find((item) => String(item.id) === id)

        setForm((previous) => ({
            ...previous,
            appointmentId: id,
            customer: row?.customer_name || "",
            amount: row?.service_total ?? "",
            quantity: "1",
            sale_type: "Service",
        }))
    }

    function selectItem(id) {
        const row = items.find((item) => String(productSale ? item.id : item.service_id) === id)

        setForm((previous) => ({
            ...previous,
            selectedId: id,
            quantity: "1",
            amount: row ? Number(row.price).toFixed(2) : "",
        }))
    }

    async function save(event) {
        event.preventDefault()
        if (lock.current) return

        setError("")
        setMessage("")

        if (
            !(Number(form.amount) > 0) ||
            !Number.isFinite(Number(form.amount)) ||
            (booked ? !appointment : !selectedItem || !form.customer.trim())
        ) {
            setError("Select the booking or item and enter a valid final total.")
            return
        }

        if (unresolved || balanceCents < 0) {
            setError("Resolve the deposit or excess payment before checkout.")
            return
        }

        const quantity = productSale && !booked ? Number(form.quantity) : 1

        if (!Number.isInteger(quantity) || quantity < 1) {
            setError("Enter a valid whole-number quantity.")
            return
        }

        if (!booked && productSale && quantity > Number(selectedItem.stock)) {
            setError("The selected quantity exceeds available stock.")
            return
        }

        const payload = {
            appointment_id: booked ? appointment.id : null,
            customer: form.customer.trim(),
            service: booked
                ? appointment.service
                : productSale
                  ? selectedItem.name
                  : selectedItem.service,
            sale_type: booked ? "Service" : form.sale_type,
            item_id: !booked && productSale ? selectedItem.id : null,
            quantity,
            amount: Number(form.amount).toFixed(2),
            payment: form.payment,
            status: "Paid",
            expected_deposit_amount: deposit.toFixed(2),
        }

        const fingerprint = JSON.stringify(payload)

        if (!retry.current || retry.current.fingerprint !== fingerprint) {
            retry.current = {
                fingerprint,
                id: crypto.randomUUID(),
            }
        }

        lock.current = true
        setBusy(true)

        try {
            const result = await request("/transactions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...payload,
                    offline_id: retry.current.id,
                }),
            })

            retry.current = null
            setForm(freshForm())
            setReceipt(null)
            setMessage("Transaction saved successfully.")

            const rows = await load()
            const saved = rows?.find((row) => String(row.transaction_id) === String(result.id))

            if (saved) setReceipt(saved)
            else setMessage("Saved successfully. Refresh the history to view the receipt.")
        } catch (err) {
            setError(err.message)
        } finally {
            lock.current = false
            setBusy(false)
        }
    }

    function printReceipt() {
        if (!receipt || receipt.status !== "Paid") return

        const popup = window.open("", "_blank", "width=460,height=700")
        if (!popup) {
            setError("Allow pop-ups to print the receipt.")
            return
        }

        const doc = popup.document
        doc.title = `Receipt ${receipt.transaction_id}`

        const style = doc.createElement("style")
        style.textContent = `
      body { max-width:360px; margin:24px auto; padding:16px; font:14px Arial; }
      h1 { font-size:20px; }
      p { line-height:1.6; overflow-wrap:anywhere; }
      button { padding:10px; }
      @media print { button { display:none; } }
    `
        doc.head.appendChild(style)

        function line(tag, text) {
            const element = doc.createElement(tag)
            element.textContent = text
            doc.body.appendChild(element)
            return element
        }

        line("h1", "Dahling’s Salon & Spa")
        line("p", `Receipt #${receipt.transaction_id}`)
        line("p", dateLabel(receipt.transaction_date))
        line("p", `Customer: ${receipt.customer}`)
        if (receipt.appointment_id) line("p", `Booking: #${receipt.appointment_id}`)
        line("p", `Item / service: ${receipt.service}`)
        line("p", `Quantity: ${receipt.quantity ?? 1}`)
        line("p", `Final sale total: ${money(receipt.amount)}`)
        line("p", `Deposit previously paid: ${money(receipt.deposit_applied)}`)
        line("p", `Balance collected: ${money(receipt.balance_collected)}`)
        if (Number(receipt.deposit_applied) > 0) {
            line("p", `Deposit method: ${receipt.deposit_payment_method}`)
        }
        if (Number(receipt.balance_collected) > 0) {
            line("p", `Balance payment method: ${receipt.payment}`)
        }
        line("p", `Status: ${receipt.status}`)
        line("p", "Thank you for visiting!")

        const print = line("button", "Print")
        print.onclick = () => popup.print()
        popup.focus()
    }

    const todayRows = transactions.filter((row) => dayKey(row.transaction_date) === dayKey(clock))
    const paidToday = todayRows.filter((row) => row.status === "Paid")
    const salesToday = paidToday.reduce((sum, row) => sum + Number(row.amount), 0)

    const filtered = transactions.filter((row) =>
        [row.customer, row.service, row.transaction_id, row.appointment_id].some((value) =>
            String(value ?? "")
                .toLowerCase()
                .includes(search.trim().toLowerCase()),
        ),
    )

    return (
        <div className="min-w-0 space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-purple-950">POS / Transactions</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Record a sale or check out an existing appointment.
                    </p>
                </div>
                <button disabled={loading || busy} onClick={() => load()} className={button}>
                    {loading ? "Refreshing…" : "Refresh"}
                </button>
            </header>

            {loadError && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
                    {loadError} Use Refresh to try again.
                </p>
            )}
            {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
                    {error}
                </p>
            )}
            {message && (
                <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">
                    {message}
                </p>
            )}

            <div className="grid gap-4 md:grid-cols-3">
                {[
                    ["Paid sales recorded today", money(salesToday)],
                    ["Transactions today", todayRows.length],
                    ["Payment options", "Cash / GCash"],
                ].map(([label, value], index) => (
                    <div key={label} className={panel}>
                        <p className="text-sm text-gray-500">{label}</p>
                        <p className="mt-3 text-2xl font-bold text-purple-800">
                            {index < 2 && (loading || loadError) ? "—" : value}
                        </p>
                    </div>
                ))}
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-2">
                <section className={panel}>
                    <h2 className="mb-5 text-lg font-bold text-purple-950">Record a transaction</h2>

                    <form onSubmit={save}>
                        <fieldset disabled={disabled} className="space-y-4">
                            <Field label="Transaction source">
                                <select
                                    className={input}
                                    value={form.mode}
                                    onChange={(event) => {
                                        setForm({ ...freshForm(), mode: event.target.value })
                                        setError("")
                                    }}
                                >
                                    <option value="Walk-in">Walk-in / Product sale</option>
                                    <option value="Appointment">Existing appointment</option>
                                </select>
                            </Field>

                            {booked ? (
                                <>
                                    <SearchSelect
                                        key="appointment"
                                        label="Find the customer’s appointment"
                                        options={appointmentOptions}
                                        value={form.appointmentId}
                                        onChange={selectAppointment}
                                        disabled={disabled}
                                    />
                                    <p className="text-xs text-gray-500">
                                        Search by name, contact, booking number, or service. Only
                                        approved/completed bookings without a transaction appear.
                                    </p>

                                    {appointment && (
                                        <div className="rounded-xl bg-purple-50 p-4 text-sm text-purple-900">
                                            <p className="font-semibold">
                                                {appointment.customer_name}
                                            </p>
                                            <p className="mt-1">{appointment.service}</p>
                                            <p className="mt-1">
                                                {appointment.appointment_date} ·{" "}
                                                {appointment.appointment_time}
                                            </p>
                                            <p className="mt-2">
                                                Deposit status:{" "}
                                                {appointment.payment_status ||
                                                    "No deposit recorded"}
                                            </p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Field label="Customer name">
                                        <input
                                            required
                                            maxLength={100}
                                            className={input}
                                            value={form.customer}
                                            onChange={(event) =>
                                                change("customer", event.target.value)
                                            }
                                        />
                                    </Field>

                                    <Field label="Sale type">
                                        <select
                                            className={input}
                                            value={form.sale_type}
                                            onChange={(event) => {
                                                setForm((previous) => ({
                                                    ...previous,
                                                    sale_type: event.target.value,
                                                    selectedId: "",
                                                    quantity: "1",
                                                    amount: "",
                                                }))
                                            }}
                                        >
                                            <option>Service</option>
                                            <option>Product</option>
                                        </select>
                                    </Field>

                                    <SearchSelect
                                        key={form.sale_type}
                                        label={
                                            productSale
                                                ? "Find and select a product"
                                                : "Find and select a service"
                                        }
                                        options={itemOptions}
                                        value={form.selectedId}
                                        onChange={selectItem}
                                        disabled={disabled}
                                    />

                                    {productSale && (
                                        <Field label="Quantity">
                                            <input
                                                type="number"
                                                required
                                                min="1"
                                                step="1"
                                                max={selectedItem?.stock}
                                                className={input}
                                                value={form.quantity}
                                                onChange={(event) => {
                                                    const quantity = event.target.value
                                                    setForm((previous) => ({
                                                        ...previous,
                                                        quantity,
                                                        amount: selectedItem
                                                            ? (
                                                                  Number(selectedItem.price) *
                                                                  Number(quantity)
                                                              ).toFixed(2)
                                                            : "",
                                                    }))
                                                }}
                                            />
                                        </Field>
                                    )}
                                </>
                            )}

                            <Field label="Final sale total before deposit deduction (₱)">
                                <input
                                    required
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    className={input}
                                    value={form.amount}
                                    onChange={(event) => change("amount", event.target.value)}
                                />
                            </Field>

                            <div className="space-y-3 rounded-xl bg-gray-50 p-4 text-sm">
                                <div className="flex justify-between gap-3">
                                    <span>Final sale total</span>
                                    <strong>{money(form.amount)}</strong>
                                </div>
                                <div className="flex justify-between gap-3 text-emerald-700">
                                    <span>Verified deposit</span>
                                    <strong>− {money(deposit)}</strong>
                                </div>
                                <div className="flex justify-between gap-3 border-t border-gray-200 pt-3 text-lg font-bold text-purple-900">
                                    <span>Balance to collect</span>
                                    <span>{money(balanceCents / 100)}</span>
                                </div>
                            </div>

                            {unresolved && (
                                <p className="text-sm text-amber-700">
                                    This deposit needs payment review before checkout.
                                </p>
                            )}
                            {balanceCents < 0 && (
                                <p className="text-sm text-red-700">
                                    The deposit exceeds the final bill. Resolve the excess before
                                    saving.
                                </p>
                            )}

                            {balanceCents > 0 && (
                                <Field label="Payment method for the remaining balance">
                                    <select
                                        className={input}
                                        value={form.payment}
                                        onChange={(event) => change("payment", event.target.value)}
                                    >
                                        <option>Cash</option>
                                        <option>GCash</option>
                                    </select>
                                </Field>
                            )}

                            <p className="text-xs leading-relaxed text-gray-500">
                                {balanceCents === 0 && appointment
                                    ? "The verified deposit covers the final bill. No additional payment is due."
                                    : "Save only after the displayed balance has been received."}
                            </p>

                            <button
                                type="submit"
                                disabled={disabled || Boolean(unresolved) || balanceCents < 0}
                                className={`${button} w-full`}
                            >
                                {busy ? "Saving…" : "Confirm and save transaction"}
                            </button>
                        </fieldset>
                    </form>
                </section>

                <section className={panel}>
                    <h2 className="text-lg font-bold text-purple-950">Saved receipt</h2>

                    {!receipt ? (
                        <p className="mt-5 rounded-xl border border-dashed border-purple-200 p-10 text-center text-sm text-gray-500">
                            Save a transaction or select View in the history.
                        </p>
                    ) : (
                        <div className="mt-5 space-y-4 text-sm">
                            <p className="font-bold text-purple-800">Dahling’s Salon & Spa</p>
                            <p className="text-gray-500">
                                Receipt #{receipt.transaction_id} ·{" "}
                                {dateLabel(receipt.transaction_date)}
                            </p>

                            {[
                                ["Customer", receipt.customer],
                                [
                                    "Booking",
                                    receipt.appointment_id
                                        ? `#${receipt.appointment_id}`
                                        : "Walk-in / Product sale",
                                ],
                                ["Service / item", receipt.service],
                                ["Final total", money(receipt.amount)],
                                ["Deposit applied", money(receipt.deposit_applied)],
                                ["Balance collected", money(receipt.balance_collected)],
                                [
                                    "Balance payment",
                                    Number(receipt.balance_collected) > 0
                                        ? receipt.payment
                                        : "No additional payment",
                                ],
                                ["Status", receipt.status],
                            ].map(([label, value]) => (
                                <div
                                    key={label}
                                    className="flex justify-between gap-4 border-b border-gray-100 pb-3"
                                >
                                    <span className="text-gray-500">{label}</span>
                                    <span className="text-right font-medium">{value}</span>
                                </div>
                            ))}

                            <button
                                onClick={printReceipt}
                                disabled={receipt.status !== "Paid"}
                                className={button}
                            >
                                Print receipt
                            </button>
                        </div>
                    )}
                </section>
            </div>

            <section className={panel}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-lg font-bold text-purple-950">Transaction history</h2>
                    <input
                        type="search"
                        aria-label="Search transaction history"
                        placeholder="Search customer, booking, or service…"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className={`${input} md:max-w-sm`}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                {[
                                    "Customer / Date",
                                    "Service / Item",
                                    "Sale total",
                                    "Deposit",
                                    "Balance collected",
                                    "Status",
                                    "Receipt",
                                ].map((title) => (
                                    <th key={title} className="px-3 py-4">
                                        {title}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map((row) => (
                                <tr key={row.transaction_id} className="hover:bg-purple-50/40">
                                    <td className="px-3 py-4">
                                        <p className="font-semibold">{row.customer}</p>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {dateLabel(row.transaction_date)}
                                        </p>
                                        {row.appointment_id && (
                                            <p className="mt-1 text-xs text-purple-600">
                                                Booking #{row.appointment_id}
                                            </p>
                                        )}
                                    </td>
                                    <td className="px-3 py-4">{row.service}</td>
                                    <td className="whitespace-nowrap px-3 py-4">
                                        {money(row.amount)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-emerald-700">
                                        {money(row.deposit_applied)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4">
                                        {money(row.balance_collected)}
                                    </td>
                                    <td className="px-3 py-4">{row.status}</td>
                                    <td className="px-3 py-4">
                                        <button
                                            onClick={() => {
                                                setReceipt(row)
                                                window.scrollTo({ top: 0, behavior: "smooth" })
                                            }}
                                            className="rounded-lg bg-purple-50 px-3 py-2 font-semibold text-purple-700"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {!filtered.length && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500">
                                        {loading ? "Loading…" : "No transactions found."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}

export default AdminTransactions
