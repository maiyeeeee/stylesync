import { Link } from "react-router-dom"
import { LuArrowLeft, LuLockKeyhole } from "react-icons/lu"
import { PiFlowerLotusLight } from "react-icons/pi"
import Brand from "./Brand"
import "./AuthLayout.css"

export default function AuthLayout({ title, subtitle, children }) {
    return (
        <main className="dahling-auth">
            <div className="auth-topline">
                <Link to="/" className="auth-back">
                    <LuArrowLeft /> Back to website
                </Link>
                <span>STYLESYNC · TEAM WORKSPACE</span>
            </div>
            <section className="auth-frame" aria-label="Salon account access">
                <aside className="auth-brand">
                    <img className="auth-background" src="/images/salon.jpg" alt="" />
                    <div className="auth-brand-top">
                        <Brand />
                    </div>
                    <div className="auth-brand-copy">
                        <span className="auth-eyebrow">BEHIND EVERY BEAUTIFUL DAY</span>
                        <h2>
                            A little care.
                            <br />A smoother day.
                        </h2>
                        <p>
                            Appointments, services, and the people who make every salon visit
                            special. All in one thoughtful space.
                        </p>
                    </div>
                    <div className="auth-brand-bottom">
                        <PiFlowerLotusLight />
                        <span>Beauty begins with thoughtful care.</span>
                    </div>
                </aside>
                <div className="auth-form-panel">
                    <span className="auth-lock">
                        <LuLockKeyhole />
                    </span>
                    <p className="auth-kicker">OWNER & STAFF ACCESS</p>
                    <h1>{title}</h1>
                    <p className="auth-subtitle">{subtitle}</p>
                    {children}
                </div>
            </section>
            <p className="auth-footer">
                Dahling’s Escape Salon & Spa · Made for a smoother salon day.
            </p>
        </main>
    )
}
