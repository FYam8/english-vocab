from pathlib import Path

INDEX = Path('index.html')
SOURCE = Path('tools/v76_memory_scheduler.js')
MARKER = '/* V75_USER_TEST_REMEDIATION_END */'
START = '/* V76_MEMORY_CURVE_SCHEDULER_START */'
END = '/* V76_MEMORY_CURVE_SCHEDULER_END */'

html = INDEX.read_text(encoding='utf-8')
source = SOURCE.read_text(encoding='utf-8').strip()

if START in html:
    if html.count(START) != 1 or html.count(END) != 1:
        raise SystemExit('v7.6 scheduler marker count is invalid')
    print('v7.6 scheduler already applied')
else:
    if html.count(MARKER) != 1:
        raise SystemExit('expected exactly one v7.5 remediation end marker')
    if START not in source or END not in source:
        raise SystemExit('scheduler source markers missing')
    html = html.replace(MARKER, source + '\n' + MARKER)
    INDEX.write_text(html, encoding='utf-8')
    print('v7.6 scheduler applied')

final = INDEX.read_text(encoding='utf-8')
checks = {
    'schema remains 7': 'const SCHEMA_VERSION=7;' in final,
    'main storage key remains': 'const STORAGE_KEY="waseshibu_vocab_state";' in final,
    'no global storage clear': 'localStorage.clear(' not in final,
    'no main storage removal': 'localStorage.removeItem(STORAGE_KEY)' not in final,
    'v7.6 runtime version': '2019-2026-v7.6-memory-curve-scheduler' in final,
    'single v7.6 start': final.count(START) == 1,
    'single v7.6 end': final.count(END) == 1,
    'optional memory model': 'memoryModel' in final,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit('post-patch checks failed: ' + ', '.join(failed))
print('post-patch static checks: PASS')
