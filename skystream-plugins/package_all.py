import os
import json
import zipfile

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(SCRIPT_DIR, 'plugins.json'), 'r', encoding='utf-8') as f:
    plugins = json.load(f)

print(f"Toplam {len(plugins)} eklenti paketleniyor...")

for p in plugins:
    name = p['name']
    pkg = p['packageName']
    js_filename = p['url']
    js_path = os.path.join(SCRIPT_DIR, js_filename)
    
    if not os.path.exists(js_path):
        print(f"[HATA] {js_path} bulunamadı!")
        continue
    
    with open(js_path, 'r', encoding='utf-8') as jf:
        code = jf.read()
        
    manifest = {
        "id": pkg,
        "packageName": pkg,
        "name": name,
        "version": p['version'],
        "description": p.get('description', ''),
        "languages": p.get('languages', ['tr']),
        "iconUrl": p.get('iconUrl', ''),
        "tvTypes": p.get('tvTypes', ['Movie', 'TvSeries'])
    }
    
    # .sky arşivi oluştur
    sky_filename = f"{name}.sky"
    sky_path = os.path.join(SCRIPT_DIR, sky_filename)
    
    with zipfile.ZipFile(sky_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('plugin.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr('plugin.js', code)
        
    print(f"[OK] {sky_filename} oluşturuldu (Boyut: {os.path.getsize(sky_path)} bayt)")

print("\nTüm SkyStream eklentileri (.sky ve .js) başarıyla hazırlandı!")

