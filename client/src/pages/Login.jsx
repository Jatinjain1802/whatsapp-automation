/*
  Login.jsx — Authentication page (Login + Register)
  -----------------------------------------------------------------------
  KEY CONCEPTS:
  
  1. CONTROLLED FORM — React controls the input values via state.
     `value={form.email}` makes React the "single source of truth".
     `onChange` updates state on every keystroke.
     Without this, the input would be read-only!
     
  2. FORM SUBMISSION — `onSubmit={submit}` fires when user presses Enter
     or clicks the submit button. `e.preventDefault()` stops the browser
     from doing a full page reload (default HTML form behavior).
     
  3. DYNAMIC API ENDPOINT — `api.post(\`/auth/\${mode}\`)` sends to either
     /auth/login or /auth/register depending on which mode the user chose.
     Template literals (backtick strings) let you embed variables with ${}.
     
  4. JWT TOKEN — After successful login, the server returns a JSON Web Token.
     We store it in localStorage so the user stays logged in across refreshes.
*/

import { useState } from 'react';
import { api } from '../api.js';

export default function Login() {
  // `mode` tracks whether we're showing login or register form
  const [mode, setMode] = useState('login');
  // `form` is an object holding all input values
  const [form, setForm] = useState({ email: '', password: '', name: '', businessName: '' });
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault(); // Prevent browser's default form submit (page reload)
    setError('');
    try {
      // Send form data to the appropriate endpoint
      const { data } = await api.post(`/auth/${mode}`, form);
      // Store the JWT token — this is what authed() checks in App.jsx
      localStorage.setItem('token', data.token);
      // Full page redirect (not React Router) to trigger a fresh auth check
      location.href = '/';
    } catch (err) {
      // Optional chaining (?.) safely accesses nested properties
      // If err.response is undefined, it won't crash — just returns undefined
      setError(err.response?.data?.error || 'Something went wrong');
    }
  }

  /*
    Helper function that returns a new function — this is called a "closure".
    `set('email')` returns `(e) => setForm(...)` which handles the onChange event.
    The spread operator (...form) copies all existing fields, then [k] overrides just one.
    [k] is a "computed property name" — the key is dynamic based on the variable k.
  */
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="card">
          {/* Logo section */}
          <div className="login-logo">
            <div className="logo-circle">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.107-1.134l-.293-.175-2.868.852.852-2.868-.175-.293A8 8 0 1112 20z" />
              </svg>
            </div>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          </div>

          <form onSubmit={submit}>
            {/* 
              Conditional rendering — these fields only show for registration.
              && is a short-circuit: if left side is false, right side never renders.
              Fragment (<></>) groups multiple elements without adding a DOM node.
            */}
            {mode === 'register' && (
              <>
                <input placeholder="Your name" value={form.name} onChange={set('name')} />
                <input placeholder="Business name" value={form.businessName} onChange={set('businessName')} required />
              </>
            )}
            <input type="email" placeholder="Email address" value={form.email} onChange={set('email')} required />
            <input type="password" placeholder="Password" value={form.password} onChange={set('password')} required />
            {error && <p className="error">{error}</p>}
            <button type="submit" style={{ width: '100%', marginTop: 4 }}>
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </form>

          <div className="login-toggle">
            <button className="secondary" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
