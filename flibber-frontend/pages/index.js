import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { CONTRACTS, SLOTTING_ABI, FIB_ABI, ORACLE_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

export default function SlotPage({ account, provider, onConnect }) {
  const [tokenIn,            setTokenIn]            = useState(SUPPORTED_TOKENS[0])
  const [tokenOut,           setTokenOut]           = useState(SUPPORTED_TOKENS[1])
  const [amountIn,           setAmountIn]           = useState('')
  const [amountOut,          setAmountOut]          = useState('')
  const [loading,            setLoading]            = useState(false)
  const [quoting,            setQuoting]            = useState(false)
  const [txHash,             setTxHash]             = useState(null)
  const [error,              setError]              = useState(null)
  const [balances,           setBalances]           = useState({})
  const [slotCount,          setSlotCount]          = useState(0)
  const [walletAddr,         setWalletAddr]         = useState(null)
  const [fibBal,             setFibBal]             = useState(0)
  const [balancesLoaded,     setBalancesLoaded]     = useState(false)
  const [balancesRefreshing, setBalancesRefreshing] = useState(false)
  const [usdValue,           setUsdValue]           = useState(null)
  const [quoteError,         setQuoteError]         = useState(null)
  const successTimer = useRef(null)
  const quoteTimer   = useRef(null)

  useEffect(() => { if (provider && account) init() }, [provider, account])

  useEffect(() => {
    if (txHash) {
      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => setTxHash(null), 8000)
    }
    return () => clearTimeout(successTimer.current)
  }, [txHash])

  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current)
    if (!amountIn || parseFloat(amountIn) <= 0 || !provider) {
      setAmountOut(''); setUsdValue(null); setQuoteError(null); return
    }
    quoteTimer.current = setTimeout(() => fetchQuote(), 600)
    return () => clearTimeout(quoteTimer.current)
  }, [amountIn, tokenIn, tokenOut, provider])

  const init = async () => {
    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const addr   = await signer.getAddress()
      setWalletAddr(addr)
      loadBalances(addr)
    } catch(e) { console.error(e) }
  }

  const loadBalances = async (addr) => {
    setBalancesRefreshing(true)
    try {
      const { ethers } = await import('ethers')
      const bals = {}
      for (const t of SUPPORTED_TOKENS) {
        const c = new ethers.Contract(t.address, FIB_ABI, provider)
        const b = await c.balanceOf(addr)
        bals[t.symbol] = parseFloat(ethers.formatUnits(b, t.decimals)).toFixed(4)
      }
      setBalances(bals)
      setFibBal(parseFloat(bals['FIB'] || '0'))
      const sc  = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, provider)
      const cnt = await sc.slotCounter()
      setSlotCount(Number(cnt))
      setBalancesLoaded(true)
    } catch(e) { console.error(e); setBalancesLoaded(true) }
    setBalancesRefreshing(false)
  }

  const fetchQuote = async () => {
    if (!provider || !amountIn || parseFloat(amountIn) <= 0) return
    setQuoting(true); setQuoteError(null)
    try {
      const { ethers }   = await import('ethers')
      const slotContract = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, provider)
      const oracle       = new ethers.Contract(CONTRACTS.priceOracle, ORACLE_ABI, provider)
      const amtIn        = ethers.parseUnits(amountIn, tokenIn.decimals)
      const quote        = await slotContract.quoteSlot(tokenIn.address, amtIn, tokenOut.address)
      const formatted    = parseFloat(ethers.formatUnits(quote.amountOut, tokenOut.decimals))
      setAmountOut(formatted.toFixed(tokenOut.decimals === 8 ? 8 : tokenOut.decimals === 6 ? 6 : tokenOut.decimals === 9 ? 6 : 4))
      const priceIn = await oracle.getUSDPrice(tokenIn.address)
      const amtIn18 = parseFloat(amountIn) * (10 ** (18 - tokenIn.decimals))
      setUsdValue(((amtIn18 * parseFloat(ethers.formatEther(priceIn))) / 1e18).toFixed(2))
    } catch(e) {
      setQuoteError('Could not fetch price — token pair may not be configured yet')
      setAmountOut(''); setUsdValue(null)
    }
    setQuoting(false)
  }

  const swap = () => {
    const tmp = tokenIn; setTokenIn(tokenOut); setTokenOut(tmp)
    setAmountIn(amountOut); setAmountOut(amountIn)
    setUsdValue(null); setQuoteError(null)
  }

  const tokenInBal       = parseFloat(balances[tokenIn.symbol] || '0')
  const fibFeeNeeded     = amountIn ? parseFloat(amountIn) * 0.002 : 0
  const hasEnoughFib     = fibBal >= fibFeeNeeded
  const hasEnoughTokenIn = amountIn ? tokenInBal >= parseFloat(amountIn) : false
  const noFib            = walletAddr && balancesLoaded && fibBal === 0
  const lowFib           = walletAddr && balancesLoaded && amountIn && !hasEnoughFib && fibBal > 0
  const noTokenIn        = walletAddr && balancesLoaded && amountIn && parseFloat(amountIn) > 0 && !hasEnoughTokenIn
  const canSlot          = walletAddr && hasEnoughFib && hasEnoughTokenIn && amountIn && amountOut && !quoting && !quoteError

  const handleSlot = async () => {
    if (!walletAddr)             return setError('Connect your wallet first')
    if (!amountIn || !amountOut) return setError('Enter an amount first')
    if (!hasEnoughTokenIn)       return setError(`Insufficient ${tokenIn.symbol} balance.`)
    if (!hasEnoughFib)           return setError(`You need at least ${fibFeeNeeded.toFixed(6)} FIB to cover the fee.`)
    setLoading(true); setError(null); setTxHash(null)
    try {
      const { ethers }   = await import('ethers')
      const signer       = await provider.getSigner()
      const amtIn        = ethers.parseUnits(amountIn, tokenIn.decimals)
      const amtOut       = ethers.parseUnits(amountOut, tokenOut.decimals)
      const minAmountOut = (BigInt(amtOut.toString()) * 99n) / 100n

      const tokenContract = new ethers.Contract(tokenIn.address, FIB_ABI, signer)
      const allowance     = await tokenContract.allowance(walletAddr, CONTRACTS.slottingEngine)
      if (BigInt(allowance.toString()) < BigInt(amtIn.toString()))
        await (await tokenContract.approve(CONTRACTS.slottingEngine, ethers.MaxUint256)).wait()

      if (tokenIn.symbol !== 'FIB') {
        const fib          = new ethers.Contract(CONTRACTS.fibToken, FIB_ABI, signer)
        const fibFeeRaw    = (BigInt(amtIn.toString()) * 20n) / 10000n
        const fibAllowance = await fib.allowance(walletAddr, CONTRACTS.slottingEngine)
        if (BigInt(fibAllowance.toString()) < fibFeeRaw)
          await (await fib.approve(CONTRACTS.slottingEngine, ethers.MaxUint256)).wait()
      }

      const slotContract = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, signer)
      const tx           = await slotContract.requestSlot(tokenIn.address, amtIn, tokenOut.address, minAmountOut, walletAddr, 0)
      const receipt      = await tx.wait()
      setTxHash(receipt.hash)

      const parsedAmtIn  = parseFloat(amountIn)
      const parsedFibFee = parsedAmtIn * 0.002
      setBalances(prev => ({
        ...prev,
        [tokenIn.symbol]:  Math.max(0, parseFloat(prev[tokenIn.symbol]  || '0') - parsedAmtIn).toFixed(4),
        [tokenOut.symbol]: (parseFloat(prev[tokenOut.symbol] || '0') + parseFloat(amountOut)).toFixed(4),
        FIB: Math.max(0, parseFloat(prev['FIB'] || '0') - parsedFibFee).toFixed(4),
      }))
      setFibBal(prev => Math.max(0, prev - parsedFibFee))
      setAmountIn(''); setAmountOut(''); setUsdValue(null)
      setTimeout(() => loadBalances(walletAddr), 2000)
    } catch(e) {
      if (e?.message?.includes('slippage') || e?.reason?.includes('slippage'))
        setError('Price moved too much. Please try again.')
      else if (e?.reason?.includes('not configured') || e?.message?.includes('not configured'))
        setError('This token pair is not yet supported by the oracle.')
      else
        setError(e?.reason || e?.data?.message || e?.message || 'Transaction failed')
    }
    setLoading(false)
  }

  const fee = amountIn ? (parseFloat(amountIn) * 0.002).toFixed(6) : '0'

  const S = {
    page:   { minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px 40px', position: 'relative', zIndex: 1 },
    card:   { width: '100%', maxWidth: '480px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '24px' },
    inner:  { background: 'var(--bg2)', borderRadius: '14px', padding: '16px' },
    row:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    label:  { fontSize: '11px', fontWeight: '600', color: 'var(--muted)', letterSpacing: '0.06em', textTransform: 'uppercase' },
    amount: { flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '32px', fontWeight: '700', color: 'var(--plat)', fontFamily: 'IBM Plex Mono, monospace', width: '100%' },
    divKey: { fontSize: '13px', color: 'var(--muted)' },
    divVal: { fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--silver)' },
  }

  // ── Balance display — number smaller, symbol normal ─────────────
  const BalDisplay = ({ symbol }) => (
    <span style={{ fontFamily: 'IBM Plex Mono, monospace', color: 'var(--plat)', fontWeight: '500' }}>
      <span style={{ fontSize: '11px' }}>
        {balancesRefreshing ? '…' : (balances[symbol] || '0')}
      </span>
      {' '}
      <span style={{ fontSize: '13px' }}>{symbol}</span>
    </span>
  )

  const Banner = ({ type, title, body, link }) => (
    <div style={{ width: '100%', maxWidth: '480px', marginBottom: '12px', padding: '14px 16px', background: type === 'warn' ? 'rgba(234,179,8,0.06)' : 'rgba(255,68,68,0.06)', border: `1px solid ${type === 'warn' ? 'rgba(234,179,8,0.25)' : 'rgba(255,68,68,0.2)'}`, borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
      <div>
        <div style={{ fontSize: '13px', fontWeight: '700', color: type === 'warn' ? '#EAB308' : 'var(--red)', marginBottom: '3px' }}>{title}</div>
        <div style={{ fontSize: '12px', color: 'var(--silver)', lineHeight: '1.5' }}>{body}</div>
      </div>
      <Link href={link} style={{ flexShrink: 0, padding: '7px 13px', background: type === 'warn' ? 'rgba(234,179,8,0.1)' : 'rgba(255,68,68,0.08)', border: `1px solid ${type === 'warn' ? 'rgba(234,179,8,0.3)' : 'rgba(255,68,68,0.25)'}`, borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: type === 'warn' ? '#EAB308' : 'var(--red)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
        Get tokens
      </Link>
    </div>
  )

  return (
    <div style={S.page}>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Total Slots', value: slotCount.toLocaleString() },
          { label: 'Fee Rate',    value: '0.20% FIB' },
          { label: 'Network',     value: 'Base Sepolia' },
          { label: 'Value Loss',  value: '0%' },
        ].map(s => (
          <div key={s.label} style={{ padding: '8px 16px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--white)', fontFamily: 'IBM Plex Mono, monospace' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', letterSpacing: '0.04em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Banners */}
      {balancesLoaded && noFib && (
        <Banner type="warn" title="You need FIB to slot" body="All slot fees are paid in $FIB. Your wallet has 0 FIB." link="/faucet" />
      )}
      {balancesLoaded && lowFib && (
        <Banner type="err" title="Not enough FIB for fee" body={`Need ${fibFeeNeeded.toFixed(6)} FIB · Have ${fibBal.toFixed(4)} FIB`} link="/faucet" />
      )}
      {balancesLoaded && noTokenIn && (
        <Banner type="err" title={`Insufficient ${tokenIn.symbol}`} body={`You have ${tokenInBal.toFixed(4)} ${tokenIn.symbol} but need ${parseFloat(amountIn||0).toFixed(4)}`} link="/faucet" />
      )}

      {/* Main card */}
      <div style={S.card} className="animate-in">

        {/* Header */}
        <div style={{ ...S.row, marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--white)' }}>Slot Assets</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Lossless cross-chain settlement</div>
          </div>
          <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: 'var(--muted)', padding: '4px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
            {slotCount} filled
          </div>
        </div>

        {/* Token In */}
        <div style={{ ...S.inner, marginBottom: '6px', border: noTokenIn ? '1px solid rgba(255,68,68,0.3)' : '1px solid transparent' }}>
          <div style={{ ...S.row, marginBottom: '10px' }}>
            <span style={S.label}>You pay</span>
            <BalDisplay symbol={tokenIn.symbol} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              type="number" placeholder="0.00" value={amountIn}
              onChange={e => setAmountIn(e.target.value)}
              style={{ ...S.amount, color: noTokenIn ? 'var(--red)' : 'var(--plat)' }}
            />
            <TokenSelect token={tokenIn} onChange={t => { setTokenIn(t); setAmountOut(''); setUsdValue(null); setQuoteError(null) }} exclude={tokenOut} />
          </div>
          <div style={{ ...S.row, marginTop: '8px' }}>
            <span style={{ fontSize: '12px', color: noTokenIn ? 'var(--red)' : 'var(--muted)' }}>
              {usdValue && !noTokenIn ? `≈ $${usdValue} USD` : noTokenIn ? `Balance: ${tokenInBal.toFixed(4)} — insufficient` : ''}
            </span>
            {!noTokenIn && tokenInBal > 0 && (
              <button onClick={() => setAmountIn(String(tokenInBal))} style={{ fontSize: '11px', fontWeight: '700', color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'IBM Plex Mono, monospace' }}>MAX</button>
            )}
          </div>
        </div>

        {/* Swap button */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
          <button onClick={swap} style={{ width: '34px', height: '34px', borderRadius: '50%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--silver)', fontSize: '15px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⇅</button>
        </div>

        {/* Token Out */}
        <div style={{ ...S.inner, marginBottom: '16px' }}>
          <div style={{ ...S.row, marginBottom: '10px' }}>
            <span style={S.label}>You receive</span>
            <BalDisplay symbol={tokenOut.symbol} />
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: '32px', fontWeight: '700', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--green)', minHeight: '40px', display: 'flex', alignItems: 'center' }}>
              {quoting
                ? <span style={{ fontSize: '13px', color: 'var(--muted)' }}>Fetching price…</span>
                : amountOut ? amountOut
                : <span style={{ color: 'var(--border)', fontSize: '28px' }}>0.00</span>
              }
            </div>
            <TokenSelect token={tokenOut} onChange={t => { setTokenOut(t); setAmountOut(''); setUsdValue(null); setQuoteError(null) }} exclude={tokenIn} />
          </div>
          {amountOut && !quoting && !quoteError && (
            <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '8px' }}>Live oracle price · 1% slippage protection</div>
          )}
          {quoteError && <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '8px' }}>{quoteError}</div>}
        </div>

        {/* Fee row */}
        <div style={{ ...S.inner, ...S.row, marginBottom: '16px', padding: '12px 16px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--silver)' }}>Fee in $FIB</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>Principal always 100% preserved</div>
          </div>
          <div style={{ padding: '4px 10px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '8px', fontSize: '12px', color: 'var(--white)', fontWeight: '700', fontFamily: 'IBM Plex Mono, monospace' }}>
            {amountIn ? `${fee} FIB` : '$FIB ✓'}
          </div>
        </div>

        {/* Fee breakdown */}
        {amountIn && (
          <div style={{ padding: '12px 16px', background: 'rgba(0,255,135,0.03)', border: '1px solid rgba(0,255,135,0.08)', borderRadius: '12px', marginBottom: '16px' }}>
            {[
              ['Protocol fee (0.20%)', `${fee} FIB`],
              ['Your FIB balance',     `${fibBal.toFixed(4)} FIB`],
              ['Slippage tolerance',   '1.00%'],
              ['Value preserved',      '100% ✓'],
            ].map(([k, v], i) => (
              <div key={k} style={{ ...S.row, marginBottom: i < 3 ? '6px' : 0 }}>
                <span style={S.divKey}>{k}</span>
                <span style={{ ...S.divVal, color: k === 'Value preserved' ? 'var(--green)' : k === 'Your FIB balance' && !hasEnoughFib ? 'var(--red)' : 'var(--silver)' }}>{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', color: 'var(--red)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* Success */}
        {txHash && (
          <div style={{ padding: '12px 16px', background: 'rgba(0,255,135,0.06)', border: '1px solid rgba(0,255,135,0.15)', borderRadius: '10px', marginBottom: '14px', fontSize: '13px', color: 'var(--green)' }}>
            <div style={{ ...S.row, marginBottom: '8px' }}>
              <span style={{ fontWeight: '700' }}>Slot filled</span>
              <button onClick={() => setTxHash(null)} style={{ background: 'none', border: 'none', color: 'var(--green)', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
            </div>
            <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--green)', textDecoration: 'underline', display: 'block', marginBottom: '8px', fontSize: '12px', fontFamily: 'IBM Plex Mono, monospace' }}>
              {txHash.slice(0,20)}… ↗
            </a>
            <Link href="/history" style={{ display: 'inline-block', padding: '6px 12px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: 'var(--green)', textDecoration: 'none' }}>
              View History →
            </Link>
          </div>
        )}

        {/* CTA */}
        <button
          onClick={walletAddr ? handleSlot : onConnect}
          disabled={loading || (walletAddr && !canSlot)}
          style={{
            width: '100%', padding: '16px', borderRadius: '14px',
            fontSize: '15px', fontWeight: '800', border: 'none',
            cursor: loading || (walletAddr && !canSlot) ? 'not-allowed' : 'pointer',
            background: !walletAddr ? 'var(--plat)' : canSlot ? 'var(--plat)' : 'rgba(255,255,255,0.04)',
            color: !walletAddr ? 'var(--bg)' : canSlot ? 'var(--bg)' : 'var(--muted)',
            transition: 'all 0.2s', letterSpacing: '0.04em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          }}>
          {loading
            ? <><span className="spinner" style={{ borderTopColor: 'var(--bg)' }} /> Slotting…</>
            : quoting     ? 'Getting live price…'
            : !walletAddr ? 'Connect Wallet'
            : noFib       ? 'Get FIB to Slot'
            : lowFib      ? 'Insufficient FIB'
            : noTokenIn   ? `Insufficient ${tokenIn.symbol}`
            : quoteError  ? 'Token pair not supported'
            : 'SLOT NOW'
          }
        </button>
      </div>

      {/* Info cards */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '24px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '480px' }}>
        {[
          { icon: '', title: 'Instant',    desc: '~3-10 second fills' },
          { icon: '', title: '100% Value', desc: 'Fee paid in FIB'    },
          { icon: '', title: 'Live Price', desc: 'Chainlink oracle'    },
        ].map(c => (
          <div key={c.title} style={{ flex: 1, minWidth: '110px', padding: '14px', borderRadius: '12px', background: 'var(--card)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '5px' }}>{c.icon}</div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--silver)', marginBottom: '3px' }}>{c.title}</div>
            <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TokenSelect({ token, onChange, exclude }) {
  const [open,   setOpen]   = useState(false)
  const [imgErr, setImgErr] = useState({})
  const options    = SUPPORTED_TOKENS.filter(t => t.symbol !== exclude.symbol)
  const categories = ['Protocol', 'Stablecoin', 'EVM', 'Non-EVM']

  const Logo = ({ t, size = 20 }) => {
    if (t.logoUrl && !imgErr[t.symbol]) {
      return <img src={t.logoUrl} alt={t.symbol} onError={() => setImgErr(p => ({...p, [t.symbol]: true}))} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    }
    return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.55, fontWeight: '700', color: 'var(--silver)', flexShrink: 0 }}>{t.symbol[0]}</div>
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--plat)', cursor: 'pointer', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap' }}>
        <Logo t={token} size={18} />
        {token.symbol}
        <span style={{ fontSize: '9px', color: 'var(--muted)' }}>▼</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
          <div style={{ position: 'absolute', top: '46px', right: 0, zIndex: 99, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '14px', padding: '8px', minWidth: '210px', maxHeight: '340px', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.7)' }}>
            {categories.map(cat => {
              const catTokens = options.filter(t => t.category === cat)
              if (!catTokens.length) return null
              return (
                <div key={cat}>
                  <div style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 12px 4px' }}>{cat}</div>
                  {catTokens.map(t => (
                    <button key={t.symbol} onClick={() => { onChange(t); setOpen(false) }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 12px', background: 'none', border: 'none', color: 'var(--plat)', cursor: 'pointer', borderRadius: '8px', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <Logo t={t} size={22} />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700' }}>{t.symbol}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{t.name}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}