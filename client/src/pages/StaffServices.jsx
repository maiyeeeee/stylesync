import { useEffect, useMemo, useState } from "react"
import { LuLogOut, LuRefreshCw, LuSearch } from "react-icons/lu"

import Brand from "../components/Brand"
import { Button } from "../components/ui/button"
import { API_URL, apiFetch } from "../lib/sessionApi"

const peso = (value) =>
    Number(value || 0).toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
    })

export default function StaffServices() {
    const [services, setServices] = useState([])
    const [search, setSearch] = useState("")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [loggingOut, setLoggingOut] = useState(false)
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => {
        const controller = new AbortController()

        async function loadServices() {
            setLoading(true)
            setError("")

            try {
                const response = await apiFetch(`${API_URL}/services`, {
                    signal: controller.signal,
                })
                const data = await response.json()

                if (!response.ok) {
                    throw new Error(data.error || "Services could not be loaded.")
                }

                if (!Array.isArray(data)) {
                    throw new Error("The server returned an unexpected response.")
                }

                setServices(data)
            } catch (loadError) {
                if (loadError.name !== "AbortError") {
                    setError(loadError.message || "Services could not be loaded.")
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        loadServices()

        return () => controller.abort()
    }, [reloadKey])

    const visibleServices = useMemo(() => {
        const query = search.trim().toLowerCase()
        if (!query) return services

        return services.filter((service) =>
            [service.service, service.category, service.status]
                .some((value) => String(value || "").toLowerCase().includes(query)),
        )
    }, [search, services])

    async function logout() {
        setLoggingOut(true)

        try {
            await apiFetch(`${API_URL}/auth/logout`, { method: "POST" })
        } finally {
            localStorage.setItem("stylesync-logout-event", String(Date.now()))
            window.location.assign("/login")
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 text-slate-950">
            <header className="border-b border-purple-100 bg-white">
                <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 md:px-8">
                    <Brand />

                    <Button
                        type="button"
                        variant="outline"
                        disabled={loggingOut}
                        onClick={logout}
                    >
                        <LuLogOut aria-hidden="true" />
                        {loggingOut ? "Signing out…" : "Sign out"}
                    </Button>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-12">
                <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600">
                            Staff workspace
                        </p>
                        <h1 className="mt-2 font-display text-3xl font-medium md:text-4xl">
                            Service catalog
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                            View the salon's current services, prices, durations, and availability.
                            Service and staff schedule changes are managed by an owner or administrator.
                        </p>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        disabled={loading}
                        onClick={() => setReloadKey((key) => key + 1)}
                    >
                        <LuRefreshCw aria-hidden="true" className={loading ? "animate-spin" : ""} />
                        Refresh
                    </Button>
                </div>

                <section className="mt-8 overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm">
                    <div className="flex flex-col justify-between gap-4 border-b border-purple-100 p-5 md:flex-row md:items-center">
                        <div>
                            <h2 className="text-lg font-semibold">Services</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {visibleServices.length} of {services.length} services
                            </p>
                        </div>

                        <label className="relative block w-full md:max-w-sm">
                            <span className="sr-only">Search services</span>
                            <LuSearch
                                aria-hidden="true"
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search service or category"
                                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
                            />
                        </label>
                    </div>

                    {error ? (
                        <div className="p-8 text-center">
                            <p role="alert" className="text-sm text-red-600">{error}</p>
                            <Button
                                type="button"
                                className="mt-4"
                                onClick={() => setReloadKey((key) => key + 1)}
                            >
                                Try again
                            </Button>
                        </div>
                    ) : loading ? (
                        <p role="status" className="p-8 text-center text-sm text-slate-500">
                            Loading services…
                        </p>
                    ) : visibleServices.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-500">
                            No services match your search.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[720px] text-left text-sm">
                                <thead className="bg-purple-50/60 text-xs uppercase tracking-wide text-purple-900">
                                    <tr>
                                        <th className="px-5 py-3 font-semibold">Service</th>
                                        <th className="px-5 py-3 font-semibold">Category</th>
                                        <th className="px-5 py-3 font-semibold">Price</th>
                                        <th className="px-5 py-3 font-semibold">Duration</th>
                                        <th className="px-5 py-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {visibleServices.map((service) => (
                                        <tr key={service.service_id} className="hover:bg-slate-50/70">
                                            <td className="px-5 py-4 font-semibold text-slate-900">
                                                {service.service}
                                            </td>
                                            <td className="px-5 py-4 text-slate-600">
                                                {service.category || "Uncategorized"}
                                            </td>
                                            <td className="px-5 py-4 text-slate-700">
                                                {peso(service.price)}
                                            </td>
                                            <td className="px-5 py-4 text-slate-700">
                                                {Number(service.duration_minutes || 0)} min
                                            </td>
                                            <td className="px-5 py-4">
                                                <span
                                                    className={
                                                        service.status === "Available"
                                                            ? "rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700"
                                                            : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600"
                                                    }
                                                >
                                                    {service.status || "Unavailable"}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </div>
    )
}
