/**
 * 日志终端组件 - 实时显示客户端日志
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, Trash2, Download, Pause, Play, Search } from 'lucide-react';
import { useLogStream } from '../hooks/useWebSocket';

export function LogTerminal({ clientId, height = 400 }) {
    const { logs, isConnected, clearLogs } = useLogStream(clientId, !!clientId);
    const [isPaused, setIsPaused] = useState(false);
    const [filter, setFilter] = useState('');
    const [autoScroll, setAutoScroll] = useState(true);
    const terminalRef = useRef(null);
    const lastScrollTop = useRef(0);

    // 过滤日志
    const filteredLogs = filter
        ? logs.filter(log => log.text.toLowerCase().includes(filter.toLowerCase()))
        : logs;

    // 自动滚动到底部
    useEffect(() => {
        if (autoScroll && terminalRef.current && !isPaused) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [filteredLogs, autoScroll, isPaused]);

    // 检测用户滚动
    const handleScroll = useCallback((e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

        // 如果用户向上滚动，暂停自动滚动
        if (scrollTop < lastScrollTop.current && !isAtBottom) {
            setAutoScroll(false);
        } else if (isAtBottom) {
            setAutoScroll(true);
        }

        lastScrollTop.current = scrollTop;
    }, []);

    // 导出日志
    const handleExport = () => {
        const content = logs.map(log => `[${log.timestamp}] ${log.text}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `frpc-logs-${clientId}-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!clientId) {
        return (
            <div className="bg-slate-900 rounded-xl p-6 text-slate-500 text-center">
                请选择一个客户端以查看日志
            </div>
        );
    }

    return (
        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-700">
            {/* 工具栏 */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
                <div className="flex items-center gap-3">
                    <Terminal className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-medium text-slate-300">实时日志</span>

                    {/* 连接状态 */}
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${isConnected ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        {isConnected ? '已连接' : '已断开'}
                    </div>

                    <span className="text-xs text-slate-500">
                        {logs.length} 条日志
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* 搜索 */}
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                        <input
                            type="text"
                            placeholder="搜索..."
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="bg-slate-700 text-slate-300 text-xs pl-7 pr-2 py-1 rounded border border-slate-600 focus:border-emerald-500 focus:outline-none w-32"
                        />
                    </div>

                    {/* 暂停/继续 */}
                    <button
                        onClick={() => setIsPaused(!isPaused)}
                        className={`p-1.5 rounded transition-colors ${isPaused ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-white'
                            }`}
                        title={isPaused ? '继续' : '暂停'}
                    >
                        {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    </button>

                    {/* 清空 */}
                    <button
                        onClick={clearLogs}
                        className="p-1.5 rounded bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="清空日志"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>

                    {/* 导出 */}
                    <button
                        onClick={handleExport}
                        className="p-1.5 rounded bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="导出日志"
                    >
                        <Download className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* 日志内容 */}
            <div
                ref={terminalRef}
                onScroll={handleScroll}
                className="overflow-auto font-mono text-xs leading-relaxed p-4"
                style={{ height }}
            >
                {filteredLogs.length === 0 ? (
                    <div className="text-slate-600 text-center py-8">
                        {filter ? '没有匹配的日志' : '等待日志...'}
                    </div>
                ) : (
                    filteredLogs.map((log, index) => (
                        <div
                            key={index}
                            className="flex hover:bg-slate-800/50 -mx-2 px-2 py-0.5 rounded"
                        >
                            <span className="text-slate-600 select-none mr-3 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <span className={`${log.text.includes('error') || log.text.includes('Error')
                                    ? 'text-red-400'
                                    : log.text.includes('warn') || log.text.includes('Warn')
                                        ? 'text-amber-400'
                                        : 'text-green-400'
                                }`}>
                                {log.text}
                            </span>
                        </div>
                    ))
                )}

                {/* 自动滚动提示 */}
                {!autoScroll && (
                    <button
                        onClick={() => {
                            setAutoScroll(true);
                            if (terminalRef.current) {
                                terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
                            }
                        }}
                        className="fixed bottom-4 right-4 bg-emerald-600 text-white px-3 py-1.5 rounded-full text-xs shadow-lg hover:bg-emerald-700 transition-colors"
                    >
                        ↓ 回到底部
                    </button>
                )}
            </div>
        </div>
    );
}

export default LogTerminal;
