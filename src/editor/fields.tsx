// The panel's controls, each taking a `Shared` value rather than a plain one.
// Mixed lives here, once: a control that had to decide for itself what to show
// when four photos disagree is a control that will eventually decide wrong.
import { useEffect, useRef, useState } from 'react';
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

interface TextAreaProps {
  value: Shared<string>;
  onChange: (value: string) => void;
  rows?: number;
  /**
   * Hold what was typed until the box is left, instead of writing it through.
   *
   * For a list, and only for a list. A list is parsed from its lines, so writing
   * as they are typed would delete the empty line the user has just made to type
   * the next item into. A paragraph survives being written through, and pays the
   * price of not: the preview is meant to follow every edit as it is made.
   */
  holdUntilBlur?: boolean;
}

/** The box for everything longer than a line — a paragraph, and a list. */
export function TextAreaField({ value, onChange, rows, holdUntilBlur }: TextAreaProps) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <textarea
      spellCheck={false}
      rows={rows ?? 3}
      className={value.mixed ? 'mixed' : ''}
      value={draft ?? (value.mixed ? '' : value.value)}
      placeholder={value.mixed ? MIXED_LABEL : ''}
      onChange={e => {
        if (holdUntilBlur) setDraft(e.target.value);
        else onChange(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null) onChange(draft);
        setDraft(null);
      }}
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

interface NumberProps {
  value: Shared<number>;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

/**
 * A box that keeps whatever was typed until the user is finished with it.
 *
 * Parsing on every keystroke would turn "1" into 1 and then refuse the "." after
 * it, so a value could never be reached by typing it left to right. The draft is
 * what was typed; `settled` is what the model says; the model wins as soon as
 * there is no draft.
 */
function useDraft(settled: string, commit: (text: string) => void) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    value: draft ?? settled,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value),
    onBlur: () => {
      // Only what was typed. The box shows a rounded value, so committing on
      // every blur would let clicking into a field and straight out of it write
      // that rounding back — a button nudged to 10.0926 silently becomes 10.09,
      // and takes a step on the undo stack for an edit nobody made.
      if (draft !== null) commit(draft);
      setDraft(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur();
    },
  };
}

export function NumberField({ value, onChange, min, max, step, suffix }: NumberProps) {
  const box = useDraft(
    value.mixed ? '' : String(round(value.value)),
    text => {
      const parsed = Number(text);
      // An emptied box is a box the user has not finished with, not a zero.
      if (text.trim() !== '' && Number.isFinite(parsed)) onChange(clampTo(parsed, min, max));
    },
  );

  return (
    <label className={'num' + (value.mixed ? ' mixed' : '')}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step ?? 1}
        placeholder={value.mixed ? MIXED_LABEL : ''}
        {...box}
      />
      {suffix ? <span className="suffix">{suffix}</span> : null}
    </label>
  );
}

interface OptionalNumberProps {
  value: Shared<number | null>;
  onChange: (value: number | null) => void;
  min?: number;
  step?: number;
  /** What an empty box means, spelled out where the user can read it. */
  emptyLabel: string;
}

/**
 * A number that may be left out. Empty is a value here rather than an unfinished
 * one — an empty hide time is "until the end", which is the answer most buttons
 * want, so it is worth being able to type your way back to it.
 */
export function OptionalNumberField(
  { value, onChange, min, step, emptyLabel }: OptionalNumberProps,
) {
  const box = useDraft(
    value.mixed || value.value === null ? '' : String(round(value.value)),
    text => {
      if (text.trim() === '') return onChange(null);
      const parsed = Number(text);
      if (Number.isFinite(parsed)) onChange(clampTo(parsed, min, undefined));
    },
  );

  return (
    <label className={'num' + (value.mixed ? ' mixed' : '')}>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step ?? 0.1}
        placeholder={value.mixed ? MIXED_LABEL : emptyLabel}
        {...box}
      />
    </label>
  );
}

interface SelectProps<T extends string> {
  value: Shared<T>;
  onChange: (value: T) => void;
  options: readonly { id: T; label: string }[];
}

export function SelectField<T extends string>({ value, onChange, options }: SelectProps<T>) {
  return (
    <select
      className={value.mixed ? 'mixed' : ''}
      // A select has no empty state, so mixed gets an option of its own — which
      // disappears the moment a real one is chosen, as it should.
      value={value.mixed ? '' : value.value}
      onChange={e => onChange(e.target.value as T)}
    >
      {value.mixed ? <option value="" disabled>{MIXED_LABEL}</option> : null}
      {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

/** Two decimals is finer than the eye on a preview and finer than a canvas pixel. */
const round = (v: number): number => Math.round(v * 100) / 100;

const clampTo = (v: number, min?: number, max?: number): number => {
  const lo = min === undefined ? v : Math.max(min, v);
  return max === undefined ? lo : Math.min(max, lo);
};
