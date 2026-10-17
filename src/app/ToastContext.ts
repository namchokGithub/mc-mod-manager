import { createContext, useContext } from "react";

export type ToastKind = "success" | "error" | "info";

export type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
};

export const ToastContext = createContext<((toast: ToastInput) => void) | null>(
  null,
);

export function useToast(): (toast: ToastInput) => void {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
