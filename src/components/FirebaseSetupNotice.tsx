import React from 'react';
import { Database, AlertTriangle, Key, ExternalLink } from 'lucide-react';

export const FirebaseSetupNotice: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-xl w-full p-8 rounded-3xl border border-slate-200 shadow-xl space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Database className="w-7 h-7" />
        </div>

        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            PrintLab Backend Configuration Required
          </h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            PrintLab connects to Cloud Firestore, Firebase Authentication, and Firebase Storage for real-time 3D printer queue synchronization and file storage.
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
          <p className="font-bold text-slate-800">Quick Configuration Steps:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-600">
            <li>Open <code className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-teal-700">src/firebaseConfig.ts</code>.</li>
            <li>Fill in your Firebase project parameters (API Key, Project ID, Auth Domain, Storage Bucket).</li>
            <li>Enable Email/Password sign-in under Firebase Authentication console.</li>
            <li>Deploy the included <code className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-teal-700">firestore.rules</code> and <code className="px-1.5 py-0.5 bg-white rounded border border-slate-200 font-mono text-teal-700">storage.rules</code>.</li>
          </ol>
        </div>

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
        >
          Reload Application
        </button>
      </div>
    </div>
  );
};
