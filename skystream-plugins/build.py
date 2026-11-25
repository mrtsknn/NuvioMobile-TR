"""src/_lib.js + src/<eklenti>.js -> <eklenti>.js (tek dosya, IIFE). Ardından package_all.py .sky paketlerini üretir."""
import os

DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(DIR, 'src')

with open(os.path.join(SRC, '_lib.js'), encoding='utf-8') as f:
    lib = f.read()

for name in sorted(os.listdir(SRC)):
    if not name.endswith('.js') or name.startswith('_'):
        continue
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        site = f.read()
    out = ('// Bu dosya build.py ile üretilir; src/ altındaki kaynakları düzenleyin.\n'
           '(function () {\n' + lib + '\n' + site + '\n})();\n')
    with open(os.path.join(DIR, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(out)
    print('[OK]', name)
