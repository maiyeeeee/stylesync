import { useState } from "react"
import { Link } from "react-router-dom"
import { LuArrowUpRight, LuClock } from "react-icons/lu"
import { categoryFor, serviceImage } from "../lib/services"

export default function ServiceCard({ service, promotion = null }) {
    const [failedSource, setFailedSource] = useState(null)
    const source = serviceImage(service)

    const originalPrice = Number(service.price || 0)
    const discountPercent = Number(promotion?.percent_off || 0)

   const hasPromotion =
    Boolean(promotion) &&
    Number.isFinite(discountPercent) &&
    discountPercent > 0 &&
    discountPercent <= 100

    const discountedPrice = hasPromotion
        ? Math.round(
              originalPrice * (1 - discountPercent / 100) * 100
          ) / 100
        : originalPrice

    const formatPrice = (value) =>
        Number(value).toLocaleString("en-PH", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        })

    return (
        <article className="service-card">
            <Link
                to="/book"
                state={{
                    selectedService: service.service,
                    serviceId: service.service_id,
                }}
                className="service-card-image"
                tabIndex={-1}
                aria-hidden="true"
            >
                <img
                    src={
                        failedSource === source
                            ? categoryFor(service.category).image
                            : source
                    }
                    alt=""
                    loading="lazy"
                    onError={() => setFailedSource(source)}
                />

                <span>{categoryFor(service.category).name}</span>

                {hasPromotion && (
                    <span
                        style={{
                            position: "absolute",
                            top: "12px",
                            right: "12px",
                            left: "auto",
                            background: "#7e22ce",
                            color: "white",
                            borderRadius: "999px",
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: 700,
                        }}
                    >
                        {discountPercent}% OFF
                    </span>
                )}
            </Link>

            <div className="service-card-body">
                <div className="service-card-meta">
                    <span>
                        <LuClock /> {service.duration_minutes || 60} min
                    </span>

                    {hasPromotion ? (
                        <span>
                            <span
                                style={{
                                    textDecoration: "line-through",
                                    color: "#9ca3af",
                                    marginRight: "8px",
                                }}
                            >
                                ₱{formatPrice(originalPrice)}
                            </span>

                            <strong style={{ color: "#7e22ce" }}>
                                ₱{formatPrice(discountedPrice)}
                            </strong>
                        </span>
                    ) : (
                        <span>₱{formatPrice(originalPrice)}</span>
                    )}
                </div>

                <h3>{service.service}</h3>

                {hasPromotion && (
                    <p
                        style={{
                            color: "#7e22ce",
                            fontWeight: 600,
                            fontSize: "12px",
                        }}
                    >
                        {promotion.title}
                    </p>
                )}

                <p>
                    {service.description ||
                        "A little time dedicated to looking and feeling your best."}
                </p>

                <Link
                    to="/book"
                    state={{
                        selectedService: service.service,
                        serviceId: service.service_id,
                    }}
                    className="text-link"
                >
                    Book this service <LuArrowUpRight />
                </Link>
            </div>
        </article>
    )
}
