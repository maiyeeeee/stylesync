
import {
    useCallback,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from "react"
import { API_URL, apiFetch } from "../lib/sessionApi"
import { getEmergencyRecord, reconcileEmergencySale } from "../lib/offlineDb"

const panel =
    "rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6"

const input =
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"

const button =
    "rounded-xl bg-purple-700 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"

const money = (value) =>
    Number(value || 0).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
    })

const toCents = (value) =>
    Math.round(Number(value || 0) * 100)

function dateLabel(value, dateOnly = false) {
    const date = new Date(value)

    if (!value || Number.isNaN(date.getTime())) {
        return "Date unavailable"
    }

    return date.toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        dateStyle: "medium",
        ...(dateOnly ? {} : { timeStyle: "short" }),
    })
}

function philippineDate() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date())

    const part = (type) =>
        parts.find((item) => item.type === type)?.value

    return `${part("year")}-${part("month")}-${part("day")}`
}


function dayKey(value) {
    if (!value) return ""

    // API transaction timestamps are UTC without a timezone suffix.
    // Interpret them as UTC before converting to Philippine time.
    let date

    if (value instanceof Date) {
        date = value
    } else {
        const raw = String(value).trim()
        const normalized = raw.replace(" ", "T")

        const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)

        date = new Date(
            hasTimezone ? normalized : `${normalized}Z`
        )
    }

    if (Number.isNaN(date.getTime())) {
        return ""
    }

    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date)
}


async function request(path, options) {
    const response = await apiFetch(
        `${API_URL}${path}`,
        options,
    )

    const data = await response
        .json()
        .catch(() => null)

    if (!response.ok) {
        throw new Error(
            data?.error || "Request failed.",
        )
    }

    return data
}

const OFFLINE_CACHE_KEY =
    "stylesync-pos-cache-v1"

const OFFLINE_QUEUE_KEY =
    "stylesync-pos-queue-v1"

function readLocal(key, fallback) {
    try {
        const raw = localStorage.getItem(key)

        return raw
            ? JSON.parse(raw)
            : fallback
    } catch {
        return fallback
    }
}

function writeLocal(key, value) {
    try {
        localStorage.setItem(
            key,
            JSON.stringify(value),
        )
    } catch {
        // Ignore local storage failures.
    }
}

function getOfflineQueue() {
    const queue = readLocal(
        OFFLINE_QUEUE_KEY,
        [],
    )

    return Array.isArray(queue)
        ? queue
        : []
}

function saveOfflineQueue(queue) {
    writeLocal(
        OFFLINE_QUEUE_KEY,
        queue,
    )
}

function pendingRow(entry) {
    const payload = entry.payload

    const amount = Number(
        payload.amount || 0,
    )

    const deposit = Number(
        payload.expected_deposit_amount || 0,
    )

    return {
        transaction_id:
            `offline-${entry.offline_id}`,

        appointment_id:
            payload.appointment_id,

        customer:
            payload.customer,

        customer_contact:
            payload.customer_contact || "",

        customer_email: "",

        service:
            payload.service,

        sale_type:
            payload.sale_type,

        item_id:
            payload.item_id,

        quantity:
            payload.quantity,

        amount:
            amount.toFixed(2),

        payment:
            payload.payment,

        deposit_applied:
            deposit.toFixed(2),

        balance_collected:
            Math.max(
                0,
                amount - deposit,
            ).toFixed(2),

        deposit_payment_method: null,

        status: "Paid",

        offline_pending: true,

        historical_date_only:
            Boolean(payload.historical_date),
        transaction_date:
            payload.historical_date
                ? `${payload.historical_date}T12:00:00+08:00`
                : new Date().toISOString(),
    }
}

function applyQueuedProductStock(
    products,
    queue,
) {
    const reserved = new Map()

    for (const entry of queue) {
        const payload = entry.payload

        if (
            payload.sale_type !== "Product" ||
            !payload.item_id
        ) {
            continue
        }

        const id = String(
            payload.item_id,
        )

        reserved.set(
            id,
            (reserved.get(id) || 0) +
                Number(payload.quantity || 1),
        )
    }

    return products.map((product) => {
        const used =
            reserved.get(
                String(product.id),
            ) || 0

        return {
            ...product,

            stock: Math.max(
                0,
                Number(product.stock || 0) -
                    used,
            ),
        }
    })
}

function Field({ label, children }) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">
                {label}
            </span>

            {children}
        </label>
    )
}

function SearchSelect({
    label,
    options,
    value,
    onChange,
    disabled,
}) {
    const id = useId()

    const [query, setQuery] =
        useState("")

    const [open, setOpen] =
        useState(false)

    const [active, setActive] =
        useState(0)

    const selected = options.find(
        (option) =>
            option.value === value,
    )

    const matches = options.filter(
        (option) =>
            option.label
                .toLowerCase()
                .includes(
                    query
                        .trim()
                        .toLowerCase(),
                ),
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
                if (
                    !event.currentTarget.contains(
                        event.relatedTarget,
                    )
                ) {
                    setOpen(false)
                }
            }}
        >
            <label
                htmlFor={id}
                className="mb-2 block text-sm font-medium text-gray-700"
            >
                {label}
            </label>

            <input
                id={id}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={open}
                aria-controls={`${id}-list`}
                aria-activedescendant={
                    open && matches[active]
                        ? `${id}-${active}`
                        : undefined
                }
                autoComplete="off"
                disabled={disabled}
                value={
                    open
                        ? query
                        : selected?.label || ""
                }
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

                    if (value) {
                        onChange("")
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === "Escape") {
                        setOpen(false)
                    }

                    if (event.key === "ArrowDown") {
                        event.preventDefault()
                        setOpen(true)

                        setActive((previous) =>
                            Math.min(
                                previous + 1,
                                Math.max(
                                    0,
                                    matches.length - 1,
                                ),
                            ),
                        )
                    }

                    if (event.key === "ArrowUp") {
                        event.preventDefault()

                        setActive((previous) =>
                            Math.max(
                                0,
                                previous - 1,
                            ),
                        )
                    }

                    if (
                        event.key === "Enter" &&
                        open
                    ) {
                        event.preventDefault()

                        if (matches[active]) {
                            select(
                                matches[active],
                            )
                        }
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
                        <li className="p-3 text-sm text-gray-500">
                            No matches found.
                        </li>
                    ) : (
                        matches.map(
                            (option, index) => (
                                <li
                                    key={option.value}
                                    id={`${id}-${index}`}
                                    role="option"
                                    aria-selected={
                                        option.value ===
                                        value
                                    }
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onMouseEnter={() =>
                                        setActive(index)
                                    }
                                    onClick={() =>
                                        select(option)
                                    }
                                    className={`cursor-pointer rounded-lg p-3 text-sm ${
                                        index === active
                                            ? "bg-purple-50 text-purple-900"
                                            : "text-gray-700"
                                    }`}
                                >
                                    {option.label}
                                </li>
                            ),
                        )
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
        customerContact: "",
        sale_type: "Service",
        selectedId: "",
        appointmentId: "",
        quantity: "1",
        amount: "",
        payment: "Cash",
        historicalDate: "",
    }
}


const peso = (n) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
const moneyCents = (value) => Math.round(Number(value) * 100);
function normalizeRequiredPhone(value) {
  const digits = String(value ?? "").replace(/[\s()-]/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^\+639\d{9}$/.test(digits)) return "0" + digits.slice(3);
  if (/^639\d{9}$/.test(digits)) return "0" + digits.slice(2);
  return "";
}

