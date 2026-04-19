import { useEffect, useState } from 'react';
import type { Snapshot } from './model';

type Params = {
  isAdminRoute: boolean;
  adminAuthorized: boolean;
  adminMatchID: string;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  adminMatchStateApi: string;
};

export const useAdminSnapshot = ({
  isAdminRoute,
  adminAuthorized,
  adminMatchID,
  adminFetch,
  adminMatchStateApi,
}: Params) => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!isAdminRoute) return;
    if (!adminAuthorized) return;
    if (!adminMatchID) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const fetchSnapshot = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await adminFetch(`${adminMatchStateApi}?matchID=${encodeURIComponent(adminMatchID)}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          if (!cancelled) setSnapshot(null);
          return;
        }
        const payload = (await response.json()) as {
          snapshot?: { G: unknown; ctx: unknown; updatedAt?: number };
        };
        if (!cancelled && payload.snapshot) {
          setSnapshot({
            G: payload.snapshot.G,
            ctx: payload.snapshot.ctx,
            updatedAt: payload.snapshot.updatedAt ?? Date.now(),
          });
        }
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    };

    void fetchSnapshot();
    const timer = window.setInterval(() => {
      void fetchSnapshot();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [adminMatchID, isAdminRoute, adminAuthorized]);

  return { snapshot, setSnapshot };
};
