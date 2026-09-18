import Navbar from "../components/Navbar"

function Contact() {
  return (
    <div className="min-h-screen bg-pink-50">
      <Navbar />

      <section className="py-16 px-6">
        <div className="max-w-4xl mx-auto bg-white rounded-3xl shadow-xl p-10">
          <h1 className="text-5xl font-bold text-center text-purple-700 mb-4">
            Contact Us
          </h1>

          <p className="text-center text-gray-600 mb-10">
            Reach out to Dahling’s Salon & Spa for inquiries and appointments.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-pink-50 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-purple-700 mb-2">
                Facebook Page
              </h2>
              <a
                href="https://web.facebook.com/dahlingsescapesalonandspa"
                target="_blank"
                className="text-pink-600 hover:underline"
              >
                Dahling’s Escape Salon and Spa
              </a>
            </div>

            <div className="bg-pink-50 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-purple-700 mb-2">
                Contact Number
              </h2>
              <p className="text-gray-700">09695619380</p>
            </div>

            <div className="bg-pink-50 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-purple-700 mb-2">
                Address
              </h2>
              <p className="text-gray-700">
                Nichlos Plaza Roxas Avenue Brgy. Poblacion II, Sagay City,
                Philippines, 6122
              </p>
            </div>

            <div className="bg-pink-50 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-purple-700 mb-2">
                Business Hours
              </h2>
              <p className="text-gray-700">8:00 AM – 7:00 PM</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Contact