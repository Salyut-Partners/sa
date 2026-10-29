import { availableLocales, LOCALE_NAMES } from '../core/locales.ts';
import { FLAGS } from '../core/phrasebook.ts';
import type { Command } from '../core/project.ts';
import type { LocaleId, Project } from '../core/types.ts';
import type { Translator } from './translate.ts';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  translator: Translator;
}

/**
 * The languages strip, over the grid.
 *
 * It sits over the batch rather than in the panel because switching language
 * changes every cell at once: this is the control that says which release you
 * are looking at, and the grid under it is the answer.
 *
 * Each chip carries two separate things — whether it is the one on screen, and
 * whether it goes out in the next export. They are separate because checking a
 * translation you are not shipping yet is exactly the case worth supporting.
 */
export function LocaleBar({ project, dispatch, translator }: Props) {
  const spare = availableLocales(project);
  const going = project.locales.filter(l => l.include).length;

  return (
    <div className="locale-bar">
      <span className="lab">Мови</span>

      {project.locales.map(locale => (
        <div
          key={locale.id}
          className={
            'locale-chip' +
            (locale.id === project.activeLocale ? ' on' : '') +
            (locale.include ? '' : ' out')
          }
        >
          <label
            className="ship"
            title={locale.include ? 'Йде в експорт' : 'Не йде в експорт'}
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={locale.include}
              onChange={e =>
                dispatch({
                  type: 'locale/patch', id: locale.id, patch: { include: e.target.checked },
                })}
            />
          </label>
          <button
            type="button"
            className="pick"
            title={`Показати пачку ${LOCALE_NAMES[locale.id]}`}
            onClick={() => dispatch({ type: 'locale/activate', id: locale.id })}
          >
            {FLAGS[locale.id]} {LOCALE_NAMES[locale.id]}
            {locale.script.trim() === '' ? null : <span className="voiced" title="Є скрипт">♪</span>}
          </button>
          <button
            type="button"
            className="ic rm"
            title="Прибрати мову"
            disabled={project.locales.length === 1}
            onClick={() => dispatch({ type: 'locale/remove', id: locale.id })}
          >
            ×
          </button>
        </div>
      ))}

      {spare.length > 0 ? (
        <select
          className="add-locale"
          value=""
          onChange={e => translator.addLocale(e.target.value as LocaleId)}
        >
          <option value="" disabled>+ мова</option>
          {spare.map(id => (
            <option key={id} value={id}>{FLAGS[id]} {LOCALE_NAMES[id]}</option>
          ))}
        </select>
      ) : null}

      <span className="hint">
        {going === 0 ? 'жодна мова не йде в експорт' : `в експорт: ${going}`}
      </span>
    </div>
  );
}
