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
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

type AuthMethod = 'phone_otp' | 'email_password';

export default function Login() {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('phone_otp');
  const [isRegister, setIsRegister] = useState(false);

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

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

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

  // ─── Format Phone Input to Standard E.164 (+91...) ─────────────────────────
  const formatE164Phone = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('+')) {
      return '+' + trimmed.slice(1).replace(/\D/g, '');
    }
    const digits = trimmed.replace(/\D/g, '');
    // Default to India (+91) if 10-digit mobile entered
    if (digits.length === 10) {
      return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
      return `+${digits}`;
    }
    return `+${digits}`;
  };

  // ─── Send Phone OTP ────────────────────────────────────────────────────────
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
      // Reset reCAPTCHA on failure so subsequent attempts succeed
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
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

  // ─── Verify Phone OTP ──────────────────────────────────────────────────────
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
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success('Account created successfully!');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Signed in successfully!');
      }
      navigate('/');
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please verify and try again.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Click Sign In above.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters.');
      } else {
        setError(err.message || 'Failed to authenticate.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent w-full p-4">
      {/* Invisible reCAPTCHA container for Phone Auth */}
      <div id="recaptcha-container"></div>

      <div className="w-full max-w-md neo-card animate-fade-in flex flex-col gap-5">
        {/* Header */}
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-primary rounded-full shadow-neo-raised flex items-center justify-center mb-3">
            <span className="text-2xl font-bold text-white">EB</span>
          </div>
          <h2 className="text-2xl font-extrabold text-primary-dark">
            {authMethod === 'phone_otp'
              ? otpSent
                ? 'Verify Mobile OTP'
                : 'Mobile OTP Sign In'
              : isRegister
                ? 'Create Account'
                : 'Welcome to EcoBill'}
          </h2>
          <p className="text-secondary mt-1 font-medium text-xs sm:text-sm">
            {authMethod === 'phone_otp'
              ? otpSent
                ? `Enter the 6-digit code sent to ${phoneNumber}`
                : 'Enter your phone number to receive an instant verification code'
              : isRegister
                ? 'Sign up for access to EcoBill Pro'
                : 'Sign in with your email & password'}
          </p>
        </div>

        {/* Method Switch: Mobile OTP vs Email/Password */}
        <div className="grid grid-cols-2 rounded-xl p-1 bg-shadow-darker/10 border border-shadow-darker/15 shadow-neo-pressed gap-1">
          <button
            type="button"
            onClick={() => {
              setAuthMethod('phone_otp');
              setError('');
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMethod === 'phone_otp'
                ? 'bg-primary text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <Smartphone size={14} />
            Mobile OTP
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMethod('email_password');
              setError('');
            }}
            className={`py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMethod === 'email_password'
                ? 'bg-primary text-white shadow-xs'
                : 'text-secondary hover:text-primary-dark'
            }`}
          >
            <Mail size={14} />
            Email &amp; Password
          </button>
        </div>

        {/* Error notification */}
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-600 text-sm animate-shake">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p className="font-medium text-xs leading-relaxed">{error}</p>
          </div>
        )}

        {/* ─── METHOD 1: PHONE OTP FORM ────────────────────────────────────── */}
        {authMethod === 'phone_otp' && (
          <div className="space-y-4">
            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-primary-dark px-1 uppercase tracking-wider flex items-center justify-between">
                    <span>Mobile Number</span>
                    <span className="text-[10px] text-secondary font-normal lowercase">India (+91 default)</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                      <Phone size={18} />
                    </div>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="neo-input w-full pl-10 text-sm font-semibold tracking-wide"
                      placeholder="9876543210 or +91 9876543210"
                      autoFocus
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !phoneNumber.trim()}
                  className="neo-btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
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
                  <div className="flex items-center justify-between px-1">
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
                  className="neo-btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
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
          </div>
        )}

        {/* ─── METHOD 2: EMAIL & PASSWORD FORM ─────────────────────────────── */}
        {authMethod === 'email_password' && (
          <div className="space-y-4">
            {/* Sub-tab: Sign In vs Create Account */}
            <div className="flex rounded-lg p-0.5 bg-shadow-darker/5 border border-shadow-darker/10">
              <button
                type="button"
                onClick={() => {
                  setIsRegister(false);
                  setError('');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  !isRegister ? 'bg-surface shadow-xs text-primary-dark' : 'text-secondary'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRegister(true);
                  setError('');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                  isRegister ? 'bg-surface shadow-xs text-primary-dark' : 'text-secondary'
                }`}
              >
                Create Account
              </button>
            </div>

            <form className="space-y-3.5" onSubmit={handleEmailSubmit}>
              <div className="space-y-1">
                <label className="text-xs font-bold text-primary-dark px-1 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="neo-input w-full pl-10"
                    placeholder="user@ecotrophy.in"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-primary-dark px-1 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="neo-input w-full pl-10 pr-10"
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-secondary hover:text-primary transition-colors focus:outline-none"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="neo-btn-primary w-full mt-2 py-3 text-sm font-bold flex items-center justify-center gap-2"
              >
                {loading ? (
                  'Processing...'
                ) : isRegister ? (
                  <>
                    <UserPlus size={18} />
                    Create Account &amp; Sign In
                  </>
                ) : (
                  <>
                    <LogIn size={18} />
                    Sign In
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-xs font-medium text-secondary">
          {authMethod === 'phone_otp'
            ? 'Instant 6-digit SMS verification. Standard SMS rates may apply.'
            : isRegister
              ? 'New accounts are provisioned with secure role-based access.'
              : 'Authorized personnel only.'}
        </p>
      </div>
    </div>
  );
}
