import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { api } from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';

export default function SetupProfile() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', displayName: '' });
  const [status, setStatus] = useState({ loading: false, error: null });

  // Live Regex Validation for UI feedback
  const isValidUsername = /^[a-z0-9_]{3,30}$/i.test(formData.username);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidUsername || !formData.displayName) return;

    setStatus({ loading: true, error: null });

    try {
      // 1. Get the cryptographic token from the active Firebase session
      const token = await auth.currentUser.getIdToken();

      // 2. Fire the exact request you tested in Postman
      const response = await api.post('/users/setup', 
        {
          username: formData.username,
          displayName: formData.displayName,
          avatarUrl: auth.currentUser.photoURL || ""
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      // 3. Hydrate the global store and route to Inbox
      useAuthStore.setState({ isAuthenticated: true, user: response.data.data });
      navigate('/inbox');

    } catch (error) {
      console.error("Setup failed:", error);
      setStatus({ 
        loading: false, 
        error: error.response?.data?.error || "Failed to create profile. Try again." 
      });
    }
  };

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center p-4 sm:p-6 bg-[var(--bg-base)]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md bg-[var(--bg-surface)] p-6 sm:p-8 rounded-2xl border"
        style={{ borderColor: 'var(--border)' }}
      >
        <h2 className="text-xl sm:text-2xl font-display text-white mb-2">Claim your identity</h2>
        <p className="text-sm text-[var(--text-secondary)] mb-8">
          Your username is unique. Choose wisely.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Display Name Input */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
              Display Name
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="e.g. Aaftab"
              maxLength={50}
              className="w-full bg-[var(--bg-base)] border rounded-lg px-4 py-3 sm:py-4 text-white focus:outline-none focus:border-[var(--accent)] transition-all duration-200 ease-in-out"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>

          {/* Username Input with Live Validation */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 sm:top-4 text-[var(--text-secondary)]">@</span>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                placeholder="aaftab_dev"
                maxLength={30}
                className="w-full bg-[var(--bg-base)] border rounded-lg pl-9 pr-10 py-3 sm:py-4 text-white focus:outline-none focus:border-[var(--accent)] transition-all duration-200 ease-in-out font-mono"
                style={{ borderColor: 'var(--border)' }}
              />
              <div className="absolute right-3 sm:right-4 top-3 sm:top-4">
                {formData.username.length > 0 && (
                  isValidUsername 
                    ? <CheckCircle2 className="w-5 h-5 text-[var(--success)]" /> 
                    : <AlertCircle className="w-5 h-5 text-[var(--warning)]" />
                )}
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] h-4">
              {formData.username.length > 0 && !isValidUsername && "Only letters, numbers, and underscores (3-30 chars)."}
            </p>
          </div>

          {/* Error Banner */}
          {status.error && (
            <div className="bg-[rgba(229,72,77,0.1)] text-[var(--error)] p-3 sm:p-4 rounded-lg text-sm font-medium border border-[rgba(229,72,77,0.2)] transition-all duration-200 ease-in-out">
              {status.error}
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit"
            disabled={status.loading || !isValidUsername || !formData.displayName}
            className="w-full h-12 flex items-center justify-center rounded-lg font-medium transition-all duration-200 ease-in-out active:scale-95 disabled:opacity-50 disabled:active:scale-100"
            style={{ 
              backgroundColor: 'var(--accent)',
              color: '#fff',
            }}
          >
            {status.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save & Continue"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}