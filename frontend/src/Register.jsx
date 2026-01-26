import React, { useState } from 'react';
import { UserPlus, Lock, User } from 'lucide-react';
import { api } from './api';

export default function Register({ onRegisterSuccess }) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        // 验证密码
        if (password !== confirmPassword) {
            setError("两次输入的密码不一致");
            return;
        }

        if (password.length < 6) {
            setError("密码长度不能少于 6 个字符");
            return;
        }

        setLoading(true);

        try {
            const response = await api.post('/api/auth/register', {
                username,
                password
            });

            const { access_token } = response.data;
            localStorage.setItem('token', access_token);
            api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            onRegisterSuccess();
        } catch (err) {
            console.error(err);
            if (err.response && err.response.status === 403) {
                setError("系统已初始化，请使用登录功能");
            } else {
                setError("注册失败，请重试");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/25">
                        <UserPlus size={32} className="text-white" />
                    </div>
                    <h2 className="text-2xl font-bold text-white">欢迎使用 FRP Manager</h2>
                    <p className="text-slate-400 text-sm mt-2">首次启动，请创建管理员账户</p>
                </div>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-6 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">用户名</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all placeholder-slate-500"
                                placeholder="请输入用户名"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">密码</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all placeholder-slate-500"
                                placeholder="至少 6 个字符"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">确认密码</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all placeholder-slate-500"
                                placeholder="再次输入密码"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-violet-500/20 mt-6"
                    >
                        {loading ? "创建中..." : "创建账户"}
                    </button>
                </form>
            </div>
        </div>
    );
}
