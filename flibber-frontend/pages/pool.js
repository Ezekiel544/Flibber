import { useState, useEffect } from 'react'
import { CONTRACTS, POOL_ABI, FIB_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

export default function PoolPage({ account, provider, onConnect }) {
  const [walletAddr,  setWalletAddr]  = useState(null)
  const [balances,    setBalances]    = useState({})
  const [poolBals,    setPoolBals]    = useState({})
  const [lpBals,      setLpBals]      = useState({})
  const [rewards,     setRewards]     = useState({})
  const [loading,     setLoading]     = useState({})
  const [txHash,      setTxHash]      = useState({})
  const [error,       setError]       = useState({})
  const [amounts,     setAmounts]     = useState({})
  const [activeTab,   setActiveTab]   = useState('deposit')
  const [activeToken, setActiveToken] = useState(SUPPORTED_TOKENS[0])
  const [imgErr,      setImgErr]      = useState({})

  useEffect(() => { if (provider && account) init() }, [provider, account])

  const init = async () => {
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const addr   = await signer.getAddress()
      setWalletAddr(addr)
      loadData(addr)
    } catch(e) { console.error(e) }
  }

  const loadData = async (addr) => {
    try {
      const { ethers } = await import('ethers')
      const pool  = new ethers.Contract(CONTRACTS.liquidityPool, POOL_ABI, provider)
      const bals  = {}, pBals = {}, lBals = {}, rwds = {}
      for (const t of SUPPORTED_TOKENS) {
        const tok = new ethers.Contract(t.address, FIB_ABI, provider)
        bals[t.symbol]  = parseFloat(ethers.formatUnits(await tok.balanceOf(addr), t.decimals)).toFixed(4)
        pBals[t.symbol] = parseFloat(ethers.formatUnits(await pool.getPoolBalance(t.address), t.decimals)).toFixed(4)
        lBals[t.symbol] = parseFloat(ethers.formatUnits(await pool.getLPBalance(addr, t.address), t.decimals)).toFixed(4)
        try {
          rwds[t.symbol] = parseFloat(ethers.formatUnits(await pool.getPendingReward(addr, t.address), t.decimals)).toFixed(6)
        } catch { rwds[t.symbol] = '0.000000' }
      }
      setBalances(bals); setPoolBals(pBals); setLpBals(lBals); setRewards(rwds)
    } catch(e) { console.error(e) }
  }

  const handleDeposit = async (token) => {
    const amount = amounts[token.symbol]
    if (!amount || parseFloat(amount) <= 0) return setError(p => ({...p, [token.symbol]: 'Enter an amount'}))
    setLoading(p => ({...p, [token.symbol]: 'deposit'}))
    setError(p => ({...p, [token.symbol]: null}))
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const amt    = ethers.parseUnits(amount, token.decimals)
      const tok    = new ethers.Contract(token.address, FIB_ABI, signer)
      const pool   = new ethers.Contract(CONTRACTS.liquidityPool, POOL_ABI, signer)
      const allow  = await tok.allowance(walletAddr, CONTRACTS.liquidityPool)
      if (BigInt(allow.toString()) < BigInt(amt.toString()))
        await (await tok.approve(CONTRACTS.liquidityPool, ethers.MaxUint256)).wait()
      const tx = await pool.deposit(token.address, amt)
      const rc = await tx.wait()
      setTxHash(p => ({...p, [token.symbol]: rc.hash}))
      setAmounts(p => ({...p, [token.symbol]: ''}))
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) {
      setError(p => ({...p, [token.symbol]: e?.reason || e?.message || 'Transaction failed'}))
    }
    setLoading(p => ({...p, [token.symbol]: null}))
  }

  const handleWithdraw = async (token) => {
    const amount = amounts[token.symbol]
    if (!amount || parseFloat(amount) <= 0) return setError(p => ({...p, [token.symbol]: 'Enter an amount'}))
    setLoading(p => ({...p, [token.symbol]: 'withdraw'}))
    setError(p => ({...p, [token.symbol]: null}))
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const amt    = ethers.parseUnits(amount, token.decimals)
      const pool   = new ethers.Contract(CONTRACTS.liquidityPool, POOL_ABI, signer)
      const tx     = await pool.withdraw(token.address, amt)
      const rc     = await tx.wait()
      setTxHash(p => ({...p, [token.symbol]: rc.hash}))
      setAmounts(p => ({...p, [token.symbol]: ''}))
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) {
      setError(p => ({...p, [token.symbol]: e?.reason || e?.message || 'Transaction failed'}))
    }
    setLoading(p => ({...p, [token.symbol]: null}))
  }

  const handleClaim = async (token) => {
    setLoading(p => ({...p, [`claim_${token.symbol}`]: true}))
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const pool   = new ethers.Contract(CONTRACTS.liquidityPool, POOL_ABI, signer)
      const tx     = await pool.claimReward(token.address)
      const rc     = await tx.wait()
      setTxHash(p => ({...p, [`claim_${token.symbol}`]: rc.hash}))
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) {
      setError(p => ({...p, [`claim_${token.symbol}`]: e?.reason || e?.message || 'Claim failed'}))
    }
    setLoading(p => ({...p, [`claim_${token.symbol}`]: false}))
  }

  const Logo = ({ t, size = 24 }) => {
    if (t.logoUrl && !imgErr[t.symbol])
      return <img src={t.logoUrl} alt={t.symbol} onError={() => setImgErr(p => ({...p, [t.symbol]: true}))} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5, fontWeight: '700', color: 'var(--silver)' }}>{t.symbol[0]}</div>
  }

  const totalPoolUSD = SUPPORTED_TOKENS.reduce((acc, t) => acc + (parseFloat(poolBals[t.symbol] || 0)), 0)
  const myLpUSD      = SUPPORTED_TOKENS.reduce((acc, t) => acc + (parseFloat(lpBals[t.symbol] || 0)), 0)

  const S = {
    page:  { minHeight: 'calc(100vh - 64px)', padding: '32px 16px 40px', maxWidth: '680px', margin: '0 auto', position: 'relative', zIndex: 1 },
    card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' },
    row:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    label: { fontSize: '11px', fontWeight: '600', color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
    val:   { fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)', fontWeight: '500' },
    input: { width: '100%', padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--plat)', fontSize: '15px', fontFamily: 'IBM Plex Mono, monospace', outline: 'none', marginBottom: '10px' },
    btn:   { width: '100%', padding: '13px', borderRadius: '12px', fontSize: '14px', fontWeight: '700', border: 'none', cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.04em' },
  }

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--white)', marginBottom: '6px' }}>Liquidity Pool</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Deposit tokens to earn fees from every slot transaction</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total Pool Value', value: `${totalPoolUSD.toLocaleString()} tokens` },
          { label: 'My Deposits',      value: `${myLpUSD.toFixed(4)} tokens` },
          { label: 'Fee Share',        value: '40% of fees' },
          { label: 'Fee Rate',         value: '0.20% per slot' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, marginBottom: 0, textAlign: 'center', padding: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Token selector tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {SUPPORTED_TOKENS.map(t => (
          <button key={t.symbol} onClick={() => setActiveToken(t)} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 12px', borderRadius: '10px', cursor: 'pointer',
            background: activeToken.symbol === t.symbol ? 'rgba(0,255,135,0.08)' : 'var(--card)',
            border: `1px solid ${activeToken.symbol === t.symbol ? 'rgba(0,255,135,0.3)' : 'var(--border)'}`,
            color: activeToken.symbol === t.symbol ? 'var(--green)' : 'var(--silver)',
            fontSize: '13px', fontWeight: '700', transition: 'all 0.2s',
          }}>
            <Logo t={t} size={16} />
            {t.symbol}
          </button>
        ))}
      </div>

      {/* Active token card */}
      {(() => {
        const t   = activeToken
        const sym = t.symbol
        return (
          <div style={S.card}>
            {/* Token header */}
            <div style={{ ...S.row, marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Logo t={t} size={36} />
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--white)' }}>{sym}</div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{t.name}</div>
                </div>
              </div>
              {parseFloat(rewards[sym] || 0) > 0 && (
                <button onClick={() => handleClaim(t)} disabled={loading[`claim_${sym}`]} style={{ padding: '7px 14px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '8px', color: 'var(--green)', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>
                  {loading[`claim_${sym}`] ? 'Claiming…' : `Claim ${rewards[sym]} ${sym}`}
                </button>
              )}
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
              {[
                { label: 'Wallet',      value: `${balances[sym] || '0'} ${sym}` },
                { label: 'My Deposit',  value: `${lpBals[sym]   || '0'} ${sym}` },
                { label: 'Pool Total',  value: `${poolBals[sym] || '0'} ${sym}` },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px', background: 'var(--bg2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '6px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</div>
                  <div style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)', fontWeight: '500', wordBreak: 'break-all' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Pending reward */}
            {parseFloat(rewards[sym] || 0) > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.1)', borderRadius: '10px', marginBottom: '16px', ...S.row }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Pending reward</span>
                <span style={{ fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--green)', fontWeight: '700' }}>{rewards[sym]} {sym}</span>
              </div>
            )}

            {/* Deposit / Withdraw tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: 'var(--bg2)', padding: '4px', borderRadius: '10px' }}>
              {['deposit', 'withdraw'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
                  border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                  background: activeTab === tab ? 'var(--card)' : 'transparent',
                  color: activeTab === tab ? 'var(--white)' : 'var(--muted)',
                  textTransform: 'capitalize',
                }}>
                  {tab}
                </button>
              ))}
            </div>

            {/* Amount input */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <input
                type="number"
                placeholder="0.00"
                value={amounts[sym] || ''}
                onChange={e => setAmounts(p => ({...p, [sym]: e.target.value}))}
                style={S.input}
              />
              <button
                onClick={() => setAmounts(p => ({...p, [sym]: activeTab === 'deposit' ? (balances[sym] || '0') : (lpBals[sym] || '0')}))}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--green)', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' }}>
                MAX
              </button>
            </div>

            {/* Error */}
            {error[sym] && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--red)' }}>
                {error[sym]}
              </div>
            )}

            {/* Success */}
            {txHash[sym] && (
              <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--green)' }}>
                ✅ Done!{' '}
                <a href={`https://sepolia.basescan.org/tx/${txHash[sym]}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View ↗</a>
              </div>
            )}

            {/* Action button */}
            {!walletAddr ? (
              <button onClick={onConnect} style={{ ...S.btn, background: 'var(--plat)', color: 'var(--bg)' }}>
                Connect Wallet
              </button>
            ) : (
              <button
                onClick={() => activeTab === 'deposit' ? handleDeposit(t) : handleWithdraw(t)}
                disabled={loading[sym]}
                style={{
                  ...S.btn,
                  background: loading[sym] ? 'rgba(255,255,255,0.04)' : activeTab === 'deposit' ? 'var(--plat)' : 'rgba(255,68,68,0.1)',
                  color: loading[sym] ? 'var(--muted)' : activeTab === 'deposit' ? 'var(--bg)' : 'var(--red)',
                  border: activeTab === 'withdraw' ? '1px solid rgba(255,68,68,0.2)' : 'none',
                  cursor: loading[sym] ? 'not-allowed' : 'pointer',
                }}>
                {loading[sym] === 'deposit'  ? 'Depositing…'  :
                 loading[sym] === 'withdraw' ? 'Withdrawing…' :
                 activeTab === 'deposit' ? `Deposit ${sym}` : `Withdraw ${sym}`}
              </button>
            )}
          </div>
        )
      })()}

      {/* All pools overview */}
      <div style={S.card}>
        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--silver)', marginBottom: '16px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>All Pools</div>
        {SUPPORTED_TOKENS.map((t, i) => (
          <div key={t.symbol} onClick={() => setActiveToken(t)} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 0',
            borderBottom: i < SUPPORTED_TOKENS.length - 1 ? '1px solid var(--border)' : 'none',
            cursor: 'pointer',
          }}>
            <Logo t={t} size={28} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--white)' }}>{t.symbol}</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>{t.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)' }}>{poolBals[t.symbol] || '0'}</div>
              <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>pool balance</div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>›</div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div style={{ padding: '16px', background: 'rgba(0,255,135,0.03)', border: '1px solid rgba(0,255,135,0.08)', borderRadius: '12px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7' }}>
        <span style={{ color: 'var(--green)', fontWeight: '700' }}>How it works</span> — Deposit tokens to provide liquidity for slots. Earn <strong style={{ color: 'var(--plat)' }}>40%</strong> of all protocol fees proportional to your share. Withdraw anytime with no lock-up period.
      </div>
    </div>
  )
}