import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planOne, type BatchPlan } from '../core/batch.ts';
import {
  canRedo, canUndo, coalesceKey, historyOf, isUndoable, record, redo, undo, type History,
} from '../core/history.ts';
import { activeLocale } from '../core/locales.ts';
import {
  apply, createProject, MAX_PHOTOS, photoTimings, type Command,
} from '../core/project.ts';
import { buildSpec } from '../core/spec.ts';
import { posterTime } from '../core/timing.ts';
import type { Photo, Project, Spec } from '../core/types.ts';
import { LayerBoxes } from './LayerBoxes.tsx';
import { Clock } from './clock.ts';
import { CreativeCell } from './CreativeCell.tsx';
import { themeIcon, themeLabel, useTheme } from './theme.ts';
import { useExport } from './export.ts';
import { FilePicker } from './FilePicker.tsx';
import { importFiles, importReplacement, NOTHING_IMPORTED, type ImportReport } from './import-files.ts';
import { LocaleBar } from './LocaleBar.tsx';
import { explainRefusal, openProjectFile, saveProjectFile } from './project-file.ts';
import { fetchVoices, type VoiceCatalogue } from './server.ts';
import { SidePanel } from './SidePanel.tsx';
import { autosaver, loadAutosave, type SaveState } from './store.ts';
import { Timeline } from './Timeline.tsx';
import { useTopicBatch } from './topic-batch.ts';
import { useTranslator } from './translate.ts';

/** Width of one grid cell in CSS pixels — four of these fit the work area. */
const CELL_WIDTH = 260;

/** Which way each arrow key moves a button, in canvas pixels. */
const NUDGES: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

interface Cell {
  photo: Photo;
  spec: Spec;
  /** The frame this cell freezes on while it is not selected. */
  poster: number;
}

