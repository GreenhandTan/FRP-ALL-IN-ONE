/**
 * 客户端一键部署脚本下载组件
 * 
 * 完整用户流程：
 * 1. 用户选择客户端系统类型
 * 2. 显示对应的安装命令（直接从服务器下载）
 * 3. 用户复制命令到客户端执行
 * 4. 完成后返回控制面板
 */
import React, { useState, useEffect } from 'react';
import { Copy, Check, Download, Terminal, Apple, Monitor, Server, ChevronRight, Laptop, ExternalLink, FileCode } from 'lucide-react';
import { api } from '../api';
import { useLanguage } from '../LanguageContext';

// 平台配置
const PLATFORMS = {
    linux: {
        id: 'linux',
        name: 'Linux',
        icon: Terminal,
        color: 'from-orange-500 to-amber-500',
        bgColor: 'bg-orange-50',
        borderColor: 'border-orange-200',
        textColor: 'text-orange-600',
        description: 'Ubuntu, CentOS, Debian 等',
        archs: [
            { id: 'amd64', name: 'x64 (Intel/AMD)', default: true },
            { id: 'arm64', name: 'ARM64 (树莓派)' }
        ]
    },
    darwin: {
        id: 'darwin',
        name: 'macOS',
        icon: Apple,
        color: 'from-slate-600 to-slate-700',
        bgColor: 'bg-slate-50',
        borderColor: 'border-slate-200',
        textColor: 'text-slate-600',
        description: 'Intel 或 Apple Silicon',
        archs: [
            { id: 'amd64', name: 'Intel', default: true },
            { id: 'arm64', name: 'Apple Silicon (M1/M2/M3)' }
        ]
    },
    windows: {
        id: 'windows',
        name: 'Windows',
        icon: Monitor,
        color: 'from-blue-500 to-cyan-500',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        textColor: 'text-blue-600',
        description: 'Windows 10/11 x64',
        archs: [
            { id: 'amd64', name: 'x64', default: true }
        ]
    }
};

