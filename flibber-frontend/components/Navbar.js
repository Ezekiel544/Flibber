import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

const ADMIN_WALLET = "0xa388C71f0D69d33455cf25f6c71F7eA37f98745B"

const NAV_LINKS = [
  { href: '/',           label: 'Slot',    icon: '◈' },
  { href: '/pool',       label: 'Pool',    icon: '◉' },
  { href: '/stake',      label: 'Stake',   icon: '◎' },
  { href: '/governance', label: 'Govern',  icon: '◐' },
  { href: '/faucet',     label: 'Faucet',  icon: '◑' },
  { href: '/history',    label: 'History', icon: '◒' },
]

const BOTTOM_NAV = [
  { href: '/',        label: 'Slot',    icon: '◈' },
  { href: '/pool',    label: 'Pool',    icon: '◉' },
  { href: '/faucet',  label: 'Faucet',  icon: '◑' },
  { href: '/history', label: 'History', icon: '◒' },
]

export default function Navbar({ account, onConnect, onDisconnect, chainId, connecting }) {
  const router  = useRouter()
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const [isMobile,   setIsMobile]   = useState(false)

  const short   = a => a ? `${a.slice(0,6)}...${a.slice(-4)}` : ''
  const isAdmin = account?.toLowerCase() === ADMIN_WALLET.toLowerCase()

  const allLinks = [...NAV_LINKS]

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => { setMenuOpen(false); setWalletOpen(false) }, [router.pathname])

  useEffect(() => {
    if (isMobile && menuOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen, isMobile])

  return (
    <>
      {/* ── Top Navbar ────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(5,5,5,0.97)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(20px)',
        height: '64px',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: '12px',
      }}>
        {/* Logo — always left */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <img src="/flibber.png" alt="F"
            style={{ width: 28, height: 28, borderRadius: '8px', objectFit: 'cover', mixBlendMode: 'lighten' }}
            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }}
          />
          <div style={{ width: 28, height: 28, borderRadius: '8px', background: 'linear-gradient(135deg,#00FF87,#0EA5E9)', display: 'none', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '800', color: '#050505' }}>F</div>
          <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--white)', letterSpacing: '0.1em' }}>
            FLIBBER
          </span>
        </Link>

        {/* Desktop nav links */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
            {allLinks.map(l => {
              const active = router.pathname === l.href
              return (
                <Link key={l.href} href={l.href} style={{
                  padding: '6px 14px', borderRadius: '8px',
                  fontSize: '13px', fontWeight: '600',
                  textDecoration: 'none', whiteSpace: 'nowrap',
                  color: active ? 'var(--white)' : 'var(--text2)',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  transition: 'all 0.2s',
                }}>{l.label}</Link>
              )
            })}
          </div>
        )}

        {/* Spacer on mobile */}
        {isMobile && <div style={{ flex: 1 }} />}

        {/* Desktop wallet button */}
        {!isMobile && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={account ? () => setWalletOpen(!walletOpen) : onConnect} style={{
              padding: '8px 16px', borderRadius: '10px',
              fontSize: '13px', fontWeight: '700',
              border: '1px solid',
              borderColor: account ? 'var(--border)' : 'var(--green)',
              background: account ? 'rgba(255,255,255,0.04)' : 'rgba(0,255,135,0.08)',
              color: account ? 'var(--plat)' : 'var(--green)',
              cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace',
              whiteSpace: 'nowrap', transition: 'all 0.2s',
            }}>
              {connecting ? 'Connecting…' : account ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', boxShadow: '0 0 6px var(--green)' }} />
                  {short(account)}
                </span>
              ) : 'Connect'}
            </button>

            {walletOpen && account && (
              <>
                <div onClick={() => setWalletOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
                <div style={{ position: 'absolute', top: '48px', right: 0, zIndex: 200, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '8px', minWidth: '200px', boxShadow: '0 24px 48px rgba(0,0,0,0.6)' }}>
                  <div style={{ padding: '8px 12px', fontSize: '11px', color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', wordBreak: 'break-all' }}>{account}</div>
                  {isAdmin && <div style={{ padding: '2px 12px 6px', fontSize: '11px', color: 'var(--green)', fontWeight: '700' }}>⚙ Admin</div>}
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <a href={`https://sepolia.basescan.org/address/${account}`} target="_blank" rel="noreferrer" onClick={() => setWalletOpen(false)}
                    style={{ display: 'block', padding: '8px 12px', fontSize: '13px', color: 'var(--blue)', textDecoration: 'none', borderRadius: '8px' }}>
                    View on Basescan ↗
                  </a>
                  <Link href="/history" onClick={() => setWalletOpen(false)}
                    style={{ display: 'block', padding: '8px 12px', fontSize: '13px', color: 'var(--plat)', textDecoration: 'none', borderRadius: '8px' }}>
                    Slot History
                  </Link>
                  {isAdmin && (
                    <Link href="/dashboard" onClick={() => setWalletOpen(false)}
                      style={{ display: 'block', padding: '8px 12px', fontSize: '13px', color: 'var(--green)', textDecoration: 'none', borderRadius: '8px' }}>
                      Admin Dashboard
                    </Link>
                  )}
                  <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                  <button onClick={() => { onDisconnect(); setWalletOpen(false) }} style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '13px', textAlign: 'left', borderRadius: '8px', fontFamily: 'Manrope, sans-serif', fontWeight: '600' }}>
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Mobile hamburger — RIGHT side */}
        {isMobile && (
          <button onClick={() => setMenuOpen(true)} style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: 'var(--card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, color: 'var(--silver)',
            fontSize: '18px', lineHeight: 1,
          }}>☰</button>
        )}
      </nav>

      {/* ── Mobile Slide-in Menu ─────────────────────── */}
      {isMobile && (
        <>
          {/* Backdrop */}
          <div onClick={() => setMenuOpen(false)} style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            opacity: menuOpen ? 1 : 0,
            pointerEvents: menuOpen ? 'auto' : 'none',
            transition: 'opacity 0.3s ease',
            backdropFilter: 'blur(4px)',
          }} />

          {/* Panel */}
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 300,
            width: '280px',
            background: 'var(--bg2)',
            borderLeft: '1px solid var(--border)',
            transform: menuOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Panel header */}
            <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)' }}>
              <img src="/flibber.png" alt="F" style={{ width: 26, height: 26, borderRadius: '8px', objectFit: 'cover', mixBlendMode: 'lighten' }} onError={e => e.target.style.display='none'} />
              <span style={{ fontSize: '15px', fontWeight: '800', color: 'var(--white)', letterSpacing: '0.1em', flex: 1 }}>
                FLIBB<span style={{ color: 'var(--green)' }}>ER</span>
              </span>
              <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>✕</button>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
              {allLinks.map(l => {
                const active = router.pathname === l.href
                return (
                  <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '13px 14px', borderRadius: '10px', marginBottom: '2px',
                    textDecoration: 'none',
                    color: active ? 'var(--white)' : 'var(--silver)',
                    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                    fontSize: '14px', fontWeight: '600', transition: 'all 0.2s',
                  }}>
                    <span style={{ fontSize: '16px', opacity: 0.7 }}>{l.icon}</span>
                    {l.label}
                    {active && <span style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />}
                  </Link>
                )
              })}
            </div>

            {/* Wallet section at bottom */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
              {account ? (
                <>
                  <div style={{ padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block', boxShadow: '0 0 6px var(--green)' }} />
                      <span style={{ fontSize: '12px', color: 'var(--green)', fontWeight: '700' }}>Connected</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', wordBreak: 'break-all' }}>{account}</div>
                  </div>
                  <button onClick={() => { onDisconnect(); setMenuOpen(false) }} style={{
                    width: '100%', padding: '11px', borderRadius: '10px',
                    background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)',
                    color: 'var(--red)', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  }}>Disconnect</button>
                </>
              ) : (
                <button onClick={() => { onConnect(); setMenuOpen(false) }} style={{
                  width: '100%', padding: '13px', borderRadius: '10px',
                  background: 'var(--plat)', border: 'none',
                  color: 'var(--bg)', fontSize: '14px', fontWeight: '800', cursor: 'pointer',
                  letterSpacing: '0.04em',
                }}>
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Mobile Bottom Nav ────────────────────────── */}
      {isMobile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(5,5,5,0.97)',
          borderTop: '1px solid var(--border)',
          backdropFilter: 'blur(20px)',
          padding: '8px 16px 20px',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        }}>
          {BOTTOM_NAV.map(l => {
            const active = router.pathname === l.href
            return (
              <Link key={l.href} href={l.href} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                textDecoration: 'none', padding: '4px 12px',
                color: active ? 'var(--white)' : 'var(--muted)',
                transition: 'color 0.2s',
              }}>
                <span style={{ fontSize: '20px', opacity: active ? 1 : 0.5 }}>{l.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.03em' }}>{l.label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}