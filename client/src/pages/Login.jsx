import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Button, Field, TYPE_TAPE } from '../components/ui.jsx';
import { label } from '../lib/format.js';
import Logo from '../components/Logo.jsx';

const DEMO = [
  ['admin@labrador.local', 'Admin'],
  ['somchai@labrador.local', 'Staff'],
  ['ben@labrador.local', 'Member'],
];

export default function Login({ register }) {
  const { login, register: doRegister } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (register) await doRegister(form);
      else await login(form.email, form.password);
      nav('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-full lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative hidden overflow-hidden bg-brand-800 p-12 text-white lg:flex lg:flex-col xl:p-16">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <span className="font-display text-[1.75rem] font-bold leading-none">Labrador</span>
        </div>
        <div className="mt-auto max-w-[34rem]">
          <h1 className="font-display text-[clamp(2.75rem,4.4vw,4rem)] font-semibold leading-[0.98]">
            Ask the lab for anything, then watch it get done.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-white/80">
            Requests, instrument bookings and consumables orders live here instead of in email threads.
            Each one has an owner, a priority and a conversation.
          </p>
          <div className="mt-9 flex flex-wrap gap-2.5" aria-label="Request types">
            {Object.entries(TYPE_TAPE).map(([t, c], i) => (
              <span key={t} className="tape px-3 py-1 text-sm" style={{ '--tape': c, transform: `rotate(${[-1.5, 1, -0.5, 1.5, -1][i]}deg)` }}>{label(t)}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2.5 lg:hidden"><Logo className="h-9 w-9" /><span className="font-display text-2xl font-bold">Labrador</span></div>
          <h2 className="font-display text-[2.5rem] font-semibold leading-none text-ink">{register ? 'Join the lab' : 'Sign in'}</h2>
          <p className="mt-2 text-[15px] text-muted">{register ? 'Create a member account. Staff can change your role later.' : 'Use your lab email and password.'}</p>
          <div className="mt-8 space-y-4">
            {register && (
              <Field label="Full name"><input className="input" required value={form.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
            )}
            <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="username" /></Field>
            <Field label="Password"><input className="input" type="password" required minLength={6} value={form.password} onChange={set('password')} autoComplete={register ? 'new-password' : 'current-password'} /></Field>
            {error && <div role="alert" className="rounded-md border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">{error}</div>}
            <Button type="submit" className="w-full" size="lg" loading={busy}>{register ? 'Create account' : 'Sign in'}</Button>
          </div>
          <p className="mt-5 text-sm text-muted">
            {register ? <>Already have an account? <Link className="font-medium text-brand-700 underline" to="/login">Sign in</Link></>
              : <>New to the lab? <Link className="font-medium text-brand-700 underline" to="/register">Create an account</Link></>}
          </p>
          {!register && (
            <div className="mt-10 border-t border-line pt-5">
              <p className="text-[13px] text-muted">Demo accounts use the password <span className="font-mono text-ink">password123</span>. Pick one to fill the form:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DEMO.map(([email, role]) => (
                  <button type="button" key={email} onClick={() => setForm({ ...form, email, password: 'password123' })}
                    className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-brand-600 hover:text-brand-800">
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
