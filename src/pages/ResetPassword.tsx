import { FormEvent, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/auth';
import { clearAuthSession } from '../utils/authToken';
import './AuthFlow.css';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!token) {
      setError('Reset token missing. Please open the link from your email.');
      return;
    }

    if (password.trim().length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await authApi.resetPassword({ token, password, confirmPassword });
      if (response.success) {
        setStatus('Password updated successfully! Redirecting to login…');
        clearAuthSession();
        navigate('/login', { replace: true });
      } else {
        setError(response.message || 'Unable to reset password. Try requesting a new link.');
      }
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unable to reset password. Try requesting a new link.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-flow-page">
      <div className="auth-flow-card">
        <header className="auth-flow-header">
          <h1 className="auth-flow-title">Reset your password</h1>
          <p className="auth-flow-subtitle">
            {token ? 'Choose a new password to get back into Brideside CRM.' : 'Reset link is invalid or missing.'}
          </p>
        </header>

        {token ? (
          <form className="auth-flow-form" onSubmit={handleSubmit}>
            <label className="auth-flow-label">
              New password
              <input
                type="password"
                className="auth-flow-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter a secure password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>

            <label className="auth-flow-label">
              Confirm password
              <input
                type="password"
                className="auth-flow-input"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>

            {error && <div className="auth-flow-error">{error}</div>}
            {status && <div className="auth-flow-status">{status}</div>}

            <button type="submit" className="auth-flow-submit" disabled={submitting}>
              {submitting ? (
                <span className="auth-flow-submit-content">
                  <span className="auth-flow-button-spinner" />
                  Updating…
                </span>
              ) : (
                'Reset password'
              )}
            </button>
          </form>
        ) : (
          <div className="auth-flow-error">We could not validate your reset link. Request a new one below.</div>
        )}

        <div className="auth-flow-footer">
          <span>Remembered it?</span>
          <Link to="/login" className="auth-flow-link">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

