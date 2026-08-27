import { useCallback, useMemo, useRef, useState } from 'react';
import { clampRect } from '../core/canvas.ts';
import { apply, createProject, MIN_BUTTON_SIZE, photoById, type Command } from '../core/project.ts';
import { buildSpec } from '../core/spec.ts';
import { posterTime } from '../core/timing.ts';
import type { Project, Rect } from '../core/types.ts';
import { Clock } from './clock.ts';
import { CreativeCell } from './CreativeCell.tsx';
import { importPhoto } from './import-photo.ts';
import { SidePanel } from './SidePanel.tsx';

/** Width of one grid cell in CSS pixels — four of these fit the work area. */
const CELL_WIDTH = 260;

export function App() {
  const [project, setProject] = useState<Project>(createProject);
  const [activeButton, setActiveButton] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const clock = useMemo(() => new Clock(project.duration), []);
  clock.duration = project.duration;

  const dispatch = useCallback((command: Command) => {
    setProject(p => apply(p, command));
  }, []);

  const scale = CELL_WIDTH / project.canvas.width;
  const selected = useMemo(() => new Set(project.selection), [project.selection]);

  const cells = useMemo(
    () => project.photos.map(photo => ({
      photo,
      spec: buildSpec(project, photo.id)!,
      poster: posterTime(photo.buttons.map(b => b.timing), project.duration),
    })),
    [project],
  );

  // One photo at a time: importing a batch, and reporting the ones that bounced,
  // is E2's story — the model already takes as many photos as it is given.
  const onFile = async (files: FileList | null): Promise<void> => {
    const file = files?.[0];
    if (!file) return;
    const result = await importPhoto(file);
    if (!result.ok) {
      setProblem(`${result.name}: ${result.reason}`);
      setWarning(null);
      return;
    }
    setProblem(null);
    setWarning(result.warning ? `${result.name}: ${result.warning}` : null);
    dispatch({ type: 'photo/add', photo: { id: result.id, name: result.name, image: result.image } });
    setActiveButton(null);
  };

  const onExport = async (): Promise<void> => {
    if (project.activeId === null) return;
    const spec = buildSpec(project, project.activeId);
    const photo = photoById(project, project.activeId);
    if (!spec || !photo) return;

    setBusy(true);
    const startedAt = Date.now();
    const tick = setInterval(
      () => setStatus(`Рендер… ${((Date.now() - startedAt) / 1000).toFixed(0)} с`),
      250,
    );
    try {
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error ?? response.statusText);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = photo.name.replace(/\.[^.]+$/, '') + '.mp4';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus(
        `Готово за ${((Date.now() - startedAt) / 1000).toFixed(1)} с · ` +
        `${(blob.size / 1_048_576).toFixed(1)} МБ`,
      );
    } catch (e) {
      setStatus('Помилка: ' + (e as Error).message);
    } finally {
      clearInterval(tick);
      setBusy(false);
    }
  };

  const activePhoto = photoById(project, project.activeId);
  const draggedRect =
    activePhoto && activeButton !== null ? activePhoto.buttons[activeButton]?.rect ?? null : null;

  return (
    <>
      <header>
        <div className="brand"><span className="mark" /> Creative Factory Search</div>
        <div className="spacer" />
        <div className="hint">
          {project.canvas.width} × {project.canvas.height} · {project.fps} fps ·{' '}
          {project.duration.toFixed(1)} с
        </div>
      </header>

      <main>
        <section className="stage-area">
          {cells.length === 0 ? (
            <div className="empty">
              <b>Завантажте фото</b>
              <span>JPG або PNG, вертикальне 9:16</span>
            </div>
          ) : (
            <div className="grid">
              {cells.map(({ photo, spec, poster }) => (
                <CreativeCell
                  key={photo.id}
                  spec={spec}
                  scale={scale}
                  animate={selected.has(photo.id)}
                  clock={clock}
                  posterAt={poster}
                  selected={selected.has(photo.id)}
                  caption={photo.name}
                  onSelect={() => {
                    dispatch({ type: 'photo/activate', id: photo.id });
                    setActiveButton(null);
                  }}
                  overlay={
                    photo.id === project.activeId && draggedRect ? (
                      <DragBox
                        rect={draggedRect}
                        cellWidth={CELL_WIDTH}
                        cellHeight={project.canvas.height * scale}
                        onChange={rect =>
                          dispatch({
                            type: 'button/patch',
                            ids: project.selection,
                            index: activeButton!,
                            patch: { rect },
                          })}
                      />
                    ) : null
                  }
                />
              ))}
            </div>
          )}
        </section>

        <SidePanel
          project={project}
          dispatch={dispatch}
          activeButton={activeButton}
          setActiveButton={setActiveButton}
          onFile={onFile}
          problem={problem}
          warning={warning}
          status={status}
          busy={busy}
          onExport={onExport}
        />
      </main>
    </>
  );
}

interface DragProps {
  rect: Rect;
  cellWidth: number;
  cellHeight: number;
  onChange: (rect: Rect) => void;
}

/**
 * The handle for moving and sizing a button. It works in percent throughout, so
 * the same gesture means the same thing whatever the cell is scaled to.
 */
function DragBox({ rect, cellWidth, cellHeight, onChange }: DragProps) {
  const drag = useRef<{ mode: 'move' | 'size'; x: number; y: number; from: Rect } | null>(null);

  const onPointerDown = (e: React.PointerEvent, mode: 'move' | 'size'): void => {
    e.stopPropagation();
    e.preventDefault();
    drag.current = { mode, x: e.clientX, y: e.clientY, from: rect };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const state = drag.current;
    if (!state) return;
    const dx = ((e.clientX - state.x) / cellWidth) * 100;
    const dy = ((e.clientY - state.y) / cellHeight) * 100;
    const next: Rect = state.mode === 'move'
      ? { ...state.from, x: state.from.x + dx, y: state.from.y + dy }
      : { ...state.from, w: state.from.w + dx, h: state.from.h + dy };
    onChange(clampRect(next, MIN_BUTTON_SIZE));
  };

  const stop = (e: React.PointerEvent): void => {
    if (!drag.current) return;
    drag.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="box"
      style={{
        left: (rect.x / 100) * cellWidth,
        top: (rect.y / 100) * cellHeight,
        width: (rect.w / 100) * cellWidth,
        height: (rect.h / 100) * cellHeight,
      }}
      onPointerDown={e => onPointerDown(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <div className="grip" onPointerDown={e => onPointerDown(e, 'size')} />
    </div>
  );
}
