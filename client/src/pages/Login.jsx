import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export default function Login() {
  const { loginWithGoogle, error, isLoggingIn, isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  // ⚡ STICKING-BUTTON FIX: redirect the instant auth state flips to authenticated.
  // New users (no Zync profile yet) go to setup; returning users go to the inbox.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(user ? '/inbox' : '/setup-profile', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Algorithm: Handle the Auth State Machine. Loading state lives in the store
  // and is guaranteed to release via its finally block, so the spinner can't hang.
  const handleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch {
      // Errors surface via the store's `error` state; spinner already released.
    }
  };

  const isLoading = isLoggingIn;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
  };

  return (
    <div className="flex h-[100dvh] w-full">
      <div className="hidden lg:flex w-[45%] flex-col justify-center px-16 border-r border-[var(--border)]">
        <motion.div variants={containerVariants} initial="hidden" animate="visible">
          <motion.h1 variants={itemVariants} className="text-5xl font-display text-white mb-4">
            ⚡ Zync
          </motion.h1>
          <motion.p variants={itemVariants} className="text-xl text-[var(--text-secondary)] max-w-sm">
            Chat at the speed of thought.
          </motion.p>
        </motion.div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 relative">
        <div className="w-full max-w-md bg-[var(--bg-surface)] p-6 sm:p-10 rounded-2xl border border-[var(--border)]">
          <h2 className="text-xl sm:text-2xl font-display text-white mb-8 text-center">Welcome to Zync</h2>
          
          <button 
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-lg font-medium transition-all duration-200 ease-in-out active:scale-95"
            style={{ 
              backgroundColor: isLoading ? 'var(--border)' : 'var(--accent)',
              color: isLoading ? 'var(--text-secondary)' : '#fff',
              pointerEvents: isLoading ? 'none' : 'auto'
            }}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          {error && (
            <p className="mt-4 text-sm text-center text-red-400 font-medium">{error}</p>
          )}

          <div className="mt-8 pt-6 border-t border-[var(--border)] flex justify-between text-xs text-[var(--text-secondary)]">
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>
    </div>
  );
}