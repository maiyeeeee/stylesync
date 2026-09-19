import salonLogo from "../assets/dahling-logo.jpg"
import { cn } from "../lib/utils"

// Frame the original artwork above its printed wordmark. The source image stays
// untouched, preserving the salon's exact illustration and original colors.
export function BrandMark({ className }) {
    return (
        <span className={cn("brand-mark", className)} aria-hidden="true">
            <img src={salonLogo} alt="" width="960" height="960" />
        </span>
    )
}

export default function Brand({ className, compact = false }) {
    return (
        <span className={cn("brand", className)}>
            <BrandMark className="brand-symbol" />
            <span className="brand-type">
                <span>
                    Dahling’s<span className="brand-escape"> Escape</span>
                </span>
                {!compact && <small>SALON & SPA</small>}
            </span>
        </span>
    )
}
