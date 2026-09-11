# 20 — Прибрати предмети побуту

**What to build:** шар props видаляється повністю, не ховається: панель `PropLibrary`, каталог `core/props.ts`, `PropSpec` і розкладка props у `renderer/build.ts` і `renderer/preview.ts`, слоти props у `core/project.ts`, картинки в `public/props`. Старий `project.json` із полем `props` відкривається, поле мовчки відкидається. Код лишається в історії git.

**Blocked by:** —

**Status:** done (2026-09-11)

- [x] У редакторі немає панелі предметів, у моделі немає `props`, у `public/props` немає файлів
- [x] Проєкт, збережений із props, відкривається й експортується без них і без помилки; тест у `core`
- [x] Рендер кадру без props покритий наявними тестами таймінгу й розкладки, `npm test` і typecheck зелені
