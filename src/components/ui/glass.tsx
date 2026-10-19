import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef, ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

const glassVariants = cva("glass-surface", {
  variants: {
    intensity: {
      subtle: "glass-subtle",
      default: "glass-default",
      strong: "glass-strong",
    },
  },
  defaultVariants: {
    intensity: "default",
  },
});

export type GlassIntensity = NonNullable<
  VariantProps<typeof glassVariants>["intensity"]
>;

type GlassCardProps = ComponentPropsWithoutRef<"section"> &
  VariantProps<typeof glassVariants>;

export function GlassCard({ className, intensity, ...props }: GlassCardProps) {
  return (
    <section
      className={cn(glassVariants({ intensity }), className)}
      {...props}
    />
  );
}

type GlassPanelProps = ComponentPropsWithRef<"div"> &
  VariantProps<typeof glassVariants>;

export function GlassPanel({
  className,
  intensity,
  ...props
}: GlassPanelProps) {
  return (
    <div className={cn(glassVariants({ intensity }), className)} {...props} />
  );
}

type GlassPillProps = ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof glassVariants>;

export function GlassPill({ className, intensity, ...props }: GlassPillProps) {
  return (
    <span
      className={cn(glassVariants({ intensity }), "glass-pill", className)}
      {...props}
    />
  );
}
