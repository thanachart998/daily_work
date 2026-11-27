import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t.slice(-2), { id, kind, message }]);
      setTimeout(() => remove(id), kind === 'error' ? 5000 : 3200);
    },
    [remove],
  );

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  };

  const kindStyles: Record<ToastKind, { iconColor: string; bgTint: string }> = {
    success: { iconColor: 'text-status-done', bgTint: 'bg-status-done-tint' },
    error: { iconColor: 'text-status-overdue', bgTint: 'bg-status-overdue-tint' },
    info: { iconColor: 'text-accent', bgTint: 'bg-accent-tint' },
  };

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <Ctx.Provider value={api}>
      {children}
      {/* iOS style Top-Center Dynamic Island / Pill Toast */}
      <div className="no-print pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => {
            const Icon = icons[t.kind];
            const { iconColor, bgTint } = kindStyles[t.kind];
            return (
              <motion.div
                key={t.id}
                role={t.kind === 'error' ? 'alert' : 'status'}
                initial={{ opacity: 0, y: -20, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.92, transition: { duration: 0.15 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-ios-separator bg-ios-card/90 px-4 py-2 text-sm shadow-ios-sheet backdrop-blur-xl"
              >
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${bgTint}`}>
                  <Icon className={`h-4 w-4 ${iconColor}`} strokeWidth={2} aria-hidden />
                </div>
                <span className="text-[13.5px] font-medium text-ios-primary leading-snug">{t.message}</span>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label="ปิดข้อความแจ้งเตือน"
                  className="ml-1 -mr-1 flex h-6 w-6 items-center justify-center rounded-full text-ios-tertiary transition hover:bg-ios-fill hover:text-ios-primary"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be inside ToastProvider');
  return c;
}
