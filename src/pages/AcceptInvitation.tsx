import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { usersApi } from '../services/users';
import { clearAuthSession } from '../utils/authToken';
import type { InvitationVerification } from '../types/user';
import './AuthFlow.css';

function getInvitationSubtitle(
  verifying: boolean,
  verified: boolean,
  invitation: InvitationVerification | null,
): string {
  if (verifying) {
    return 'Verifying your invitation…';
  }

  if (!verified || !invitation) {
    return 'We could not confirm your invitation.';
  }

  const fullName = [invitation.firstName, invitation.lastName].filter(Boolean).join(' ').trim();

  if (invitation.email) {
    return fullName
      ? `Welcome, ${fullName}. Set up your account for ${invitation.email}.`
      : `Set up your account for ${invitation.email}.`;
  }

  if (fullName) {
    return `Welcome, ${fullName}. Set your password to activate your Houseofbarqat account.`;
  }

  return 'Set your password to activate your Houseofbarqat account.';
}

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams]);

  const [verifying, setVerifying] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<InvitationVerification | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const isVerified = invitation !== null;

  useEffect(() => {
    if (!token) {
      setError('Invitation token missing. Please use the link from your email.');
      setVerifying(false);
      return;
    }

    const verify = async () => {
      try {
        const response = await usersApi.verifyInvitationToken(token);
        setInvitation(response);
        setStatus('Invitation verified. Set your password to finish creating your account.');
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Invitation link is invalid or expired.';
        setError(message);
      } finally {
        setVerifying(false);
      }
    };

    void verify();
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setStatus(null);

    if (!token) {
      setError('Missing invitation token.');
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
      await usersApi.setPassword({ token, password, confirmPassword });
      setStatus('Password saved! Redirecting you to the login page…');
      clearAuthSession();
      navigate('/login', { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || 'Unable to set password. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-flow-page">
      <div className="auth-flow-card">
        <header className="auth-flow-header">
          <span className="auth-flow-badge">Welcome</span>
          <h1 className="auth-flow-title">Welcome to Houseofbarqat</h1>
          <p className="auth-flow-subtitle">
            {getInvitationSubtitle(verifying, isVerified, invitation)}
          </p>
        </header>

        {verifying ? (
          <div className="auth-flow-spinner">
            <span>One moment…</span>
          </div>
        ) : isVerified ? (
          <form className="auth-flow-form" onSubmit={handleSubmit}>
            <label className="auth-flow-label">
              New password
              <input
                type="password"
                className="auth-flow-input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Create a secure password"
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
                  Saving…
                </span>
              ) : (
                'Activate account'
              )}
            </button>
          </form>
        ) : (
          <>
            {error && <div className="auth-flow-error">{error}</div>}
            <div className="auth-flow-footer">
              <span>Need a fresh invite?</span>
              <Link to="/login" className="auth-flow-link">
                Contact your admin
              </Link>
            </div>
          </>
        )}

        {!verifying && isVerified && (
          <div className="auth-flow-footer">
            <span>Already set up?</span>
            <Link to="/login" className="auth-flow-link">
              Go to login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
