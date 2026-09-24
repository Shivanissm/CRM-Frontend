import { FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../services/auth';
import { storeAuthSession, getStoredToken } from '../utils/authToken';
import type { LoginResponse } from '../types/auth';
import './Login.css';
import { resolveRoleDashboardRoute } from '../utils/roleRoutes';

type LocationState = {
  from?: {
    pathname: string;
  };
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await authApi.login({ email: email.trim(), password });
      if (!response.success || !response.data) {
        setError(response.message || 'Login failed. Please try again.');
        return;
      }

      const data: LoginResponse = response.data;

      storeAuthSession(data.token, {
        remember,
        user: {
          userId: data.userId,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          tokenType: data.type,
        },
      });

      const storedToken = getStoredToken();
      if (!storedToken) {
        setError('Failed to store authentication token. Please try again.');
        return;
      }

      const state = location.state as LocationState | null;
      const defaultDashboard = resolveRoleDashboardRoute(data.role) ?? '/';
      const requestedPath = state?.from?.pathname;
      const redirectTo =
        requestedPath && requestedPath !== '/login' ? requestedPath : defaultDashboard;

      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to login. Please check your credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setStatus(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Enter your email address to receive a reset link.');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await authApi.forgotPassword(trimmedEmail);
      if (response.success) {
        setStatus(response.message || 'Password reset email sent. Please check your inbox.');
      } else {
        setError(response.message || 'Unable to send reset instructions. Please try again.');
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Unable to send reset instructions. Please try again.';
      setError(message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background" aria-hidden="true">
        <div className="login-glow login-glow-primary" />
        <div className="login-glow login-glow-secondary" />
        <div className="login-glow login-glow-accent" />

        <svg className="login-waves" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
          <path
            className="login-wave login-wave-1"
            d="M-40,420 C180,360 320,480 520,420 C720,360 880,500 1080,440 C1280,380 1400,460 1500,400 L1500,900 L-40,900 Z"
          />
          <path
            className="login-wave login-wave-2"
            d="M-40,520 C200,460 360,580 560,520 C760,460 920,600 1120,540 C1320,480 1380,560 1500,500 L1500,900 L-40,900 Z"
          />
          <path
            className="login-wave login-wave-3"
            d="M-40,620 C160,560 300,680 500,620 C700,560 860,700 1060,640 C1260,580 1360,660 1500,600 L1500,900 L-40,900 Z"
          />
          <path
            className="login-wave-line login-wave-line-1"
            d="M0,280 C240,220 480,340 720,280 C960,220 1200,340 1440,280"
          />
          <path
            className="login-wave-line login-wave-line-2"
            d="M0,340 C280,280 520,400 760,340 C1000,280 1240,400 1440,340"
          />
          <path
            className="login-wave-line login-wave-line-3"
            d="M0,400 C200,340 440,460 680,400 C920,340 1160,460 1440,400"
          />
        </svg>
      </div>

      <div className="login-content">
        <div className="login-card">
          <div className="login-card-header">
            <span className="login-badge">Welcome back</span>
            <h1>Sign in to continue</h1>
          </div>

          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-label" htmlFor="email">
              Email address
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="login-input"
                autoComplete="email"
              />
            </label>

            <label className="login-label" htmlFor="password">
              Password
              <div className="login-password-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  className="login-input"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            <div className="login-options">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                Remember me
              </label>
              <button
                type="button"
                className="forgot-password"
                onClick={handleForgotPassword}
                disabled={forgotLoading}
              >
                {forgotLoading ? 'Sending…' : 'Forgot password?'}
              </button>
            </div>

            {error && <div className="login-error">{error}</div>}
            {status && <div className="login-status">{status}</div>}

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