/** Online walk-in multi-item checkout. Appointment checkout remains in the original POS until backend parity. */
function StyleSyncMultiItemCheckoutModal({ open, onClose, onSaved, services = [], products = [], embedded = false }) {
  const [step, setStep] = useState("cart");
  const [showDiscount, setShowDiscount] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState({});
  const [staffChoices, setStaffChoices] = useState({});
  const [staffAssignments, setStaffAssignments] = useState({});
  const [staffLoading, setStaffLoading] = useState({});
  const manilaNow = () => new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Manila',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
  const refreshStaff = async (serviceId, startTime) => {
    const key = `s:${serviceId}`;
    setStaffLoading(prev => ({...prev,[key]:true}));
    setStaffChoices(prev => ({...prev,[key]:null}));
    try {
      const data = await request(`/transactions/cart/staff-availability?service_id=${encodeURIComponent(serviceId)}&start_time=${encodeURIComponent(startTime)}`);
      setStaffChoices(prev => ({...prev,[key]:data}));
    } catch (e) {
      setStaffChoices(prev => ({...prev,[key]:{staff:[],error:e.message}}));
    } finally {setStaffLoading(prev => ({...prev,[key]:false}));}
  };
  const [customer, setCustomer] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  // Registered customer suggestions are advisory until the cashier confirms a profile.
  const [customerMatches, setCustomerMatches] = useState([]);
  const [customerLookupBusy, setCustomerLookupBusy] = useState(false);
  const [customerLookupError, setCustomerLookupError] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerLookupVersion, setCustomerLookupVersion] = useState(0);
  const maskContact = (value) => {
    const v = String(value || "").trim();
    return v.length > 4 ? `${"•".repeat(Math.min(v.length - 4, 7))}${v.slice(-4)}` : "Contact unavailable";
  };
  useEffect(() => {
    if (!open || selectedCustomer) return;
    const query = customer.trim();
    if (query.length < 2) {
      setCustomerMatches([]);
      setCustomerLookupError("");
      setCustomerLookupBusy(false);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setCustomerLookupBusy(true);
      setCustomerLookupError("");
      try {
        const rows = await request(`/customers?search=${encodeURIComponent(query)}`);
        if (active) {
          const normalized = query.toLocaleLowerCase();
          setCustomerMatches((Array.isArray(rows) ? rows : [])
            .filter(x => String(x.customer_name || "").toLocaleLowerCase().includes(normalized))
            .slice(0, 8));
        }
      } catch (e) {
        if (active) {
          setCustomerMatches([]);
          setCustomerLookupError(e.message || "Customer lookup unavailable.");
        }
      } finally {
        if (active) setCustomerLookupBusy(false);
      }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [open, customer, selectedCustomer, customerLookupVersion]);

  const chooseRegisteredCustomer = (match) => {
    if (!normalizeRequiredPhone(match.contact_number) || Number(match.matching_profiles) !== 1) {
      setSaveError("This profile has a missing or duplicate contact. Ask the owner to resolve it first.");
      return;
    }
    setCustomer(String(match.customer_name || ""));
    setCustomerContact(normalizeRequiredPhone(match.contact_number));
    setSelectedCustomer({ id: match.customer_id, name: match.customer_name, contact: normalizeRequiredPhone(match.contact_number) });
    setCustomerMatches([]);
    invalidateQuote();
  };
  const clearRegisteredCustomer = () => {
    setSelectedCustomer(null);
    setCustomerContact("");
    setCustomerLookupVersion(v => v + 1);
    invalidateQuote();
  };

  const [payment, setPayment] = useState("Cash");
  const [cash, setCash] = useState("");
  const [reference, setReference] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [checkoutKey, setCheckoutKey] = useState(() => crypto.randomUUID());

  const catalog = useMemo(() => [
    ...services.map(s => ({ key: `s:${s.service_id ?? s.id}`, id: s.service_id ?? s.id, name: s.service ?? s.name, type: "Service", price: Number(s.price), status: s.status })),
    ...products.map(p => ({ key: `p:${p.id ?? p.item_id}`, id: p.id ?? p.item_id, name: p.name, type: "Product", price: Number(p.price ?? p.selling_price), stock: Number(p.stock) })),
  ].filter(x => x.id != null && x.name && Number.isFinite(x.price) && x.price >= 0 && (x.type !== "Service" || !x.status || x.status === "Available")), [services, products]);
  const filtered = catalog.filter(x => (category === "All" || x.type === category) && x.name.toLowerCase().includes(search.toLowerCase()));
  const lines = catalog.filter(x => (cart[x.key] || 0) > 0).map(x => ({ ...x, quantity: cart[x.key] }));
  const subtotalCents = lines.reduce((sum, x) => sum + moneyCents(x.price) * x.quantity, 0);
  const payableCents = quote ? moneyCents(quote.amount) : subtotalCents;
  const cashCents = moneyCents(cash || 0);
  const canPay = Boolean(normalizeRequiredPhone(customerContact) && quote && lines.length && customer.trim() && (payment !== "Cash" || cashCents >= payableCents) && (payment !== "GCash" || reference.trim()));
  const invalidateQuote = () => { setQuote(null); setReviewed(false); setSaveError(""); setStep("cart"); };
  const itemsPayload = () => lines.map(x => ({ type: x.type, id: x.id, quantity: x.quantity,
    ...(x.type === 'Service' ? { staff_id: staffAssignments[x.key]?.staff_id || null, start_time: staffAssignments[x.key]?.start_time || '' } : {}) }));
  const allServicesAssigned = lines.every(x => x.type !== 'Service' || (staffAssignments[x.key]?.staff_id && staffChoices[x.key]?.staff?.some(s => Number(s.staff_id) === Number(staffAssignments[x.key].staff_id))));

  const adjust = (item, delta) => {
    invalidateQuote();
    if (item.type === 'Service' && delta > 0 && !cart[item.key]) {
      const startTime = manilaNow();
      setStaffAssignments(prev => ({...prev,[item.key]:{start_time:startTime,staff_id:''}}));
      refreshStaff(item.id, startTime);
    }
    setCart(current => {
      const next = Math.max(0, (current[item.key] || 0) + delta);
      return { ...current, [item.key]: item.type === "Service" ? Math.min(next, 1) : Math.min(next, Math.max(0, Math.min(100, item.stock))) };
    });
  };

  const previewCart = async () => {
    if (!normalizeRequiredPhone(customerContact)) {
      setSaveError("A valid Philippine mobile number is required (09XXXXXXXXX).");
      return;
    }
    if (!lines.length || !customer.trim() || quoting) return;
    if (!allServicesAssigned) { setSaveError('Select an available staff member for every walk-in service.'); return; }
    setQuoting(true); setSaveError(""); setQuote(null);
    try {
      // Never silently attribute a new/walk-in sale to another registered contact.
      if (customerContact.trim() && !selectedCustomer) {
        const matches = await request(`/customers?search=${encodeURIComponent(customerContact.trim())}`);
        const exact = (Array.isArray(matches) ? matches : []).filter(x =>
          normalizeRequiredPhone(x.contact_number) === normalizeRequiredPhone(customerContact)
        );
        if (exact.length) {
          throw new Error("This contact belongs to a registered profile. Search by name and select that profile, or enter a different number.");
        }
      }
      const result = await request("/transactions/cart/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: customer.trim(), customer_contact: normalizeRequiredPhone(customerContact), items: itemsPayload() })
      });
      if (!result || !Number.isFinite(Number(result.amount))) throw new Error("Invalid server checkout quote.");
      setQuote(result);
      setStep("payment");
    } catch (e) { setSaveError(e.message || "Unable to preview checkout."); }
    finally { setQuoting(false); }
  };

  const saveCart = async () => {
    if (!reviewed || !canPay || !quote || saving) return;
    setSaving(true); setSaveError("");
    try {
      const result = await request("/transactions/cart", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customer.trim(), customer_contact: normalizeRequiredPhone(customerContact),
          payment, payment_reference: payment === "GCash" ? reference.trim() : undefined,
          payment_confirmed: true, checkout_key: checkoutKey,
          expected_total: quote.amount,
          expected_discount_amount: quote.discount_amount,
          expected_reward_id: quote.reward_id,
          items: itemsPayload()
        })
      });
      // The sale is committed once the server responds successfully.
      // A history refresh failure must never turn a successful payment into a retry prompt.
      try {
        await onSaved?.(result);
      } catch (refreshError) {
        console.error("Checkout saved, but history refresh failed:", refreshError);
      }
      setCompletedSale({ ...result, customer, customerContact, payment, cash, reference, quote });
      setStep("complete");
    } catch (e) {
      setSaveError(e.message || "Unable to save checkout. Check history before retrying.");
      // Preserve the idempotency key to prevent duplicate sales on retry.
    } finally { setSaving(false); }
  };

  const startNewSale = () => {
    setStaffChoices({}); setStaffAssignments({}); setStaffLoading({});
    setCart({}); setCustomer(""); setCustomerContact(""); setSelectedCustomer(null);
    setCustomerMatches([]); setCash(""); setReference(""); setQuote(null);
    setReviewed(false); setSaveError(""); setShowDiscount(false);
    setCompletedSale(null); setPayment("Cash"); setStep("cart");
    setCheckoutKey(crypto.randomUUID());
  };
  const printCompletedReceipt = () => {
    if (!completedSale) return;
    const receipt = document.getElementById("stylesync-completed-receipt");
    if (!receipt) return;
    const popup = window.open("", "_blank", "width=480,height=740");
    if (!popup) { setSaveError("Please allow pop-ups to print the receipt."); return; }
    const safe = receipt.cloneNode(true);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>StyleSync Receipt</title><style>body{font:14px Arial,sans-serif;max-width:360px;margin:28px auto;color:#292038}h2{text-align:center;color:#6d28d9}p{margin:7px 0}.receipt-row{display:flex;justify-content:space-between;gap:16px;padding:7px 0;border-bottom:1px dashed #ddd}.receipt-total{font-weight:700;font-size:18px}button{display:none}@media print{body{margin:8px auto}}</style></head><body>${safe.innerHTML}</body></html>`;
    popup.document.open(); popup.document.write(html); popup.document.close();
    popup.focus(); popup.print();
  };

  if (!open) return null;
  return (
    <div className={embedded ? "w-full min-w-0" : "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3"} role="presentation">
      <section role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label="Point of sale checkout" className={embedded ? "stylesync-checkout-dialog flex w-full min-w-0 flex-col rounded-3xl border border-purple-100 bg-white shadow-sm" : "stylesync-checkout-dialog flex max-h-[95vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"}>
        <header className="flex items-center justify-between border-b border-purple-100 px-5 py-4">
          <div><h2 className="text-xl font-bold text-purple-950">Point of Sale · Current Sale</h2><p className="text-xs text-purple-600">Online walk-in · Services + products · Server-calculated discounts</p></div>
          {!embedded && <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border px-3 py-2 text-sm">Close</button>}
        </header>
        <div className="flex gap-2 border-b px-5 py-3 text-xs font-semibold text-purple-800">
          {["cart", "payment", "review", "complete"].map((x, i) => <span key={x} className={`rounded-full px-3 py-1 ${step === x ? "bg-purple-700 text-white" : "bg-purple-50"}`}>{i + 1}. {x === "cart" ? "Cart" : x === "payment" ? "Payment" : x === "review" ? "Review" : "Complete"}</span>)}
        </div>
        <div className={embedded ? "p-4 sm:p-5" : "overflow-y-auto p-5"}>
          {step === "cart" && <div className="grid items-start gap-4 xl:grid-cols-[1.12fr_0.94fr_1fr]">
            <section aria-label="Add to sale" className="min-w-0 space-y-3 rounded-2xl border border-purple-100 bg-purple-50/30 p-4">
              <div><h3 className="text-base font-bold text-purple-950">01 · Add to Sale</h3><p className="mt-1 text-xs text-slate-500">Choose services and products for this walk-in sale.</p></div>
              <div className="flex gap-2">
                <input className="w-full rounded-xl border p-3 text-sm" placeholder="Search services or products" value={search} onChange={e => setSearch(e.target.value)} />
                <select className="rounded-xl border p-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}><option>All</option><option>Service</option><option>Product</option></select>
              </div>
              <div className="max-h-[50vh] space-y-2 overflow-y-auto">
                {filtered.map(item => <div key={item.key} className="flex items-center justify-between gap-2 rounded-xl border p-3"><div className="min-w-0"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-slate-500">{item.type} · {peso(item.price)}{item.type === "Product" ? ` · ${item.stock} available` : ""}</p></div><button type="button" disabled={item.type === "Product" && item.stock < 1} onClick={() => adjust(item, 1)} className="rounded-lg bg-purple-700 px-3 py-2 text-sm text-white disabled:opacity-40">Add</button></div>)}
              </div>
            </section>
            <section aria-label="Current sale" className="min-w-0 space-y-3 rounded-2xl border border-purple-100 bg-white p-4">
              <div><h3 className="text-base font-bold text-purple-950">02 · Current Sale</h3><p className="mt-1 text-xs text-slate-500">Review quantities and your subtotal.</p></div>
              <h3 className="font-bold text-purple-950">Cart · {lines.length} items</h3>
              {lines.length === 0 && <p className="text-sm text-slate-500">Add a service or product to begin.</p>}
              {lines.map(x => <div key={x.key} className="rounded-xl bg-purple-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2"><div><p className="font-medium">{x.name}</p><p className="text-xs">{peso(x.price)} × {x.quantity}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => adjust(x, -1)} className="rounded border px-2">−</button><span>{x.quantity}</span><button type="button" onClick={() => adjust(x, 1)} disabled={x.type === "Service" || x.quantity >= x.stock} className="rounded border px-2 disabled:opacity-40">+</button></div></div>
                {x.type === 'Service' && <div className="space-y-2 border-t border-purple-100 pt-2">
                  <label className="block text-xs font-semibold text-purple-900">Service start (Philippine time)
                    <input type="time" value={staffAssignments[x.key]?.start_time || ''} onChange={e => { const start_time=e.target.value; invalidateQuote(); setStaffAssignments(prev => ({...prev,[x.key]:{start_time,staff_id:''}})); setStaffChoices(prev => ({...prev,[x.key]:null})); if(start_time) refreshStaff(x.id,start_time); }} className="mt-1 w-full rounded-lg border p-2 text-sm" />
                  </label>
                  <label className="block text-xs font-semibold text-purple-900">Available qualified staff
                    <select value={staffAssignments[x.key]?.staff_id || ''} onChange={e => { invalidateQuote(); setStaffAssignments(prev => ({...prev,[x.key]:{...prev[x.key],staff_id:e.target.value}})); }} className="mt-1 w-full rounded-lg border p-2 text-sm">
                      <option value="">{staffLoading[x.key] ? 'Checking staff…' : 'Select staff'}</option>
                      {(staffChoices[x.key]?.staff || []).map(s => <option key={s.staff_id} value={s.staff_id}>{s.name}</option>)}
                    </select>
                  </label>
                  {staffChoices[x.key]?.endTime && <p className="text-xs text-slate-500">Scheduled until {staffChoices[x.key].endTime} · {staffChoices[x.key].duration_minutes} minutes</p>}
                  {staffChoices[x.key]?.error && <p className="text-xs text-red-700">{staffChoices[x.key].error}</p>}
                  {staffChoices[x.key] && !staffChoices[x.key].error && !staffChoices[x.key].staff?.length && <p className="text-xs text-amber-700">No qualified staff available for this full time slot.</p>}
                  <button type="button" onClick={() => refreshStaff(x.id, staffAssignments[x.key]?.start_time || manilaNow())} className="text-xs font-semibold text-purple-700 underline">Refresh staff availability</button>
                </div>}
              </div>)}
              <div className="flex justify-between border-t pt-3 font-semibold"><span>Subtotal before discounts</span><span>{peso(subtotalCents / 100)}</span></div>
              <div className="rounded-xl border border-purple-100 p-3">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold text-purple-900">
                  <span>Enable Discount <span className="font-normal text-slate-500">(view eligible savings)</span></span>
                  <input type="checkbox" checked={showDiscount} onChange={e => setShowDiscount(e.target.checked)} className="h-4 w-4 accent-purple-700" />
                </label>
                {showDiscount && <p className="mt-2 text-xs text-slate-600">Eligible promotions and owner-issued loyalty rewards are calculated automatically by the server at payment review. Cashiers cannot manually change discount percentages.</p>}
              </div>
            </section>
            <section aria-label="Customer and payment" className="min-w-0 space-y-3 rounded-2xl border border-purple-100 bg-purple-50/30 p-4">
              <div><h3 className="text-base font-bold text-purple-950">03 · Customer &amp; Payment</h3><p className="mt-1 text-xs text-slate-500">Confirm the customer before reviewing payment.</p></div>
              <label className="block text-sm">Customer name
                <input value={customer} onChange={e => { setCustomer(e.target.value); setSelectedCustomer(null); setCustomerContact(""); invalidateQuote(); }} readOnly={Boolean(selectedCustomer)} maxLength={100} className="mt-1 w-full rounded-xl border p-3" placeholder="Type a name to find registered customers" />
              </label>
              {selectedCustomer ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
                  <p className="font-semibold text-green-800">✓ Registered customer confirmed</p>
                  <p className="mt-1 text-green-900">{selectedCustomer.name} · {maskContact(selectedCustomer.contact)}</p>
                  <button type="button" onClick={clearRegisteredCustomer} className="mt-2 text-xs font-semibold text-purple-700 underline">Different customer / change selection</button>
                </div>
              ) : (
                <>
                  {customerLookupBusy && <p className="text-xs text-purple-700">Searching registered customers…</p>}
                  {customerLookupError && <p role="alert" className="text-xs text-amber-700">Customer search unavailable: {customerLookupError}. Verify the contact before checkout.</p>}
                  {customerMatches.length > 0 && (
                    <div className="rounded-xl border border-purple-200 bg-white p-2">
                      <p className="px-2 py-1 text-xs font-semibold text-purple-800">Possible registered customers — confirm with the customer</p>
                      {customerMatches.map(match => (
                        <button key={match.customer_id} type="button" onClick={() => chooseRegisteredCustomer(match)}
                          disabled={!normalizeRequiredPhone(match.contact_number) || Number(match.matching_profiles) !== 1}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-50">
                          <span className="font-semibold">{match.customer_name}</span>
                          <span className="ml-2 text-slate-500">{maskContact(match.contact_number)}</span>
                          {Number(match.matching_profiles) !== 1 && <span className="block text-xs text-amber-700">Duplicate contact — owner review needed</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-600">Not the same person? Enter their own number below. Never reuse another customer's number.</p>
                </>
              )}
              <label className="block text-sm">Customer mobile number (required)
                <input type="tel" required pattern="09[0-9]{9}" value={customerContact}
                  onChange={e => { if (!selectedCustomer) { setCustomerContact(e.target.value); invalidateQuote(); } }}
                  readOnly={Boolean(selectedCustomer)} maxLength={30}
                  className="mt-1 w-full rounded-xl border p-3"
                  placeholder="09XXXXXXXXX" />
              </label>
              {selectedCustomer && <p className="text-xs text-green-800">The confirmed contact will be saved with this transaction for Customer Intelligence.</p>}
              <button type="button" onClick={previewCart} disabled={!lines.length || !customer.trim() || !allServicesAssigned || quoting || !navigator.onLine} className="w-full rounded-xl bg-purple-700 p-3 font-semibold text-white disabled:opacity-40">{quoting ? "Calculating…" : "Continue to payment →"}</button>
              {saveError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
            </section>
          </div>}
          {step === "payment" && quote && (
            <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1fr_0.85fr]">
              <section className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm space-y-4">
                <div><p className="text-xs font-bold uppercase tracking-widest text-purple-500">Step 2 · Payment</p><h3 className="mt-1 text-xl font-bold text-purple-950">Choose payment method</h3><p className="mt-1 text-sm text-slate-500">Confirm payment details before final review.</p></div>
                <div className="grid grid-cols-2 gap-3">
                  {["Cash", "GCash"].map(method => <button key={method} type="button" aria-pressed={payment === method} onClick={() => { setPayment(method); setReviewed(false); }} className={`rounded-xl border p-4 text-left text-sm font-semibold transition-colors ${payment === method ? "border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-100" : "border-slate-200 bg-white text-slate-600 hover:border-purple-200"}`}>{method === "Cash" ? "₱ " : "◈ "}{method}</button>)}
                </div>
                {payment === "Cash" ? <label className="block text-sm font-medium text-slate-700">Cash received<input type="number" min="0" step="0.01" value={cash} onChange={e => { setCash(e.target.value); setReviewed(false); }} className="mt-2 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-purple-400" placeholder="0.00" /><span className="mt-2 block text-sm text-emerald-700">Change due: <strong>{peso(Math.max(0, (cashCents - payableCents) / 100))}</strong></span></label> : <label className="block text-sm font-medium text-slate-700">Verified GCash reference<input value={reference} onChange={e => { setReference(e.target.value); setReviewed(false); }} className="mt-2 w-full rounded-xl border border-slate-200 p-3 outline-none focus:border-purple-400" placeholder="Enter payment reference" /><span className="mt-2 block text-xs font-normal text-slate-500">Verify payment outside StyleSync before continuing.</span></label>}
                <div className="flex flex-wrap gap-3 pt-2"><button type="button" onClick={() => { setQuote(null); setStep("cart"); }} className="flex-1 rounded-xl border border-purple-200 px-4 py-3 text-sm font-semibold text-purple-800">← Edit cart</button><button type="button" disabled={!canPay} onClick={() => setStep("review")} className="flex-1 rounded-xl bg-purple-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Review sale →</button></div>
              </section>
              <aside className="rounded-2xl border border-purple-100 bg-gradient-to-b from-purple-50 to-white p-5 space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-purple-600">Sale summary</p><div><p className="text-sm text-slate-500">Customer</p><p className="font-semibold text-purple-950">{customer}</p><p className="text-xs text-slate-500">{customerContact}</p></div>
                <div className="space-y-2 border-t border-purple-100 pt-4 text-sm"><div className="flex justify-between gap-3"><span>Subtotal</span><strong>{peso(Number(quote.subtotal))}</strong></div><div className="flex justify-between gap-3 text-purple-700"><span>Applied discount</span><strong>−{peso(Number(quote.discount_amount))}</strong></div><p className="text-xs text-slate-500">{quote.discount_type === "loyalty" ? "Owner-issued loyalty reward" : quote.discount_type === "promotion" ? "Eligible promotion" : "No discount applied"}</p>{quote.reward_id && quote.discount_type !== "loyalty" && <p className="text-xs text-emerald-700">Loyalty reward preserved for later.</p>}</div>
                <div className="rounded-xl bg-purple-800 p-4 text-white"><p className="text-xs text-purple-100">Amount due</p><p className="mt-1 text-3xl font-extrabold">{peso(Number(quote.amount))}</p></div>
              </aside>
            </div>
          )}
          {step === "complete" && completedSale && <div className="mx-auto max-w-2xl space-y-5 py-4">
            <div className="text-center"><div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl font-bold text-emerald-700">✓</div><h3 className="text-2xl font-extrabold text-purple-950">Transaction Complete!</h3><p className="mt-1 text-sm text-slate-600">Payment saved successfully · Transaction #{completedSale.id}</p></div>
            <div id="stylesync-completed-receipt" className="rounded-2xl border border-purple-200 bg-white p-6 shadow-sm">
              <h2 className="text-center text-xl font-extrabold text-purple-900">Dahling’s Salon & Spa</h2><p className="text-center text-xs text-slate-500">StyleSync · Official Sale Receipt</p>
              <div className="my-4 border-t border-dashed border-purple-200" />
              <p className="text-xs text-slate-600">Receipt #{completedSale.id} · {new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p>
              <p className="mt-1 text-sm font-semibold">{completedSale.customer}</p><p className="text-xs text-slate-500">{completedSale.customerContact}</p>
              <div className="my-3 border-t border-dashed border-purple-200" />
              {completedSale.quote.items.map((item, i) => <div className="receipt-row flex justify-between gap-4 border-b border-dashed py-2 text-sm" key={`${item.type}-${item.id}-${i}`}><div><p className="font-medium">{item.name} × {item.quantity}</p><p className="text-xs text-slate-500">{item.type}{Number(item.discount_amount) > 0 ? ` · Discount −${peso(Number(item.discount_amount))}` : ""}</p></div><strong>{peso(Number(item.final_line_total))}</strong></div>)}
              <div className="receipt-row mt-3 flex justify-between text-sm"><span>Subtotal</span><span>{peso(Number(completedSale.quote.subtotal))}</span></div>
              <div className="receipt-row flex justify-between text-sm"><span>Discount</span><span>−{peso(Number(completedSale.quote.discount_amount))}</span></div>
              <div className="receipt-row receipt-total flex justify-between border-t py-3 text-lg font-extrabold text-purple-900"><span>Total Paid</span><span>{peso(Number(completedSale.quote.amount))}</span></div>
              <div className="receipt-row flex justify-between text-sm"><span>Payment</span><span>{completedSale.payment}</span></div>
              {completedSale.payment === "Cash" ? <><div className="receipt-row flex justify-between text-sm"><span>Cash received</span><span>{peso(Number(completedSale.cash))}</span></div><div className="receipt-row flex justify-between text-sm"><span>Change</span><span>{peso(Math.max(0, Number(completedSale.cash) - Number(completedSale.quote.amount)))}</span></div></> : <p className="text-xs text-slate-600">GCash reference: {completedSale.reference}</p>}
              <p className="mt-5 text-center text-xs text-purple-800">Thank you for visiting Dahling’s Salon & Spa! 💜</p>
            </div>
            {saveError && <p role="alert" className="text-sm text-red-700">{saveError}</p>}
            <div className="grid gap-2 sm:grid-cols-3"><button type="button" onClick={printCompletedReceipt} className="rounded-xl border border-purple-300 p-3 text-sm font-bold text-purple-800">Print Receipt</button><button type="button" onClick={startNewSale} className="rounded-xl bg-purple-700 p-3 text-sm font-bold text-white">New Transaction</button>{!embedded && <button type="button" onClick={onClose} className="rounded-xl border p-3 text-sm font-semibold">View Transactions</button>}</div>
          </div>}
          {step === "review" && quote && (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="text-center"><p className="text-xs font-bold uppercase tracking-widest text-purple-500">Step 3 · Final confirmation</p><h3 className="mt-1 text-2xl font-extrabold text-purple-950">Payment Review</h3><p className="mt-1 text-sm text-slate-500">Check every detail before recording the sale.</p></div>
              <div className="overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
                <div className="grid gap-3 bg-purple-50 p-5 text-sm sm:grid-cols-2"><div><p className="text-xs text-slate-500">Customer</p><strong className="text-purple-950">{customer}</strong><p className="text-xs text-slate-500">{customerContact}</p></div><div><p className="text-xs text-slate-500">Payment method</p><strong className="text-purple-950">{payment}</strong>{payment === "Cash" ? <p className="text-xs text-slate-500">Received {peso(Number(cash))} · Change {peso(Math.max(0, (cashCents - payableCents) / 100))}</p> : <p className="break-all text-xs text-slate-500">Reference: {reference}</p>}</div></div>
                <div className="space-y-3 p-5"><h4 className="text-sm font-bold text-purple-950">Items purchased</h4>{quote.items.map((x, i) => <div key={`${x.type}:${x.id}:${i}`} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-3 text-sm"><div><p className="font-semibold text-slate-800">{x.name} × {x.quantity}</p><p className="text-xs text-slate-500">{x.type}{Number(x.discount_amount) > 0 ? ` · Savings ${peso(Number(x.discount_amount))}` : ""}</p></div><strong className="whitespace-nowrap text-purple-950">{peso(Number(x.final_line_total))}</strong></div>)}<div className="flex justify-between text-sm"><span>Subtotal</span><strong>{peso(Number(quote.subtotal))}</strong></div><div className="flex justify-between text-sm text-purple-700"><span>Discount</span><strong>−{peso(Number(quote.discount_amount))}</strong></div><div className="flex items-center justify-between border-t border-purple-100 pt-4 text-lg font-extrabold text-purple-950"><span>Total to collect</span><span>{peso(Number(quote.amount))}</span></div></div>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-1 h-4 w-4 accent-purple-700" /><span>I verified the customer, items, discounts, and payment. I understand that confirming will record the transaction.</span></label>
              {saveError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{saveError}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setStep("payment")} disabled={saving} className="rounded-xl border border-purple-200 p-3 text-sm font-semibold text-purple-800 disabled:opacity-40">← Edit payment</button><button type="button" disabled={!reviewed || saving || !canPay || !navigator.onLine} onClick={saveCart} className="rounded-xl bg-purple-700 p-3 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving…" : "Confirm & save sale"}</button></div>
              <p className="text-center text-xs text-slate-500">Online walk-in checkout only. Appointment and Emergency Mode checkout remain in the existing POS.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AdminTransactions() {
    const [cartHistory, setCartHistory] = useState({})
    const [cartHistoryError, setCartHistoryError] = useState("")
    const loadCartItems = async (transactionId) => {
        try {
            setCartHistoryError("")
            const items = await request(`/transactions/cart/${transactionId}`)
            setCartHistory(previous => ({...previous, [transactionId]: items}))
        } catch (e) { setCartHistoryError(e.message) }
    }
    const [transactions, setTransactions] = useState([])
    const [services, setServices] = useState([])
    const [products, setProducts] = useState([])
    const [appointments, setAppointments] = useState([])

    const [form, setForm] = useState(freshForm)
    const [posTab, setPosTab] = useState("walkin")
    const [emergencySale, setEmergencySale] = useState(null)
    const [emergencyCheck, setEmergencyCheck] = useState("")
    const [emergencyMatches, setEmergencyMatches] = useState([])
    const [emergencyConfirmed, setEmergencyConfirmed] = useState(false)
    const [emergencyChecking, setEmergencyChecking] = useState(false)
    const [emergencyPaidAcknowledged, setEmergencyPaidAcknowledged] = useState(false)
    const [emergencyCollected, setEmergencyCollected] = useState("")
    const [emergencyPendingPaid, setEmergencyPendingPaid] = useState(false)

    const [loyalty, setLoyalty] = useState(null)
    const [loyaltyLoading, setLoyaltyLoading] = useState(false)
    const [loyaltyError, setLoyaltyError] = useState("")

    const [receipt, setReceipt] = useState(null)
    const [search, setSearch] = useState("")
    const [historyPage, setHistoryPage] = useState(1)

    const HISTORY_PAGE_SIZE = 10

    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [loadError, setLoadError] = useState("")
    const [error, setError] = useState("")
    const [message, setMessage] = useState("")
    const [clock, setClock] = useState(() => new Date())

    const lock = useRef(false)
    const version = useRef(0)
    const retry = useRef(null)

    const load = useCallback(async (signal) => {
        const current = ++version.current

        setLoading(true)
        setLoadError("")

        const restoreCache = () => {
            const cache = readLocal(
                OFFLINE_CACHE_KEY,
                null,
            )

            if (!cache) {
                return false
            }

            const queue = getOfflineQueue()
            const pending = queue.map(pendingRow)

            setTransactions([
                ...pending,
                ...(Array.isArray(cache.transactions)
                    ? cache.transactions
                    : []),
            ])

            setServices(
                Array.isArray(cache.services)
                    ? cache.services
                    : [],
            )

            const cachedProducts =
                Array.isArray(cache.products)
                    ? cache.products
                    : []

            setProducts(
                applyQueuedProductStock(
                    cachedProducts,
                    queue,
                ),
            )

            setAppointments(
                Array.isArray(cache.appointments)
                    ? cache.appointments
                    : [],
            )

            return true
        }

        if (!navigator.onLine) {
            const restored = restoreCache()

            if (!restored) {
                setLoadError(
                    "No offline POS data is cached yet. Connect to the internet once before using Emergency Mode.",
                )
            } else {
                setMessage(
                    "Emergency Mode active. Using the last saved POS data.",
                )
            }

            setLoading(false)
            return null
        }

        try {
            const data = await Promise.all([
                request("/transactions", { signal }),
                request("/services", { signal }),
                request("/inventory", { signal }),
                request(
                    "/transactions/checkout-appointments",
                    { signal },
                ),
            ])

            if (!data.every(Array.isArray)) {
                throw new Error(
                    "Unexpected server response.",
                )
            }

            if (
                signal?.aborted ||
                current !== version.current
            ) {
                return null
            }

            writeLocal(OFFLINE_CACHE_KEY, {
                transactions: data[0],
                services: data[1],
                products: data[2],
                appointments: data[3],
                savedAt: Date.now(),
            })

            const queue = getOfflineQueue()
            const pending = queue.map(pendingRow)

            setTransactions([
                ...pending,
                ...data[0],
            ])

            setServices(data[1])

            setProducts(
                applyQueuedProductStock(
                    data[2],
                    queue,
                ),
            )

            setAppointments(data[3])

            return data[0]
        } catch (err) {
            if (
                !signal?.aborted &&
                current === version.current
            ) {
                const restored = restoreCache()

                if (restored) {
                    setMessage(
                        "Emergency Mode active. Using locally cached POS data.",
                    )
                } else {
                    setLoadError(err.message)
                }
            }

            return null
        } finally {
            if (
                !signal?.aborted &&
                current === version.current
            ) {
                setLoading(false)
            }
        }
    }, [])

    const syncOfflineTransactions = useCallback(
        async () => {
            if (!navigator.onLine) {
                return
            }

            let queue = getOfflineQueue()

            if (!queue.length) {
                return
            }

            let synced = 0

            for (const entry of [...queue]) {
                try {
                    // Never redeem a loyalty reward
                    // through a queued offline sale.
                    if (
                        entry.payload?.loyalty_reward_id ||
                        entry.payload?.discount_decision
                    ) {
                        console.error(
                            "Offline queue contains a discount request requiring review.",
                            entry.offline_id,
                        )
                        break
                    }

                    const phone = normalizeRequiredPhone(entry.payload?.customer_contact);
                    if (!phone) {
                        console.error("Offline queue has no valid customer phone; manual review required.", entry.offline_id);
                        break;
                    }
                    await request("/transactions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({
                            ...entry.payload,
                            customer_contact: phone,
                            offline_id: entry.offline_id,
                            offline_queued: true,
                        }),
                    })

                    queue = queue.filter(
                        (item) =>
                            item.offline_id !==
                            entry.offline_id,
                    )

                    saveOfflineQueue(queue)
                    synced += 1
                } catch (err) {
                    console.error(
                        "Offline transaction sync failed:",
                        err,
                    )
                    break
                }
            }

            if (synced > 0) {
                setMessage(
                    `${synced} offline transaction${
                        synced === 1 ? "" : "s"
                    } synced successfully.`,
                )

                await load()
            }
        },
        [load],
    )

    useEffect(() => {
        const controller = new AbortController()

        load(controller.signal)

        const timer = setInterval(
            () => setClock(new Date()),
            60000,
        )

        return () => {
            controller.abort()
            clearInterval(timer)
        }
    }, [load])

    useEffect(() => {
        const handleOnline = () => {
            syncOfflineTransactions()
        }

        window.addEventListener(
            "online",
            handleOnline,
        )

        if (navigator.onLine) {
            syncOfflineTransactions()
        }

        return () => {
            window.removeEventListener(
                "online",
                handleOnline,
            )
        }
    }, [syncOfflineTransactions])

    // The URL carries only an identifier; the saved payload is loaded from IndexedDB.
    // Never trust URL-supplied customer, price, or service information.
    useEffect(() => {
        const id = new URLSearchParams(window.location.search).get("emergency_offline_id")
        if (!id) return
        let active = true
        getEmergencyRecord(id).then((record) => {
            if (!active) return
            if (!record || record.record_type !== "sale" || record.payload?.sale_type !== "Service") {
                setEmergencyCheck("Emergency service record not found on this device. Do not create a new sale.")
                return
            }
            if (record.sync_status === "Synced") {
                setEmergencyCheck(`Already reconciled with server transaction #${record.server_id}. Do not submit again.`)
                return
            }
            setEmergencySale(record)
            setEmergencyCheck("")
            setForm({ ...freshForm(), customer: record.payload.customer || "",
                customerContact: record.payload.customer_contact || "",
                sale_type: "Service", payment: record.payload.payment || "Cash" })
        }).catch((err) => { if (active) setEmergencyCheck(err.message) })
        return () => { active = false }
    }, [])

    // Load the current server history before allowing an emergency checkout.
    // The backend returns t.* (including offline_id); this is an exact-ID lookup.
    useEffect(() => {
        if (!emergencySale) return
        let active = true
        setEmergencyChecking(true)
        setEmergencyCheck("")
        request(`/transactions/offline/${encodeURIComponent(emergencySale.offline_id)}`).then(async (lookup) => {
            if (!active) return
            if (!lookup || typeof lookup.found !== "boolean") throw new Error("Invalid duplicate lookup response.")
            const exact = lookup.found ? lookup.transaction : null
            if (exact) {
                await reconcileEmergencySale(emergencySale.offline_id, exact)
                if (active) {
                    setEmergencyCheck(`Already saved as transaction #${exact.transaction_id}. Emergency record reconciled; do not submit again.`)
                    setEmergencySale(null)
                }
                return
            }
            // Name/date matches are only warnings. Failure to load history does not
            // replace the authoritative exact-offline-ID check above.
            const rows = await request("/transactions")
            if (!Array.isArray(rows)) throw new Error("Transaction history was not returned.")
            if (!active) return
            const name = String(emergencySale.payload?.customer || "").trim().toLowerCase()
            const service = String(emergencySale.payload?.service || "").trim().toLowerCase()
            const day = new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Manila", year:"numeric", month:"2-digit", day:"2-digit"}).format(new Date(emergencySale.recorded_at))
            const possible = rows.filter((row) =>
                String(row.customer || "").trim().toLowerCase() === name &&
                String(row.service || "").trim().toLowerCase() === service &&
                dayKey(row.transaction_date) === day)
            setEmergencyMatches(possible)
        }).catch((err) => { if (active) setEmergencyCheck(`Cannot verify server duplicates: ${err.message}. Checkout blocked.`) })
          .finally(() => { if (active) setEmergencyChecking(false) })
        return () => { active = false }
    }, [emergencySale])

    // Wait for the current service catalog to load. Old records without service_id
    // require staff to choose the correct service manually; never guess by name.
    useEffect(() => {
        if (!emergencySale || !services.length) return
        const id = Number(emergencySale.payload?.service_id)
        const found = Number.isSafeInteger(id) && id > 0 && services.some((item) => Number(item.service_id) === id)
        if (!found) return
        const item = services.find((entry) => Number(entry.service_id) === id)
        setForm((previous) => ({ ...previous, mode: "Walk-in", sale_type: "Service",
            selectedId: String(id), amount: Number(emergencySale.payload.amount).toFixed(2), quantity: "1" }))
    }, [emergencySale, services])

    const booked = form.mode === "Appointment"
    const productSale = form.sale_type === "Product"
    const disabled = loading || busy

    const appointment = appointments.find(
        (row) =>
            String(row.id) ===
            form.appointmentId,
    )

    const loyaltyContact = booked
        ? String(
              appointment?.contact_number || "",
          ).trim()
        : form.customerContact.trim()

    const rewardApplicable =
         !emergencySale &&
        !productSale &&
        !form.historicalDate &&
        (!booked || Boolean(appointment))

    // Identify exactly which checkout this lookup belongs to.
    // Prevents a reward fetched for a previous customer
    // from appearing when the cashier switches customers.
    const rewardLookupKey = rewardApplicable
        ? booked
            ? appointment
                ? `appointment:${appointment.id}:${loyaltyContact}`
                : ""
            : loyaltyContact.length >= 7
              ? `walkin:${loyaltyContact}`
              : ""
        : ""

    const [rewardLookup, setRewardLookup] =
        useState(null)

    const activeReward =
        navigator.onLine &&
        rewardLookupKey &&
        rewardLookup?.key === rewardLookupKey &&
        rewardLookup?.data?.available === true
            ? rewardLookup.data.reward
            : null

    const rewardCheckPending =
        Boolean(
            navigator.onLine &&
            rewardLookupKey &&
            rewardLookup?.key !== rewardLookupKey,
        )

    useEffect(() => {
        const controller = new AbortController()

        setLoyalty(null)
        setLoyaltyError("")
        setRewardLookup(null)

        if (
            !navigator.onLine ||
            !rewardApplicable ||
            !rewardLookupKey ||
            loyaltyContact.length < 7
        ) {
            setLoyaltyLoading(false)

            return () => controller.abort()
        }

        setLoyaltyLoading(true)

        const timer = setTimeout(async () => {
            try {
                const params =
                    new URLSearchParams()

                if (booked && appointment) {
                    params.set(
                        "appointment_id",
                        String(appointment.id),
                    )
                } else {
                    params.set(
                        "customer_contact",
                        loyaltyContact,
                    )
                }

                const result = await request(
                    `/transactions/loyalty-preview?${params.toString()}`,
                    {
                        signal: controller.signal,
                    },
                )

                if (!controller.signal.aborted) {
                    setLoyalty(result)

                    setRewardLookup({
                        key: rewardLookupKey,
                        data: result,
                    })
                }
            } catch (err) {
                if (!controller.signal.aborted) {
                    setLoyaltyError(err.message)
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoyaltyLoading(false)
                }
            }
        }, 350)

        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [
        loyaltyContact,
        rewardApplicable,
        rewardLookupKey,
        booked,
        appointment?.id,
    ])

    const items = productSale
        ? products
        : services

    const selectedItem = items.find(
        (row) =>
            String(
                productSale
                    ? row.id
                    : row.service_id,
            ) === form.selectedId,
    )

    const currentWalkin = !booked && !productSale && !form.historicalDate
    const quoteServiceId = currentWalkin && !emergencySale && selectedItem
        ? Number(selectedItem.service_id) : null
    const [walkinQuote, setWalkinQuote] = useState(null)
    const [walkinQuoteError, setWalkinQuoteError] = useState("")
    const [walkinQuoteLoading, setWalkinQuoteLoading] = useState(false)
    const quoteKey = quoteServiceId ? String(quoteServiceId) : ""
    const currentQuote = navigator.onLine && quoteKey &&
        walkinQuote?.key === quoteKey ? walkinQuote.data : null
    const quotePending = Boolean(navigator.onLine && quoteKey &&
        (walkinQuoteLoading || !currentQuote || walkinQuoteError))

    useEffect(() => {
        const controller = new AbortController()
        setWalkinQuote(null)
        setWalkinQuoteError("")
        if (!navigator.onLine || !quoteKey) {
            setWalkinQuoteLoading(false)
            return () => controller.abort()
        }
        setWalkinQuoteLoading(true)
        request(`/transactions/price-preview?service_id=${encodeURIComponent(quoteKey)}`,
            { signal: controller.signal })
            .then((data) => {
                if (!controller.signal.aborted) {
                    setWalkinQuote({ key: quoteKey, data })
                }
            })
            .catch((err) => {
                if (!controller.signal.aborted) setWalkinQuoteError(err.message)
            })
            .finally(() => {
                if (!controller.signal.aborted) setWalkinQuoteLoading(false)
            })
        return () => controller.abort()
    }, [quoteKey, booked, productSale, form.historicalDate])

    const deposit =
        booked &&
        appointment?.payment_status ===
            "Verified"
            ? Number(
                  appointment.verified_deposit || 0,
              )
            : 0

    const subtotalCents = toCents(form.amount)

    const approvedPercent = activeReward
        ? Number(activeReward.reward_percent)
        : 0

    const loyaltyDiscountCents =
        activeReward && Number.isFinite(approvedPercent) &&
        approvedPercent > 0 && approvedPercent <= 100
            ? Math.round(subtotalCents * approvedPercent / 100)
            : 0
    const lockedPromoCents = booked && appointment?.locked_promotion_id
        ? toCents(appointment.locked_promotion_discount)
        : 0
    const walkinPromoCents = currentWalkin && !emergencySale && currentQuote
        ? toCents(currentQuote.promotion_discount) : 0
    const activePromoCents = booked ? lockedPromoCents : walkinPromoCents
    const promoPercent = booked
        ? appointment?.locked_promotion_percent : currentQuote?.promotion_percent
    const promotionWins = activePromoCents > 0 &&
        activePromoCents >= loyaltyDiscountCents
    const discountCents = emergencySale ? 0 : (promotionWins ? activePromoCents : loyaltyDiscountCents)

    const netCents =
        subtotalCents - discountCents

    const balanceCents =
        netCents - toCents(deposit)
    // Current walk-in promotions come from the authenticated server quote.
    // The POST revalidates promotion identity and the exact final total.

    const unresolved =
        booked &&
        appointment &&
        ([
            "Awaiting Payment",
            "Awaiting Verification",
        ].includes(
            appointment.payment_status,
        ) ||
            (appointment.payment_status ===
                "Verified" &&
                !(deposit > 0)))

    const itemOptions = items
        .filter((row) =>
            productSale
                ? Number(row.stock) > 0
                : row.status === "Available",
        )
        .map((row) => ({
            value: String(
                productSale
                    ? row.id
                    : row.service_id,
            ),

            label: `${
                productSale
                    ? row.name
                    : row.service
            } — ${money(row.price)}${
                productSale
                    ? ` · ${row.stock} in stock`
                    : ""
            }`,
        }))

    const appointmentOptions = appointments.map(
        (row) => ({
            value: String(row.id),

            label:
                `#${row.id} · ` +
                `${row.customer_name} · ` +
                `${row.contact_number} · ` +
                `${row.service} · ` +
                `${row.appointment_date} ` +
                `${row.appointment_time}`,
        }),
    )

    function change(name, value) {
        setForm((previous) => ({
            ...previous,
            [name]: value,
        }))
    }

    function selectAppointment(id) {
        const row = appointments.find(
            (item) =>
                String(item.id) === id,
        )

        setForm((previous) => ({
            ...previous,
            appointmentId: id,
            customer:
                row?.customer_name || "",
            amount:
                row?.original_service_total ?? row?.service_total ?? "",
            quantity: "1",
            sale_type: "Service",
        }))
    }

    function selectItem(id) {
        const row = items.find(
            (item) =>
                String(
                    productSale
                        ? item.id
                        : item.service_id,
                ) === id,
        )

        setForm((previous) => ({
            ...previous,
            selectedId: id,
            quantity: "1",
            amount: row
                ? Number(row.price).toFixed(2)
                : "",
        }))
    }

    async function save(event) {
        event.preventDefault()

        if (lock.current) return

        setError("")
        setMessage("")
        const checkoutPhone = normalizeRequiredPhone(
            form.mode === "Appointment" ? appointment?.contact_number : form.customerContact
        )
        if (!checkoutPhone) {
            setError("A valid Philippine mobile number (09XXXXXXXXX) is required for every checkout, including Emergency Mode.")
            return
        }
        if (emergencySale && normalizeRequiredPhone(emergencySale.payload?.customer_contact) !== checkoutPhone) {
            setError("Phone number must match the original Emergency Mode record. Resolve the discrepancy before reconciling.")
            return
        }
        if (new URLSearchParams(window.location.search).has("emergency_offline_id") && !emergencySale) {
            setError("Emergency record is unavailable or already reconciled. Open normal POS without the emergency link to make a separate sale.")
            return
        }
        if (emergencySale) {
            if (emergencyChecking || emergencyCheck || !emergencyConfirmed ||
                (emergencySale.payload?.status === "Paid"
                    ? (!emergencyPaidAcknowledged || !emergencyCollected || toCents(emergencyCollected) !== netCents)
                    : (!emergencyPendingPaid || !emergencyCollected || toCents(emergencyCollected) !== netCents))) {
                setError("Complete the emergency review, payment acknowledgment, and duplicate check before saving.")
                return
            }
            if (form.mode !== "Walk-in" || form.sale_type !== "Service" || form.historicalDate ||
                form.payment !== (emergencySale.payload?.payment || "Cash")) {
                setError("Emergency service sales must use the current online walk-in checkout.")
                return
            }
            if (String(form.customer).trim().toLowerCase() !== String(emergencySale.payload?.customer || "").trim().toLowerCase()) {
                setError("Customer differs from the emergency record. Review the original details before continuing.")
                return
            }
            if (Number(form.quantity) !== 1 || !form.selectedId ||
                !services.some((item) => String(item.service_id) === String(form.selectedId) &&
                    String(item.service || "").trim().toLowerCase() === String(emergencySale.payload?.service || "").trim().toLowerCase())) {
                setError("Select the original service from the current catalog. Service name and quantity must match.")
                return
            }
            if (Number.isSafeInteger(Number(emergencySale.payload?.service_id)) && Number(emergencySale.payload.service_id) > 0 &&
                String(form.selectedId) !== String(emergencySale.payload.service_id)) {
                setError("Service differs from the emergency record. Do not submit this checkout.")
                return
            }
        }

        if (!navigator.onLine && !booked && !productSale && !form.historicalDate) {
            setError("Current walk-in service promotions require an online checkout. Please reconnect.")
            return
        }

        if (!navigator.onLine && booked) {
            setError(
                "Existing appointment checkout requires an internet connection. Emergency Mode supports walk-in service and product transactions."
            )
            return
        }

        if (
            !(Number(form.amount) > 0) ||
            !Number.isFinite(Number(form.amount)) ||
            (booked
                ? !appointment
                : !selectedItem || !form.customer.trim())
        ) {
            setError(
                "Select the booking or item and enter a valid sale subtotal."
            )
            return
        }

        if (currentWalkin && !emergencySale && navigator.onLine && (
            quotePending || walkinQuoteError || !currentQuote ||
            toCents(currentQuote.original_service_total) !== subtotalCents
        )) {
            setError("The current service price is not verified. Refresh the price preview before checkout.")
            return
        }

        if (emergencySale && (
            toCents(form.amount) !== toCents(emergencySale.payload.amount) ||
            toCents(selectedItem?.price) !== toCents(emergencySale.payload.amount)
        )) {
            setError("The recorded emergency amount differs from the current regular catalog price. Owner review is required; do not post.")
            return
        }
        if (unresolved || balanceCents < 0) {
            setError(
                "Resolve the deposit or excess payment before checkout."
            )
            return
        }

        const quantity =
            productSale && !booked
                ? Number(form.quantity)
                : 1

        if (
            !Number.isInteger(quantity) ||
            quantity < 1
        ) {
            setError(
                "Enter a valid whole-number quantity."
            )
            return
        }


        if (
            !booked &&
            productSale &&
            quantity > Number(selectedItem.stock)
        ) {
            setError(
                "The selected quantity exceeds available stock."
            )
            return
        }

        if (
            form.historicalDate &&
            form.historicalDate >= philippineDate()
        ) {
            setError(
                "Choose a past Philippine date for a historical sale."
            )
            return
        }

        if (
            form.payment === "Not recorded" &&
            (!form.historicalDate ||
                booked ||
                productSale)
        ) {
            setError(
                "An unrecorded payment method is allowed only for a historical service sale."
            )
            return
        }

        // Do not charge the regular price while an
        // eligible customer's reward status is unknown.
        if (
            navigator.onLine &&
            rewardLookupKey &&
            (
                rewardCheckPending ||
                loyaltyLoading ||
                loyaltyError
            )
        ) {
            setError(
                "Please wait for the loyalty lookup or resolve its error before checkout."
            )
            return
        }

        if (
            activeReward &&
            (
                !navigator.onLine ||
                !Number.isSafeInteger(
                    Number(activeReward.reward_id)
                )
            )
        ) {
            setError(
                "The issued loyalty reward could not be verified."
            )
            return
        }

        // Online reward redemption must never be queued
        // as an Emergency Mode transaction.
        const redeemingReward =
            Boolean(activeReward) && !emergencySale

        const payload = {
            appointment_id:
                booked
                    ? appointment.id
                    : null,

            customer:
                form.customer.trim(),

            service:
                booked
                    ? appointment.service
                    : productSale
                      ? selectedItem.name
                      : selectedItem.service,

            sale_type:
                booked
                    ? "Service"
                    : form.sale_type,

            item_id:
                !booked && productSale
                    ? selectedItem.id
                    : null,

            quantity,

            // This is the ORIGINAL subtotal.
            // The server calculates the actual discount.
            amount: Number(form.amount).toFixed(2),
            service_id: !booked && !productSale ? Number(selectedItem.service_id) : null,
            expected_promotion_id: currentWalkin && !emergencySale ? currentQuote?.promotion_id ?? null : null,
            expected_promotion_discount: currentWalkin && !emergencySale ? currentQuote?.promotion_discount ?? "0.00" : null,
            expected_sale_total: currentWalkin ? (netCents / 100).toFixed(2) : null,
            emergency_reconciliation: Boolean(emergencySale),
            emergency_review_confirmed: Boolean(emergencySale && emergencyConfirmed),
            offline_queued: Boolean(emergencySale),

            payment:
                form.payment,

            historical_date:
                !booked && !productSale
                    ? form.historicalDate || null
                    : null,

            status: "Paid",

            customer_contact: checkoutPhone,

            loyalty_reward_id:
                redeemingReward ? Number(activeReward.reward_id) : null,

            expected_deposit_amount:
                deposit.toFixed(2),
        }

        const fingerprint =
            JSON.stringify(payload)

        if (
            !retry.current ||
            retry.current.fingerprint !== fingerprint
        ) {
            retry.current = {
                fingerprint,
                id: crypto.randomUUID(),
            }
        }

        lock.current = true
        setBusy(true)

        try {
            const offlineId = emergencySale?.offline_id || retry.current.id
            if (emergencySale) {
                // Recheck immediately before POST; do not rely on a previous page-load check.
                const check = await request(`/transactions/offline/${encodeURIComponent(offlineId)}`)
                if (!check || typeof check.found !== "boolean") throw new Error("Duplicate check could not be confirmed. Checkout blocked.")
                if (check.found) {
                    await reconcileEmergencySale(offlineId, check.transaction)
                    setEmergencySale(null)
                    setEmergencyCheck(`Already on server as transaction #${check.transaction.transaction_id}. No new sale was created.`)
                    throw new Error("This emergency sale is already recorded. No second transaction was created.")
                }
            }

            if (!navigator.onLine) {
                if (redeemingReward) {
                    throw new Error(
                        "Loyalty rewards cannot be redeemed in Emergency Mode."
                    )
                }

                const queue = getOfflineQueue()

                const exists = queue.some(
                    (entry) =>
                        entry.offline_id === offlineId
                )

                if (!exists) {
                    queue.push({
                        offline_id: offlineId,
                        payload,
                        queued_at:
                            new Date().toISOString(),
                    })

                    saveOfflineQueue(queue)
                }

                const localReceipt = pendingRow({
                    offline_id: offlineId,
                    payload,
                })

                setTransactions((previous) => [
                    localReceipt,
                    ...previous.filter(
                        (row) =>
                            row.transaction_id !==
                            localReceipt.transaction_id
                    ),
                ])


                if (
                    productSale &&
                    payload.item_id
                ) {
                    setProducts((previous) =>
                        previous.map((product) =>
                            String(product.id) ===
                            String(payload.item_id)
                                ? {
                                      ...product,
                                      stock: Math.max(
                                          0,
                                          Number(
                                              product.stock || 0
                                          ) - quantity
                                      ),
                                  }
                                : product
                        )
                    )
                }

                setReceipt(localReceipt)
                setForm(freshForm())
                retry.current = null

                setMessage(
                    "Transaction saved in Emergency Mode. It will sync automatically when internet returns."
                )

                return
            }

            const result = await request(
                "/transactions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type":
                            "application/json",
                    },
                    body: JSON.stringify({
                        ...payload,
                        offline_id: offlineId,
                    }),
                }
            )

            // POST success is not sufficient: confirm the server history links this exact offline ID.
            if (emergencySale) {
                const verified = await request(`/transactions/offline/${encodeURIComponent(emergencySale.offline_id)}`)
                const matching = verified?.found && verified.transaction?.offline_id === emergencySale.offline_id &&
                    String(verified.transaction.transaction_id) === String(result.id) ? verified.transaction : null
                if (!matching) {
                    throw new Error(`Transaction #${result.id} may have saved, but its offline ID could not be verified. Do not resubmit; refresh/review first.`)
                }
                await reconcileEmergencySale(emergencySale.offline_id, matching)
                setEmergencySale(null)
                setEmergencyCheck(`Reconciled with verified server transaction #${result.id}.`)
                window.history.replaceState(null, "", window.location.pathname)
            }
            retry.current = null
            setForm(freshForm())
            setLoyalty(null)
            setRewardLookup(null)
            setReceipt(null)

            setMessage(
                result.reward_status === "redeemed"
                    ? "Transaction saved! Owner-issued loyalty reward redeemed successfully."
                    : "Transaction saved successfully."
            )

            const rows = await load()

            const saved = rows?.find(
                (row) =>
                    String(row.transaction_id) ===
                    String(result.id)
            )

            if (saved) {
                setReceipt(saved)
            } else {
                setMessage(
                    "Saved successfully. Refresh the history to view the receipt."
                )
            }
        } catch (err) {
            // Preserve existing Emergency Mode fallback
            // for ordinary walk-in and product sales.
            //
            // NEVER queue a transaction containing
            // an owner-issued loyalty reward.
            if (
                !emergencySale &&
                !navigator.onLine &&
                !redeemingReward &&
                !booked &&
                !currentWalkin
            ) {
                const offlineId =
                    retry.current?.id

                if (offlineId) {
                    const queue = getOfflineQueue()

                    const exists = queue.some(
                        (entry) =>
                            entry.offline_id === offlineId
                    )

                    if (!exists) {
                        queue.push({
                            offline_id: offlineId,
                            payload,
                            queued_at:
                                new Date().toISOString(),
                        })

                        saveOfflineQueue(queue)
                    }

                    const localReceipt = pendingRow({
                        offline_id: offlineId,
                        payload,
                    })

                    setTransactions((previous) => [
                        localReceipt,
                        ...previous.filter(
                            (row) =>
                                row.transaction_id !==
                                localReceipt.transaction_id
                        ),
                    ])

                    if (
                        productSale &&
                        payload.item_id
                    ) {
                        setProducts((previous) =>
                            previous.map((product) =>
                                String(product.id) ===
                                String(payload.item_id)
                                    ? {
                                          ...product,
                                          stock: Math.max(
                                              0,
                                              Number(
                                                  product.stock || 0
                                              ) - quantity
                                          ),
                                      }
                                    : product
                            )
                        )
                    }

                    setReceipt(localReceipt)
                    setForm(freshForm())
                    retry.current = null

                    setMessage(
                        "Connection was lost. Transaction was saved in Emergency Mode and will sync automatically."
                    )

                    return
                }
            }

            setError(err.message)
        } finally {
            lock.current = false
            setBusy(false)
        }
    }

    function printReceipt() {
        if (
            !receipt ||
            receipt.status !== "Paid"
        ) {
            return
        }

        const popup = window.open(
            "",
            "_blank",
            "width=460,height=700"
        )

        if (!popup) {
            setError(
                "Allow pop-ups to print the receipt."
            )
            return
        }

        const doc = popup.document

        doc.title =
            `Receipt ${receipt.transaction_id}`

        const style =
            doc.createElement("style")

        style.textContent = `
            body {
                max-width: 360px;
                margin: 24px auto;
                padding: 16px;
                font: 14px Arial;
            }
            h1 { font-size: 20px; }
            p {
                line-height: 1.6;
                overflow-wrap: anywhere;
            }
            button { padding: 10px; }
            @media print {
                button { display: none; }
            }
        `

        doc.head.appendChild(style)

        function line(tag, text) {
            const element =
                doc.createElement(tag)

            element.textContent = text
            doc.body.appendChild(element)

            return element
        }

        line(
            "h1",
            "Dahling’s Salon & Spa"
        )

        line(
            "p",
            `Receipt #${receipt.transaction_id}`
        )

        line(
            "p",
            dateLabel(
                receipt.transaction_date,
                receipt.historical_date_only
            )
        )

        line(
            "p",
            `Customer: ${receipt.customer}`
        )

        if (receipt.appointment_id) {
            line(
                "p",
                `Booking: #${receipt.appointment_id}`
            )
        }

        const purchasedItems = cartHistory[receipt.transaction_id]
        if (Array.isArray(purchasedItems) && purchasedItems.length > 0) {
            line("h2", "Purchased items")
            purchasedItems.forEach((item) => {
                line("p", `${item.name} (${item.type}) × ${item.quantity} — ${money(item.final_line_total)}`)
                if (Number(item.discount_amount || 0) > 0) {
                    line("p", `  Item discount: −${money(item.discount_amount)}`)
                }
            })
        } else {
            line("p", `Item / service: ${receipt.service}`)
            line("p", `Quantity: ${receipt.quantity ?? 1}`)
            if (receipt.sale_type === "Mixed") {
                line("p", "Item details unavailable. Check the on-screen receipt before printing.")
            }
        }

        if (
            Number(receipt.discount_amount || 0) > 0
        ) {
            line(
                "p",
                `Subtotal: ${money(
                    receipt.subtotal ?? receipt.amount
                )}`
            )

            line(
                "p",
                `${receipt.discount_type === "promotion" ? "Promotion discount" : "Loyalty discount"}: −${money(
                    receipt.discount_amount
                )}`
            )
        }

        line(
            "p",
            `Final sale total: ${money(
                receipt.amount
            )}`
        )

        line(
            "p",
            `Deposit previously paid: ${money(
                receipt.deposit_applied
            )}`
        )

        line(
            "p",
            `Balance collected: ${money(
                receipt.balance_collected
            )}`
        )

        if (
            Number(receipt.deposit_applied) > 0
        ) {
            line(
                "p",
                `Deposit method: ${
                    receipt.deposit_payment_method ||
                    "Recorded"
                }`
            )
        }

        if (
            Number(receipt.balance_collected) > 0
        ) {
            line(
                "p",
                `Balance payment method: ${
                    receipt.payment
                }`
            )
        }

        line(
            "p",
            `Status: ${
                receipt.offline_pending
                    ? "Pending sync"
                    : receipt.status
            }`
        )

        line(
            "p",
            "Thank you for visiting!"
        )

        const print = line(
            "button",
            "Print"
        )

        print.onclick = () => popup.print()
        popup.focus()
    }

    const todayRows = transactions.filter(
        (row) =>
            dayKey(row.transaction_date) ===
            dayKey(clock)
    )

    const paidToday = todayRows.filter(
        (row) => row.status === "Paid"
    )

    const salesToday = paidToday.reduce(
        (sum, row) =>
            sum + Number(row.amount || 0),
        0
    )

    const searchTerm =
        search.trim().toLowerCase()

    const filtered = transactions.filter(
        (row) =>
            [
                row.customer,
                row.customer_contact,
                row.customer_email,
                row.service,
                row.transaction_id,
                row.appointment_id,
                row.payment,
                row.status,
            ].some((value) =>
                String(value ?? "")
                    .toLowerCase()
                    .includes(searchTerm)
            )
    )

    const historyPageCount = Math.max(
        1,
        Math.ceil(
            filtered.length / HISTORY_PAGE_SIZE
        )
    )

    const currentHistoryPage = Math.min(
        historyPage,
        historyPageCount
    )

    const pageStart =
        (currentHistoryPage - 1) *
        HISTORY_PAGE_SIZE

    const visibleTransactions =
        filtered.slice(
            pageStart,
            pageStart + HISTORY_PAGE_SIZE
        )

    useEffect(() => {
        setHistoryPage(1)
    }, [search])

    const customerRecords = useMemo(() => {
        if (!searchTerm) return []

        const matches = transactions.filter(
            (row) =>
                [
                    row.customer,
                    row.customer_contact,
                    row.customer_email,
                ].some((value) =>
                    String(value ?? "")
                        .toLowerCase()
                        .includes(searchTerm)
                )
        )

        const grouped = new Map()

        for (const row of matches) {
            const key =
                String(
                    row.customer_contact || ""
                ).trim() ||
                String(
                    row.customer_email || ""
                ).trim().toLowerCase() ||
                String(
                    row.customer || ""
                ).trim().toLowerCase()

            if (!grouped.has(key)) {
                grouped.set(key, {
                    key,
                    customer: row.customer,
                    contact:
                        row.customer_contact ||
                        "Not recorded",
                    email:
                        row.customer_email ||
                        "Not recorded",
                    transactions: 0,
                    totalPaid: 0,
                    depositPaid: 0,
                    services: new Set(),
                    latestVisit:
                        row.transaction_date,
                    latestVisitDateOnly:
                        row.historical_date_only,
                })
            }

            const record = grouped.get(key)

            record.transactions += 1

            if (row.status === "Paid") {
                record.totalPaid +=
                    Number(row.amount || 0)

                record.depositPaid +=
                    Number(
                        row.deposit_applied || 0
                    )
            }

            if (row.service) {
                record.services.add(
                    row.service
                )
            }

            if (
                new Date(
                    row.transaction_date
                ).getTime() >
                new Date(
                    record.latestVisit
                ).getTime()
            ) {
                record.latestVisit =
                    row.transaction_date

                record.latestVisitDateOnly =
                    row.historical_date_only
            }
        }

        return Array.from(
            grouped.values()
        ).map((record) => ({
            ...record,
            services: Array.from(
                record.services
            ),
        }))
    }, [searchTerm, transactions])

    return (
        <div className="insightglow-pos min-w-0 space-y-6">
            <header className="pos-page-header flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-purple-950">
                        POS / Transactions
                    </h1>

                    <p className="mt-2 text-sm text-gray-500">
                        Record a sale or check out
                        an existing appointment.
                    </p>
                </div>

                <div className="flex flex-wrap gap-2">

                <button
                    disabled={loading || busy}
                    onClick={() => load()}
                    className={button}
                >
                    {loading
                        ? "Refreshing…"
                        : "Refresh"}
                </button>
                </div>
            </header>


            {loadError && (
                <p
                    role="alert"
                    className="rounded-xl bg-red-50 p-4 text-red-700"
                >
                    {loadError} Use Refresh
                    to try again.
                </p>
            )}

            {error && (
                <p
                    role="alert"
                    className="rounded-xl bg-red-50 p-4 text-red-700"
                >
                    {error}
                </p>
            )}

            {message && (
                <p
                    role="status"
                    className="rounded-xl bg-green-50 p-4 text-green-800"
                >
                    {message}
                </p>
            )}

            <div className="pos-metrics grid gap-4 md:grid-cols-3">
                {[
                    [
                        "Paid sales recorded today",
                        money(salesToday),
                    ],
                    [
                        "Transactions today",
                        todayRows.length,
                    ],
                    [
                        "Payment options",
                        "Cash / GCash",
                    ],
                ].map(([label, value], index) => (
                    <div
                        key={label}
                        className={panel}
                    >
                        <p className="text-sm text-gray-500">
                            {label}
                        </p>

                        <p className="mt-3 text-2xl font-bold text-purple-800">
                            {index < 2 &&
                            (loading || loadError)
                                ? "—"
                                : value}
                        </p>
                    </div>
                ))}
            </div>

            <section aria-label="Unified POS checkout" className="space-y-4">
                <div className="rounded-2xl border border-purple-200 bg-white p-3 sm:p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-xl font-bold text-purple-950">Checkout workspace</h2>
                            <p className="text-sm text-gray-500">Choose a sale type. All modes share the transaction history and receipts below.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="tablist" aria-label="Checkout mode">
                        {[
                            ["walkin", "Walk-in & Products", "Multi-item cart"],
                            ["appointment", "Appointments", "Booking & deposits"],
                            ["emergency", "Emergency Mode", "Offline & reconciliation"],
                        ].map(([key, title, description]) => (
                            <button key={key} type="button" role="tab" aria-selected={posTab === key}
                                onClick={() => {
                                    setPosTab(key)
                                    if (key === "appointment") setForm(previous => ({...previous, mode: "Appointment"}))
                                    if (key === "emergency") setForm(previous => ({...previous, mode: "Walk-in"}))
                                }}
                                className={`rounded-xl border px-4 py-3 text-left transition ${ posTab === key? "border-purple-500 bg-purple-100 text-purple-950" : "border-purple-100 bg-white text-slate-600 hover:bg-purple-50"}`}>
                                <span className="block text-sm font-bold">{title}</span>
                                <span className="block text-xs opacity-80">{description}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div hidden={posTab !== "walkin"}>
                    <StyleSyncMultiItemCheckoutModal
                        embedded open={true} onClose={() => {}}
                        onSaved={async result => {
                            setMessage(`Multi-item sale #${result.id} ${result.duplicate ? "was already recorded; no duplicate was created." : "saved successfully."}`)
                            try {
                                const rows = await load()
                                const saved = rows?.find(row => String(row.transaction_id) === String(result.id))
                                if (saved) setReceipt(saved)
                                await loadCartItems(result.id)
                            } catch (refreshError) { console.error("Sale saved; history refresh unavailable:", refreshError) }
                        }}
                        services={services} products={products}
                    />
                </div>
                <div id="legacy-checkout" hidden={posTab === "walkin"}>
                    <p className="mb-3 text-sm text-gray-600">
                       {posTab === "appointment"
                            ? "Existing appointment checkout: booking details, deposit deduction, and remaining balance."
                            : "Emergency and recovery checkout: original offline protections and duplicate reconciliation remain enabled."}
                    </p>
            <div className="pos-workspace">
                    <form onSubmit={save}>
                        <fieldset disabled={disabled} className="grid items-start gap-4 xl:grid-cols-3">
                            <section className={`${panel} min-w-0 space-y-4`} aria-label="Step 1: Select sale">
                                <h3 className="text-base font-bold text-purple-950">01 · {booked ? "Select booking" : "Sale details"}</h3>
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
                                        Search by name, contact,
                                        booking number, or service.
                                        Only eligible bookings
                                        appear here.
                                    </p>

                                    {appointment && (
                                        <div className="rounded-xl bg-purple-50 p-4 text-sm text-purple-900">
                                            <p className="font-semibold">
                                                {appointment.customer_name}
                                            </p>

                                            <p className="mt-1">
                                                {appointment.service}
                                            </p>

                                            <p className="mt-1">
                                                {appointment.appointment_date}
                                                {" · "}
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
                                                change(
                                                    "customer",
                                                    event.target.value
                                                )
                                            }
                                        />
                                    </Field>

                                    <Field label="Customer mobile number (required for checkout)">
                                        <input
                                            type="tel"
                                            required
                                            maxLength={30}
                                            autoComplete="tel"
                                            placeholder="e.g. 09XXXXXXXXX"
                                            className={input}
                                            value={form.customerContact}
                                            onChange={(event) =>
                                                change(
                                                    "customerContact",
                                                    event.target.value
                                                )
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
                                                    sale_type:
                                                        event.target.value,
                                                    historicalDate: "",
                                                    payment: "Cash",
                                                    selectedId: "",
                                                    quantity: "1",
                                                    amount: "",
                                                }))
                                            }}
                                        >
                                            <option value="Service">
                                                Service
                                            </option>
                                            <option value="Product">
                                                Product
                                            </option>
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

                                    {!productSale && (
                                        <Field label="Historical sale date (optional)">
                                            <input
                                                type="date"
                                                className={input}
                                                max={philippineDate()}
                                                value={form.historicalDate}
                                                onChange={(event) =>
                                                    setForm((previous) => ({
                                                        ...previous,
                                                        historicalDate:
                                                            event.target.value,
                                                        payment:
                                                            event.target.value
                                                                ? "Not recorded"
                                                                : "Cash",
                                                    }))
                                                }
                                            />

                                            <span className="mt-1 block text-xs text-gray-500">
                                                Leave blank for a sale
                                                made now. Historical
                                                sales do not redeem
                                                loyalty rewards.
                                            </span>
                                        </Field>
                                    )}

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
                                                    const quantity =
                                                        event.target.value

                                                    setForm((previous) => ({
                                                        ...previous,
                                                        quantity,
                                                        amount:
                                                            selectedItem
                                                                ? (
                                                                      Number(
                                                                          selectedItem.price
                                                                      ) *
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

                            </section>
                            <section className={`${panel} min-w-0 space-y-4`} aria-label="Step 2: Review sale">
                                <h3 className="text-base font-bold text-purple-950">02 · Current sale &amp; review</h3>
                                {posTab === "emergency" && !emergencySale && !emergencyCheck && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Emergency reconciliation requires a saved offline record. Open a pending emergency sale from the offline queue before confirming; do not use ordinary checkout as a substitute.</p>}
                            {(emergencySale || emergencyCheck) && (
                <section className="rounded-2xl border border-purple-300 bg-purple-50 p-5 text-sm text-purple-950 space-y-3">
                    <h2 className="text-lg font-bold">Emergency Mode · Online POS Review</h2>
                    {emergencySale && <>
                        <p className="break-all text-xs">Offline ID: {emergencySale.offline_id}</p>
                        <p><strong>Original:</strong> {emergencySale.payload.customer} · {emergencySale.payload.service} · cached ₱{Number(emergencySale.payload.amount || 0).toFixed(2)} · {emergencySale.payload.payment} · {emergencySale.payload.status}</p>
                        <p>Emergency Mode uses the recorded regular service price, without promotions. Verify the amount collected and check for issued loyalty rewards. Never collect payment twice.</p>
                        {emergencyChecking && <p>Checking server for duplicates…</p>}
                        {emergencyMatches.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                            <strong>Possible existing transactions — investigate before proceeding:</strong>
                            {emergencyMatches.slice(0, 8).map((row) => <p key={row.transaction_id}>#{row.transaction_id} · {row.customer} · {row.service} · ₱{row.amount} · {dateLabel(row.transaction_date)}</p>)}
                            <p>Same customer/service/day is only a warning, not proof. Check receipts and payment records.</p>
                        </div>}
                        <label className="block">Amount actually collected and verified (₱): <input type="number" min="0" step="0.01" value={emergencyCollected} onChange={(e) => setEmergencyCollected(e.target.value)} className="mt-1 w-full rounded-lg border border-purple-300 bg-white p-2" placeholder="Enter amount from cash/GCash receipt" /><span className="block text-xs mt-1">Must match the recorded regular-price total of {money(netCents / 100)}. If different, stop and resolve the difference before posting.</span></label>
                        {emergencySale.payload?.status === "Paid" && <label className="flex items-start gap-2"><input type="checkbox" checked={emergencyPaidAcknowledged} onChange={(e) => setEmergencyPaidAcknowledged(e.target.checked)} /> <span>I verified the amount already collected and the recorded regular price. No second payment will be collected automatically.</span></label>}
                        <label className="flex items-start gap-2"><input type="checkbox" checked={emergencyConfirmed} onChange={(e) => setEmergencyConfirmed(e.target.checked)} /><span>I reviewed potential duplicates, original service and customer, regular price, loyalty status, and payment status. This is a genuine sale that has not been recorded.</span></label>
                        {emergencySale.payload?.status !== "Paid" && <label className="flex items-start gap-2"><input type="checkbox" checked={emergencyPendingPaid} onChange={(e) => setEmergencyPendingPaid(e.target.checked)} /><span>This record was originally Pending. I confirm the full verified POS amount has now been collected using the recorded payment method, and I checked the payment evidence. Otherwise leave it in Needs Review.</span></label>}
                        <p className="font-medium">The final POS confirmation is disabled until these checks are completed.</p>
                    </>}
                    {emergencyCheck && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-amber-900">{emergencyCheck}</p>}
                </section>
            )}

                            <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h3 className="font-bold text-purple-950">
                                        Owner-issued loyalty reward
                                    </h3>

                                    <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-purple-700">
                                        Automatic checkout
                                    </span>
                                </div>

                                {!navigator.onLine ? (
                                    <p className="mt-3 text-amber-700">
                                        Loyalty rewards cannot be redeemed
                                        in Emergency Mode.
                                    </p>
                                ) : !rewardApplicable ? (
                                    <p className="mt-3 text-gray-600">
                                        Rewards apply only to current
                                        service checkouts.
                                    </p>
                                ) : !loyaltyContact ? (
                                    <p className="mt-3 text-gray-600">
                                        {booked
                                            ? "Select an appointment to check its issued reward."
                                            : "Enter the customer's contact number to check for an issued reward."}
                                    </p>
                                ) : loyaltyContact.length < 7 ? (
                                    <p className="mt-3 text-gray-600">
                                        Enter a valid contact number
                                        to check issued rewards.
                                    </p>
                                ) : (
                                    <>
                                        {(loyaltyLoading ||
                                            rewardCheckPending) && (
                                            <p className="mt-3 text-gray-600">
                                                Checking owner-issued rewards…
                                            </p>
                                        )}

                                        {loyaltyError && (
                                            <p className="mt-3 text-red-700">
                                                Reward lookup failed:{" "}
                                                {loyaltyError}
                                            </p>
                                        )}

                                        {!loyaltyLoading &&
                                            !rewardCheckPending &&
                                            !loyaltyError &&
                                            activeReward && (
                                                <div className="mt-3 space-y-2">
                                                    <p className="font-bold text-emerald-700">
                                                        Approved reward available!
                                                    </p>

                                                    <p className="text-purple-900">
                                                        Owner-issued discount:{" "}
                                                        <strong>
                                                            {approvedPercent}%
                                                        </strong>
                                                    </p>

                                                    <p className="text-purple-900">
                                                        Savings:{" "}
                                                        <strong>
                                                            {money(loyaltyDiscountCents / 100)}
                                                        </strong>
                                                    </p>

                                                    <p className="text-xs text-gray-600">
                                                        Reward #{activeReward.reward_id}
                                                        {" "}{promotionWins
                                                            ? "is preserved because the promotion wins."
                                                            : "will be redeemed only after successful checkout."}
                                                    </p>
                                                </div>
                                            )}

                                        {!loyaltyLoading &&
                                            !rewardCheckPending &&
                                            !loyaltyError &&
                                            !activeReward && (
                                                <p className="mt-3 text-gray-600">
                                                    {loyalty?.reason ||
                                                        "No active owner-issued reward."}
                                                    {" "}Regular price applies.
                                                </p>
                                            )}
                                    </>
                                )}
                            </div>

                            <Field label="Original sale price before promotion, loyalty and deposit (₱)">
                                <input
                                    required
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    className={input}
                                    value={form.amount}
                                    onChange={(event) =>
                                        change(
                                            "amount",
                                            event.target.value
                                        )
                                    }
                                />
                            </Field>

                            {currentWalkin && !emergencySale && navigator.onLine && (
                                <div className="rounded-xl border border-purple-100 bg-purple-50 p-3 text-sm">
                                    {quotePending && !walkinQuoteError
                                        ? "Checking today's walk-in service promotion…"
                                        : walkinQuoteError
                                          ? `Price preview failed: ${walkinQuoteError}. Re-select the service or refresh the page.`
                                          : currentQuote && toCents(currentQuote.original_service_total) !== subtotalCents
                                            ? "The service price differs from the server. Re-select the service or refresh before checkout."
                                            : currentQuote?.promotion_id
                                              ? `Active promotion: ${currentQuote.promotion_title || "Service promotion"} (${currentQuote.promotion_percent}% off).`
                                              : "No active walk-in promotion for this service today."}
                                </div>
                            )}

                            </section>
                            <section className={`${panel} min-w-0 space-y-4`} aria-label="Step 3: Customer and payment">
                                <h3 className="text-base font-bold text-purple-950">03 · Payment &amp; confirmation</h3>
                            <div className="space-y-3 rounded-xl bg-gray-50 p-4 text-sm">
                                <div className="flex justify-between gap-3">
                                    <span>Subtotal</span>
                                    <strong>
                                        {money(form.amount)}
                                    </strong>
                                </div>

                                <div className="flex justify-between gap-3 text-purple-700">
                                    <span>
                                        {promotionWins ? (booked ? "Locked promotion discount" : "Walk-in promotion discount") : approvedPercent > 0 ? "Loyalty discount" : "Discount"}
                                        {promotionWins
                                            ? ` (${promoPercent}%)`
                                            : approvedPercent > 0 ? ` (${approvedPercent}%)` : ""}
                                    </span>
                                    <strong>
                                        − {money(discountCents / 100)}
                                    </strong>
                                </div>

                                <div className="flex justify-between gap-3 font-semibold">
                                    <span>Final sale total</span>
                                    <strong>
                                        {currentWalkin && quotePending ? "Checking price…" : money(netCents / 100)}
                                    </strong>
                                </div>

                                <div className="flex justify-between gap-3 text-emerald-700">
                                    <span>Verified deposit</span>
                                    <strong>
                                        − {money(deposit)}
                                    </strong>
                                </div>

                                <div className="flex justify-between gap-3 border-t border-gray-200 pt-3 text-lg font-bold text-purple-900">
                                    <span>
                                        Balance to collect
                                    </span>
                                    <strong>
                                        {currentWalkin && quotePending ? "Checking price…" : money(balanceCents / 100)}
                                    </strong>
                                </div>
                            </div>

                            {unresolved && (
                                <p className="text-sm text-amber-700">
                                    This deposit needs payment review
                                    before checkout.
                                </p>
                            )}

                            {balanceCents < 0 && (
                                <p className="text-sm text-red-700">
                                    The deposit exceeds the final bill.
                                    Resolve the excess before saving.
                                </p>
                            )}

                            {balanceCents > 0 && (
                                <Field label="Payment method for the remaining balance">
                                    <select
                                        className={input}
                                        value={form.payment}
                                        onChange={(event) =>
                                            change(
                                                "payment",
                                                event.target.value
                                            )
                                        }
                                    >
                                        <option value="Cash">
                                            Cash
                                        </option>
                                        <option value="GCash">
                                            GCash
                                        </option>

                                        {!booked &&
                                            !productSale &&
                                            form.historicalDate && (
                                                <option value="Not recorded">
                                                    Not recorded
                                                </option>
                                            )}
                                    </select>
                                </Field>
                            )}

                            <p className="text-xs leading-relaxed text-gray-500">
                                {balanceCents === 0 &&
                                appointment
                                    ? "The verified deposit covers the final bill. No additional payment is due."
                                    : "Save only after the displayed balance has been received."}
                            </p>

                            <button
                                type="submit"
                                disabled={
                                    disabled ||
                                    (posTab === "emergency" && !emergencySale) ||
                                    Boolean(emergencySale && (emergencyChecking || emergencyCheck || !emergencyConfirmed || (emergencySale.payload?.status === "Paid" ? (!emergencyPaidAcknowledged || !emergencyCollected || toCents(emergencyCollected) !== netCents) : (!emergencyPendingPaid || !emergencyCollected || toCents(emergencyCollected) !== netCents)))) ||
                                    Boolean(unresolved) ||
                                    balanceCents < 0 ||
                                    Boolean(currentWalkin && (!navigator.onLine || (!emergencySale && (quotePending || walkinQuoteError || !currentQuote ||
                                        toCents(currentQuote.original_service_total) !== subtotalCents)))) ||
                                    Boolean(
                                        navigator.onLine &&
                                        rewardLookupKey &&
                                        (
                                            loyaltyLoading ||
                                            rewardCheckPending ||
                                            loyaltyError
                                        )
                                    )
                                }
                                className={`${button} w-full`}
                            >
                                {busy
                                    ? "Saving…"
                                    : "Confirm and save transaction"}
                            </button>
                            </section>
                        </fieldset>
                    </form>

                <section className={`${panel} mt-4`}>
                    <h2 className="text-lg font-bold text-purple-950">
                        Saved receipt
                    </h2>

                    {!receipt ? (
                        <p className="mt-5 rounded-xl border border-dashed border-purple-200 p-10 text-center text-sm text-gray-500">
                            Save a transaction or select View
                            in the history.
                        </p>
                    ) : (
                        <div className="mt-5 space-y-4 text-sm">
                            <p className="font-bold text-purple-800">
                                Dahling’s Salon & Spa
                            </p>

                            <p className="text-gray-500">
                                Receipt #{receipt.transaction_id}
                                {" · "}
                                {dateLabel(
                                    receipt.transaction_date,
                                    receipt.historical_date_only
                                )}
                            </p>

                            {Array.isArray(cartHistory[receipt.transaction_id]) && cartHistory[receipt.transaction_id].length > 0 && (
                                <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
                                    <p className="mb-2 font-semibold text-purple-950">Itemized purchase</p>
                                    {cartHistory[receipt.transaction_id].map((item, i) => (
                                        <div key={i} className="flex justify-between gap-2 py-1 text-xs">
                                            <span>{item.name} ({item.type}) × {item.quantity}</span>
                                            <strong>{money(item.final_line_total)}</strong>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {[
                                [
                                    "Customer",
                                    receipt.customer,
                                ],
                                [
                                    "Booking",
                                    receipt.appointment_id
                                        ? `#${receipt.appointment_id}`
                                        : "Walk-in / Product sale",
                                ],
                                [
                                    "Service / item",
                                    receipt.service,
                                ],
                                ...(Number(
                                    receipt.discount_amount || 0
                                ) > 0
                                    ? [
                                          [
                                              "Subtotal",
                                              money(
                                                  receipt.subtotal ??
                                                      receipt.amount
                                              ),
                                          ],
                                          [
                                              receipt.discount_type === "promotion" ? "Promotion discount" : "Loyalty discount",
                                              `−${money(
                                                  receipt.discount_amount
                                              )}`,
                                          ],
                                      ]
                                    : []),
                                [
                                    "Final total",
                                    money(receipt.amount),
                                ],
                                [
                                    "Deposit applied",
                                    money(
                                        receipt.deposit_applied
                                    ),
                                ],

                                [
                                    "Balance collected",
                                    money(
                                        receipt.balance_collected
                                    ),
                                ],
                                [
                                    "Balance payment",
                                    Number(
                                        receipt.balance_collected
                                    ) > 0
                                        ? receipt.payment
                                        : "No additional payment",
                                ],
                                [
                                    "Status",
                                    receipt.offline_pending
                                        ? "Pending sync"
                                        : receipt.status,
                                ],
                            ].map(([label, value]) => (
                                <div
                                    key={label}
                                    className="flex justify-between gap-4 border-b border-gray-100 pb-3"
                                >
                                    <span className="text-gray-500">
                                        {label}
                                    </span>

                                    <span className="text-right font-medium">
                                        {value}
                                    </span>
                                </div>
                            ))}

                            <button
                                onClick={printReceipt}
                                disabled={
                                    receipt.status !== "Paid"
                                }
                                className={button}
                            >
                                Print receipt
                            </button>
                        </div>
                    )}
                </section>
            </div>

                </div>
            </section>

            <section className={panel}>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-purple-500">
                            SALES RECORDS
                        </p>

                        <h2 className="text-lg font-bold text-purple-950">
                            Transaction history
                        </h2>

                        <p className="mt-1 text-xs text-gray-500">
                            Search and review recorded sales
                            and receipts.
                        </p>
                    </div>

                    <input
                        type="search"
                        aria-label="Search transaction history"
                        placeholder="Search name, contact, email, booking, or service…"
                        value={search}
                        onChange={(event) =>
                            setSearch(event.target.value)
                        }
                        className={`${input} md:max-w-sm`}
                    />
                </div>

                {searchTerm &&
                    customerRecords.length > 0 && (
                        <div className="mb-6">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h3 className="font-bold text-purple-950">
                                        Customer record
                                        {customerRecords.length > 1
                                            ? "s"
                                            : ""}
                                    </h3>

                                    <p className="mt-1 text-xs text-gray-500">
                                        Recorded transaction and
                                        service history matching
                                        your search.
                                    </p>
                                </div>

                                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                                    {customerRecords.length}
                                    {" "}customer match
                                    {customerRecords.length > 1
                                        ? "es"
                                        : ""}
                                </span>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-2">
                                {customerRecords.map(
                                    (record) => (
                                        <article
                                            key={record.key}
                                            className="rounded-xl border border-purple-100 bg-purple-50/40 p-4"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-bold text-purple-950">
                                                        {record.customer}
                                                    </p>

                                                    <p className="mt-1 text-xs text-gray-600">
                                                        Contact:{" "}
                                                        {record.contact}
                                                    </p>

                                                    <p className="mt-1 text-xs text-gray-600">
                                                        Email:{" "}
                                                        {record.email}
                                                    </p>
                                                </div>

                                                <p className="text-right text-xs text-gray-500">
                                                    Latest visit

                                                    <span className="mt-1 block font-semibold text-gray-700">
                                                        {dateLabel(
                                                            record.latestVisit,
                                                            record.latestVisitDateOnly
                                                        )}
                                                    </span>
                                                </p>
                                            </div>

                                            <div className="mt-4 grid grid-cols-3 gap-2 border-y border-purple-100 py-3 text-center">
                                                <div>
                                                    <p className="text-xs text-gray-500">
                                                        Transactions
                                                    </p>

                                                    <p className="mt-1 font-bold text-purple-900">
                                                        {record.transactions}
                                                    </p>
                                                </div>

                                                <div>
                                                    <p className="text-xs text-gray-500">
                                                        Total paid
                                                    </p>

                                                    <p className="mt-1 font-bold text-purple-900">
                                                        {money(
                                                            record.totalPaid
                                                        )}
                                                    </p>
                                                </div>

                                                <div>
                                                    <p className="text-xs text-gray-500">
                                                        Deposits
                                                    </p>

                                                    <p className="mt-1 font-bold text-emerald-700">
                                                        {money(
                                                            record.depositPaid
                                                        )}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="mt-3">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                    Services / items
                                                </p>

                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {record.services.map(
                                                        (service) => (
                                                            <span
                                                                key={service}
                                                                className="rounded-full bg-white px-3 py-2 text-xs text-purple-800 shadow-sm"
                                                            >
                                                                {service}
                                                            </span>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    )
                                )}
                            </div>
                        </div>
                    )}

                {cartHistoryError && <p role="alert" className="mb-3 text-sm text-red-700">{cartHistoryError}</p>}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1060px] text-left text-sm">
                        <thead className="bg-purple-50/70 text-[11px] font-bold uppercase tracking-wider text-purple-800">
                            <tr>
                                {[
                                    "Customer Record",
                                    "Service / Item",
                                    "Sale total",
                                    "Deposit",
                                    "Balance collected",
                                    "Payment",
                                    "Status",
                                    "Receipt",
                                ].map((title) => (
                                    <th
                                        key={title}
                                        className="px-3 py-4"
                                    >
                                        {title}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {visibleTransactions.map(
                                (row) => (
                                    <tr
                                        key={row.transaction_id}
                                        className="transition-colors odd:bg-white even:bg-purple-50/30 hover:bg-purple-50/70"
                                    >
                                        <td className="px-3 py-4">
                                            <p className="font-semibold text-purple-950">
                                                {row.customer}
                                            </p>

                                            <p className="mt-1 text-xs text-gray-500">
                                                {dateLabel(
                                                    row.transaction_date,
                                                    row.historical_date_only
                                                )}
                                            </p>

                                            {row.appointment_id && (
                                                <p className="mt-1 text-xs text-purple-600">
                                                    Booking #
                                                    {row.appointment_id}
                                                </p>
                                            )}

                                            {row.customer_contact && (
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {row.customer_contact}
                                                </p>
                                            )}

                                            {row.customer_email && (
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {row.customer_email}
                                                </p>
                                            )}
                                        </td>

                                        <td className="px-3 py-4">
                                            {row.service}
                                            {row.sale_type === "Mixed" && (
                                                <div className="mt-2">
                                                    <button type="button" className="text-xs font-semibold text-purple-700 underline" onClick={() => loadCartItems(row.transaction_id)}>View purchased items</button>
                                                    {Array.isArray(cartHistory[row.transaction_id]) && (
                                                        <ul className="mt-2 space-y-1 text-xs text-gray-700">
                                                            {cartHistory[row.transaction_id].map((item, i) => <li key={i}>{item.name} × {item.quantity} — {money(item.final_line_total)}</li>)}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-4 font-bold text-purple-950">
                                            {money(row.amount)}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-4 text-emerald-700">
                                            {money(
                                                row.deposit_applied
                                            )}
                                        </td>

                                        <td className="whitespace-nowrap px-3 py-4 font-semibold text-gray-800">
                                            {money(
                                                row.balance_collected
                                            )}
                                        </td>

                                        <td className="px-3 py-4 text-xs text-gray-600">
                                            {Number(
                                                row.deposit_applied
                                            ) > 0 && (
                                                <p>
                                                    Deposit:{" "}
                                                    {row.deposit_payment_method ||
                                                        "Recorded"}
                                                </p>
                                            )}

                                            {Number(
                                                row.balance_collected
                                            ) > 0 ? (
                                                <p
                                                    className={
                                                        Number(
                                                            row.deposit_applied
                                                        ) > 0
                                                            ? "mt-1"
                                                            : ""
                                                    }
                                                >
                                                    Balance:{" "}
                                                    {row.payment}
                                                </p>
                                            ) : (
                                                <p>
                                                    No additional payment
                                                </p>
                                            )}
                                        </td>

                                        <td className="px-3 py-4">
                                            <span
                                                className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                                                    row.offline_pending
                                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                                        : row.status === "Paid"
                                                          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                                                          : "border-purple-100 bg-purple-50 text-purple-700"
                                                }`}
                                            >
                                                {row.offline_pending
                                                    ? "Pending sync"
                                                    : row.status}
                                            </span>
                                        </td>

                                        <td className="px-3 py-4">
                                            <button
                                                onClick={() => {
                                                    setReceipt(row)
                                                    if (row.sale_type === "Mixed") loadCartItems(row.transaction_id)

                                                    window.scrollTo({
                                                        top: 0,
                                                        behavior: "smooth",
                                                    })
                                                }}
                                                className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 transition-colors hover:bg-purple-100"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                )
                            )}

                            {!filtered.length && (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="p-8 text-center text-gray-500"
                                    >
                                        {loading
                                            ? "Loading…"
                                            : "No transactions found."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-purple-100 pt-4">
                    <p
                        className="text-xs text-gray-500"
                        aria-live="polite"
                    >
                        {filtered.length === 0
                            ? "No matching transactions"
                            : `Showing ${
                                  pageStart + 1
                              }–${Math.min(
                                  pageStart +
                                      HISTORY_PAGE_SIZE,
                                  filtered.length
                              )} of ${
                                  filtered.length
                              } transactions`}
                    </p>

                    <div
                        className="flex items-center gap-2"
                        aria-label="Transaction history pagination"
                    >
                        <button
                            type="button"
                            onClick={() =>
                                setHistoryPage(1)
                            }
                            disabled={
                                currentHistoryPage === 1
                            }
                            className="rounded-lg border border-purple-100 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            First
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                setHistoryPage((page) =>
                                    Math.max(1, page - 1)
                                )
                            }
                            disabled={
                                currentHistoryPage === 1
                            }
                            className="rounded-lg border border-purple-100 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Previous
                        </button>

                        <span className="min-w-[75px] text-center text-xs font-semibold text-purple-950">
                            {currentHistoryPage}
                            {" / "}
                            {historyPageCount}
                        </span>

                        <button
                            type="button"
                            onClick={() =>
                                setHistoryPage((page) =>
                                    Math.min(
                                        historyPageCount,
                                        page + 1
                                    )
                                )
                            }
                            disabled={
                                currentHistoryPage ===
                                historyPageCount
                            }
                            className="rounded-lg border border-purple-100 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Next
                        </button>

                        <button
                            type="button"
                            onClick={() =>
                                setHistoryPage(
                                    historyPageCount
                                )
                            }
                            disabled={
                                currentHistoryPage ===
                                historyPageCount
                            }
                            className="rounded-lg border border-purple-100 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Last
                        </button>
                    </div>
                </div>
            </section>
        </div>
    )
}

export default AdminTransactions
