import * as Dialog from "@radix-ui/react-dialog"
import { LuX } from "react-icons/lu"
import { cn } from "../../lib/utils"

export const Sheet = Dialog.Root
export const SheetTrigger = Dialog.Trigger
export const SheetClose = Dialog.Close
export const SheetTitle = Dialog.Title
export const SheetDescription = Dialog.Description

export function SheetContent({ className, children, ...props }) {
    return (
        <Dialog.Portal>
            <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
            <Dialog.Content
                className={cn(
                    "sheet-content fixed inset-y-0 right-0 z-50 flex w-[min(85vw,360px)] flex-col border-l border-border bg-background p-7 shadow-xl",
                    className,
                )}
                {...props}
            >
                {children}
                <Dialog.Close
                    className="absolute right-5 top-5 flex size-10 items-center justify-center rounded-full hover:bg-accent"
                    aria-label="Close navigation"
                >
                    <LuX className="size-5" />
                </Dialog.Close>
            </Dialog.Content>
        </Dialog.Portal>
    )
}
