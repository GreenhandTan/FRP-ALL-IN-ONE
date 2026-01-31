import React, { useState, useEffect, useRef } from 'react';
import { Server, Download, CheckCircle, Copy, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from './api';
import { useLanguage } from './LanguageContext';
import { useDialog } from './ui/DialogProvider';
import CodeBlock from './ui/CodeBlock';

export default function SetupWizard({ onSetupComplete }) {
    const { t } = useLanguage();
    const dialog = useDialog();
    const [step, setStep] = useState(1); // 1: 输入参数, 2: 部署成功, 3: 生成脚本
    const [port, setPort] = useState("7000");
    const [serverIp, setServerIp] = useState(""); // 公网 IP
    const [ipAutoDetected, setIpAutoDetected] = useState(false); // 是否自动检测成功
    const [ipLoading, setIpLoading] = useState(true); // IP 检测中
    const [ipDetectMessage, setIpDetectMessage] = useState(""); // 检测失败原因
    const [loading, setLoading] = useState(false);
    const [deployResult, setDeployResult] = useState(null);
    const [clientScript, setClientScript] = useState("");
    const [selectedPlatform, setSelectedPlatform] = useState(null); // 'linux', 'darwin', 'windows'
    const [error, setError] = useState("");
    const [tokenCopySuccess, setTokenCopySuccess] = useState(false);
    const tokenCopyTimerRef = useRef(null);

    // 页面加载时自动获取公网 IP
    useEffect(() => {
        const fetchPublicIp = async () => {
            setIpLoading(true);
            setIpDetectMessage("");
            try {
                const response = await api.get('/api/system/public-ip');
                if (response.data.success && response.data.ip) {
                    setServerIp(response.data.ip.trim());
                    setIpAutoDetected(true);
                } else {
                    setServerIp("");
                    setIpAutoDetected(false);
                    const errs = response.data.errors || [];
                    if (errs.length) {
                        setIpDetectMessage(errs.slice(0, 2).join(" | "));
                    }
                }
            } catch (err) {
                console.error("获取公网 IP 失败", err);
                setIpAutoDetected(false);
                setIpDetectMessage(err.response?.data?.detail || err.message);
            } finally {
                setIpLoading(false);
            }
        };
        fetchPublicIp();
    }, []);

    useEffect(() => {
        return () => {
            if (tokenCopyTimerRef.current) {
                clearTimeout(tokenCopyTimerRef.current);
            }
        };
    }, []);

    const handleDeployServer = async () => {
        // 验证：如果未自动检测到 IP 且用户未输入，则提示
        if (!serverIp.trim()) {
            setError(t('setup.serverIpRequired'));
            return;
        }

        setLoading(true);
        setError("");

        try {
            const params = {
                port: parseInt(port),
                server_ip: serverIp.trim()
            };
            const response = await api.post('/api/frp/deploy-server', null, { params });

            if (response.data.success) {
                setDeployResult({
                    ...response.data.info,
                    frps_restarted: response.data.frps_restarted,
                    restart_message: response.data.restart_message
                });
                setStep(2);
                // 不再自动跳转，等待用户手动点击下一步
            } else {
                setError(response.data.message || t('setup.deployFailed'));
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || err.message);
        } finally {
            setLoading(false);
        }
    };

    const [copySuccess, setCopySuccess] = useState(false);

    // Fallback for HTTP environments or when Clipboard API fails
    const unsecuredCopyToClipboard = (text) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;

            // Ensure invisible but selectable
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";

            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (err) {
            console.error("Fallback copy failed", err);
            return false;
        }
    };

    // 兼容 HTTP 环境的剪贴板复制函数
    const copyToClipboard = async (text) => {
        // 优先使用 Clipboard API (需要 HTTPS 或 Localhost)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn("Clipboard API failed, falling back to unsecured method...", err);
            }
        }
        // Fallback to unsecured method
        return unsecuredCopyToClipboard(text);
    };

    const copyToken = async (token) => {
        const copied = await copyToClipboard(token);
        if (!copied) return;

        setTokenCopySuccess(true);
        if (tokenCopyTimerRef.current) {
            clearTimeout(tokenCopyTimerRef.current);
        }
        tokenCopyTimerRef.current = setTimeout(() => setTokenCopySuccess(false), 2000);
    };

    const copyScript = async () => {
        if (await copyToClipboard(clientScript)) {
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } else {
            await dialog.alert({
                title: t('setup.copyFailed') || '复制失败',
                description: '',
            });
        }
    };

    const downloadScript = () => {
        const blob = new Blob([clientScript], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // 根据平台决定文件扩展名
        const ext = selectedPlatform === 'windows' ? 'ps1' : 'sh';
        a.download = `deploy-frpc.${ext}`;
        a.click();
    };

    // 选择平台并获取对应脚本
    const handleSelectPlatform = async (platform) => {
        setSelectedPlatform(platform);
        setClientScript(''); // 清空旧脚本，显示加载状态
        try {
            const response = await api.get(`/api/agent/install-script/${platform}`);
            setClientScript(response.data);
        } catch (err) {
            console.error('获取脚本失败:', err);
            setClientScript(`# 获取脚本失败: ${err.message}\n# 请检查服务器配置`);
        }
    };

    // 进入 Step 3 时重置平台选择
    const fetchClientScript = async () => {
        setSelectedPlatform(null);
        setClientScript('');
        setStep(3);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-2xl shadow-2xl">
                {/* Step 1: 参数输入 */}
                {step === 1 && (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                <Server size={32} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">{t('setup.title')}</h2>
                            <p className="text-slate-400 text-sm mt-2">{t('setup.subtitle')}</p>
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-6 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-5">
                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                <p className="text-sm text-emerald-200">
                                    🚀 {t('setup.versionHint')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">{t('setup.portLabel')}</label>
                                <input
                                    type="number"
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                                    placeholder="7000"
                                />
                            </div>

                            {/* 公网 IP 输入区域 */}
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                    {t('setup.serverIpLabel')}
                                    {ipAutoDetected && (
                                        <span className="ml-2 text-emerald-400 text-xs">✓ {t('setup.autoDetected')}</span>
                                    )}
                                    {!ipLoading && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setIpLoading(true);
                                                setIpDetectMessage("");
                                                try {
                                                    const response = await api.get('/api/system/public-ip');
                                                    if (response.data.success && response.data.ip) {
                                                        setServerIp(response.data.ip.trim());
                                                        setIpAutoDetected(true);
                                                    } else {
                                                        setServerIp("");
                                                        setIpAutoDetected(false);
                                                        const errs = response.data.errors || [];
                                                        if (errs.length) setIpDetectMessage(errs.slice(0, 2).join(" | "));
                                                    }
                                                } catch (err) {
                                                    setIpAutoDetected(false);
                                                    setIpDetectMessage(err.response?.data?.detail || err.message);
                                                } finally {
                                                    setIpLoading(false);
                                                }
                                            }}
                                            className="ml-3 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-slate-800/50 border border-white/10 text-slate-200 hover:bg-slate-700/50 transition-colors"
                                        >
                                            <RefreshCw size={12} />
                                            {t('setup.retryDetect')}
                                        </button>
                                    )}
                                </label>

                                {ipLoading ? (
                                    <div className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 px-4 text-slate-400">
                                        {t('setup.detectingIp')}...
                                    </div>
                                ) : (
                                    <>
                                        {!ipAutoDetected && (
                                            <div className="bg-amber-500/20 border border-amber-500/50 text-amber-200 px-4 py-2 rounded-lg mb-3 text-sm flex items-center gap-2">
                                                <AlertTriangle size={16} />
                                                <span>
                                                    {t('setup.ipDetectFailed')}
                                                    {ipDetectMessage ? `（${ipDetectMessage}）` : ''}
                                                </span>
                                            </div>
                                        )}
                                        <input
                                            type="text"
                                            value={serverIp}
                                            onChange={(e) => setServerIp(e.target.value)}
                                            className={`w-full bg-slate-800/50 border rounded-xl py-2.5 px-4 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none font-mono ${ipAutoDetected ? 'border-emerald-500/30' : 'border-amber-500/50'
                                                }`}
                                            placeholder="例如: 123.45.67.89"
                                        />
                                        {!ipAutoDetected && (
                                            <p className="text-xs text-amber-300 mt-1">
                                                {t('setup.pleaseEnterIp')}
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
                                <p className="text-sm text-emerald-200">
                                    💡 {t('setup.tokenHint')}
                                </p>
                            </div>

                            <button
                                onClick={handleDeployServer}
                                disabled={loading || ipLoading}
                                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-emerald-500/20 mt-6"
                            >
                                {loading ? t('setup.deploying') : t('setup.deployButton')}
                            </button>
                        </div>
                    </>
                )}

                {/* Step 2: 部署成功 */}
                {step === 2 && deployResult && (
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                            <CheckCircle size={32} className="text-white" />
                        </div>
                        <h2 className="text-2xl font-bold text-white mb-6">{t('setup.successTitle')}</h2>

                        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 text-left space-y-3">
                            <div><span className="text-slate-400">{t('setup.version')}:</span> <span className="text-white font-mono">{deployResult.version}</span></div>
                            <div><span className="text-slate-400">{t('setup.port')}:</span> <span className="text-white font-mono">{deployResult.port}</span></div>
                            <div><span className="text-slate-400">{t('setup.publicIP')}:</span> <span className="text-white font-mono">{deployResult.public_ip}</span></div>
                            <div className="pt-2 border-t border-white/10">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-slate-400 font-semibold">🔑 {t('setup.authToken')}:</span>
                                    <button
                                        onClick={async () => {
                                            await copyToken(deployResult.auth_token);
                                        }}
                                        className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${tokenCopySuccess ? 'bg-emerald-600 text-white' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'}`}
                                    >
                                        {tokenCopySuccess ? <CheckCircle size={12} /> : <Copy size={12} />}
                                        {tokenCopySuccess ? t('copySuccess') : t('copy')}
                                    </button>
                                </div>
                                <code className="block text-white bg-slate-900/50 px-3 py-2 rounded text-xs break-all font-mono border border-emerald-500/30">
                                    {deployResult.auth_token}
                                </code>
                            </div>

                            {/* FRPS 重启状态 */}
                            <div className="pt-2 border-t border-white/10">
                                {deployResult.frps_restarted ? (
                                    <div className="flex items-center gap-2 text-emerald-400 text-sm">
                                        <CheckCircle size={16} />
                                        <span>{t('setup.frpsRestarted')}</span>
                                    </div>
                                ) : (
                                    <div className="bg-amber-500/20 border border-amber-500/50 text-amber-200 px-3 py-2 rounded text-sm">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 font-semibold">
                                                <AlertTriangle size={16} />
                                                {t('setup.frpsRestartFailed')}
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        const res = await api.post('/api/frp/restart-frps');
                                                        if (res.data.success) {
                                                            setDeployResult(prev => ({ ...prev, frps_restarted: true }));
                                                        } else {
                                                            await dialog.alert({
                                                                title: t('setup.frpsRestartFailed'),
                                                                description: res.data.message || '',
                                                            });
                                                        }
                                                    } catch (e) {
                                                        await dialog.alert({
                                                            title: t('setup.frpsRestartFailed'),
                                                            description: e.response?.data?.detail || e.message,
                                                        });
                                                    }
                                                }}
                                                className="text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded transition-colors flex items-center gap-1"
                                            >
                                                <RefreshCw size={12} />
                                                {t('setup.retryRestart')}
                                            </button>
                                        </div>
                                        <p className="text-xs mt-1 text-amber-300">
                                            {deployResult.restart_message || t('setup.manualRestart')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 下一步按钮 */}
                        <button
                            onClick={fetchClientScript}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/20 mt-6 flex items-center justify-center gap-2"
                        >
                            {t('setup.nextStep')}
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                )}

                {/* Step 3: 客户端脚本 - 支持平台选择 */}
                {step === 3 && (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                <Download size={32} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">{t('setup.clientScriptTitle')}</h2>
                            <p className="text-slate-400 text-sm mt-2">选择客户端操作系统，获取对应的安装命令</p>
                        </div>

                        {/* 平台选择 */}
                        {!selectedPlatform ? (
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <button
                                    onClick={() => handleSelectPlatform('linux')}
                                    className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 rounded-xl transition-all text-center group"
                                >
                                    <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M12.503 18.04c-.46 0-.912-.057-1.35-.17-.438-.114-.864-.287-1.275-.52a.652.652 0 0 1-.25-.236.547.547 0 0 1-.068-.27c0-.12.04-.22.12-.3.08-.08.18-.12.3-.12.1 0 .19.025.27.075.49.28.996.49 1.52.63.523.14 1.05.21 1.58.21.7 0 1.23-.117 1.59-.35.36-.233.54-.573.54-1.02 0-.287-.093-.523-.28-.71-.187-.187-.487-.35-.9-.49l-1.74-.58c-.787-.26-1.37-.603-1.75-1.03-.38-.427-.57-.953-.57-1.58 0-.487.117-.92.35-1.3.233-.38.567-.68 1-.9.433-.22.943-.33 1.53-.33.413 0 .82.05 1.22.15.4.1.78.253 1.14.46.14.08.243.18.31.3a.55.55 0 0 1 .1.32c0 .12-.04.22-.12.3-.08.08-.18.12-.3.12-.1 0-.19-.023-.27-.07-.28-.16-.573-.283-.88-.37a3.563 3.563 0 0 0-.98-.13c-.553 0-.987.107-1.3.32-.313.213-.47.517-.47.91 0 .273.093.503.28.69.187.187.493.353.92.5l1.66.56c.813.273 1.407.62 1.78 1.04.373.42.56.94.56 1.56 0 .527-.127.99-.38 1.39-.253.4-.617.71-1.09.93-.473.22-1.037.33-1.69.33z" />
                                        </svg>
                                    </div>
                                    <div className="text-white font-medium">Linux</div>
                                    <div className="text-slate-400 text-xs mt-1">Ubuntu, CentOS, Debian</div>
                                </button>
                                <button
                                    onClick={() => handleSelectPlatform('darwin')}
                                    className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 rounded-xl transition-all text-center group"
                                >
                                    <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-slate-600 to-slate-700 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                                        </svg>
                                    </div>
                                    <div className="text-white font-medium">macOS</div>
                                    <div className="text-slate-400 text-xs mt-1">Intel / Apple Silicon</div>
                                </button>
                                <button
                                    onClick={() => handleSelectPlatform('windows')}
                                    className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/50 rounded-xl transition-all text-center group"
                                >
                                    <div className="w-12 h-12 mx-auto mb-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                                        <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M3 5.548l7.048-0.97v6.811H3V5.548zm0 12.904l7.048 0.97v-6.711H3v5.741zm7.907 1.073L21 21v-8.389h-10.093v6.914zm0-14.051v6.915H21V3l-10.093 1.474z" />
                                        </svg>
                                    </div>
                                    <div className="text-white font-medium">Windows</div>
                                    <div className="text-slate-400 text-xs mt-1">PowerShell</div>
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* 返回按钮 */}
                                <button
                                    onClick={() => { setSelectedPlatform(null); setClientScript(''); }}
                                    className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1"
                                >
                                    ← 返回选择系统
                                </button>

                                {/* 平台标识 */}
                                <div className="flex items-center gap-3 mb-4 p-3 bg-white/5 rounded-xl">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedPlatform === 'linux' ? 'bg-gradient-to-br from-orange-500 to-amber-500' :
                                        selectedPlatform === 'darwin' ? 'bg-gradient-to-br from-slate-600 to-slate-700' :
                                            'bg-gradient-to-br from-blue-500 to-cyan-500'
                                        }`}>
                                        {selectedPlatform === 'windows' ? (
                                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M3 5.548l7.048-0.97v6.811H3V5.548zm0 12.904l7.048 0.97v-6.711H3v5.741zm7.907 1.073L21 21v-8.389h-10.093v6.914zm0-14.051v6.915H21V3l-10.093 1.474z" />
                                            </svg>
                                        ) : (
                                            <Server size={20} className="text-white" />
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-white font-medium">
                                            {selectedPlatform === 'linux' ? 'Linux' : selectedPlatform === 'darwin' ? 'macOS' : 'Windows'} 安装命令
                                        </div>
                                        <div className="text-slate-400 text-xs">
                                            {selectedPlatform === 'windows' ? '以管理员身份运行 PowerShell' : '在终端中执行（需要 sudo 权限）'}
                                        </div>
                                    </div>
                                </div>

                                {/* 命令显示 */}
                                {clientScript ? (
                                    <>
                                        <CodeBlock value={clientScript} className="mb-4" />

                                        <div className="flex gap-3 mb-4">
                                            <button
                                                onClick={copyScript}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg transition-colors ${copySuccess
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                                                    }`}
                                            >
                                                {copySuccess ? <CheckCircle size={16} /> : <Copy size={16} />}
                                                {copySuccess ? t('setup.scriptCopied') : t('setup.copyScript')}
                                            </button>
                                            <button
                                                onClick={downloadScript}
                                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg transition-colors"
                                            >
                                                <Download size={16} />
                                                {t('setup.downloadScript')}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
                                    </div>
                                )}
                            </>
                        )}

                        {/* <button
                            onClick={onSetupComplete}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/20"
                        >
                            {t('setup.finish')}
                        </button> */}
                        <div className="flex justify-center mt-6">
                            <button
                                onClick={onSetupComplete}
                                className="text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors"
                            >
                                {t('setup.finish')} &rarr;
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
