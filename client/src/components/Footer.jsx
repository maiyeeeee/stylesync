function Footer() {
  return (
    <footer className="bg-purple-700 text-white mt-16 px-8 py-8">
      <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-6 text-center md:text-left">
        <div>
          <h3 className="font-bold text-lg mb-2">Dahling’s Salon & Spa</h3>
          <p className="text-sm">Relieve, relax, and revive.</p>
        </div>

        <div>
          <h3 className="font-bold mb-2">Address</h3>
          <p className="text-sm">
            Nichlos Plaza Roxas Avenue Brgy. Poblacion II, Sagay City
          </p>
        </div>

        <div>
          <h3 className="font-bold mb-2">Contact</h3>
          <p className="text-sm">09695619380</p>
          <a
            href="https://web.facebook.com/dahlingsescapesalonandspa"
            target="_blank"
            className="text-sm underline"
          >
            Facebook Page
          </a>
        </div>

        <div>
          <h3 className="font-bold mb-2">Business Hours</h3>
          <p className="text-sm">8:00 AM – 7:00 PM</p>
        </div>
      </div>
    </footer>
  )
}

export default Footer