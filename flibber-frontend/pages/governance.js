import { useState, useEffect } from 'react'
import { CONTRACTS, GOVERNANCE_ABI, STAKING_ABI } from '../lib/contracts'

export default function GovernancePage({ account, provider }) {
  const [proposals,    setProposals]    = useState([])
  const [loading,      setLoading]      = useState(false)
  const [votingPower,  setVotingPower]  = useState('0')
  const [showForm,     setShowForm]     = useState(false)
  const [description,  setDescription]  = useState('')
  const [txHash,       setTxHash]       = useState(null)
  const [error,        setError]        = useState(null)

  useEffect(() => { if (provider) loadData() }, [provider, account])

  const loadData = async () => {
    try {
      const { ethers } = await import('ethers')
      const gov = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, provider)
      const count = Number(await gov.proposalCount())
      const props = []
      for (let i = count; i >= Math.max(1, count - 9); i--) {
        try {
          const p = await gov.getProposal(i)
          const voted = account ? await gov.hasVoted(i, account) : false
          props.push({
            id: Number(p.id), description: p.description,
            forVotes: parseFloat(ethers.formatEther(p.forVotes)).toFixed(2),
            againstVotes: parseFloat(ethers.formatEther(p.againstVotes)).toFixed(2),
            state: Number(p.state), endTime: Number(p.endTime),
            proposer: p.proposer, voted,
          })
        } catch(e) {}
      }
      setProposals(props)
      if (account) {
        const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI, provider)
        const vp = await staking.votingPower(account)
        setVotingPower(parseFloat(ethers.formatEther(vp)).toFixed(2))
      }
    } catch(e) { console.error(e) }
  }

  const vote = async (proposalId, support) => {
    if (!account) return
    setLoading(true); setError(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const gov = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, signer)
      const tx = await gov.castVote(proposalId, support)
      setTxHash((await tx.wait()).hash)
      loadData()
    } catch(e) { setError(e.reason || e.message) }
    setLoading(false)
  }

  const propose = async () => {
    if (!account || !description) return
    setLoading(true); setError(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const gov = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, signer)
      const tx = await gov.propose(description, CONTRACTS.governance, '0x')
      setTxHash((await tx.wait()).hash)
      setDescription(''); setShowForm(false)
      loadData()
    } catch(e) { setError(e.reason || e.message) }
    setLoading(false)
  }

  const stateLabel = (s) => ['Active','Passed','Failed','Executed','Cancelled'][s] || 'Unknown'
  const stateColor = (s) => ({ 0:'#00FF87', 1:'#0EA5E9', 2:'#FF4444', 3:'#7A95AE', 4:'#3D5468' })[s] || '#7A95AE'

  const timeLeft = (end) => {
    const diff = end - Date.now() / 1000
    if (diff <= 0) return 'Ended'
    const days = Math.floor(diff / 86400)
    const hours = Math.floor((diff % 86400) / 3600)
    return days > 0 ? `${days}d ${hours}h left` : `${hours}h left`
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: '800', marginBottom: '8px' }}>Governance</h1>
          <p style={{ color: '#7A95AE' }}>1 staked FIB = 1 vote. Shape the future of FLIBBER.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#7A95AE' }}>Your Voting Power</div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#00FF87', fontFamily: 'Space Mono, monospace' }}>{votingPower} FIB</div>
          <button onClick={() => setShowForm(!showForm)} style={{
            marginTop: '8px', padding: '8px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '700',
            background: 'rgba(0,255,135,0.1)', border: '1px solid rgba(0,255,135,0.3)',
            color: '#00FF87', cursor: 'pointer'
          }}>+ New Proposal</button>
        </div>
      </div>

      {/* New proposal form */}
      {showForm && (
        <div style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '16px', padding: '24px', marginBottom: '24px' }}>
          <h3 style={{ marginBottom: '16px', color: '#00FF87' }}>Create Proposal</h3>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Describe your proposal... e.g. 'Reduce fee rate from 0.20% to 0.15%'"
            rows={4}
            style={{
              width: '100%', padding: '14px', borderRadius: '10px',
              background: '#131920', border: '1px solid #1E2A36', color: '#E8F0F8',
              fontSize: '14px', outline: 'none', resize: 'vertical', marginBottom: '16px',
              fontFamily: 'Syne, sans-serif'
            }}
          />
          {error && <div style={{ padding: '10px', background: 'rgba(255,68,68,0.08)', borderRadius: '8px', marginBottom: '12px', fontSize: '13px', color: '#FF4444' }}>{error}</div>}
          <button onClick={propose} style={{
            padding: '12px 24px', borderRadius: '10px', fontWeight: '700', fontSize: '14px',
            background: 'linear-gradient(135deg, #00FF87, #00CC6A)', border: 'none', color: '#080B0F', cursor: 'pointer'
          }}>
            {loading ? <span className="spinner" style={{ borderTopColor: '#080B0F' }} /> : 'Submit Proposal'}
          </button>
        </div>
      )}

      {txHash && (
        <div style={{ padding: '12px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', color: '#00FF87' }}>
          ✅ Transaction confirmed! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#00FF87' }}>View ↗</a>
        </div>
      )}

      {/* Proposals */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {proposals.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#7A95AE', background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', borderRadius: '16px' }}>
            No proposals yet. Be the first to propose a change.
          </div>
        )}
        {proposals.map(p => {
          const total = parseFloat(p.forVotes) + parseFloat(p.againstVotes)
          const forPct = total > 0 ? (parseFloat(p.forVotes) / total * 100).toFixed(1) : 0
          return (
            <div key={p.id} style={{ background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', borderRadius: '16px', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontFamily: 'Space Mono, monospace', color: '#7A95AE' }}>#{p.id}</span>
                    <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', background: `${stateColor(p.state)}20`, color: stateColor(p.state), fontWeight: '700' }}>{stateLabel(p.state)}</span>
                    {p.state === 0 && <span style={{ fontSize: '12px', color: '#7A95AE' }}>{timeLeft(p.endTime)}</span>}
                  </div>
                  <p style={{ fontSize: '15px', fontWeight: '600', lineHeight: '1.5' }}>{p.description}</p>
                  <p style={{ fontSize: '12px', color: '#7A95AE', marginTop: '6px', fontFamily: 'Space Mono, monospace' }}>
                    by {p.proposer.slice(0,8)}...
                  </p>
                </div>
              </div>

              {/* Vote bar */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                  <span style={{ color: '#00FF87' }}>For: {p.forVotes} FIB ({forPct}%)</span>
                  <span style={{ color: '#FF4444' }}>Against: {p.againstVotes} FIB</span>
                </div>
                <div style={{ height: '6px', borderRadius: '3px', background: '#1E2A36', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${forPct}%`, background: 'linear-gradient(90deg, #00FF87, #00CC6A)', borderRadius: '3px', transition: 'width 0.5s' }} />
                </div>
              </div>

              {/* Vote buttons */}
              {p.state === 0 && !p.voted && account && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => vote(p.id, true)} style={{
                    flex: 1, padding: '10px', borderRadius: '10px', fontWeight: '700', fontSize: '14px',
                    background: 'rgba(0,255,135,0.1)', border: '1px solid rgba(0,255,135,0.3)',
                    color: '#00FF87', cursor: 'pointer'
                  }}>✓ Vote For</button>
                  <button onClick={() => vote(p.id, false)} style={{
                    flex: 1, padding: '10px', borderRadius: '10px', fontWeight: '700', fontSize: '14px',
                    background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)',
                    color: '#FF4444', cursor: 'pointer'
                  }}>✗ Vote Against</button>
                </div>
              )}
              {p.voted && <div style={{ fontSize: '13px', color: '#7A95AE', textAlign: 'center' }}>You have voted on this proposal</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
