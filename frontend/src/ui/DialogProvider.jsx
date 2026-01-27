import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import Modal from './Modal';

const DialogContext = createContext(null);

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

export function DialogProvider({ children }) {
  const resolverRef = useRef(null);
  const [dialog, setDialog] = useState(null);

  const close = useCallback((result) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(result);
  }, []);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        type: 'confirm',
        title: opts?.title || '确认',
        description: opts?.description || '',
        confirmText: opts?.confirmText || '确认',
        cancelText: opts?.cancelText || '取消',
        tone: opts?.tone || 'default',
      });
    });
  }, []);

  const alert = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        type: 'alert',
        title: opts?.title || '提示',
        description: opts?.description || '',
        confirmText: opts?.confirmText || '知道了',
        tone: opts?.tone || 'default',
      });
    });
  }, []);

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert]);

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal
        open={!!dialog}
        onClose={() => close(dialog?.type === 'confirm' ? false : true)}
        title={dialog?.title}
        description={dialog?.description}
        size="md"
        closeOnOverlay={dialog?.type !== 'confirm'}
      >
        <div className="flex justify-end gap-2">
          {dialog?.type === 'confirm' && (
            <button
              onClick={() => close(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              {dialog?.cancelText}
            </button>
          )}
          <button
            onClick={() => close(true)}
            className={`px-4 py-2 rounded-xl text-sm font-medium text-white ${
              dialog?.tone === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {dialog?.confirmText}
          </button>
        </div>
      </Modal>
    </DialogContext.Provider>
  );
}

