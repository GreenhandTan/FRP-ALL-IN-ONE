import React, { useState } from 'react';
import { Lock, Check } from 'lucide-react';
import { api } from './api';
import { useLanguage } from './LanguageContext';
import Modal from './ui/Modal';

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
                    <p className="text-emerald-600 font-medium mb-6">{t('changePassword.success')}</p>
                    <button
                        onClick={onSuccess}
                        className="px-6 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                        {t('login.submit')}
                    </button>
                </div >
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
                    className="w-full border border-slate-200 rounded-xl py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('changePassword.newPassword')}</label>
                <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('changePassword.confirmPassword')}</label>
                <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl py-2 px-3 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none"
                />
            </div>

            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2 rounded-xl text-sm font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                    {t('cancel')}
                </button>
                <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                    {loading ? t('changePassword.submitting') : t('changePassword.submit')}
                </button>
            </div>
        </form>
    )
}
        </Modal >
    );
}

export default ChangePassword;
