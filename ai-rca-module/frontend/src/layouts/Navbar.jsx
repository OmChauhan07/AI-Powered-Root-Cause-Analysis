import React from 'react';

export const Navbar = ({ onSwitchToCopilot }) => {
  return (
    <header style={navStyles.header}>
      <div style={navStyles.container}>
        <div style={navStyles.brand}>
          <div style={navStyles.logo}>AI</div>
          <div>
            <div style={navStyles.brandTitle}>AI RCA Module</div>
            <div style={navStyles.brandSub}>AI-Powered Root Cause Analysis</div>
          </div>
        </div>
        <nav style={navStyles.nav}>
          {onSwitchToCopilot && (
            <button
              onClick={onSwitchToCopilot}
              style={navStyles.copilotBtn}
              title="Switch to Stitch Copilot Split View"
            >
              ⚡ AIVOA Copilot View
            </button>
          )}
          <span style={navStyles.badge}>v0.1.0-alpha</span>
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noreferrer"
            style={navStyles.link}
          >
            Backend Swagger API ↗
          </a>
        </nav>
      </div>
    </header>
  );
};

const navStyles = {
  header: {
    backgroundColor: '#0f172a',
    borderBottom: '1px solid #1e293b',
    padding: '12px 24px',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logo: {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontWeight: '800',
    fontSize: '1rem',
    padding: '6px 10px',
    borderRadius: '8px',
    letterSpacing: '0.05em',
  },
  brandTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: '1.05rem',
  },
  brandSub: {
    color: '#94a3b8',
    fontSize: '0.75rem',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  badge: {
    backgroundColor: '#1e293b',
    color: '#60a5fa',
    border: '1px solid #3b82f6',
    padding: '3px 8px',
    borderRadius: '9999px',
    fontSize: '0.72rem',
    fontWeight: '600',
  },
  copilotBtn: {
    backgroundColor: '#ffffff',
    color: '#000000',
    border: '1px solid #ffffff',
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '0.8rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'opacity 0.15s ease',
  },
  link: {
    color: '#94a3b8',
    textDecoration: 'none',
    fontSize: '0.85rem',
    fontWeight: '500',
    transition: 'color 0.2s',
  },
};

export default Navbar;
