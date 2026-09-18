import { Link } from "react-router-dom"
import logo from "../assets/dahling-logo.jpg"
import "./AuthLayout.css"

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <main className="dahling-auth">
      <div className="auth-orb auth-orb-one" aria-hidden="true" />
      <div className="auth-orb auth-orb-two" aria-hidden="true" />

      <div className="auth-topline">
        <Link to="/" className="auth-back">
          ← Back to website
        </Link>

        <span>DAHLING’S · TEAM PORTAL</span>
      </div>

      <section className="auth-frame" aria-label="Salon account access">
        <aside className="auth-brand">
          <div className="auth-brand-top">
            <span className="auth-mark">D</span>

            <span>
              DAHLING’S ESCAPE
              <br />
              <small>SALON & SPA</small>
            </span>
          </div>

          <div className="auth-brand-copy">
            <span className="auth-eyebrow">A SPACE FOR OUR TEAM</span>

            <h2>
              A little care.
              <br />
              A smoother day.
            </h2>

            <p>
              Appointments, services, and the people who make every salon
              visit special—all in one place.
            </p>
          </div>

          <div className="auth-brand-bottom">
            <span className="auth-spark">✦</span>
            <span>Beauty begins with thoughtful care.</span>
          </div>

          <div className="auth-brand-ring" aria-hidden="true" />
        </aside>

        <div className="auth-form-panel">
          <img
            src={logo}
            alt="Dahling’s Escape Salon & Spa"
            className="auth-logo"
          />

          <p className="auth-kicker">OWNER & STAFF ACCESS</p>

          <h1>{title}</h1>

          <p className="auth-subtitle">{subtitle}</p>

          {children}
        </div>
      </section>

      <p className="auth-footer">
        Dahling’s Escape Salon & Spa · StyleSync
      </p>
    </main>
  )
}