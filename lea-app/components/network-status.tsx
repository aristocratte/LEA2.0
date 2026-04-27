'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type BannerState = 'offline' | 'restored' | 'hidden';

function getNavigatorOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine ?? true;
}

export function NetworkStatus(): React.ReactElement | null {
  const [isOnline, setIsOnline] = useState<boolean>(() => getNavigatorOnline());
  const [banner, setBanner] = useState<BannerState>(() => (getNavigatorOnline() ? 'hidden' : 'offline'));

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      setBanner('restored');
      dismissTimer = setTimeout(() => {
        setBanner('hidden');
      }, 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (dismissTimer) {
        clearTimeout(dismissTimer);
        dismissTimer = null;
      }
      setBanner('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, []);

  const isVisible = banner === 'offline' || banner === 'restored';

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key={banner}
          initial={{ y: -40 }}
          animate={{ y: 0 }}
          exit={{ y: -40 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={[
            'fixed top-0 left-0 right-0 z-[100]',
            'py-2 px-4 flex items-center justify-center gap-2',
            'text-white text-[13px] font-medium',
            banner === 'offline' ? 'bg-zinc-900' : 'bg-emerald-600',
          ].join(' ')}
        >
          {banner === 'offline' ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>No internet connection — some features may be unavailable</span>
            </>
          ) : (
            <>
              <Wifi className="h-3.5 w-3.5" />
              <span>Connection restored</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