export function App() {
  const [history, setHistory] = useState<History<Project>>(() => historyOf(createProject()));
  const [activeButton, setActiveButton] = useState<number | null>(null);
  // One layer is being edited at a time, whichever kind it is: two sets of
  // handles on one frame would leave the arrow keys with nothing to aim at.
  const [activeProp, setActiveProp] = useState<number | null>(null);
  const [report, setReport] = useState<ImportReport>(NOTHING_IMPORTED);
  const [status, setStatus] = useState('');
  const [dropping, setDropping] = useState(false);
  const [catalogue, setCatalogue] = useState<VoiceCatalogue | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');

  const project = history.present;

  // The keyboard and the file readers run outside React's render, and both need
  // the project as it is now rather than as it was when they were bound.
  const latest = useRef(project);
  latest.current = project;

  /**
   * The project-wide values that reach every Spec without touching a photo.
   *
   * The language and its edits are two of them, and they have to be here rather
   * than left to `project.locales`: the cell cache below is keyed by photo
   * identity, and retyping a headline changes no photo at all. Without the words
   * in this key every frame would keep the text it was built with.
   */
  const settings =
    `${project.canvas.width}x${project.canvas.height}/${project.fps}/${project.duration}` +
    `/${project.activeLocale}/${JSON.stringify(activeLocale(project).overrides)}` +
    // Not on any frame, but they are in the file — and the autosave watches this
    // string, so leaving them out means the model and the voice never reach disk.
    `/${project.voiceId}/${project.modelId}/${project.fitToVoice}`;

  const clock = useMemo(() => new Clock(project.duration), []);
  const theme = useTheme();
  clock.duration = project.duration;

  const dispatch = useCallback((command: Command) => {
    setHistory(h => {
      const next = apply(h.present, command);
      if (next === h.present) return h;
      // Selection changes the project without being an edit: it moves the state
      // along but leaves nothing on the stack to walk back through.
      return isUndoable(command)
        ? record(h, next, coalesceKey(command))
        : { ...h, present: next, key: null };
    });
  }, []);

  /** Stepping the history. The button being edited is a position in a photo that
   *  may not exist on the other side of the step, so it does not survive one. */
  const walk = useCallback((step: (h: History<Project>) => History<Project>) => {
    setHistory(step);
    setActiveButton(null);
  }, []);

  /** Swapping the whole project — opening a file, starting over — is one undo step. */
  const replaceProject = useCallback((next: Project) => {
    setHistory(h => record(h, next));
    setActiveButton(null);
    setReport(NOTHING_IMPORTED);
  }, []);

  useEffect(() => {
    void loadAutosave().then(saved => {
      if (saved !== null) setHistory(historyOf(saved));
    });
    // Asked once. Which voices an account has does not change while the editor
    // is open, and a failure here is not a reason to stop editing — the panel
    // simply offers the project default and says nothing about the rest.
    void fetchVoices().then(setCatalogue).catch(() => setCatalogue(null));
  }, []);

  const run = useExport();
  const translator = useTranslator(project, dispatch);
  const topic = useTopicBatch(project, replaceProject);
  // The keyboard handler is bound once; it reads the binding as it is now.
  const topicRef = useRef(topic);
  topicRef.current = topic;

  const store = useMemo(() => autosaver(setSaveState), []);
  // Selection is not part of a saved project, so clicking through the batch must
  // not re-serialise it: the effect watches what actually lands in the file.
  useEffect(() => {
    store.save(project);
    // Watched on what a saved file actually holds. Selection is not in it, so
    // clicking through a batch must not re-serialise tens of megabytes.
  }, [project.photos, project.locales, settings, store]);
  useEffect(() => store.stop, [store]);

  const scale = CELL_WIDTH / project.canvas.width;
  const selected = useMemo(() => new Set(project.selection), [project.selection]);

  // A cell rebuilds its whole DOM when its Spec changes, so a Spec must not be
  // rebuilt for a photo the change did not touch. Selection alone leaves
  // `photos` identical, and an edit replaces only the photos it edits — so
  // clicking through a batch of twelve rebuilds nothing, and a drag rebuilds
  // only what it is broadcast to.
  //
  // The cache is keyed by photo identity and thrown away whole when `settings`
  // changes. Entries for photos that are gone go with the old map rather than
  // holding their images alive.
  const cache = useRef({ settings, entries: new Map<Photo, Cell>() });

  const cells = useMemo(() => {
    const reusable = cache.current.settings === settings
      ? cache.current.entries
      : new Map<Photo, Cell>();
    const fresh = new Map<Photo, Cell>();
    const list = project.photos.map(photo => {
      const entry = reusable.get(photo) ?? {
        photo,
        spec: buildSpec(project, photo.id)!,
        poster: posterTime(photoTimings(photo), project.duration),
      };
      fresh.set(photo, entry);
      return entry;
    });
    cache.current = { settings, entries: fresh };
    return list;
  }, [project, settings]);

  const onFiles = useCallback(async (list: FileList | null): Promise<void> => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const batch = await importFiles(files, MAX_PHOTOS - latest.current.photos.length);
    setReport({ warnings: batch.warnings, rejected: batch.rejected });
    if (batch.photos.length > 0) {
      dispatch({ type: 'photo/add', photos: batch.photos });
      setActiveButton(null);
    }
  }, [dispatch]);

  const onReplace = useCallback(async (list: FileList | null): Promise<void> => {
    const file = list?.[0];
    const id = latest.current.activeId;
    if (!file || id === null) return;
    const result = await importReplacement(file);
    setReport(result.ok ? NOTHING_IMPORTED : { warnings: [], rejected: [result.reason] });
    if (result.ok) dispatch({ type: 'photo/replace', id, name: result.name, image: result.image });
  }, [dispatch]);

  /**
   * The layer being edited, as the keyboard needs it: outside React's render.
   * One of the two at a time, so the arrows always have a single target.
   */
  const editing = useRef<{ kind: 'button' | 'prop'; index: number } | null>(null);
  editing.current = activeButton !== null
    ? { kind: 'button', index: activeButton }
    : activeProp !== null ? { kind: 'prop', index: activeProp } : null;

  // ------------------------------------------------------------ keyboard --
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // Undo and select-all inside a typed field belong to the field — but only
      // one that takes typing. Swallowing them for every input would leave Esc
      // and ⌘A dead after the duration slider or a checkbox took focus.
      // `instanceof` rather than a cast: a keydown can arrive with `window` as
      // its target, and that has no `matches`.
      const target = e.target;
      const typing = target instanceof HTMLElement
        && target.matches('textarea, input[type=text], input[type=number]');
      if (typing) return;
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        walk(e.shiftKey ? redo : undo);
        return;
      }
      // ⌘S goes to the folder the batch is bound to, and to a download when it
      // is not bound — the same two places the header button writes to.
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (latest.current.photos.length === 0) return;
        if (topicRef.current.location !== null) topicRef.current.save();
        else saveProjectFile(latest.current);
        return;
      }
      if (meta && e.key.toLowerCase() === 'a' && latest.current.photos.length > 0) {
        e.preventDefault();
        dispatch({ type: 'selection/all' });
        return;
      }
      if (e.key === 'Escape') {
        dispatch({ type: 'selection/one' });
        return;
      }

      const nudge = NUDGES[e.key];
      // A slider's own arrows move the playhead; a layer's move the layer.
      const onSlider = target instanceof HTMLElement && target.matches('input[type=range]');
      const layer = editing.current;
      if (!nudge || onSlider || layer === null || meta) return;
      e.preventDefault();
      // A step is one canvas pixel, which is what "по пікселю" has to mean when
      // the geometry is in percent and the cell on screen is a quarter size.
      const by = e.shiftKey ? 10 : 1;
      dispatch({
        type: layer.kind === 'button' ? 'button/nudge' : 'prop/nudge',
        ids: latest.current.selection,
        index: layer.index,
        by: { x: nudge.x * by, y: nudge.y * by },
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, walk]);

  // -------------------------------------------------------------- files --
  const onOpenFile = async (list: FileList | null): Promise<void> => {
    const file = list?.[0];
    if (!file) return;
    const result = await openProjectFile(file);
    if (result.ok) {
      replaceProject(result.project);
      setStatus(`Відкрито ${file.name}`);
    } else {
      setReport({ warnings: [], rejected: [`${file.name}: ${explainRefusal(result.reason)}`] });
    }
  };

  /** The one creative on screen, planned exactly as a release plans eighty. */
  const onExportOne = useCallback((): BatchPlan | null => {
    const current = latest.current;
    return current.activeId === null ? null : planOne(current, current.activeId);
  }, []);

  return (
    <div
      className={'app' + (dropping ? ' dropping' : '')}
      // The whole window takes a batch, not just the panel's small target.
      onDragEnter={e => { e.preventDefault(); setDropping(true); }}
      onDragOver={e => { e.preventDefault(); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={e => { e.preventDefault(); setDropping(false); void onFiles(e.dataTransfer.files); }}
    >
      <header>
        <div className="brand"><span className="mark" /> Creative Factory Search</div>
        <div className="tools">
          <button
            className="theme"
            title={`${themeLabel[theme.choice]} — натисніть, щоб змінити`}
            aria-label={themeLabel[theme.choice]}
            onClick={theme.cycle}
          >
            {themeIcon[theme.choice]}
          </button>
          <button
            disabled={!canUndo(history)}
            title="Скасувати (⌘Z)"
            onClick={() => walk(undo)}
          >
            ↶
          </button>
          <button
            disabled={!canRedo(history)}
            title="Повторити (⇧⌘Z)"
            onClick={() => walk(redo)}
          >
            ↷
          </button>
          <FilePicker accept="application/json,.json" onPick={onOpenFile}>Відкрити</FilePicker>
          <button
            onClick={() => (topic.location === null ? saveProjectFile(project) : topic.save())}
            disabled={project.photos.length === 0 || (topic.location !== null && !topic.dirty)}
            title={topic.location === null
              ? 'Завантажити creatives.json (⌘S)'
              : `Зберегти в ${topic.location.launchKey}/${topic.location.batch} (⌘S)`}
          >
            Зберегти
          </button>
          {topic.location === null ? null : (
            <button
              onClick={() => saveProjectFile(project)}
              disabled={project.photos.length === 0}
              title="Резервний шлях: файл через браузер"
            >
              .json
            </button>
          )}
          <button
            onClick={() => replaceProject(createProject())}
            disabled={project.photos.length === 0}
          >
            Новий
          </button>
        </div>
        <div className="spacer" />
        {status === '' ? null : <div className="hint">{status}</div>}
        <div className={'save-state ' + saveState}>
          {saveState === 'failed'
            ? 'не зберігається — збережіть у файл'
            : saveState === 'pending' ? 'збереження…' : 'збережено'}
        </div>
        {topic.location === null ? null : (
          <div className={'save-state' + (topic.dirty ? ' dirty' : '')}>
            {topic.location.launchKey}/{topic.location.batch}
            {topic.dirty ? ' · не збережено в теку' : ' · у теці'}
          </div>
        )}
        <div className="hint">
          {project.photos.length}/{MAX_PHOTOS} фото · {project.canvas.width} ×{' '}
          {project.canvas.height} · {project.fps} fps · {project.duration.toFixed(1)} с
        </div>
      </header>

      <main>
        <section className="stage-area">
          {cells.length === 0 ? (
            <div className="empty">
              <b>Завантажте фото</b>
              <span>JPG або PNG, вертикальне 9:16 — можна одразу пачку</span>
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
                  active={photo.id === project.activeId}
                  caption={photo.name}
                  onSelect={additive => {
                    dispatch(additive
                      ? { type: 'photo/toggle', id: photo.id }
                      : { type: 'photo/activate', id: photo.id });
                    setActiveButton(null);
                    setActiveProp(null);
                  }}
                  overlay={
                    photo.id === project.activeId ? (
                      <>
                        <LayerBoxes
                          layers={photo.props}
                          activeIndex={activeProp}
                          cellWidth={CELL_WIDTH}
                          cellHeight={project.canvas.height * scale}
                          onSelect={index => { setActiveButton(null); setActiveProp(index); }}
                          onChange={rect =>
                            dispatch({
                              type: 'prop/patch',
                              ids: project.selection,
                              index: activeProp!,
                              patch: { rect },
                            })}
                        />
                        <LayerBoxes
                          layers={photo.buttons}
                          activeIndex={activeButton}
                          cellWidth={CELL_WIDTH}
                          cellHeight={project.canvas.height * scale}
                          onSelect={index => { setActiveProp(null); setActiveButton(index); }}
                          onChange={rect =>
                            dispatch({
                              type: 'button/patch',
                              ids: project.selection,
                              index: activeButton!,
                              patch: { rect },
                            })}
                        />
                      </>
                    ) : null
                  }
                />
              ))}
            </div>
          )}
          {cells.length > 0 ? <LocaleBar project={project} dispatch={dispatch} /> : null}
          {cells.length > 0 ? <Timeline clock={clock} duration={project.duration} /> : null}
        </section>

        <SidePanel
          project={project}
          dispatch={dispatch}
          activeButton={activeButton}
          setActiveButton={setActiveButton}
          activeProp={activeProp}
          setActiveProp={setActiveProp}
          onFiles={onFiles}
          onReplace={onReplace}
          report={report}
          catalogue={catalogue}
          translator={translator}
          run={run}
          onExportOne={onExportOne}
          topic={topic}
        />
      </main>
    </div>
  );
}
