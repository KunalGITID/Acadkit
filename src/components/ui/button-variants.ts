import { cva } from "class-variance-authority";

/**
 * The button styles, apart from the animated <Button>: the landing page
 * uses them on plain <button>s so a visitor's first load doesn't pull in
 * the animation library.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-semibold transition-colors select-none disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-brand text-brand-ink hover:bg-brand/90 shadow-[0_4px_16px_-4px_hsl(var(--brand)/0.5)]",
        secondary: "bg-surface-2 text-ink hover:bg-surface-2/70",
        outline: "border bg-transparent text-ink hover:bg-surface-2/60",
        ghost: "bg-transparent text-muted hover:text-ink hover:bg-surface-2/60",
        danger: "bg-bad/15 text-bad-deep hover:bg-bad/25",
      },
      size: {
        sm: "h-9 px-3.5 rounded-xl text-[13px]",
        md: "h-11 px-5 rounded-2xl text-sm",
        lg: "h-13 px-6 py-3.5 rounded-2xl text-base",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);
