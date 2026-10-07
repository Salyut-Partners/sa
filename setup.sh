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
#    токени — плейсхолдери. Командні дефолти заливу (RSOC 6, 20 / 0.45, тема,
#    headline) живуть у коді; байер перекриває їх полем launch_defaults тут.
#    Ісходники заливів — у sources_root, за замовчуванням ~/sa/sources.
echo
CONFIG="${SA_CONFIG:-$HOME/.config/sa/config.json}"
if [ -f "$CONFIG" ]; then
  ok "конфігурація вже стоїть: $CONFIG"
else
  info "пишу шаблон конфігурації: $CONFIG"
  mkdir -p "$(dirname "$CONFIG")"
  cat > "$CONFIG" <<EOF1
{
  "sources_root": "~/sa/sources",
  "platform": {
    "token": "REPLACE_PLATFORM_BEARER",
    "organization_id": 121
  }
}
EOF1
  chmod 600 "$CONFIG"
  ok "шаблон записано — заповни platform.token перед першим заливом"
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

# 7. Погодинний launchd-агент звірки тікетів ClickUp був частиною заливів
#    через теки; його більше немає. Старий агент знімається, щоб не смикав
#    команду, якої вже немає.
AGENT_LABEL="io.sa.tickets"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
SA_BIN="$ROOT/creative-factory-search/bin/sa"
if [ -f "$AGENT_PLIST" ]; then
  launchctl unload "$AGENT_PLIST" 2>/dev/null
  rm -f "$AGENT_PLIST"
  ok "старий launchd-агент $AGENT_LABEL знято"
fi

# 8. Критичне: без токена платформи редактор не заливає, а sa нічого не читає.
echo
echo "Критичне для платформи:"
if grep -q REPLACE_PLATFORM_BEARER "$CONFIG" 2>/dev/null; then
  printf "  \033[33m!\033[0m %s\n" "platform.token не заповнено — «Залити» і sa topics відмовляться, редактор далі працює"
else
  ok "platform.token заповнено"
fi
if grep -qE '^ELEVENLABS_API_KEY=.+' "$ENV_FILE" 2>/dev/null; then
  ok "ELEVENLABS_API_KEY заповнено"
else
  printf "  \033[33m!\033[0m %s\n" "ELEVENLABS_API_KEY не заповнено — редактор не озвучуватиме (ключ у тімліда)"
fi

cat <<EOF2

Готово. Запуск:

    cd creative-factory-search && npm run dev     # редактор на 5181, сервер на 5180
    $SA_BIN topics                                 # топіки на платформі — лише читання
    $SA_BIN --version
    cd subs && ./run.sh                            # вотчер inbox/, якщо потрібен

Таба «Субтитри» в редакторі працює без вотчера: сервер сам викликає пайплайн.
Онбординг: cat ONBOARDING.md
EOF2
