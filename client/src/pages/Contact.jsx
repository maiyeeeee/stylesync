import { Link } from "react-router-dom"
import { LuArrowUpRight, LuClock, LuMapPin, LuPhone } from "react-icons/lu"
import { FaFacebookF } from "react-icons/fa6"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import { Button } from "../components/ui/button"

export default function Contact() {
    return (
        <div className="public-site">
            <Navbar />
            <main id="main-content" tabIndex={-1}>
                <section className="page-intro site-container">
                    <p className="eyebrow">COME FIND YOUR CALM</p>
                    <h1>
                        A warm welcome <em>awaits.</em>
                    </h1>
                    <p>
                        A question, a little guidance, or your next appointment.
                        <br />
                        We’d love to hear from you.
                    </p>
                </section>
                <section className="contact-grid site-container">
                    <div className="contact-photo">
                        <img src="/images/salon.jpg" alt="A welcoming salon interior" />
                        <div>
                            <p>YOUR EVERYDAY ESCAPE</p>
                            <h2>
                                We’ll save
                                <br />a little calm for you.
                            </h2>
                        </div>
                    </div>
                    <div className="contact-details">
                        <div className="contact-item">
                            <LuMapPin />
                            <div>
                                <h2>Find us in Sagay</h2>
                                <p>
                                    Nichlos Plaza, Roxas Avenue
                                    <br />
                                    Brgy. Poblacion II, Sagay City
                                    <br />
                                    Negros Occidental, Philippines, 6122
                                </p>
                                <a
                                    href="https://www.google.com/maps/search/?api=1&query=Nichlos+Plaza+Roxas+Avenue+Sagay+City+Philippines"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-link"
                                >
                                    Get directions <LuArrowUpRight />
                                </a>
                            </div>
                        </div>
                        <div className="contact-item">
                            <LuClock />
                            <div>
                                <h2>A little time for you</h2>
                                <p>Business hours: 8:00 AM – 7:00 PM</p>
                                <p className="contact-hint">
                                    Book ahead to find your preferred time.
                                </p>
                            </div>
                        </div>
                        <div className="contact-item">
                            <LuPhone />
                            <div>
                                <h2>Let’s talk</h2>
                                <a href="tel:09695619380" className="contact-number">
                                    0969 561 9380 <LuArrowUpRight />
                                </a>
                                <p className="contact-hint">
                                    For appointments and treatment inquiries.
                                </p>
                            </div>
                        </div>
                        <div className="contact-item">
                            <FaFacebookF />
                            <div>
                                <h2>A little social</h2>
                                <a
                                    href="https://web.facebook.com/dahlingsescapesalonandspa"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-link"
                                >
                                    Find us on Facebook <LuArrowUpRight />
                                </a>
                            </div>
                        </div>
                        <Button asChild size="lg">
                            <Link to="/book">
                                Plan your next visit <LuArrowUpRight />
                            </Link>
                        </Button>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
