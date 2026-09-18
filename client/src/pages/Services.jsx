import { useEffect, useState } from "react"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import { Link } from "react-router-dom"

function Services() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  const API_URL = import.meta.env.VITE_API_URL

  useEffect(() => {
    fetch(`${API_URL}/services`)
      .then((res) => res.json())
      .then((data) => {
        const availableServices = Array.isArray(data)
          ? data.filter((service) => service.status === "Available")
          : []

        setServices(availableServices)
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [API_URL])

  const formatCategory = (category) => {
    const lowerCategory = category?.toLowerCase() || ""

    if (lowerCategory === "nails" || lowerCategory === "nail") {
      return "Nail Care"
    }

    if (lowerCategory === "face" || lowerCategory === "facial") {
      return "Facial Care"
    }

    if (lowerCategory.includes("hair")) {
      return "Hair Care"
    }

    if (lowerCategory.includes("spa") || lowerCategory.includes("massage")) {
      return "Spa & Massage"
    }

    return category || "Other Services"
  }

  const getServiceImage = (category) => {
    const lowerCategory = category?.toLowerCase() || ""

    if (lowerCategory.includes("hair")) {
      return "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e"
    }

    if (lowerCategory.includes("facial") || lowerCategory.includes("face")) {
      return "https://images.unsplash.com/photo-1515377905703-c4788e51af15"
    }

    if (lowerCategory.includes("spa") || lowerCategory.includes("massage")) {
      return "https://images.unsplash.com/photo-1544161515-4ab6ce6db874"
    }

    if (lowerCategory.includes("nail")) {
      return "https://images.unsplash.com/photo-1604654894610-df63bc536371"
    }

    return "https://images.unsplash.com/photo-1560066984-138dadb4c035"
  }

  const groupedServices = services.reduce((groups, service) => {
    const category = formatCategory(service.category)

    if (!groups[category]) {
      groups[category] = []
    }

    groups[category].push(service)

    return groups
  }, {})

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-100">
      <Navbar />

      <section className="py-16 px-8">
        <h1 className="text-5xl font-bold text-center text-purple-700 mb-4">
          Our Services
        </h1>

        <p className="text-center text-gray-600 mb-12">
          Choose a service and send your appointment request.
        </p>

        {loading ? (
          <p className="text-center text-gray-500">
            Loading services...
          </p>
        ) : services.length === 0 ? (
          <p className="text-center text-gray-500">
            No services available yet.
          </p>
        ) : (
          <div className="max-w-6xl mx-auto space-y-12">
            {Object.entries(groupedServices).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-3xl font-bold text-purple-700 mb-6 border-l-8 border-pink-500 pl-4">
                  {category}
                </h2>

                <div className="grid md:grid-cols-3 gap-8">
                  {items.map((service) => (
                    <div
                      key={service.service_id || service.id}
                      className="bg-white rounded-3xl shadow-lg overflow-hidden hover:scale-105 transition"
                    >
                      <img
                        src={
                          service.image_url
                            ? `${API_URL}${service.image_url}`
                            : getServiceImage(service.category)
                        }
                        alt={service.service || service.name}
                        className="w-full h-56 object-cover"
                      />

                      <div className="p-6 text-center">
                        <h3 className="text-2xl font-bold text-purple-700 mb-3">
                          {service.service || service.name}
                        </h3>

                        <p className="text-gray-600">
                          {service.description ||
                            `${formatCategory(service.category)} service available at Dahling’s Salon and Spa.`}
                        </p>

                        <p className="text-pink-500 font-bold mt-4">
                          ₱{Number(service.price || 0).toLocaleString()}
                        </p>

                        <p className="text-gray-500 mt-1">
                          {service.duration || "Duration not specified"}
                        </p>

                        <Link
                          to="/book"
                          state={{ selectedService: service.service || service.name }}
                          className="inline-block mt-5 bg-pink-500 hover:bg-pink-600 text-white px-5 py-2 rounded-full font-semibold"
                        >
                          Book This Service
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  )
}

export default Services