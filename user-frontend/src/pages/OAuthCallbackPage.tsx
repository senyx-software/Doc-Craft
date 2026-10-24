import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Loader2 } from 'lucide-react';

const OAuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleCallback() {
      try {
        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
        const search = window.location.search.startsWith('?') ? window.location.search.slice(1) : '';
        const params = new URLSearchParams(hash || search);
        const accessToken = params.get('accessToken') || params.get('access_token');
        const mfaToken = params.get('mfaToken') || params.get('mfa_token');

        if (accessToken) {
          useAuthStore.getState().setToken(accessToken);
          await useAuthStore.getState().checkAuth();
          navigate('/dashboard', { replace: true });
        } else if (mfaToken) {
          navigate('/login', { state: { mfaToken }, replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      }
    }

    void handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-appBg text-appTextPrimary">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-appTextSecondary">Completing sign in...</p>
      </div>
    </div>
  );
};

export default OAuthCallbackPage;
