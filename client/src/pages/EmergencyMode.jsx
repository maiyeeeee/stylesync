import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL, apiFetch } from "../lib/sessionApi"

import {
    clearSyncedEmergencyRecords,
    listEmergencyRecords,
    queueEmergencyRecord,
    syncEmergencyRecords,
} from "../lib/offlineDb"

const REFERENCE_KEY = "stylesync-emergency-reference-data"

const inputClass =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"

const buttonClass =
    "rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"

const recordTypes = [
    ["appointment", "Appointment"],
    ["sale", "Sale / Payment"],
    ["inventory", "Inventory Adjustment"],
]

function Field({ label, children }) {
    return (
        <label className="block min-w-0">
            <span className="mb-2 block text-sm font-semibold text-gray-700">{label}</span>
            {children}
        </label>
    )
}

function statusClass(status) {
    if (status === "Synced") return "bg-green-100 text-green-800"
    if (status === "Needs Review") return "bg-orange-100 text-orange-800"
    if (status === "Failed") return "bg-red-100 text-red-800"
    if (status === "Syncing") return "bg-blue-100 text-blue-800"
    return "bg-amber-100 text-amber-900"
}

function formatDate(value) {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return "Unknown date"

    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    })
}

function EmergencyMode() {
    const [recordType, setRecordType] = useState("appointment")
    const [services, setServices] = useState([])
    const [products, setProducts] = useState([])
    const [records, setRecords] = useState([])
    const [online, setOnline] = useState(navigator.onLine)
    const [cachedAt, setCachedAt] = useState(null)

    const [operation, setOperation] = useState("")
    const [loadingRecords, setLoadingRecords] = useState(true)
    const [queueError, setQueueError] = useState("")
    const [referenceError, setReferenceError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [statusFilter, setStatusFilter] = useState("All")

    const lock = useRef(false)
    const busy = Boolean(operation)

    const refreshRecords = useCallback(async () => {
        const current = await listEmergencyRecords()
        setRecords(current)
        setQueueError("")
        return current
    }, [])

    useEffect(() => {
        let active = true

        listEmergencyRecords()
            .then((current) => {
                if (active) {
                    setRecords(current)
                    setQueueError("")
                }
            })
            .catch((err) => {
                if (active) {
                    setQueueError(err.message || "Unable to open the local queue.")
                }
            })
            .finally(() => {
                if (active) setLoadingRecords(false)
            })

        try {
            const cached = JSON.parse(localStorage.getItem(REFERENCE_KEY) || "null")

            if (cached) {
                setServices(Array.isArray(cached.services) ? cached.services : [])
                setProducts(Array.isArray(cached.products) ? cached.products : [])
                setCachedAt(cached.cached_at || null)
            }
        } catch {
            setReferenceError(
                "Cached service/product details could not be loaded. Reconnect to refresh them.",
            )
        }

        const handleOnline = () => setOnline(true)
        const handleOffline = () => setOnline(false)

        window.addEventListener("online", handleOnline)
        window.addEventListener("offline", handleOffline)

        return () => {
            active = false
            window.removeEventListener("online", handleOnline)
            window.removeEventListener("offline", handleOffline)
        }
    }, [])

    useEffect(() => {
        if (!online) return

        const controller = new AbortController()

        async function read(path) {
            const response = await apiFetch(`${API_URL}${path}`, {
                signal: controller.signal,
            })

            const data = await response.json()

            if (!response.ok || !Array.isArray(data)) {
                throw new Error("Unable to refresh services and products.")
            }

            return data
        }

        Promise.all([read("/services"), read("/inventory")])
            .then(([serviceData, productData]) => {
                if (controller.signal.aborted) return

                const references = {
                    services: serviceData,
                    products: productData,
                    cached_at: new Date().toISOString(),
                }

                // Update the stored cache only after both requests succeed.
                localStorage.setItem(REFERENCE_KEY, JSON.stringify(references))

                setServices(serviceData)
                setProducts(productData)
                setCachedAt(references.cached_at)
                setReferenceError("")
            })
            .catch((err) => {
                if (!controller.signal.aborted) {
                    setReferenceError(err.message || "Unable to refresh reference data.")
                }
            })

        return () => controller.abort()
    }, [online])

    function beginOperation(name) {
        if (lock.current) return false

        lock.current = true
        setOperation(name)
        setError("")
        setMessage("")
        return true
    }

    function finishOperation() {
        lock.current = false
        setOperation("")
    }

    async function reloadQueue() {
        if (!beginOperation("refresh")) return

        try {
            await refreshRecords()
        } catch (err) {
            setQueueError(err.message || "Unable to read local records.")
        } finally {
            finishOperation()
        }
    }

    async function saveRecord(event) {
        event.preventDefault()
        if (lock.current) return

        const form = event.currentTarget
        const fields = new FormData(form)
        let payload

        if (recordType === "appointment") {
            const selected = services.find(
                (item) => Number(item.service_id) === Number(fields.get("service_id")),
            )

            if (!selected) {
                setError("Select a cached service.")
                return
            }

            payload = {
                customer_name: fields.get("customer_name"),
                contact_number: fields.get("contact_number"),
                email: fields.get("email"),
                gender: "Prefer not to say",
                customer_type: "Regular",
                service_id: Number(fields.get("service_id")),
                service: selected.service,
                appointment_date: fields.get("appointment_date"),
                appointment_time: fields.get("appointment_time"),
                notes: fields.get("notes"),
            }
        } else if (recordType === "sale") {
            const saleType = fields.get("sale_type")
            const itemId = Number(fields.get("item_id"))
            const source = saleType === "Product" ? products : services

            const selected = source.find((item) =>
                saleType === "Product"
                    ? Number(item.id) === itemId
                    : Number(item.service_id) === itemId,
            )

            if (!selected) {
                setError("Select a cached item or service.")
                return
            }

            payload = {
                customer: fields.get("customer"),
                sale_type: saleType,
                service: saleType === "Product" ? selected.name : selected.service,
                item_id: saleType === "Product" ? itemId : null,
                quantity: Number(fields.get("quantity") || 1),
                amount: Number(fields.get("amount")),
                payment: fields.get("payment"),
                status: fields.get("status"),
            }
        } else {
            payload = {
                item_id: Number(fields.get("item_id")),
                quantity_change: Number(fields.get("quantity_change")),
                reason: fields.get("reason"),
            }
        }

        if (!beginOperation("save")) return

        let saved = false

        try {
            await queueEmergencyRecord(recordType, payload)
            saved = true
            form.reset()
            setMessage("Saved on this device as Pending Sync.")
            await refreshRecords()
        } catch (err) {
            if (saved) {
                setQueueError(
                    "The record was saved, but the list could not refresh. Reload the queue before entering it again.",
                )
            } else {
                setError(err.message || "Unable to save the local record.")
            }
        } finally {
            finishOperation()
        }
    }

    async function syncRecords() {
        if (lock.current) return

        if (!navigator.onLine) {
            setError("A network connection is needed to synchronize.")
            return
        }

        if (!beginOperation("sync")) return

        try {
            const results = await syncEmergencyRecords()
            const current = await refreshRecords()

            const synced = results.filter((item) => item.status === "Synced").length

            const review = current.filter((item) => item.sync_status === "Needs Review").length

            const failed = current.filter((item) => item.sync_status === "Failed").length

            const pending = current.filter(
                (item) => item.sync_status === "Pending" || item.sync_status === "Syncing",
            ).length

            setMessage(
                `${synced} synced this time · ${review} need review · ${failed} failed · ${pending} pending.`,
            )

            const failure = results.find((item) => item.error)
            if (failure) setError(failure.error)
        } catch (err) {
            setError(err.message || "Sync could not finish. Check the queue before retrying.")

            await refreshRecords().catch(() => {
                setQueueError("The local queue could not be refreshed.")
            })
        } finally {
            finishOperation()
        }
    }

    async function clearSynced() {
        if (lock.current) return

        if (
            !window.confirm("Clear synced copies from this device? Unsynced records will be kept.")
        ) {
            return
        }

        if (!beginOperation("clear")) return

        let cleared = false

        try {
            await clearSyncedEmergencyRecords()
            cleared = true
            setMessage("Synced local copies cleared. Unsynced records were kept.")
            await refreshRecords()
        } catch (err) {
            if (cleared) {
                setQueueError("Copies were cleared, but the list could not refresh.")
            } else {
                setError(err.message || "Unable to clear synced copies.")
            }
        } finally {
            finishOperation()
        }
    }

    const pendingCount = records.filter(
        (item) => item.sync_status === "Pending" || item.sync_status === "Syncing",
    ).length

    const reviewCount = records.filter(
        (item) => item.sync_status === "Needs Review" || item.sync_status === "Failed",
    ).length

    const syncedCount = records.filter((item) => item.sync_status === "Synced").length

    const filteredRecords = records.filter(
        (item) => statusFilter === "All" || item.sync_status === statusFilter,
    )

    const availableServices = services.filter((item) => item.status === "Available")

    const queueBlocked = busy || loadingRecords || Boolean(queueError)

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
                        Continuity tools
                    </p>
                    <h2 className="mt-2 text-3xl font-bold text-purple-950">Emergency mode</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        Save essential records on this device and synchronize when connected.
                    </p>
                </div>

                <span
                    className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${
                        online ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-900"
                    }`}
                >
                    {online ? "Network detected" : "Offline"}
                </span>
            </header>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
                Offline appointments are provisional. Staff availability and conflicts are checked
                during synchronization. Invalid slots need manual review. A network connection does
                not guarantee the server is reachable.
            </div>

            {referenceError && (
                <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                    {referenceError}
                </p>
            )}

            {error && (
                <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                    {error}
                </p>
            )}

            {message && (
                <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                    {message}
                </p>
            )}

            {queueError && (
                <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                    {queueError}
                    <button
                        type="button"
                        disabled={busy}
                        onClick={reloadQueue}
                        className="ml-3 font-semibold underline"
                    >
                        Reload queue
                    </button>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
                {[
                    ["Pending / syncing", pendingCount],
                    ["Review / failed", reviewCount],
                    ["Synced copies", syncedCount],
                ].map(([title, count]) => (
                    <div
                        key={title}
                        className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"
                    >
                        <p className="text-sm text-gray-500">{title}</p>
                        <p className="mt-2 text-3xl font-bold text-purple-900">
                            {loadingRecords || queueError ? "—" : count}
                        </p>
                        <p className="mt-2 text-xs text-gray-400">This device only</p>
                    </div>
                ))}
            </div>

            <section className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6">
                <h3 className="text-lg font-bold text-purple-950">Record locally</h3>

                <p className="mt-1 text-xs text-gray-500">
                    {cachedAt
                        ? `Reference data cached: ${formatDate(cachedAt)} · Philippine time`
                        : "No saved reference timestamp. Connect to load services and products."}
                </p>

                <div className="my-5 flex flex-wrap gap-2">
                    {recordTypes.map(([value, label]) => (
                        <button
                            key={value}
                            type="button"
                            disabled={busy}
                            aria-pressed={recordType === value}
                            onClick={() => {
                                setRecordType(value)
                                setError("")
                                setMessage("")
                            }}
                            className={`rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${
                                recordType === value
                                    ? "bg-purple-700 text-white"
                                    : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <form key={recordType} onSubmit={saveRecord}>
                    <fieldset disabled={queueBlocked} className="grid min-w-0 gap-4 md:grid-cols-2">
                        {recordType === "appointment" && (
                            <>
                                <Field label="Customer name">
                                    <input name="customer_name" required className={inputClass} />
                                </Field>
                                <Field label="Contact number">
                                    <input
                                        name="contact_number"
                                        type="tel"
                                        required
                                        placeholder="09XXXXXXXXX"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Email (optional)">
                                    <input name="email" type="email" className={inputClass} />
                                </Field>
                                <Field label="Cached service">
                                    <select
                                        name="service_id"
                                        required
                                        defaultValue=""
                                        className={inputClass}
                                    >
                                        <option value="" disabled>
                                            Select service
                                        </option>
                                        {availableServices.map((item) => (
                                            <option key={item.service_id} value={item.service_id}>
                                                {item.service} (
                                                {item.duration_minutes
                                                    ? `${item.duration_minutes} min`
                                                    : item.duration || "duration not recorded"}
                                                )
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Appointment date">
                                    <input
                                        name="appointment_date"
                                        type="date"
                                        required
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Start time">
                                    <input
                                        name="appointment_time"
                                        type="time"
                                        min="09:00"
                                        max="19:00"
                                        required
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="md:col-span-2">
                                    <Field label="Notes">
                                        <textarea name="notes" rows={3} className={inputClass} />
                                    </Field>
                                </div>
                            </>
                        )}

                        {recordType === "sale" && (
                            <SaleFields services={services} products={products} />
                        )}

                        {recordType === "inventory" && (
                            <>
                                <Field label="Cached inventory item">
                                    <select
                                        name="item_id"
                                        required
                                        defaultValue=""
                                        className={inputClass}
                                    >
                                        <option value="" disabled>
                                            Select item
                                        </option>
                                        {products.map((item) => (
                                            <option key={item.id} value={item.id}>
                                                {item.name} — cached stock: {item.stock}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Quantity adjustment">
                                    <input
                                        name="quantity_change"
                                        type="number"
                                        step="1"
                                        required
                                        placeholder="For example, -2 or 5"
                                        className={inputClass}
                                    />
                                </Field>
                                <div className="md:col-span-2">
                                    <Field label="Reason">
                                        <input name="reason" required className={inputClass} />
                                    </Field>
                                </div>
                            </>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4 md:col-span-2">
                            <p className="max-w-lg text-xs leading-relaxed text-gray-500">
                                Switching record types clears unsaved form entries. Saved records
                                remain in this device’s queue.
                            </p>
                            <button
                                type="submit"
                                className="rounded-xl bg-purple-700 px-5 py-3 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-40"
                            >
                                {operation === "save" ? "Saving…" : "Save locally"}
                            </button>
                        </div>
                    </fieldset>
                </form>
            </section>

            <section className="min-w-0 overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4 p-5">
                    <div>
                        <h3 className="text-lg font-bold text-purple-950">Local record queue</h3>
                        <p className="mt-1 text-xs text-gray-500">
                            Recorded times shown in Philippine time.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={
                                queueBlocked ||
                                !online ||
                                !records.some((item) => item.sync_status !== "Synced")
                            }
                            onClick={syncRecords}
                            className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {operation === "sync" ? "Syncing…" : "Sync pending records"}
                        </button>
                        <button
                            type="button"
                            disabled={queueBlocked || !syncedCount}
                            onClick={clearSynced}
                            className={buttonClass}
                        >
                            {operation === "clear" ? "Clearing…" : "Clear synced copies"}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
                    <p className="text-xs text-gray-500">
                        {loadingRecords
                            ? "Loading queue…"
                            : `${filteredRecords.length} records shown`}
                    </p>
                    <select
                        aria-label="Filter sync status"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                        <option value="All">All statuses</option>
                        {["Pending", "Syncing", "Needs Review", "Failed", "Synced"].map(
                            (status) => (
                                <option key={status}>{status}</option>
                            ),
                        )}
                    </select>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-sm">
                        <thead className="border-y border-purple-100 bg-purple-50 text-purple-900">
                            <tr>
                                {["Local record", "Type", "Recorded", "Status", "Result"].map(
                                    (label) => (
                                        <th
                                            key={label}
                                            scope="col"
                                            className="px-5 py-3 text-xs font-semibold"
                                        >
                                            {label}
                                        </th>
                                    ),
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {!filteredRecords.length && (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-gray-500">
                                        {loadingRecords
                                            ? "Loading local records…"
                                            : queueError
                                              ? "The queue could not be loaded."
                                              : "No matching local records."}
                                    </td>
                                </tr>
                            )}

                            {filteredRecords.map((record) => (
                                <tr
                                    key={record.offline_id}
                                    className="border-b border-gray-100 hover:bg-purple-50"
                                >
                                    <td className="px-5 py-4 align-middle">
                                        <details className="max-w-[200px]">
                                            <summary className="cursor-pointer font-mono text-xs text-purple-700">
                                                {String(record.offline_id).slice(0, 8)}…
                                            </summary>
                                            <p className="mt-2 break-all font-mono text-xs text-gray-500">
                                                {record.offline_id}
                                            </p>
                                        </details>
                                    </td>
                                    <td className="px-5 py-4 align-middle capitalize">
                                        {record.record_type}
                                    </td>
                                    <td className="whitespace-nowrap px-5 py-4 align-middle text-xs text-gray-600">
                                        {formatDate(record.recorded_at)}
                                    </td>
                                    <td className="px-5 py-4 align-middle">
                                        <span
                                            className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${statusClass(record.sync_status)}`}
                                        >
                                            {record.sync_status}
                                        </span>
                                    </td>
                                    <td className="max-w-sm break-words px-5 py-4 align-middle text-xs leading-relaxed text-gray-600">
                                        {record.error_message ||
                                            (record.server_id
                                                ? `Server ID: ${record.server_id}`
                                                : "Awaiting synchronization")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <p className="px-5 py-4 text-xs leading-relaxed text-gray-500">
                    Keep unsynced records on this device. Do not clear browser site data while
                    records are pending. “Clear synced copies” removes only local copies already
                    synchronized.
                </p>
            </section>
        </div>
    )
}

function SaleFields({ services, products }) {
    const [saleType, setSaleType] = useState("Service")
    const items = saleType === "Product" ? products : services

    return (
        <>
            <Field label="Customer">
                <input name="customer" required className={inputClass} />
            </Field>

            <Field label="Sale type">
                <select
                    name="sale_type"
                    value={saleType}
                    onChange={(event) => setSaleType(event.target.value)}
                    className={inputClass}
                >
                    <option>Service</option>
                    <option>Product</option>
                </select>
            </Field>

            <Field label="Cached item / service">
                <select
                    key={saleType}
                    name="item_id"
                    required
                    defaultValue=""
                    className={inputClass}
                >
                    <option value="" disabled>
                        Select item or service
                    </option>
                    {items.map((item) => {
                        const id = saleType === "Product" ? item.id : item.service_id
                        return (
                            <option key={id} value={id}>
                                {saleType === "Product" ? item.name : item.service}
                            </option>
                        )
                    })}
                </select>
            </Field>

            <Field label="Quantity">
                <input
                    name="quantity"
                    type="number"
                    min="1"
                    step="1"
                    defaultValue="1"
                    required
                    className={inputClass}
                />
            </Field>

            <Field label="Total amount (₱)">
                <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    className={inputClass}
                />
            </Field>

            <Field label="Payment method">
                <select name="payment" className={inputClass}>
                    <option>Cash</option>
                    <option>GCash</option>
                    <option>Other</option>
                </select>
            </Field>

            <Field label="Payment status">
                <select name="status" className={inputClass}>
                    <option>Paid</option>
                    <option>Pending</option>
                </select>
            </Field>
        </>
    )
}

export default EmergencyMode
