import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LinguistFlowAPI } from '../lib/api';
import { Zap, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const result = await LinguistFlowAPI.login(email, password);
            // Fetch user profile after successful login
            const profile = await LinguistFlowAPI.getMe();
            login(result.access_token, profile);
            navigate('/');
        } catch (err: any) {
            setError(err.message || 'Login fehlgeschlagen. Bitte überprüfen Sie Ihre Daten.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f7f8] dark:bg-[#141414] flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8 transition-colors duration-200">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                        <Zap className="w-6 h-6 text-white fill-white" />
                    </div>
                </div>
                <h2 className="mt-2 text-center text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                    Willkommen zurück
                </h2>
                <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                    Oder{' '}
                    <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500 transition-colors">
                        erstellen Sie einen neuen Account
                    </Link>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white dark:bg-[#1f1f1f] py-8 px-4 shadow-xl shadow-black/5 dark:shadow-black/20 sm:rounded-2xl sm:px-10 border border-gray-100 dark:border-white/5">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                E-Mail Adresse
                            </label>
                            <div className="mt-1">
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-white transition-colors"
                                    placeholder="name@unternehmen.de"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Passwort
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-[#0d0d0d] text-gray-900 dark:text-white transition-colors"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    'Anmelden'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
