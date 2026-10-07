# PRD — Залив з вкладки «Креативи», без стану

**Status:** ready-for-agent

Узгоджено з Артемом 2026-09-30 у сесії grilling. Цей документ **заміняє**
`prd-autolaunch.md` у всьому, що стосується заливу: файловий світ
`launches/`, `sa plan`/`apply` і таб «Заливи» йдуть в історію git.

---

## Problem Statement

Байер робить креатив у редакторі й хоче, щоб на платформі з'явилася нова
кампанія. Зараз між цими двома точками стоїть цілий світ: тека заливу
`launches/<key>/`, `topic.yaml` і `campaign.yaml`, `sa new`, `sa adopt`,
`sa expand`, `sa plan`, `sa apply --confirm`, таб «Заливи» з планом і
галочками, синхронізація статей, ключів і ваг. Цей світ тримає стан — теку, яка
має збігатися з платформою, — і тому постійно розходиться з нею: кампанію
створили руками, статтю поправили в адмінці, топік завели без `sa new` — і
план або відмовляється, або пропонує «довести» платформу до теки, що коштує
гроші.

Байеру ж потрібно одне: взяти щойно зроблений креатив, вибрати топік і
зв'язку «термгрупа + стаття», підправити кабінет, країну, бюджет і бід — і
натиснути кнопку. Решта полів у нього майже завжди однакова, а ставити на
паузу старі кампанії чи керувати сотнею кампаній зараз не треба.

Окремо: колега-байер заливає топік з англійськими креативами (VMhousEN) на
будь-яку англомовну моно-країну. Мова креативу і країна заливу — різні речі.

## Solution

Софт без стану. У вкладці «Креативи», в панелі експорту поруч із
«Завантажити», з'являється форма заливу:

1. **Топік** — зі списку топіків байера на платформі.
2. **Сет** — зв'язка «термгрупа + стаття». Показуються сети, в яких уже є
   кампанії (назви, не id; найсвіжіші зверху), і пункт «+ Новий сет» з
   двома селектами — термгрупа і стаття топіка з платформи. Назва кампанії
   значення не має.
3. **Креативи** — усі поточні рендери всіх мов з галочками плюс mp4 з диска
   (кнопкою або перетягуванням). Мови в одній кампанії можуть бути різні.
4. **Поля, які заповнює байер:** кабінет (без дефолту, щоразу свідомо),
   країна (одна; дефолт — з останньої кампанії сету), бюджет і бід,
   галочка «Launch tomorrow».
5. **Компактний блок дрібним шрифтом** з рештою полів і кнопкою
   «Редагувати»: TikTok · language All · RSOC 6 · піксель · тема · headline ·
   ротація ключів · вік / стать / пристрої / ОС · end date · розклад.

«Залити» відкриває модальне вікно з підсумком; «Підтвердити» — редактор
рендерить відмічені мови (якщо проєкт змінився з останнього рендеру),
вантажить креативи, створює headline, TSP і кампанію на платформі, показує
докладний прогрес по кроках і посилання на нову кампанію. Щоразу — нова
кампанія; старі не чіпаються і на паузу не ставляться. Після успіху вихідні
фото й медіа кладуться в `sources_root/<назва топіка>/`.

Статті, ключі, ваги, нові топіки й авто-правила налаштовуються на платформі
руками. Claude отримує дві команди лише на читання — `sa topics` і
`sa show <topic>` — і допомагає з текстами та комплаєнсом.

## User Stories

### Форма і вибір

