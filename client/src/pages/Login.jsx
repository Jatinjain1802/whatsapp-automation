import { useState } from 'react';
import { api } from '../api.js';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', businessName: '' });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post(`/auth/${mode}`, form);
      localStorage.setItem('token', data.token);
      location.href = '/';
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="card" style={{ maxWidth: 420, margin: '80px auto' }}>
      <h2>{mode === 'login' ? 'Log in' : 'Create your business account'}</h2>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <>
            <input placeholder="Your name" value={form.name} onChange={set('name')} />
            <input placeholder="Business name" value={form.businessName} onChange={set('businessName')} required />
          </>
        )}
        <input type="email" placeholder="Email" value={form.email} onChange={set('email')} required />
        <input type="password" placeholder="Password" value={form.password} onChange={set('password')} required />
        {error && <p className="error">{error}</p>}
        <button type="submit">{mode === 'login' ? 'Log in' : 'Register'}</button>
      </form>
      <p style={{ marginTop: 14 }}>
        <button className="secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
        </button>
      </p>
    </div>
  );
}
