import os, glob, re

js_files = glob.glob('static/js/*.js')
inv = {'ids': {}, 'queries': {}, 'data_attrs': {}}

for f in js_files:
    fname = os.path.basename(f)
    with open(f, 'r', encoding='utf-8') as fp:
        content = fp.read()
    
    # getElementById
    for m in re.finditer(r'getElementById\(["\']([^"\']+)["\']\)', content):
        target = m.group(1)
        inv['ids'].setdefault(target, []).append(fname)
        
    # querySelector / querySelectorAll
    for m in re.finditer(r'querySelector(?:All)?\(["\']([^"\']+)["\']\)', content):
        target = m.group(1)
        inv['queries'].setdefault(target, []).append(fname)
        
    # data-
    for m in re.finditer(r'data-([a-zA-Z0-9_-]+)', content):
        target = m.group(1)
        inv['data_attrs'].setdefault(target, []).append(fname)

os.makedirs('docs/ui-refactor', exist_ok=True)
md_lines = [
    '# Selector Inventory Contract',
    '',
    'This document indexes all DOM selectors (IDs, querySelectors, and data attributes) referenced across `static/js/*.js`.',
    '**Rule**: None of the selectors listed here may be renamed or removed in CSS/HTML without simultaneously updating their referencing JavaScript file.',
    '',
    '## 1. getElementById References (' + str(len(inv['ids'])) + ' unique IDs)',
    '',
    '| Element ID | Referenced In Files |',
    '|---|---|'
]
for k in sorted(inv['ids'].keys()):
    files = ', '.join(sorted(set(inv['ids'][k])))
    md_lines.append(f'| `{k}` | {files} |')

md_lines.extend([
    '',
    '## 2. querySelector / querySelectorAll References (' + str(len(inv['queries'])) + ' unique queries)',
    '',
    '| Selector | Referenced In Files |',
    '|---|---|'
])
for k in sorted(inv['queries'].keys()):
    files = ', '.join(sorted(set(inv['queries'][k])))
    md_lines.append(f'| `{k}` | {files} |')

md_lines.extend([
    '',
    '## 3. Data Attributes (' + str(len(inv['data_attrs'])) + ' unique attributes)',
    '',
    '| Data Attribute | Referenced In Files |',
    '|---|---|'
])
for k in sorted(inv['data_attrs'].keys()):
    files = ', '.join(sorted(set(inv['data_attrs'][k])))
    md_lines.append(f'| `data-{k}` | {files} |')

with open('docs/ui-refactor/selector-inventory.md', 'w', encoding='utf-8') as out:
    out.write('\n'.join(md_lines))

print(f"Selector inventory successfully written: {len(inv['ids'])} IDs, {len(inv['queries'])} queries, {len(inv['data_attrs'])} data attributes.")
