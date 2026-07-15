import { Routes, Route, Link, NavLink } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Scanner from './pages/Scanner.jsx'
import DcvPreflight from './pages/DcvPreflight.jsx'
import PqcTest from './pages/PqcTest.jsx'
import ChainFixer from './pages/ChainFixer.jsx'
import AcmeAudit from './pages/AcmeAudit.jsx'

const navLink = ({ isActive }) => 'ws-nav-link' + (isActive ? ' active' : '')

export default function App() {
  return (
    <>
      <nav className="ws-nav">
        <div className="ws-nav-inner">
          <Link to="/" className="ws-logo">
            <span className="ws-logo-mark">✓</span> CA Tools
          </Link>
          <div className="ws-nav-links">
            <NavLink to="/47-day-scanner" className={navLink}>47-Day Scanner</NavLink>
            <NavLink to="/dcv-preflight" className={navLink}>DCV Pre-Flight</NavLink>
            <NavLink to="/pqc-test" className={navLink}>PQC Test</NavLink>
            <NavLink to="/chain-fixer" className={navLink}>Chain Fixer</NavLink>
            <NavLink to="/acme-audit" className={navLink}>ACME Audit</NavLink>
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/47-day-scanner" element={<Scanner />} />
        <Route path="/dcv-preflight" element={<DcvPreflight />} />
        <Route path="/pqc-test" element={<PqcTest />} />
        <Route path="/chain-fixer" element={<ChainFixer />} />
        <Route path="/acme-audit" element={<AcmeAudit />} />
      </Routes>

      <footer className="ws-footer">
        <div className="ws-container">
          Free SSL &amp; PKI tools · No signup required · Domain scans run
          server-side, certificate parsing stays on our infrastructure and
          nothing is stored.
        </div>
      </footer>
    </>
  )
}
