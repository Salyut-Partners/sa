import { fromText, type Field } from '../core/fields.ts';
import type { Command } from '../core/project.ts';
import { templateEdited, templateText } from '../core/selection.ts';
import { templateById } from '../core/templates.ts';
import type { Project } from '../core/types.ts';
import { TextAreaField, TextField } from './fields.tsx';

interface Props {
  project: Project;
  targets: readonly string[];
  definitionId: string;
  dispatch: (command: Command) => void;
}

/** How tall a box a kind of field wants. A list grows with what is in it. */
const rowsFor = (field: Field, text: string): number =>
  field.kind === 'list' ? Math.min(9, Math.max(3, text.split('\n').length)) : 3;

/**
 * The template's own form, built from its schema.
 *
 * Nothing here names a field, a template or a kind of offer: the boxes come from
 * the record in the library, which is what lets a template be added without the
 * editor learning anything about it. Every box writes through the same broadcast
 * the rest of the panel uses, so a headline typed over four photos lands on all
 * four.
 */
export function TemplateFields({ project, targets, definitionId, dispatch }: Props) {
  const info = templateById(definitionId);
  if (info === null) return null;

  return (
    <>
      {info.schema.map(field => {
        const value = templateText(project, targets, field.key);
        const edited = templateEdited(project, targets, field.key);
        const write = (text: string): void =>
          dispatch({
            type: 'template/field', ids: targets, key: field.key,
            value: fromText(text, field.kind),
          });

        return (
          <div className="group" key={field.key}>
            <div className="lab">
              {field.label}
              {/* The mark says this box no longer follows the dictionary — which
                  is worth knowing before the batch goes out in seven languages. */}
              {edited ? <span className="edited" title="Змінено вручну">●</span> : null}
              {edited ? (
                <button
                  className="link"
                  onClick={() =>
                    dispatch({ type: 'template/field', ids: targets, key: field.key, value: null })}
                >
                  скинути
                </button>
              ) : null}
            </div>
            {field.kind === 'line'
              ? <TextField value={value} onChange={write} />
              : (
                <TextAreaField
                  value={value}
                  onChange={write}
                  rows={rowsFor(field, value.mixed ? '' : value.value)}
                  holdUntilBlur={field.kind === 'list'}
                />
              )}
            {field.kind === 'list' ? <div className="note">По одному рядку на елемент.</div> : null}
          </div>
        );
      })}
    </>
  );
}
