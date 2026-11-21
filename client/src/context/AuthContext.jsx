import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [badges, setBadges] = useState({ unread: 0, cart: 0 });

  const refresh = useCallback(async () => {
    try { setUser(await api.get('/auth/me')); } catch { setUser(null); }
  }, []);

  const refreshBadges = useCallback(async () => {
    try {
      const [n, c] = await Promise.all([api.get('/notifications?limit=1'), api.get('/cart')]);
      setBadges({ unread: n.unread, cart: c.items.reduce((s, i) => s + i.quantity, 0) });
    } catch { /* signed out */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!user) return;
    refreshBadges();
    const t = setInterval(refreshBadges, 20000);
    return () => clearInterval(t);
  }, [user, refreshBadges]);

  const login = async (email, password) => setUser(await api.post('/auth/login', { email, password }));
  const register = async (data) => setUser(await api.post('/auth/register', data));
  const logout = async () => { await api.post('/auth/logout'); setUser(null); };
  const isStaff = user && (user.role === 'staff' || user.role === 'admin');
  const isAdmin = user?.role === 'admin';

  return (
    <AuthCtx.Provider value={{ user, setUser, refresh, login, register, logout, isStaff, isAdmin, badges, refreshBadges }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
