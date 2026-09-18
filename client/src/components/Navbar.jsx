import { Link } from "react-router-dom"

function Navbar() {
  return (
    <nav aria-label="Website navigation" className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-4 bg-purple-700 px-6 py-4 text-white">
      <Link to="/" className="text-2xl font-bold">Dahling&apos;s Salon & Spa</Link>
      <ul className="flex flex-wrap items-center gap-5 font-medium">
        <li><Link to="/">Home</Link></li>
        <li><Link to="/services">Services</Link></li>
        <li><Link to="/book">Book</Link></li>
        <li><Link to="/contact">Contact</Link></li>
        <li>
          <Link to="/admin-login" className="inline-block rounded-xl border border-purple-300 px-4 py-2 text-sm hover:bg-purple-800">
            Admin Login
          </Link>
        </li>
      </ul>
    </nav>
  )
}

export default Navbar
