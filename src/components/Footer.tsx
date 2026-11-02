import React from 'react';
import { Printer, ShieldCheck, Heart, Sparkles } from 'lucide-react';

interface FooterProps {
  onOpenAdminLogin: () => void;
  isAdmin: boolean;
  onOpenAdminDashboard: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onOpenAdminLogin,
  isAdmin,
  onOpenAdminDashboard,
}) => {
  return (
    <footer className="mt-16 bg-white border-t border-slate-200 py-10 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
        
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white">
            <Printer className="w-4 h-4" />
          </div>
          <div>
            <p className="font-extrabold text-slate-900 text-sm">
              Print<span className="text-teal-600">Lab</span> STEAM Platform
            </p>
            <p className="text-slate-400">
              Powered by Bambu Lab A1 mini • 180 × 180 × 180 mm build volume
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6 text-slate-600 font-medium">
          <span>STEAM Lab Room 204</span>
          <span>•</span>
          <span>Hours: Mon–Fri 08:30 – 16:30</span>
          <span>•</span>
          <span>Materials: PLA, PETG, TPU</span>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin ? (
            <button
              type="button"
              onClick={onOpenAdminDashboard}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-800 border border-teal-200 rounded-lg text-xs font-bold hover:bg-teal-100 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Management</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin Login</span>
            </button>
          )}
        </div>

      </div>
    </footer>
  );
};
