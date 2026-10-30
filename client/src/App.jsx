import { QRCodeCanvas } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function formatPercent(value) {
  return `${(value * 100).toFixed(4)}%`;
}

function ArrowIcon() {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M4.167 10h11.666M10 4.167 15.833 10 10 15.833" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function App() {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [statsError, setStatsError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const qrRef = useRef(null);
  const inputRef = useRef(null);

  async function loadStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/stats`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load filter stats.');
      setStats(data.bloom);
      setStatsError('');
    } catch (loadError) {
      setStatsError(loadError.message || 'Could not reach the API.');
    }
  }

  useEffect(() => { loadStats(); }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const originalUrl = url.trim();
      const response = await fetch(`${API_BASE_URL}/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: originalUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not shorten the URL.');
      setResult({ ...data, originalUrl });
      setCopied(false);
      await loadStats();
    } catch (submitError) {
      setError(submitError.message || 'Could not reach the API.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyShortUrl() {
    if (!result?.shortUrl) return;
    try {
      await navigator.clipboard.writeText(result.shortUrl);
      setCopied(true);
    } catch {
      setError('Could not copy the link.');
    }
  }

  function downloadQrCode() {
    const canvas = qrRef.current?.querySelector('canvas');
    if (!canvas || !result?.shortUrl) return;
    const code = new URL(result.shortUrl).pathname.slice(1);
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${code}-qr.png`;
    link.click();
  }

  function focusForm() {
    document.getElementById('shorten')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => inputRef.current?.focus(), 400);
  }

  return (
    <main className="page-wrap">
      <div className="color-field" aria-hidden="true" />
      <div className="app-shell">
        <header className="topbar">
          <a className="brand" href="#top" aria-label="Linkform home"><span className="brand-mark">↗</span><span>linkform<span className="brand-dot">.</span></span></a>
          <nav className="nav-links" aria-label="Main navigation">
            <a href="#shorten">Shorten</a><a href="#how-it-works">How it works</a><a href="#filter-stats">Filter stats</a>
          </nav>
          <button className="nav-cta" type="button" onClick={focusForm}>Create a link <ArrowIcon /></button>
        </header>

        <section className="hero" id="top">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> A smarter way to share</div>
            <h1>Long links.<br />Short story<span className="accent-period">.</span></h1>
            <p className="hero-description">Turn unwieldy URLs into clean, shareable links. Fast redirects are powered by a Redis backed Bloom filter.</p>
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={focusForm}>Make a short link <ArrowIcon /></button>
              <a className="text-button" href="#how-it-works">See how it works <span>↓</span></a>
            </div>
            <div className="hero-note"><span className="note-icon">✳</span><span>Instant links, intelligent lookups</span></div>
          </div>

          <div className="visual-stage" aria-label="Preview of the URL shortener">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="float-card link-card">
              <div className="card-topline"><span className="tiny-label">YOUR SHORT LINK</span><span className="status-pill"><i /> ACTIVE</span></div>
              <div className="link-preview"><span className="link-symbol">↗</span><span className="link-text">{result?.shortUrl ? new URL(result.shortUrl).host + new URL(result.shortUrl).pathname : 'lnk.fm / a7xK2p'}</span><span className="copy-glyph">⧉</span></div>
              <div className="destination-preview"><span className="destination-dot" />{result?.originalUrl || 'your-long-destination.com/story'}</div>
              <div className="card-divider" />
              <div className="link-meta"><span><b>302</b> redirect</span><span><b>~12ms</b> lookup</span><span className="secure-mark">⌑ secure</span></div>
            </div>
            <div className="float-card filter-card">
              <div className="filter-heading"><span className="filter-icon">◈</span><div><span className="tiny-label">REDIS ENGINE</span><strong>Bloom filter</strong></div><span className="pulse-bars"><i /><i /><i /><i /><i /></span></div>
              <div className="filter-status"><span className="check-mark">✓</span><div><strong>Unknown code filtered</strong><small>Database lookup skipped</small></div><span className="status-time">&lt;1ms</span></div>
              <div className="filter-meter"><span /></div>
              <div className="filter-foot"><span>{stats ? stats.itemsAdded.toLocaleString() : '—'} codes protected</span><span>{stats ? formatPercent(stats.estimatedFalsePositiveRate) : '—'} false positive</span></div>
            </div>
            <div className="float-chip"><span className="chip-spark">✦</span><span>Built for speed</span></div>
            <div className="stage-caption"><span className="caption-line" /> A little less link, a lot more signal</div>
          </div>
        </section>

        <div className="trust-row"><span>MADE FOR LINKS THAT MOVE</span><div className="trust-items"><span>Share <b>anywhere</b></span><i /><span>Redirect <b>instantly</b></span><i /><span>Designed to <b>scale</b></span></div><span className="trust-side">NO CLUTTER. JUST CLICK.</span></div>

        <section className="workspace" id="shorten">
          <div className="section-intro"><div><div className="eyebrow muted-eyebrow">YOUR LINK STUDIO</div><h2>Make it <span>short.</span></h2><p>Paste a destination and we’ll make it ready to travel.</p></div><div className="step-label"><span>01</span> CREATE A LINK</div></div>
          <div className="studio-grid">
            <section className="studio-card create-card">
              <div className="card-heading"><span className="number-badge">01</span><div><h3>Destination</h3><p>Where should your link take people?</p></div></div>
              <form className="shorten-form" onSubmit={handleSubmit}>
                <label htmlFor="destination-url">Paste your long URL</label>
                <div className="input-wrap"><span className="input-prefix">↗</span><input ref={inputRef} id="destination-url" type="url" placeholder="https://example.com/your-long-link" value={url} onChange={(event) => setUrl(event.target.value)} required /></div>
                {error && <div role="alert" className="error-message">{error}</div>}
                <button className="primary-button submit-button" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating your link…' : 'Shorten this URL'} <ArrowIcon /></button>
              </form>
              <div className="privacy-note"><span>⌑</span> Links are stored securely and ready in a moment.</div>
            </section>

            <section className={`studio-card result-card ${result ? 'has-result' : ''}`} aria-live="polite">
              {result ? <>
                <div className="card-heading"><span className="number-badge violet-badge">02</span><div><h3>Your link is ready</h3><p>Copy it or share the QR code.</p></div><span className="ready-label"><i /> READY</span></div>
                <div className="result-link-row"><a href={result.shortUrl} target="_blank" rel="noreferrer">{result.shortUrl}</a><button type="button" onClick={copyShortUrl}>{copied ? 'Copied ✓' : 'Copy link'}</button></div>
                <p className="result-destination">↳ {result.originalUrl}</p>
                <div className="qr-row"><div ref={qrRef} className="qr-code"><QRCodeCanvas value={result.shortUrl} size={92} includeMargin /></div><div><strong>Take it offline</strong><p>Scan to open your short link, or save the QR code as an image.</p><button className="download-button" type="button" onClick={downloadQrCode}>Download QR <ArrowIcon /></button></div></div>
              </> : <div className="empty-result"><div className="empty-orbit"><span>↗</span></div><h3>Your next link starts here.</h3><p>Your shortened URL and shareable QR code will appear in this space.</p><div className="empty-dashes"><i /><i /><i /></div></div>}
            </section>
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-copy"><div className="eyebrow muted-eyebrow">A SMALL LINK, A SMART PATH</div><h2>Every click takes<br />the <span>quick route.</span></h2><p>When someone opens a short code, the Bloom filter checks whether it could exist. Definite misses stop right there, without a URL lookup in Redis.</p></div>
          <div className="flow-card"><div className="flow-step"><span className="flow-icon lavender">↗</span><div><small>01 · VISITOR</small><strong>Opens a short link</strong></div></div><span className="flow-connector">········································</span><div className="flow-step"><span className="flow-icon yellow">◈</span><div><small>02 · BLOOM FILTER</small><strong>{stats ? `${stats.hashes} checks, in memory` : 'Checks the short code'}</strong></div></div><span className="flow-connector">········································</span><div className="flow-step"><span className="flow-icon mint">✓</span><div><small>03 · REDIRECT</small><strong>Known links go to Redis</strong></div></div></div>
        </section>

        <section className="stats-section" id="filter-stats">
          <div className="stats-header"><div><div className="eyebrow muted-eyebrow">UNDER THE HOOD</div><h2>Fast by <span>design.</span></h2><p>Live stats from the Redis backed Bloom filter.</p></div><button type="button" className="refresh-button" onClick={loadStats}>↻ <span>Refresh</span></button></div>
          {statsError && <p role="alert" className="stats-error">{statsError}</p>}
          <div className="stats-grid"><article className="stat-tile"><span>FILTER SIZE</span><strong>{stats ? stats.bits.toLocaleString() : '—'}<small> bits</small></strong><p>Available memory for fast checks</p></article><article className="stat-tile"><span>HASH FUNCTIONS</span><strong>{stats?.hashes ?? '—'}<small> hashes</small></strong><p>Independent checks per short code</p></article><article className="stat-tile"><span>CODES ADDED</span><strong>{stats ? stats.itemsAdded.toLocaleString() : '—'}</strong><p>{stats ? `${stats.bitsSet.toLocaleString()} bits currently set` : 'Waiting for filter data'}</p></article><article className="stat-tile stat-highlight"><span>EST. FALSE POSITIVE</span><strong>{stats ? formatPercent(stats.estimatedFalsePositiveRate) : '—'}</strong><p>{stats ? `Target: ${formatPercent(stats.targetFalsePositiveRate)}` : 'Calculated from live filter bits'}</p></article></div>
        </section>

        <footer className="footer"><a className="brand" href="#top"><span className="brand-mark">↗</span><span>linkform<span className="brand-dot">.</span></span></a><span>Small links. Thoughtful engineering.</span><a href="#top">Back to top ↑</a></footer>
      </div>
    </main>
  );
}