1. As a buyer, I want the launch form right in the export panel of the «Креативи» tab, so that I go from a finished creative to a campaign without switching tabs.
2. As a buyer, I want to pick a topic from my topics on the platform, so that I never have to create or adopt a local folder first.
3. As a buyer, I want the topic list to come from the platform every time, so that a topic created by hand in the admin shows up immediately.
4. As a buyer, I want to see sets (termgroup + article) instead of a list of campaigns, so that ten relaunches of one bundle read as one line.
5. As a buyer, I want each set shown by the termgroup's and article's names, not ids, so that I recognise it at a glance.
6. As a buyer, I want sets ordered by their latest campaign, newest first, so that what I'm working on now is on top.
7. As a buyer, I want a «+ Новий сет» option with termgroup and article selects, so that I can launch a bundle that has no campaigns yet.
8. As a buyer, I want the form to tell me when the topic has no termgroup or no article, and keep the button disabled, so that I know to set it up on the platform first.
9. As a buyer, I want campaign names not to matter, so that I don't have to invent or keep naming conventions.

### Креативи

10. As a buyer, I want all current renders of all languages in the form, each with a checkbox, so that I choose what goes into the campaign.
11. As a buyer, I want to add mp4 files from disk by button or drag-and-drop, so that a designer's video can be launched without the editor.
12. As a buyer, I want to remove any creative from the list with a cross, so that I can trim the campaign before launch.
13. As a buyer, I want creatives of different languages allowed in one campaign, so that my mixed-language tests are possible.
14. As a buyer, I want the launch to render only when the project changed since the last render, so that I don't wait for the same video twice.

### Поля заливу і дефолти

15. As a buyer, I want the cabinet field empty until I pick one, so that I choose the cabinet consciously every time.
16. As a buyer, I want dead cabinets hidden from the cabinet list, so that I don't launch into a banned account.
17. As a buyer, I want the launch button disabled until a cabinet is picked, so that a campaign never goes to a cabinet by accident.
18. As a buyer, I want to pick the country independently of the creative's language, so that English creatives can go to any English-speaking mono-country.
19. As a buyer, I want the country defaulting to the country of the set's latest campaign, so that a relaunch needs no change.
20. As a buyer, I want one country per launch, so that one click means exactly one new campaign.
21. As a buyer, I want the form to keep its values after a launch, so that launching the same set to a second country is one select change and one click.
22. As a buyer, I want budget and bid defaulting to the set's latest campaign, so that a relaunch keeps my last numbers.
23. As a buyer, I want a new set to take budget and bid from the topic's latest campaign, then the team default 20 / 0.45, so that the numbers are sensible even on the first launch.
24. As a buyer, I want a «Launch tomorrow» checkbox next to budget and bid, so that I decide between a scheduled start tomorrow and a start right after approval.
25. As a buyer, I want «Launch tomorrow» defaulting to the set's latest campaign, and on for a new set, so that the usual rhythm stays the default.
26. As a buyer, I want «the set's latest campaign» to mean the newest by creation date excluding deleted ones, rejected included, so that after a reject I get the settings I just used.
27. As a buyer, I want the pixel defaulting to the set's latest campaign, then the topic's latest campaign, then the team's niche → pixel table, so that the pixel is right without me thinking.
28. As a buyer, I want the pixel list to come from the platform's pixels endpoint, so that I can switch to any pixel I own.
29. As a buyer, I want the niche guessed from the topic name for the niche → pixel fallback, and the pixel left for me to pick when the guess fails, so that no wrong pixel is chosen silently.

### Компактний блок

30. As a buyer, I want the auto-filled fields (TikTok, language All, RSOC 6, pixel, theme, headline, keyword rotation, age, gender, devices, OS, end date, schedule) visible in one compact small-font block, so that I see everything that will be sent.
31. As a buyer, I want an «Редагувати» button that expands the block into ordinary fields, so that I can change any of them when needed.
32. As a buyer, I want edits in the block to apply only to this launch, so that the team defaults stay predictable.
33. As a buyer, I want RSOC 6 as the team default and validated against the platform's allowed counts, so that an invalid value is caught before the launch.
34. As a buyer, I want the traffic source defaulting to TikTok and changeable, so that the rare non-TikTok launch is still possible.

### Підтвердження, прогрес, помилки

