import { signup } from './actions';

const ERRORS = Object.freeze({
  key: 'That signup permission key is not correct.',
  match: 'The two passwords do not match.',
  length: 'Choose a password between 8 and 128 characters.',
  exists: 'That password already belongs to an account. Try logging in instead.',
  server: 'Account creation is temporarily unavailable. Try again.',
});

export default async function SignupPage({ searchParams }) {
  const params = await searchParams;
  const error = ERRORS[params?.error] || null;

  return (
    <main className="login-shell">
      <form className="login-card" action={signup}>
        <span className="login-mark">50</span>
        <h1>Create your account</h1>
        <p className="login-sub">Choose a password. Your SAT progress will stay separate from everyone else&apos;s.</p>
        <div className="login-fields">
          <input
            className="login-input"
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
          <input
            className="login-input"
            type="password"
            name="confirmPassword"
            placeholder="Retype password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
          <input
            className="login-input"
            type="password"
            name="permissionKey"
            placeholder="Signup permission key"
            autoComplete="off"
            required
          />
        </div>
        {error ? <p className="login-error">{error}</p> : null}
        <button className="login-button" type="submit">Create account</button>
        <a className="login-link" href="/login">Already have an account? Log in</a>
      </form>
    </main>
  );
}
