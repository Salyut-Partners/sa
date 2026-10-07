# 04 — Прибрати файловий світ заливів, лишити Claude читання

PRD: `.scratch/prd-quick-launch.md`

**What to build:** єдиний шлях заливу — кнопка у «Креативах». Видаляються (в
історії git лишаються): таб «Заливи» з таблицею топіка, планом у фоні,
розбором реджектів, імпортом і статус-полінгом; тека `launches/` і
`launches_root`; команди `sa`, що пишуть на платформу або в теки (`new`,
`adopt`, `expand`, `new campaign`, `plan`, `apply`, `budget` тощо); модулі
маніфестів, матриці, плану топіка, статей / термгруп / ваг, авто-правил,
`adopt`, `adjust`, експорту в теки кампаній; пауза старих кампаній; скіли
`matrix` і `launch`. Claude отримує `sa topics` і `sa show <topic>` (термгрупи,
ключі, ваги, статті, сети) — лише читання. `CLAUDE.md`, README (розділи про
`sa` і «Shape of the code»), `ONBOARDING.md`, скіл `setup` і
`.claude/settings.json` оновлюються під новий світ; скіл `compliance`,
`playbook/` і субтитри лишаються. ClickUp-синхронізацію, якщо вона тримається
на теках, вимкнути й записати окремим тікетом.

**Blocked by:** 01, 02, 03.

**Status:** implemented (2026-09-30), not committed. Тека `launches/` з
даними байера поза git — не видалялась, її архівує чи прибирає байер.
ClickUp — тікет 05. `.claude/settings.json` замість заборон `sa apply`
забороняє Claude звертатися до `/api/launch` з shell.

- [ ] Вкладок дві: «Креативи» і «Субтитри»
- [ ] `sa topics` і `sa show <topic>` працюють і нічого не пишуть; інших команд, що пишуть, немає
- [ ] Скілів `matrix` і `launch` немає; `compliance` і `setup` працюють
- [ ] `CLAUDE.md`, README, `ONBOARDING.md` описують лише новий шлях
- [ ] Typecheck, тести `core` і build зелені; тести видалених модулів пішли разом із ними
