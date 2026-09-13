from pathlib import Path

path = Path('index.html')
text = path.read_text(encoding='utf-8')
marker = '<script src="progress-sync.js?v=vocab-cloud1"></script>'
if marker in text:
    print('vocab cloud progress loader already present')
    raise SystemExit(0)
needle = '</body>'
if needle not in text:
    raise SystemExit('missing </body> in index.html')
text = text.replace(needle, f'{marker}\n{needle}', 1)
path.write_text(text, encoding='utf-8')
print('inserted vocabulary cloud progress loader')
