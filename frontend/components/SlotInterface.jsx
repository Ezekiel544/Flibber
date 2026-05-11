import { useState } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSlotting, useFeeEstimate } from '../hooks/useSlotting';
import { SUPPORTED_TOKENS } from '../context/FlibberContext';

const STATES = {
  idle: { label: 'Slot Now', color: 'var(--accent)' },
  approving: { label: 'Approving...', color: 'var(--yellow)' },
  slotting: { label: 'Slotting...', color: 'var(--yellow)' },
  success: { label: '✓ Slot Complete', color: 'var(--green)' },
  error: { label: 'Failed — Retry', color: 'var(--red)' },
};

export default function SlotInterface() {
  const { isConnected } = useAccount();
  const [tokenIn, setTokenIn] = useState(SUPPORTED_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState(SUPPORTED_TOKENS[1]);
  const [amount, setAmount] = useState('');
  const { requestSlot, slotState, error, resetState } = useSlotting();
  const feeEstimate = useFeeEstimate(amount);

  const handleSwap = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    resetState();
  };

  const handleSlot = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    await requestSlot(tokenIn.address, tokenOut.address, amount, 0);
  };

  const stateConfig = STATES[slotState] || STATES.idle;

  return (
    <div style={styles.card}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.headerTitle}>Slot Assets</span>
        <span style={styles.headerBadge}>0.2% fee • Instant</span>
      </div>

      {/* From */}
      <div style={styles.inputGroup}>
        <label style={styles.label}>You Deposit</label>
        <div style={styles.inputRow}>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={e => { setAmount(e.target.value); resetState(); }}
            style={styles.input}
          />
          <TokenSelect value={tokenIn} onChange={setTokenIn} exclude={tokenOut} />
        </div>
        <div style={styles.subLabel}>Principal fully preserved</div>
      </div>

      {/* Swap Arrow */}
      <button onClick={handleSwap} style={styles.swapBtn} title="Swap direction">
        ⇅
      </button>

      {/* To */}
      <div style={styles.inputGroup}>
        <label style={styles.label}>You Receive</label>
        <div style={styles.inputRow}>
          <div style={styles.outputAmount}>
            {amount || '0.00'}
          </div>
          <TokenSelect value={tokenOut} onChange={setTokenOut} exclude={tokenIn} />
        </div>
        <div style={{ ...styles.subLabel, color: 'var(--green)' }}>
          ✓ 100% of your deposit value
        </div>
      </div>

      {/* Fee Info */}
      {amount && parseFloat(amount) > 0 && (
        <div style={styles.feeBox}>
          <div style={styles.feeRow}>
            <span>Protocol fee (paid in $FIB)</span>
            <span style={{ fontFamily: 'var(--mono)' }}>{parseFloat(feeEstimate).toFixed(4)} FIB</span>
          </div>
          <div style={styles.feeRow}>
            <span>Slippage</span>
            <span style={{ color: 'var(--green)' }}>0%</span>
          </div>
          <div style={styles.feeRow}>
            <span>Estimated time</span>
            <span>~5 seconds</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={styles.errorBox}>{error}</div>
      )}

      {/* CTA */}
      {!isConnected ? (
        <div style={styles.connectWrap}>
          <ConnectButton />
        </div>
      ) : (
        <button
          onClick={handleSlot}
          disabled={!amount || slotState === 'approving' || slotState === 'slotting'}
          style={{
            ...styles.slotBtn,
            background: stateConfig.color,
            opacity: (!amount || slotState === 'approving' || slotState === 'slotting') ? 0.6 : 1,
          }}
        >
          {(slotState === 'approving' || slotState === 'slotting') && (
            <span style={styles.spinner} />
          )}
          {stateConfig.label}
        </button>
      )}
    </div>
  );
}

function TokenSelect({ value, onChange, exclude }) {
  const [open, setOpen] = useState(false);
  const options = SUPPORTED_TOKENS.filter(t => t.address !== exclude.address);

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={styles.tokenBtn}>
        <span>{value.logo}</span>
        <span>{value.symbol}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>▾</span>
      </button>
      {open && (
        <div style={styles.dropdown}>
          {options.map(token => (
            <button
              key={token.address}
              onClick={() => { onChange(token); setOpen(false); }}
              style={styles.dropdownItem}
            >
              <span>{token.logo}</span>
              <div>
                <div style={{ fontWeight: 600 }}>{token.symbol}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{token.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: 600 },
  headerBadge: {
    fontSize: 11,
    color: 'var(--text-muted)',
    background: 'var(--bg-hover)',
    padding: '3px 8px',
    borderRadius: 6,
    fontFamily: 'var(--mono)',
  },
  inputGroup: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '12px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 },
  subLabel: { fontSize: 11, color: 'var(--text-muted)' },
  inputRow: { display: 'flex', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text)',
    fontSize: 22,
    fontWeight: 600,
    fontFamily: 'var(--mono)',
    width: '100%',
  },
  outputAmount: {
    flex: 1,
    fontSize: 22,
    fontWeight: 600,
    fontFamily: 'var(--mono)',
    color: 'var(--green)',
  },
  swapBtn: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-muted)',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 16,
    alignSelf: 'center',
    transition: 'all 0.15s',
  },
  tokenBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '6px 10px',
    cursor: 'pointer',
    color: 'var(--text)',
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '110%',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-active)',
    borderRadius: 10,
    padding: 6,
    zIndex: 100,
    minWidth: 160,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text)',
    padding: '8px 10px',
    cursor: 'pointer',
    borderRadius: 6,
    textAlign: 'left',
    fontSize: 13,
  },
  feeBox: {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  feeRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'var(--text-muted)',
  },
  errorBox: {
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 12,
    color: 'var(--red)',
  },
  connectWrap: { display: 'flex', justifyContent: 'center' },
  slotBtn: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: 12,
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.2s',
    fontFamily: 'Space Grotesk, sans-serif',
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
