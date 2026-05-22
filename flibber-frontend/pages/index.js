import { useState, useEffect } from 'react'
import { CONTRACTS, SLOTTING_ABI, FIB_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

export default function SlotPage({ account, provider }) {
  const [tokenIn,    setTokenIn]    = useState(SUPPORTED_TOKENS[0])
  const [tokenOut,   setTokenOut]   = useState(SUPPORTED_TOKENS[1])
  const [amountIn,   setAmountIn]   = useState('')
  const [amountOut,  setAmountOut]  = useState('')
  const [payInFib,   setPayInFib]   = useState(true)
  const [loading,    setLoading]    = useState(false)
  const [txHash,     setTxHash]     = useState(null)
  const [error,      setError]      = useState(null)
  const [balances,   setBalances]   = useState({})
  const [feeRate,    setFeeRate]    = useState('0.20')
  const [slotCount,  setSlotCount]  = useState(0)

  useEffect(() => {
    if (provider && account) loadBalances()
  }, [provider, account])

  const loadBalances = async () => {
    try {
      const { ethers } = await import('ethers')
      const bals = {}
      for (const t of SUPPORTED_TOKENS) {
        const c = new ethers.Contract(t.address, FIB_ABI, provider)
        const b = await c.balanceOf(account)
        bals[t.symbol] = parseFloat(ethers.formatUnits(b, t.decimals)).toFixed(4)
      }
      setBalances(bals)
      const sc = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, provider)
      const cnt = await sc.slotCounter()
      setSlotCount(Number(cnt))
    } catch(e) { console.error(e) }
  }

  const swap = () => {
    const tmp = tokenIn; setTokenIn(tokenOut); setTokenOut(tmp)
    setAmountIn(amountOut); setAmountOut(amountIn)
  }

  const handleSlot = async () => {
    if (!account) return setError('Connect your wallet first')
    if (!amountIn || !amountOut) return setError('Enter amounts')
    setLoading(true); setError(null); setTxHash(null)
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const amtIn  = ethers.parseUnits(amountIn,  tokenIn.decimals)
      const amtOut = ethers.parseUnits(amountOut, tokenOut.decimals)

      // Approve token
      const tokenContract = new ethers.Contract(tokenIn.address, FIB_ABI, signer)
      const allowance = await tokenContract.allowance(account, CONTRACTS.slottingEngine)
      if (allowance < amtIn) {
        const approveTx = await tokenContract.approve(CONTRACTS.slottingEngine, amtIn)
        await approveTx.wait()
      }

      // If paying fee in FIB, approve FIB separately
      if (payInFib && tokenIn.symbol !== 'FIB') {
        const fib = new ethers.Contract(CONTRACTS.fibToken, FIB_ABI, signer)
        const fibFee = amtIn * 20n / 10000n
        const fibAllowance = await fib.allowance(account, CONTRACTS.slottingEngine)
        if (fibAllowance < fibFee) {
          const at = await fib.approve(CONTRACTS.slottingEngine, fibFee * 2n)
          await at.wait()
        }
      }

      const slotContract = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, signer)
      const tx = await slotContract.requestSlot(
        tokenIn.address, amtIn,
        tokenOut.address, amtOut,
        account, payInFib, 0
      )
      const receipt = await tx.wait()
      setTxHash(receipt.hash)
      setAmountIn(''); setAmountOut('')
      loadBalances()
    } catch(e) {
      setError(e.reason || e.message || 'Transaction failed')
    }
    setLoading(false)
  }

  const fee = amountIn ? (parseFloat(amountIn) * 0.002).toFixed(6) : '0'
  useEffect(() => {
  if (amountIn && parseFloat(amountIn) > 0) {
    const estimated = parseFloat(amountIn) * 0.998
    setAmountOut(estimated.toFixed(tokenOut.decimals === 6 ? 6 : 4))
  } else {
    setAmountOut('')
  }
}, [amountIn, tokenIn, tokenOut])

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', position: 'relative', zIndex: 1 }}>
      
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '32px', marginBottom: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Total Slots', value: slotCount.toLocaleString() },
          { label: 'Fee Rate',    value: '0.20%' },
          { label: 'Network',     value: 'Base Sepolia' },
          { label: 'Value Loss',  value: '0%' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#00FF87' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Main slot card */}
      <div style={{
        width: '100%', maxWidth: '460px',
        background: 'rgba(13,17,23,0.9)',
        border: '1px solid #1E2A36',
        borderRadius: '20px', padding: '28px',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 0 60px rgba(0,255,135,0.05)',
      }} className="animate-in">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '800' }}>Slot Assets</h1>
          <span style={{ fontSize: '12px', color: '#7A95AE', fontFamily: 'Space Mono, monospace' }}>
            {slotCount} slots filled
          </span>
        </div>

        {/* Token In */}
        <div style={{ background: '#131920', borderRadius: '14px', padding: '16px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>You deposit</span>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>
              Balance: <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{balances[tokenIn.symbol] || '0'}</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="number" placeholder="0.00" value={amountIn}
              onChange={e => setAmountIn(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: '28px', fontWeight: '700', color: '#E8F0F8', fontFamily: 'Space Mono, monospace',
              }}
            />
            <TokenSelect token={tokenIn} onChange={setTokenIn} exclude={tokenOut} />
          </div>
          {balances[tokenIn.symbol] && (
            <button onClick={() => setAmountIn(balances[tokenIn.symbol])} style={{
              marginTop: '8px', fontSize: '11px', color: '#00FF87', background: 'none',
              border: 'none', cursor: 'pointer', padding: '0'
            }}>MAX</button>
          )}
        </div>

        {/* Swap button */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
          <button onClick={swap} style={{
            width: '36px', height: '36px', borderRadius: '50%',
            background: '#1E2A36', border: '2px solid #131920',
            color: '#7A95AE', fontSize: '16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s',
          }}>⇅</button>
        </div>

        {/* Token Out */}
        <div style={{ background: '#131920', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>You receive</span>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>
              Balance: <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{balances[tokenOut.symbol] || '0'}</span>
            </span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="number" placeholder="0.00" value={amountOut}
              onChange={e => setAmountOut(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: '28px', fontWeight: '700', color: '#00FF87', fontFamily: 'Space Mono, monospace',
              }}
            />
            <TokenSelect token={tokenOut} onChange={setTokenOut} exclude={tokenIn} />
          </div>
        </div>

        {/* Fee toggle */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 16px', background: '#131920', borderRadius: '12px', marginBottom: '16px'
        }}>
          <div>
            <div style={{ fontSize: '13px', color: '#E8F0F8', fontWeight: '600' }}>Pay fee in $FIB</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '2px' }}>
              Preserves 100% of your principal
            </div>
          </div>
          <button onClick={() => setPayInFib(!payInFib)} style={{
            width: '44px', height: '24px', borderRadius: '12px',
            background: payInFib ? '#00FF87' : '#1E2A36',
            border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.3s'
          }}>
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%',
              background: payInFib ? '#080B0F' : '#7A95AE',
              position: 'absolute', top: '3px',
              left: payInFib ? '23px' : '3px', transition: 'all 0.3s'
            }} />
          </button>
        </div>

        {/* Fee info */}
        {amountIn && (
          <div style={{
            padding: '12px 16px', background: 'rgba(0,255,135,0.04)',
            border: '1px solid rgba(0,255,135,0.1)', borderRadius: '12px', marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ color: '#7A95AE' }}>Protocol fee (0.20%)</span>
              <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{fee} {payInFib ? 'FIB' : tokenIn.symbol}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#7A95AE' }}>Value preserved</span>
              <span style={{ color: '#00FF87', fontWeight: '700' }}>100% ✓</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)',
            borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#FF4444'
          }}>{error}</div>
        )}

        {/* Success */}
        {txHash && (
          <div style={{
            padding: '12px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)',
            borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#00FF87'
          }}>
            ✅ Slot filled!{' '}
            <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer"
              style={{ color: '#00FF87', textDecoration: 'underline' }}>View on Basescan ↗</a>
          </div>
        )}

        {/* Submit */}
        <button onClick={account ? handleSlot : () => {}} style={{
          width: '100%', padding: '16px', borderRadius: '14px', fontSize: '16px', fontWeight: '800',
          border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          background: account ? 'linear-gradient(135deg, #00FF87, #00CC6A)' : '#1E2A36',
          color: account ? '#080B0F' : '#7A95AE',
          transition: 'all 0.2s', letterSpacing: '0.5px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        }}>
          {loading ? <><span className="spinner" style={{ borderTopColor: '#080B0F' }} /> Slotting...</> :
           !account ? 'Connect Wallet to Slot' : 'SLOT NOW →'}
        </button>
      </div>

      {/* Info cards */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '32px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '460px' }}>
        {[
          { icon: '⚡', title: 'Instant', desc: '~3-10 second fills' },
          { icon: '🔒', title: '100% Value', desc: 'Fee paid separately' },
          { icon: '⛽', title: '$FIB Gas', desc: 'One token, all chains' },
        ].map(c => (
          <div key={c.title} style={{
            flex: 1, minWidth: '120px', padding: '16px', borderRadius: '12px',
            background: 'rgba(13,17,23,0.8)', border: '1px solid #1E2A36', textAlign: 'center'
          }}>
            <div style={{ fontSize: '20px', marginBottom: '6px' }}>{c.icon}</div>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '4px' }}>{c.title}</div>
            <div style={{ fontSize: '12px', color: '#7A95AE' }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TokenSelect({ token, onChange, exclude }) {
  const [open, setOpen] = useState(false)
  const options = SUPPORTED_TOKENS.filter(t => t.symbol !== exclude.symbol)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px',
        background: '#1E2A36', border: '1px solid #2A3A4A', borderRadius: '10px',
        color: '#E8F0F8', cursor: 'pointer', fontSize: '14px', fontWeight: '700',
        whiteSpace: 'nowrap'
      }}>
        {token.symbol} <span style={{ fontSize: '10px', color: '#7A95AE' }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '44px', right: 0, zIndex: 10,
          background: '#0D1117', border: '1px solid #1E2A36', borderRadius: '12px',
          padding: '8px', minWidth: '140px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
        }}>
          {options.map(t => (
            <button key={t.symbol} onClick={() => { onChange(t); setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
              padding: '10px 12px', background: 'none', border: 'none',
              color: '#E8F0F8', cursor: 'pointer', borderRadius: '8px', fontSize: '14px',
              fontWeight: '600', textAlign: 'left'
            }}>
              <span>{t.symbol}</span>
              <span style={{ fontSize: '12px', color: '#7A95AE' }}>{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
