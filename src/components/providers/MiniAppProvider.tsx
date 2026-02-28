'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import sdk from '@farcaster/miniapp-sdk';
import type { Context, MiniAppNotificationDetails } from '@farcaster/miniapp-core';

type MiniAppContextValue = {
  context: Context.MiniAppContext | null;
  actions: typeof sdk.actions;
  haptics: typeof sdk.haptics;
  added: boolean;
  notificationDetails: MiniAppNotificationDetails | null;
};

const MiniAppContext = createContext<MiniAppContextValue>({
  context: null,
  actions: sdk.actions,
  haptics: sdk.haptics,
  added: false,
  notificationDetails: null,
});

export function MiniAppProvider({
  children,
  analyticsEnabled,
  backButtonEnabled,
  returnUrl,
}: {
  children: React.ReactNode;
  analyticsEnabled?: boolean;
  backButtonEnabled?: boolean;
  returnUrl?: string;
}) {
  const [context, setContext] = useState<Context.MiniAppContext | null>(null);
  const [added, setAdded] = useState(false);
  const [notificationDetails, setNotificationDetails] =
    useState<MiniAppNotificationDetails | null>(null);

  useEffect(() => {
    let mounted = true;

    sdk.context
      .then((ctx) => {
        if (!mounted) {
          return;
        }
        setContext(ctx);
      })
      .catch(() => {
        // Outside mini app host.
      });

    sdk.actions
      .ready({ disableNativeGestures: !backButtonEnabled })
      .catch(() => {
        // Outside mini app host.
      });

    const onMiniAppAdded = (payload?: { notificationDetails?: MiniAppNotificationDetails }) => {
      setAdded(true);
      if (payload?.notificationDetails) {
        setNotificationDetails(payload.notificationDetails);
      }
    };

    const onMiniAppRemoved = () => {
      setAdded(false);
      setNotificationDetails(null);
    };

    const onNotificationsEnabled = (payload: { notificationDetails: MiniAppNotificationDetails }) => {
      setNotificationDetails(payload.notificationDetails);
    };

    const onNotificationsDisabled = () => {
      setNotificationDetails(null);
    };

    sdk.on('miniAppAdded', onMiniAppAdded);
    sdk.on('miniAppRemoved', onMiniAppRemoved);
    sdk.on('notificationsEnabled', onNotificationsEnabled);
    sdk.on('notificationsDisabled', onNotificationsDisabled);

    return () => {
      mounted = false;
      sdk.off('miniAppAdded', onMiniAppAdded);
      sdk.off('miniAppRemoved', onMiniAppRemoved);
      sdk.off('notificationsEnabled', onNotificationsEnabled);
      sdk.off('notificationsDisabled', onNotificationsDisabled);
    };
  }, [analyticsEnabled, backButtonEnabled, returnUrl]);

  const value = useMemo(
    () => ({ context, actions: sdk.actions, haptics: sdk.haptics, added, notificationDetails }),
    [context, added, notificationDetails]
  );

  return <MiniAppContext.Provider value={value}>{children}</MiniAppContext.Provider>;
}

export function useMiniApp() {
  return useContext(MiniAppContext);
}
