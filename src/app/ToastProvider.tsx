import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { ToastContext, type ToastInput, type ToastKind } from "./ToastContext";

type Toast = ToastInput & { id: number; kind: ToastKind };

const icons = { success: CircleCheck, error: CircleAlert, info: Info };
const MAX_TOASTS = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((item) => item.id !== id)),
    [],
  );
  const notify = useCallback((toast: ToastInput) => {
    nextId.current += 1;
    const item: Toast = { kind: "success", ...toast, id: nextId.current };
    setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), item]);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div
        className="toast-viewport"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(
      () => onDismiss(toast.id),
      toast.kind === "error" ? 7000 : 4000,
    );
    return () => window.clearTimeout(timer);
  }, [paused, toast.id, toast.kind, onDismiss]);
  const Icon = icons[toast.kind];

  return (
    <motion.div
      layout
      className={`toast toast-${toast.kind}`}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.15 } }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className="toast-icon" size={18} aria-hidden="true" />
      <div className="toast-body">
        <strong>{toast.title}</strong>
        {toast.description && <p>{toast.description}</p>}
      </div>
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X size={15} />
      </button>
    </motion.div>
  );
}