35. As a buyer, I want a modal with the full summary (topic, set, cabinet, country, budget, bid, start, pixel, creatives count and the compact block) and a «Підтвердити» button on every launch, so that I check live-money actions once more.
36. As a buyer, I want the modal to come before rendering, so that I don't wait a minute and then change my mind.
37. As a buyer, I want the button disabled while a launch runs, so that a double click doesn't create two campaigns.
38. As a buyer, I want detailed progress: render per language with percent, upload per creative with MB and percent, headline found or created, TSP with budget / bid / geo, campaign created with a link, sources saved, so that I see exactly where the launch is.
39. As a buyer, I want the failed step marked red with an explanation in plain words and a «Спробувати ще» button, so that I can recover without Claude.
40. As a buyer, I want a retry to reuse creatives already uploaded to the topic and a headline with the same text, so that a 50 MB video is never uploaded twice and the creative repo stays clean.
41. As a buyer, I want nothing billable created until the final step, so that a failure halfway costs nothing.
42. As a buyer, I want a link to the new campaign on the platform after success, so that I can open it right away.
43. As a buyer, I want old campaigns of the set left untouched — never paused, never edited — so that the launch only adds.

### Ісходники

44. As a buyer, I want the source photos and media (without the project file and without the rendered mp4) saved to `sources_root/<topic name>/` on a successful launch, so that I can find what a creative was built from.
45. As a buyer, I want sources flat in the topic folder, identical files not duplicated, and same-named different files suffixed `-2`, so that the folder stays tidy.
46. As a buyer, I want `sources_root` set in my config with `~/sa/sources` as the default, so that it works without setup.

### Claude і команда

47. As a buyer, I want Claude to list my topics with `sa topics`, so that we can talk about them by name.
48. As a buyer, I want Claude to read a topic with `sa show <topic>` — termgroups, keywords, weights, articles, sets — so that it can help me write an article or keywords and check compliance.
49. As a buyer, I want Claude to have no way to write to the platform, so that articles and keywords change only by my hand in the admin.
50. As a team lead, I want team defaults (RSOC 6, 20 / 0.45, niche → pixel table, theme, headline, sources_root) shipped by `setup.sh`, so that every buyer launches with the same settings.
51. As a buyer, I want the old launches tab, `sa plan` / `apply` / `new` / `adopt` / `expand` and the `matrix` / `launch` skills gone, so that there's only one way to launch and nothing tries to sync a stale folder to the platform.

## Implementation Decisions

- **Без стану.** Жодних файлів заливу. Топіки, сети, дефолти і наявні креативи
  щоразу читаються з платформи (digifor) через наявний клієнт сервера.
  Єдине, що пишеться на диск, — ісходники в `sources_root`.
- **Новий чистий модуль у `core`** (робоча назва `quick-launch`) з двома
  функціями — єдиний тестований шар фічі:
  - `setsAndDefaults(snapshot, teamDefaults)` — знімок топіка з платформи
    (builder'и, TSP, кампанії зі статусами, термгрупи, статті, пікселі,
    кабінети) → список сетів, найсвіжіші зверху, і для кожного — дефолти
    форми; плюс дефолти «нового сету» для пари термгрупа × стаття і ознака
    «у топіка немає термгрупи / статті».
  - `launchSteps(form, snapshot)` — заповнена форма і знімок → впорядкований
    список кроків із тілами запитів: завантаження кожного креативу (або
    посилання на наявний у репозиторії топіка), headline (наявний з тим самим
    текстом або новий), TSP, builder. Помилки валідації (немає кабінету, RSOC
    поза `/rsoc-counts`, тема не знайдена) — до будь-якого кроку.
- **Сет** = (стаття, термгрупа). Інші осі, за якими групує нинішній `adopt`
  (джерело, кабінет, піксель, країна, мова), у ключ сету не входять.
- **Остання кампанія сету** — найновіша за датою створення, статус не
  DELETED; відхилені рахуються.
