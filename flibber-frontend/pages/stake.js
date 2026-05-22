import { useState, useEffect } from 'react'
import { CONTRACTS, STAKING_ABI, FIB_ABI } from '../lib/contracts'

export default function StakePage({ account, provider }) {
  const [amount,   setAmount]   = useState('')
  const [action,   setAction]   = useState('stake')
  const [loading,  setLoading]  = useState(false)
  const [txHash,   setTxHash]   = useState(null)
  const [error,    setError]    = useState(null)
  const [info,     setInfo]     = useState(null)
  const [total,    setTotal]    = useState('0')
  const [fibBal,   setFibBal]   = useState('0')

  useEffect(() => { if (provider && account) loadData() }, [provider, account])

  const loadData = async () => {
    try {
      const { ethers } = await import('ethers')
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, provider)
      const fib     = new ethers.Contract(CONTRACTS.fibToken,   FIB_ABI,     provider)
      const [si, ts, bal, pr] = await Promise.all([
        staking.getStakeInfo(account),
        staking.totalStaked(),
        fib.balanceOf(account),
        staking.pendingReward(account),
      ])
      setInfo({
        staked:           parseFloat(ethers.formatEther(si.amount)).toFixed(2),
        pending:          parseFloat(ethers.formatEther(pr)).toFixed(6),
        unstakeReqTime:   Number(si.unstakeRequestTime),
        unstakeAmount:    parseFloat(ethers.formatEther(si.unstakeAmount)).toFixed(2),
        votingPower:      parseFloat(ethers.formatEther(si.amount)).toFixed(2),
      })
      setTotal(parseFloat(ethers.formatEther(ts)).toFixed(2))
      setFibBal(parseFloat(ethers.formatEther(bal)).toFixed(4))
    } catch(e) { console.error(e) }
  }

  const handleAction = async () => {
    if (!account) return
    setLoading(true); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer  = await provider.getSigner()
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, signer)

      if (action === 'stake') {
        const amt = ethers.parseEther(amount)
        const fib = new ethers.Contract(CONTRACTS.fibToken, FIB_ABI, signer)
        const al  = await fib.allowance(account, CONTRACTS.fibStaking)
        if (al < amt) { const tx = await fib.approve(CONTRACTS.fibStaking, amt); await tx.wait() }
        setTxHash((await (await staking.stake(amt)).wait()).hash)
      } else if (action === 'unstake_request') {
        const amt = ethers.parseEther(amount)
        setTxHash((await (await staking.requestUnstake(amt)).wait()).hash)
      } else if (action === 'unstake') {
        setTxHash((await (await staking.unstake()).wait()).hash)
      } else if (action === 'claim') {
        setTxHash((await (await staking.claimReward()).wait()).hash)
      }
      setAmount(''); loadData()
    } catch(e) { setError(e.reason || e.message) }
    setLoading(false)
  }

  const cooldownDone = info && info.unstakeReqTime > 0 &&
    Date.now() / 1000 > info.unstakeReqTime + 7 * 86400

  const cooldownLeft = info && info.unstakeReqTime > 0 ? Math.max(0,
    Math.ceil((info.unstakeReqTime + 7 * 86400 - Date.now() / 1000) / 86400)) : 0

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 1 }}>
      <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>Stake $FIB</h1>
      <p style={{ color: '#7A95AE', marginBottom: '32px' }}>Stake FIB to earn 40% of all protocol fees + governance voting power</p>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px', marginBottom: '32px' }}>
        {[
          { label: 'Total Staked', value: `${total} FIB` },
          { label: 'Your Stake',   value: `${info?.staked || '0'} FIB` },
          { label: 'Voting Power', value: `${info?.votingPower || '0'} FIB` },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px', borderRadius: '16px', background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36' }}>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#00FF87', fontFamily: 'Space Mono, monospace', wordBreak: 'break-all' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Pending reward banner */}
      {info?.pending > 0 && (
        <div style={{
          padding: '16px 20px', borderRadius: '14px', marginBottom: '24px',
          background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: '#7A95AE' }}>Pending Rewards</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#00FF87', fontFamily: 'Space Mono, monospace' }}>{info.pending} FIB</div>
          </div>
          <button onClick={() => { setAction('claim'); handleAction() }} style={{
            padding: '10px 20px', borderRadius: '10px', background: 'rgba(0,255,135,0.1)',
            border: '1px solid rgba(0,255,135,0.3)', color: '#00FF87', cursor: 'pointer', fontWeight: '700'
          }}>Claim</button>
        </div>
      )}

      {/* Unstake pending banner */}
      {info?.unstakeReqTime > 0 && (
        <div style={{
          padding: '16px 20px', borderRadius: '14px', marginBottom: '24px',
          background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)',
        }}>
          <div style={{ fontSize: '13px', color: '#7A95AE' }}>Unstake Request Pending</div>
          <div style={{ fontSize: '16px', fontWeight: '700', marginTop: '4px' }}>{info.unstakeAmount} FIB</div>
          {cooldownDone
            ? <button onClick={() => { setAction('unstake'); handleAction() }} style={{ marginTop: '10px', padding: '8px 16px', borderRadius: '8px', background: '#0EA5E9', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: '700' }}>Complete Unstake</button>
            : <div style={{ fontSize: '13px', color: '#7A95AE', marginTop: '6px' }}>⏳ {cooldownLeft} days remaining in cooldown</div>
          }
        </div>
      )}

      {/* Action card */}
      <div style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', borderRadius: '20px', padding: '28px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { id: 'stake',           label: 'Stake' },
            { id: 'unstake_request', label: 'Request Unstake' },
            { id: 'claim',           label: 'Claim Rewards' },
          ].map(a => (
            <button key={a.id} onClick={() => setAction(a.id)} style={{
              padding: '8px 18px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
              border: 'none', cursor: 'pointer',
              background: action === a.id ? 'rgba(0,255,135,0.1)' : 'transparent',
              color: action === a.id ? '#00FF87' : '#7A95AE'
            }}>{a.label}</button>
          ))}
        </div>

        {action !== 'claim' && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: '#7A95AE' }}>Amount (FIB)</span>
              <span style={{ fontSize: '13px', color: '#7A95AE' }}>Balance: {fibBal}</span>
            </div>
            <input
              type="number" placeholder="0.00" value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{
                width: '100%', padding: '16px', borderRadius: '12px',
                background: '#131920', border: '1px solid #1E2A36', color: '#E8F0F8',
                fontSize: '20px', fontWeight: '700', outline: 'none', fontFamily: 'Space Mono, monospace'
              }}
            />
          </div>
        )}

        {action === 'stake' && (
          <div style={{ padding: '12px', background: 'rgba(0,255,135,0.04)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#7A95AE' }}>
            🔒 7 day cooldown to unstake. You earn 40% of all protocol fees while staked.
          </div>
        )}

        {error && <div style={{ padding: '12px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#FF4444' }}>{error}</div>}
        {txHash && <div style={{ padding: '12px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#00FF87' }}>✅ Done! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#00FF87' }}>View ↗</a></div>}

        <button onClick={handleAction} style={{
          width: '100%', padding: '16px', borderRadius: '14px', fontSize: '15px', fontWeight: '800',
          border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #00FF87, #00CC6A)', color: '#080B0F'
        }}>
          {loading ? <span className="spinner" style={{ borderTopColor: '#080B0F' }} /> : action === 'claim' ? 'Claim Rewards' : action === 'stake' ? 'Stake FIB' : 'Request Unstake'}
        </button>
      </div>
    </div>
  )
}
