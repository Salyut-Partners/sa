import { CATEGORY_LABELS, propImage, PROPS, tintable, type PropCategory } from '../core/props.ts';

interface Props {
  /** Highlighted only when the whole selection agrees which object it is. */
  selectedId: string | null;
  onPick: (propId: string) => void;
}

const CATEGORIES: PropCategory[] = ['jobs'];

/**
 * The prop catalogue: every object drawn as it will appear on the frame.
 *
 * A grey tile means the artwork has no colour to move — chrome and black plastic
 * have no hue for a rotation to turn, so that prop wears whatever it was drawn
 * in whichever colour it is given. Said here rather than discovered after
 * dropping one on a photo and wondering why nothing happened.
 */
export function PropLibrary(props: Props) {
  return (
    <div className="prop-lib">
      {CATEGORIES.map(category => (
        <div key={category}>
          <div className="cat">{CATEGORY_LABELS[category]}</div>
          <div className="grid">
            {PROPS.filter(p => p.category === category).map(prop => (
              <button
                key={prop.id}
                className={'chip' + (prop.id === props.selectedId ? ' on' : '')}
                title={tintable(prop) ? prop.label : `${prop.label} — не змінює колір`}
                onClick={() => props.onPick(prop.id)}
              >
                <img src={propImage(prop.id)} alt="" />
                <span className="nm">{prop.label}</span>
                {tintable(prop) ? null : <span className="grey">сірий</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