- **Ланцюги дефолтів:**
  - кабінет — без дефолту;
  - країна — остання кампанія сету; для нового сету порожньо;
  - бюджет / бід — остання кампанія сету → остання кампанія топіка →
    командний дефолт;
  - launch tomorrow — остання кампанія сету → увімкнено;
  - піксель — остання кампанія сету → остання кампанія топіка → таблиця
    «ніша → піксель» за нішею, вгаданою з назви топіка наявним `guessNiche`;
    не вгадано — порожньо, байер вибирає;
  - решта полів компактного блоку — командні дефолти, не з останньої кампанії.
- **Читання значень останньої кампанії** — як зараз у `adopt`: бюджет, бід,
  launch tomorrow з TSP builder'а; фолбек бюджету й біда — зі списку
  кампаній; країна з builder'а, а коли там All — з локації TSP.
- **Будувальники тіл TSP і builder'а** беруться з наявного
  `campaign-plan` (там же RSOC-монетизація і `lunch_tomorrow`); логіка
  звірки з теками, `campaign.pause`, історія й `state.json` — видаляються.
- **Сервер** отримує один маршрут заливу: приймає форму і креативи, будує
  знімок, викликає `launchSteps`, виконує кроки по черзі й стрімить прогрес
  (крок, стан, відсоток / МБ, пояснення помилки). Маршрут вимагає
  `confirm: true`, як і нинішній apply. Повтор — той самий виклик, повторне
  використання креативів і headline забезпечує `launchSteps`.
- **Маршрути читання** для форми: топіки байера, знімок топіка (сети з
  дефолтами), живі кабінети (мертві сховані, як у тікеті 28), пікселі,
  країни.
- **Редактор:** форма в панелі експорту «Креативи»; «Куди: Завантаження /
  Залити». Модалка з підсумком → рендер (лише коли проєкт змінився) →
  завантаження → кампанія. Прогрес — список кроків зі станом кожного.
  Форма не скидається після успіху.
- **Командні дефолти** в `setup.sh` / `~/.config/sa/config.json`: RSOC 6,
  бюджет 20, бід 0.45, таблиця «ніша → піксель», тема (темна), headline
  «Learn more», ротація off, таргетинг All, без end date, розклад «завжди»,
  джерело TikTok, мова All, `sources_root` = `~/sa/sources`.
- **Ісходники:** при успішному заливі — вихідні фото й медіа проєкту, без
  `project.json` і mp4, плоско в `sources_root/<назва топіка з платформи>/`;
  однаковий вміст не дублюється, різний з тим самим ім'ям — суфікс `-2`.
- **CLI `sa`:** лишаються `sa topics` і `sa show <topic>`, обидва лише на
  читання. `new`, `adopt`, `expand`, `new campaign`, `plan`, `apply`, `budget`
  та інше, що пише на платформу, видаляються.
- **Видаляється з коду і документації** (лишається в історії git): таб
  «Заливи» і все під ним (таблиця топіка, план у фоні, розбір реджектів,
  імпорт, статус-полінг), модулі маніфестів тек, матриці, плану топіка,
  статей / термгруп / ваг, авто-правил, `adopt`, `adjust`, експорт у теки
  кампаній, `launches_root`; скіли `matrix` і `launch`; розділи «Як іде
  залив» у `CLAUDE.md`, відповідні частини README і `ONBOARDING.md`; дозвіл
  на `sa apply` у `.claude/settings.json` стає непотрібним.
- **Лишається:** скіл `compliance`, `playbook/`, субтитри, скіл `setup`
  (оновлений під нові дефолти), синхронізація з ClickUp — лише якщо не
  залежить від тек (інакше — поза обсягом, див. нижче).

## Testing Decisions

- Добрий тест перевіряє зовнішню поведінку чистої функції: знімок і форма
  на вході — сети, дефолти, кроки й тіла запитів на виході. Жодних моків
  мережі, жодних перевірок внутрішніх допоміжних функцій.
