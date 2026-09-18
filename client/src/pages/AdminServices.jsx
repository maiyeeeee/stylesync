import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL, ASSET_URL, apiFetch } from "../lib/sessionApi"

const emptyForm = {
    service: "",
    category: "",
    price: "",
    duration_minutes: "",
    status: "Available",
    image_url: "",
}

const inputClass =
    "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"

const buttonClass =
    "rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"

const money = (value) =>
    new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
    }).format(Number(value || 0))

const serviceId = (item) => item.service_id ?? item.id

function imageUrl(value) {
    const source = String(value || "").trim()
    if (!source) return ""
    if (/^https?:\/\//i.test(source)) return source

    const base = String(ASSET_URL || "").replace(/\/+$/, "")
    return `${base}/${source.replace(/^\/+/, "")}`
}

function ServiceImage({ src, large = false }) {
    const [failedSource, setFailedSource] = useState(null)

    const size = large ? "h-24 w-24" : "h-14 w-14"

    if (!src || failedSource === src) {
        return (
            <div
                className={`${size} flex shrink-0 items-center justify-center rounded-xl bg-purple-50 p-2 text-center text-xs text-purple-500`}
            >
                No image
            </div>
        )
    }

    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailedSource(src)}
            className={`${size} shrink-0 rounded-xl object-cover`}
        />
    )
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-semibold text-gray-700">{label}</span>
            {children}
        </label>
    )
}

async function request(path, options = {}) {
    const response = await apiFetch(`${API_URL}${path}`, options)
    const data = await response.json().catch(() => null)

    if (!response.ok) {
        throw new Error(data?.error || "Unable to complete the request.")
    }

    return data
}

