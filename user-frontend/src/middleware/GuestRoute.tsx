import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { getToken, isTokenExpired } from '../api/client';
import { postAuthDestination } from '../utils/authRedirect';

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

  // Return signed-in users to their document, including its type and draft ID.
  if ((isAuthenticated || tokenValid) && !isGuest) {
    return <Navigate to={postAuthDestination(location.state)} replace />;
  }

  return <>{children}</>;
};

export default GuestRoute;
