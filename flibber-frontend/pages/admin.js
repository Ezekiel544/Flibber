import { useState, useEffect, useRef } from 'react'
import { CONTRACTS, FIB_ABI, STAKING_ABI, POOL_ABI, SLOTTING_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

const ADMIN_WALLETS = [
  "0xa388C71f0D69d33455cf25f6c71F7eA37f98745B",
  "0x35b634a3066562258564221b1c77a9228938aad5",
]

const FEE_ABI = [
  "function totalFeesCollected() view returns (uint256)",
  "function totalFeesBurned() view returns (uint256)",
  "function feeRateBps() view returns (uint256)",
]

const NAV_SECTIONS = [
  { id: 'overview',    label: 'Dashboard',           group: 'OVERVIEW' },
  { id: 'slots',       label: 'Slotting Operations', group: 'OPERATIONS' },
  { id: 'pools',       label: 'Pools',               group: 'OPERATIONS' },
  { id: 'users',       label: 'Users',               group: 'ACCOUNTS' },
  { id: 'treasury',    label: 'Treasury',            group: 'ACCOUNTS' },
  { id: 'contracts',   label: 'Contracts',           group: 'ENGINE' },
]

const STATUS_MAP = {
  0: { label: 'Pending',   bg: 'rgba(234,179,8,0.15)',  color: '#EAB308' },
  1: { label: 'Completed', bg: 'rgba(34,197,94,0.15)',  color: '#22C55E' },
  2: { label: 'Cancelled', bg: 'rgba(239,68,68,0.15)',  color: '#EF4444' },
  3: { label: 'Expired',   bg: 'rgba(107,114,128,0.15)',color: '#6B7280' },
}

const getTokenSymbol = (addr) => {
  if (!addr) return '?'
  const t = SUPPORTED_TOKENS.find(t => t.address?.toLowerCase() === addr.toLowerCase())
  return t?.symbol || addr.slice(0,6)+'...'
}

// Maps the raw ethers Result tuple returned by getSlot() to named fields.
// Spreading the raw tuple (`{ id, ...s }`) does not reliably produce named
// properties, so every field must be pulled out by index explicitly.
const parseSlot = (id, raw) => ({
  id,
  user:        raw[0],
  tokenIn:     raw[1],
  amountIn:    raw[2],
  tokenOut:    raw[3],
  amountOut:   raw[4],
  recipient:   raw[5],
  feeAmount:   raw[6],
  status:      Number(raw[7]),
  createdAt:   raw[8],
  filledAt:    raw[9],
  filledBy:    raw[10],
  destChainId: raw[11],
})

const formatAmt = (amt, addr) => {
  if (!amt) return '0.0000'
  try {
    const t = SUPPORTED_TOKENS.find(t => t.address?.toLowerCase() === addr?.toLowerCase())
    const dec = t?.decimals ?? 18
    const raw = typeof amt === 'bigint' ? amt : BigInt(amt.toString())
    const div = BigInt(10**dec)
    return `${raw/div}.${(raw%div).toString().padStart(dec,'0').slice(0,4)}`
  } catch { return '0.0000' }
}

export default function AdminPage({ account, provider, onConnect }) {
  const [unlocked,  setUnlocked]  = useState(false)
  const [pwInput,   setPwInput]   = useState('')
  const [pwError,   setPwError]   = useState(false)
  const [authorized,setAuthorized]= useState(false)
  const [checking,  setChecking]  = useState(true)
  const [activeNav, setActiveNav] = useState('overview')
  const [sideOpen,  setSideOpen]  = useState(false)
  const [search,    setSearch]    = useState('')
  const [slotFilter,setSlotFilter]= useState('all')

  const [stats,     setStats]     = useState(null)
  const [slots,     setSlots]     = useState([])
  const [poolStats, setPoolStats] = useState([])
  const [users,     setUsers]     = useState([])
  const [lastUpd,   setLastUpd]   = useState(null)
  const [loading,   setLoading]   = useState(false)

  const intervalRef = useRef(null)

  useEffect(() => {
    if (!account) { setChecking(false); return }
    const isAdmin = ADMIN_WALLETS.some(w => w.toLowerCase() === account.toLowerCase())
    setAuthorized(isAdmin)
    setChecking(false)
    if (typeof window !== 'undefined' && sessionStorage.getItem('flibber_admin') === '1') setUnlocked(true)
  }, [account])

  useEffect(() => {
    if (provider && authorized && unlocked) {
      loadAll()
      intervalRef.current = setInterval(loadAll, 30000)
    }
    return () => clearInterval(intervalRef.current)
  }, [provider, account, authorized, unlocked])

  const handleUnlock = () => {
    const correct = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'flibber-admin'
    if (pwInput === correct) {
      setUnlocked(true); setPwError(false)
      sessionStorage.setItem('flibber_admin', '1')
    } else { setPwError(true); setPwInput('') }
  }

  const loadAll = async () => {
    if (!provider) return
    setLoading(true)
    try {
      const { ethers } = await import('ethers')
      const fib     = new ethers.Contract(CONTRACTS.fibToken,       FIB_ABI,      provider)
      const staking = new ethers.Contract(CONTRACTS.fibStaking,     STAKING_ABI,  provider)
      const fee     = new ethers.Contract(CONTRACTS.feeEngine,      FEE_ABI,      provider)
      const pool    = new ethers.Contract(CONTRACTS.liquidityPool,  POOL_ABI,     provider)
      const engine  = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, provider)

      const [supply, burned, totalStaked, feesCollected, feeRate, count] = await Promise.all([
        fib.totalSupply(), fib.getTotalBurned(),
        staking.totalStaked(), fee.totalFeesCollected(),
        fee.feeRateBps(), engine.slotCounter(),
      ])

      const f = (v, d=18) => {
        const n = parseFloat(ethers.formatUnits(v, d))
        if (n>=1e9) return (n/1e9).toFixed(2)+'B'
        if (n>=1e6) return (n/1e6).toFixed(2)+'M'
        if (n>=1e3) return n.toLocaleString(undefined,{maximumFractionDigits:2})
        return n.toFixed(4)
      }

      const supplyN = Number(ethers.formatEther(supply))
      const burnedN = Number(ethers.formatEther(burned))
      const stakedN = Number(ethers.formatEther(totalStaked))
      const feesN   = Number(ethers.formatEther(feesCollected))

      setStats({
        supply: f(supply), burned: f(burned),
        burnPct: supplyN>0 ? ((burnedN/supplyN)*100).toFixed(3)+'%' : '0%',
        totalStaked: f(totalStaked),
        stakedPct: supplyN>0 ? ((stakedN/supplyN)*100).toFixed(2)+'%' : '0%',
        feesCollected: f(feesCollected),
        feeRate: (Number(feeRate)/100).toFixed(2)+'%',
        slotCount: Number(count).toLocaleString(),
        rawFees: feesN,
      })

      // All slots
      const allSlots = []
      const total = Number(count)
      for (let i = total; i >= Math.max(1, total-49); i--) {
        try {
          const raw = await engine.getSlot(i)
          allSlots.push(parseSlot(i, raw))
        } catch {}
      }
      setSlots(allSlots)

      // Build users from slots
      const userMap = {}
      allSlots.forEach(s => {
        const u = s.user?.toLowerCase()
        if (!u) return
        if (!userMap[u]) userMap[u] = { addr: s.user, slots: 0, filled: 0, firstSeen: Number(s.createdAt) }
        userMap[u].slots++
        if (Number(s.status) === 1) userMap[u].filled++
        if (Number(s.createdAt) < userMap[u].firstSeen) userMap[u].firstSeen = Number(s.createdAt)
      })
      setUsers(Object.values(userMap).sort((a,b) => b.slots-a.slots))

      // Pool balances
      const pStats = []
      for (const t of SUPPORTED_TOKENS) {
        try {
          const bal = await pool.getPoolBalance(t.address)
          pStats.push({ ...t, poolBal: parseFloat(ethers.formatUnits(bal, t.decimals)).toFixed(4) })
        } catch { pStats.push({ ...t, poolBal: '0.0000' }) }
      }
      setPoolStats(pStats)
      setLastUpd(new Date())
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const fmtDate = ts => ts ? new Date(Number(ts)*1000).toLocaleDateString([], { month:'short', year:'numeric' }) : '—'
  const fmtTs   = ts => ts ? new Date(Number(ts)*1000).toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
  const short   = addr => addr ? `${addr.slice(0,5)}...${addr.slice(-3)}` : '—'

  // Filtered slots
  const filteredSlots = slots.filter(s => {
    const status = Number(s.status)
    if (slotFilter === 'completed' && status !== 1) return false
    if (slotFilter === 'pending'   && status !== 0) return false
    if (slotFilter === 'cancelled' && status !== 2) return false
    if (search) {
      const q = search.toLowerCase()
      return s.user?.toLowerCase().includes(q) ||
             getTokenSymbol(s.tokenIn).toLowerCase().includes(q) ||
             getTokenSymbol(s.tokenOut).toLowerCase().includes(q)
    }
    return true
  })

  // Weekly slot data
  const now = Date.now()/1000
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const weekly = Array(7).fill(0)
  slots.filter(s => Number(s.status)===1).forEach(s => {
    const ago = now - Number(s.createdAt||0)
    if (ago < 7*86400) { const idx = Math.min(6,Math.floor(ago/86400)); weekly[6-idx]++ }
  })
  const maxW = Math.max(...weekly, 1)

  // Styles
  const S = {
    card:  { background:'#111318', border:'1px solid #1E2128', borderRadius:'12px', padding:'20px' },
    label: { fontSize:'12px', color:'#6B7280', marginBottom:'8px' },
    val:   { fontSize:'22px', fontWeight:'700', color:'#FFFFFF', fontFamily:'IBM Plex Mono, monospace' },
    th:    { fontSize:'11px', color:'#6B7280', fontWeight:'600', letterSpacing:'0.05em', padding:'10px 12px', textAlign:'left' },
    td:    { fontSize:'13px', color:'#E5E7EB', padding:'14px 12px', borderTop:'1px solid #1E2128' },
    badge: (bg, color) => ({ display:'inline-block', padding:'4px 12px', borderRadius:'20px', fontSize:'11px', fontWeight:'600', background:bg, color }),
  }

  const Sidebar = ({ onNav }) => (
    <div style={{ width:'240px', background:'#0D0F12', borderRight:'1px solid #1E2128', display:'flex', flexDirection:'column', flexShrink:0, height:'100%' }}>
      <div style={{ padding:'20px 16px 8px', display:'flex', alignItems:'center', gap:'8px', borderBottom:'1px solid #1E2128' }}>
        <img src="/flibber.png" alt="F" style={{ width:24, height:24, borderRadius:'6px', mixBlendMode:'lighten' }} onError={e=>e.target.style.display='none'} />
        <span style={{ fontSize:'14px', fontWeight:'800', color:'#fff', letterSpacing:'0.08em' }}>FLIBBER</span>
      </div>
      <div style={{ flex:1, padding:'12px 8px', overflowY:'auto' }}>
        {(() => {
          const groups = []
          const seen = {}
          NAV_SECTIONS.forEach(n => {
            if (!seen[n.group]) { seen[n.group] = true; groups.push(n.group) }
          })
          return groups.map(g => (
            <div key={g} style={{ marginBottom:'16px' }}>
              <div style={{ fontSize:'10px', color:'#4B5563', fontWeight:'700', letterSpacing:'0.1em', padding:'0 10px', marginBottom:'4px' }}>{g}</div>
              {NAV_SECTIONS.filter(n => n.group===g).map(n => (
                <button key={n.id} onClick={() => { setActiveNav(n.id); onNav && onNav() }} style={{
                  display:'flex', alignItems:'center', gap:'10px', width:'100%',
                  padding:'10px 12px', borderRadius:'8px', marginBottom:'2px',
                  background: activeNav===n.id ? '#1E2128' : 'transparent',
                  border:'none', color: activeNav===n.id ? '#FFFFFF' : '#9CA3AF',
                  fontSize:'13px', fontWeight: activeNav===n.id ? '600' : '400',
                  cursor:'pointer', textAlign:'left', transition:'all 0.15s',
                }}>
                  {n.label}
                  {activeNav===n.id && <span style={{ marginLeft:'auto', width:'6px', height:'6px', borderRadius:'50%', background:'#fff' }} />}
                </button>
              ))}
            </div>
          ))
        })()}
      </div>
      <div style={{ padding:'12px 8px', borderTop:'1px solid #1E2128' }}>
        <button onClick={() => { setUnlocked(false); sessionStorage.removeItem('flibber_admin') }}
          style={{ width:'100%', padding:'9px 12px', borderRadius:'8px', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'#EF4444', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>
          🔒 Lock Dashboard
        </button>
      </div>
    </div>
  )

  const renderContent = () => {
    if (activeNav === 'overview') return (
      <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'12px', marginBottom:'20px' }}>
          {[
            { label:'Total Slots',     value: stats?.slotCount     || '—' },
            { label:'Circulating Supply', value: stats?.supply     || '—' },
            { label:'Total Staked',    value: stats?.totalStaked    || '—' },
            { label:'Fees Collected',  value: stats?.feesCollected  || '—' },
            { label:'Total Burned',    value: stats?.burned         || '—' },
            { label:'Fee Rate',        value: stats?.feeRate        || '—' },
          ].map(s => (
            <div key={s.label} style={S.card}>
              <div style={S.label}>{s.label}</div>
              <div style={S.val}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px', marginBottom:'20px' }}>
          {/* Weekly chart */}
          <div style={S.card}>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#E5E7EB', marginBottom:'4px' }}>Slot Activity — 7 Days</div>
            <div style={{ fontSize:'11px', color:'#6B7280', marginBottom:'20px' }}>Recent filled slots</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:'8px', height:'100px' }}>
              {weekly.map((val,i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                  <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${Math.max(3,(val/maxW)*85)}px`, background: val>0?'#E5E7EB':'#1E2128', transition:'height 0.3s' }} />
                  <div style={{ fontSize:'10px', color:'#4B5563' }}>{days[i]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Fee distribution */}
          <div style={S.card}>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#E5E7EB', marginBottom:'4px' }}>Fee Distribution</div>
            <div style={{ fontSize:'11px', color:'#6B7280', marginBottom:'20px' }}>Protocol revenue split</div>
            {[
              { label:'Stakers',        pct:40 },
              { label:'Treasury',       pct:40 },
              { label:'Burned',         pct:20 },
            ].map(s => (
              <div key={s.label} style={{ marginBottom:'14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'5px' }}>
                  <span style={{ fontSize:'12px', color:'#9CA3AF' }}>{s.label}</span>
                  <span style={{ fontSize:'12px', color:'#E5E7EB', fontFamily:'IBM Plex Mono, monospace' }}>{s.pct}%</span>
                </div>
                <div style={{ height:'4px', background:'#1E2128', borderRadius:'4px' }}>
                  <div style={{ height:'100%', width:`${s.pct}%`, background:'#E5E7EB', borderRadius:'4px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )

    if (activeNav === 'slots') return (
      <>
        {/* Filters */}
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'20px', flexWrap:'wrap' }}>
          {['all','completed','pending','cancelled'].map(f => (
            <button key={f} onClick={() => setSlotFilter(f)} style={{
              padding:'7px 16px', borderRadius:'20px', fontSize:'13px', fontWeight:'600',
              border:'1px solid', cursor:'pointer', transition:'all 0.15s', textTransform:'capitalize',
              background: slotFilter===f ? '#fff' : 'transparent',
              borderColor: slotFilter===f ? '#fff' : '#1E2128',
              color: slotFilter===f ? '#000' : '#9CA3AF',
            }}>{f}</button>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', background:'#111318', border:'1px solid #1E2128', borderRadius:'8px' }}>
            <span style={{ color:'#4B5563', fontSize:'14px' }}>🔍</span>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wallet, token..." style={{ background:'none', border:'none', outline:'none', color:'#E5E7EB', fontSize:'13px', width:'180px' }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
            <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#22C55E', display:'inline-block' }} />
            <span style={{ fontSize:'12px', color:'#6B7280' }}>Live</span>
          </div>
        </div>

        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E2128' }}>
                {['Slot ID','User','Pair','Amount In','Amount Out','Status','Time'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSlots.length === 0 ? (
                <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#4B5563', padding:'40px' }}>No slots found</td></tr>
              ) : filteredSlots.map(s => {
                const st = STATUS_MAP[Number(s.status)] || STATUS_MAP[0]
                return (
                  <tr key={s.id} style={{ transition:'background 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#13161A'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'12px', color:'#9CA3AF' }}>#{s.id}</span></td>
                    <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'12px' }}>{short(s.user)}</span></td>
                    <td style={S.td}><span style={{ fontSize:'12px' }}>{getTokenSymbol(s.tokenIn)}/{getTokenSymbol(s.tokenOut)}</span></td>
                    <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'12px' }}>{formatAmt(s.amountIn,s.tokenIn)} {getTokenSymbol(s.tokenIn)}</span></td>
                    <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'12px' }}>{formatAmt(s.amountOut,s.tokenOut)} {getTokenSymbol(s.tokenOut)}</span></td>
                    <td style={S.td}><span style={S.badge(st.bg, st.color)}>{st.label}</span></td>
                    <td style={S.td}><span style={{ fontSize:'11px', color:'#6B7280' }}>{fmtTs(s.createdAt)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>
    )

    if (activeNav === 'pools') return (
      <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'12px', marginBottom:'20px' }}>
          {[
            { label:'Active Pools',    value: poolStats.filter(p=>parseFloat(p.poolBal)>0).length.toString() },
            { label:'Total Tokens',    value: poolStats.length.toString() },
            { label:'Fee Rate',        value: stats?.feeRate || '—' },
            { label:'LP Share',        value: '40%' },
          ].map(s => (
            <div key={s.label} style={S.card}>
              <div style={S.label}>{s.label}</div>
              <div style={S.val}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E2128' }}>
                {['Token','Name','Pool Balance','Status'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {poolStats.map((t,i) => {
                const bal = parseFloat(t.poolBal)
                const max = Math.max(...poolStats.map(p=>parseFloat(p.poolBal)),1)
                return (
                  <tr key={t.symbol}
                    onMouseEnter={e=>e.currentTarget.style.background='#13161A'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                    <td style={S.td}><span style={{ fontWeight:'700', fontSize:'13px' }}>{t.symbol}</span></td>
                    <td style={S.td}><span style={{ fontSize:'12px', color:'#6B7280' }}>{t.name}</span></td>
                    <td style={{ ...S.td, width:'40%' }}>
                      <div style={{ fontSize:'12px', fontFamily:'IBM Plex Mono, monospace', marginBottom:'6px' }}>{t.poolBal}</div>
                      <div style={{ height:'3px', background:'#1E2128', borderRadius:'4px' }}>
                        <div style={{ height:'100%', width:`${(bal/max)*100}%`, background:'#E5E7EB', borderRadius:'4px' }} />
                      </div>
                    </td>
                    <td style={S.td}>
                      <span style={S.badge(bal>0?'rgba(34,197,94,0.1)':'rgba(107,114,128,0.1)', bal>0?'#22C55E':'#6B7280')}>
                        {bal>0?'Active':'Empty'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </>
    )

    if (activeNav === 'users') return (
      <>
        {/* Search */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'10px 16px', background:'#111318', border:'1px solid #1E2128', borderRadius:'10px', marginBottom:'20px', maxWidth:'400px' }}>
          <span style={{ color:'#4B5563' }}>🔍</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by wallet address..." style={{ background:'none', border:'none', outline:'none', color:'#E5E7EB', fontSize:'13px', flex:1 }} />
        </div>

        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #1E2128' }}>
                {['Wallet','First Seen','Total Slots','Filled','Success Rate'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.filter(u => !search || u.addr.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
                <tr><td colSpan={5} style={{ ...S.td, textAlign:'center', color:'#4B5563', padding:'40px' }}>No users found</td></tr>
              ) : users.filter(u => !search || u.addr.toLowerCase().includes(search.toLowerCase())).map((u,i) => (
                <tr key={u.addr}
                  onMouseEnter={e=>e.currentTarget.style.background='#13161A'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={S.td}>
                    <div style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'13px' }}>{u.addr.slice(0,8)}...{u.addr.slice(-4)}</div>
                    <a href={`https://sepolia.basescan.org/address/${u.addr}`} target="_blank" rel="noreferrer" style={{ fontSize:'11px', color:'#6B7280', textDecoration:'none' }}>View on Basescan ↗</a>
                  </td>
                  <td style={S.td}><span style={{ fontSize:'12px', color:'#9CA3AF' }}>{fmtDate(u.firstSeen)}</span></td>
                  <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'13px' }}>{u.slots}</span></td>
                  <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'13px' }}>{u.filled}</span></td>
                  <td style={S.td}>
                    <span style={S.badge('rgba(229,231,235,0.1)','#E5E7EB')}>
                      {u.slots>0?((u.filled/u.slots)*100).toFixed(0)+'%':'0%'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )

    if (activeNav === 'treasury') return (
      <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:'12px', marginBottom:'20px' }}>
          {[
            { label:'Total Fees Collected', value: stats?.feesCollected || '—' },
            { label:'Total Burned',         value: stats?.burned        || '—' },
            { label:'Burn Rate',            value: stats?.burnPct       || '—' },
            { label:'Staker Share',         value: '40% of fees' },
          ].map(s => (
            <div key={s.label} style={S.card}>
              <div style={S.label}>{s.label}</div>
              <div style={S.val}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
          {/* Revenue chart */}
          <div style={S.card}>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#E5E7EB', marginBottom:'4px' }}>Revenue — 7 Days</div>
            <div style={{ fontSize:'11px', color:'#6B7280', marginBottom:'20px' }}>Slot count proxy</div>
            <div style={{ display:'flex', alignItems:'flex-end', gap:'8px', height:'120px' }}>
              {weekly.map((val,i) => (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', height:'100%', justifyContent:'flex-end' }}>
                  <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${Math.max(3,(val/maxW)*100)}px`, background: val>0?'#D1D5DB':'#1E2128' }} />
                  <div style={{ fontSize:'10px', color:'#4B5563' }}>{days[i]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Allocation */}
          <div style={S.card}>
            <div style={{ fontSize:'13px', fontWeight:'600', color:'#E5E7EB', marginBottom:'20px' }}>Fee Allocation</div>
            {[
              { label:'Stakers',   pct:40 },
              { label:'Treasury',  pct:40 },
              { label:'Burned',    pct:20 },
            ].map(s => (
              <div key={s.label} style={{ marginBottom:'16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                  <span style={{ fontSize:'13px', color:'#9CA3AF' }}>{s.label}</span>
                  <span style={{ fontSize:'13px', color:'#E5E7EB', fontFamily:'IBM Plex Mono, monospace' }}>{s.pct}%</span>
                </div>
                <div style={{ height:'5px', background:'#1E2128', borderRadius:'4px' }}>
                  <div style={{ height:'100%', width:`${s.pct}%`, background:'#E5E7EB', borderRadius:'4px' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )

    if (activeNav === 'contracts') return (
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ borderBottom:'1px solid #1E2128' }}>
              {['Contract','Address','Explorer'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {Object.entries(CONTRACTS).map(([name, addr]) => (
              <tr key={name}
                onMouseEnter={e=>e.currentTarget.style.background='#13161A'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <td style={S.td}><span style={{ fontSize:'13px', fontWeight:'600', textTransform:'capitalize' }}>{name}</span></td>
                <td style={S.td}><span style={{ fontFamily:'IBM Plex Mono, monospace', fontSize:'12px', color:'#9CA3AF', wordBreak:'break-all' }}>{addr}</span></td>
                <td style={S.td}>
                  <a href={`https://sepolia.basescan.org/address/${addr}`} target="_blank" rel="noreferrer"
                    style={{ fontSize:'12px', color:'#9CA3AF', textDecoration:'none', whiteSpace:'nowrap' }}>
                    View ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── Guards ────────────────────────────────────────────────
  if (checking) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#080A0D' }}>
      <div className="spinner" style={{ width:'24px', height:'24px' }} />
    </div>
  )

  if (!account) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#080A0D', gap:'16px' }}>
      <div style={{ fontSize:'36px' }}>🔒</div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#fff' }}>Connect your wallet</div>
      <div style={{ fontSize:'13px', color:'#6B7280' }}>Admin access required</div>
      <button onClick={onConnect} style={{ padding:'12px 24px', background:'#fff', border:'none', borderRadius:'10px', color:'#000', fontSize:'14px', fontWeight:'700', cursor:'pointer' }}>Connect Wallet</button>
    </div>
  )

  if (!authorized) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#080A0D', gap:'16px' }}>
      <div style={{ fontSize:'36px' }}>⛔</div>
      <div style={{ fontSize:'18px', fontWeight:'700', color:'#fff' }}>Access Denied</div>
      <div style={{ fontSize:'13px', color:'#6B7280' }}>This wallet is not authorized</div>
    </div>
  )

  // ── Password gate ─────────────────────────────────────────
  if (!unlocked) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#080A0D', padding:'20px' }}>
      <div style={{ width:'100%', maxWidth:'360px' }}>
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ width:'52px', height:'52px', borderRadius:'14px', background:'#111318', border:'1px solid #1E2128', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'22px', margin:'0 auto 14px' }}>⚙️</div>
          <div style={{ fontSize:'20px', fontWeight:'700', color:'#fff', marginBottom:'6px' }}>Admin Dashboard</div>
          <div style={{ fontSize:'13px', color:'#6B7280' }}>Enter your password to continue</div>
        </div>
        <div style={{ background:'#111318', border:'1px solid #1E2128', borderRadius:'12px', padding:'24px' }}>
          <div style={{ fontSize:'11px', color:'#6B7280', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.06em' }}>Password</div>
          <input type="password" placeholder="Enter admin password" value={pwInput}
            onChange={e=>{setPwInput(e.target.value);setPwError(false)}}
            onKeyDown={e=>e.key==='Enter'&&handleUnlock()}
            style={{ width:'100%', padding:'12px 14px', marginBottom:'10px', background:'#0D0F12', border:`1px solid ${pwError?'#EF4444':'#1E2128'}`, borderRadius:'8px', color:'#fff', fontSize:'14px', outline:'none', fontFamily:'IBM Plex Mono, monospace' }}
          />
          {pwError && <div style={{ fontSize:'12px', color:'#EF4444', marginBottom:'10px' }}>Incorrect password. Try again.</div>}
          <button onClick={handleUnlock} style={{ width:'100%', padding:'12px', borderRadius:'8px', background:'#fff', border:'none', color:'#000', fontSize:'14px', fontWeight:'700', cursor:'pointer' }}>
            Unlock Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  // ── Main Admin UI ─────────────────────────────────────────
  return (
    <div style={{ display:'flex', height:'calc(100vh - 64px)', background:'#080A0D', overflow:'hidden' }}>

      {/* Desktop sidebar */}
      <div className="admin-sidebar-desk" style={{ flexShrink:0 }}>
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sideOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.7)' }} onClick={()=>setSideOpen(false)}>
          <div style={{ position:'absolute', left:0, top:0, bottom:0 }} onClick={e=>e.stopPropagation()}>
            <Sidebar onNav={()=>setSideOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Top bar */}
        <div style={{ padding:'0 24px', height:'56px', borderBottom:'1px solid #1E2128', display:'flex', alignItems:'center', gap:'12px', background:'#080A0D', flexShrink:0 }}>
          <button className="admin-menu-btn" onClick={()=>setSideOpen(true)} style={{ display:'none', background:'none', border:'none', color:'#9CA3AF', fontSize:'18px', cursor:'pointer', padding:'4px' }}>☰</button>
          <h1 style={{ fontSize:'16px', fontWeight:'700', color:'#fff', flex:1 }}>
            {NAV_SECTIONS.find(n=>n.id===activeNav)?.label || 'Dashboard'}
          </h1>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 14px', background:'#111318', border:'1px solid #1E2128', borderRadius:'8px' }}>
            <span style={{ color:'#4B5563', fontSize:'13px' }}>🔍</span>
            <input placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}
              style={{ background:'none', border:'none', outline:'none', color:'#9CA3AF', fontSize:'13px', width:'140px' }} />
          </div>
          <button onClick={()=>loadAll()} style={{ padding:'7px 14px', background:'#111318', border:'1px solid #1E2128', borderRadius:'8px', color:'#9CA3AF', fontSize:'12px', fontWeight:'600', cursor:'pointer' }}>
            {loading ? '⟳' : '⟳ Refresh'}
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 12px', background:'#111318', border:'1px solid #1E2128', borderRadius:'8px' }}>
            <span style={{ fontSize:'12px', color:'#9CA3AF' }}>Admin</span>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
  <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#22C55E', display:'inline-block' }} />
  <span style={{ fontSize:'12px', color:'#E5E7EB', fontFamily:'IBM Plex Mono, monospace' }}>
    {account ? `${account.slice(0,6)}...${account.slice(-4)}` : '—'}
  </span>
</div>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px' }}>
          {renderContent()}
        </div>
      </div>

      <style>{`
        .admin-sidebar-desk { display: flex; }
        .admin-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .admin-sidebar-desk { display: none !important; }
          .admin-menu-btn { display: flex !important; }
        }
      `}</style>
    </div>
  )
}