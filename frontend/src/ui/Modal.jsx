import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const sizeToMaxWidth = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'lg',
  closeOnOverlay = true,
  showClose = true,
}) {
  const panelRef = useRef(null);
  const container = useMemo(() => {
    if (typeof document === 'undefined') return null;
    return document.body;
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const focusable = panelRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus?.();
  }, [open]);

  if (!open || !container) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div
        className="absolute inset-0"
        onMouseDown={(e) => {
          if (!closeOnOverlay) return;
          if (e.target === e.currentTarget) onClose?.();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`relative w-full ${sizeToMaxWidth[size] || sizeToMaxWidth.lg} bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden`}
      >
        {(title || showClose) && (
          <div className="px-6 py-4 border-b border-slate-100 bg-white/80 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                {title && <h3 className="text-lg font-semibold text-slate-900 truncate">{title}</h3>}
                {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
              </div>
              {showClose && (
                <button
                  onClick={onClose}
                  className="shrink-0 text-slate-400 hover:text-slate-700 transition-colors rounded-lg p-1"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60">{footer}</div>
        )}
      </div>
    </div>,
    container
  );
}

