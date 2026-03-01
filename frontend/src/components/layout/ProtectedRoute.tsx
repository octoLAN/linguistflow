import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { token, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[--ds-color-bg-main] flex flex-col items-center justify-center p-4">
                <Loader2 className="w-10 h-10 text-[--ds-color-primary] animate-spin mb-4" />
                <p className="text-[--ds-color-text-muted] text-[--ds-text-body] animate-pulse">
                    Authentifizierung wird geprüft...
                </p>
            </div>
        );
    }

    if (!token) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to when they were redirected. This allows us to send them
        // along to that page after they login, which is a nicer user experience
        // than dropping them off on the home page.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
};
