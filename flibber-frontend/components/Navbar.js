import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Navbar({ account, onConnect, onDisconnect, chainId }) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)

  const short = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : ''

  const links = [
    { href: '/',           label: 'Slot' },
    { href: '/pool',       label: 'Pool' },
    { href: '/stake',      label: 'Stake' },
    { href: '/governance', label: 'Govern' },
    { href: '/dashboard',  label: 'Dashboard' },
  ]

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      borderBottom: '1px solid #1E2A36',
      background: 'rgba(8,11,15,0.97)',
      backdropFilter: 'blur(20px)',
      padding: '0 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: '64px', gap: '12px'
    }}>
      {/* Logo */}
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '8px',
          background: 'linear-gradient(135deg, #00FF87, #0EA5E9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '15px', fontWeight: '800', color: '#080B0F'
        }}>F</div>
        <span style={{ fontSize: '17px', fontWeight: '800', color: '#E8F0F8' }}>
          FLIBB<span style={{ color: '#00FF87' }}>ER</span>
        </span>
      </Link>

      {/* Nav Links — hidden on small screens */}
      <div style={{ display: 'flex', gap: '2px', overflow: 'auto' }}>
        {links.map(l => (
          <Link key={l.href} href={l.href} style={{
            padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
            textDecoration: 'none', whiteSpace: 'nowrap',
            color: router.pathname === l.href ? '#00FF87' : '#7A95AE',
            background: router.pathname === l.href ? 'rgba(0,255,135,0.08)' : 'transparent',
          }}>{l.label}</Link>
        ))}
      </div>

      {/* Wallet button */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={account ? () => setShowMenu(!showMenu) : onConnect} style={{
          padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '700',
          border: '1px solid',
          borderColor: account ? '#1E2A36' : '#00FF87',
          background: account ? 'rgba(30,42,54,0.5)' : 'rgba(0,255,135,0.1)',
          color: account ? '#E8F0F8' : '#00FF87',
          cursor: 'pointer', fontFamily: 'Space Mono, monospace', whiteSpace: 'nowrap'
        }}>
          {account ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00FF87', display: 'inline-block' }} />
              {short(account)}
            </span>
          ) : 'Connect'}
        </button>

        {/* Disconnect dropdown */}
        {showMenu && account && (
          <div style={{
            position: 'absolute', top: '44px', right: 0,
            background: '#0D1117', border: '1px solid #1E2A36',
            borderRadius: '12px', padding: '8px', minWidth: '160px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)', zIndex: 200
          }}>
            <div style={{ padding: '8px 12px', fontSize: '11px', color: '#7A95AE', fontFamily: 'Space Mono, monospace', wordBreak: 'break-all' }}>
              {account}
            </div>
            <div style={{ borderTop: '1px solid #1E2A36', margin: '4px 0' }} />
            <a href={`https://sepolia.basescan.org/address/${account}`} target="_blank" rel="noreferrer"
              style={{ display: 'block', padding: '8px 12px', fontSize: '13px', color: '#0EA5E9', textDecoration: 'none', borderRadius: '6px' }}>
              View on Basescan ↗
            </a>
            <button onClick={() => { onDisconnect(); setShowMenu(false) }} style={{
              width: '100%', padding: '8px 12px', background: 'none', border: 'none',
              color: '#FF4444', cursor: 'pointer', fontSize: '13px', textAlign: 'left',
              borderRadius: '6px', fontFamily: 'Syne, sans-serif'
            }}>Disconnect</button>
          </div>
        )}
      </div>
    </nav>
  )
}
