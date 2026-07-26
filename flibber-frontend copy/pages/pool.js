import { useState, useEffect } from 'react'
import { CONTRACTS, POOL_ABI, FIB_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

export default function PoolPage({ account, provider }) {
  const [token,    setToken]    = useState(SUPPORTED_TOKENS[0])
  const [amount,   setAmount]   = useState('')
  const [action,   setAction]   = useState('deposit')
  const [loading,  setLoading]  = useState(false)
  const [txHash,   setTxHash]   = useState(null)
  const [error,    setError]    = useState(null)
  const [poolData, setPoolData] = useState({})
  const [lpData,   setLpData]   = useState({})

  useEffect(() => { if (provider) loadData() }, [provider, account])

  const loadData = async () => {
    try {
      const { ethers } = await import('ethers')
      const pool = new ethers.Contract(CONTRACTS.liquidityPool, POOL_ABI, provider)
      const pd = {}; const ld = {}
      for (const t of SUPPORTED_TOKENS) {
        pd[t.symbol] = parseFloat(ethers.formatUnits(await pool.getPoolBalance(t.address), t.decimals)).toFixed(2)
        if (account) {
          ld[t.symbol] = {
            deposited: parseFloat(ethers.formatUnits(await pool.getLPBalance(account, t.address), t.decimals)).toFixed(4),
            pending:   parseFloat(ethers.formatUnits(await pool.getPendingReward(account, t.address), t.decimals)).toFixed(6),
          }
        }
      }
      setPoolData(pd); setLpData(ld)
    } catch(e) { console.error(e) }
  }

  const handleAction = async () => {
    if (!account || !amount) return
    setLoading(true); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const amt = ethers.parseUnits(amount, token.decimals)
      const pool = new ethers.Contract(CONTRACTS.liquidityPool, POOL_ABI, signer)

      if (action === 'deposit') {
        const tc = new ethers.Contract(token.address, FIB_ABI, signer)
        const al = await tc.allowance(account, CONTRACTS.liquidityPool)
        if (al < amt) { const tx = await tc.approve(CONTRACTS.liquidityPool, amt); await tx.wait() }
        const tx = await pool.deposit(token.address, amt)
        setTxHash((await tx.wait()).hash)
      } else if (action === 'withdraw') {
        const tx = await pool.withdraw(token.address, amt)
        setTxHash((await tx.wait()).hash)
      } else {
        const tx = await pool.claimReward(token.address)
        setTxHash((await tx.wait()).hash)
      }
      setAmount(''); loadData()
    } catch(e) { setError(e.reason || e.message) }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 1 }}>
      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>Liquidity Pool</h1>
      <p style={{ color: '#7A95AE', marginBottom: '32px' }}>Deposit assets to earn 40% of all protocol fees</p>

      {/* Pool stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        {SUPPORTED_TOKENS.map(t => (
          <div key={t.symbol} style={{
            padding: '20px', borderRadius: '16px',
            background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36'
          }}>
            <div style={{ fontSize: '13px', color: '#7A95AE', marginBottom: '8px' }}>{t.symbol} Pool Depth</div>
            <div style={{ fontSize: '24px', fontWeight: '800', color: '#00FF87', fontFamily: 'Space Mono, monospace' }}>
              {poolData[t.symbol] || '0'}
            </div>
            {account && lpData[t.symbol] && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #1E2A36' }}>
                <div style={{ fontSize: '12px', color: '#7A95AE' }}>Your deposit</div>
                <div style={{ fontSize: '14px', fontWeight: '700', fontFamily: 'Space Mono, monospace' }}>{lpData[t.symbol].deposited}</div>
                <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '4px' }}>Pending reward</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#00FF87', fontFamily: 'Space Mono, monospace' }}>{lpData[t.symbol].pending}</div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action card */}
      <div style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', borderRadius: '20px', padding: '28px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
          {['deposit', 'withdraw', 'claim'].map(a => (
            <button key={a} onClick={() => setAction(a)} style={{
              padding: '8px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
              border: 'none', cursor: 'pointer', textTransform: 'capitalize',
              background: action === a ? 'rgba(0,255,135,0.1)' : 'transparent',
              color: action === a ? '#00FF87' : '#7A95AE',
              transition: 'all 0.2s'
            }}>{a}</button>
          ))}
        </div>

        {/* Token selector */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {SUPPORTED_TOKENS.map(t => (
            <button key={t.symbol} onClick={() => setToken(t)} style={{
              flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid',
              borderColor: token.symbol === t.symbol ? '#00FF87' : '#1E2A36',
              background: token.symbol === t.symbol ? 'rgba(0,255,135,0.08)' : 'transparent',
              color: token.symbol === t.symbol ? '#00FF87' : '#7A95AE',
              cursor: 'pointer', fontWeight: '700', fontSize: '14px'
            }}>{t.symbol}</button>
          ))}
        </div>

        {action !== 'claim' && (
          <input
            type="number" placeholder="0.00" value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              width: '100%', padding: '16px', borderRadius: '12px', marginBottom: '16px',
              background: '#131920', border: '1px solid #1E2A36', color: '#E8F0F8',
              fontSize: '20px', fontWeight: '700', outline: 'none', fontFamily: 'Space Mono, monospace'
            }}
          />
        )}

        {error && <div style={{ padding: '12px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#FF4444' }}>{error}</div>}
        {txHash && <div style={{ padding: '12px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#00FF87' }}>✅ Success! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#00FF87' }}>View ↗</a></div>}

        <button onClick={handleAction} style={{
          width: '100%', padding: '16px', borderRadius: '14px', fontSize: '15px', fontWeight: '800',
          border: 'none', cursor: 'pointer', textTransform: 'capitalize',
          background: 'linear-gradient(135deg, #00FF87, #00CC6A)', color: '#080B0F'
        }}>
          {loading ? <span className="spinner" style={{ borderTopColor: '#080B0F' }} /> : `${action} ${token.symbol}`}
        </button>
      </div>
    </div>
  )
}
