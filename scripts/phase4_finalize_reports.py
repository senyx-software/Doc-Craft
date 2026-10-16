"""Add current Phase 4 dispositions while preserving previous report evidence."""
import hashlib,json,os,re
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];AUDIT=ROOT/'docs/system-audit';OUT=AUDIT/'evidence/phase4'
START='<!-- PHASE4_STATUS -->';END='<!-- END_PHASE4_STATUS -->'
def insert(path,block):
    text=path.read_text();text=re.sub(re.escape(START)+'.*?'+re.escape(END)+'\n*','',text,flags=re.S)
    first,separator,rest=text.partition('\n')
    text=first+'\n\n'+START+'\n'+block.strip()+'\n'+END+'\n\n'+rest.lstrip('\n')
    text=text.replace('## Phase 3 — Current status','## Phase 3 — Historical status')
    path.write_text(text)

def main():
    stack=json.loads((OUT/'stack-integration.json').read_text());counts=Counter(c['status'] for c in stack['checks'])
    regression=json.loads((OUT/'regression/summary.json').read_text());checks=Counter(c['status'] for c in regression['checks'])
    current=f"""## Phase 4 — Current status (2026-10-16)

**Production: NOT READY. Staging: prepared, deployment verification blocked.** Actual final native integration: **{counts['VERIFIED']} VERIFIED, {counts['BLOCKED']} BLOCKED, {counts['UNRESOLVED']} UNRESOLVED**. Full regression orchestration: **{checks['PASS']} PASS, {checks['BLOCKED']} BLOCKED, {checks['OPEN_FINDINGS']} OPEN_FINDINGS** across 20 checks. Browser/PDF rendering is blocked by the host sandbox; frontend build dependency advisories remain open. No external provider workflow or Docker deployment is claimed successful.

Current policy is **Free 3 / Pro 10 / Max 25 shared metered units per account**, each outbound AI request plus each server PDF, **20 hours from first accepted use**, admin configurable. Browser exports remain unmetered. Retention defaults and legacy cutover still need owner decisions.

Authoritative entitlements, durable payment reducer/outbox and billing downstream SQL receipts, PostgreSQL quota/window recovery, secure owner/public uploaded-template versions, encrypted single-use TOTP, durable session revocation, scoped DB roles/TLS/replay-loss controls and staging tooling have implementation/regression evidence. The original release groups remain partial or externally blocked because their full acceptance criteria have not passed.
"""
    links='''Current sources: [16 release blockers](16-PHASE4_RELEASE_BLOCKERS.md), [17 staging guide](17-STAGING_DEPLOYMENT_GUIDE.md), [18 production checklist](18-PRODUCTION_READINESS_CHECKLIST.md), [19 final results](19-FINAL_INTEGRATION_TEST_RESULTS.md), [full technical workflow](../../DOCCRAFT_FULL_TECHNICAL_WORKFLOW.md).

**Everything below this Phase 4 preface is preserved historical evidence unless explicitly updated.** Earlier midnight quota semantics, unlimited Pro descriptions, absent upload pipeline and unresolved TOTP replay statements are superseded by the current reports; historical browser success is not Phase 4 browser evidence.'''
    specific={
      '12':'''### Current security changes

P4-01–P4-20 in report 16 record exact root cause, implementation, files, regression/integration evidence, impact and remaining limits. New corrections include private uploaded catalog leakage, atomic concurrent login lock, service-owned anonymization retries, immutable configuration history, Redis generation replay protection, notification log privacy/fail-closed throttling, durable downstream intake, timezone-aware outbox scheduling and restricted automation webhook destinations. Real key rotation, deployed host/network/image verification and the residual build advisory are still release gates.''',
      '13':'''### Current communication changes

| Caller → receiver | Contract / persistence |
| --- | --- |
| Chat/Document/Payment/Quota → Admin policy | Fresh scoped entitlement decisions; current Auth/Payment facts, flags and expiring overrides. |
| Chat → Groq/Claude → Quota | Admin-selected configured provider; one reservation for every outbound provider attempt. |
| Document → Quota/queue/PDF/storage | Saved intent before stable reservation; signed queue priority; worker revalidation; retryable refund/storage cleanup. |
| Payment → Auth/Quota | Ordered durable outbox refreshes current policy and syncs plan without resetting consumed usage. |
| Payment → Notification | Signed HTTP acknowledges committed NotificationDelivery, then reconstructs Redis jobs; stable provider identity and review hold. |
| Payment → Admin billing automation | Payment-only signed durable inbox, serialized rule processing and stable per-action identities. |
| Admin → Auth/Document anonymization | Owned mutation endpoints plus durable purge request journal; no foreign Auth SQL writes. |
| All runtime → PostgreSQL/Redis/internal HTTP | Scoped privileges and authenticated validated TLS; replay-generation guard survives empty Redis restart. |

Exact current receiving ACLs and all route/schema declarations are reproduced in the source-linked technical workflow appendices. Legacy nonbilling Redis-only producer/automation paths retain their separate delivery limitations.''',
      '14':'''### Current verification boundary

Final results/commands are in report 19 and `evidence/phase4/regression/summary.json`; every native assertion is in `evidence/phase4/stack-integration.json`. Native transport/security/role/Redis-loss evidence is real local process integration. Signed provider fixtures, intercepted email challenges, test email transport and SDK stubs are explicitly not external sandbox evidence. Four real PostgreSQL notification receipt checks are recorded separately. Offline staging has 78 passing checks; no image build/container startup occurred.''',
      '15':'''### Current original-finding dispositions

| ID | Phase 4 disposition |
| --- | --- |
| U-R02 | PARTIAL: currency-safe gross/refund/net reporting; provider statements/historical reconciliation remain. |
| U-R04 | PARTIAL: authoritative shared contract implemented; retention decisions and deployed browser/PDF acceptance remain. |
| U-R06 | PARTIAL: secure uploaded owner/public version/review/publication/rollback implemented; actual PDF compatibility remains. |
| U-R07 | PARTIAL: atomic reducer/outbox, ordered state, trusted recurring retrieval and durable billing downstream intake implemented; actual provider lifecycles/ambiguous provider outcomes remain. |
| U-R08 | PARTIAL: durable windows/reservations/intent/refunds/Redis-loss recovery; legacy cutover and actual renderer/storage failure acceptance remain. |
| U-R10 | BLOCKED: no owner-approved real credential revocation/rotation/rollout evidence. |
| U-R11 | Historical tested fixes retained; current browser recheck blocked; browser export stays unmetered by explicit approval. |
| U-R12 | PARTIAL: TOTP encryption/replay, sessions/abuse/log/config/ownership corrections; legacy migration and deployed verification remain. |
| U-R13 | PARTIAL: scoped TLS/runtime/staging/recovery controls implemented; Docker/sandbox/load/DR/deployed integration remain. |

No group is newly marked FIXED based only on implementation/build success. The owner must revoke the credential removed from the previous Git remote; no production credentials were changed.'''
    }
    for path in sorted(AUDIT.glob('*.md')):
        if re.match(r'^(?:0\d|1[0-5])-|^PHASE3_LOCAL_VERIFICATION',path.name):
            prefix=path.name[:2];insert(path,current+'\n'+specific.get(prefix,'')+'\n\n'+links)
    master_links=links.replace('](16-','](docs/system-audit/16-').replace('](17-','](docs/system-audit/17-').replace('](18-','](docs/system-audit/18-').replace('](19-','](docs/system-audit/19-').replace('](../../DOCCRAFT_','](DOCCRAFT_')
    insert(ROOT/'DOC_CRAFT_FULL_PROJECT_REPORT.md',current+'\n'+specific['15']+'\n\n'+master_links)
    # Hash all saved baseline files, and enumerate new reviewable sources.
    # Ignore runtime credentials, generated clients/binaries, dependencies and evidence.
    baseline=json.loads((OUT/'baseline.json').read_text());paths=set(baseline)
    excluded={'node_modules','dist','generated','.git','.local','.venv','.venv-local','__pycache__','.pytest_cache','redis-bin','.idea','storage','coverage','.vite','build','evidence'}
    suffixes={'.md','.py','.ts','.tsx','.mts','.js','.jsx','.mjs','.cjs','.json','.sql','.prisma','.yaml','.yml','.txt','.toml','.css','.html','.conf','.sh','.lua','.lock'}
    for directory,subdirs,files in os.walk(ROOT):
        subdirs[:]=[s for s in subdirs if s not in excluded and not s.startswith('.venv')]
        for file in files:
            path=Path(directory)/file
            if path.suffix in suffixes or 'Dockerfile' in file or file in ('.gitignore','.dockerignore'):
                if file.endswith('.env') or file.startswith('.env'):continue
                paths.add(str(path.relative_to(ROOT)))
    entries=[];unchanged=0;missing=[]
    for name in sorted(paths):
        path=ROOT/name;previous=baseline.get(name)
        if not path.is_file():
            if previous:missing.append(name);entries.append({'file':name,'change':'missing','before_sha256':previous})
            continue
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest==previous:unchanged+=1;continue
        entries.append({'file':name,'change':'modified' if previous else 'added','before_sha256':previous,'sha256':digest})
    manifest={'generated_utc':datetime.now(timezone.utc).isoformat(),'basis':'Saved Phase 4 content hashes, not unavailable Git history; preserves pre-existing dirty work','baseline_file_count':len(baseline),'baseline_paths_missing':missing,'unchanged_count':unchanged,'change_counts':dict(Counter(e['change'] for e in entries)),'files':entries}
    (OUT/'change-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'baseline_paths_missing':missing,'changes':manifest['change_counts'],'unchanged':unchanged}))
if __name__=='__main__':main()
