import { useEffect, useState } from 'react';
import { PALETTE, PALETTE_KEYS } from '../model/palette';
import type { ColorKey } from '../model/types';

export function Swatches({ value, onChange, kind = 'fill', allowAuto = true }: { value: ColorKey | undefined; onChange: (k: ColorKey) => void; kind?: 'fill' | 'line'; allowAuto?: boolean }) {
  const cur = value ?? 'auto';
  return (
    <div className="swatches">
      {allowAuto && <button className={`swatch auto${cur === 'auto' ? ' on' : ''}`} title="Default" onClick={() => onChange('auto')} />}
      {PALETTE_KEYS.map((k) => (
        <button
          key={k}
          className={`swatch${cur === k ? ' on' : ''}`}
          title={PALETTE[k].name}
          style={{ background: kind === 'fill' ? `var(--pal-${k}-fill)` : `var(--pal-${k}-line)` }}
          onClick={() => onChange(k)}
        />
      ))}
    </div>
  );
}

/** Number input that commits on blur/Enter, plus optional slider. */
export function NumberField({ value, onChange, min, max, step = 1, slider, width }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; slider?: boolean; width?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (t: string) => {
    const v = Math.max(min, Math.min(max, Number(t)));
    if (!Number.isNaN(v) && v !== value) onChange(Math.round(v / step) * step);
    else setText(String(value));
  };
  return (
    <>
      {slider && <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />}
      <input
        className="input sm num"
        style={width ? { width } : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
        inputMode="decimal"
      />
    </>
  );
}
