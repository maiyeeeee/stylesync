import { useState } from "react"
import { Link } from "react-router-dom"
import { LuArrowUpRight, LuClock } from "react-icons/lu"
import { categoryFor, serviceImage } from "../lib/services"

export default function ServiceCard({ service }) {
    const [failedSource, setFailedSource] = useState(null)
    const source = serviceImage(service)
    return (
        <article className="service-card">
            <Link
                to="/book"
                state={{ selectedService: service.service, serviceId: service.service_id }}
                className="service-card-image"
                tabIndex={-1}
                aria-hidden="true"
            >
                <img
                    src={failedSource === source ? categoryFor(service.category).image : source}
                    alt=""
                    loading="lazy"
                    onError={() => setFailedSource(source)}
                />
                <span>{categoryFor(service.category).name}</span>
            </Link>
            <div className="service-card-body">
                <div className="service-card-meta">
                    <span>
                        <LuClock /> {service.duration_minutes || 60} min
                    </span>
                    <span>₱{Number(service.price || 0).toLocaleString("en-PH")}</span>
                </div>
                <h3>{service.service}</h3>
                <p>
                    {service.description ||
                        "A little time dedicated to looking and feeling your best."}
                </p>
                <Link
                    to="/book"
                    state={{ selectedService: service.service, serviceId: service.service_id }}
                    className="text-link"
                >
                    Book this service <LuArrowUpRight />
                </Link>
            </div>
        </article>
    )
}
