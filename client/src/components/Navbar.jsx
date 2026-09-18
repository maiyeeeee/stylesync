import { useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { LuArrowUpRight, LuMenu, LuMapPin } from "react-icons/lu"
import Brand from "./Brand"
import { Button } from "./ui/button"
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetDescription,
    SheetTitle,
    SheetTrigger,
} from "./ui/sheet"

const links = [
    ["/", "Home"],
    ["/services", "Our services"],
    ["/contact", "Visit us"],
]

export default function Navbar() {
    const [open, setOpen] = useState(false)
    return (
        <>
            <a href="#main-content" className="skip-link">
                Skip to content
            </a>
            <div className="announcement-bar">
                <span>A little time for you. A little more beautiful.</span>
                <span>
                    <LuMapPin aria-hidden="true" /> Sagay City, Negros Occidental
                </span>
            </div>
            <header className="site-header">
                <div className="site-container nav-inner">
                    <Link to="/" aria-label="Dahling’s Escape home">
                        <Brand />
                    </Link>
                    <nav className="desktop-nav" aria-label="Website navigation">
                        {links.map(([to, label]) => (
                            <NavLink key={to} to={to} end={to === "/"}>
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="nav-actions">
                        <Button asChild className="nav-book">
                            <Link to="/book">
                                Book a visit <LuArrowUpRight />
                            </Link>
                        </Button>
                        <Sheet open={open} onOpenChange={setOpen}>
                            <SheetTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="mobile-menu"
                                    aria-label="Open navigation"
                                >
                                    <LuMenu />
                                </Button>
                            </SheetTrigger>
                            <SheetContent>
                                <SheetTitle className="mt-10">
                                    <Brand />
                                </SheetTitle>
                                <SheetDescription className="mt-4 text-sm text-muted-foreground">
                                    Your next moment of self-care starts here.
                                </SheetDescription>
                                <nav className="mobile-nav" aria-label="Mobile navigation">
                                    {links.map(([to, label]) => (
                                        <SheetClose asChild key={to}>
                                            <NavLink to={to} end={to === "/"}>
                                                {label}
                                                <LuArrowUpRight />
                                            </NavLink>
                                        </SheetClose>
                                    ))}
                                    <SheetClose asChild>
                                        <Link to="/book">
                                            Book an appointment
                                            <LuArrowUpRight />
                                        </Link>
                                    </SheetClose>
                                </nav>
                                <SheetClose asChild>
                                    <Link
                                        to="/admin-login"
                                        className="mt-auto text-sm text-muted-foreground"
                                    >
                                        Team portal <LuArrowUpRight className="inline" />
                                    </Link>
                                </SheetClose>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </header>
        </>
    )
}
