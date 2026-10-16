
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, apiFetch } from "../lib/sessionApi";

const inputClass =
  "w-full rounded-xl border border-purple-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100";

const buttonClass =
  "rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-500 disabled:cursor-not-allowed disabled:opacity-50";

const secondaryButtonClass =
  "rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50";

const panelClass =
  "rounded-2xl border border-purple-100 bg-white p-5 shadow-sm sm:p-6";

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

function normalizeCategories(data) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.categories)
    ? data.categories
    : [];

  return rows
    .map((category) => ({
      category_id: Number(
        category.category_id ?? category.id
      ),
      name: String(category.name || "").trim(),
      product_count: Number(
        category.product_count ?? category.productCount ?? 0
      ),
    }))
    .filter(
      (category) =>
        Number.isSafeInteger(category.category_id) &&
        category.category_id > 0 &&
        category.name
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

function movementDate(value) {
  if (!value) return "";

  const text = String(value);

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

  if (reason.startsWith("return to supplier:")) {
    return "Return to Supplier";
  }

  if (reason.startsWith("adjustment:")) {
    return "Adjustment";
  }

  if (reason.startsWith("stock in:")) return "Stock In";
  if (reason.startsWith("stock out:")) return "Stock Out";

  return change > 0 ? "Stock In" : "Stock Out";
}

const statusBadgeClass = (status) =>
  status === "In Stock"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : status === "Low Stock"
    ? "bg-amber-50 text-amber-700 ring-amber-100"
    : "bg-rose-50 text-rose-700 ring-rose-100";

const movementBadgeClass = (type) =>
  type === "Stock In"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
    : type === "Damaged" || type === "Return to Supplier"
    ? "bg-rose-50 text-rose-700 ring-rose-100"
    : type === "Adjustment"
    ? "bg-purple-50 text-purple-700 ring-purple-100"
    : "bg-amber-50 text-amber-700 ring-amber-100";

function AdminInventory() {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);

  const productFormRef = useRef(null);

  const [showCategories, setShowCategories] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryName, setCategoryName] = useState("");

  const categoriesRef = useRef(null);

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

      const [productData, movementData, categoryData] =
        await Promise.all([
          request("/inventory"),
          request("/inventory/movements"),
          request("/inventory/categories"),
        ]);

      setProducts(
        Array.isArray(productData) ? productData : []
      );

      setMovements(
        Array.isArray(movementData) ? movementData : []
      );

      setCategories(normalizeCategories(categoryData));
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

  useEffect(() => {
    if (!showProductForm) return;

    productFormRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [showProductForm, editingProduct]);

  useEffect(() => {
    if (!showCategories) return;

    categoriesRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [showCategories]);

  useEffect(() => {
    if (!adjustProduct) return;

    adjustmentRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [adjustProduct]);

  function openAddProduct() {
    setEditingProduct(null);
    setProductForm({ ...emptyProduct });
    setShowProductForm(true);
    setShowCategories(false);
    setAdjustProduct(null);
    setError("");
    setMessage("");
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
    setShowCategories(false);
    setAdjustProduct(null);
    setError("");
    setMessage("");
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

    const categoryExists = categories.some(
      (category) => category.name === payload.category
    );

    if (!categoryExists) {
      setError("Please select a valid inventory category.");
      return;
    }

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
        // Stock quantity changes are recorded separately.
        payload.stock = Number(editingProduct.stock);

        await request(`/inventory/${editingProduct.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      } else {
        await request("/inventory", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      }

      setShowProductForm(false);
      setEditingProduct(null);

      await loadData();

      setMessage(
        editingProduct
          ? "Product updated successfully."
          : "Product added successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product) {
    if (!canManage || busy) return;

    if (!window.confirm(`Delete "${product.name}"?`)) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(`/inventory/${product.id}`, {
        method: "DELETE",
      });

      await loadData();
      setMessage("Product deleted successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openCategoryManager() {
    setShowCategories(true);
    setShowProductForm(false);
    setAdjustProduct(null);
    setEditingCategory(null);
    setCategoryName("");
    setError("");
    setMessage("");
  }

  function closeCategoryManager() {
    setShowCategories(false);
    setEditingCategory(null);
    setCategoryName("");
    setError("");
  }

  function startEditCategory(category) {
    setEditingCategory(category);
    setCategoryName(category.name);
    setError("");
    setMessage("");

    categoriesRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function cancelCategoryEdit() {
    setEditingCategory(null);
    setCategoryName("");
    setError("");
  }

  async function saveCategory(event) {
    event.preventDefault();

    if (!canManage || busy) return;

    const name = categoryName.trim();

    if (!name || name.length > 100) {
      setError(
        "Category name is required (maximum 100 characters)."
      );
      return;
    }

    const duplicate = categories.some(
      (category) =>
        category.name.toLowerCase() === name.toLowerCase() &&
        category.category_id !== editingCategory?.category_id
    );

    if (duplicate) {
      setError("This category already exists.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    const wasEditing = Boolean(editingCategory);

    try {
      if (editingCategory) {
        await request(
          `/inventory/categories/${editingCategory.category_id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name }),
          }
        );
      } else {
        await request("/inventory/categories", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ name }),
        });
      }

      setEditingCategory(null);
      setCategoryName("");

      await loadData();

      setMessage(
        wasEditing
          ? "Category updated successfully."
          : "Category added successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(category) {
    if (!canManage || busy) return;

    // Recalculate usage from loaded products as a UI safeguard.
    // The backend must also enforce this rule.
    const actualUsage = products.filter(
      (product) =>
        String(product.category || "").trim().toLowerCase() ===
        category.name.toLowerCase()
    ).length;

    if (actualUsage > 0 || category.product_count > 0) {
      setError(
        `Cannot delete "${category.name}" because it is assigned to products. Reassign those products first.`
      );
      return;
    }

    if (
      !window.confirm(
        `Delete inventory category "${category.name}"?`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(
        `/inventory/categories/${category.category_id}`,
        {
          method: "DELETE",
        }
      );

      await loadData();
      setMessage("Category deleted successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openAdjustment(product, type = "Stock In") {
    setAdjustProduct(product);

    setAdjustType(
      ["Stock In", "Damaged", "Return to Supplier", "Adjustment"].includes(type)
        ? type
        : "Stock In"
    );

    setQuantity("");
    setReason("");
    setShowProductForm(false);
    setShowCategories(false);
    setError("");
    setMessage("");
  }

  async function submitAdjustment(event) {
    event.preventDefault();

    if (!adjustProduct || !canManage || busy) return;

    const amount = Number(quantity);
    const isCorrection = adjustType === "Adjustment";
    if (
      !Number.isSafeInteger(amount) ||
      (isCorrection ? amount < 0 : amount <= 0)
    ) {
      setError(isCorrection
        ? "Enter a valid non-negative final stock quantity."
        : "Quantity must be a positive whole number.");
      return;
    }

    const quantityChange = isCorrection
      ? amount - Number(adjustProduct.stock)
      : adjustType === "Stock In" ? amount : -amount;

    if (quantityChange === 0) {
      setError("Stock is already at that quantity. No adjustment needed.");
      return;
    }
    if (Number(adjustProduct.stock) + quantityChange < 0) {
      setError("Not enough stock available.");
      return;
    }

    const finalReason = `${adjustType}: ${reason.trim()}`;

    if (!reason.trim() || finalReason.length > 255) {
      setError(
        "Please enter a reason (maximum 255 characters)."
      );
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(
        `/inventory/${adjustProduct.id}/adjust`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            quantity_change: quantityChange,
            reason: finalReason,
          }),
        }
      );

      setAdjustProduct(null);
      await loadData();

      setMessage(
        `${adjustType} recorded successfully.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const enteredQuantity = quantity.trim() === "" ? null : Number(quantity);
  const previewChange = !adjustProduct || enteredQuantity === null ||
    !Number.isSafeInteger(enteredQuantity) || enteredQuantity < 0
    ? null
    : adjustType === "Adjustment"
    ? enteredQuantity - Number(adjustProduct.stock)
    : adjustType === "Stock In"
    ? enteredQuantity
    : -enteredQuantity;
  const previewStock = previewChange === null
    ? null
    : Number(adjustProduct.stock) + previewChange;

  const filteredProducts = products.filter((product) => {
    const term = search.trim().toLowerCase();

    const matchesSearch =
      String(product.name || "")
        .toLowerCase()
        .includes(term) ||
      String(product.category || "")
        .toLowerCase()
        .includes(term);

    const matchesStatus =
      stockFilter === "All" ||
      stockStatus(product) === stockFilter;

    const matchesCategory =
      categoryFilter === "All" ||
      product.category === categoryFilter;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesCategory
    );
  });

  const filteredMovements = movements.filter((movement) => {
    const date = movementDate(movement.recorded_at);
    const type = movementType(movement);

    const matchesMonth =
      !historyMonth ||
      date.slice(0, 7) === historyMonth;

    const matchesDate =
      !historyDate ||
      date === historyDate;

    const matchesType =
      historyType === "All" ||
      type === historyType;

    const term = historySearch.trim().toLowerCase();

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
    (sum, product) =>
      sum + Number(product.stock || 0),
    0
  );

  const availableProducts = products.filter(
    (product) => Number(product.stock) > 0
  ).length;

  const needsAttention = products.filter(
    (product) =>
      Number(product.stock) <=
      Number(product.alertLevel)
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
            Manage products, categories, stock movements,
            and inventory history.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryButtonClass}
            onClick={loadData}
            disabled={busy || loading}
          >
            Refresh
          </button>

          {canManage && (
            <>
              <button
                className={secondaryButtonClass}
                onClick={openCategoryManager}
                disabled={busy}
              >
                Manage Categories
              </button>

              <button
                className={buttonClass}
                onClick={openAddProduct}
                disabled={busy}
              >
                + Add Product
              </button>
            </>
          )}
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          role="status"
          className="rounded-xl bg-green-50 p-4 text-sm text-green-700"
        >
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Product Types", products.length, "Products registered", "text-purple-800", "bg-purple-50"],
          ["Available Products", availableProducts, "With stock on hand", "text-emerald-700", "bg-emerald-50"],
          ["Total Quantity Available", totalQuantity, "Units across all products", "text-purple-800", "bg-purple-50"],
          ["Needs Attention", needsAttention, "Low or out of stock", "text-amber-700", "bg-amber-50"],
        ].map(([label, value, detail, color, background]) => (
          <div key={label} className={`${panelClass} relative overflow-hidden`}>
            <span
              className={`absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-xl ${background} ${color}`}
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {label === "Product Types" && (
                  <>
                    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
                    <path d="M3 8v9l9 5 9-5V8" />
                    <path d="M12 13v9" />
                  </>
                )}
                {label === "Available Products" && (
                  <>
                    <path d="m12 3 9 5-9 5-9-5 9-5Z" />
                    <path d="M3 8v9l9 5 5-2.8" />
                    <path d="M12 13v9" />
                    <path d="m16 17 2 2 4-4" />
                  </>
                )}
                {label === "Total Quantity Available" && (
                  <>
                    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
                    <path d="m3 12 9 5 9-5" />
                    <path d="m3 17 9 5 9-5" />
                  </>
                )}
                {label === "Needs Attention" && (
                  <>
                    <path d="M10.3 3.8 1.8 18.5A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.5L13.7 3.8a2 2 0 0 0-3.4 0Z" />
                    <path d="M12 9v5" />
                    <path d="M12 18h.01" />
                  </>
                )}
              </svg>
            </span>
            <p className="relative text-sm font-medium text-slate-500">{label}</p>
            <p className={`relative mt-3 text-3xl font-bold ${color}`}>{value}</p>
            <p className="relative mt-2 text-xs text-slate-400">{detail}</p>
          </div>
        ))}
      </div>

      {/* CATEGORY MANAGEMENT */}
      {showCategories && canManage && (
        <section
          ref={categoriesRef}
          className={`${panelClass} scroll-mt-6`}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-purple-950">
                Manage Inventory Categories
              </h2>

              <p className="mt-1 text-sm text-gray-500">
                Create, rename, and delete categories used
                by inventory products.
              </p>
            </div>

            <button
              type="button"
              className={secondaryButtonClass}
              onClick={closeCategoryManager}
              disabled={busy}
            >
              Back to Product List
            </button>
          </div>

          <form
            onSubmit={saveCategory}
            className="mb-6 rounded-xl bg-purple-50 p-4"
          >
            <h3 className="mb-3 font-semibold text-purple-950">
              {editingCategory
                ? "Edit Category"
                : "Add New Category"}
            </h3>

            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[220px] flex-1">
                <span className="mb-2 block text-sm font-medium">
                  Category Name
                </span>

                <input
                  className={inputClass}
                  type="text"
                  maxLength={100}
                  required
                  placeholder="e.g. Hair Care"
                  value={categoryName}
                  onChange={(event) =>
                    setCategoryName(event.target.value)
                  }
                />
              </label>

              <button
                type="submit"
                className={buttonClass}
                disabled={busy}
              >
                {busy
                  ? "Saving..."
                  : editingCategory
                  ? "Save Changes"
                  : "+ Add Category"}
              </button>

              {editingCategory && (
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={cancelCategoryEdit}
                  disabled={busy}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[550px] text-left text-sm">
              <thead className="bg-purple-50 text-purple-950">
                <tr>
                  <th className="p-3">Category Name</th>
                  <th className="p-3">Products</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {categories.map((category) => {
                  const count = products.filter(
                    (product) =>
                      String(product.category || "")
                        .trim()
                        .toLowerCase() ===
                      category.name.toLowerCase()
                  ).length;

                  return (
                    <tr
                      key={category.category_id}
                      className="border-b"
                    >
                      <td className="p-3 font-semibold">
                        {category.name}
                      </td>

                      <td className="p-3">
                        {Math.max(
                          count,
                          category.product_count
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100"
                            onClick={() =>
                              startEditCategory(category)
                            }
                            disabled={busy}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="rounded-lg bg-red-50 px-3 py-2 text-red-600 disabled:opacity-40"
                            onClick={() =>
                              deleteCategory(category)
                            }
                            disabled={
                              busy ||
                              count > 0 ||
                              category.product_count > 0
                            }
                            title={
                              count > 0 ||
                              category.product_count > 0
                                ? "Reassign products before deleting this category."
                                : "Delete category"
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!loading && categories.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-500">
                No inventory categories found.
              </p>
            )}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            Categories assigned to products cannot be
            deleted until those products are reassigned.
          </p>
        </section>
      )}

      {/* ADD / EDIT PRODUCT */}
      {showProductForm && canManage && (
        <section
          ref={productFormRef}
          className={`${panelClass} scroll-mt-6`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-purple-950">
              {editingProduct
                ? "Edit Product"
                : "Add Product"}
            </h2>

            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => {
                setShowProductForm(false);
                setEditingProduct(null);
                setError("");
              }}
              disabled={busy}
            >
              Back to Product List
            </button>
          </div>

          <form
            onSubmit={saveProduct}
            className="space-y-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Product Name
                </span>

                <input
                  className={inputClass}
                  type="text"
                  required
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Category
                </span>

                <select
                  className={inputClass}
                  required
                  value={productForm.category}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      category: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    Select category
                  </option>

                  {categories.map((category) => (
                    <option
                      key={category.category_id}
                      value={category.name}
                    >
                      {category.name}
                    </option>
                  ))}
                </select>

                {categories.length === 0 && (
                  <p className="mt-2 text-xs text-red-600">
                    No categories available. Create a
                    category first.
                  </p>
                )}
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Reorder Level
                </span>

                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={productForm.alertLevel}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      alertLevel: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium">
                  Selling Price
                </span>

                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={productForm.price}
                  onChange={(event) =>
                    setProductForm((previous) => ({
                      ...previous,
                      price: event.target.value,
                    }))
                  }
                />
              </label>

              {!editingProduct && (
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    Initial Stock
                  </span>

                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={productForm.stock}
                    onChange={(event) =>
                      setProductForm((previous) => ({
                        ...previous,
                        stock: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
            </div>

            {editingProduct && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-500">
                  To correct the quantity, use an audited stock adjustment with a reason.
                </p>
                <button type="button" className={secondaryButtonClass}
                  onClick={() => openAdjustment(editingProduct, "Adjustment")}
                  disabled={busy}>
                  Correct Stock Quantity
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={buttonClass}
                disabled={busy || categories.length === 0}
              >
                {busy ? "Saving..." : "Save Product"}
              </button>

              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => {
                  setShowProductForm(false);
                  setEditingProduct(null);
                }}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* PRODUCT LIST */}
      <section className={panelClass}>
        <div className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-purple-950">Product List</h2>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
              {products.length} total products
            </span>
          </div>

          <p className="mt-1 text-sm text-gray-500">
            {filteredProducts.length} of {products.length} products
          </p>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <input
            className={inputClass}
            placeholder="Search product or category..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />

          <select
            className={inputClass}
            value={categoryFilter}
            onChange={(event) =>
              setCategoryFilter(event.target.value)
            }
          >
            <option value="All">All Categories</option>

            {categories.map((category) => (
              <option
                key={category.category_id}
                value={category.name}
              >
                {category.name}
              </option>
            ))}
          </select>

          <select
            className={inputClass}
            value={stockFilter}
            onChange={(event) =>
              setStockFilter(event.target.value)
            }
          >
            <option value="All">All Stock Levels</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">
              Out of Stock
            </option>
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
                {canManage && (
                  <th className="p-3">Actions</th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product.id}
                  className="border-b"
                >
                  <td className="p-3">
                    <p className="font-semibold text-slate-800">
                      {product.name}
                    </p>

                    <p className="text-xs text-gray-500">
                      {product.category}
                    </p>
                  </td>

                  <td className="p-3 font-semibold tabular-nums text-slate-800">
                    {product.stock}
                  </td>

                  <td className="p-3">
                    {product.alertLevel}
                  </td>

                  <td className="p-3">
                    {money(product.price)}
                  </td>

                  <td className="p-3">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusBadgeClass(stockStatus(product))}`}>
                      {stockStatus(product)}
                    </span>
                  </td>

                  {canManage && (
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                          disabled={busy}
                          onClick={() =>
                            openAdjustment(
                              product,
                              "Stock In"
                            )
                          }
                        >
                          Stock Movement
                        </button>

                        <button
                          type="button"
                          className="rounded-lg bg-purple-50 px-3 py-2 text-purple-700"
                          disabled={busy}
                          onClick={() =>
                            openEditProduct(product)
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100"
                          disabled={busy}
                          onClick={() =>
                            deleteProduct(product)
                          }
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

      {/* STOCK MOVEMENT FORM */}
      {adjustProduct && canManage && (
        <section
          ref={adjustmentRef}
          className={`${panelClass} scroll-mt-6`}
        >
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-purple-500">Inventory action</p>
              <h2 className="mt-1 text-xl font-bold text-purple-950">Record Stock Movement</h2>
              <p className="mt-1 text-sm text-slate-500">Every saved change is recorded in movement history.</p>
            </div>
            <button type="button" className={secondaryButtonClass} onClick={() => setAdjustProduct(null)} disabled={busy}>
              Back to Product List
            </button>
          </div>

          <div className="mb-5 grid gap-3 rounded-2xl border border-purple-100 bg-purple-50/60 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Selected product</p>
              <p className="mt-1 font-semibold text-purple-950">{adjustProduct.name}</p>
              <p className="text-xs text-slate-500">{adjustProduct.category}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">Current stock</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-purple-900">{adjustProduct.stock} <span className="text-xs font-medium text-slate-500">units</span></p>
            </div>
          </div>

          <form
            onSubmit={submitAdjustment}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">
                Movement Type
              </span>

              <select
                className={inputClass}
                value={adjustType}
                onChange={(event) =>
                  setAdjustType(event.target.value)
                }
              >
                <option value="Stock In">
                  Stock In
                </option>

                <option value="Damaged">Damaged</option>
                <option value="Return to Supplier">Return to Supplier</option>
                <option value="Adjustment">Adjustment (Correct Stock Count)</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {adjustType === "Adjustment"
                  ? "Enter the actual counted stock. The system calculates the difference."
                  : adjustType === "Stock In"
                  ? "Adds received units to the current stock."
                  : "Deducts units from the current stock."}
              </p>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                {adjustType === "Adjustment" ? "Corrected Final Stock" : "Quantity"}
              </span>

              <input
                className={inputClass}
                type="number"
                min={adjustType === "Adjustment" ? "0" : "1"}
                step="1"
                required
                value={quantity}
                onChange={(event) =>
                  setQuantity(event.target.value)
                }
              />
            </label>

            {previewChange !== null && (
              <div className={`rounded-2xl border p-4 ${previewStock < 0 ? "border-rose-200 bg-rose-50" : "border-purple-100 bg-purple-50/60"}`}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-purple-600">Stock change preview</p>
                <div className="grid grid-cols-3 items-center gap-3 text-center">
                  <div><p className="text-xs text-slate-500">Current</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-800">{adjustProduct.stock}</p></div>
                  <div><p className="text-xs text-slate-500">Change</p><p className={`mt-1 text-xl font-bold tabular-nums ${previewChange > 0 ? "text-emerald-700" : previewChange < 0 ? "text-rose-600" : "text-slate-700"}`}>{previewChange > 0 ? "+" : ""}{previewChange}</p></div>
                  <div><p className="text-xs text-slate-500">New stock</p><p className={`mt-1 text-xl font-bold tabular-nums ${previewStock < 0 ? "text-rose-600" : "text-purple-800"}`}>{previewStock}</p></div>
                </div>
                {previewStock < 0 && <p className="mt-3 text-sm text-rose-700">Not enough stock for this movement.</p>}
              </div>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                Reason / Notes
              </span>

              <textarea
                className={inputClass}
                required
                maxLength={240}
                rows={3}
                placeholder={
                  adjustType === "Stock In"
                    ? "e.g. New delivery from supplier"
                    : adjustType === "Damaged"
                    ? "e.g. Bottle leaked during storage"
                    : adjustType === "Return to Supplier"
                    ? "e.g. Expired batch returned to supplier, reference #..."
                    : "e.g. Physical count found 18 units; corrected from 20"
                }
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value)
                }
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={buttonClass}
                disabled={busy || previewStock === null || previewStock < 0 || previewChange === 0}
              >
                {busy ? "Saving..." : "Save Movement"}
              </button>

              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() =>
                  setAdjustProduct(null)
                }
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* INVENTORY MOVEMENT HISTORY */}
      <section className={panelClass}>
        <div className="mb-4">
          <h2 className="text-xl font-bold text-purple-950">
            Inventory Movement History
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Audit stock changes, corrections, returns, and who recorded each movement.
          </p>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-purple-100 bg-purple-50/40 p-4 md:grid-cols-2 xl:grid-cols-4">
          <label>
            <span className="mb-1 block text-sm">
              Month
            </span>

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
            <span className="mb-1 block text-sm">
              Exact Date
            </span>

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
            <span className="mb-1 block text-sm">
              Movement Type
            </span>

            <select
              className={inputClass}
              value={historyType}
              onChange={(event) =>
                setHistoryType(event.target.value)
              }
            >
              <option value="All">All</option>
              <option value="Stock In">
                Stock In
              </option>
              <option value="Stock Out">
                Stock Out
              </option>
              <option value="Damaged">
                Damaged
              </option>
              <option value="Return to Supplier">
                Return to Supplier
              </option>
              <option value="Adjustment">
                Adjustment
              </option>
            </select>
          </label>

          <label>
            <span className="mb-1 block text-sm">
              Search
            </span>

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
          type="button"
          className="mb-4 rounded-xl border border-purple-200 bg-white px-4 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-50"
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
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-purple-50 text-purple-950">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Product</th>
                <th className="p-3">Movement</th>
                <th className="p-3">Quantity</th>
                <th className="p-3">Reason</th>
                <th className="p-3">Performed By</th>
              </tr>
            </thead>

            <tbody>
              {filteredMovements.map((movement) => {
                const change = Number(
                  movement.quantity_change
                );

                const type = movementType(movement);

                return (
                  <tr
                    key={movement.movement_id}
                    className="border-b"
                  >
                    <td className="p-3">
                      {movementDate(
                        movement.recorded_at
                      )}
                    </td>

                    <td className="p-3 font-medium">
                      {movement.item_name}
                    </td>

                    <td className="p-3">
                      <span className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ring-1 ${movementBadgeClass(type)}`}>
                        {type}
                      </span>
                    </td>

                    <td className={`p-3 font-bold tabular-nums ${change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-600" : "text-slate-700"}`}>
                      {change > 0 ? "+" : ""}{change}
                    </td>

                    <td className="max-w-[340px] break-words p-3 text-slate-600" title={movement.reason}>{movement.reason}</td>
                    <td className="p-3"><span className="inline-flex rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">{movement.performed_by_name || "Not recorded"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!loading &&
            filteredMovements.length === 0 && (
              <p className="p-6 text-center text-gray-500">
                No inventory movements match your filters.
              </p>
            )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>Showing <strong className="text-purple-800">{filteredMovements.length}</strong> of {movements.length} movement records.</p>
          <p>Inventory changes are recorded for audit purposes.</p>
        </div>
      </section>
    </div>
  );
}

export default AdminInventory;
