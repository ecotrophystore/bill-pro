
import { useState } from 'react';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth) {
      setError("Firebase not initialized. Check your .env file.");
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError('');
    // For local testing/hardening, we allow a bypass if the specific credentials fail
    // but typically we attempt real auth first.
    try {
      await signInWithEmailAndPassword(auth!, 'manager@ecotrophy.com', 'password123');
      navigate('/');
    } catch (err: any) {
      console.warn("Demo login failed, using safety bypass:", err.message);
      // Safety bypass for local development/testing
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface w-full p-4">
      <div className="w-full max-w-md neo-card animate-fade-in flex flex-col gap-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-primary rounded-full shadow-neo-raised flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-white">EB</span>
          </div>
          <h2 className="text-2xl font-semibold text-primary-dark">Welcome to EcoBill</h2>
          <p className="text-secondary mt-2 font-medium">Please sign in to continue</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-600 text-sm animate-shake">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-primary-dark px-1">Email Address</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                <Mail size={18} />
              </div>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="neo-input w-full pl-10" 
                placeholder="admin@ecotrophy.in"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-primary-dark px-1">Password</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-secondary">
                <Lock size={18} />
              </div>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="neo-input w-full pl-10" 
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="neo-btn-primary w-full mt-6 py-3 text-lg flex items-center justify-center gap-2"
          >
            {loading ? "Signing in..." : (
              <>
                <LogIn size={20} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div className="relative mt-2">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-secondary/20"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-surface px-2 text-secondary font-medium">OR</span></div>
        </div>

        <button 
          onClick={handleDemoLogin}
          className="w-full py-2 px-4 rounded-xl border-2 border-primary/20 text-primary font-bold hover:bg-primary/5 transition-colors duration-200"
        >
          Master Admin Bypass
        </button>

        <p className="text-center text-sm font-medium text-secondary mt-2">
          Authorized personnel only.
        </p>
      </div>
    </div>
  );
}
