from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
marker = '<script src="progress-sync.js?v=vocab-cloud2"></script>'
old_marker = '<script src="progress-sync.js?v=vocab-cloud1"></script>'
if marker in text:
    print('vocab cloud progress loader already current')
    raise SystemExit(0)
if old_marker in text:
    text = text.replace(old_marker, marker, 1)
    path.write_text(text, encoding='utf-8')
    print('upgraded vocabulary cloud progress loader')
    raise SystemExit(0)
needle = '</body>'
if needle not in text:
    raise SystemExit('missing </body> in index.html')
text = text.replace(needle, f'{marker}\n{needle}', 1)
path.write_text(text, encoding='utf-8')
print('inserted vocabulary cloud progress loader')
