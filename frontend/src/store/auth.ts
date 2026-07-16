import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account } from '@kestrel/shared';
import { fetchMe, login as apiLogin, logout as apiLogout } from '../services/api';

type AuthState = {
  token: string | null;
  account: Account | null;
  bootstrapped: boolean;
  setSession: (token: string, account: Account) => void;
  setAccount: (account: Account) => void;
  clearSession: () => void;
  bootstrap: () => Promise<void>;
  login: (
    username: string,
    password: string,
  ) => Promise<{ requiresTotp: true; challengeToken: string } | void>;
  completeTotpLogin: (challengeToken: string, totpCode: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      account: null,
      bootstrapped: false,
      setSession: (token, account) => set({ token, account }),
      setAccount: (account) => set({ account }),
      clearSession: () => set({ token: null, account: null }),
      bootstrap: async () => {
        const token = get().token;
        if (!token) {
          set({ account: null, bootstrapped: true });
          return;
        }
        try {
          const res = await fetchMe();
          set({ account: res.account, bootstrapped: true });
        } catch {
          set({ token: null, account: null, bootstrapped: true });
        }
      },
      login: async (username, password) => {
        const res = await apiLogin({ username, password });
        if ('requiresTotp' in res && res.requiresTotp) {
          return {
            requiresTotp: true as const,
            challengeToken: res.challengeToken,
          };
        }
        if ('token' in res) {
          set({ token: res.token, account: res.account, bootstrapped: true });
        }
      },
      completeTotpLogin: async (challengeToken, totpCode) => {
        const res = await apiLogin({ challengeToken, totpCode });
        if (!('token' in res)) {
          throw new Error('invalid_totp');
        }
        set({ token: res.token, account: res.account, bootstrapped: true });
      },
      logout: async () => {
        try {
          await apiLogout();
        } catch {
          /* ignore */
        }
        set({ token: null, account: null });
      },
    }),
    {
      name: 'kestrel-auth',
      partialize: (s) => ({ token: s.token }),
    },
  ),
);

export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
