import React, { useState } from 'react';
import { Lock, User } from 'lucide-react';
import { api } from './api';
import { useLanguage } from './LanguageContext';

export default function Login({ onLoginSuccess }) {
    const { t } = useLanguage();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await api.post('/token', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token } = response.data;
            localStorage.setItem('token', access_token);
            api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
            onLoginSuccess();
        } catch (err) {
            console.error(err);
            setError(t('login.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <h2 className="text-2xl font-bold text-white mb-6 text-center">{t('login.title')}</h2>

                {error && (
                    <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg mb-6 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">{t('login.username')}</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder-slate-500"
                                placeholder={t('login.usernamePlaceholder')}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">{t('login.password')}</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-800/50 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all placeholder-slate-500"
                                placeholder="••••••••"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                    >
                        {loading ? t('login.submitting') : t('login.submit')}
                    </button>
                </form>
            </div>
        </div>
    );
}