- **Тестується лише новий модуль `core`** (`setsAndDefaults`,
  `launchSteps`); сервер і редактор, як і зараз, не тестуються.
- `setsAndDefaults`:
  - групування кампаній у сети за (стаття, термгрупа) незалежно від назви,
    кабінету, країни;
  - порядок сетів за останньою кампанією;
  - «остання кампанія» пропускає DELETED і бере REJECTED;
  - кожен ланцюг дефолтів: сет → топік → командний дефолт;
    піксель → ніша → порожньо; launch tomorrow для нового сету;
  - кабінет завжди порожній;
  - топік без термгрупи або статті.
- `launchSteps`:
  - креатив, що вже є в репозиторії топіка, не вантажиться вдруге;
    однаковий файл двічі у формі — один крок;
  - headline з тим самим текстом береться наявний;
  - тіла TSP і builder'а несуть поля форми (країна, бюджет, бід,
    `lunch_tomorrow`, піксель, кабінет, RSOC, тема);
  - builder — останній крок;
  - валідація: без кабінету, RSOC поза дозволеним, невідома тема — помилка
    без кроків.
- **Попередній досвід:** тести `campaign-plan` (тіла TSP / builder'а,
  повторне використання креативів і headline), `adopt` (читання бюджету,
  біда, країни з builder'а і TSP, пропуск DELETED), `niche` (здогад ніші).
  Їхні фікстури знімків платформи беремо за основу, а тести видалених
  модулів ідуть разом із модулями.

## Out of Scope

- Керування багатьма кампаніями: пауза, бюджет / бід наживо, масові дії,
  розбір реджектів, статуси — повертаємося, коли кампаній стане багато.
- Кілька країн за одне натискання.
- Створення топіків, термгруп, статей, ключів, ваг і авто-правил з UI або
  через Claude; запис Claude на платформу в будь-якому вигляді.
- Імпорт розкладу з наявних кампаній (платформа його не віддає).
- Перевірка сумісності пікселя з кабінетом.
- Facebook-специфіка тіл запитів (тікет 25 лишається відкритим; TikTok —
  дефолт).
- Архів креативів і проєктів; збереження `project.json` поза кнопкою
  «Завантажити».
- ClickUp-синхронізація, якщо вона тримається на теках заливу, — окремий
  тікет після цього.

## Further Notes

- `sa apply` і таб «Заливи» вже вміли заливати з UI з `confirm`; новий
  маршрут зберігає цей гейт, а модалка на кожен залив заміняє план.
- У коді зараз RSOC за замовчуванням 5 — новий командний стандарт 6.
- Пікселя «за нішею» в коді не було: піксель жив на кабінеті в
  `topic.yaml`. Таблиця «ніша → піксель» — нова, командна.
- Формат `end_date` у тілі TSP досі не звірено з API (попередження в
  `campaign-plan`); поки дефолт «без end date», це не блокує.
- `prd-autolaunch.md` і тікети в `autolaunch/issues/` лишаються як історія;
  цей документ має пріоритет над усім, що їм суперечить.

## Уточнення 2026-09-30 (після тікетів 01–02)

- **Headline** — з останньої кампанії сету → останньої кампанії топіка →
  командний «Learn more». Решта компактного блоку лишається командною.
- **Піксель за нішею** — без таблиці в конфігу: ніша пікселя читається з його
  назви на платформі («Джобс», «Лонс», «Авто», «Еком», на Facebook з цифрою),
  ніша топіка — з його назви. З кількох пікселів ніші (по одному на бізнес)
  береться той, з яким байер востаннє заливав у будь-якому топіку; не
  заливав — байер вибирає.
- **Командні дефолти** живуть у коді (`TEAM_DEFAULTS`), бо `setup.sh` не
  переписує наявний конфіг; байер перекриває поля в `launch_defaults` свого
  `~/.config/sa/config.json`.
- **TSP** з точно такими самими полями переюзується — інакше повтор плодить
  профілі. Кампанія (builder) — завжди нова.
