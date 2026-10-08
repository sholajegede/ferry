"use client";

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type Variant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-sea text-on-sea hover:bg-sea-deep",
  secondary: "bg-paper text-ink border border-sea hover:bg-sunken",
  quiet: "text-ink hover:bg-sunken",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-8 px-3.5 text-[0.6875rem] gap-1.5",
    md: "h-10 px-5 text-xs gap-2",
    lg: "h-11 px-6 text-[0.8125rem] gap-2",
  };
  return (
    <button
      type="button"
      {...props}
      className={`pill transition-colors disabled:pointer-events-none disabled:opacity-45 ${sizes[size]} ${variants[variant]} ${className}`}
    />
  );
}

type Toast = { id: number; text: string; tone: "info" | "error" | "ok" };
type Ask = {
  title: string;
  body?: ReactNode;
  confirm: string;
  cancel?: string;
  danger?: boolean;
};

const Feedback = createContext<{
  toast(text: string, tone?: Toast["tone"]): void;
  ask(question: Ask): Promise<boolean>;
} | null>(null);

export function useFeedback() {
  const value = useContext(Feedback);
  if (!value) throw new Error("FeedbackProvider is missing");
  return value;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      aria-label={title}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-xl" : "max-w-md"} rounded-[28px] border border-sea bg-paper p-0 text-ink shadow-[0_24px_80px_-20px_rgba(47,27,99,0.45)]`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 className="text-3xl">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 rounded-full p-2 text-ink hover:bg-sunken"
            >
              <X size={20} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [question, setQuestion] = useState<Ask | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const counter = useRef(0);

  const toast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++counter.current;
    setToasts((current) => [...current.slice(-3), { id, text, tone }]);
    setTimeout(
      () => setToasts((current) => current.filter((entry) => entry.id !== id)),
      tone === "error" ? 7000 : 4500,
    );
  }, []);

  const ask = useCallback((next: Ask) => {
    resolver.current?.(false);
    setQuestion(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setQuestion(null);
  }, []);

  const value = useMemo(() => ({ toast, ask }), [toast, ask]);

  return (
    <Feedback.Provider value={value}>
      {children}
      <Modal open={!!question} onClose={() => answer(false)} title={question?.title ?? ""}>
        {question && (
          <>
            {question.body && <div className="text-ink/80">{question.body}</div>}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => answer(false)}>
                {question.cancel ?? "Cancel"}
              </Button>
              <Button variant={question.danger ? "danger" : "primary"} onClick={() => answer(true)}>
                {question.confirm}
              </Button>
            </div>
          </>
        )}
      </Modal>
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((entry) => (
          <div
            key={entry.id}
            role={entry.tone === "error" ? "alert" : "status"}
            className={`rise pointer-events-auto max-w-md rounded-full px-5 py-2.5 text-sm font-medium shadow-[0_12px_40px_-12px_rgba(47,27,99,0.5)] ${
              entry.tone === "error"
                ? "bg-danger text-white"
                : entry.tone === "ok"
                  ? "bg-signal text-on-signal"
                  : "bg-night text-paper"
            }`}
          >
            {entry.text}
          </div>
        ))}
      </div>
    </Feedback.Provider>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "ok" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "bg-sunken text-ink border-line",
    error: "bg-danger-soft text-danger border-danger/30",
    ok: "bg-mint text-forest border-mint",
    warn: "bg-mint text-forest border-mint",
  };
  return (
    <div className={`rounded-[14px] border px-4 py-3 text-sm ${tones[tone]}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}
