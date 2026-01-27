import React, { useState, useEffect } from 'react';
import { Server, Download, CheckCircle, Copy, AlertTriangle } from 'lucide-react';
import { api } from './api';
import { useLanguage } from './LanguageContext';

export default function SetupWizard({ onSetupComplete }) {
    const { t } = useLanguage();
    const [step, setStep] = useState(1); // 1: 输入参数, 2: 部署成功, 3: 生成脚本
    const [port, setPort] = useState("7000");
    const [serverIp, setServerIp] = useState(""); // 公网 IP
    const [ipAutoDetected, setIpAutoDetected] = useState(false); // 是否自动检测成功
    const [ipLoading, setIpLoading] = useState(true); // IP 检测中
    const [loading, setLoading] = useState(false);
    const [deployResult, setDeployResult] = useState(null);
    const [clientScript, setClientScript] = useState("");
    const [error, setError] = useState("");

    // 页面加载时自动获取公网 IP
    useEffect(() => {
        const fetchPublicIp = async () => {
            try {
                const response = await api.get('/api/system/public-ip');
                if (response.data.success) {
                    setServerIp(response.data.ip);
                    setIpAutoDetected(true);
                } else {
                    setServerIp("");
                    setIpAutoDetected(false);
                }
            } catch (err) {
                console.error("获取公网 IP 失败", err);
                setIpAutoDetected(false);
            } finally {
                setIpLoading(false);
            }
        };
        fetchPublicIp();
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
                fetchClientScript();
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

    const fetchClientScript = async () => {
        try {
            const response = await api.get('/api/frp/generate-client-script');
            setClientScript(response.data.script);
            setStep(3);
        } catch (err) {
            console.error(err);
        }
    };

    const copyScript = () => {
        navigator.clipboard.writeText(clientScript);
        alert(t('setup.scriptCopied'));
    };

    const downloadScript = () => {
        const blob = new Blob([clientScript], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'deploy-frpc.sh';
        a.click();
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
                                                {t('setup.ipDetectFailed')}
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
                                        onClick={() => {
                                            navigator.clipboard.writeText(deployResult.auth_token);
                                            alert(t('setup.copied'));
                                        }}
                                        className="text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                    >
                                        <Copy size={12} />
                                        {t('copy')}
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
                                        <div className="flex items-center gap-2 font-semibold">
                                            <AlertTriangle size={16} />
                                            {t('setup.frpsRestartFailed')}
                                        </div>
                                        <p className="text-xs mt-1 text-amber-300">
                                            {deployResult.restart_message || t('setup.manualRestart')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className="text-slate-400 text-sm mt-6">{t('setup.generatingScript')}</p>
                    </div>
                )}

                {/* Step 3: 客户端脚本 */}
                {step === 3 && clientScript && (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                <Download size={32} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">{t('setup.clientScriptTitle')}</h2>
                            <p className="text-slate-400 text-sm mt-2">{t('setup.clientScriptHint')}</p>
                        </div>

                        <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4 mb-4 max-h-64 overflow-auto">
                            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{clientScript}</pre>
                        </div>

                        <div className="flex gap-3 mb-4">
                            <button
                                onClick={copyScript}
                                className="flex-1 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2.5 rounded-lg transition-colors"
                            >
                                <Copy size={16} />
                                {t('setup.copyScript')}
                            </button>
                            <button
                                onClick={downloadScript}
                                className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-lg transition-colors"
                            >
                                <Download size={16} />
                                {t('setup.downloadScript')}
                            </button>
                        </div>

                        <button
                            onClick={onSetupComplete}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-emerald-500/20"
                        >
                            {t('setup.finish')}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
