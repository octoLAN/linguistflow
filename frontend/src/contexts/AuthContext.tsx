import React, { createContext, useContext, useState, useEffect } from 'react';
import { fetchWithAuth } from '../lib/api';

interface User {
    id: string;
    email: string;
    full_name: string | null;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (token: string, userData: User) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    token: null,
    isLoading: true,
    login: () => { },
    logout: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initializeAuth = async () => {
            const storedToken = localStorage.getItem('lf_token');
            if (!storedToken) {
                setIsLoading(false);
                return;
            }

            try {
                // Verify token and fetch user details
                const response = await fetchWithAuth('/auth/me');
                if (response.ok) {
                    const userData = await response.json();
                    setToken(storedToken);
                    setUser(userData);
                } else {
                    // Token is invalid/expired
                    localStorage.removeItem('lf_token');
                    setToken(null);
                    setUser(null);
                }
            } catch (error) {
                console.error("Auth verification failed:", error);
                localStorage.removeItem('lf_token');
                setToken(null);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        initializeAuth();
    }, []);

    const login = (newToken: string, userData: User) => {
        localStorage.setItem('lf_token', newToken);
        setToken(newToken);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('lf_token');
        setToken(null);
        setUser(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};
