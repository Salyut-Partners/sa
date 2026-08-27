// The panel's controls, each taking a `Shared` value rather than a plain one.
// Mixed lives here, once: a control that had to decide for itself what to show
// when four photos disagree is a control that will eventually decide wrong.
import { useEffect, useRef } from 'react';
import type { Shared } from '../core/selection.ts';

export const MIXED_LABEL = 'різні значення';

interface TextProps {
  value: Shared<string>;
  onChange: (value: string) => void;
}

/** Typing into a mixed field writes what was typed onto every selected photo. */
export function TextField({ value, onChange }: TextProps) {
  return (
    <input
      type="text"
      spellCheck={false}
      className={value.mixed ? 'mixed' : ''}
      value={value.mixed ? '' : value.value}
      placeholder={value.mixed ? MIXED_LABEL : ''}
      onChange={e => onChange(e.target.value)}
    />
  );
}

interface ColorProps {
  value: Shared<string>;
  onChange: (value: string) => void;
}

export function ColorField({ value, onChange }: ColorProps) {
  return (
    <div className="row">
      <input
        type="color"
        // A colour well has no way to look undecided, so it falls back to a
        // neutral and the label next to it says what is really going on.
        value={value.mixed ? '#808080' : value.value}
        onChange={e => onChange(e.target.value)}
      />
      <span className={'hint' + (value.mixed ? ' mixed-note' : '')}>
        {value.mixed ? MIXED_LABEL : value.value}
      </span>
    </div>
  );
}

interface CheckProps {
  value: Shared<boolean>;
  onChange: (value: boolean) => void;
  label: string;
}

export function CheckField({ value, onChange, label }: CheckProps) {
  const box = useRef<HTMLInputElement>(null);

  // `indeterminate` is not an attribute, only a property — React cannot set it.
  useEffect(() => {
    if (box.current) box.current.indeterminate = value.mixed;
  }, [value.mixed]);

  return (
    <label className="check">
      <input
        ref={box}
        type="checkbox"
        checked={value.mixed ? false : value.value}
        // From mixed, the first click turns it on everywhere — the same rule the
        // text field follows: one action ends the disagreement.
        onChange={e => onChange(value.mixed ? true : e.target.checked)}
      />
      {label}
      {value.mixed ? <span className="mixed-note"> · {MIXED_LABEL}</span> : null}
    </label>
  );
}
