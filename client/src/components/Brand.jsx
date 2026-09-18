import { PiFlowerLotusLight } from "react-icons/pi"
import { cn } from "../lib/utils"

export default function Brand({ className, compact = false }) {
    return (
        <span className={cn("brand", className)}>
            <span className="brand-symbol">
                <PiFlowerLotusLight aria-hidden="true" />
            </span>
            <span className="brand-type">
                <span>
                    Dahling’s<span className="brand-escape"> Escape</span>
                </span>
                {!compact && <small>SALON & SPA</small>}
            </span>
        </span>
    )
}
