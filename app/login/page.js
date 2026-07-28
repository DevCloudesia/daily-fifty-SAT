import { login } from './actions';

export default async function LoginPage({ searchParams }) {
  const params = await searchParams;
  const hasError = params?.error === '1';

  return (
    <main className="login-shell">
      <form className="login-card" action={login}>
        <span className="login-mark">50</span>
        <h1>The Daily Fifty</h1>
        <p className="login-sub">Enter the password to continue.</p>
        <input
          className="login-input"
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          autoComplete="current-password"
          required
        />
        {hasError ? <p className="login-error">That password isn&apos;t right. Try again.</p> : null}
        <button className="login-button" type="submit">Unlock</button>
      </form>
    </main>
  );
}