function AdminServices() {
    const [services, setServices] = useState([])
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("All")
    const [categoryFilter, setCategoryFilter] = useState("")

    const [showForm, setShowForm] = useState(false)
    const [editing, setEditing] = useState(null)
    const [form, setForm] = useState({ ...emptyForm })
    const [image, setImage] = useState(null)
    const [preview, setPreview] = useState("")
    const [fileKey, setFileKey] = useState(0)

    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [loadError, setLoadError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")

    const lock = useRef(false)
    const sequence = useRef(0)
    const editor = useRef(null)

    const loadServices = useCallback(async (signal) => {
        const current = ++sequence.current
        setLoading(true)
        setLoadError("")

        try {
            const data = await request("/services", { signal })

            if (!Array.isArray(data)) {
                throw new Error("Invalid services response.")
            }

            if (!signal?.aborted && current === sequence.current) {
                setServices(data)
            }
        } catch (err) {
            if (!signal?.aborted && current === sequence.current) {
                setLoadError(err.message || "Unable to load services.")
            }
        } finally {
            if (!signal?.aborted && current === sequence.current) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        loadServices(controller.signal)
        return () => controller.abort()
    }, [loadServices])

    useEffect(() => {
        if (!image) {
            setPreview("")
            return
        }

        const url = URL.createObjectURL(image)
        setPreview(url)
        return () => URL.revokeObjectURL(url)
    }, [image])

    useEffect(() => {
        if (showForm) {
            editor.current?.scrollIntoView({ block: "start" })
            editor.current?.focus({ preventScroll: true })
        }
    }, [showForm, editing])

    const blocked = busy || loading || Boolean(loadError)

    function openForm(item = null) {
        setEditing(item)
        setForm(
            item
                ? {
                      service: item.service || item.name || "",
                      category: item.category || "",
                      price: item.price ?? "",
                      duration_minutes: item.duration_minutes || "",
                      status: item.status || "Available",
                      image_url: item.image_url || "",
                  }
                : { ...emptyForm },
        )
        setImage(null)
        setFileKey((value) => value + 1)
        setError("")
        setMessage("")
        setShowForm(true)
    }

    function changeField(event) {
        const { name, value } = event.target
        setForm((previous) => ({ ...previous, [name]: value }))
    }

    async function mutate(path, options, success, afterSave) {
        if (lock.current || blocked) return

        lock.current = true
        setBusy(true)
        setError("")
        setMessage("")

        try {
            await request(path, options)
            afterSave?.()
            setMessage(success)
            await loadServices()
        } catch (err) {
            setError(err.message || "Unable to save the change.")
        } finally {
            lock.current = false
            setBusy(false)
        }
    }

    function saveService(event) {
        event.preventDefault()

        if (!form.service.trim()) {
            setError("Enter a service name.")
            return
        }

        const duration = Number(form.duration_minutes)
        const price = Number(form.price)

        if (
            form.price === "" ||
            !Number.isFinite(price) ||
            price < 0 ||
            !Number.isInteger(duration) ||
            duration < 1 ||
            duration > 480
        ) {
            setError("Enter a valid price and a duration of 1–480 minutes.")
            return
        }

        const payload = new FormData()
        payload.append("service", form.service.trim())
        payload.append("category", form.category.trim())
        payload.append("price", form.price)
        payload.append("duration_minutes", String(duration))
        payload.append("status", form.status)
        payload.append("old_image_url", form.image_url)

        if (image) payload.append("image", image)

        mutate(
            editing ? `/services/${serviceId(editing)}` : "/services",
            {
                method: editing ? "PUT" : "POST",
                body: payload,
            },
            editing ? "Service updated." : "Service added.",
            () => {
                setShowForm(false)
                setImage(null)
            },
        )
    }

    function deleteService(item) {
        if (blocked || lock.current) return

        if (
            !window.confirm(
                `Delete "${item.service || item.name}"? You can mark it Unavailable through Edit instead.`,
            )
        ) {
            return
        }

        mutate(`/services/${serviceId(item)}`, { method: "DELETE" }, "Service deleted.", () => {
            if (editing && serviceId(editing) === serviceId(item)) {
                setShowForm(false)
                setImage(null)
            }
        })
    }

    const categories = [...new Set(services.map((item) => item.category || "Uncategorized"))].sort()

    const filtered = services.filter((item) => {
        const category = item.category || "Uncategorized"
        const text = `${item.service || item.name || ""} ${category}`

        return (
            text.toLowerCase().includes(search.trim().toLowerCase()) &&
            (statusFilter === "All" || item.status === statusFilter) &&
            (!categoryFilter || category === categoryFilter)
        )
    })

    const cards = [
        ["Total services", services.length],
        ["Available", services.filter((item) => item.status === "Available").length],
        ["Unavailable", services.filter((item) => item.status === "Unavailable").length],
    ]

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
                        Salon offerings
                    </p>
                    <h2 className="mt-2 text-3xl font-bold text-purple-950">Services management</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        Manage service photos, prices, durations, and availability.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={loading || busy}
                        onClick={() => loadServices()}
                        className={buttonClass}
                    >
                        Refresh
                    </button>
                    <button
                        type="button"
                        disabled={blocked}
                        onClick={() => openForm()}
                        className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-40"
                    >
                        + Add service
                    </button>
                </div>
            </header>

            {(error || loadError) && (
                <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
                    {error || loadError}
                    {loadError && (
                        <button
                            type="button"
                            disabled={busy || loading}
                            onClick={() => loadServices()}
                            className="ml-3 font-semibold underline"
                        >
                            Retry loading
                        </button>
                    )}
                </div>
            )}

            {message && (
                <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
                    {message}
                </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
                {cards.map(([title, value]) => (
                    <div
                        key={title}
                        className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"
                    >
                        <p className="text-sm text-gray-500">{title}</p>
                        <p className="mt-2 text-3xl font-bold text-purple-900">
                            {loading || loadError ? "—" : value}
                        </p>
                    </div>
                ))}
            </div>

            {showForm && (
                <section
                    ref={editor}
                    tabIndex={-1}
                    aria-labelledby="service-editor"
                    className="scroll-mt-24 rounded-2xl border border-purple-200 bg-white p-6 shadow-sm outline-none"
                >
                    <h3 id="service-editor" className="mb-5 text-xl font-bold text-purple-950">
                        {editing ? "Edit service" : "Add service"}
                    </h3>

                    <form onSubmit={saveService}>
                        <fieldset disabled={blocked} className="grid min-w-0 gap-4 md:grid-cols-2">
                            <Field label="Service name">
                                <input
                                    name="service"
                                    value={form.service}
                                    onChange={changeField}
                                    required
                                    className={inputClass}
                                />
                            </Field>

                            <Field label="Category">
                                <input
                                    name="category"
                                    value={form.category}
                                    onChange={changeField}
                                    className={inputClass}
                                    placeholder="For example, Hair or Nails"
                                />
                            </Field>

                            <Field label="Price (₱)">
                                <input
                                    name="price"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.price}
                                    onChange={changeField}
                                    required
                                    className={inputClass}
                                />
                            </Field>

                            <Field label="Duration in minutes">
                                <input
                                    name="duration_minutes"
                                    type="number"
                                    min="1"
                                    max="480"
                                    step="1"
                                    value={form.duration_minutes}
                                    onChange={changeField}
                                    required
                                    className={inputClass}
                                />
                            </Field>

                            <Field label="Availability">
                                <select
                                    name="status"
                                    value={form.status}
                                    onChange={changeField}
                                    className={inputClass}
                                >
                                    <option>Available</option>
                                    <option>Unavailable</option>
                                </select>
                            </Field>

                            <Field
                                label={editing ? "Replace photo (optional)" : "Photo (optional)"}
                            >
                                <input
                                    key={fileKey}
                                    type="file"
                                    accept="image/*"
                                    onChange={(event) => setImage(event.target.files?.[0] || null)}
                                    className={inputClass}
                                />
                            </Field>

                            <div className="flex items-center gap-4 md:col-span-2">
                                <ServiceImage
                                    src={image ? preview : imageUrl(form.image_url)}
                                    large
                                />
                                <p className="text-xs leading-relaxed text-gray-500">
                                    {image
                                        ? "New photo selected."
                                        : editing
                                          ? "The existing photo is retained unless you select a replacement."
                                          : "A placeholder is shown when no photo is available."}
                                </p>
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 md:col-span-2">
                                <button
                                    type="submit"
                                    className="rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                                >
                                    {busy ? "Saving…" : "Save service"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false)
                                        setImage(null)
                                        setError("")
                                    }}
                                    className={buttonClass}
                                >
                                    Cancel
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </section>
            )}

            <section className="min-w-0 overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4 p-5">
                    <div>
                        <h3 className="text-lg font-bold text-purple-950">Service list</h3>
                        <p className="mt-1 text-xs text-gray-500">
                            {loading
                                ? "Loading…"
                                : `${filtered.length} of ${services.length} services`}
                        </p>
                    </div>

                    <div className="flex w-full flex-col gap-2 lg:w-auto lg:flex-row">
                        <input
                            type="search"
                            aria-label="Search services"
                            placeholder="Search service or category…"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className={inputClass}
                        />
                        <select
                            aria-label="Filter category"
                            value={categoryFilter}
                            onChange={(event) => setCategoryFilter(event.target.value)}
                            className={inputClass}
                        >
                            <option value="">All categories</option>
                            {categories.map((category) => (
                                <option key={category}>{category}</option>
                            ))}
                        </select>
                        <select
                            aria-label="Filter availability"
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className={inputClass}
                        >
                            <option value="All">All statuses</option>
                            <option>Available</option>
                            <option>Unavailable</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[850px] text-left text-sm">
                        <thead className="border-y border-purple-100 bg-purple-50 text-purple-900">
                            <tr>
                                {[
                                    "Service",
                                    "Category",
                                    "Price",
                                    "Duration",
                                    "Status",
                                    "Actions",
                                ].map((label) => (
                                    <th
                                        key={label}
                                        scope="col"
                                        className="px-5 py-3 text-xs font-semibold"
                                    >
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {!filtered.length && (
                                <tr>
                                    <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                                        {loading
                                            ? "Loading services…"
                                            : loadError
                                              ? "Services could not be loaded."
                                              : "No matching services."}
                                    </td>
                                </tr>
                            )}

                            {filtered.map((item) => (
                                <tr
                                    key={serviceId(item)}
                                    className="border-b border-gray-100 hover:bg-purple-50"
                                >
                                    <td className="px-5 py-4 align-middle">
                                        <div className="flex items-center gap-3">
                                            <ServiceImage src={imageUrl(item.image_url)} />
                                            <span className="font-semibold text-gray-900">
                                                {item.service || item.name}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 align-middle text-gray-600">
                                        {item.category || "Uncategorized"}
                                    </td>
                                    <td className="whitespace-nowrap px-5 py-4 align-middle font-semibold text-purple-900">
                                        {money(item.price)}
                                    </td>
                                    <td className="whitespace-nowrap px-5 py-4 align-middle text-gray-600">
                                        {item.duration_minutes
                                            ? `${item.duration_minutes} min`
                                            : item.duration || "Not set"}
                                    </td>
                                    <td className="px-5 py-4 align-middle">
                                        <span
                                            className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                                                item.status === "Available"
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-gray-100 text-gray-600"
                                            }`}
                                        >
                                            {item.status || "Not set"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 align-middle">
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                disabled={blocked}
                                                onClick={() => openForm(item)}
                                                className={buttonClass}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                type="button"
                                                disabled={blocked}
                                                onClick={() => deleteService(item)}
                                                className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}

export default AdminServices
