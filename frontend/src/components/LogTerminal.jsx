import Ansi from 'ansi-to-react';
import React, { useEffect, useRef, useState } from 'react';
import { Terminal, X, Download, Pause, Play, Trash2 } from 'lucide-react';

const LogTerminal = ({ clientId, onClose, clientName }) => {
    const [logs, setLogs] = useState([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const terminalRef = useRef(null);

    useEffect(() => {
        // 动态判断 WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // 如果是开发环境 (localhost:5173), 假设后端在 localhost:8000
        // 否则假设后端与前端同源 (生产环境通过 Nginx 代理)
        let wsHost = window.location.host;
        if (process.env.NODE_ENV === 'development') {
            wsHost = 'localhost:8000'; // 或者根据你的 setup 修改
        }

        // 如果 api.defaults.baseURL 被设置了，应该优先使用那个 host，但这比较复杂
        // 简单的策略：尝试连接 /ws/logs/{client_id}

        // 这里我们假设后端 API 和当前页面同源，或者在开发通过 Proxy 转发
        // 如果你是 create-vite-app 配置了 proxy，那么 ws://localhost:5173/ws/... 会被转发
        // 如果没有 proxy，直接连后端端口

        let wsUrl = `${protocol}//${window.location.host}/ws/logs/${clientId}`;
        if (window.location.port === '5173') {
            // Dev mode specific override if needed, usually Vite proxy handles this
            // But if not using Vite proxy for WS:
            wsUrl = `ws://localhost:8000/ws/logs/${clientId}`;
        }

        const token = localStorage.getItem('token');
        if (token) {
            wsUrl += `?token=${token}`;
        }

        console.log("Connecting Log WS:", wsUrl);
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            setIsConnected(true);
            setLogs(prev => [...prev, { type: 'info', content: `Connected to log stream for ${clientName || clientId}...`, ts: Date.now() }]);
        };

        ws.onmessage = (event) => {
            if (document.hidden && logs.length > 2000) return; // 简单的性能保护
            try {
                // Server sends JSON string: {"type": "log", "data": "...", ...}
                const message = JSON.parse(event.data);

                // Only handle log messages
                if (message.type !== 'log' && message.type !== 'info') return;

                let content = message.data || "";

                if (!isPaused) {
                    setLogs(prev => {
                        const newLogs = [...prev, { type: message.type || 'log', content, ts: Date.now() }];
                        if (newLogs.length > 1000) return newLogs.slice(newLogs.length - 1000);
                        return newLogs;
                    });
                }
            } catch (e) {
                // Fallback for non-JSON raw text (just in case)
                console.warn("Log parsing warning:", e);
                const content = event.data;
                if (!isPaused) {
                    setLogs(prev => {
                        const newLogs = [...prev, { type: 'log', content, ts: Date.now() }];
                        return newLogs.slice(-1000);
                    });
                }
            }
        };

        ws.onclose = (e) => {
            setIsConnected(false);
            setLogs(prev => [...prev, { type: 'info', content: `Connection closed (Code: ${e.code}).`, ts: Date.now() }]);
        };

        ws.onerror = () => {
            setLogs(prev => [...prev, { type: 'error', content: 'WebSocket connection error.', ts: Date.now() }]);
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [clientId, clientName, isPaused]);

    // Auto scroll
    useEffect(() => {
        if (!isPaused && terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs, isPaused]);

    const handleClear = () => setLogs([]);

    const handleDownload = () => {
        const text = logs.map(l => l.content).join('\n');
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `frp-logs-${clientId}-${new Date().toISOString()}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-[#1e1e1e] w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-slate-700 overflow-hidden font-mono text-sm relative">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-[#252526] border-b border-black select-none">
                    <div className="flex items-center gap-3 text-slate-300">
                        <div className="p-1.5 bg-slate-800 rounded">
                            <Terminal size={16} className="text-emerald-500" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-white leading-tight">{clientName || clientId}</span>
                            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Real-time Logs</span>
                        </div>
                        <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold ${isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                            {isConnected ? 'LIVE' : 'OFFLINE'}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className={`p-2 rounded hover:bg-slate-700 transition-colors ${isPaused ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400'}`}
                            title={isPaused ? "Resume Auto-scroll" : "Pause Auto-scroll"}
                        >
                            {isPaused ? <Play size={18} /> : <Pause size={18} />}
                        </button>
                        <button onClick={handleDownload} className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded transition-colors" title="Download Logs">
                            <Download size={18} />
                        </button>
                        <button onClick={handleClear} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors" title="Clear Logs">
                            <Trash2 size={18} />
                        </button>
                        <div className="w-px h-5 bg-slate-700 mx-2" />
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-red-600 rounded transition-colors" title="Close">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Terminal Body */}
                <div
                    ref={terminalRef}
                    className="flex-1 overflow-y-auto p-4 space-y-0.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent bg-[#1e1e1e]"
                >
                    {logs.length === 0 && isConnected && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50">
                            <Terminal size={48} className="mb-4" />
                            <p>Waiting for incoming logs...</p>
                        </div>
                    )}
                    {logs.map((log, i) => (
                        <div key={i} className={`font-mono text-[13px] leading-5 break-words whitespace-pre-wrap ${log.type === 'error' ? 'text-red-400 bg-red-900/10' :
                            log.type === 'info' ? 'text-blue-400 bg-blue-900/10' : 'hover:bg-white/5' // Default text color handled by Ansi or inherit
                            }`}>
                            <span className="inline-block w-[85px] text-slate-600 select-none text-[11px] mr-2 align-top">{new Date(log.ts).toLocaleTimeString()}</span>
                            <span className="text-slate-300">
                                <Ansi>{log.content}</Ansi>
                            </span>
                        </div>
                    ))}
                    {!isConnected && logs.length > 0 && (
                        <div className="py-2 text-center text-slate-600 text-xs mt-4 border-t border-slate-800 border-dashed">
                            Log stream disconnected.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LogTerminal;

