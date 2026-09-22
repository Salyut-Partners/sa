---
name: setup
description: Встановити або оновити робоче місце байера на цьому Mac — `./setup.sh`, потім попросити в байера токени й ключі, вписати їх у `~/.config/sa/config.json` і `creative-factory-search/.env`, перевірити живцем. Використовуй, коли байер каже «встанови все необхідне», «налаштуй», «онови», «не працює після pull», «куди вставити токен», «перший запуск».
---

# Установка робочого місця

Мета: після тебе байер відкриває редактор, а `sa config` каже `ready: true`
для ClickUp і платформи. Токени ніколи не йдуть у git: конфіг лежить у
`~/.config/sa/`, `.env` закритий `.gitignore`. Не комить і не показуй їх
у відповідях повністю — лише перші 4 символи.

## Крок 1. Код

Корінь репозиторію — тека з `setup.sh` (зазвичай `~/sa`). Якщо байер щойно
зробив `git pull` — добре; якщо ні, запропонуй `git pull` сам.

## Крок 2. `./setup.sh`

```sh
cd <корінь> && ./setup.sh
```

Ідемпотентний: у байерів, які вже ставили старі субтитри
(`forsubs-admin/subs`), brew-пакети (`python@3.11`, обидва ffmpeg, шрифт)
пропустяться; venv створиться наново в `subs/technical/` цього репозиторію —
хвилина-дві. Модель Whisper уже в кеші `~/.cache/huggingface`, вдруге не
качається. Стару теку субтитрів можна лишити або видалити — вона більше не
потрібна: таба «Субтитри» і `subs/run.sh` працюють звідси.

Що може зупинити скрипт:

- **Немає Homebrew.** Інсталятор просить пароль — ти його не введеш. Попроси
  байера набрати в промпті:
  `! /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`,
  а потім виконати рядки `eval "$(/opt/homebrew/bin/brew shellenv)"`, які
  інсталятор надрукує наприкінці. Тоді запусти `./setup.sh` знову.
- **Intel Mac** — субтитри не встануть (mlx лише на Apple Silicon); скрипт
  іде далі, редактор і залив працюють. Скажи байеру.
- Будь-що інше — покажи байеру рядок з `✗` і розберися за текстом.

## Крок 3. Токени — питай одним повідомленням

Спільні id команди (`organization_id: 121`, ClickUp `list_id`) `setup.sh`
уже вписав. У байера попроси:

1. **ClickUp token** — особистий, ClickUp → аватар → Settings → Apps →
   API Token (`pk_…`). Тікети підуть під його іменем.
2. **Bearer платформи digifor** — особистий. Відкрити admin.digifor.io,
   DevTools → Network → будь-який запит до `admin-api.digifor.io` →
   заголовок `Authorization`, усе після `Bearer `.
3. **ElevenLabs** і **DeepL** — спільні командні, бере в тімліда. Без
   ElevenLabs редактор не озвучує; DeepL необов'язковий.
4. Необов'язково: **user_id** на платформі — пришвидшує табу заливів.

Чого байер не має зараз — пропусти й скажи, що саме не працюватиме;
повернетесь пізніше.

## Крок 4. Вписати

Конфіг — злиттям, не перезаписом: інші поля байера лишаються. Значення
передавай через змінні оточення, не в тексті скрипта:

```sh
CLICKUP='…' PLATFORM='…' USER_ID='' node -e '
const fs=require("fs"),p=process.env.HOME+"/.config/sa/config.json";
const c=JSON.parse(fs.readFileSync(p,"utf8"));const e=process.env;
c.clickup??={};c.platform??={};
if(e.CLICKUP)c.clickup.token=e.CLICKUP.trim();
if(e.PLATFORM)c.platform.token=e.PLATFORM.trim().replace(/^Bearer\s+/i,"");
if(e.USER_ID)c.platform.user_id=Number(e.USER_ID);
fs.writeFileSync(p,JSON.stringify(c,null,2)+"\n",{mode:0o600});'
```

Ключі редактора — рядки `ELEVENLABS_API_KEY=…` і `DEEPL_API_KEY=…` у
`creative-factory-search/.env` (заміни наявний рядок, не дублюй). Сервер
читає `.env` при старті — якщо він уже крутиться, перезапусти `npm run dev`.

## Крок 5. Перевірити живцем

```sh
cd <корінь>/creative-factory-search && bin/sa config
```

`clickup.ready` і `platform.ready` мають бути `true`. Далі — що токени справжні
(лише читання, нічого не створює):

```sh
node -e '
const c=JSON.parse(require("fs").readFileSync(process.env.HOME+"/.config/sa/config.json","utf8"));
(async()=>{
 const cu=await fetch("https://api.clickup.com/api/v2/user",{headers:{authorization:c.clickup.token}});
 console.log("clickup",cu.status,cu.ok?(await cu.json()).user.username:"");
 const base=c.platform.base_url??"https://admin-api.digifor.io/api/admin";
 const pl=await fetch(base+"/countries?organization_id="+c.platform.organization_id,{headers:{
  authorization:"Bearer "+c.platform.token,accept:"application/json",
  origin:"https://admin.digifor.io",referer:"https://admin.digifor.io/"}});
 console.log("platform",pl.status);
})();'
```

`200` — токен живий. `401/403` — токен неправильний або протух: попроси
новий. Bearer платформи живе обмежено — коли `sa plan` почне відповідати
401, це той самий крок заново.

## Крок 6. Звіт

Коротко байеру: що встановлено, що пропущено і чому, як запускати:

```sh
cd ~/sa/creative-factory-search && npm run dev   # http://localhost:5181
```

і що далі — `ONBOARDING.md`, розділ «Перший залив», або скіл `matrix`.
Оновлення надалі: `git pull && ./setup.sh`, або знову «встанови все необхідне».
