from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'index.html'
SOURCE_MANIFEST = ROOT / 'src' / 'waseda-bootstrap' / 'manifest.json'
SOURCE_SUFFIX = ROOT / 'src' / 'waseda-bootstrap' / '90-shell-suffix.html'
ASSEMBLER = ROOT / 'tools' / 'assemble_waseda.py'

MARKER = '<script src="progress-sync.js?v=vocab-cloud2"></script>'
OLD_MARKER = '<script src="progress-sync.js?v=vocab-cloud1"></script>'
BODY_END = '</body>'


def patch_loader(path: Path) -> bool:
    text = path.read_text(encoding='utf-8')
    if MARKER in text:
        print(f'vocab cloud progress loader already current in {path.relative_to(ROOT)}')
        return False
    if OLD_MARKER in text:
        text = text.replace(OLD_MARKER, MARKER, 1)
        path.write_text(text, encoding='utf-8')
        print(f'upgraded vocabulary cloud progress loader in {path.relative_to(ROOT)}')
        return True
    if BODY_END not in text:
        raise SystemExit(f'missing </body> in {path.relative_to(ROOT)}')
    text = text.replace(BODY_END, f'{MARKER}\n{BODY_END}', 1)
    path.write_text(text, encoding='utf-8')
    print(f'inserted vocabulary cloud progress loader in {path.relative_to(ROOT)}')
    return True


def main() -> None:
    # Before the common-engine handoff, index.html is the source of truth. After the
    # handoff, patch the source-owned suffix and regenerate index.html instead of
    # creating an index-only drift that could bypass the engine/adapter sources.
    if SOURCE_MANIFEST.is_file():
        if not SOURCE_SUFFIX.is_file() or not ASSEMBLER.is_file():
            raise SystemExit('source-owned Waseda app is incomplete; refusing index-only cloud loader patch')
        patch_loader(SOURCE_SUFFIX)
        subprocess.run([sys.executable, str(ASSEMBLER), '--write'], cwd=ROOT, check=True)
        print('source-owned Waseda artifact reassembled after cloud loader check')
        return

    patch_loader(INDEX)


if __name__ == '__main__':
    main()
