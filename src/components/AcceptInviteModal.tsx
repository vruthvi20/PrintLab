import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { getInvitationByToken, acceptAdminInvitation } from '../services/firebaseService';
import { AdminInvitation } from '../types';

interface AcceptInviteModalProps {
  inviteToken: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export const AcceptInviteModal: React.FC<AcceptInviteModalProps> = ({
  inviteToken,
  onSuccess,
  onClose,
}) => {
  const [invitation, setInvitation] = useState<AdminInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!inviteToken) {
      setLoading(false);
      return;
    }

    const verify = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const inv = await getInvitationByToken(inviteToken);
        if (!inv) {
          setErrorMsg('This invitation link is invalid or has already been used.');
        } else if (new Date(inv.expiresAt) < new Date()) {
          setErrorMsg('This invitation link has expired. Please request a new invite from the lab manager.');
        } else {
          setInvitation(inv);
        }
      } catch (err: any) {
        setErrorMsg('Error verifying invitation token: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    verify();
  }, [inviteToken]);

  if (!inviteToken) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await acceptAdminInvitation(inviteToken, password);
      alert('Welcome to the STEAM Lab administration team! You are now signed in.');
      onSuccess();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to activate administrator account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200">
        
        <div className="text-center space-y-2 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center mx-auto shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900">
            Accept Admin Invitation
          </h2>
          <p className="text-xs text-slate-500">
            You have been invited to manage the STEAM Lab Bambu A1 mini printer.
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-teal-700 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Verifying invitation token...</span>
          </div>
        ) : errorMsg ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : invitation ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-400 block">Invited Email:</span>
              <span className="font-bold text-slate-800 text-sm font-mono">{invitation.email}</span>
              <span className="text-slate-400 block mt-1">Invited By: {invitation.invitedBy}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Set Administrator Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>{isSubmitting ? 'Activating Account...' : 'Set Password & Access Admin'}</span>
            </button>
          </form>
        ) : null}

      </div>
    </div>
  );
};
