import { useState, useEffect } from 'react'
import { CONTRACTS, GOVERNANCE_ABI, STAKING_ABI, FIB_ABI } from '../lib/contracts'

const PROPOSAL_STATES = {
  0: { label: 'Active',   color: '#00FF87' },
  1: { label: 'Passed',   color: '#0EA5E9' },
  2: { label: 'Failed',   color: '#FF4444' },
  3: { label: 'Executed', color: '#B8BEC8' },
}

export default function GovernancePage({ account, provider, onConnect }) {
  const [walletAddr,    setWalletAddr]    = useState(null)
  const [proposals,     setProposals]     = useState([])
  const [votingPower,   setVotingPower]   = useState('0')
  const [loading,       setLoading]       = useState(false)
  const [voting,        setVoting]        = useState(null)
  const [finalizing,    setFinalizing]    = useState(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [expanded,      setExpanded]      = useState(null)
  const [creating,      setCreating]      = useState(false)
  const [txHash,        setTxHash]        = useState(null)
  const [error,         setError]         = useState(null)
  const [form,          setForm]          = useState({ title: '', description: '', target: '', calldata: '0x' })

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
    setLoading(true)
    try {
      const { ethers } = await import('ethers')
      const gov     = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, provider)
      const staking = new ethers.Contract(CONTRACTS.fibStaking, STAKING_ABI,    provider)

      const vp    = await staking.votingPower(addr)
      setVotingPower(parseFloat(ethers.formatEther(vp)).toFixed(4))

      const count = await gov.proposalCount()
      const props = []
      for (let i = Number(count); i >= Math.max(1, Number(count) - 19); i--) {
        try {
          const p      = await gov.proposals(i)
          const voted  = await gov.hasVoted(i, addr)
          props.push({ id: i, ...p, voted })
        } catch(e) {}
      }
      setProposals(props)
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const handleVote = async (proposalId, support) => {
    setVoting(`${proposalId}-${support}`); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const gov    = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, signer)
      const tx     = await gov.castVote(proposalId, support)
      const rc     = await tx.wait()
      setTxHash(rc.hash)
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Vote failed') }
    setVoting(null)
  }

  const handleFinalize = async (proposalId) => {
    setFinalizing(proposalId); setError(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const gov    = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, signer)
      const tx     = await gov.finalizeProposal(proposalId)
      await tx.wait()
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Finalize failed') }
    setFinalizing(null)
  }

  const handleCreate = async () => {
    if (!form.title || !form.target) return setError('Title and target address are required')
    setCreating(true); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const gov    = new ethers.Contract(CONTRACTS.governance, GOVERNANCE_ABI, signer)
      const tx     = await gov.propose(form.title, form.target, form.calldata || '0x')
      const rc     = await tx.wait()
      setTxHash(rc.hash)
      setShowCreate(false)
      setForm({ title: '', description: '', target: '', calldata: '0x' })
      setTimeout(() => loadData(walletAddr), 2000)
    } catch(e) { setError(e?.reason || e?.message || 'Create failed') }
    setCreating(false)
  }

  const fmtVotes = (v) => {
    try { return parseFloat(BigInt(v?.toString() || '0').toString() / 1e18).toFixed(2) } catch { return '0' }
  }

  const totalVotes = (p) => {
    try {
      const f = BigInt(p.forVotes?.toString() || '0')
      const a = BigInt(p.againstVotes?.toString() || '0')
      return f + a
    } catch { return 0n }
  }

  const forPct = (p) => {
    const t = totalVotes(p)
    if (t === 0n) return 0
    try { return Number((BigInt(p.forVotes?.toString() || '0') * 100n) / t) } catch { return 0 }
  }

  const S = {
    page:  { minHeight: 'calc(100vh - 64px)', padding: '32px 16px 40px', maxWidth: '680px', margin: '0 auto', position: 'relative', zIndex: 1 },
    card:  { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px', marginBottom: '12px' },
    row:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    input: { width: '100%', padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--plat)', fontSize: '14px', outline: 'none', marginBottom: '10px', fontFamily: 'Manrope, sans-serif' },
    btn:   { padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '700', border: 'none', cursor: 'pointer', transition: 'all 0.2s' },
  }

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={{ ...S.row, marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--white)', marginBottom: '4px' }}>Governance</h1>
          <p style={{ fontSize: '13px', color: 'var(--muted)' }}>Vote on protocol changes using your staked FIB</p>
        </div>
        {walletAddr && parseFloat(votingPower) > 0 && (
          <button onClick={() => setShowCreate(!showCreate)} style={{ ...S.btn, background: showCreate ? 'rgba(255,255,255,0.04)' : 'var(--plat)', color: showCreate ? 'var(--muted)' : 'var(--bg)', border: showCreate ? '1px solid var(--border)' : 'none' }}>
            {showCreate ? 'Cancel' : '+ New Proposal'}
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Proposals',    value: proposals.length },
          { label: 'Voting Power', value: `${votingPower} FIB` },
          { label: 'Quorum',       value: 'Stake FIB' },
        ].map(s => (
          <div key={s.label} style={{ ...S.card, marginBottom: 0, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '4px' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Create proposal form */}
      {showCreate && (
        <div style={{ ...S.card, background: 'rgba(0,255,135,0.03)', border: '1px solid rgba(0,255,135,0.15)', marginBottom: '20px' }}>
          <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--white)', marginBottom: '16px' }}>New Proposal</div>
          <input
            placeholder="Proposal title *"
            value={form.title}
            onChange={e => setForm(p => ({...p, title: e.target.value}))}
            style={S.input}
          />
          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={e => setForm(p => ({...p, description: e.target.value}))}
            rows={3}
            style={{ ...S.input, resize: 'vertical', fontFamily: 'Manrope, sans-serif' }}
          />
          <input
            placeholder="Target contract address *"
            value={form.target}
            onChange={e => setForm(p => ({...p, target: e.target.value}))}
            style={{ ...S.input, fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}
          />
          <input
            placeholder="Calldata (default: 0x)"
            value={form.calldata}
            onChange={e => setForm(p => ({...p, calldata: e.target.value}))}
            style={{ ...S.input, fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}
          />
          {error && <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>}
          {txHash && <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', marginBottom: '10px', fontSize: '12px', color: 'var(--green)' }}>✅ Proposal created! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View ↗</a></div>}
          <button onClick={handleCreate} disabled={creating} style={{ ...S.btn, background: creating ? 'rgba(255,255,255,0.04)' : 'var(--plat)', color: creating ? 'var(--muted)' : 'var(--bg)', width: '100%', padding: '13px', fontSize: '14px', fontWeight: '800' }}>
            {creating ? 'Creating…' : 'Submit Proposal'}
          </button>
        </div>
      )}

      {/* Not connected */}
      {!walletAddr && (
        <div style={{ ...S.card, textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>◐</div>
          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--white)', marginBottom: '8px' }}>Connect your wallet</div>
          <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '24px' }}>Stake FIB to gain voting power and participate in governance</div>
          <button onClick={onConnect} style={{ padding: '12px 28px', background: 'var(--plat)', border: 'none', borderRadius: '12px', color: 'var(--bg)', fontSize: '14px', fontWeight: '800', cursor: 'pointer' }}>Connect Wallet</button>
        </div>
      )}

      {/* Loading */}
      {walletAddr && loading && (
        <div style={{ ...S.card, textAlign: 'center', padding: '40px' }}>
          <div className="spinner" style={{ margin: '0 auto 12px', width: '22px', height: '22px' }} />
          <div style={{ fontSize: '13px', color: 'var(--muted)' }}>Loading proposals…</div>
        </div>
      )}

      {/* Proposals */}
      {walletAddr && !loading && (
        <>
          {proposals.length === 0 ? (
            <div style={{ ...S.card, textAlign: 'center', padding: '48px 24px' }}>
              <div style={{ fontSize: '36px', marginBottom: '16px' }}>◐</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--white)', marginBottom: '8px' }}>No proposals yet</div>
              <div style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {parseFloat(votingPower) > 0 ? 'Be the first to create a proposal above' : 'Stake FIB to gain voting power and create proposals'}
              </div>
            </div>
          ) : (
            proposals.map(p => {
              const state   = Number(p.state ?? 0)
              const pct     = forPct(p)
              const isOpen  = expanded === p.id
              const voted   = p.voted
              const stateInfo = PROPOSAL_STATES[state] || PROPOSAL_STATES[0]

              return (
                <div key={p.id} style={{ ...S.card, cursor: 'pointer', transition: 'border-color 0.2s', borderColor: isOpen ? 'rgba(255,255,255,0.1)' : 'var(--border)', padding: 0, overflow: 'hidden' }}
                  onClick={() => setExpanded(isOpen ? null : p.id)}>

                  {/* Proposal row */}
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ ...S.row, marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'IBM Plex Mono, monospace', flexShrink: 0 }}>#{p.id}</span>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--white)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.title || p.description || `Proposal #${p.id}`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                        <div style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', background: `${stateInfo.color}15`, color: stateInfo.color, border: `1px solid ${stateInfo.color}30` }}>
                          {stateInfo.label}
                        </div>
                        {voted && <div style={{ padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', background: 'rgba(14,165,233,0.1)', color: 'var(--blue)', border: '1px solid rgba(14,165,233,0.2)' }}>Voted</div>}
                        <span style={{ color: 'var(--muted)', fontSize: '12px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
                      </div>
                    </div>

                    {/* Vote progress bar */}
                    <div style={{ height: '4px', background: 'var(--bg2)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pct >= 50 ? 'var(--green)' : 'var(--red)', borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ ...S.row, marginTop: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--green)', fontFamily: 'IBM Plex Mono, monospace' }}>For: {fmtVotes(p.forVotes)} FIB ({pct}%)</span>
                      <span style={{ fontSize: '11px', color: 'var(--red)', fontFamily: 'IBM Plex Mono, monospace' }}>Against: {fmtVotes(p.againstVotes)} FIB</span>
                    </div>
                  </div>

                  {/* Expanded */}
                  {isOpen && (
                    <div style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      {p.description && (
                        <div style={{ padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', marginTop: '14px', marginBottom: '14px', fontSize: '13px', color: 'var(--silver)', lineHeight: '1.6' }}>
                          {p.description}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        {[
                          ['For votes',     `${fmtVotes(p.forVotes)} FIB`],
                          ['Against votes', `${fmtVotes(p.againstVotes)} FIB`],
                          ['Your power',    `${votingPower} FIB`],
                          ['Status',        stateInfo.label],
                        ].map(([k, v]) => (
                          <div key={k} style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                            <div style={{ fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)' }}>{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Vote buttons */}
                      {state === 0 && !voted && parseFloat(votingPower) > 0 && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                          <button
                            onClick={() => handleVote(p.id, true)}
                            disabled={!!voting}
                            style={{ flex: 1, padding: '11px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.25)', borderRadius: '10px', color: 'var(--green)', fontSize: '13px', fontWeight: '700', cursor: voting ? 'not-allowed' : 'pointer' }}>
                            {voting === `${p.id}-true` ? 'Voting…' : '✓ Vote For'}
                          </button>
                          <button
                            onClick={() => handleVote(p.id, false)}
                            disabled={!!voting}
                            style={{ flex: 1, padding: '11px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: '10px', color: 'var(--red)', fontSize: '13px', fontWeight: '700', cursor: voting ? 'not-allowed' : 'pointer' }}>
                            {voting === `${p.id}-false` ? 'Voting…' : '✕ Vote Against'}
                          </button>
                        </div>
                      )}

                      {state === 0 && voted && (
                        <div style={{ padding: '10px 14px', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '10px', fontSize: '12px', color: 'var(--blue)', marginBottom: '10px' }}>
                          ✓ You have already voted on this proposal
                        </div>
                      )}

                      {state === 0 && !voted && parseFloat(votingPower) === 0 && (
                        <div style={{ padding: '10px 14px', background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: '10px', fontSize: '12px', color: '#EAB308', marginBottom: '10px' }}>
                          ⚠️ Stake FIB to gain voting power
                        </div>
                      )}

                      {state === 1 && (
                        <button
                          onClick={() => handleFinalize(p.id)}
                          disabled={finalizing === p.id}
                          style={{ width: '100%', padding: '11px', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)', borderRadius: '10px', color: 'var(--blue)', fontSize: '13px', fontWeight: '700', cursor: 'pointer', marginBottom: '10px' }}>
                          {finalizing === p.id ? 'Finalizing…' : 'Execute Proposal'}
                        </button>
                      )}

                      {txHash && (
                        <div style={{ padding: '10px 14px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '8px', fontSize: '12px', color: 'var(--green)' }}>
                          ✅ Done! <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline' }}>View ↗</a>
                        </div>
                      )}

                      {error && (
                        <div style={{ padding: '10px 14px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '8px', fontSize: '12px', color: 'var(--red)' }}>{error}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {/* Info */}
      <div style={{ padding: '16px', background: 'rgba(0,255,135,0.03)', border: '1px solid rgba(0,255,135,0.08)', borderRadius: '12px', marginTop: '8px', fontSize: '12px', color: 'var(--muted)', lineHeight: '1.7' }}>
        <span style={{ color: 'var(--green)', fontWeight: '700' }}>How governance works</span> — Stake $FIB to earn voting power. Create proposals to change protocol parameters. Proposals pass when For votes exceed Against votes. Passed proposals can be executed on-chain.
      </div>
    </div>
  )
}