import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../services/auth';
import { getStoredToken, storeAuthSession } from '../utils/authToken';
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const existingToken = getStoredToken();
    if (existingToken) {
      navigate('/');
    }
  }, [navigate]);

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

      const state = location.state as LocationState | null;
      const defaultDashboard = resolveRoleDashboardRoute(data.role) ?? '/';
      const requestedPath = state?.from?.pathname;
      const redirectTo =
        requestedPath && requestedPath !== '/login' ? requestedPath : defaultDashboard;

      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unable to login. Please check your credentials.';
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
      const message = err?.response?.data?.message || err?.message || 'Unable to send reset instructions. Please try again.';
      setError(message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-overlay" />
        <div className="login-hero-content">
          <h1>Brideside CRM</h1>
          <p>Manage your leads, events, and teams with a single beautiful workspace.</p>
        </div>
      </div>

      <div className="login-card">
        <div className="login-card-header">
          <span className="login-badge">Welcome back</span>
          <h2>Sign in to continue</h2>
          <p>Use your Brideside CRM credentials to access the dashboard.</p>
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
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              className="login-input"
              autoComplete="current-password"
            />
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
  );
}


