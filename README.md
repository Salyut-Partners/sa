# sa

Робоче місце байера Search Arbitrage: редактор креативів і залив
(`creative-factory-search`), база знань (`sa-knowledge`), автосубтитри (`subs`).

```sh
git clone <repo> ~/sa
cd ~/sa/creative-factory-search && npm install && npm run dev   # редактор і сервер
cd ~/sa/subs && ./setup.sh && ./run.sh                            # субтитри
~/sa/creative-factory-search/bin/sa new <launch-key>               # новий залив
```

Оновлення: `git pull`, потім `npm install` у `creative-factory-search` і
`./setup.sh` у `subs`. Куди що класти й де що читати — `CLAUDE.md`.
