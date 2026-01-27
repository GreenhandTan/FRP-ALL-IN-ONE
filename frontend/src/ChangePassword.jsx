import React, { useState } from 'react';
import { Lock, X, Check } from 'lucide-react';
import { api } from './api';
import { useLanguage } from './LanguageContext';

function ChangePassword({ onClose, onSuccess }) {
    const { t } = useLanguage();
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError(t('changePassword.errorMismatch'));
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
                onSuccess();
            }, 1500);
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || t('changePassword.errorFailed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X size={20} />
                </button>

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                        <Lock className="text-emerald-600" size={20} />
                    </div>
                    <h2 className="text-xl font-bold text-slate-800">{t('changePassword.title')}</h2>
                </div>

                {success ? (
                    <div className="flex flex-col items-center py-8">
                        <div className="bg-emerald-100 p-4 rounded-full mb-4">
                            <Check className="text-emerald-600" size={32} />
                        </div>
                        <p className="text-emerald-600 font-medium">{t('changePassword.success')}</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('changePassword.oldPassword')}</label>
                            <input
                                type="password"
                                required
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('changePassword.newPassword')}</label>
                            <input
                                type="password"
                                required
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('changePassword.confirmPassword')}</label>
                            <input
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full border border-slate-200 rounded-lg py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                {t('cancel')}
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                                {loading ? t('changePassword.submitting') : t('changePassword.submit')}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default ChangePassword;
