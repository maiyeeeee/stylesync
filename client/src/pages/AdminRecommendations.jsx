import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { API_URL, apiFetch } from "../lib/sessionApi"

const moduleLinks = {
  "/admin/inventory": "Review inventory",
  "/admin/services": "Review services",
  "/admin/staff": "Review staff schedules",
}

function priorityClass(priority) {
  if (priority === "High") {
    return "bg-red-100 text-red-800"
  }

  if (priority === "Medium") {
    return "bg-amber-100 text-amber-900"
  }

  return "bg-slate-100 text-slate-700"
}

function AdminRecommendations() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  const [priorityFilter, setPriorityFilter] = useState("All")
  const [updatedAt, setUpdatedAt] = useState(null)

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    setError("")

    async function loadRecommendations() {
      try {
        const response = await apiFetch(
          `${API_URL}/recommendations`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        )

        const result = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(
            result?.error || "Unable to load recommendations."
          )
        }

        if (
          !result ||
          typeof result !== "object" ||
          !Array.isArray(result.recommendations)
        ) {
          throw new Error(
            "Unexpected recommendations response. Please check the backend route."
          )
        }

        if (controller.signal.aborted) return

        setData(result)
        setUpdatedAt(new Date())
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(
            requestError.message ||
              "Unable to load recommendations. Please try again."
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadRecommendations()

    return () => controller.abort()
  }, [refresh])

  const refreshRecommendations = () =>
    setRefresh((previous) => previous + 1)

  const recommendations = data?.recommendations || []

  const filtered = recommendations.filter(
    (item) =>
      priorityFilter === "All" ||
      item.priority === priorityFilter
  )

  const priorities = [
    ...new Set(
      recommendations
        .map((item) => item.priority)
        .filter(Boolean)
    ),
  ]

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-gradient-to-br from-purple-950 via-purple-800 to-pink-700 p-6 text-white shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-purple-200">
              Decision support
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              Rule-based recommendations
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-purple-100">
              Review suggested actions based on recorded
              inventory levels and appointment activity.
            </p>

            {updatedAt && !loading && !error && (
              <p className="mt-4 text-xs text-purple-200">
                Updated{" "}
                {updatedAt.toLocaleTimeString("en-PH", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "Asia/Manila",
                })}{" "}
                · Philippine time
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={refreshRecommendations}
            className="rounded-xl border border-white px-4 py-2.5 text-sm font-semibold transition hover:bg-white hover:text-purple-900 disabled:cursor-wait disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh recommendations"}
          </button>
        </div>
      </header>

      {loading && (
        <div
          role="status"
          className="rounded-2xl border border-purple-100 bg-white p-6 text-purple-700"
        >
          Loading recommendations…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 p-4 text-sm text-red-800"
        >
          {error}

          <button
            type="button"
            disabled={loading}
            onClick={refreshRecommendations}
            className="ml-3 font-semibold underline"
          >
            Retry loading
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Stock alerts
              </p>

              <p className="mt-3 text-3xl font-bold text-red-700">
                {Number(data.criticalAlerts || 0)}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                Items at or below their reorder level
              </p>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Business suggestions
              </p>

              <p className="mt-3 text-3xl font-bold text-purple-900">
                {Number(data.businessSuggestions || 0)}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                Service-demand and staffing reviews
              </p>
            </div>

            <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Historically busiest days
              </p>

              <p className="mt-3 break-words text-xl font-bold text-purple-900">
                {data.peakDays && data.peakDays !== "N/A"
                  ? data.peakDays
                  : "No recorded activity"}
              </p>

              <p className="mt-2 text-xs text-gray-500">
                {data.period || "See the recommendation details for the period"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-purple-950">
                Suggested actions
              </h3>

              <p className="mt-1 text-sm text-gray-500">
                {filtered.length} of {recommendations.length}{" "}
                recommendations shown
              </p>
            </div>

            <label>
              <span className="mb-2 block text-xs font-semibold text-gray-500">
                Priority
              </span>

              <select
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value)
                }
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100"
              >
                <option value="All">All priorities</option>

                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!filtered.length ? (
            <div className="rounded-2xl border border-purple-100 bg-white p-8 text-center">
              <h4 className="font-semibold text-purple-950">
                {recommendations.length
                  ? "No recommendations match this priority."
                  : "No recommendations triggered."}
              </h4>

              <p className="mt-2 text-sm text-gray-500">
                {recommendations.length
                  ? "Select another priority to view the available suggestions."
                  : "Recommendations will appear when the recorded data meets a rule."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-2">
              {filtered.map((item, index) => {
                const actionLabel = moduleLinks[item.path]

                return (
                  <article
                    key={`${item.title}-${index}`}
                    className="flex min-w-0 flex-col rounded-2xl border border-purple-100 bg-white p-5 shadow-sm md:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h4 className="min-w-0 flex-1 break-words text-lg font-bold text-purple-950">
                        {item.title}
                      </h4>

                      <span
                        className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${priorityClass(
                          item.priority
                        )}`}
                      >
                        {item.priority || "Unspecified"} priority
                      </span>
                    </div>

                    <p className="mt-4 text-sm leading-relaxed text-gray-600">
                      {item.description}
                    </p>

                    {item.rule && (
                      <div className="mt-4 rounded-xl bg-purple-50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-purple-600">
                          Rule applied
                        </p>

                        <p className="mt-2 text-sm font-medium text-purple-900">
                          {item.rule}
                        </p>
                      </div>
                    )}

                    {actionLabel && (
                      <div className="mt-auto pt-5">
                        <Link
                          to={item.path}
                          className="inline-flex rounded-xl border border-purple-200 px-4 py-2.5 text-sm font-semibold text-purple-700 transition hover:bg-purple-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600"
                        >
                          {actionLabel} →
                        </Link>
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}

          <p className="text-xs leading-relaxed text-gray-500">
            Stock alerts use current inventory levels. Service
            and staffing suggestions use recorded appointment
            counts for the stated period. Recommendations are
            advisory; the salon owner decides which actions to take.
          </p>
        </>
      )}
    </div>
  )
}

export default AdminRecommendations