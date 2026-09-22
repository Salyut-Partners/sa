# sa

Робоче місце байера Search Arbitrage: редактор креативів і залив
(`creative-factory-search`), плейбук байера (`playbook`), автосубтитри (`subs`).

```sh
git clone https://github.com/Salyut-Partners/sa.git ~/sa
cd ~/sa && ./setup.sh                                   # усе одразу: Node, ffmpeg, субтитри
cd creative-factory-search && npm run dev               # редактор на 5181, сервер на 5180
creative-factory-search/bin/sa new <launch-key>         # новий залив
```

`setup.sh` ставить Node і ffmpeg, робить `npm install` в редакторі й викликає
`subs/setup.sh` — обидва ffmpeg, Python 3.11 з venv, статичний шрифт, теки
`inbox/` — пише шаблон `~/.config/sa/config.json`, якщо його ще немає, і
ставить `launchd`-агент, який раз на годину піднімає сервер і звіряє тікети,
навіть коли редактор не відкривали. Його можна ганяти повторно: кожен крок
пропускає те, що вже стоїть.

Найпростіше — відкрити Claude Code у `~/sa` і написати «встанови все
необхідне»: скіл `setup` прожене `setup.sh`, попросить токени й ключі і
перевірить їх. Оновлення: `git pull && ./setup.sh`. З чого почати новому байеру —
[`ONBOARDING.md`](ONBOARDING.md). Куди що класти й де що читати — `CLAUDE.md`.

Субтитри працюють двома входами до одного пайплайна: таба «Субтитри» в
редакторі (сервер сам викликає Python) і вотчер `cd subs && ./run.sh` над
`inbox/<стиль>/` для тих, кому звичніше Finder.
