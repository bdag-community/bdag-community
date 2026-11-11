import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "ghost";
type Size = "md" | "lg";

/**
 * BDAG Community button — staking-style pill.
 *
 * - primary: SOLID brand purple, DARK text (AA on it), a lit top edge and a
 *   1px ring; lifts on hover. No gradient — see .btn-primary in globals.css.
 * - ghost: the same construction at a lower volume — faint purple fill, purple
 *   border, light-purple text — so the two read as one family, not as a button
 *   beside an outline.
 * - sizes: md (>=44px touch) / lg (hero CTAs).
 * - optional `leadingIcon` / `trailingIcon` rendered around the label; `group`
 *   on the base lets a trailing arrow animate on hover.
 *
 * Server component. globals.css disables transitions under prefers-reduced-motion.
 */
const base =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "active:scale-[0.98] motion-reduce:active:scale-100 " +
  "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-accent focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-base-void disabled:opacity-50 " +
  "disabled:pointer-events-none";

const sizes: Record<Size, string> = {
  md: "min-h-[44px] px-5 py-2.5 text-sm",
  lg: "min-h-[52px] px-7 py-3.5 text-base",
};

const variants: Record<Variant, string> = {
  primary: "btn-primary font-semibold hover:-translate-y-0.5",
  ghost: "btn-ghost hover:-translate-y-0.5",
};

type Common = {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
};
type ButtonAsButton = { href?: undefined } & Common &
  ComponentPropsWithoutRef<"button">;
type ButtonAsLink = { href: string } & Common &
  Omit<ComponentPropsWithoutRef<typeof Link>, "href">;

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    size = "md",
    className,
    children,
    leadingIcon,
    trailingIcon,
  } = props;
  const classes = cn(base, sizes[size], variants[variant], className);

  if (props.href !== undefined) {
    const {
      variant: _v,
      size: _s,
      className: _c,
      children: _ch,
      leadingIcon: _li,
      trailingIcon: _ti,
      href,
      ...rest
    } = props;
    void _v;
    void _s;
    void _c;
    void _ch;
    void _li;
    void _ti;
    return (
      <Link href={href} className={classes} {...rest}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    className: _c,
    children: _ch,
    leadingIcon: _li,
    trailingIcon: _ti,
    ...rest
  } = props;
  void _v;
  void _s;
  void _c;
  void _ch;
  void _li;
  void _ti;
  return (
    <button className={classes} {...rest}>
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
