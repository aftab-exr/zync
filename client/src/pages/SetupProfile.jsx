import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { api } from '../lib/axios';
import { useAuthStore } from '../store/useAuthStore';

import { generateAndRegisterKeyBundle } from '../services/keys';

export default function SetupProfile() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', displayName: '' });
  const [status, setStatus] = useState({ loading: false, error: null });

  // Live regex validation for UI feedback
  const isValidUsername = /^[a-z0-9_]{3,30}$/i.test(formData.username);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValidUsername || !formData.displayName) return;

    setStatus({ loading: true, error: null });

    try {
      // Retrieve cryptographic token from active Firebase session
      const token = await auth.currentUser.getIdToken();

      // Submit user profile to backend
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

      // Register Signal Protocol public key bundle
      try {
        await generateAndRegisterKeyBundle();
      } catch (_err) {
        // Non-blocking key registration fallback
      }

      // Update global store and redirect to inbox
      useAuthStore.setState({ isAuthenticated: true, user: response.data.data });
      await useAuthStore.getState().initializeE2E(token);
      navigate('/inbox');

    } catch (error) {
      setStatus({ 
        loading: false, 
        error: error.response?.data?.error || "Failed to create profile. Try again." 
      });
    }
  };

  return (
    <div className="flex h-[100dvh] w-full items-center justify-center p-4 sm:p-6 bg-base">
      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="w-full max-w-md bg-surface p-6 sm:p-8 rounded-lg border-3 border-border shadow-brutal"
      >
        <h2 className="text-xl sm:text-2xl font-display text-tx-primary font-bold mb-2">Claim your identity</h2>
        <p className="text-sm text-tx-secondary mb-8">
          Your username is unique. Choose wisely.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Display Name Input */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-tx-secondary font-semibold">
              Display Name
            </label>
            <input
              type="text"
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="e.g. Aaftab"
              maxLength={50}
              className="w-full bg-base border-3 border-border rounded-sm px-4 py-3 sm:py-4 text-tx-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Username Input with Live Validation */}
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-tx-secondary font-semibold">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-3 sm:top-4 text-tx-secondary">@</span>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                placeholder="aaftab_dev"
                maxLength={30}
                className="w-full bg-base border-3 border-border rounded-sm pl-9 pr-10 py-3 sm:py-4 text-tx-primary focus:outline-none focus:border-accent transition-colors font-mono"
              />
              <div className="absolute right-3 sm:right-4 top-3 sm:top-4">
                {formData.username.length > 0 && (
                  isValidUsername 
                    ? <CheckCircle2 className="w-5 h-5 text-success" /> 
                    : <AlertCircle className="w-5 h-5 text-warning" />
                )}
              </div>
            </div>
            <p className="text-xs text-tx-secondary h-4">
              {formData.username.length > 0 && !isValidUsername && "Only letters, numbers, and underscores (3-30 chars)."}
            </p>
          </div>

          {/* Error Banner */}
          {status.error && (
            <div className="bg-red-50 text-error p-3 sm:p-4 rounded-sm text-sm font-bold border-3 border-error transition-colors">
              {status.error}
            </div>
          )}

          {/* Submit Button */}
          <button 
            type="submit"
            disabled={status.loading || !isValidUsername || !formData.displayName}
            className="w-full h-12 flex items-center justify-center rounded-lg border-3 border-border bg-primary text-tx-primary font-bold shadow-brutal transition-all active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50 disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-brutal hover:bg-primary-hover"
          >
            {status.loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Save & Continue"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}