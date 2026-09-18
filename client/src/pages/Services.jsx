import { useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LuArrowUpRight, LuPhone, LuSearch, LuSearchX, LuRefreshCw } from "react-icons/lu"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import ServiceCard from "../components/ServiceCard"
import { Button } from "../components/ui/button"
import { categoryFor, useServices } from "../lib/services"

export default function Services() {
    const { services, loading, error, retry } = useServices()
    const [params, setParams] = useSearchParams()
    const [search, setSearch] = useState("")
    const selected = params.get("category") || "all"
    const categories = [
        ...new Map(
            services.map((service) => {
                const category = categoryFor(service.category)
                return [category.key, category]
            }),
        ).values(),
    ]
    const filtered = services.filter(
        (service) =>
            (selected === "all" || categoryFor(service.category).key === selected) &&
            `${service.service} ${service.category} ${service.description || ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
    )
    return (
        <div className="public-site">
            <Navbar />
            <main id="main-content" tabIndex={-1}>
                <section className="page-intro site-container">
                    <p className="eyebrow">THE SERVICE MENU</p>
                    <h1>
                        Find your <em>feel-good.</em>
                    </h1>
                    <p>
                        A fresh look, a quiet moment, or a little of both.
                        <br />
                        Choose the care that feels right for you.
                    </p>
                </section>
                <section
                    className="site-container services-section"
                    aria-label="Available services"
                >
                    <div className="service-toolbar">
                        <div className="filter-tabs" aria-label="Filter by category">
                            <button aria-pressed={selected === "all"} onClick={() => setParams({})}>
                                All services
                            </button>
                            {categories.map((category) => (
                                <button
                                    key={category.key}
                                    aria-pressed={selected === category.key}
                                    onClick={() => setParams({ category: category.key })}
                                >
                                    {category.name}
                                </button>
                            ))}
                        </div>
                        <label className="search-field">
                            <LuSearch />
                            <input
                                type="search"
                                placeholder="Find your treatment…"
                                aria-label="Search services"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </label>
                    </div>
                    {loading ? (
                        <div className="services-grid" role="status" aria-label="Loading services">
                            {[1, 2, 3].map((key) => (
                                <div className="service-skeleton" key={key}>
                                    <div />
                                    <span />
                                    <span />
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="service-empty" role="alert">
                            <span className="empty-icon">
                                <LuRefreshCw />
                            </span>
                            <h2>A little pause in our menu</h2>
                            <p>{error}</p>
                            <div className="flex flex-wrap justify-center gap-3">
                                <Button onClick={retry}>
                                    <LuRefreshCw /> Try again
                                </Button>
                                <Button asChild variant="outline">
                                    <a href="tel:09695619380">
                                        <LuPhone /> Call the salon
                                    </a>
                                </Button>
                            </div>
                        </div>
                    ) : filtered.length ? (
                        <>
                            <p className="results-count" role="status">
                                {filtered.length}{" "}
                                {filtered.length === 1 ? "treatment" : "treatments"} for a little
                                more you
                            </p>
                            <div className="services-grid">
                                {filtered.map((service) => (
                                    <ServiceCard key={service.service_id} service={service} />
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="service-empty" role="status">
                            <span className="empty-icon">
                                <LuSearchX />
                            </span>
                            <h2>
                                {services.length
                                    ? "Let’s try something else"
                                    : "Your next visit starts here"}
                            </h2>
                            <p>
                                {services.length
                                    ? "No treatments match your search. Try another name or explore all services."
                                    : "Our online menu is being prepared. Call us to discover available treatments and plan your visit."}
                            </p>
                            {services.length ? (
                                <Button
                                    onClick={() => {
                                        setSearch("")
                                        setParams({})
                                    }}
                                >
                                    Show all services
                                </Button>
                            ) : (
                                <Button asChild>
                                    <a href="tel:09695619380">
                                        <LuPhone /> Call the salon
                                    </a>
                                </Button>
                            )}
                        </div>
                    )}
                    <div className="service-help">
                        <div>
                            <h3>Not sure where to start?</h3>
                            <p>Let’s find the right treatment for you.</p>
                        </div>
                        <a href="tel:09695619380" className="text-link">
                            Talk to our team <LuArrowUpRight />
                        </a>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
