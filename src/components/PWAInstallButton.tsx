import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall, useOnlineStatus } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="px-3 py-2 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-700 text-xs font-bold flex items-center gap-1.5 border border-lavender-200 transition-all whitespace-nowrap shrink-0"
        title="Install BloomCampus to your phone or laptop home screen"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Install App</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        className="px-3 py-2 rounded-xl bg-lavender-50 hover:bg-lavender-100 text-lavender-700 text-xs font-bold flex items-center gap-1.5 border border-lavender-200 transition-all whitespace-nowrap shrink-0"
        title="Add BloomCampus to your phone Home Screen"
      >
        <Smartphone className="w-3.5 h-3.5" />
        <span className="hidden md:inline">{isIOS ? 'Install on iOS' : 'Add to Phone'}</span>
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-lavender-200">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-lavender-100 text-lavender-700 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-slate-900">Install BloomCampus App</h3>
                  <p className="text-xs text-slate-500">Works offline like a native mobile app</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700 bg-cream p-4 rounded-2xl border border-slate-200/80 mb-4">
              <p className="font-bold text-slate-900">On iPhone / iPad (Safari):</p>
              <p>1. Tap the <strong>Share</strong> icon at the bottom of Safari.</p>
              <p>2. Scroll down and select <strong>Add to Home Screen</strong>.</p>
              <hr className="border-slate-200 my-2" />
              <p className="font-bold text-slate-900">On Android / Chrome:</p>
              <p>1. Tap the browser menu (three dots <strong>⋮</strong>).</p>
              <p>2. Tap <strong>Install App</strong> or <strong>Add to Home screen</strong>.</p>
            </div>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="w-full rounded-xl bg-lavender-700 hover:bg-lavender-900 py-2.5 text-xs font-bold text-white transition-all"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg">
      <WifiOff className="w-4 h-4" />
      <span>Offline Mode — Your cycle data is saved privately on this device.</span>
    </div>
  );
};
