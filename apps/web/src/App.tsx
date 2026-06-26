// apps/web — root component.
//
// Phase 1: placeholder UI. Renders a banner and the project name.
// Subsequent phases add: routing (React Router), auth (login page),
// app switcher, and the feature pages (Inbox, Fans, Rules, Broadcasts, Settings).

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>op-wechat</h1>
        <p className="tagline">公众号运营后台 · WeChat Official Account operations</p>
      </header>
      <main className="app-main">
        <section className="card">
          <h2>Phase 1 skeleton ready</h2>
          <p>
            Backend (api, webhook, scheduler) and frontend (Vite + React) are wired up.
            Feature work begins in Phase 2 (auth + app management).
          </p>
          <ul>
            <li>
              API health: <a href="/api/healthz">/api/healthz</a>
            </li>
            <li>
              Webhook health: <a href="/webhook/healthz">/webhook/healthz</a>
            </li>
            <li>
              Scheduler health: <a href="http://localhost:3003/healthz">:3003/healthz</a>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;
