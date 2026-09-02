from pathlib import Path
import json, re, sys

ROOT=Path(__file__).resolve().parents[1]
INDEX=ROOT/'index.html'
OVERRIDE_PARTS=sorted((ROOT/'tools').glob('v75_override.part*.js'))
OLD_DATA='2019-2026-v7.4-ja-translation-audited'
NEW_DATA='2019-2026-v7.5-user-test-remediation'
OLD_HARD='うん、昨日の理科のテストは私にも難しかったです。'
NEW_HARD='うん、その理科のテストは私にも難しかったです。'
START='/* V75_USER_TEST_REMEDIATION_START */'
END='/* V75_USER_TEST_REMEDIATION_END */'
ANCHOR='window.speakWord=speakWord;window.closeSheet=closeSheet;\ninit();'


def extract_json_constant(text,name,next_name):
    marker=f'const {name}='
    start=text.index(marker)+len(marker)
    end=text.index(f';\nconst {next_name}=',start)
    return json.loads(text[start:end])


def audit(text):
    assert 'const SCHEMA_VERSION=7;' in text, 'schemaVersion constant changed'
    assert 'const STORAGE_KEY="waseshibu_vocab_state";' in text, 'main storage key changed'
    assert 'localStorage.clear(' not in text, 'destructive localStorage.clear detected'
    assert NEW_DATA in text and OLD_DATA not in text, 'dataVersion patch incomplete'
    assert NEW_HARD in text and OLD_HARD not in text, 'hard translation patch incomplete'
    assert text.count(START)==1 and text.count(END)==1, 'override marker count invalid'
    for needle in [
        'waseshibu_vocab_active_session_v1',
        'buildChallengeSessionPlan',
        'questionInstanceId',
        'validateImportPayload',
        'hydrateUiFromState',
        'listeningQuestionStem',
        'compoundOnly',
        'settingsUpdatedAt',
        '挑戦前の基礎確認',
    ]:
        assert needle in text, f'missing required remediation: {needle}'
    vocab=extract_json_constant(text,'VOCAB','TOP100')
    assert len(vocab)==680, f'fixed ID count changed: {len(vocab)}'
    ids=[v['id'] for v in vocab]
    assert len(ids)==len(set(ids)), 'duplicate fixed IDs detected'
    ref=sum(1 for v in vocab if v.get('studyLayer','core')=='reference')
    learn=sum(1 for v in vocab if v.get('studyLayer','core')!='reference')
    assert ref==46, f'reference count changed: {ref}'
    assert learn==634, f'learnable count changed: {learn}'
    protected={
      'p9000000008':'any longer','p9000000005':'in the past','p9000000012':'be on a diet',
      'p9000000004':'be resistant to','p9000000006':'fight against','p9000000015':'hand out',
      'p9000000014':'keep in touch with','p9000000016':'turn over',
      'p2681140134':'probably say next','w90945261587363':'term','w90545631866000':'hard'
    }
    by_id={v['id']:v['word'] for v in vocab}
    for i,w in protected.items():
        assert by_id.get(i)==w, f'fixed ID reused or missing: {i} expected {w}, got {by_id.get(i)}'
    assert 'if(layer==="reference")return false;' in text, 'reference quiz exclusion guard missing'
    return {'fixedIds':len(vocab),'learnable':learn,'reference':ref}


def main():
    text=INDEX.read_text(encoding='utf-8')
    if not OVERRIDE_PARTS: raise RuntimeError('override parts missing')
    override=''.join(x.read_text(encoding='utf-8') for x in OVERRIDE_PARTS).rstrip()
    text=text.replace(OLD_DATA,NEW_DATA)
    text=text.replace(OLD_HARD,NEW_HARD)
    block=f'{START}\n{override}\n{END}\n'
    if START in text or END in text:
        pattern=re.compile(re.escape(START)+r'.*?'+re.escape(END)+r'\n?',re.S)
        text,n=pattern.subn(block,text,count=1)
        if n!=1: raise RuntimeError('Could not replace existing v7.5 override block')
    else:
        if ANCHOR not in text: raise RuntimeError('init anchor not found')
        text=text.replace(ANCHOR,block+ANCHOR,1)
    result=audit(text)
    INDEX.write_text(text,encoding='utf-8')
    print(json.dumps({'status':'PASS',**result},ensure_ascii=False))

if __name__=='__main__':
    try: main()
    except Exception as e:
        print(f'PATCH/AUDIT FAILED: {e}',file=sys.stderr)
        raise
