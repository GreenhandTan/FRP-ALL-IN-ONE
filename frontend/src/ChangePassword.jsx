import React, { useState } from 'react';
import { api } from './api';
import { X, Key, Lock, Check } from 'lucide-react';

function ChangePassword({ onClose, onSuccess }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // 验证新密码
        if (newPassword !== confirmPassword) {
            setError('两次输入的新密码不一致');
            return;
        }

        if (newPassword.length < 6) {
            setError('新密码长度至少为 6 位');
            return;
        }

        setLoading(true);
        try {
            await api.post('/api/auth/change-password', null, {
                params: {
                    old_password: oldPassword,
                    new_password: newPassword
                }
            });
            setSuccess(true);
            setTimeout(() => {
                onSuccess && onSuccess();
                onClose();
            }, 1500);
        } catch (err) {
            setError(err.response?.data?.detail || '密码修改失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
                {/* 关闭按钮 */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={20} />
                </button>

                {/* 标题 */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-amber-100 p-3 rounded-xl">
                        <Key className="text-amber-600" size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">修改密码</h2>
                        <p className="text-sm text-slate-500">请输入当前密码和新密码</p>
                    </div>
                </div>

                {success ? (
                    <div className="flex flex-col items-center py-8">
                        <div className="bg-emerald-100 p-4 rounded-full mb-4">
                            <Check className="text-emerald-600" size={32} />
                        </div>
                        <p className="text-emerald-600 font-medium">密码修改成功！</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                当前密码
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="password"
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                    required
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                                    placeholder="输入当前密码"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                新密码
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                                    placeholder="输入新密码（至少 6 位）"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">
                                确认新密码
                            </label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                                    placeholder="再次输入新密码"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors font-medium"
                            >
                                取消
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors font-medium disabled:opacity-50"
                            >
                                {loading ? '提交中...' : '确认修改'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default ChangePassword;
