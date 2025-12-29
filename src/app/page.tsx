export default function Home() {
  return (
    <main className="hero">
      <div className="card hero-card">
        <h1>mixstate</h1>
        <p>
          A minimal audio mixing IDE where the mix is a state machine and every
          change is a commit.
        </p>
        <div className="hero-actions">
          <a className="button" href="/project/demo">
            Open demo project
          </a>
        </div>
        <span className="footer-note">
          No accounts, no plugins, just state + history.
        </span>
      </div>
    </main>
  );
}
