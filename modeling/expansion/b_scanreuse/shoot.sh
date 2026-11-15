#!/bin/sh
# usage: sh shoot.sh [case view outname]...  renders 1600x900 screenshots with headless Chrome (server on :8102)
D=$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)
CH="C:/Program Files/Google/Chrome/Application/chrome.exe"
shot() {
  "$CH" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --disable-gpu-sandbox --hide-scrollbars \
    --window-size=1600,900 --virtual-time-budget=${VTB:-40000} --user-data-dir="$TEMP/chrome_b_scanreuse_$1_$2" \
    --screenshot="$D/shots/$3.png" "http://localhost:8102/Code/expansion/b_scanreuse/index.html?case=$1&view=$2" 2>/dev/null
}
while [ $# -ge 3 ]; do shot $1 $2 $3 & shift 3; done
wait
