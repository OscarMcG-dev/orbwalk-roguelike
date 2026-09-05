import type { ReactNode } from 'react';

export function Metric({ label, value, unit, warn = false }: { label: string; value: string; unit: string; warn?: boolean }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <div className={warn ? 'warn' : ''}>
        {value}
        <small>{unit}</small>
      </div>
    </div>
  );
}

export function Range({ label, value, display, min, max, step, disabled, change }: {
  label: string; value: number; display: string; min: number; max: number; step: number; disabled: boolean; change: (v: number) => void;
}) {
  return (
    <div className="range-setting">
      <div>
        <label>{label}</label>
        <output>{display}</output>
      </div>
      <input type="range" aria-label={label} value={value} min={min} max={max} step={step} disabled={disabled} onChange={e => change(Number(e.target.value))} />
    </div>
  );
}

export function Toggle({ checked, onChange, label, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; children: ReactNode }) {
  return (
    <label className="toggle">
      <span>{children}</span>
      <button type="button" role="switch" aria-checked={checked} aria-label={label} className={checked ? 'switch on' : 'switch'} onClick={() => onChange(!checked)}>
        <i />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} disabled={disabled} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="bar">
      <div style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}
