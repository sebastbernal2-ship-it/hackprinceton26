"""Render the deliverable screenshots with headless Chrome (server must run on PORT from the repo root).
python Code/expansion/c_housedna/shoot.py [main_aerial main_plan ...]"""
import os, subprocess, sys, tempfile, time

PORT = 8103
HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = r'C:/Program Files/Google/Chrome/Application/chrome.exe'
SHOTS = [('main', v) for v in ('aerial', 'backyard', 'interior', 'front', 'plan')] + [('side', 'aerial')]
want = sys.argv[1:]
os.makedirs(os.path.join(HERE, 'shots'), exist_ok=True)
for case, view in SHOTS:
    name = f'{case}_{view}'
    if want and name not in want:
        continue
    out = os.path.join(HERE, 'shots', name + '.png')
    url = f'http://localhost:{PORT}/Code/expansion/c_housedna/index.html?case={case}&view={view}'
    with tempfile.TemporaryDirectory() as prof:
        cmd = [CHROME, '--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
               '--window-size=1600,900', '--virtual-time-budget=60000', f'--user-data-dir={prof}',
               '--enable-logging=stderr', '--v=0', f'--screenshot={out}', url]
        t = time.time()
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        errs = [l for l in p.stderr.splitlines() if 'CONSOLE' in l or 'Uncaught' in l]
        print(name, f'{time.time() - t:.0f}s', os.path.exists(out))
        for l in errs[:8]:
            print('   ', l[:300])
