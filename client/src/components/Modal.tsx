import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
}

/** หน้าต่างสไตล์ iOS: Bottom Sheet บนมือถือ และ Centered Sheet บนเดสก์ท็อป */
export default function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  headerLeft,
  headerRight,
}: Props) {
  const sizeMap = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-xl',
    lg: 'sm:max-w-3xl',
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <AnimatePresence>
        <Dialog.Portal forceMount>
          {/* Backdrop Overlay */}
          <Dialog.Overlay asChild>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="no-print fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            />
          </Dialog.Overlay>

          {/* Modal Container */}
          <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 pointer-events-none">
            <Dialog.Content asChild>
              <motion.div
                initial={{ y: '100%', opacity: 0.5, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: '100%', opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                className={`pointer-events-auto flex max-h-[92vh] w-full flex-col rounded-t-[20px] bg-ios-card shadow-ios-sheet border border-ios-separator outline-none sm:rounded-[20px] ${sizeMap[size]}`}
              >
                {/* Mobile Drag Handle */}
                <div className="pt-2.5 pb-1 flex justify-center sm:hidden">
                  <div className="h-1.5 w-9 rounded-full bg-ios-separator" aria-hidden="true" />
                </div>

                {/* iOS Header */}
                <div className="flex items-center justify-between border-b border-ios-separator px-5 py-3.5">
                  <div className="flex items-center min-w-[70px]">
                    {headerLeft || (
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          onClick={onClose}
                          className="btn-ios-plain px-0 text-sm font-normal text-ios-secondary hover:text-ios-primary"
                        >
                          ยกเลิก
                        </button>
                      </Dialog.Close>
                    )}
                  </div>

                  <Dialog.Title className="text-[17px] font-semibold text-ios-primary text-center truncate px-2">
                    {title}
                  </Dialog.Title>

                  <div className="flex items-center justify-end min-w-[70px]">
                    {headerRight || (
                      <Dialog.Close asChild>
                        <button
                          type="button"
                          onClick={onClose}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-ios-fill text-ios-secondary hover:text-ios-primary transition"
                          aria-label="ปิดหน้าต่าง"
                        >
                          <X className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </Dialog.Close>
                    )}
                  </div>
                </div>

                {/* Scrollable Content Body */}
                <div className="flex-1 overflow-y-auto px-5 py-5 overscroll-contain">
                  {children}
                </div>

                {/* Footer Actions */}
                {footer && (
                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ios-separator bg-ios-card px-5 py-3 rounded-b-[20px]">
                    {footer}
                  </div>
                )}
              </motion.div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </AnimatePresence>
    </Dialog.Root>
  );
}
