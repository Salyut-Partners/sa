#!/usr/bin/env python3
"""Слідкує за текою inbox і обробляє кожне нове відео."""

import argparse
import os
import shutil
import time
import traceback
from pathlib import Path

import subtitle_styler

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi"}
# Скрипти лежать у ~/subs/technical, а робочі теки — на рівень вище, у ~/subs
ROOT = Path(__file__).resolve().parent.parent


def is_stable(path: Path, checks: int = 2, delay: float = 1.5) -> bool:
    """Файл дописався, якщо розмір не змінюється кілька перевірок поспіль."""
    try:
        last = path.stat().st_size
    except FileNotFoundError:
        return False
    for _ in range(checks):
        time.sleep(delay)
        try:
            size = path.stat().st_size
        except FileNotFoundError:
            return False
        if size != last or size == 0:
            last = size
            return False
    return True


def unique(path: Path) -> Path:
    if not path.exists():
        return path
    for n in range(2, 1000):
        candidate = path.with_name(f"{path.stem}-{n}{path.suffix}")
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"забагато однойменних файлів: {path}")


def scan(inbox: Path, default_style: str, failed: set[Path]) -> list[tuple[Path, str]]:
    """Відео з підтеки обробляється її стилем, з кореня inbox — стилем за замовчуванням."""
    found = []

    def collect(folder: Path, style: str) -> None:
        for item in sorted(folder.iterdir()):
            if (item.is_file() and item.suffix.lower() in VIDEO_EXT
                    and not item.name.startswith(".") and item not in failed):
                found.append((item, style))

    collect(inbox, default_style)
    for sub in sorted(inbox.iterdir()):
        if sub.is_dir() and sub.name in subtitle_styler.STYLES:
            collect(sub, sub.name)
    return found


def claim(video: Path, style: str, work: Path) -> Path | None:
    """Забирає файл із inbox атомарним перейменуванням.

    Так два запущені вотчери не вихоплять одне відео: rename на одному й тому ж
    джерелі вдається рівно раз, другий отримає FileNotFoundError. Заразом це
    ловить випадок, коли файл прибрали руками одразу після того, як його помітили.
    """
    target = unique(work / f"{style}__{video.name}")
    try:
        os.replace(video, target)
    except (FileNotFoundError, OSError):
        return None
    return target


def release(claimed: Path, original: Path) -> None:
    """Повертає файл назад в inbox, якщо обробка впала."""
    try:
        original.parent.mkdir(parents=True, exist_ok=True)
        os.replace(claimed, original)
    except OSError:
        print(f"  (не вдалося повернути {claimed.name} в inbox — файл лишився в {claimed.parent})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Вотчер теки для автосубтитрів")
    parser.add_argument("--lang", default=None, help="en, uk, ru… (за замовчуванням — автовизначення)")
    parser.add_argument("--style", default=subtitle_styler.DEFAULT_STYLE,
                        choices=sorted(subtitle_styler.STYLES),
                        help="стиль для відео, покладених у корінь inbox")
    parser.add_argument("--font", default=None,
                        help="перекрити шрифт стилів (за замовчуванням — той, що в стилі)")
    parser.add_argument("--inbox", type=Path, default=ROOT / "inbox")
    parser.add_argument("--output", type=Path, default=ROOT / "output")
    parser.add_argument("--processed", type=Path, default=ROOT / "processed")
    parser.add_argument("--interval", type=float, default=3.0)
    parser.add_argument("--keep-ass", action="store_true")
    args = parser.parse_args()

    missing = subtitle_styler.missing_dependencies()
    if missing:
        print("Оточення застаріло: немає " + ", ".join(missing))
        print("Найчастіше це після git pull — код оновився, бібліотеки ні.")
        print(f"\nПолагодь одним рядком:\n  cd {ROOT} && ./setup.sh\n")
        raise SystemExit(1)

    work = args.processed / ".working"
    for folder in (args.inbox, args.output, args.processed, work):
        folder.mkdir(parents=True, exist_ok=True)
    for style in subtitle_styler.STYLES:
        (args.inbox / style).mkdir(exist_ok=True)

    failed: set[Path] = set()
    print(f"Слідкую за {args.inbox}")
    print(f"Мова: {args.lang or 'авто'} | шрифт: {args.font or 'за стилем'}")
    print("Підтеки inbox = стилі:")
    for style in sorted(subtitle_styler.STYLES):
        mark = "  (також корінь inbox)" if style == args.style else ""
        print(f"  {style}{mark}")
    print("\nКидай відео у потрібну підтеку. Зупинити — Ctrl+C.\n")

    while True:
        try:
            for video, style in scan(args.inbox, args.style, failed):
                if not is_stable(video):
                    continue

                claimed = claim(video, style, work)
                if claimed is None:
                    continue  # файл забрав інший вотчер або його прибрали

                print(f"[{time.strftime('%H:%M:%S')}] {video.name}  [{style}]")
                output = unique(args.output / f"{video.stem}.{style}.mp4")
                try:
                    subtitle_styler.process(
                        claimed, output, args.lang, style, args.font, args.keep_ass
                    )
                except Exception:
                    print(f"  ✗ помилка на {video.name}:")
                    traceback.print_exc()
                    failed.add(video)
                    release(claimed, video)
                    continue

                shutil.move(str(claimed), str(unique(args.processed / video.name)))
                print(f"  ✓ {output}\n")

            time.sleep(args.interval)
        except KeyboardInterrupt:
            print("\nЗупинено.")
            return


if __name__ == "__main__":
    main()
