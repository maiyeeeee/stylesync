import { useCallback, useEffect, useState } from "react"
import { API_URL, ASSET_URL } from "./sessionApi"

export const serviceCategories = [
    {
        name: "Hair care",
        key: "hair",
        description: "A fresh cut. A new shade. A little confidence.",
        image: "/images/hair.jpg",
    },
    {
        name: "Nail care",
        key: "nail",
        description: "The finishing touch, down to your fingertips.",
        image: "/images/nails.jpg",
    },
    {
        name: "Spa & massage",
        key: "spa",
        description: "Slow down and let the everyday melt away.",
        image: "/images/spa.jpg",
    },
    {
        name: "Facial care",
        key: "face",
        description: "Thoughtful care for your natural glow.",
        image: "/images/facial.jpg",
    },
]

export function categoryFor(category = "") {
    const value = category.toLowerCase()
    if (/hair/.test(value)) return serviceCategories[0]
    if (/nail|manicure|pedicure/.test(value)) return serviceCategories[1]
    if (/spa|massage/.test(value)) return serviceCategories[2]
    if (/face|facial|skin/.test(value)) return serviceCategories[3]
    return { name: category || "Salon services", key: "other", image: "/images/salon.jpg" }
}

export function serviceImage(service) {
    if (!service.image_url) return categoryFor(service.category).image
    if (/^https?:\/\//i.test(service.image_url)) return service.image_url
    return `${ASSET_URL}/${service.image_url.replace(/^\/+/, "")}`
}

export function useServices() {
    const [services, setServices] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [revision, setRevision] = useState(0)
    const retry = useCallback(() => setRevision((value) => value + 1), [])
    useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError("")
        fetch(`${API_URL}/services`, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error("Our service menu couldn’t be loaded.")
                const data = await response.json()
                if (!Array.isArray(data)) throw new Error("Our service menu couldn’t be loaded.")
                setServices(data.filter((service) => service.status === "Available"))
            })
            .catch(() => {
                if (!controller.signal.aborted)
                    setError(
                        "Our service menu is temporarily unavailable. Please try again or call us for help planning your visit.",
                    )
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false)
            })
        return () => controller.abort()
    }, [revision])
    return { services, loading, error, retry }
}
