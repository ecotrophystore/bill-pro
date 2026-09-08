import { useState } from 'react';
import { Mail, Lock, LogIn, UserPlus, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!auth) {
      setError("Firebase not initialized. Check your .env file.");
      return;
    }
    
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || "Failed to authenticate");
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
          <h2 className="text-2xl font-semibold text-primary-dark">
            {isRegister ? 'Create Account' : 'Welcome to EcoBill'}
          </h2>
          <p className="text-secondary mt-1 font-medium text-sm">
            {isRegister ? 'Sign up for access to EcoBill Pro' : 'Please sign in to continue'}
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex rounded-xl p-1 bg-surface border border-shadow-darker/15 shadow-neo-pressed">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              !isRegister ? 'bg-primary text-white shadow-xs' : 'text-secondary hover:text-primary-dark'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
              isRegister ? 'bg-primary text-white shadow-xs' : 'text-secondary hover:text-primary-dark'
            }`}
          >
            Create Account
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-600 text-sm animate-shake">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p className="font-medium text-xs leading-relaxed">{error}</p>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <label className="text-xs font-bold text-primary-dark px-1 uppercase tracking-wider">Email Address</label>
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
            <label className="text-xs font-bold text-primary-dark px-1 uppercase tracking-wider">Password</label>
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
                minLength={6}
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="neo-btn-primary w-full mt-4 py-3 text-sm font-bold flex items-center justify-center gap-2"
          >
            {loading ? "Processing..." : isRegister ? (
              <>
                <UserPlus size={18} />
                Create Account & Sign In
              </>
            ) : (
              <>
                <LogIn size={18} />
                Sign In
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs font-medium text-secondary">
          {isRegister ? 'New accounts are provisioned with secure role-based access.' : 'Authorized personnel only.'}
        </p>
      </div>
    </div>
  );
}
