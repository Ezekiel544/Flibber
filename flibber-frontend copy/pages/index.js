import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { CONTRACTS, SLOTTING_ABI, FIB_ABI, ORACLE_ABI, SUPPORTED_TOKENS } from '../lib/contracts'

export default function SlotPage({ account, provider }) {
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

  useEffect(() => {
    if (provider && account) init()
  }, [provider, account])

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
      setAmountOut(''); setUsdValue(null); setQuoteError(null)
      return
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
    } catch(e) {
      console.error(e)
      setBalancesLoaded(true)
    }
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
      setAmountOut(formatted.toFixed(
        tokenOut.decimals === 8 ? 8 : tokenOut.decimals === 6 ? 6 : tokenOut.decimals === 9 ? 6 : 4
      ))
      const priceIn = await oracle.getUSDPrice(tokenIn.address)
      const amtIn18 = parseFloat(amountIn) * (10 ** (18 - tokenIn.decimals))
      const usd     = (amtIn18 * parseFloat(ethers.formatEther(priceIn))) / 1e18
      setUsdValue(usd.toFixed(2))
    } catch(e) {
      console.error('Quote error:', e)
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

  // ── Balance & fee checks ───────────────────────────────────────
  const tokenInBal      = parseFloat(balances[tokenIn.symbol] || '0')
  const fibFeeNeeded    = amountIn ? parseFloat(amountIn) * 0.002 : 0
  const hasEnoughFib    = fibBal >= fibFeeNeeded
  const hasEnoughTokenIn = amountIn ? tokenInBal >= parseFloat(amountIn) : false

  const noFib      = walletAddr && balancesLoaded && fibBal === 0
  const lowFib     = walletAddr && balancesLoaded && amountIn && !hasEnoughFib && fibBal > 0
  const noTokenIn  = walletAddr && balancesLoaded && amountIn && parseFloat(amountIn) > 0 && !hasEnoughTokenIn

  const canSlot = walletAddr && hasEnoughFib && hasEnoughTokenIn && amountIn && amountOut && !quoting && !quoteError

  const handleSlot = async () => {
    if (!walletAddr)              return setError('Connect your wallet first')
    if (!amountIn || !amountOut)  return setError('Enter an amount first')
    if (!hasEnoughTokenIn)        return setError(`Insufficient ${tokenIn.symbol} balance.`)
    if (!hasEnoughFib)            return setError(`You need at least ${fibFeeNeeded.toFixed(6)} FIB to cover the fee.`)
    setLoading(true); setError(null); setTxHash(null)

    try {
      const { ethers } = await import('ethers')
      const signer = await provider.getSigner()
      const amtIn  = ethers.parseUnits(amountIn,  tokenIn.decimals)
      const amtOut = ethers.parseUnits(amountOut, tokenOut.decimals)
      const minAmountOut = (BigInt(amtOut.toString()) * 99n) / 100n

      // Step 1: Approve tokenIn
      const tokenContract = new ethers.Contract(tokenIn.address, FIB_ABI, signer)
      const allowance = await tokenContract.allowance(walletAddr, CONTRACTS.slottingEngine)
      if (BigInt(allowance.toString()) < BigInt(amtIn.toString())) {
        console.log('Approving tokenIn...')
        await (await tokenContract.approve(CONTRACTS.slottingEngine, ethers.MaxUint256)).wait()
        console.log('tokenIn approved')
      }

      // Step 2: Approve FIB for fee
      const fibFeeRaw = (BigInt(amtIn.toString()) * 20n) / 10000n
      if (tokenIn.symbol !== 'FIB') {
        const fib = new ethers.Contract(CONTRACTS.fibToken, FIB_ABI, signer)
        const fibAllowance = await fib.allowance(walletAddr, CONTRACTS.slottingEngine)
        if (BigInt(fibAllowance.toString()) < fibFeeRaw) {
          console.log('Approving FIB for fee...')
          await (await fib.approve(CONTRACTS.slottingEngine, ethers.MaxUint256)).wait()
          console.log('FIB fee approved')
        }
      }

      // Step 3: Request slot
      console.log('Requesting slot...')
      const slotContract = new ethers.Contract(CONTRACTS.slottingEngine, SLOTTING_ABI, signer)
      const tx      = await slotContract.requestSlot(tokenIn.address, amtIn, tokenOut.address, minAmountOut, walletAddr, 0)
      const receipt = await tx.wait()
      console.log('Slot confirmed!')

      setTxHash(receipt.hash)

      // Optimistic balance update
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

    } catch (e) {
      console.error('Slot error:', e)
      if (e?.message?.includes('slippage') || e?.reason?.includes('slippage')) {
        setError('Price moved too much. Please try again.')
      } else if (e?.message?.includes('insufficient') || e?.reason?.includes('ERC20')) {
        setError('Insufficient balance to cover fee. Visit the Faucet to get FIB.')
      } else if (e?.reason?.includes('not configured') || e?.message?.includes('not configured')) {
        setError('This token pair is not yet supported by the oracle.')
      } else {
        setError(e?.reason || e?.data?.message || e?.message || 'Transaction failed')
      }
    }
    setLoading(false)
  }

  const fee = amountIn ? (parseFloat(amountIn) * 0.002).toFixed(6) : '0'

  const BalDisplay = ({ symbol }) => (
    <span style={{ color: balancesRefreshing ? '#4A6070' : '#E8F0F8', fontFamily: 'Space Mono, monospace', transition: 'color 0.3s', fontSize: '13px' }}>
      {balances[symbol] || '0'}{balancesRefreshing ? ' ↻' : ''}
    </span>
  )

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', position: 'relative', zIndex: 1 }}>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '32px', marginBottom: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
        {[
          { label: 'Total Slots', value: slotCount.toLocaleString() },
          { label: 'Fee Rate',    value: '0.20% FIB' },
          { label: 'Network',     value: 'Base Sepolia' },
          { label: 'Value Loss',  value: '0%' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#00FF87' }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Warning banners */}
      {balancesLoaded && noFib && (
        <div style={{ width: '100%', maxWidth: '480px', marginBottom: '16px', padding: '14px 18px', background: 'rgba(255,170,0,0.07)', border: '1px solid rgba(255,170,0,0.3)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#FFAA00', marginBottom: '3px' }}>⚠️ You need FIB to slot</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', lineHeight: '1.5' }}>All slot fees are paid in $FIB. Your wallet currently has 0 FIB.</div>
          </div>
          <Link href="/faucet" style={{ flexShrink: 0, padding: '8px 14px', background: 'rgba(255,170,0,0.15)', border: '1px solid rgba(255,170,0,0.4)', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#FFAA00', textDecoration: 'none', whiteSpace: 'nowrap' }}>Get FIB 🚰</Link>
        </div>
      )}

      {balancesLoaded && lowFib && (
        <div style={{ width: '100%', maxWidth: '480px', marginBottom: '16px', padding: '14px 18px', background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#FF4444', marginBottom: '3px' }}>⚠️ Not enough FIB for fee</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', lineHeight: '1.5' }}>
              Need <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{fibFeeNeeded.toFixed(6)} FIB</span> · Have <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{fibBal.toFixed(4)} FIB</span>
            </div>
          </div>
          <Link href="/faucet" style={{ flexShrink: 0, padding: '8px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#FF4444', textDecoration: 'none', whiteSpace: 'nowrap' }}>Get FIB 🚰</Link>
        </div>
      )}

      {balancesLoaded && noTokenIn && (
        <div style={{ width: '100%', maxWidth: '480px', marginBottom: '16px', padding: '14px 18px', background: 'rgba(255,68,68,0.07)', border: '1px solid rgba(255,68,68,0.25)', borderRadius: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#FF4444', marginBottom: '3px' }}>⚠️ Insufficient {tokenIn.symbol} balance</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', lineHeight: '1.5' }}>
              You have <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{tokenInBal.toFixed(4)} {tokenIn.symbol}</span> but need <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{parseFloat(amountIn || 0).toFixed(4)} {tokenIn.symbol}</span>
            </div>
          </div>
          <Link href="/faucet" style={{ flexShrink: 0, padding: '8px 14px', background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '10px', fontSize: '12px', fontWeight: '700', color: '#FF4444', textDecoration: 'none', whiteSpace: 'nowrap' }}>Get tokens 🚰</Link>
        </div>
      )}

      {/* Main card */}
      <div style={{ width: '100%', maxWidth: '480px', background: 'rgba(13,17,23,0.9)', border: '1px solid #1E2A36', borderRadius: '20px', padding: '28px', backdropFilter: 'blur(20px)', boxShadow: '0 0 60px rgba(0,255,135,0.05)' }} className="animate-in">

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '800' }}>Slot Assets</h1>
          <span style={{ fontSize: '12px', color: '#7A95AE', fontFamily: 'Space Mono, monospace' }}>{slotCount} slots filled</span>
        </div>

        {/* Token In */}
        <div style={{ background: '#131920', borderRadius: '14px', padding: '16px', marginBottom: '8px', border: noTokenIn ? '1px solid rgba(255,68,68,0.3)' : '1px solid transparent' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>Slot In</span>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>Balance: <BalDisplay symbol={tokenIn.symbol} /></span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="number" placeholder="0.00" value={amountIn}
              onChange={e => setAmountIn(e.target.value)}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '28px', fontWeight: '700', color: noTokenIn ? '#FF4444' : '#E8F0F8', fontFamily: 'Space Mono, monospace' }}
            />
            <TokenSelect token={tokenIn} onChange={t => { setTokenIn(t); setAmountOut(''); setUsdValue(null); setQuoteError(null) }} exclude={tokenOut} />
          </div>
          {usdValue && !noTokenIn && (
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '6px' }}>≈ ${usdValue} USD</div>
          )}
          {noTokenIn && (
            <div style={{ fontSize: '12px', color: '#FF4444', marginTop: '6px' }}>
              Balance: {tokenInBal.toFixed(4)} {tokenIn.symbol} — not enough
            </div>
          )}
          {!noTokenIn && balances[tokenIn.symbol] && parseFloat(balances[tokenIn.symbol]) > 0 && (
            <button onClick={() => setAmountIn(balances[tokenIn.symbol])}
              style={{ marginTop: '4px', fontSize: '11px', color: '#00FF87', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}>MAX</button>
          )}
        </div>

        {/* Swap button */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
          <button onClick={swap} style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#1E2A36', border: '2px solid #131920', color: '#7A95AE', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⇅</button>
        </div>

        {/* Token Out */}
        <div style={{ background: '#131920', borderRadius: '14px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>Slot Out</span>
            <span style={{ fontSize: '13px', color: '#7A95AE' }}>Balance: <BalDisplay symbol={tokenOut.symbol} /></span>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1, fontSize: '28px', fontWeight: '700', color: '#00FF87', fontFamily: 'Space Mono, monospace', minHeight: '36px', display: 'flex', alignItems: 'center' }}>
              {quoting
                ? <span style={{ fontSize: '14px', color: '#7A95AE' }}>⟳ Fetching price...</span>
                : amountOut ? amountOut : <span style={{ color: '#2A3A4A' }}>0.00</span>
              }
            </div>
            <TokenSelect token={tokenOut} onChange={t => { setTokenOut(t); setAmountOut(''); setUsdValue(null); setQuoteError(null) }} exclude={tokenIn} />
          </div>
          {amountOut && !quoting && !quoteError && (
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '6px' }}>≈ ${usdValue || '—'} USD · Live oracle price · 1% slippage protection</div>
          )}
          {quoteError && <div style={{ fontSize: '12px', color: '#FF4444', marginTop: '6px' }}>{quoteError}</div>}
        </div>

        {/* Fee label */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#131920', borderRadius: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '13px', color: '#E8F0F8', fontWeight: '600' }}>Fee paid in $FIB</div>
            <div style={{ fontSize: '12px', color: '#7A95AE', marginTop: '2px' }}>Your principal is always 100% preserved</div>
          </div>
          <div style={{ padding: '4px 10px', background: 'rgba(0,255,135,0.1)', border: '1px solid rgba(0,255,135,0.3)', borderRadius: '8px', fontSize: '12px', color: '#00FF87', fontWeight: '700' }}>$FIB ✓</div>
        </div>

        {/* Fee breakdown */}
        {amountIn && (
          <div style={{ padding: '12px 16px', background: 'rgba(0,255,135,0.04)', border: '1px solid rgba(0,255,135,0.1)', borderRadius: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ color: '#7A95AE' }}>Protocol fee (0.20%)</span>
              <span style={{ color: '#E8F0F8', fontFamily: 'Space Mono, monospace' }}>{fee} FIB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ color: '#7A95AE' }}>Your FIB balance</span>
              <span style={{ color: hasEnoughFib ? '#E8F0F8' : '#FF4444', fontFamily: 'Space Mono, monospace' }}>{fibBal.toFixed(4)} FIB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
              <span style={{ color: '#7A95AE' }}>Slippage tolerance</span>
              <span style={{ color: '#E8F0F8' }}>1.00%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#7A95AE' }}>Value preserved</span>
              <span style={{ color: '#00FF87', fontWeight: '700' }}>100% ✓</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#FF4444', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
            <span>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#FF4444', cursor: 'pointer', fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* Success */}
        {txHash && (
          <div style={{ padding: '12px 16px', background: 'rgba(0,255,135,0.08)', border: '1px solid rgba(0,255,135,0.2)', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', color: '#00FF87' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontWeight: '700' }}>✅ Slot filled!</span>
              <button onClick={() => setTxHash(null)} style={{ background: 'none', border: 'none', color: '#00FF87', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>✕</button>
            </div>
            <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer"
              style={{ color: '#00FF87', textDecoration: 'underline', display: 'block', marginBottom: '8px' }}>View on Basescan ↗</a>
            <Link href="/history" style={{ display: 'inline-block', padding: '6px 12px', background: 'rgba(0,255,135,0.12)', border: '1px solid rgba(0,255,135,0.3)', borderRadius: '8px', fontSize: '12px', fontWeight: '700', color: '#00FF87', textDecoration: 'none' }}>
              View Slot History →
            </Link>
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={walletAddr ? handleSlot : () => {}}
          disabled={loading || (walletAddr && !canSlot)}
          style={{
            width: '100%', padding: '16px', borderRadius: '14px',
            fontSize: '16px', fontWeight: '800', border: 'none',
            cursor: loading || (walletAddr && !canSlot) ? 'not-allowed' : 'pointer',
            background: !walletAddr ? '#1E2A36' : canSlot ? 'linear-gradient(135deg, #00FF87, #00CC6A)' : '#1E2A36',
            color: canSlot ? '#080B0F' : '#7A95AE',
            transition: 'all 0.2s', letterSpacing: '0.5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
          }}>
          {loading
            ? <><span className="spinner" style={{ borderTopColor: '#080B0F' }} /> Slotting...</>
            : quoting
              ? '⟳ Getting live price...'
              : !walletAddr
                ? 'Connect Wallet to Slot'
                : noFib
                  ? 'Get FIB to Slot →'
                  : lowFib
                    ? 'Insufficient FIB for fee'
                    : noTokenIn
                      ? `Insufficient ${tokenIn.symbol}`
                      : quoteError
                        ? 'Token pair not supported'
                        : 'SLOT NOW →'
          }
        </button>
      </div>

      {/* Info cards */}
      <div style={{ display: 'flex', gap: '16px', marginTop: '32px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '480px' }}>
        {[
          { icon: '⚡', title: 'Instant',    desc: '~3-10 second fills'   },
          { icon: '🔒', title: '100% Value', desc: 'Fee paid in FIB only' },
          { icon: '🔮', title: 'Live Price', desc: 'Chainlink oracle'      },
        ].map(c => (
          <div key={c.title} style={{ flex: 1, minWidth: '120px', padding: '16px', borderRadius: '12px', background: 'rgba(13,17,23,0.8)', border: '1px solid #1E2A36', textAlign: 'center' }}>
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
  const options    = SUPPORTED_TOKENS.filter(t => t.symbol !== exclude.symbol)
  const categories = ['Protocol', 'Stablecoin', 'EVM', 'Non-EVM']

  const TokenLogo = ({ t, size = 20 }) => (
    t.logoUrl
      ? <img src={t.logoUrl} alt={t.symbol}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
          onError={e => { e.target.style.display = 'none' }}
        />
      : <span style={{ fontSize: size * 0.8 }}>{t.icon}</span>
  )

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#1E2A36', border: '1px solid #2A3A4A', borderRadius: '10px', color: '#E8F0F8', cursor: 'pointer', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap' }}>
        <TokenLogo t={token} size={18} />
        {token.symbol}
        <span style={{ fontSize: '10px', color: '#7A95AE' }}>▼</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '44px', right: 0, zIndex: 100, background: '#0D1117', border: '1px solid #1E2A36', borderRadius: '12px', padding: '8px', minWidth: '200px', maxHeight: '360px', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
          {categories.map(cat => {
            const catTokens = options.filter(t => t.category === cat)
            if (catTokens.length === 0) return null
            return (
              <div key={cat}>
                <div style={{ fontSize: '10px', color: '#4A6070', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', padding: '6px 12px 4px' }}>{cat}</div>
                {catTokens.map(t => (
                  <button key={t.symbol} onClick={() => { onChange(t); setOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 12px', background: 'none', border: 'none', color: '#E8F0F8', cursor: 'pointer', borderRadius: '8px', fontSize: '13px', fontWeight: '600', textAlign: 'left' }}>
                    <TokenLogo t={t} size={20} />
                    <span style={{ fontWeight: '700' }}>{t.symbol}</span>
                    <span style={{ fontSize: '11px', color: '#7A95AE' }}>{t.name}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}