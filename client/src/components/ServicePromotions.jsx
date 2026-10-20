
import { useCallback, useEffect, useState } from "react";
import { API_URL, apiFetch } from "../lib/sessionApi";

const initialForm = {
  title: "",
  percent_off: "10",
  starts_on: "",
  ends_on: "",
  service_ids: [],
};

async function request(path, options = {}) {
  const response = await apiFetch(`${API_URL}${path}`, options);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || "Request failed.");
  }

  return data;
}

function formatDate(value) {
  if (!value) return "—";
  return String(value).slice(0, 10);
}

export default function ServicePromotions({
  services = [],
  isOwner = false,
}) {
  const [promotions, setPromotions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await request("/discounts/promotions");

      if (!Array.isArray(data)) {
        throw new Error("Invalid promotions response.");
      }

      setPromotions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  function toggleService(id) {
    const numericId = Number(id);

    setForm((previous) => ({
      ...previous,
      service_ids: previous.service_ids.includes(numericId)
        ? previous.service_ids.filter(
            (value) => value !== numericId
          )
        : [...previous.service_ids, numericId],
    }));
  }

  async function createPromotion(event) {
    event.preventDefault();

    if (!isOwner || busy) return;

    if (!form.service_ids.length) {
      setError("Choose at least one eligible service.");
      return;
    }

    if (form.ends_on < form.starts_on) {
      setError("End date cannot be before start date.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request("/discounts/promotions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title.trim(),
          percent_off: Number(form.percent_off),
          starts_on: form.starts_on,
          ends_on: form.ends_on,
          service_ids: form.service_ids,
        }),
      });

      setForm({ ...initialForm });
      setMessage("Promotion created successfully.");
      await loadPromotions();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(promotion) {
    if (!isOwner || busy) return;

    const nextStatus = !Boolean(
      Number(promotion.is_active)
    );

    setBusy(true);
    setError("");
    setMessage("");

    try {
      await request(
        `/discounts/promotions/${promotion.promotion_id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_active: nextStatus,
          }),
        }
      );

      setMessage("Promotion status updated.");
      await loadPromotions();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-600">
            Special offers
          </p>

          <h3 className="mt-1 text-xl font-bold text-purple-950">
            Service Promotions
          </h3>

          <p className="mt-1 text-sm text-gray-500">
            Create date-based offers for selected services.
            Only the owner can make changes.
          </p>
        </div>

        <button
          type="button"
          onClick={loadPromotions}
          disabled={busy || loading}
          className="rounded-xl border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-700 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {message}
        </p>
      )}

      {isOwner && (
        <form
          onSubmit={createPromotion}
          className="mb-6 rounded-2xl border border-purple-100 bg-purple-50/50 p-4"
        >
          <h4 className="mb-4 font-bold text-purple-950">
            Create Promotion
          </h4>

          <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700">
              Promotion title
              <input
                required
                maxLength={150}
                value={form.title}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    title: event.target.value,
                  }))
                }
                placeholder="October Hair Care Promo"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Discount (%)
              <input
                required
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={form.percent_off}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    percent_off: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              Start date
              <input
                required
                type="date"
                value={form.starts_on}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    starts_on: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>

            <label className="text-sm font-semibold text-gray-700">
              End date
              <input
                required
                type="date"
                min={form.starts_on || undefined}
                value={form.ends_on}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    ends_on: event.target.value,
                  }))
                }
                className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5"
              />
            </label>

            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-semibold text-gray-700">
                Eligible services
              </p>

              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-2">
                {services.map((service) => {
                  const id = Number(
                    service.service_id ?? service.id
                  );

                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-purple-50"
                    >
                      <input
                        type="checkbox"
                        checked={form.service_ids.includes(id)}
                        onChange={() => toggleService(id)}
                        className="accent-purple-700"
                      />

                      <span>
                        {service.service || service.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={busy || !services.length}
                className="rounded-xl bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
              >
                {busy ? "Saving..." : "Create Promotion"}
              </button>
            </div>
          </fieldset>
        </form>
      )}

      <h4 className="mb-3 font-bold text-purple-950">
        Existing Promotions
      </h4>

      {loading ? (
        <p className="text-sm text-gray-500">
          Loading promotions...
        </p>
      ) : promotions.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          No promotions created yet.
        </p>
      ) : (
        <div className="space-y-3">
          {promotions.map((promotion) => {
            const active = Boolean(
              Number(promotion.is_active)
            );

            const names = (promotion.service_ids || [])
              .map((id) =>
                services.find(
                  (service) =>
                    Number(
                      service.service_id ?? service.id
                    ) === Number(id)
                )
              )
              .map((service) =>
                service?.service || service?.name
              )
              .filter(Boolean);

            return (
              <div
                key={promotion.promotion_id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-purple-100 p-4"
              >
                <div className="space-y-1">
                  <p className="font-bold text-purple-950">
                    {promotion.title}
                  </p>

                  <p className="text-sm font-semibold text-purple-700">
                    {Number(promotion.percent_off)}% OFF
                  </p>

                  <p className="text-xs text-gray-500">
                    {formatDate(promotion.starts_on)}
                    {" to "}
                    {formatDate(promotion.ends_on)}
                  </p>

                  <p className="text-xs text-gray-600">
                    Services: {names.join(", ") || "Not found in current list"}
                  </p>

                  <p className={`text-xs font-semibold ${
                    active ? "text-green-700" : "text-gray-500"
                  }`}>
                    {active ? "Enabled" : "Disabled"}
                  </p>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => changeStatus(promotion)}
                    className="rounded-xl border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-700 disabled:opacity-50"
                  >
                    {active ? "Disable" : "Enable"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
