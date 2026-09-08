import type { Shared } from '../core/selection.ts';
import { timingIssues } from '../core/timing.ts';
import type { EnterAnimation, Timing } from '../core/types.ts';
import { NumberField, OptionalNumberField, SelectField } from './fields.tsx';

const ENTER_ANIMATIONS: readonly { id: EnterAnimation; label: string }[] = [
  { id: 'none', label: 'Без анімації' },
  { id: 'fade', label: 'Проявлення' },
  { id: 'pop', label: 'Вискок' },
  { id: 'rise', label: 'Знизу вгору' },
];

/** What a broken window means, in the words the user would use for it. */
const COMPLAINTS = {
  'appears-after-end': 'З’являється після кінця ролика — у відео її не буде.',
  'never-visible': 'Зникає раніше, ніж з’являється — у відео її не буде.',
  'hides-after-end': 'Зникає вже після кінця ролика — висітиме до кінця.',
  'entrance-cut-off': 'Не встигає доанімуватись до зникнення.',
} as const;

interface Props {
  /** The four numbers, each read across the selection. */
  read: <K extends keyof Timing>(key: K) => Shared<Timing[K]>;
  onChange: (patch: Partial<Timing>) => void;
  /**
   * The window the warnings are read off — the active photo's, not the
   * selection's. The panel says whose values it is showing, and a warning about
   * a window nobody can see would be worse than one about the window on screen.
   */
  timing: Timing;
  duration: number;
}

/**
 * When a layer is on screen. A button and a template wear the same four
 * controls because they are the same four numbers — story 52 asks not to have
 * to hold two systems in mind, and one component is how that is kept true.
 */
export function TimingFields({ read, onChange, timing, duration }: Props) {
  return (
    <>
      <div className="row">
        <NumberField
          value={read('appearAt')}
          onChange={appearAt => onChange({ appearAt })}
          min={0} step={0.1} suffix="з"
        />
        <OptionalNumberField
          value={read('hideAt')}
          onChange={hideAt => onChange({ hideAt })}
          min={0} step={0.1}
          emptyLabel="до кінця"
        />
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <SelectField
          value={read('enter')}
          options={ENTER_ANIMATIONS}
          onChange={enter => onChange({ enter })}
        />
        <NumberField
          value={read('enterDuration')}
          onChange={enterDuration => onChange({ enterDuration })}
          min={0} max={10} step={0.1} suffix="с"
        />
      </div>
      {timingIssues(timing, duration).map(issue => (
        <div className="warn" key={issue}>{COMPLAINTS[issue]}</div>
      ))}
    </>
  );
}
