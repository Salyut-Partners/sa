import { useRef, useState } from 'react';
import { defaultButton, photoById, type ButtonPatch, type Command } from '../core/project.ts';
import type { Project } from '../core/types.ts';
import { BUTTON_STYLES } from '../renderer/index.ts';
import { StyleLibrary } from './StylePreview.tsx';

interface Props {
  project: Project;
  dispatch: (command: Command) => void;
  activeButton: number | null;
  setActiveButton: (index: number | null) => void;
  onFile: (files: FileList | null) => void;
  problem: string | null;
  warning: string | null;
  status: string;
  busy: boolean;
  onExport: () => void;
}

export function SidePanel(props: Props) {
  const { project, dispatch, activeButton, setActiveButton } = props;
  const photo = photoById(project, project.activeId);
  const targets = project.selection;
  const file = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const button = photo && activeButton !== null ? photo.buttons[activeButton] ?? null : null;

  /** Every button control edits the same slot across the same target set. */
  const patchButton = (patch: ButtonPatch): void => {
    if (activeButton === null) return;
    dispatch({ type: 'button/patch', ids: targets, index: activeButton, patch });
  };

  const addButton = (): void => {
    if (!photo) return;
    const index = photo.buttons.length;
    dispatch({
      type: 'button/add',
      ids: targets,
      button: defaultButton(crypto.randomUUID(), BUTTON_STYLES[0]!.id, index, photo.accent),
    });
    setActiveButton(index);
  };

  return (
    <aside className="side">
      <div className="group">
        <div className="lab">Фото</div>
        <div
          className={'drop' + (over ? ' over' : '')}
          onClick={() => file.current?.click()}
          onDragEnter={e => { e.preventDefault(); setOver(true); }}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); props.onFile(e.dataTransfer.files); }}
        >
          <div className="t">Перетягніть або натисніть</div>
          <div className="s">{photo ? photo.name : 'вертикальне 9:16'}</div>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={e => { props.onFile(e.target.files); e.target.value = ''; }}
        />
        {props.problem ? <div className="error">{props.problem}</div> : null}
        {props.warning ? <div className="warn">{props.warning}</div> : null}
        {photo ? (
          <button
            className="wide"
            style={{ marginTop: 8 }}
            onClick={() => { dispatch({ type: 'photo/remove', id: photo.id }); setActiveButton(null); }}
          >
            Прибрати фото
          </button>
        ) : null}
      </div>

      {photo ? (
        <>
          <hr />

          <div className="group">
            <div className="lab">
              Кнопки <span className="val">{photo.buttons.length}</span>
            </div>
            <div className="buttons-list">
              {photo.buttons.map((b, i) => (
                <div
                  key={b.id}
                  className={'button-row' + (i === activeButton ? ' on' : '')}
                  onClick={() => setActiveButton(i)}
                >
                  <span className="nm">{b.text || '(без тексту)'}</span>
                  <button
                    className="rm"
                    title="Видалити"
                    onClick={e => {
                      e.stopPropagation();
                      dispatch({ type: 'button/remove', ids: targets, index: i });
                      setActiveButton(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button className="wide" style={{ marginTop: 8 }} onClick={addButton}>
              + Додати кнопку
            </button>
          </div>

          {button ? (
            <>
              <div className="group">
                <div className="lab">Текст кнопки</div>
                <input
                  type="text"
                  spellCheck={false}
                  value={button.text}
                  onChange={e => patchButton({ text: e.target.value })}
                />
              </div>

              <div className="group">
                <div className="lab">Стиль</div>
                <StyleLibrary
                  selectedId={button.styleId}
                  color={button.color}
                  text={button.text}
                  onPick={styleId => patchButton({ styleId })}
                />
              </div>

              <div className="group">
                <div className="lab">Колір кнопки</div>
                <div className="row">
                  <input
                    type="color"
                    value={button.color}
                    onChange={e => patchButton({ color: e.target.value })}
                  />
                  <span className="hint">{button.color}</span>
                </div>
              </div>
            </>
          ) : null}

          <hr />

          <div className="group">
            <div className="lab">
              Тривалість <span className="val">{project.duration.toFixed(1)} с</span>
            </div>
            <input
              type="range"
              min={4}
              max={30}
              step={0.5}
              value={project.duration}
              onChange={e =>
                dispatch({ type: 'project/patch', patch: { duration: Number(e.target.value) } })}
            />
          </div>

          <div className="group">
            <div className="lab">Анімація</div>
            <label className="check">
              <input
                type="checkbox"
                checked={photo.glare}
                onChange={e =>
                  dispatch({ type: 'photo/patch', ids: targets, patch: { glare: e.target.checked } })}
              />
              Блік по кнопці
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={photo.pushIn}
                onChange={e =>
                  dispatch({ type: 'photo/patch', ids: targets, patch: { pushIn: e.target.checked } })}
              />
              Повільний наїзд на фон
            </label>
          </div>

          <hr />

          <button className="primary" disabled={props.busy} onClick={props.onExport}>
            Експортувати MP4
          </button>
          <div className="note">{props.status}</div>
        </>
      ) : null}
    </aside>
  );
}
