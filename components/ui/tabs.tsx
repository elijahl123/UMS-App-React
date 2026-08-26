import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => {
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const updateScrollState = React.useCallback(() => {
    const el = listRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    const el = listRef.current
    if (!el) return
    updateScrollState()
    el.addEventListener("scroll", updateScrollState, { passive: true })
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateScrollState)
    resizeObserver?.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollState)
      resizeObserver?.disconnect()
    }
  }, [updateScrollState])

  const scrollByAmount = (amount: number) => {
    listRef.current?.scrollBy({ left: amount, behavior: "smooth" })
  }

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        aria-label="Scroll tabs left"
        tabIndex={-1}
        onClick={() => scrollByAmount(-150)}
        className={cn(
          "absolute left-0 z-10 flex h-10 w-7 shrink-0 items-center justify-center rounded-l-md bg-gradient-to-r from-card via-card to-transparent text-muted-foreground transition-opacity hover:text-foreground",
          canScrollLeft ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <TabsPrimitive.List
        ref={(node) => {
          listRef.current = node
          if (typeof ref === "function") {
            ref(node)
          } else if (ref) {
            (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
          }
        }}
        className={cn(
          "inline-flex h-10 w-full items-center justify-start gap-1 overflow-x-auto scroll-smooth rounded-md border-2 border-primary bg-card p-1 text-muted-foreground",
          "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          className
        )}
        {...props}
      />
      <button
        type="button"
        aria-label="Scroll tabs right"
        tabIndex={-1}
        onClick={() => scrollByAmount(150)}
        className={cn(
          "absolute right-0 z-10 flex h-10 w-7 shrink-0 items-center justify-center rounded-r-md bg-gradient-to-l from-card via-card to-transparent text-muted-foreground transition-opacity hover:text-foreground",
          canScrollRight ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=inactive]:hover:bg-accent data-[state=inactive]:hover:text-accent-foreground",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 flex flex-col gap-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "[&[hidden]]:hidden",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
