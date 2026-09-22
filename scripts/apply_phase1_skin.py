import re

def clean_css_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Remove all text-transform: uppercase
    content = re.sub(r'text-transform:\s*uppercase\s*;?', 'text-transform: none;', content, flags=re.IGNORECASE)

    # 2. Flatten gradients to clean surface backgrounds where applied to cards/tiles/buttons
    content = re.sub(r'background:\s*linear-gradient\([^;]+?\)\s*,\s*var\(--bg-2\);?', 'background: var(--surface-1);', content)
    content = re.sub(r'background:\s*linear-gradient\([^;]+?\)\s*,\s*var\(--bg-3\);?', 'background: var(--surface-2);', content)
    content = re.sub(r'background:\s*linear-gradient\(180deg,\s*#ffffff\s*0%,\s*#e2e8f0\s*100%\);?', 'background: var(--accent);', content)

    # 3. Clean letter-spacing uppercase styles
    content = re.sub(r'letter-spacing:\s*0\.0[5-9]em\s*;?', 'letter-spacing: normal;', content)

    # 4. Remove heavy neon glows in box-shadow
    content = re.sub(r'box-shadow:\s*0\s*0\s*\d+px\s*rgba\([^;]+?\);?', 'box-shadow: var(--shadow-1);', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Cleaned {filepath}")

for fpath in [
    'static/css/base.css',
    'static/css/dashboard.css',
    'static/css/deep-dive.css',
    'static/css/studio.css',
    'static/css/modals.css'
]:
    clean_css_file(fpath)
