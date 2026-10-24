
import { useCallback, useEffect, useState } from "react"
import { API_URL, apiFetch } from "../lib/sessionApi"

const panel =
  "rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"

const field =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"

const primary =
  "rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"

const secondary =
  "rounded-xl border border-purple-200 px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"

const money = (n) =>
  Number(n || 0).toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
  })

const date = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—"

async function request(path, options) {
  const response = await apiFetch(
    `${API_URL}${path}`,
    options
  )

  const result = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(
      result?.error ||
      `Request failed (${response.status}).`
    )
  }

  return result
}

export default function AdminCustomers() {
  const [search, setSearch] = useState("")
  const [customers, setCustomers] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [profile, setProfile] = useState(null)

  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const [percent, setPercent] = useState("")
  const [reason, setReason] = useState("")
  const [editingId, setEditingId] = useState(null)

  const loadCustomers = useCallback(
    async (query = "") => {
      setLoading(true)

      try {
        const rows = await request(
          `/customers?search=${encodeURIComponent(query)}`
        )

        setCustomers(
          Array.isArray(rows) ? rows : []
        )
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const loadProfile = useCallback(
    async (customerId) => {
      if (!customerId) return

      setDetailLoading(true)

      try {
        const data = await request(
          `/customers/${customerId}`
        )

        setProfile(data)
      } catch (e) {
        setError(e.message)
        setProfile(null)
      } finally {
        setDetailLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    const timer = setTimeout(
      () => loadCustomers(search),
      300
    )

    return () => clearTimeout(timer)
  }, [search, loadCustomers])

  useEffect(() => {
    if (selectedId) {
      loadProfile(selectedId)
    }
  }, [selectedId, loadProfile])

  function selectCustomer(id) {
    setSelectedId(id)
    setProfile(null)
    setError("")
    setNotice("")
    setEditingId(null)
    setReason("")
    setPercent("")
  }

  // ==========================================
  // OWNER LOYALTY REWARD ACTIONS
  // ==========================================

  const policy = profile?.policy || null

  const activeReward = profile?.rewards?.find(
    (reward) => reward.reward_status === "issued"
  )

  const canIssue =
    Boolean(profile?.eligible) &&
    Number(profile?.matching_profiles) === 1 &&
    !activeReward &&
    Boolean(policy?.enabled)

  const suggestedPercent = Number(
    policy?.suggested_percent || 10
  )

  const maxPercent = Number(
    policy?.max_override_percent || 30
  )

  function resetRewardForm() {
    setEditingId(null)
    setPercent("")
    setReason("")
  }

  function startEditReward(reward) {
    if (reward.reward_status !== "issued") {
      return
    }

    setEditingId(reward.reward_id)
    setPercent(String(reward.reward_percent))
    setReason(reward.issue_reason || "")
    setError("")
    setNotice("")
  }

  async function refreshCustomerData() {
    await Promise.all([
      loadCustomers(search),
      loadProfile(selectedId),
    ])
  }

  async function issueReward() {
    if (!selectedId || !canIssue || saving) {
      return
    }

    const chosenPercent =
      percent.trim() === ""
        ? suggestedPercent
        : Number(percent)

    if (
      !Number.isFinite(chosenPercent) ||
      chosenPercent <= 0 ||
      chosenPercent > maxPercent
    ) {
      setError(
        `Enter a discount greater than 0% and not above ${maxPercent}%.`
      )
      return
    }

    setSaving(true)
    setError("")
    setNotice("")

    try {
      await request(
        `/customers/${selectedId}/rewards`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reward_percent: chosenPercent,
            issue_reason: reason.trim(),
          }),
        }
      )

      setNotice(
        `${chosenPercent}% loyalty reward issued successfully. It will become available for POS redemption after checkout integration.`
      )

      resetRewardForm()
      await refreshCustomerData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveRewardEdit() {
    if (!selectedId || !editingId || saving) {
      return
    }

    const chosenPercent = Number(percent)

    if (
      !Number.isFinite(chosenPercent) ||
      chosenPercent <= 0 ||
      chosenPercent > maxPercent
    ) {
      setError(
        `Enter a discount greater than 0% and not above ${maxPercent}%.`
      )
      return
    }

    if (!reason.trim()) {
      setError(
        "Please enter a reason for editing this reward."
      )
      return
    }

    setSaving(true)
    setError("")
    setNotice("")

    try {
      await request(
        `/customers/${selectedId}/rewards/${editingId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "edit",
            reward_percent: chosenPercent,
            issue_reason: reason.trim(),
          }),
        }
      )

      setNotice(
        "Loyalty reward updated successfully."
      )

      resetRewardForm()
      await refreshCustomerData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function revokeReward(rewardId) {
    if (!selectedId || saving) {
      return
    }

    const confirmed = window.confirm(
      "Revoke this loyalty reward? It will no longer be available for checkout."
    )

    if (!confirmed) {
      return
    }

    setSaving(true)
    setError("")
    setNotice("")

    try {
      await request(
        `/customers/${selectedId}/rewards/${rewardId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "revoke",
          }),
        }
      )

      setNotice(
        "Loyalty reward revoked successfully."
      )

      resetRewardForm()
      await refreshCustomerData()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ==========================================
  // CUSTOMER INTELLIGENCE DASHBOARD
  // ==========================================

  const selectedCustomer = profile?.customer
  const stats = profile?.stats || {}

  const totalCustomers = customers.length

  const totalVisits = customers.reduce(
    (sum, customer) =>
      sum + Number(customer.paid_service_visits || 0),
    0
  )

  const totalSpending = customers.reduce(
    (sum, customer) =>
      sum + Number(customer.total_spending || 0),
    0
  )

  const totalActiveRewards = customers.reduce(
    (sum, customer) =>
      sum + Number(customer.active_rewards || 0),
    0
  )

  return (
    <div className="min-h-screen bg-[#faf8ff] p-4 text-gray-800 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* PAGE HEADER */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">
              StyleSync · Salon Management
            </p>
            <h1 className="mt-2 text-2xl font-bold text-purple-950 sm:text-3xl">
              Customer Intelligence
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Understand customer visits, spending, and loyalty rewards.
            </p>
          </div>

          <button
            type="button"
            className={secondary}
            onClick={() => {
              setError("")
              setNotice("")
              loadCustomers(search)
              if (selectedId) loadProfile(selectedId)
            }}
          >
            Refresh Data
          </button>
        </div>

        {/* STATUS MESSAGES */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
          >
            {notice}
          </div>
        )}

        {/* SUMMARY CARDS */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Customers Shown",
              value: totalCustomers,
            },
            {
              label: "Paid Service Visits",
              value: totalVisits,
            },
            {
              label: "Recorded Spending",
              value: money(totalSpending),
            },
            {
              label: "Issued Rewards",
              value: totalActiveRewards,
            },
          ].map((card) => (
            <div key={card.label} className={panel}>
              <p className="text-sm font-medium text-gray-500">
                {card.label}
              </p>
              <p className="mt-3 text-2xl font-bold text-purple-900">
                {card.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">

          {/* CUSTOMER DIRECTORY */}
          <section className={`${panel} h-fit`}>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-purple-950">
                Customer Directory
              </h2>
              <p className="mt-1 text-xs text-gray-500">
                Search registered salon customers.
              </p>
            </div>

            <input
              type="search"
              className={field}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, contact, or email..."
              aria-label="Search customers"
            />

            <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  Loading customers...
                </p>
              ) : customers.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No customers found.
                </p>
              ) : (
                customers.map((customer) => (
                  <button
                    key={customer.customer_id}
                    type="button"
                    onClick={() =>
                      selectCustomer(customer.customer_id)
                    }
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      Number(selectedId) ===
                      Number(customer.customer_id)
                        ? "border-purple-400 bg-purple-50"
                        : "border-gray-100 bg-white hover:border-purple-200 hover:bg-purple-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {customer.customer_name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {customer.contact_number}
                        </p>
                      </div>

                      {Number(customer.active_rewards) > 0 && (
                        <span className="shrink-0 rounded-full bg-purple-100 px-2 py-1 text-[10px] font-bold text-purple-700">
                          Reward issued
                        </span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
                      <span>
                        {Number(customer.paid_service_visits || 0)} visits
                      </span>
                      <span>
                        {money(customer.total_spending)}
                      </span>
                    </div>

                    {Number(customer.matching_profiles) > 1 && (
                      <p className="mt-2 text-xs text-amber-700">
                        Duplicate contact — review before issuing rewards.
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </section>

          {/* CUSTOMER PROFILE */}
          <div className="space-y-6">
            {!selectedId ? (
              <section className={`${panel} py-20 text-center`}>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-100 text-2xl">
                  💜
                </div>
                <h2 className="text-lg font-semibold text-purple-950">
                  Select a customer
                </h2>
                <p className="mt-2 text-sm text-gray-500">
                  Choose a customer to view their visit history,
                  spending, and loyalty rewards.
                </p>
              </section>
            ) : detailLoading ? (
              <section className={`${panel} py-20 text-center`}>
                <p className="text-sm text-gray-500">
                  Loading customer profile...
                </p>
              </section>
            ) : !profile ? (
              <section className={`${panel} py-16 text-center`}>
                <p className="text-sm text-gray-500">
                  Customer profile unavailable.
                </p>
              </section>
            ) : (
              <>
                {/* PROFILE DETAILS */}
                <section className={panel}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-purple-500">
                        Customer Profile
                      </p>
                      <h2 className="mt-2 text-xl font-bold text-purple-950">
                        {selectedCustomer?.customer_name}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        {selectedCustomer?.contact_number}
                      </p>
                      {selectedCustomer?.email && (
                        <p className="text-sm text-gray-500">
                          {selectedCustomer.email}
                        </p>
                      )}
                    </div>

                    <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                      {selectedCustomer?.customer_type || "Regular"}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-purple-50 p-4">
                      <p className="text-xs text-purple-600">
                        Paid Service Visits
                      </p>
                      <p className="mt-2 text-2xl font-bold text-purple-950">
                        {Number(stats.paid_service_visits || 0)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-purple-50 p-4">
                      <p className="text-xs text-purple-600">
                        Total Spending
                      </p>
                      <p className="mt-2 text-xl font-bold text-purple-950">
                        {money(stats.total_spending)}
                      </p>
                    </div>

                    <div className="rounded-xl bg-purple-50 p-4">
                      <p className="text-xs text-purple-600">
                        Last Service Visit
                      </p>
                      <p className="mt-2 text-sm font-bold text-purple-950">
                        {date(stats.last_service_visit)}
                      </p>
                    </div>
                  </div>
                </section>

                {/* LOYALTY REWARDS */}
                <section className={panel}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-purple-950">
                        Loyalty Rewards
                      </h2>
                      <p className="mt-1 text-sm text-gray-500">
                        Owner-approved, one-time rewards.
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        profile.eligible
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {profile.eligible
                        ? "Eligible"
                        : "Not yet eligible"}
                    </span>
                  </div>

                  {policy && (
                    <p className="mt-3 text-xs text-gray-500">
                      Policy: {Number(policy.min_paid_visits)} paid
                      service visits · Suggested{" "}
                      {Number(policy.suggested_percent)}% · Maximum{" "}
                      {Number(policy.max_override_percent)}%
                    </p>
                  )}

                  {Number(profile.matching_profiles) > 1 && (
                    <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                      Multiple customer profiles use this contact number.
                      Reward issuance is disabled until this is resolved.
                    </p>
                  )}

                  {/* ISSUE OR EDIT FORM */}
                  {(canIssue || editingId) && (
                    <div className="mt-5 rounded-xl border border-purple-100 bg-purple-50/60 p-4">
                      <h3 className="text-sm font-semibold text-purple-950">
                        {editingId
                          ? "Edit Issued Reward"
                          : "Issue Loyalty Reward"}
                      </h3>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-medium text-gray-600">
                          Discount Percentage
                          <input
                            type="number"
                            min="0.01"
                            max={maxPercent}
                            step="0.01"
                            value={percent}
                            onChange={(e) =>
                              setPercent(e.target.value)
                            }
                            placeholder={String(suggestedPercent)}
                            className={`mt-1 ${field}`}
                          />
                        </label>

                        <label className="block text-xs font-medium text-gray-600">
                          Reason
                          <input
                            type="text"
                            maxLength={255}
                            value={reason}
                            onChange={(e) =>
                              setReason(e.target.value)
                            }
                            placeholder={
                              editingId
                                ? "Reason for adjustment"
                                : "Optional note"
                            }
                            className={`mt-1 ${field}`}
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={primary}
                          disabled={saving}
                          onClick={
                            editingId
                              ? saveRewardEdit
                              : issueReward
                          }
                        >
                          {saving
                            ? "Saving..."
                            : editingId
                              ? "Save Changes"
                              : "Issue Reward"}
                        </button>

                        {editingId && (
                          <button
                            type="button"
                            className={secondary}
                            disabled={saving}
                            onClick={resetRewardForm}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* REWARD HISTORY */}
                  <div className="mt-5 space-y-3">
                    {(profile.rewards || []).length === 0 ? (
                      <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                        No loyalty rewards issued yet.
                      </p>
                    ) : (
                      profile.rewards.map((reward) => (
                        <div
                          key={reward.reward_id}
                          className="rounded-xl border border-gray-100 p-4"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-purple-950">
                                {Number(reward.reward_percent)}% Reward
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                Issued {date(reward.issued_at)}
                              </p>
                              {reward.issue_reason && (
                                <p className="mt-1 text-xs text-gray-500">
                                  {reward.issue_reason}
                                </p>
                              )}
                            </div>

                            <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold capitalize text-purple-700">
                              {reward.reward_status}
                            </span>
                          </div>

                          {reward.reward_status === "issued" && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                className={secondary}
                                disabled={saving}
                                onClick={() =>
                                  startEditReward(reward)
                                }
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                className="rounded-xl border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                disabled={saving}
                                onClick={() =>
                                  revokeReward(reward.reward_id)
                                }
                              >
                                Revoke
                              </button>
                            </div>
                          )}

                          {reward.redeemed_transaction_id && (
                            <p className="mt-3 text-xs text-gray-500">
                              Redeemed in transaction #
                              {reward.redeemed_transaction_id}
                              {" · "}
                              {date(reward.redeemed_at)}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* FAVORITE SERVICES */}
                <section className={panel}>
                  <h2 className="text-lg font-bold text-purple-950">
                    Favorite Services
                  </h2>

                  <div className="mt-4 space-y-3">
                    {(profile.favorite_services || []).length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No paid service visits recorded yet.
                      </p>
                    ) : (
                      profile.favorite_services.map((item, index) => (
                        <div
                          key={`${item.service}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-xl bg-purple-50/60 p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-800">
                              {item.service}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              {Number(item.visits)} visits
                            </p>
                          </div>

                          <span className="shrink-0 text-sm font-semibold text-purple-800">
                            {money(item.spending)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* TRANSACTION HISTORY */}
                <section className={panel}>
                  <h2 className="text-lg font-bold text-purple-950">
                    Transaction History
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Latest 100 recorded transactions for this contact.
                  </p>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500">
                          <th className="py-3 pr-3 font-semibold">
                            Date
                          </th>
                          <th className="py-3 pr-3 font-semibold">
                            Service / Item
                          </th>
                          <th className="py-3 pr-3 font-semibold">
                            Type
                          </th>
                          <th className="py-3 pr-3 font-semibold">
                            Amount
                          </th>
                          <th className="py-3 font-semibold">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {(profile.transactions || []).map((transaction) => (
                          <tr
                            key={transaction.transaction_id}
                            className="border-b border-gray-50"
                          >
                            <td className="py-3 pr-3 text-gray-500">
                              {date(transaction.transaction_date)}
                            </td>
                            <td className="py-3 pr-3 font-medium text-gray-800">
                              {transaction.sale_type === "Mixed" && transaction.items?.length ? (
                                <div className="space-y-1">
                                  <div className="font-semibold text-purple-900">One checkout · {transaction.items.length} items</div>
                                  {transaction.items.map((item, index) => (
                                    <div key={`${transaction.transaction_id}-${index}`} className="text-xs text-gray-600">
                                      {item.name} ({item.type}) ×{item.quantity} · {money(item.line_total)}
                                    </div>
                                  ))}
                                </div>
                              ) : transaction.service}
                            </td>
                            <td className="py-3 pr-3 text-gray-500">
                              {transaction.sale_type}
                            </td>
                            <td className="py-3 pr-3 font-semibold text-purple-900">
                              {money(transaction.amount)}
                            </td>
                            <td className="py-3">
                              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
                                {transaction.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {(profile.transactions || []).length === 0 && (
                      <p className="py-8 text-center text-sm text-gray-500">
                        No transactions found for this customer.
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
