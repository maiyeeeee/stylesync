
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch } from "../lib/sessionApi";

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-purple-400";

const buttonClass =
  "rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50";

const panelClass =
  "rounded-2xl border border-purple-100 bg-white p-5 shadow-sm";

const emptyProduct = {
  name: "",
  category: "",
  stock: "",
  alertLevel: "",
  price: "",
};

const money = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  });

function stockStatus(product) {
  const stock = Number(product.stock);
  const level = Number(product.alertLevel);

  if (stock === 0) return "Out of Stock";
  if (stock <= level) return "Low Stock";
  return "In Stock";
}

async function request(path, options = {}) {
  const response = await apiFetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "Request failed.");
  }

  return data;
}

function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("All");

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);

  const [adjustProduct, setAdjustProduct] = useState(null);
  const adjustmentRef = useRef(null);
  const [adjustType, setAdjustType] = useState("Stock In");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const [historyMonth, setHistoryMonth] = useState("");
  const [historyDate, setHistoryDate] = useState("");
  const [historyType, setHistoryType] = useState("All");
  const [historySearch, setHistorySearch] = useState("");

  const canManage =
    currentUser?.role === "owner" ||
    currentUser?.role === "admin";

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [productData, movementData] = await Promise.all([
        request("/inventory"),
        request("/inventory/movements"),
      ]);

      setProducts(Array.isArray(productData) ? productData : []);
      setMovements(Array.isArray(movementData) ? movementData : []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      try {
        const session = await request("/auth/session");
        setCurrentUser(session?.user || null);
      } catch {
        setCurrentUser(null);
      }

      await loadData();
    }

    initialize();
  }, [loadData]);

  function openAddProduct() {
    setEditingProduct(null);
    setProductForm({ ...emptyProduct });
    setShowProductForm(true);
    setError("");
  }

  function openEditProduct(product) {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      category: product.category,
      stock: product.stock,
      alertLevel: product.alertLevel,
      price: product.price,
    });
    setShowProductForm(true);
    setError("");
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!canManage || busy) return;

    const payload = {
      name: productForm.name.trim(),
      category: productForm.category.trim(),
      stock: Number(productForm.stock),
      alertLevel: Number(productForm.alertLevel),
      price: Number(productForm.price),
    };

    if (
      !payload.name ||
      !payload.category ||
      !Number.isSafeInteger(payload.stock) ||
      payload.stock < 0 ||
      !Number.isSafeInteger(payload.alertLevel) ||
      payload.alertLevel < 0 ||
      !Number.isFinite(payload.price) ||
      payload.price < 0
    ) {
      setError("Please enter valid product details.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (editingProduct) {
        // Stock quantity must be changed through Stock In/Out,
        // not through the ordinary Edit form.
        payload.stock = Number(editingProduct.stock);

        await request(`/inventory/${editingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await request("/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setMessage(
        editingProduct
          ? "Product updated successfully."
          : "Product added successfully."
      );

      setShowProductForm(false);
      setEditingProduct(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product) {
    if (!canManage || busy) return;

    if (!window.confirm(`Delete "${product.name}"?`)) return;

    setBusy(true);
    setError("");

    try {
      await request(`/inventory/${product.id}`, {
        method: "DELETE",
      });

      setMessage("Product deleted successfully.");
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

 function openAdjustment(product, type = "Stock In") {
    setAdjustProduct(product);
    setAdjustType(type === "Damaged" ? "Damaged" : "Stock In");
    setQuantity("");
    setReason("");
    setError("");
    setMessage("");
}
useEffect(() => {
    if (!adjustProduct) return;

    adjustmentRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
    });
}, [adjustProduct]);

  async function submitAdjustment(event) {
    event.preventDefault();
    if (!adjustProduct || !canManage || busy) return;

    const amount = Number(quantity);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setError("Quantity must be a positive whole number.");
      return;
    }

    const quantityChange =
      adjustType === "Stock In" ? amount : -amount;

    if (
      Number(adjustProduct.stock) + quantityChange < 0
    ) {
      setError("Not enough stock available.");
      return;
    }

    const finalReason = `${adjustType}: ${reason.trim()}`;

    if (!reason.trim() || finalReason.length > 255) {
      setError("Please enter a reason (maximum 255 characters).");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(`/inventory/${adjustProduct.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity_change: quantityChange,
          reason: finalReason,
        }),
      });

      setMessage(`${adjustType} recorded successfully.`);
      setAdjustProduct(null);
      await loadData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filteredProducts = products.filter((product) => {
    const term = search.toLowerCase();

    const matchesSearch =
      product.name.toLowerCase().includes(term) ||
      product.category.toLowerCase().includes(term);

    const matchesStatus =
      stockFilter === "All" ||
      stockStatus(product) === stockFilter;

    return matchesSearch && matchesStatus;
  });

  // The database records movement timestamps.
  // Convert them into local date/month strings for filtering.
  function movementDate(value) {
    if (!value) return "";

    const text = String(value);

    // MySQL DATETIME returned as a date string.
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      return text.slice(0, 10);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function movementType(movement) {
    const reason = String(movement.reason || "").toLowerCase();
    const change = Number(movement.quantity_change);

    if (reason.startsWith("damaged:")) return "Damaged";
    if (reason.startsWith("stock in:")) return "Stock In";
    if (reason.startsWith("stock out:")) return "Stock Out";

    return change > 0 ? "Stock In" : "Stock Out";
  }

  const filteredMovements = movements.filter((movement) => {
    const date = movementDate(movement.recorded_at);
    const type = movementType(movement);

    const matchesMonth =
      !historyMonth || date.slice(0, 7) === historyMonth;

    const matchesDate =
      !historyDate || date === historyDate;

    const matchesType =
      historyType === "All" || type === historyType;

    const term = historySearch.toLowerCase();

    const matchesSearch =
      String(movement.item_name || "")
        .toLowerCase()
        .includes(term) ||
      String(movement.reason || "")
        .toLowerCase()
        .includes(term);

    return (
      matchesMonth &&
      matchesDate &&
      matchesType &&
      matchesSearch
    );
  });

  const totalQuantity = products.reduce(
    (sum, product) => sum + Number(product.stock || 0),
    0
  );

  const availableProducts = products.filter(
    (product) => Number(product.stock) > 0
  ).length;

  const needsAttention = products.filter(
    (product) =>
      Number(product.stock) <= Number(product.alertLevel)
  ).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-500">
            Sales & Inventory
          </p>
          <h1 className="text-3xl font-bold text-purple-950">
            Inventory Management
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage products, stock movements, and inventory history.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            className={buttonClass}
            onClick={loadData}
            disabled={busy || loading}
          >
            Refresh
          </button>

          {canManage && (
            <button
              className={buttonClass}
              onClick={openAddProduct}
              disabled={busy}
            >
              + Add Product
            </button>
          )}
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div role="status" className="rounded-xl bg-green-50 p-4 text-green-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Product Types", products.length],
          ["Available Products", availableProducts],
          ["Total Quantity Available", totalQuantity],
          ["Needs Attention", needsAttention],
        ].map(([label, value]) => (
          <div key={label} className={panelClass}>
            <p className="text-sm text-gray-500">{label}</p>
            <p className="mt-3 text-3xl font-bold text-purple-800">
              {value}
            </p>
          </div>
        ))}
      </div>

      {showProductForm && canManage && (
        <section className={panelClass}>
          <h2 className="mb-4 text-xl font-bold text-purple-950">
            {editingProduct ? "Edit Product" : "Add Product"}
          </h2>

          <form onSubmit={saveProduct} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["name", "Product Name", "text"],
                ["category", "Category", "text"],
                ["alertLevel", "Reorder Level", "number"],
                ["price", "Selling Price", "number"],
                ...(!editingProduct
                  ? [["stock", "Initial Stock", "number"]]
                  : []),
              ].map(([name, label, type]) => (
                <label key={name} className="block">
                  <span className="mb-2 block text-sm font-medium">
                    {label}
                  </span>
                  <input
                    className={inputClass}
                    type={type}
                    min={type === "number" ? "0" : undefined}
                    step={name === "price" ? "0.01" : "1"}
                    required
                    value={productForm[name]}
                    onChange={(event) =>
                      setProductForm((previous) => ({
                        ...previous,
                        [name]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>

            {editingProduct && (
              <p className="text-sm text-gray-500">
                To change the stock quantity, use Stock In/Out.
                This keeps a movement history.
              </p>
            )}

            <div className="flex gap-2">
              <button className={buttonClass} disabled={busy}>
                Save Product
              </button>
              <button
                type="button"
                onClick={() => setShowProductForm(false)}
                className="rounded-xl border px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={panelClass}>
        <h2 className="mb-4 text-xl font-bold text-purple-950">
          Product List
        </h2>

        <div className="mb-4 flex flex-wrap gap-3">
          <input
            className={`${inputClass} max-w-sm`}
            placeholder="Search product or category..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className={`${inputClass} max-w-xs`}
            value={stockFilter}
            onChange={(event) => setStockFilter(event.target.value)}
          >
            <option value="All">All Stock Levels</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-purple-50 text-purple-950">
              <tr>
                <th className="p-3">Product</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">Reorder Level</th>
                <th className="p-3">Price</th>
                <th className="p-3">Status</th>
                {canManage && <th className="p-3">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-b">
                  <td className="p-3">
                    <p className="font-semibold">{product.name}</p>
                    <p className="text-xs text-gray-500">
                      {product.category}
                    </p>
                  </td>
                  <td className="p-3">{product.stock}</td>
                  <td className="p-3">{product.alertLevel}</td>
                  <td className="p-3">{money(product.price)}</td>
                  <td className="p-3">
                    {stockStatus(product)}
                  </td>

                  {canManage && (
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-green-50 px-3 py-2 text-green-700"
                          disabled={busy}
                          onClick={() =>
                            openAdjustment(product, "Stock In")
                          }
                        >
                          Stock +/−
                        </button>

                        <button
                          className="rounded-lg bg-purple-50 px-3 py-2 text-purple-700"
                          disabled={busy}
                          onClick={() => openEditProduct(product)}
                        >
                          Edit
                        </button>

                        <button
                          className="rounded-lg px-3 py-2 text-red-600"
                          disabled={busy}
                          onClick={() => deleteProduct(product)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {!loading && filteredProducts.length === 0 && (
            <p className="p-6 text-center text-gray-500">
              No products found.
            </p>
          )}
        </div>
      </section>

      {adjustProduct && canManage && (
    <section
        ref={adjustmentRef}
        className={`${panelClass} scroll-mt-6`}
    >
          <h2 className="text-xl font-bold text-purple-950">
            Stock Adjustment
          </h2>

          <p className="mb-4 mt-2 text-sm text-gray-500">
            Product: <strong>{adjustProduct.name}</strong>
            {" · "}
            Current Stock: <strong>{adjustProduct.stock}</strong>
          </p>

          <form onSubmit={submitAdjustment} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Movement Type
              </span>

              <select
                className={inputClass}
                value={adjustType}
                onChange={(event) =>
            setAdjustType(event.target.value)
        }
>           <option>Stock In</option>
            <option>Damaged</option>
            </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Quantity
              </span>
              <input
                type="number"
                min="1"
                step="1"
                required
                className={inputClass}
                value={quantity}
                onChange={(event) =>
                  setQuantity(event.target.value)
                }
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Reason / Notes
              </span>
              <textarea
                required
                maxLength={240}
                className={inputClass}
                rows={3}
                placeholder={
                  adjustType === "Stock In"
                    ? "e.g. New delivery from supplier"
                    : adjustType === "Damaged"
                    ? "e.g. Bottle leaked during storage"
                    : "e.g. Used for salon service"
                }
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value)
                }
              />
            </label>

            <div className="flex gap-2">
              <button className={buttonClass} disabled={busy}>
                {busy ? "Saving..." : "Save Movement"}
              </button>

              <button
                type="button"
                className="rounded-xl border px-4 py-2"
                onClick={() => setAdjustProduct(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className={panelClass}>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-purple-950">
            Inventory Movement History
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Review stock additions, deductions, and damaged items.
          </p>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-4">
          <label>
            <span className="mb-1 block text-sm">Month</span>
            <input
              type="month"
              className={inputClass}
              value={historyMonth}
              onChange={(event) =>
                setHistoryMonth(event.target.value)
              }
            />
          </label>

          <label>
            <span className="mb-1 block text-sm">Exact Date</span>
            <input
              type="date"
              className={inputClass}
              value={historyDate}
              onChange={(event) =>
                setHistoryDate(event.target.value)
              }
            />
          </label>

          <label>
            <span className="mb-1 block text-sm">Movement Type</span>
            <select
              className={inputClass}
              value={historyType}
              onChange={(event) =>
                setHistoryType(event.target.value)
              }
            >
              <option>All</option>
              <option>Stock In</option>
              <option>Stock Out</option>
              <option>Damaged</option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm">Search</span>
            <input
              className={inputClass}
              placeholder="Product or reason"
              value={historySearch}
              onChange={(event) =>
                setHistorySearch(event.target.value)
              }
            />
          </label>
        </div>

        <button
          className="mb-4 rounded-xl border px-4 py-2 text-sm"
          onClick={() => {
            setHistoryMonth("");
            setHistoryDate("");
            setHistoryType("All");
            setHistorySearch("");
          }}
        >
          Clear Filters
        </button>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[750px] text-left text-sm">
            <thead className="bg-purple-50 text-purple-950">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Product</th>
                <th className="p-3">Movement</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">Reason</th>
              </tr>
            </thead>

            <tbody>
              {filteredMovements.map((movement) => {
                const change = Number(movement.quantity_change);
                const type = movementType(movement);

                return (
                  <tr
                    key={movement.movement_id}
                    className="border-b"
                  >
                    <td className="p-3">
                      {movementDate(movement.recorded_at)}
                    </td>

                    <td className="p-3 font-medium">
                      {movement.item_name}
                    </td>

                    <td className="p-3">
                      <span
                        className={
                          type === "Stock In"
                            ? "font-semibold text-green-700"
                            : type === "Damaged"
                            ? "font-semibold text-red-600"
                            : "font-semibold text-amber-700"
                        }
                      >
                        {type}
                      </span>
                    </td>

                    <td className="p-3 font-semibold">
                      {change > 0 ? "+" : ""}
                      {change}
                    </td>

                    <td className="p-3">
                      {movement.reason}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading && filteredMovements.length === 0 && (
            <p className="p-6 text-center text-gray-500">
              No inventory movements match your filters.
            </p>
          )}
        </div>

        <p className="mt-4 text-xs text-gray-500">
          Showing {filteredMovements.length} of {movements.length}
          {" "}movement records.
        </p>
      </section>
    </div>
  );
}

export default AdminInventory;