export function AgentDeployScript({ onClose, onComplete }) {
    const { t } = useLanguage();
    const [selectedPlatform, setSelectedPlatform] = useState(null);
    const [scriptInfo, setScriptInfo] = useState(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);

    // 获取服务器生成的脚本信息
    useEffect(() => {
        const fetchScriptInfo = async () => {
            try {
                const res = await api.get('/api/agent/install-script-info');
                setScriptInfo(res.data);
            } catch (err) {
                console.error('获取脚本信息失败:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchScriptInfo();
    }, []);

    // 根据平台生成安装命令
    const getInstallCommand = () => {
        if (!scriptInfo || !selectedPlatform) return '';

        const baseUrl = window.location.origin;

        if (selectedPlatform === 'windows') {
            // Windows PowerShell 命令
            return `# 以管理员身份运行 PowerShell，然后执行：
irm "${baseUrl}/api/agent/install-script/windows" | iex`;
        } else {
            // Linux/macOS bash 命令
            return `# 在终端中执行（需要 sudo 权限）：
curl -fsSL "${baseUrl}/api/agent/install-script/${selectedPlatform}" | sudo bash`;
        }
    };

    // 复制命令
    const handleCopy = async () => {
        const command = getInstallCommand();
        try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = command;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // 下载脚本文件
    const handleDownloadScript = () => {
        if (!scriptInfo || !selectedPlatform) return;

        const baseUrl = window.location.origin;
        const url = `${baseUrl}/api/agent/install-script/${selectedPlatform}`;
        const ext = selectedPlatform === 'windows' ? 'ps1' : 'sh';

        window.open(url, '_blank');
    };

    const platform = selectedPlatform ? PLATFORMS[selectedPlatform] : null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col">

                {/* 头部 */}
                <div className="px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white shadow-lg">
                            <Laptop size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900">部署客户端</h2>
                            <p className="text-sm text-slate-600">
                                选择客户端系统，复制命令一键安装
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-6 overflow-auto flex-1">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
                        </div>
                    ) : !selectedPlatform ? (
                        /* 步骤 1: 选择平台 */
                        <div className="space-y-4">
                            <div className="text-center mb-6">
                                <h3 className="font-semibold text-slate-900 text-lg">选择客户端操作系统</h3>
                                <p className="text-sm text-slate-500 mt-1">安装脚本将自动检测 CPU 架构</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {Object.values(PLATFORMS).map((p) => {
                                    const Icon = p.icon;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => setSelectedPlatform(p.id)}
                                            className={`p-5 rounded-xl border-2 transition-all text-left hover:scale-[1.02] hover:shadow-lg ${p.borderColor} ${p.bgColor} hover:border-emerald-400`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${p.color} flex items-center justify-center mb-3 shadow-md`}>
                                                <Icon className="w-6 h-6 text-white" />
                                            </div>
                                            <div className="font-semibold text-slate-800 text-lg">{p.name}</div>
                                            <div className="text-xs text-slate-500 mt-1">{p.description}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* 服务器信息 */}
                            {scriptInfo && (
                                <div className="mt-6 p-4 bg-slate-50 rounded-xl">
                                    <div className="text-sm text-slate-600 space-y-1">
                                        <div className="flex justify-between">
                                            <span>服务器地址</span>
                                            <span className="font-mono font-medium text-slate-900">{scriptInfo.server_ip}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>FRPS 端口</span>
                                            <span className="font-mono font-medium text-slate-900">{scriptInfo.frps_port}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span>FRP 版本</span>
                                            <span className="font-mono font-medium text-slate-900">v{scriptInfo.frps_version}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* 步骤 2: 复制安装命令 */
                        <div className="space-y-4">
                            <button
                                onClick={() => setSelectedPlatform(null)}
                                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                ← 返回选择系统
                            </button>

                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center shadow`}>
                                    <platform.icon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-slate-900">{platform.name} 安装命令</h3>
                                    <p className="text-xs text-slate-500">复制以下命令到客户端执行</p>
                                </div>
                            </div>

                            {/* 命令框 */}
                            <div className="bg-slate-900 rounded-xl overflow-hidden shadow-xl">
                                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-800">
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-red-500" />
                                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                            <div className="w-3 h-3 rounded-full bg-green-500" />
                                        </div>
                                        <span className="text-slate-400 text-sm ml-2">
                                            {selectedPlatform === 'windows' ? 'PowerShell (管理员)' : 'Terminal'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleCopy}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${copied
                                                ? 'bg-emerald-500 text-white'
                                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                            }`}
                                    >
                                        {copied ? <Check size={14} /> : <Copy size={14} />}
                                        {copied ? '已复制！' : '复制命令'}
                                    </button>
                                </div>
                                <pre className="p-4 text-green-400 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                    {getInstallCommand()}
                                </pre>
                            </div>

                            {/* 下载脚本选项 */}
                            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                <div className="flex items-center gap-3">
                                    <FileCode className="w-5 h-5 text-slate-400" />
                                    <div>
                                        <div className="text-sm font-medium text-slate-700">直接下载脚本文件</div>
                                        <div className="text-xs text-slate-500">适合网络受限环境</div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleDownloadScript}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors text-sm"
                                >
                                    <Download size={16} />
                                    下载 .{selectedPlatform === 'windows' ? 'ps1' : 'sh'}
                                </button>
                            </div>

                            {/* 安装说明 */}
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <div className="p-1 bg-amber-100 rounded">
                                        <Server className="w-4 h-4 text-amber-600" />
                                    </div>
                                    <div className="text-sm">
                                        <div className="font-medium text-amber-900">安装说明</div>
                                        <ul className="text-amber-700 mt-1 space-y-1 text-xs">
                                            {selectedPlatform === 'windows' ? (
                                                <>
                                                    <li>• 右键点击 PowerShell，选择"以管理员身份运行"</li>
                                                    <li>• 粘贴上述命令并按回车执行</li>
                                                    <li>• 脚本会自动下载 FRPC 并配置服务</li>
                                                </>
                                            ) : (
                                                <>
                                                    <li>• 打开终端，粘贴上述命令</li>
                                                    <li>• 可能需要输入 sudo 密码</li>
                                                    <li>• 脚本会自动下载 FRPC 并创建 systemd 服务</li>
                                                </>
                                            )}
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            {/* 完成提示 */}
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <div className="flex items-start gap-3">
                                    <div className="p-1.5 bg-emerald-100 rounded-lg">
                                        <ChevronRight className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-emerald-900">脚本执行完成后</div>
                                        <div className="text-sm text-emerald-700 mt-1">
                                            关闭此窗口，点击"返回控制面板"。您可以在隧道配置中添加端口映射规则。
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-slate-50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        关闭
                    </button>

                    {selectedPlatform && (
                        <button
                            onClick={() => {
                                if (onComplete) onComplete();
                                onClose();
                            }}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all font-medium shadow-lg"
                        >
                            配置完成，进入控制面板
                            <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AgentDeployScript;
