import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

/** หน้าต่างยืนยันสไตล์ iOS Action Sheet / Alert */
export default function ConfirmDialog({
  title,
  message,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
  danger,
  onResult,
}: ConfirmOptions & { onResult: (ok: boolean) => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onResult(false)}>
      <AnimatePresence>
        <Dialog.Portal forceMount>
          {/* Backdrop */}
          <Dialog.Overlay asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="no-print fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
          </Dialog.Overlay>

          {/* Action Sheet Container */}
          <div className="no-print fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center pointer-events-none">
            <Dialog.Content asChild>
              <motion.div
                initial={{ y: 30, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                transition={{ type: 'spring', damping: 28, stiffness: 400 }}
                className="pointer-events-auto w-full max-w-sm space-y-2 outline-none"
              >
                {/* Main Card */}
                <div className="overflow-hidden rounded-[16px] bg-white dark:bg-[#1C1C1E] border border-ios-separator shadow-ios-sheet">
                  <div className="px-5 pt-5 pb-4 text-center">
                    <Dialog.Title className="text-[17px] font-semibold text-ios-primary">
                      {title}
                    </Dialog.Title>
                    <Dialog.Description asChild>
                      <div className="mt-1.5 text-[13px] leading-relaxed text-ios-secondary">
                        {message}
                      </div>
                    </Dialog.Description>
                  </div>

                  <div className="border-t border-ios-separator">
                    <button
                      type="button"
                      onClick={() => onResult(true)}
                      className={`w-full py-3.5 text-[17px] font-medium transition active:bg-ios-fill ${
                        danger
                          ? 'text-status-overdue font-semibold'
                          : 'text-accent font-semibold'
                      }`}
                    >
                      {confirmText}
                    </button>
                  </div>
                </div>

                {/* Cancel Card */}
                <div className="overflow-hidden rounded-[16px] bg-white dark:bg-[#1C1C1E] border border-ios-separator shadow-ios-sheet">
                  <button
                    type="button"
                    onClick={() => onResult(false)}
                    className="w-full py-3.5 text-[17px] font-semibold text-accent transition active:bg-ios-fill"
                  >
                    {cancelText}
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </AnimatePresence>
    </Dialog.Root>
  );
}
