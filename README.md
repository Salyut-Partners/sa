# sa

Робоче місце байера Search Arbitrage: редактор креативів і залив
(`creative-factory-search`), база знань (`sa-knowledge`), автосубтитри (`subs`).

```sh
git clone <repo> ~/sa
cd ~/sa && ./setup.sh                                   # усе одразу: Node, ffmpeg, субтитри
cd creative-factory-search && npm run dev               # редактор на 5181, сервер на 5180
creative-factory-search/bin/sa new <launch-key>         # новий залив
```

`setup.sh` ставить Node і ffmpeg, робить `npm ci` в редакторі й викликає
`subs/setup.sh` — обидва ffmpeg, Python 3.11 з venv, статичний шрифт, теки
`inbox/`. Його можна ганяти повторно: кожен крок пропускає те, що вже стоїть.

Оновлення: `git pull && ./setup.sh`. Куди що класти й де що читати — `CLAUDE.md`.

Субтитри працюють двома входами до одного пайплайна: таба «Субтитри» в
редакторі (сервер сам викликає Python) і вотчер `cd subs && ./run.sh` над
`inbox/<стиль>/` для тих, кому звичніше Finder.
