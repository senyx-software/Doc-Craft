import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getToken, isTokenExpired } from '../api/client';

interface GuestRouteProps {
  children: React.ReactNode;
}

const GuestRoute: React.FC<GuestRouteProps> = ({ children }) => {
  const { isAuthenticated, isInitializing, isGuest } = useAuthStore();
  const location = useLocation();

  if (isInitializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-appBg">
        <div className="w-10 h-10 border-3 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-body-xs font-medium text-appTextSecondary">Checking session...</p>
      </div>
    );
  }

  const token = getToken();
  const tokenValid = Boolean(token && !isTokenExpired(token));

  // If user is logged in with a valid token, prevent access to login/register and force redirect to /dashboard
  if ((isAuthenticated || tokenValid) && !isGuest) {
    const from = (location.state as { from?: { pathname: string; search?: string } } | null)?.from;
    const target = from ? `${from.pathname}${from.search || ''}` : '/builder';
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
};

export default GuestRoute;
