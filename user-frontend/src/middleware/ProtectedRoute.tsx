import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isInitializing } = useAuthStore();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-appBg">
        <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-body-xs font-medium text-appTextSecondary">Verifying authorization...</p>
      </div>
    );
  }

  // Allow access without redirection if URL has ?new=true (e.g., /builder?new=true)
  const searchParams = new URLSearchParams(location.search);
  const isNew = searchParams.get('new') === 'true';

  if (!isAuthenticated && !isNew) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

