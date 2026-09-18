import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import hero from "../assets/dahling-logo.jpg"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"

function Home() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [imageErrors, setImageErrors] = useState({})

  const API_URL = import.meta.env.VITE_API_URL

  useEffect(() => {
    const fetchServices = async () => {
      try {
        setLoading(true)

        const response = await fetch(`${API_URL}/services`)

        if (!response.ok) {
          throw new Error("Failed to load services.")
        }

        const data = await response.json()

        const availableServices = Array.isArray(data)
          ? data.filter((service) => service.status === "Available")
          : []

        setServices(availableServices)
      } catch (error) {
        console.error("Unable to fetch services:", error)
        setServices([])
      } finally {
        setLoading(false)
      }
    }

    fetchServices()
  }, [API_URL])

  const getServiceImage = (category) => {
    const lowerCategory = category?.toLowerCase() || ""

    if (lowerCategory.includes("hair")) {
      return "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80"
    }

    if (
      lowerCategory.includes("facial") ||
      lowerCategory.includes("face") ||
      lowerCategory.includes("skin")
    ) {
      return "https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80"
    }

    if (
      lowerCategory.includes("spa") ||
      lowerCategory.includes("massage")
    ) {
      return "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80"
    }

    if (
      lowerCategory.includes("nail") ||
      lowerCategory.includes("manicure") ||
      lowerCategory.includes("pedicure")
    ) {
      return "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80"
    }

    return "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80"
  }

  const getUploadedImage = (imageUrl) => {
    if (!imageUrl) return null

    if (
      imageUrl.startsWith("http://") ||
      imageUrl.startsWith("https://")
    ) {
      return imageUrl
    }

    return `${API_URL}${imageUrl}`
  }

  const getImageSource = (service) => {
    if (
      service.image_url &&
      !imageErrors[service.service_id]
    ) {
      return getUploadedImage(service.image_url)
    }

    return getServiceImage(service.category)
  }

  const handleImageError = (serviceId) => {
    setImageErrors((previousErrors) => ({
      ...previousErrors,
      [serviceId]: true,
    }))
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fffafd]">
      <Navbar />

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-pink-50 via-white to-purple-100" />

          <div className="absolute -left-24 top-40 h-72 w-72 rounded-full bg-pink-300/20 blur-3xl" />

          <div className="absolute -right-24 top-16 h-96 w-96 rounded-full bg-purple-300/25 blur-3xl" />

          <div className="relative mx-auto grid min-h-[650px] max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 md:grid-cols-2 lg:px-12">
            {/* Hero Content */}
            <div className="text-center md:text-left">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-pink-200 bg-white/80 px-4 py-2 text-sm font-semibold text-pink-600 shadow-sm backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-pink-500" />
                Uncover the perfection within
              </div>

              <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-purple-900 sm:text-6xl lg:text-7xl">
                Dahling’s Escape 
                <span className="block bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-500 bg-clip-text text-transparent">
                  Salon and Spa
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg md:mx-0">
                Relax, recharge, and reveal your natural glow with personalized
                salon and spa treatments designed especially for you.
              </p>

              <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row md:justify-start">
                <Link
                  to="/book"
                  className="inline-flex min-h-14 items-center justify-center rounded-full bg-gradient-to-r from-purple-700 to-fuchsia-600 px-8 py-3 font-bold text-white shadow-lg transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  Book Appointment
                  <span className="ml-2">→</span>
                </Link>

                <Link
                  to="/services"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-purple-200 bg-white/80 px-8 py-3 font-bold text-purple-800 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-purple-400 hover:bg-purple-50 hover:shadow-lg"
                >
                  View Services
                </Link>
              </div>

              <div className="mt-9 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-medium text-slate-600 md:justify-start">
                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-pink-100 text-pink-600">
                    ✓
                  </span>
                  Quality care
                </span>

                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                    ✓
                  </span>
                  Relaxing experience
                </span>

                <span className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-600">
                    ✓
                  </span>
                  Personalized service
                </span>
              </div>
            </div>

           {/* Hero Logo */}
<div className="relative mx-auto mb-8 flex w-full max-w-lg items-center justify-center">
  <div className="absolute h-72 w-72 rounded-full bg-gradient-to-br from-pink-300/40 to-purple-300/40 blur-3xl sm:h-96 sm:w-96" />

  <div className="relative rounded-[2.5rem] border border-white/80 bg-white/70 p-5 shadow-2xl backdrop-blur sm:p-7">
    <img
      src={hero}
      alt="Dahling's Salon and Spa logo"
      className="aspect-square w-full max-w-[370px] rounded-[2rem] object-cover"
    />
  </div>

  <div className="absolute -bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-2xl border border-white bg-white/95 px-5 py-3 shadow-xl backdrop-blur">
    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-lg text-white">
      ✦
    </div>

    <div>
      <p className="text-xs font-medium text-slate-500">
        Salon & Spa
      </p>

      <p className="text-sm font-bold text-purple-900">
        Beauty meets relaxation
      </p>
    </div>
  </div>
