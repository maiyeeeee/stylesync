import { Link } from "react-router-dom"
import {
    LuArrowDown,
    LuArrowRight,
    LuArrowUpRight,
    LuHeart,
    LuScissors,
    LuSparkles,
} from "react-icons/lu"
import { PiFlowerLotusLight } from "react-icons/pi"
import { BrandMark } from "../components/Brand"
import Navbar from "../components/Navbar"
import Footer from "../components/Footer"
import { Button } from "../components/ui/button"
import { serviceCategories } from "../lib/services"

export default function Home() {
    return (
        <div className="public-site">
            <Navbar />
            <main id="main-content" tabIndex={-1}>
                <section className="home-hero site-container">
                    <div className="hero-copy">
                        <p className="eyebrow">
                            <span /> YOUR EVERYDAY ESCAPE
                        </p>
                        <h1>
                            A little pause.
                            <br />A beautiful
                            <br />
                            <em>new you.</em>
                        </h1>
                        <p className="hero-description">
                            Step away from the everyday. Discover thoughtful hair, beauty, and spa
                            care in a space that feels like a deep breath.
                        </p>
                        <div className="hero-actions">
                            <Button asChild size="lg">
                                <Link to="/book">
                                    Make time for yourself <LuArrowUpRight />
                                </Link>
                            </Button>
                            <Link className="text-link" to="/services">
                                Explore services <LuArrowRight />
                            </Link>
                        </div>
                        <div className="hero-note">
                            <span className="hero-note-icon">
                                <BrandMark />
                            </span>
                            <p>
                                A little care goes a long way.
                                <br />
                                <strong>Let us take care of you.</strong>
                            </p>
                        </div>
                    </div>
                    <div className="hero-visual">
                        <img
                            className="hero-photo"
                            src="/images/salon.jpg"
                            alt="A bright, welcoming salon with styling chairs and mirrors"
                            fetchPriority="high"
                        />
                        <div className="hero-photo-shade" />
                        <span className="hero-photo-label">YOUR SPACE TO UNWIND</span>
                        <div className="hero-caption">
                            <span>
                                Come as you are.
                                <br />
                                <em>Leave feeling renewed.</em>
                            </span>
                            <Link to="/services" aria-label="Explore our salon services">
                                <LuArrowUpRight />
                            </Link>
                        </div>
                        <div className="hero-seal">
                            <PiFlowerLotusLight aria-hidden="true" />
                            <span>
                                RELIEVE · RELAX
                                <br />& REVIVE
                            </span>
                        </div>
                    </div>
                    <a href="#our-services" className="scroll-cue">
                        <LuArrowDown /> A moment of discovery
                    </a>
                </section>
                <div className="care-ribbon">
                    <span>HAIR & BEAUTY</span>
                    <PiFlowerLotusLight aria-hidden="true" />
                    <span>REST & RENEWAL</span>
                    <PiFlowerLotusLight aria-hidden="true" />
                    <span>CARE, MADE PERSONAL</span>
                    <PiFlowerLotusLight aria-hidden="true" />
                    <span>YOUR EVERYDAY ESCAPE</span>
                </div>
                <section className="section-space site-container" id="our-services">
                    <div className="section-heading">
                        <div>
                            <p className="eyebrow">THE ART OF FEELING GOOD</p>
                            <h2>
                                Your kind of <em>self-care.</em>
                            </h2>
                        </div>
                        <div>
                            <p>
                                From a fresh look to a well-deserved reset,
                                <br />
                                find a little something just for you.
                            </p>
                            <Link to="/services" className="text-link">
                                Discover our services <LuArrowUpRight />
                            </Link>
                        </div>
                    </div>
                    <div className="category-grid">
                        {serviceCategories.map((category, index) => (
                            <Link
                                to={`/services?category=${category.key}`}
                                className="category-card"
                                key={category.key}
                            >
                                <div className="category-photo">
                                    <img src={category.image} alt={category.name} loading="lazy" />
                                    <span className="category-number">0{index + 1}</span>
                                    <span className="category-arrow">
                                        <LuArrowUpRight />
                                    </span>
                                </div>
                                <h3>{category.name}</h3>
                                <p>{category.description}</p>
                            </Link>
                        ))}
                    </div>
                </section>
                <section className="our-approach">
                    <div className="site-container approach-grid">
                        <div className="approach-image">
                            <img
                                src="/images/spa.jpg"
                                alt="A relaxing spa massage treatment"
                                loading="lazy"
                            />
                            <span>
                                A softer pace.
                                <br />A little more you.
                            </span>
                        </div>
                        <div className="approach-copy">
                            <p className="eyebrow">WELCOME TO DAHLING’S</p>
                            <h2>
                                Good care.
                                <br />
                                Great hair.
                                <br />
                                <em>A happier you.</em>
                            </h2>
                            <p>
                                We believe feeling good should feel effortless. At Dahling’s Escape,
                                every visit is a chance to slow down, reconnect, and enjoy a little
                                care that’s all about you.
                            </p>
                            <div className="care-values">
                                <span>
                                    <LuScissors /> Thoughtful beauty care
                                </span>
                                <span>
                                    <LuHeart /> A warm welcome, always
                                </span>
                                <span>
                                    <LuSparkles /> Your style, your way
                                </span>
                            </div>
                            <Link to="/contact" className="text-link">
                                Get to know your escape <LuArrowUpRight />
                            </Link>
                        </div>
                    </div>
                </section>
                <section className="site-container section-space">
                    <div className="booking-cta">
                        <BrandMark className="cta-brand" />
                        <p className="eyebrow">A LITTLE TIME, JUST FOR YOU</p>
                        <h2>
                            Your next good day
                            <br />
                            starts with <em>a little care.</em>
                        </h2>
                        <p>We’ll take care of the details. You just show up as you.</p>
                        <Button asChild size="lg" variant="light">
                            <Link to="/book">
                                Book your escape <LuArrowUpRight />
                            </Link>
                        </Button>
                        <span className="cta-note">Sagay City · 8:00 AM – 7:00 PM</span>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
