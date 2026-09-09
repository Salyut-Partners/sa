#!/bin/bash
# Робоче місце байера — встановлення всього одразу:
#   ./setup.sh
# Редактор і сервер (Node, npm install, ffmpeg) і субтитри (обидва ffmpeg,
# Python 3.11 з venv, статичний шрифт). Ганяти можна повторно — кожен крок
# пропускає те, що вже стоїть.

set -u
cd "$(dirname "$0")" || exit 1

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

# 6. Конфігурація байера — поза git. Не перезаписується, лише підказка.
echo
CONFIG="${SA_CONFIG:-$HOME/.config/sa/config.json}"
if [ -f "$CONFIG" ]; then
  ok "конфігурація: $CONFIG"
else
  info "конфігурації ще немає: $CONFIG"
  echo "    Без неї заливи лягають у ~/sa/launches, а тікет у ClickUp не створюється."
  echo "    Приклад:"
  echo '    { "launches_root": "~/sa/launches", "clickup": { "token": "pk_…", "list_id": "…" } }'
fi

cat <<'EOF2'

Готово. Запуск:

    cd creative-factory-search && npm run dev     # редактор на 5181, сервер на 5180
    creative-factory-search/bin/sa new <launch-key>
    cd subs && ./run.sh                            # вотчер inbox/, якщо потрібен

Таба «Субтитри» в редакторі працює без вотчера: сервер сам викликає пайплайн.
EOF2
