#!/usr/bin/env bash
set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/app.log"
mkdir -p "$LOG_DIR"

NODE_BIN=""
if [ -x "$ROOT_DIR/runtime/bin/node" ]; then
  NODE_BIN="$ROOT_DIR/runtime/bin/node"
elif [ -x "$ROOT_DIR/runtime/node" ]; then
  NODE_BIN="$ROOT_DIR/runtime/node"
elif command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
fi

if [ -z "$NODE_BIN" ]; then
  MSG="ไม่พบตัวรันโปรแกรม (Node.js runtime) ในโฟลเดอร์ runtime/ กรุณาใช้โฟลเดอร์ที่แพ็กแล้วหรือติดตั้ง Node.js"
  echo "[$(date -Iseconds)] [LINUX:ERROR] $MSG" >> "$LOG_FILE"
  echo "$MSG" >&2
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --title="เปิดโปรแกรมไม่สำเร็จ" --text="$MSG" >/dev/null 2>&1 || true
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "เปิดโปรแกรมไม่สำเร็จ" "$MSG" >/dev/null 2>&1 || true
  fi
  exit 1
fi

LAUNCHER_SCRIPT=""
if [ -f "$ROOT_DIR/app/launcher.mjs" ]; then
  LAUNCHER_SCRIPT="$ROOT_DIR/app/launcher.mjs"
elif [ -f "$ROOT_DIR/scripts/launcher.mjs" ]; then
  LAUNCHER_SCRIPT="$ROOT_DIR/scripts/launcher.mjs"
fi

if [ -z "$LAUNCHER_SCRIPT" ]; then
  MSG="ไม่พบไฟล์ตัวเปิดโปรแกรม (app/launcher.mjs) กรุณาตรวจสอบโฟลเดอร์โปรแกรม"
  echo "[$(date -Iseconds)] [LINUX:ERROR] $MSG" >> "$LOG_FILE"
  echo "$MSG" >&2
  exit 1
fi

if [ "${WORKLOG_SYNC:-0}" = "1" ] || [ "${1:-}" = "--no-browser" ]; then
  exec "$NODE_BIN" "$LAUNCHER_SCRIPT" "$@"
else
  nohup "$NODE_BIN" "$LAUNCHER_SCRIPT" "$@" >/dev/null 2>&1 &
  exit 0
fi

