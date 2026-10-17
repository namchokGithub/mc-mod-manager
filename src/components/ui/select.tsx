import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { AriaAttributes, Ref } from "react";
import { cn } from "../../lib/utils";
import { fromItemValue, toItemValue } from "./select-value";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type ControlSize = "sm" | "md" | "lg";
export type ControlVariant = "default" | "compact";

type SelectProps = AriaAttributes & {
  options: SelectOption[];
  /** Controlled value. "" is a valid option value. */
  value?: string;
  /** Uncontrolled starting value. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Marks the control invalid for styling and assistive tech. */
  invalid?: boolean;
  /** Highlights a filter that is narrowing results. */
  active?: boolean;
  size?: ControlSize;
  variant?: ControlVariant;
  id?: string;
  name?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
};

/**
 * Shared dropdown built on Radix Select, which handles keyboard navigation, type-ahead,
 * focus, and portals (so it opens above dialogs).
 */
export function Select({
  options,
  value,
  defaultValue,
  onValueChange,
  onBlur,
  placeholder,
  disabled,
  invalid,
  active,
  size = "md",
  variant = "default",
  id,
  name,
  className,
  ref,
  "aria-invalid": ariaInvalid,
  ...aria
}: SelectProps) {
  return (
    <SelectPrimitive.Root
      value={value === undefined ? undefined : toItemValue(value)}
      defaultValue={
        defaultValue === undefined ? undefined : toItemValue(defaultValue)
      }
      onValueChange={(next) => onValueChange?.(fromItemValue(next))}
      disabled={disabled}
      name={name}
    >
      <SelectPrimitive.Trigger
        ref={ref}
        id={id}
        onBlur={onBlur}
        className={cn(
          "control-trigger",
          `control-${size}`,
          `control-${variant}`,
          active && "control-active",
          className,
        )}
        {...aria}
        aria-invalid={invalid || ariaInvalid ? true : undefined}
      >
        <span className="control-value">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className="control-chevron"
            size={15}
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="control-content"
          position="popper"
          sideOffset={4}
          collisionPadding={8}
        >
          <SelectPrimitive.ScrollUpButton className="control-scroll">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="control-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={toItemValue(option.value)}
                disabled={option.disabled}
                className="control-item"
              >
                <SelectPrimitive.ItemText>
                  {option.label}
                </SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="control-indicator">
                  <Check size={14} aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="control-scroll">
            <ChevronDown size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
