import React, { useState } from 'react';
import { Server, Download, CheckCircle, Copy } from 'lucide-react';
import { api } from './api';

export default function SetupWizard({ onSetupComplete }) {
    const [step, setStep] = useState(1); // 1: 输入参数, 2: 部署中, 3: 生成脚本
    const [port, setPort] = useState("7000");
    const [loading, setLoading] = useState(false);
    const [deployResult, setDeployResult] = useState(null);
    const [clientScript, setClientScript] = useState("");
    const [error, setError] = useState("");

    const handleDeployServer = async () => {
        setLoading(true);
        setError("");

        try {
            const response = await api.post('/api/frp/deploy-server', null, {
                params: {
                    port: parseInt(port)
                    // version 由系统自动使用推荐版本
                    // auth_token 留空，由后端自动生成
                }
            });

            if (response.data.success) {
                setDeployResult(response.data.info);
                setStep(2);
                // 自动获取客户端脚本
                fetchClientScript();
            } else {
                setError(response.data.message || "部署失败");
            }
        } catch (err) {
            console.error(err);
            setError("部署失败: " + (err.response?.data?.detail || err.message));
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
        alert("脚本已复制到剪贴板");
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
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-2xl shadow-2xl">
                {/* Step 1: 参数输入 */}
                {step === 1 && (
                    <>
                        <div className="text-center mb-8">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                                <Server size={32} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">FRPS 服务端配置</h2>
                            <p className="text-slate-400 text-sm mt-2">系统将生成 FRPS 配置并自动启动服务（Docker 容器）</p>
                        </div>

                        {error && (
                            <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-6 text-sm">
                                {error}
                            </div>
                        )}

                        <div className="space-y-5">
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                <p className="text-sm text-blue-200">
                                    🚀 系统将自动使用 <strong>FRP 推荐版本 (0.61.1)</strong> 进行部署。
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">监听端口</label>
                                <input
                                    type="number"
                                    value={port}
                                    onChange={(e) => setPort(e.target.value)}
                                    className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    placeholder="7000"
                                />
                            </div>

                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                                <p className="text-sm text-blue-200">
                                    💡 <strong>认证 Token</strong> 将由系统自动生成，部署成功后会显示。
                                </p>
                            </div>

                            <button
                                onClick={handleDeployServer}
                                disabled={loading}
                                className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-blue-500/20 mt-6"
                            >
                                {loading ? "部署中..." : "开始部署"}
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
                        <h2 className="text-2xl font-bold text-white mb-6">FRPS 部署成功！</h2>

                        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6 text-left space-y-3">
                            <div><span className="text-slate-400">版本:</span> <span className="text-white font-mono">{deployResult.version}</span></div>
                            <div><span className="text-slate-400">端口:</span> <span className="text-white font-mono">{deployResult.port}</span></div>
                            <div><span className="text-slate-400">公网 IP:</span> <span className="text-white font-mono">{deployResult.public_ip}</span></div>
                            <div className="pt-2 border-t border-white/10">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-slate-400 font-semibold">🔑 认证 Token (自动生成):</span>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(deployResult.auth_token);
                                            alert("Token 已复制到剪贴板");
                                        }}
                                        className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                    >
                                        <Copy size={12} />
                                        复制
                                    </button>
                                </div>
                                <code className="block text-white bg-slate-900/50 px-3 py-2 rounded text-xs break-all font-mono border border-emerald-500/30">
                                    {deployResult.auth_token}
                                </code>
                            </div>
                        </div>

                        <p className="text-slate-400 text-sm mt-6">正在生成客户端部署脚本...</p>
                    </div>
                )}

                {/* Step 3: 客户端脚本 */}
                {step === 3 && clientScript && (
                    <>
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25">
                                <Download size={32} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">客户端部署脚本</h2>
                            <p className="text-slate-400 text-sm mt-2">请在内网机器上以 root 权限执行此脚本</p>
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
                                复制脚本
                            </button>
                            <button
                                onClick={downloadScript}
                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg transition-colors"
                            >
                                <Download size={16} />
                                下载脚本
                            </button>
                        </div>

                        <button
                            onClick={onSetupComplete}
                            className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-violet-500/20"
                        >
                            完成设置，进入管理面板
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
