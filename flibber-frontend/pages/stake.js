import { useState, useEffect } from 'react'
import { CONTRACTS, STAKING_ABI, FIB_ABI } from '../lib/contracts'

export default function StakePage({ account, provider, onConnect }) {
  const [walletAddr,    setWalletAddr]    = useState(null)
  const [fibBal,        setFibBal]        = useState('0')
  const [stakeInfo,     setStakeInfo]     = useState(null)
  const [totalStaked,   setTotalStaked]   = useState('0')
  const [pendingReward, setPendingReward] = useState('0')
  const [votingPower,   setVotingPower]   = useState('0')
  const [stakeAmt,      setStakeAmt]      = useState('')
  const [unstakeAmt,    setUnstakeAmt]    = useState('')
  const [loading,       setLoading]       = useState('')
  const [txHash,        setTxHash]        = useState(null)
  const [error,         setError]         = useState(null)
  const [activeTab,     setActiveTab]     = useState('stake')

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
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, provider)
      const fib     = new ethers.Contract(CONTRACTS.fibToken,   FIB_ABI,     provider)

      const [bal, si, ts, pr, vp] = await Promise.all([
        fib.balanceOf(addr),
        staking.getStakeInfo(addr),
        staking.totalStaked(),
        staking.pendingReward(addr),
        staking.votingPower(addr),
      ])

      setFibBal(parseFloat(ethers.formatEther(bal)).toFixed(4))
      setStakeInfo(si)
      setTotalStaked(parseFloat(ethers.formatEther(ts)).toLocaleString())
      setPendingReward(parseFloat(ethers.formatEther(pr)).toFixed(6))
      setVotingPower(parseFloat(ethers.formatEther(vp)).toFixed(4))
    } catch(e) { console.error(e) }
  }

  const handleStake = async () => {
    if (!stakeAmt || parseFloat(stakeAmt) <= 0) return setError('Enter an amount to stake')
    setLoading('stake'); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer  = await provider.getSigner()
      const amt     = ethers.parseEther(stakeAmt)
      const fib     = new ethers.Contract(CONTRACTS.fibToken,   FIB_ABI,     signer)
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, signer)
      const allow   = await fib.allowance(walletAddr, CONTRACTS.fibStaking)
      if (BigInt(allow.toString()) < BigInt(amt.toString()))
        await (await fib.approve(CONTRACTS.fibStaking, ethers.MaxUint256)).wait()
      const tx = await staking.stake(amt)
      const rc = await tx.wait()
      setTxHash(rc.hash); setStakeAmt('')
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Stake failed') }
    setLoading('')
  }

  const handleRequestUnstake = async () => {
    if (!unstakeAmt || parseFloat(unstakeAmt) <= 0) return setError('Enter an amount to unstake')
    setLoading('unstake'); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer  = await provider.getSigner()
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, signer)
      const tx      = await staking.requestUnstake(ethers.parseEther(unstakeAmt))
      const rc      = await tx.wait()
      setTxHash(rc.hash); setUnstakeAmt('')
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Unstake request failed') }
    setLoading('')
  }

  const handleUnstake = async () => {
    setLoading('claim_unstake'); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer  = await provider.getSigner()
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, signer)
      const tx      = await staking.unstake()
      const rc      = await tx.wait()
      setTxHash(rc.hash)
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Unstake failed') }
    setLoading('')
  }

  const handleClaimReward = async () => {
    setLoading('claim'); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer  = await provider.getSigner()
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, signer)
      const tx      = await staking.claimReward()
      const rc      = await tx.wait()
      setTxHash(rc.hash)
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Claim failed') }
    setLoading('')
  }

  const stakedAmt     = stakeInfo ? parseFloat(stakeInfo.amount?.toString() / 1e18).toFixed(4) : '0'
  const unstakeAmt2   = stakeInfo ? parseFloat(stakeInfo.unstakeAmount?.toString() / 1e18).toFixed(4) : '0'
  const unstakeTime   = stakeInfo?.unstakeRequestTime ? Number(stakeInfo.unstakeRequestTime) : 0
  const canUnstake    = unstakeTime > 0 && Date.now() / 1000 > unstakeTime + 86400
  const unstakeReady  = unstakeTime > 0 && !canUnstake
  const timeLeft      = unstakeTime > 0 ? Math.max(0, (unstakeTime + 86400) - Date.now() / 1000) : 0
  const hoursLeft     = Math.floor(timeLeft / 3600)
  const minsLeft      = Math.floor((timeLeft % 3600) / 60)

  const S = {
    page:  { minHeight: 'calc(100vh - 64px)', padding: '32px 16px 40px', maxWidth: '560px', margin: '0 auto', position: 'relative', zIndex: 1 },
    card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '16px' },
    row:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    label: { fontSize: '10px', fontWeight: '600', color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
    val:   { fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)', fontWeight: '500' },
    input: { width: '100%', padding: '12px 50px 12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--plat)', fontSize: '15px', fontFamily: 'IBM Plex Mono, monospace', outline: 'none' },
    btn:   { width: '100%', padding: '14px', borderRadius: '12px', fontSize: '14px', fontWeight: '800', border: 'none', cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.04em', marginTop: '10px' },
  }

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--white)', marginBottom: '6px' }}>Stake $FIB</h1>
        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Stake FIB to earn 40% of all protocol fees and gain voting power</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Total Staked',    value: `${totalStaked} FIB`,    color: 'var(--green)' },
          { label: 'My Staked',       value: `${stakedAmt} FIB`,      color: 'var(--plat)'  },
          { label: 'Pending Rewards', value: `${pendingReward} FIB`,  color: 'var(--green)' },
          { label: 'Voting Power',    value: `${votingPower} FIB`,    color: 'var(--blue)'  },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, marginBottom: 0, padding: '16px' }}>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '8px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: s.color, fontFamily: 'IBM Plex Mono, monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Wallet balance */}
      <div style={{ ...S.card, ...S.row, padding: '14px 20px' }}>
        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Wallet balance</span>
        <span style={{ fontSize: '14px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)', fontWeight: '600' }}>{fibBal} FIB</span>
      </div>

      {/* Pending reward claim */}
      {parseFloat(pendingReward) > 0 && (
        <div style={{ ...S.card, padding: '14px 20px', ...S.row, background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.15)' }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Claimable rewards</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace' }}>{pendingReward} FIB</div>
          </div>
          <button onClick={handleClaimReward} disabled={loading === 'claim'} style={{ padding: '9px 18px', background: 'rgba(0,255,135,0.1)', border: '1px solid rgba(0,255,135,0.3)', borderRadius: '10px', color: 'var(--green)', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            {loading === 'claim' ? 'Claiming…' : 'Claim FIB'}
          </button>
        </div>
      )}

      {/* Unstake ready */}
      {canUnstake && parseFloat(unstakeAmt2) > 0 && (
        <div style={{ ...S.card, padding: '14px 20px', background: 'rgba(14,165,233,0.04)', border: '1px solid rgba(14,165,233,0.2)', ...S.row }}>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>Ready to withdraw</div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--blue)', fontFamily: 'IBM Plex Mono, monospace' }}>{unstakeAmt2} FIB</div>
          </div>
          <button onClick={handleUnstake} disabled={loading === 'claim_unstake'} style={{ padding: '9px 18px', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: '10px', color: 'var(--blue)', fontSize: '13px', fontWeight: '700', cursor: 'pointer' }}>
            {loading === 'claim_unstake' ? 'Withdrawing…' : 'Withdraw FIB'}
          </button>
        </div>
      )}

      {/* Unstake pending */}
      {unstakeReady && (
        <div style={{ ...S.card, padding: '14px 20px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.2)' }}>
          <div style={{ fontSize: '11px', color: '#EAB308', fontWeight: '700', marginBottom: '4px' }}>⏳ Unstake pending</div>
          <div style={{ fontSize: '13px', color: 'var(--silver)' }}>
            {unstakeAmt2} FIB ready in <span style={{ color: 'var(--plat)', fontFamily: 'IBM Plex Mono, monospace' }}>{hoursLeft}h {minsLeft}m</span>
          </div>
        </div>
      )}

      {/* Main card */}
      <div style={S.card}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', background: 'var(--bg2)', padding: '4px', borderRadius: '10px' }}>
          {['stake', 'unstake'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              flex: 1, padding: '9px', borderRadius: '8px', fontSize: '13px', fontWeight: '700',
              border: 'none', cursor: 'pointer', transition: 'all 0.2s', textTransform: 'capitalize',
              background: activeTab === tab ? 'var(--card)' : 'transparent',
              color: activeTab === tab ? 'var(--white)' : 'var(--muted)',
            }}>{tab}</button>
          ))}
        </div>

        {activeTab === 'stake' ? (
          <>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount to stake</div>
            <div style={{ position: 'relative', marginBottom: '6px' }}>
              <input type="number" placeholder="0.00" value={stakeAmt} onChange={e => setStakeAmt(e.target.value)} style={S.input} />
              <button onClick={() => setStakeAmt(fibBal)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--green)', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' }}>MAX</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
              Available: <span style={{ color: 'var(--plat)', fontFamily: 'IBM Plex Mono, monospace' }}>{fibBal} FIB</span>
            </div>

            {/* Rewards info */}
            <div style={{ padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '16px' }}>
              {[
                ['Fee share', '40% of all protocol fees'],
                ['Distribution', 'Proportional to your stake'],
                ['Lock period', 'None — request unstake anytime'],
                ['Unstake delay', '24 hour cooldown'],
              ].map(([k, v]) => (
                <div key={k} style={{ ...S.row, marginBottom: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>{k}</span>
                  <span style={{ fontSize: '12px', color: 'var(--silver)', fontFamily: 'IBM Plex Mono, monospace' }}>{v}</span>
                </div>
              ))}
            </div>

            {error && <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
            {txHash && <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--green)' }}>✅ Staked! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View ↗</a></div>}

            {!walletAddr ? (
              <button onClick={onConnect} style={{ ...S.btn, background: 'var(--plat)', color: 'var(--bg)' }}>Connect Wallet</button>
            ) : (
              <button onClick={handleStake} disabled={!!loading} style={{ ...S.btn, background: loading ? 'rgba(255,255,255,0.04)' : 'var(--plat)', color: loading ? 'var(--muted)' : 'var(--bg)', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading === 'stake' ? 'Staking…' : 'Stake FIB'}
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount to unstake</div>
            <div style={{ position: 'relative', marginBottom: '6px' }}>
              <input type="number" placeholder="0.00" value={unstakeAmt} onChange={e => setUnstakeAmt(e.target.value)} style={S.input} />
              <button onClick={() => setUnstakeAmt(stakedAmt)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--green)', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'IBM Plex Mono, monospace' }}>MAX</button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginBottom: '16px' }}>
              Staked: <span style={{ color: 'var(--plat)', fontFamily: 'IBM Plex Mono, monospace' }}>{stakedAmt} FIB</span>
            </div>

            <div style={{ padding: '10px 14px', background: 'rgba(234,179,8,0.04)', border: '1px solid rgba(234,179,8,0.15)', borderRadius: '10px', marginBottom: '16px', fontSize: '12px', color: '#EAB308', lineHeight: '1.6' }}>
              ⚠️ Unstaking requires a <strong>24 hour cooldown</strong> period before tokens can be withdrawn.
            </div>

            {error && <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
            {txHash && <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--green)' }}>✅ Unstake requested! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View ↗</a></div>}

            {!walletAddr ? (
              <button onClick={onConnect} style={{ ...S.btn, background: 'var(--plat)', color: 'var(--bg)' }}>Connect Wallet</button>
            ) : (
              <button onClick={handleRequestUnstake} disabled={!!loading} style={{ ...S.btn, background: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,68,68,0.08)', color: loading ? 'var(--muted)' : 'var(--red)', border: '1px solid rgba(255,68,68,0.2)', cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading === 'unstake' ? 'Requesting…' : 'Request Unstake'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '16px', background: 'rgba(0,255,135,0.03)', border: '1px solid rgba(0,255,135,0.08)', borderRadius: '12px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7' }}>
        <span style={{ color: 'var(--green)', fontWeight: '700' }}>Fee distribution</span> — Every slot charges a 0.20% fee in $FIB. Of that, <strong style={{ color: 'var(--plat)' }}>40% goes to stakers</strong>, 40% to treasury, and 20% is burned permanently — making FIB deflationary over time.
      </div>
    </div>
  )
}