</div>
          </div>
        </section>

        {/* Featured Services */}
        <section className="bg-white px-5 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-pink-500">
                Our specialties
              </p>

              <h2 className="text-4xl font-extrabold tracking-tight text-purple-900 sm:text-5xl">
                Featured Services
              </h2>

              <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg">
                Discover beauty, relaxation, and professional care in one
                welcoming place.
              </p>
            </div>

            {loading ? (
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-sm"
                  >
                    <div className="h-60 animate-pulse bg-slate-200" />

                    <div className="space-y-4 p-7">
                      <div className="h-6 w-2/3 animate-pulse rounded bg-slate-200" />
                      <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                      <div className="h-4 w-4/5 animate-pulse rounded bg-slate-200" />
                      <div className="h-12 w-full animate-pulse rounded-full bg-slate-200" />
                    </div>
                  </div>
                ))}
              </div>
            ) : services.length === 0 ? (
              <div className="mx-auto max-w-2xl rounded-3xl border border-purple-100 bg-purple-50 p-10 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white text-2xl shadow-sm">
                  ✦
                </div>

                <h3 className="text-xl font-bold text-purple-900">
                  No services available yet
                </h3>

                <p className="mt-2 text-slate-600">
                  Please check again soon or contact us for available salon and
                  spa treatments.
                </p>
              </div>
            ) : (
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {services.slice(0, 6).map((service) => (
                  <article
                    key={service.service_id}
                    className="group flex h-full flex-col overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-lg transition duration-500 hover:-translate-y-2 hover:shadow-2xl"
                  >
                    <div className="relative h-64 overflow-hidden">
                      <img
                        src={getImageSource(service)}
                        alt={service.service}
                        loading="lazy"
                        onError={() =>
                          handleImageError(service.service_id)
                        }
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                      />

                      <div className="absolute inset-0 bg-gradient-to-t from-purple-950/70 via-transparent to-transparent" />

                      <span className="absolute left-5 top-5 rounded-full bg-white/90 px-4 py-2 text-xs font-bold uppercase tracking-wide text-purple-800 shadow-sm backdrop-blur">
                        {service.category || "Salon Service"}
                      </span>

                      <p className="absolute bottom-5 left-5 text-lg font-bold text-white">
                        Starts at ₱
                        {Number(service.price || 0).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-1 flex-col p-7">
                      <h3 className="text-2xl font-extrabold text-purple-900">
                        {service.service}
                      </h3>

                      <p className="mt-3 flex-1 leading-7 text-slate-600">
                        {service.description ||
                          `${
                            service.category || "Salon"
                          } service available at Dahling’s Salon and Spa.`}
                      </p>

                      <Link
                        to="/book"
                        state={{
                          selectedService: service.service,
                          serviceId: service.service_id,
                        }}
                        className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-purple-50 px-5 py-3 font-bold text-purple-800 transition duration-300 hover:bg-purple-700 hover:text-white"
                      >
                        Book This Service
                        <span className="ml-2">→</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {services.length > 0 && (
              <div className="mt-14 text-center">
                <Link
                  to="/services"
                  className="inline-flex items-center justify-center rounded-full border border-purple-300 px-7 py-3 font-bold text-purple-800 transition duration-300 hover:bg-purple-700 hover:text-white"
                >
                  View All Services
                  <span className="ml-2">→</span>
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Call to Action */}
        <section className="bg-[#fffafd] px-5 py-20 sm:px-8 lg:px-12">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-purple-800 via-purple-700 to-fuchsia-600 px-7 py-14 text-center shadow-2xl sm:px-12 lg:py-20">
            <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full border-[40px] border-white/10" />

            <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-pink-400/20 blur-2xl" />

            <div className="relative mx-auto max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-pink-200">
                You deserve to feel your best
              </p>

              <h2 className="mt-4 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                Ready for your next self-care day?
              </h2>

              <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-purple-100 sm:text-lg">
                Reserve your appointment and let our team create a relaxing
                beauty experience especially for you.
              </p>

              <Link
                to="/book"
                className="mt-8 inline-flex min-h-14 items-center justify-center rounded-full bg-white px-8 py-3 font-bold text-purple-800 shadow-xl transition duration-300 hover:-translate-y-1 hover:bg-pink-50"
              >
                Schedule an Appointment
                <span className="ml-2">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

export default Home