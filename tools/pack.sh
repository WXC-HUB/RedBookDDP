#!/usr/bin/env bash
# 打包：审计 app/ 目录 → 压缩“目录内容”到 dist/ttddp.zip → 审计 zip
# 用法：bash tools/pack.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$ROOT/dist/ttddp.zip"
AUDIT="$ROOT/.claude/skills/minitool-zip-builder/scripts/audit_artifact.mjs"

echo "== 1. 单元测试"
node "$ROOT/tools/engine.test.js"

echo "== 1b. 重新生成占卜分布表"
node "$ROOT/tools/build-fortune.js" 20000

echo "== 2. 违规能力扫描（命中即失败）"
if grep -rnE "fetch\(|XMLHttpRequest|new WebSocket|new EventSource|RTCPeerConnection|navigator\.geolocation|navigator\.clipboard|execCommand|navigator\.(bluetooth|usb|hid|serial|getBattery|connection|credentials|locks|serviceWorker)|enumerateDevices|getDisplayMedia|new (Shared)?Worker\(|Accelerometer|Gyroscope|Magnetometer|DeviceMotionEvent|DeviceOrientationEvent|requestFullscreen|\beval\(|new Function\(|WebAssembly|window\.open\(|window\.prompt\(|\bprompt\(|type=\"module\"|<iframe|<object|<base |https?://" "$APP" --include='*.html' --include='*.js' --include='*.css' | grep -vE "xmlns|w3\.org"; then
  echo "发现违规能力引用，见上"; exit 1
fi
echo "扫描通过"

echo "== 3. 目录审计"
node "$AUDIT" "$APP"

echo "== 4. 打包（压缩目录内容，index.html 在 zip 根）"
mkdir -p "$ROOT/dist"
rm -f "$OUT"
cd "$APP"
python - "$OUT" <<'PY'
import os, sys, zipfile
out = sys.argv[1]
allow = {'.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json'}
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk('.'):
        for f in files:
            p = os.path.join(root, f)
            ext = os.path.splitext(f)[1].lower()
            if ext not in allow:
                print('SKIP (type not allowed):', p); continue
            z.write(p, os.path.relpath(p, '.').replace(os.sep, '/'))
print('written', out)
PY

echo "== 5. zip 审计"
node "$AUDIT" "$OUT"
python -m zipfile -l "$OUT"
ls -l "$OUT"
