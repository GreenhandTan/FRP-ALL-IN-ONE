/**
 * 系统监控组件 - 显示客户端 CPU/内存/磁盘/网络指标
 */
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Cpu, HardDrive, Activity, Wifi, TrendingUp, TrendingDown } from 'lucide-react';

// 格式化字节
const formatBytes = (bytes, decimals = 1) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// 进度条组件
function ProgressBar({ value, color = 'emerald', showLabel = true }) {
    const percent = Math.min(100, Math.max(0, value || 0));

    return (
        <div className="w-full">
            <div className="flex justify-between mb-1">
                {showLabel && (
                    <span className={`text-xs font-medium ${percent > 80 ? 'text-red-600' : 'text-slate-600'}`}>
                        {percent.toFixed(1)}%
                    </span>
                )}
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${percent > 90 ? 'bg-red-500' :
                            percent > 70 ? 'bg-amber-500' :
                                `bg-${color}-500`
                        }`}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

// 单个指标卡片
function MetricCard({ title, value, subValue, icon: Icon, color = 'emerald', percent }) {
    return (
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg bg-${color}-100`}>
                    <Icon className={`w-4 h-4 text-${color}-600`} />
                </div>
                <span className="text-sm font-medium text-slate-600">{title}</span>
            </div>

            <div className="text-lg font-semibold text-slate-900 mb-1">
                {value}
            </div>

            {subValue && (
                <div className="text-xs text-slate-500 mb-2">
                    {subValue}
                </div>
            )}

            {percent !== undefined && (
                <ProgressBar value={percent} color={color} />
            )}
        </div>
    );
}

// 主组件
export function SystemMonitor({ clientId, compact = false }) {
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!clientId) return;

        const fetchMetrics = async () => {
            try {
                const res = await api.get(`/api/agents/${clientId}/metrics/latest`);
                if (res.data.success) {
                    setMetrics(res.data);
                    setError(null);
                } else {
                    setMetrics(null);
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 5000); // 每 5 秒刷新

        return () => clearInterval(interval);
    }, [clientId]);

    if (loading) {
        return (
            <div className="text-slate-400 text-sm p-4">
                加载系统指标中...
            </div>
        );
    }

    if (error || !metrics) {
        return (
            <div className="text-slate-400 text-sm p-4">
                暂无系统指标数据
            </div>
        );
    }

    if (compact) {
        // 紧凑模式 - 用于客户端列表
        return (
            <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                    <Cpu className="w-3 h-3 text-emerald-600" />
                    <span>{metrics.cpu_percent?.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-blue-600" />
                    <span>{metrics.memory_percent?.toFixed(1)}%</span>
                </div>
                <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-purple-600" />
                    <span>{formatBytes(metrics.net_bytes_in)} / {formatBytes(metrics.net_bytes_out)}</span>
                </div>
            </div>
        );
    }

    // 完整模式 - 用于详情页
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
                title="CPU"
                value={`${metrics.cpu_percent?.toFixed(1)}%`}
                icon={Cpu}
                color="emerald"
                percent={metrics.cpu_percent}
            />

            <MetricCard
                title="内存"
                value={formatBytes(metrics.memory_used)}
                subValue={`共 ${formatBytes(metrics.memory_total)}`}
                icon={HardDrive}
                color="blue"
                percent={metrics.memory_percent}
            />

            <MetricCard
                title="磁盘"
                value={formatBytes(metrics.disk_used)}
                subValue={`共 ${formatBytes(metrics.disk_total)}`}
                icon={Activity}
                color="purple"
                percent={metrics.disk_percent}
            />

            <MetricCard
                title="网络"
                value={
                    <div className="flex flex-col text-sm">
                        <span className="flex items-center gap-1">
                            <TrendingDown className="w-3 h-3 text-green-500" />
                            {formatBytes(metrics.net_bytes_in)}
                        </span>
                        <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3 text-orange-500" />
                            {formatBytes(metrics.net_bytes_out)}
                        </span>
                    </div>
                }
                icon={Wifi}
                color="amber"
            />
        </div>
    );
}

export default SystemMonitor;
