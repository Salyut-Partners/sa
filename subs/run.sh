#!/bin/bash
# Запуск вотчера. Стиль визначає підтека inbox, у яку кладеш відео.
#
#   ./run.sh              — мова визначається автоматично
#   ./run.sh en           — англійська
#   ./run.sh uk           — українська
#   ./run.sh en red       — англійська; red для відео з кореня inbox
#
# Усе технічне (скрипти, venv, шрифт) лежить у technical/
cd "$(dirname "$0")" || exit 1

LANG_ARG="${1:-auto}"
ROOT_STYLE="${2:-yellow}"

ARGS=(--style "$ROOT_STYLE")
[ "$LANG_ARG" != "auto" ] && ARGS+=(--lang "$LANG_ARG")

exec ./technical/.venv/bin/python ./technical/watch_folder.py "${ARGS[@]}"
