import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  Mail,
  Phone,
  RotateCw,
  ShieldCheck,
  Smartphone,
  UserPlus,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

type ViewMode = 'login' | 'register' | 'forgot_password' | 'phone_otp';

function GoogleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Primary view mode
  const [view, setView] = useState<ViewMode>('login');

  // Email / Password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone OTP state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Forgot password state
  const [resetEmailSent, setResetEmailSent] = useState(false);

  // Common status
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Timer countdown for OTP resend
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Clean up reCAPTCHA verifier on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  const getOrCreateRecaptcha = (): RecaptchaVerifier => {
    if (!auth) throw new Error('Firebase Auth is not initialized');
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current;
    }
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved
      },
      'expired-callback': () => {
        setError('Verification expired. Please try requesting the OTP again.');
      },
    });
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  // ─── Google Sign In ────────────────────────────────────────────────────────
  const handleGoogleSignIn = async () => {
    if (!auth) {
      setError('Firebase not initialized. Check your configuration.');
      return;
    }

    setError('');
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      toast.success('Signed in with Google successfully!');
      navigate('/');
    } catch (err: any) {
      console.error('Google Sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed the popup, do nothing
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignored
      } else if (err.code === 'auth/popup-blocked') {
        setError('Google sign-in popup was blocked by your browser. Please allow popups.');
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError('An account already exists with this email using a different sign-in method.');
      } else {
        setError(err.message || 'Failed to sign in with Google.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // ─── Email / Password Submit ───────────────────────────────────────────────
  const handleEmailSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth) {
      setError('Firebase not initialized. Check your configuration.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      if (view === 'register') {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
        toast.success('Account created successfully! Welcome to EcoBill.');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success('Signed in successfully!');
      }
      navigate('/');
    } catch (err: any) {
      console.error('Auth error:', err);
      if (
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
      ) {
        setError('Invalid email or password. Please verify and try again.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Try signing in.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Password Reset ────────────────────────────────────────────────────────
  const handleForgotPassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth) {
      setError('Firebase not initialized. Check your configuration.');
      return;
    }

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address to receive password reset instructions.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setResetEmailSent(true);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      console.error('Password reset error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError(err.message || 'Failed to send password reset email. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Format Phone Input (+91 default) ──────────────────────────────────────
  const formatE164Phone = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('+')) {
      return '+' + trimmed.slice(1).replace(/\D/g, '');
    }
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    return `+${digits}`;
  };

  // ─── Phone OTP: Send Code ──────────────────────────────────────────────────
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth) {
      setError('Firebase not initialized. Check your configuration.');
      return;
    }

    const formattedPhone = formatE164Phone(phoneNumber);
    if (!formattedPhone || formattedPhone.length < 11) {
      setError('Please enter a valid mobile number (e.g. 9876543210 or +91 9876543210).');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const verifier = getOrCreateRecaptcha();
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(confirmation);
      setOtpSent(true);
      setOtpTimer(60);
      toast.success(`6-digit OTP sent via SMS to ${formattedPhone}!`);
    } catch (err: any) {
      console.error('Phone OTP error:', err);
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch { }
        recaptchaVerifierRef.current = null;
      }
      if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format. Include country code like +91 9876543210.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many OTP attempts from this device. Please wait a few minutes or use Email Sign-In.');
      } else if (err.code === 'auth/quota-exceeded') {
        setError('SMS quota exceeded on Firebase. Please sign in using your Email & Password.');
      } else {
        setError(err.message || 'Failed to send SMS OTP. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Phone OTP: Verify Code ────────────────────────────────────────────────
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!confirmationResult) {
      setError('No OTP request found. Please request a new OTP code.');
      return;
    }

    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await confirmationResult.confirm(cleanCode);
      toast.success('Phone verified successfully! Welcome to EcoBill.');
      navigate('/');
    } catch (err: any) {
      console.error('OTP Verification error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Incorrect verification code. Please check your SMS and try again.');
      } else if (err.code === 'auth/code-expired') {
        setError('Verification code has expired. Please request a new OTP.');
      } else {
        setError(err.message || 'Failed to verify OTP code.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-between relative overflow-hidden select-none">
      {/* Invisible reCAPTCHA container for Phone Auth */}
      <div id="recaptcha-container"></div>

      {/* Decorative Brand Accent (Diagonal stripes in top-right matching reference design) */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 w-96 h-96 opacity-25"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #006766 0, #006766 2px, transparent 0, transparent 14px)',
          maskImage: 'radial-gradient(circle at top right, black, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(circle at top right, black, transparent 70%)',
        }}
      />

      {/* Top Header with App Brand (SEMRUSH style top-left) */}
      <header className="w-full px-6 py-5 sm:px-10 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-surface font-extrabold shadow-neo-surface">
            EB
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-xl tracking-tight text-primary-dark">
              EcoBill
            </span>
            <span className="text-[10px] font-semibold text-secondary tracking-wider uppercase">
              An Ecotrophy Company
            </span>
          </div>
        </div>

        {/* Quick alternative button */}
        {view === 'phone_otp' ? (
          <button
            type="button"
            onClick={() => {
              setView('login');
              setError('');
            }}
            className="text-xs font-bold text-primary hover:text-primary-dark transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowLeft size={14} /> Back to Log in
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setView('phone_otp');
              setError('');
            }}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-secondary hover:text-primary-dark transition-colors px-3 py-1.5 rounded-lg border border-shadow-dark/40 shadow-neo-surface"
          >
            <Smartphone size={13} />
            Sign in with Phone
          </button>
        )}
      </header>

      {/* Main Centered Authentication Form */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 z-10">
        <div className="w-full max-w-[420px] neo-card shadow-neo-raised rounded-2xl p-7 sm:p-9 flex flex-col animate-fade-in transition-all">

          {/* Header Title */}
          <div className="mb-6 text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-dark tracking-tight">
              {view === 'login' && 'Log in'}
              {view === 'register' && 'Create your account'}
              {view === 'forgot_password' && 'Forgot password'}
              {view === 'phone_otp' && (otpSent ? 'Verify OTP' : 'Phone Sign In')}
            </h1>
            <p className="text-xs text-secondary mt-1 font-medium">
              {view === 'login' && 'Sign in to access your EcoBill workspace'}
              {view === 'register' && 'Get started with EcoBill CRM & Billing'}
              {view === 'forgot_password' &&
                'Enter your registered email to receive a password reset link'}
              {view === 'phone_otp' &&
                (otpSent
                  ? `Enter the 6-digit SMS code sent to ${phoneNumber}`
                  : 'Enter your phone number to receive an instant verification code')}
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-red-600 text-xs animate-shake">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <p className="font-semibold leading-relaxed">{error}</p>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              MODE: LOGIN & REGISTER (With Google, Email, Password, Forgot PW)
             ════════════════════════════════════════════════════════════════════ */}
          {(view === 'login' || view === 'register') && (
            <div className="flex flex-col gap-4">
              {/* Continue with Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || loading}
                className="w-full py-2.5 px-4 bg-surface rounded-xl border border-shadow-dark/40 shadow-neo-raised hover:shadow-neo-hover active:shadow-neo-pressed font-bold text-xs sm:text-sm text-primary-dark flex items-center justify-center gap-3 transition-all duration-200 disabled:opacity-60"
              >
                {googleLoading ? (
                  <div className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                ) : (
                  <GoogleIcon className="w-5 h-5 shrink-0" />
                )}
                <span>
                  {googleLoading
                    ? 'Connecting to Google...'
                    : view === 'register'
                      ? 'Sign up with Google'
                      : 'Continue with Google'}
                </span>
              </button>

              {/* Divider: "or" */}
              <div className="relative flex items-center justify-center my-1">
                <div className="w-full border-t border-shadow-dark/40"></div>
                <span className="absolute bg-surface px-3 text-xs text-secondary/70 font-semibold uppercase tracking-wider">
                  or
                </span>
              </div>

              {/* Email & Password Form */}
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                {/* Email Field */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-primary-dark px-0.5 flex items-center justify-between">
                    <span>Email</span>
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@ecotrophy.in"
                      className="neo-input w-full px-3.5 py-2.5 text-sm font-semibold tracking-wide placeholder:font-normal placeholder:text-secondary/50"
                      required
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-primary-dark px-0.5 flex items-center justify-between">
                    <span>Password</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="neo-input w-full pl-3.5 pr-11 py-2.5 text-sm font-semibold tracking-wide placeholder:font-normal placeholder:text-secondary/50"
                      required
                      minLength={6}
                      autoComplete={view === 'register' ? 'new-password' : 'current-password'}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-secondary/70 hover:text-primary transition-colors focus:outline-none"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {/* Forgot Password Link (Below Password) */}
                  {view === 'login' && (
                    <div className="pt-1 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setView('forgot_password');
                          setError('');
                          setResetEmailSent(false);
                        }}
                        className="text-xs font-semibold text-primary hover:text-primary-dark hover:underline transition-colors"
                      >
                        Forgot your password?
                      </button>
                    </div>
                  )}
                </div>

                {/* Primary Submit Button */}
                <button
                  type="submit"
                  disabled={loading || googleLoading || !email.trim() || !password}
                  className="w-full py-3 px-4 bg-primary hover:bg-primary-dark active:shadow-neo-pressed text-surface font-extrabold text-sm rounded-xl shadow-neo-raised transition-all duration-200 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                >
                  {loading ? (
                    'Processing...'
                  ) : view === 'register' ? (
                    <>
                      <UserPlus size={18} />
                      Sign up
                    </>
                  ) : (
                    <>
                      <LogIn size={18} />
                      Log in
                    </>
                  )}
                </button>
              </form>

              {/* Bottom Switcher: Don't have an account? Sign up */}
              <div className="pt-3 text-center text-xs text-secondary font-medium">
                {view === 'login' ? (
                  <>
                    Don&apos;t have an EcoBill account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setView('register');
                        setError('');
                      }}
                      className="font-bold text-primary hover:underline hover:text-primary-dark transition-colors ml-0.5"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setError('');
                      }}
                      className="font-bold text-primary hover:underline hover:text-primary-dark transition-colors ml-0.5"
                    >
                      Log in
                    </button>
                  </>
                )}
              </div>

              {/* Bottom alternative: Log in with Phone OTP (like "Log in with SAML" in reference) */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setView('phone_otp');
                    setError('');
                  }}
                  className="text-xs font-bold text-secondary hover:text-primary-dark transition-colors underline underline-offset-4 decoration-secondary/40"
                >
                  Log in with Phone OTP
                </button>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              MODE: FORGOT PASSWORD
             ════════════════════════════════════════════════════════════════════ */}
          {view === 'forgot_password' && (
            <div className="space-y-4">
              {resetEmailSent ? (
                <div className="space-y-4 text-center py-2 animate-fade-in">
                  <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-700 shadow-neo-surface">
                    <CheckCircle2 size={30} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-primary-dark">Reset Link Sent</h3>
                    <p className="text-xs text-secondary mt-1 font-medium leading-relaxed">
                      We have sent password reset instructions to{' '}
                      <strong className="text-primary-dark">{email}</strong>. Please check your inbox and spam folder.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setError('');
                      }}
                      className="w-full py-2.5 px-4 bg-primary hover:bg-primary-dark text-surface font-extrabold text-xs sm:text-sm rounded-xl shadow-neo-raised transition-all"
                    >
                      Return to Log in
                    </button>
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading}
                      className="text-xs font-bold text-secondary hover:text-primary transition-colors py-1 inline-flex items-center justify-center gap-1.5"
                    >
                      <RotateCw size={13} /> Resend reset email
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-primary-dark px-0.5">
                      Account Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@ecotrophy.in"
                      className="neo-input w-full px-3.5 py-2.5 text-sm font-semibold tracking-wide"
                      required
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-surface font-extrabold text-sm rounded-xl shadow-neo-raised active:shadow-neo-pressed transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      'Sending reset link...'
                    ) : (
                      <>
                        <Mail size={18} />
                        Send Reset Instructions
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setView('login');
                        setError('');
                      }}
                      className="text-xs font-bold text-secondary hover:text-primary-dark inline-flex items-center gap-1.5 transition-colors"
                    >
                      <ArrowLeft size={13} /> Back to Log in
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════════════════════
              MODE: PHONE OTP
             ════════════════════════════════════════════════════════════════════ */}
          {view === 'phone_otp' && (
            <div className="space-y-4">
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-primary-dark px-0.5 flex items-center justify-between">
                      <span>Mobile Number</span>
                      <span className="text-[10px] text-secondary font-normal lowercase">India (+91 default)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                        <Phone size={17} />
                      </div>
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="neo-input w-full pl-10 pr-3.5 py-2.5 text-sm font-semibold tracking-wide"
                        placeholder="9876543210 or +91 9876543210"
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !phoneNumber.trim()}
                    className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-surface font-extrabold text-sm rounded-xl shadow-neo-raised active:shadow-neo-pressed transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      'Sending OTP...'
                    ) : (
                      <>
                        <KeyRound size={17} />
                        Send Verification Code (SMS)
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-0.5">
                      <label className="text-xs font-bold text-primary-dark uppercase tracking-wider">
                        6-Digit SMS Code
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpSent(false);
                          setOtpCode('');
                          setError('');
                        }}
                        className="text-[11px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <ArrowLeft size={11} /> Change number
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                        <ShieldCheck size={18} />
                      </div>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                        className="neo-input w-full pl-10 text-center text-lg font-black tracking-[0.4em]"
                        placeholder="••••••"
                        autoFocus
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otpCode.length < 6}
                    className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-surface font-extrabold text-sm rounded-xl shadow-neo-raised active:shadow-neo-pressed transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {loading ? (
                      'Verifying...'
                    ) : (
                      <>
                        <CheckCircle2 size={17} />
                        Verify OTP &amp; Sign In
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    {otpTimer > 0 ? (
                      <span className="text-xs text-secondary font-medium">
                        Resend code in <strong className="text-primary-dark">{otpTimer}s</strong>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => handleSendOtp()}
                        className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1"
                      >
                        <RotateCw size={12} /> Resend OTP Code
                      </button>
                    )}
                  </div>
                </form>
              )}

              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setView('login');
                    setError('');
                  }}
                  className="text-xs font-bold text-secondary hover:text-primary-dark inline-flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft size={13} /> Back to Email &amp; Google login
                </button>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-4 px-6 text-center text-[11px] text-secondary/70 font-medium z-10">
        EcoBill Pro &bull; Secure Enterprise Authentication &bull; Authorized Personnel Only
      </footer>
    </div>
  );
}
