#!/bin/bash
# Робоче місце байера — встановлення всього одразу:
#   ./setup.sh
# Редактор і сервер (Node, npm install, ffmpeg) і субтитри (обидва ffmpeg,
# Python 3.11 з venv, статичний шрифт). Ганяти можна повторно — кожен крок
# пропускає те, що вже стоїть.

set -u
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
info() { printf "  \033[34m→\033[0m %s\n" "$1"; }
die()  { printf "\n\033[31m✗ %s\033[0m\n" "$1"; exit 1; }

echo
echo "sa — робоче місце байера"
echo "========================"

# 1. Homebrew — потрібен і редактору (ffmpeg), і субтитрам.
command -v brew >/dev/null 2>&1 || die "Немає Homebrew. Постав його й запусти цей скрипт знову:
  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
ok "Homebrew: $(brew --prefix)"

brew_need() {
  if brew list --versions "$1" >/dev/null 2>&1; then
    ok "$1 вже стоїть"
  else
    info "ставлю $1…"
    brew install "$1" || die "не вдалося поставити $1"
    ok "$1"
  fi
}

# 2. Node 20+ для редактора, сервера і `sa`.
if command -v node >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; then
  ok "node $(node -v)"
else
  brew_need node
fi

# 3. ffmpeg з PATH: рендер і мукс редактора, читання звуку для Whisper.
brew_need ffmpeg

# 4. Залежності редактора. `npm install` за lock-файлом: коли все вже стоїть,
#    він нічого не переставляє — на відміну від `npm ci`, який щоразу зносить
#    node_modules.
info "npm install у creative-factory-search…"
(cd creative-factory-search && npm install --no-audit --no-fund --loglevel=error) || die "npm install не вдався"
ok "creative-factory-search: залежності на місці"

# 5. Субтитри: свій скрипт знає свої граблі — обидва ffmpeg, python@3.11,
#    venv, статичний Montserrat, теки inbox/. Він теж ідемпотентний. Його
#    невдача (Intel Mac, скажімо) не валить установку редактора: таба
#    «Субтитри» сама скаже, чого бракує.
echo
SUBS_OK=1
if [ -x subs/setup.sh ]; then
  subs/setup.sh || SUBS_OK=0
else
  printf "  \033[33m!\033[0m %s\n" "немає subs/setup.sh — субтитри не встановлено"
  SUBS_OK=0
fi
[ "$SUBS_OK" = 1 ] || printf "\n  \033[33m!\033[0m %s\n" "субтитри не встановились; редактор і залив працюють без них"

# 6. Конфігурація байера — поза git, бо `~/sa` це git і `.env` у ньому рано чи
#    пізно закомітять. Файл, що вже є, не перезаписується — тільки підказка;
#    його відсутність дістає шаблон: спільні id команди вже вписані, особисті
#    токени — плейсхолдери. launches_root — тека поруч із цим клоном, де б він
#    не лежав.
echo
CONFIG="${SA_CONFIG:-$HOME/.config/sa/config.json}"
if [ -f "$CONFIG" ]; then
  ok "конфігурація вже стоїть: $CONFIG"
else
  info "пишу шаблон конфігурації: $CONFIG"
  mkdir -p "$(dirname "$CONFIG")"
  cat > "$CONFIG" <<EOF1
{
  "launches_root": "$ROOT/launches",
  "clickup": {
    "token": "REPLACE_CLICKUP_TOKEN",
    "list_id": "901219549743"
  },
  "platform": {
    "token": "REPLACE_PLATFORM_BEARER",
    "organization_id": 121
  }
}
EOF1
  chmod 600 "$CONFIG"
  ok "шаблон записано — заповни токени перед першим \`sa plan\`"
fi

# 6b. Ключі редактора — спільні командні (озвучка ElevenLabs, переклад DeepL).
#     Лежать у creative-factory-search/.env, який .gitignore не пускає в git.
ENV_FILE="creative-factory-search/.env"
if [ -f "$ENV_FILE" ]; then
  ok "ключі редактора вже стоять: $ENV_FILE"
else
  cp creative-factory-search/.env.example "$ENV_FILE" && chmod 600 "$ENV_FILE"
  ok "шаблон ключів редактора записано: $ENV_FILE"
fi

# 7. launchd-агент: тримає сервер живим для погодинної звірки тікетів, навіть
#    коли редактор не відкривали цілий день. Ідемпотентний — уже завантажений
#    агент пропускається, а не перевантажується.
echo
AGENT_LABEL="io.sa.tickets"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
SA_BIN="$ROOT/creative-factory-search/bin/sa"
# Агент, що дивиться на інший клон (репо переїхало), знімається й ставиться знову.
if launchctl list "$AGENT_LABEL" >/dev/null 2>&1 && ! grep -qF "$SA_BIN" "$AGENT_PLIST" 2>/dev/null; then
  info "launchd-агент дивиться на інший клон — переставляю"
  launchctl unload "$AGENT_PLIST" 2>/dev/null
fi
if launchctl list "$AGENT_LABEL" >/dev/null 2>&1; then
  ok "launchd-агент $AGENT_LABEL вже стоїть"
else
  info "ставлю launchd-агент $AGENT_LABEL (погодинно: $SA_BIN tickets)…"
  mkdir -p "$(dirname "$AGENT_PLIST")"
  cat > "$AGENT_PLIST" <<EOF3
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SA_BIN</string>
    <string>tickets</string>
  </array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>/tmp/sa-tickets.log</string>
  <key>StandardErrorPath</key><string>/tmp/sa-tickets.log</string>
</dict>
</plist>
EOF3
  launchctl load "$AGENT_PLIST" 2>/dev/null && ok "launchd-агент поставлено" \
    || printf "  \033[33m!\033[0m %s\n" "launchctl load не вдався — піднімай сервер вручну: $SA_BIN tickets"
fi

# 8. Критичне: без нього `sa new`/`sa plan`/`sa apply` працюють лише частково.
echo
echo "Критичне для платформи й ClickUp:"
if grep -q REPLACE_PLATFORM_BEARER "$CONFIG" 2>/dev/null; then
  printf "  \033[33m!\033[0m %s\n" "platform.token не заповнено — plan/apply відмовляться, редактор і sa new далі працюють"
else
  ok "platform.token заповнено"
fi
if grep -q REPLACE_CLICKUP_TOKEN "$CONFIG" 2>/dev/null; then
  printf "  \033[33m!\033[0m %s\n" "clickup.token не заповнено — sa new робить лише теку, без тікета"
else
  ok "clickup.token заповнено"
fi
if grep -qE '^ELEVENLABS_API_KEY=.+' "$ENV_FILE" 2>/dev/null; then
  ok "ELEVENLABS_API_KEY заповнено"
else
  printf "  \033[33m!\033[0m %s\n" "ELEVENLABS_API_KEY не заповнено — редактор не озвучуватиме (ключ у тімліда)"
fi

cat <<EOF2

Готово. Запуск:

    cd creative-factory-search && npm run dev     # редактор на 5181, сервер на 5180
    $SA_BIN new <launch-key>
    $SA_BIN --version
    cd subs && ./run.sh                            # вотчер inbox/, якщо потрібен

Таба «Субтитри» в редакторі працює без вотчера: сервер сам викликає пайплайн.
Онбординг: cat ONBOARDING.md
EOF2
