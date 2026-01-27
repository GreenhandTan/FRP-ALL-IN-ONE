import React from 'react';

export default function CodeBlock({ value, className = '' }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-slate-900/50 overflow-hidden ${className}`}>
      <div className="px-3 py-2 border-b border-white/10 bg-slate-900/60">
        <div className="text-[11px] text-slate-400 font-mono">deploy-frpc.sh</div>
      </div>
      <div className="max-h-72 overflow-y-auto overflow-x-hidden p-4">
        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">{value}</pre>
      </div>
    </div>
  );
}

