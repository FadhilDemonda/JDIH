export default function AuthLayout({ children }) {
  return (
    <div id="app-shell" className="app-shell auth-only">
      <div className="workspace-frame">
        <main id="main-content" className="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
