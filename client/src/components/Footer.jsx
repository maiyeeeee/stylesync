import { Link } from "react-router-dom"
import { LuArrowUpRight, LuPhone } from "react-icons/lu"
import { FaFacebookF } from "react-icons/fa6"
import Brand from "./Brand"

export default function Footer() {
    return (
        <footer className="site-footer">
            <div className="site-container">
                <div className="footer-grid">
                    <div>
                        <Link to="/" aria-label="Dahling’s Escape home">
                            <Brand />
                        </Link>
                        <p>
                            A space to unwind.
                            <br />A moment to feel like you.
                        </p>
                        <a
                            className="social-link"
                            href="https://web.facebook.com/dahlingsescapesalonandspa"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Find Dahling’s on Facebook"
                        >
                            <FaFacebookF />
                        </a>
                    </div>
                    <div>
                        <h3>Come find your calm</h3>
                        <p>
                            Nichlos Plaza, Roxas Avenue
                            <br />
                            Brgy. Poblacion II, Sagay City
                            <br />
                            Negros Occidental, Philippines
                        </p>
                    </div>
                    <div>
                        <h3>Let’s make time</h3>
                        <p>
                            Business hours
                            <br />
                            <span className="footer-hours">8:00 AM – 7:00 PM</span>
                        </p>
                        <a href="tel:09695619380" className="footer-phone">
                            <LuPhone /> 0969 561 9380
                        </a>
                    </div>
                    <div>
                        <h3>A little exploring</h3>
                        <Link to="/services">
                            Our services <LuArrowUpRight />
                        </Link>
                        <Link to="/book">
                            Book an appointment <LuArrowUpRight />
                        </Link>
                        <Link to="/contact">
                            Get in touch <LuArrowUpRight />
                        </Link>
                    </div>
                </div>
                <div className="footer-bottom">
                    <span>© {new Date().getFullYear()} Dahling’s Escape Salon & Spa.</span>
                    <span>Relieve. Relax. Revive.</span>
                    <Link to="/admin-login">
                        Team portal <LuArrowUpRight />
                    </Link>
                </div>
            </div>
        </footer>
    )
}
