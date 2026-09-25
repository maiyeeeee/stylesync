import { useCallback, useEffect, useRef, useState } from "react"
import { API_URL, apiFetch } from "../lib/sessionApi"

const panel = "rounded-2xl border border-purple-100 bg-white shadow-sm"
const input =
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
const primary =
    "rounded-xl bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
const secondary =
    "rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"

const emptyForm = {
    name: "",
    category: "",
    stock: "",
    alertLevel: "",
    price: "",
}

const money = (value) =>
    Number(value || 0).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
    })

function stockStatus(product) {
    if (Number(product.stock) === 0) return "Out of stock"
    if (Number(product.stock) <= Number(product.alertLevel)) return "Low stock"
    return "In stock"
}

async function request(path, options) {
    const response = await apiFetch(`${API_URL}${path}`, options)
    const data = await response.json().catch(() => null)

    if (!response.ok) {
        throw new Error(data?.error || "Unable to complete this request.")
    }

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

function AdminInventory() {
    const [products, setProducts] = useState([])
    const [search, setSearch] = useState("")
    const [filter, setFilter] = useState("All")
    const [showForm, setShowForm] = useState(false)
    const [editingProduct, setEditingProduct] = useState(null)
    const [form, setForm] = useState({ ...emptyForm })

    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [busy, setBusy] = useState(false)

    const mutationLock = useRef(false)
    const requestVersion = useRef(0)
    const formRef = useRef(null)

    const fetchProducts = useCallback(async (signal) => {
        const version = ++requestVersion.current
        setLoading(true)
        setLoadError("")

        try {
            const data = await request("/inventory", { signal })

            if (!Array.isArray(data)) {
                throw new Error("Unexpected inventory response. Please try again.")
            }

            if (!signal?.aborted && version === requestVersion.current) {
                setProducts(data)
            }
        } catch (err) {
            if (!signal?.aborted && version === requestVersion.current) {
                setLoadError(err.message || "Unable to load inventory.")
            }
        } finally {
            if (!signal?.aborted && version === requestVersion.current) {
                setLoading(false)
            }
        }
    }, [])

    useEffect(() => {
        const controller = new AbortController()
        fetchProducts(controller.signal)
        return () => controller.abort()
    }, [fetchProducts])

    useEffect(() => {
        if (showForm) {
            formRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            })
        }
    }, [showForm, editingProduct])

    function resetForm() {
        setForm({ ...emptyForm })
        setEditingProduct(null)
        setShowForm(false)
    }

    function openForm(product = null) {
        setError("")
        setMessage("")
        setEditingProduct(product)
        setForm(
            product
                ? {
                      name: product.name || "",
                      category: product.category || "",
                      stock: product.stock ?? "",
                      alertLevel: product.alertLevel ?? "",
                      price: product.price ?? "",
                  }
                : { ...emptyForm },
        )
        setShowForm(true)
    }

    function handleChange(event) {
        const { name, value } = event.target
        setForm((previous) => ({ ...previous, [name]: value }))
    }

    async function handleSubmit(event) {
        event.preventDefault()
        if (mutationLock.current) return

        setError("")
        setMessage("")

        const payload = {
            name: form.name.trim(),
            category: form.category.trim(),
            stock: Number(form.stock),
            alertLevel: Number(form.alertLevel),
            price: Number(form.price),
        }

        if (
            !payload.name ||
            !payload.category ||
            String(form.stock).trim() === "" ||
            String(form.alertLevel).trim() === "" ||
            String(form.price).trim() === "" ||
            !Number.isInteger(payload.stock) ||
            payload.stock < 0 ||
            !Number.isInteger(payload.alertLevel) ||
            payload.alertLevel < 0 ||
            !Number.isFinite(payload.price) ||
            payload.price < 0
        ) {
            setError(
                "Enter a name, category, non-negative whole-number stock and reorder level, and a valid price.",
            )
            return
        }

        mutationLock.current = true
        setBusy(true)

        try {
            await request(editingProduct ? `/inventory/${editingProduct.id}` : "/inventory", {
                method: editingProduct ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            })

            setMessage(
                editingProduct ? "Product updated successfully." : "Product added successfully.",
            )
            resetForm()
            await fetchProducts()
        } catch (err) {
            setError(err.message || "Unable to save this product.")
        } finally {
            mutationLock.current = false
            setBusy(false)
        }
    }

    async function handleDelete(product) {
        if (mutationLock.current || !window.confirm(`Delete "${product.name}" from inventory?`)) {
            return
        }

        mutationLock.current = true
        setBusy(true)
        setError("")
        setMessage("")

        try {
            await request(`/inventory/${product.id}`, { method: "DELETE" })

            if (editingProduct?.id === product.id) resetForm()

            setMessage("Product deleted successfully.")
            await fetchProducts()
        } catch (err) {
            setError(err.message || "Unable to delete this product.")
        } finally {
            mutationLock.current = false
            setBusy(false)
        }
    }

    const disabled = busy || loading || Boolean(loadError)
    const query = search.trim().toLowerCase()

    const filteredProducts = products.filter((product) => {
        const matchesSearch = [product.name, product.category].some((value) =>
            String(value || "")
                .toLowerCase()
                .includes(query),
        )

        const matchesFilter =
            filter === "All" ||
            stockStatus(product) === filter

        return matchesSearch && matchesFilter
    })

    const availableProductCount = products.filter((product) => Number(product.stock) > 0).length

    const totalUnitsAvailable = products.reduce(
        (total, product) => total + Math.max(0, Number(product.stock) || 0),
        0,
    )

    const lowStockCount = products.filter(
        (product) =>
            Number(product.stock) > 0 &&
            Number(product.stock) <= Number(product.alertLevel),
    ).length

    const outOfStockCount = products.filter((product) => Number(product.stock) === 0).length

    const cards = [
        {
            label: "Product types",
            value: products.length,
            note: "All products, including zero-stock items",
            color: "text-purple-800",
        },
        {
            label: "Available products",
            value: availableProductCount,
            note: "Product types with at least one unit",
            color: "text-emerald-700",
        },
        {
            label: "Total units available",
            value: totalUnitsAvailable.toLocaleString("en-PH"),
            note: "Combined remaining quantity of all products",
            color: "text-purple-800",
        },
        {
            label: "Needs attention",
            value: lowStockCount + outOfStockCount,
            note: `${lowStockCount} low stock · ${outOfStockCount} out of stock`,
            color: "text-amber-700",
        },
    ]

    return (
        <div className="min-w-0 space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-purple-500">
                        Sales & Inventory
                    </p>
                    <h1 className="text-3xl font-bold text-purple-950">Inventory Management</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Keep track of products, stock levels, and restocking needs.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={loading || busy}
                        onClick={() => fetchProducts()}
                        className={secondary}
                    >
                        {loading ? "Refreshing…" : "Refresh"}
                    </button>
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => openForm()}
                        className={primary}
                    >
                        + Add product
                    </button>
                </div>
            </header>

            {loading && (
                <p role="status" className="text-sm text-purple-700">
                    Loading inventory…
                </p>
            )}

            {loadError && (
                <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    {loadError}
                    <button
                        type="button"
                        disabled={loading || busy}
                        onClick={() => fetchProducts()}
                        className="ml-3 font-semibold underline"
                    >
                        Retry loading
                    </button>
                </div>
            )}

            {error && (
                <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {message && (
                <div
                    role="status"
                    className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
                >
                    {message}
                </div>
            )}

            <section
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                aria-label="Inventory summary"
            >
                {cards.map((card) => (
                    <div key={card.label} className={`${panel} p-5`}>
                        <p className="text-sm text-gray-500">{card.label}</p>
                        <p className={`mt-3 text-3xl font-bold ${card.color}`}>
                            {loading || loadError ? "—" : card.value}
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-gray-500">{card.note}</p>
                    </div>
                ))}
            </section>

            {showForm && (
                <section ref={formRef} className={`${panel} scroll-mt-6 p-5 md:p-6`}>
                    <div className="mb-5">
                        <h2 className="text-lg font-bold text-purple-950">
                            {editingProduct ? "Edit product" : "Add a product"}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500">
                            Set the product details and its individual reorder level.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <fieldset disabled={disabled} className="grid gap-4 md:grid-cols-2">
                            <Field label="Product name">
                                <input
                                    autoFocus
                                    required
                                    name="name"
                                    value={form.name}
                                    onChange={handleChange}
                                    placeholder="e.g. Hair conditioner"
                                    className={input}
                                />
                            </Field>

                            <Field label="Category">
                                <input
                                    required
                                    name="category"
                                    value={form.category}
                                    onChange={handleChange}
                                    placeholder="e.g. Hair Care"
                                    className={input}
                                />
                            </Field>

                            <Field label="Stock quantity">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    step="1"
                                    name="stock"
                                    value={form.stock}
                                    onChange={handleChange}
                                    className={input}
                                />
                            </Field>

                            <Field label="Reorder level">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    step="1"
                                    name="alertLevel"
                                    value={form.alertLevel}
                                    onChange={handleChange}
                                    className={input}
                                />
                            </Field>

                            <Field label="Selling price (₱)">
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    name="price"
                                    value={form.price}
                                    onChange={handleChange}
                                    className={input}
                                />
                            </Field>

                            <div className="flex items-center rounded-xl bg-purple-50 p-4 text-sm leading-relaxed text-purple-800">
                                A restocking alert appears when stock reaches or falls below this
                                product’s reorder level.
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 md:col-span-2">
                                <button type="submit" className={primary}>
                                    {busy
                                        ? "Saving…"
                                        : editingProduct
                                          ? "Save changes"
                                          : "Save product"}
                                </button>
                                <button type="button" onClick={resetForm} className={secondary}>
                                    Cancel
                                </button>
                            </div>
                        </fieldset>
                    </form>
                </section>
            )}

            <section className={`${panel} overflow-hidden`}>
                <div className="flex flex-wrap items-end justify-between gap-4 p-5 md:p-6">
                    <div>
                        <h2 className="text-lg font-bold text-purple-950">Product list</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {filteredProducts.length} of {products.length} products
                        </p>
                    </div>

                    <div className="flex w-full flex-wrap gap-3 md:w-auto">
                        <div className="min-w-0 flex-1 md:w-64">
                            <label htmlFor="inventory-search" className="sr-only">
                                Search products or categories
                            </label>
                            <input
                                id="inventory-search"
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search product or category…"
                                className={input}
                            />
                        </div>

                        <div>
                            <label htmlFor="inventory-filter" className="sr-only">
                                Filter stock status
                            </label>
                            <select
                                id="inventory-filter"
                                value={filter}
                                onChange={(event) => setFilter(event.target.value)}
                                className={input}
                            >
                                <option value="All">All stock levels</option>
                                <option>In stock</option>
                                <option>Low stock</option>
                                <option>Out of stock</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="border-y border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Product</th>
                                <th className="px-4 py-4 text-right">Available quantity</th>
                                <th className="px-4 py-4 text-right">Reorder level</th>
                                <th className="px-4 py-4 text-right">Unit price</th>
                                <th className="px-4 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {filteredProducts.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="px-6 py-12 text-center text-gray-500"
                                    >
                                        {loading
                                            ? "Loading products…"
                                            : loadError
                                              ? "Inventory could not be loaded."
                                              : "No products match your search or filter."}
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => {
                                    const status = stockStatus(product)
                                    const badge =
                                        status === "Out of stock"
                                            ? "bg-rose-50 text-rose-700"
                                            : status === "Low stock"
                                              ? "bg-amber-50 text-amber-800"
                                              : "bg-emerald-50 text-emerald-700"

                                    return (
                                        <tr
                                            key={product.id}
                                            className="transition hover:bg-purple-50/40"
                                        >
                                            <td className="px-6 py-4">
                                                <p className="font-semibold text-gray-800">
                                                    {product.name}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {product.category || "Uncategorized"}
                                                </p>
                                            </td>
                                            <td className="px-4 py-4 text-right font-semibold tabular-nums text-gray-800">
                                                {Number(product.stock).toLocaleString("en-PH")} units
                                            </td>
                                            <td className="px-4 py-4 text-right tabular-nums text-gray-500">
                                                {Number(product.alertLevel).toLocaleString("en-PH")}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-4 text-right tabular-nums text-gray-700">
                                                {money(product.price)}
                                            </td>
                                            <td className="px-4 py-4">
                                                <span
                                                    className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${badge}`}
                                                >
                                                    {status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => openForm(product)}
                                                        aria-label={`Edit ${product.name}`}
                                                        className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={disabled}
                                                        onClick={() => handleDelete(product)}
                                                        aria-label={`Delete ${product.name}`}
                                                        className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}

export default AdminInventory
