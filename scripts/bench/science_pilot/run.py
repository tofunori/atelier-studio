#!/usr/bin/env python3
"""Bounded paired CLI pilot. Run --help; results always go outside this checkout."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

from suite import COMMON, PROCEDURE, VERSION, cases
from grade import grade


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


def fingerprint(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def command(provider, model, workspace):
    if provider == 'codex':
        return ['codex', 'exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check',
                '--enable', 'skip_host_skill_discovery', '--disable', 'plugins', '--disable', 'multi_agent',
                '--sandbox', 'workspace-write', '--model', model, '-c', 'model_reasoning_effort="high"',
                '-c', 'project_doc_max_bytes=0', '--json', '--cd', str(workspace), '-']
    return ['claude', '--print', '--safe-mode', '--no-session-persistence', '--model', model,
            '--effort', 'high', '--output-format', 'stream-json', '--verbose',
            '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands',
            '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
            '--tools', 'Read,Write,Edit,Bash', '--allowedTools',
            'Read', 'Write', 'Edit', 'Bash(python3 *)', f'Bash({sys.executable} *)',
            'Bash(ls *)', 'Bash(cat *)']


def events(path):
    rows = []
    for line in path.read_text(errors='replace').splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return rows


def summarize_events(provider, rows):
    result = {'resolved_models': [], 'usage': None, 'cost_estimate_usd': None,
              'terminal_success': False, 'provider_errors': [], 'tool_calls': 0,
              'permission_denials': [], 'final_text': ''}
    if provider == 'codex':
        for row in rows:
            if row.get('type') == 'turn.completed':
                result['terminal_success'] = True
                result['usage'] = row.get('usage')
            if row.get('type') in ('error', 'turn.failed'):
                result['provider_errors'].append(row.get('message') or row.get('error'))
            item = row.get('item') or {}
            if row.get('type') == 'item.completed':
                if item.get('type') == 'agent_message':
                    result['final_text'] = item.get('text', '')
                elif item.get('type') in ('command_execution','file_change','mcp_tool_call'):
                    result['tool_calls'] += 1
    else:
        for row in rows:
            if row.get('type') == 'system' and row.get('subtype') == 'init':
                result['resolved_models'] = [row.get('model')]
            if row.get('type') == 'assistant':
                result['tool_calls'] += sum(x.get('type') == 'tool_use' for x in (row.get('message') or {}).get('content', []))
            if row.get('type') == 'result':
                result['terminal_success'] = row.get('subtype') == 'success' and not row.get('is_error')
                result['usage'] = row.get('usage')
                result['cost_estimate_usd'] = row.get('total_cost_usd')
                result['resolved_models'] = list(row.get('modelUsage') or {}) or result['resolved_models']
                result['permission_denials'] = row.get('permission_denials', [])
                result['final_text'] = row.get('result', '')
                if not result['terminal_success']:
                    result['provider_errors'].append(row.get('errors') or row.get('result'))
    return result


def terminate(proc):
    # Each trial has its own process group. Never target existing app processes.
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.wait(timeout=3)


def trial(root, provider, model, condition, case, timeout):
    tag = f'{provider}-{case["id"]}-{condition}'
    logs = root / 'trials' / tag
    logs.mkdir(parents=True)
    # Agent cwd is unrelated to the result tree: rubrics/other answers stay outside it.
    import tempfile
    workspace = Path(tempfile.mkdtemp(prefix=f'atelier-science-{provider}-'))
    for name, data in case['files'].items():
        (workspace / name).write_text(data)
    prompt = COMMON + '\n' + (PROCEDURE + '\n' if condition == 'procedure' else '') + case['prompt']
    prompt += f'\nLimite de cet essai : {timeout} secondes. Python : {sys.executable}. Dossier : {workspace}.\n'
    (logs / 'prompt.txt').write_text(prompt)
    cmd = command(provider, model, workspace)
    write_json(logs / 'command.json', cmd)
    started = time.monotonic()
    started_utc = datetime.now(timezone.utc).isoformat()
    timed_out = False
    env = dict(os.environ, MPLBACKEND='Agg', MPLCONFIGDIR=str(workspace / '.mpl'), PYTHONDONTWRITEBYTECODE='1')
    with (logs / 'events.jsonl').open('w') as stdout, (logs / 'stderr.txt').open('w') as stderr:
        proc = subprocess.Popen(cmd, cwd=workspace, env=env, stdin=subprocess.PIPE,
                                stdout=stdout, stderr=stderr, text=True, start_new_session=True)
        try:
            proc.communicate(prompt, timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            terminate(proc)
        except BaseException:
            terminate(proc)
            raise
    elapsed = time.monotonic() - started
    details = summarize_events(provider, events(logs / 'events.jsonl'))
    details['requested_model'] = model
    # Preserve outputs before grading; grader never repairs an agent answer.
    import shutil
    shutil.copytree(workspace, logs / 'workspace', symlinks=True, ignore=shutil.ignore_patterns('.mpl', '__pycache__'))
    status = 'timeout' if timed_out else 'completed' if details['terminal_success'] and proc.returncode == 0 else 'infrastructure_error'
    result = {'id':tag, 'case':case['id'], 'provider':provider, 'condition':condition,
              'status':status, 'exit_code':proc.returncode, 'seconds':round(elapsed,3),
              'started_at':started_utc, 'workspace':str(workspace), **details}
    result['grading'] = grade(case, logs / 'workspace') if status in ('completed','timeout') else None
    write_json(logs / 'result.json', result)
    print(json.dumps({k:result[k] for k in ['id','status','seconds']}, ensure_ascii=False), flush=True)
    return result


def provider_campaign(root, provider, model, suite, timeout):
    results = []
    for i, case in enumerate(suite):
        order = ['baseline','procedure'] if i % 2 == 0 else ['procedure','baseline']
        for condition in order:
            result = trial(root, provider, model, condition, case, timeout)
            results.append(result)
            if result['status'] == 'infrastructure_error':
                return results  # Do not burn quota repeating auth or transport failures.
    return results


def report(root):
    rows = [json.loads(p.read_text()) for p in sorted((root / 'trials').glob('*/result.json'))]
    summary = []
    for provider in sorted({r['provider'] for r in rows}):
        for condition in ['baseline','procedure']:
            items = [r for r in rows if r['provider']==provider and r['condition']==condition]
            graded = [r for r in items if r['grading'] is not None]
            costs = [r['cost_estimate_usd'] for r in items if r['cost_estimate_usd'] is not None]
            usages = [r['usage'] for r in items if r['usage'] is not None]
            input_tokens = sum(u.get('input_tokens',0) + (u.get('cache_creation_input_tokens',0)+u.get('cache_read_input_tokens',0) if provider=='claude' else 0) for u in usages)
            output_tokens = sum(u.get('output_tokens',0) for u in usages)
            summary.append({'provider':provider,'condition':condition,'attempted':len(items),
                'completed':sum(r['status']=='completed' for r in items),
                'timeouts':sum(r['status']=='timeout' for r in items),
                'infrastructure_errors':sum(r['status']=='infrastructure_error' for r in items),
                'all_pass':sum(r['grading']['all_pass'] for r in graded),
                'mean_score':sum(r['grading']['score'] for r in graded)/len(graded) if graded else None,
                'seconds':round(sum(r['seconds'] for r in items),1),
                'usage_records':len(usages), 'reported_input_tokens_including_cache':input_tokens if len(usages)==len(items) and items else None,
                'reported_output_tokens':output_tokens if len(usages)==len(items) and items else None,
                'reported_cost_estimate_usd':round(sum(costs),6) if len(costs)==len(items) and items else None})
    write_json(root/'summary.json', summary)
    pairs = []
    for provider in sorted({r['provider'] for r in rows}):
        for case_id in sorted({r['case'] for r in rows if r['provider']==provider}):
            matched = {r['condition']:r for r in rows if r['provider']==provider and r['case']==case_id}
            usable = all(c in matched and matched[c]['grading'] is not None for c in ('baseline','procedure'))
            pairs.append({'provider':provider,'case':case_id,'usable':usable,
                          'score_delta':matched['procedure']['grading']['score']-matched['baseline']['grading']['score'] if usable else None,
                          'seconds_delta':matched['procedure']['seconds']-matched['baseline']['seconds'] if usable else None})
    write_json(root/'paired.json',pairs)
    lines = ['# Pilote scientifique — résultats exploratoires', '',
        'Cas fictifs, un essai par condition. Mesure des CLI, sans modification du runtime Atelier.', '',
        '| Fournisseur | Condition | Essais | Terminés | Délais | Erreurs infra | Tout correct | Score moyen | Temps cumulé (s) |',
        '|---|---|---:|---:|---:|---:|---:|---:|---:|']
    for s in summary:
        score = 'inconnu' if s['mean_score'] is None else f'{100*s["mean_score"]:.1f}%'
        lines.append(f'| {s["provider"]} | {s["condition"]} | {s["attempted"]} | {s["completed"]} | {s["timeouts"]} | {s["infrastructure_errors"]} | {s["all_pass"]} | {score} | {s["seconds"]} |')
    lines += ['', '## Usage rapporté', '',
              '| Fournisseur | Condition | Tokens entrée, cache inclus | Tokens sortie | Estimation USD |',
              '|---|---|---:|---:|---:|']
    for s in summary:
        values = [s[k] if s[k] is not None else 'inconnu' for k in ('reported_input_tokens_including_cache','reported_output_tokens','reported_cost_estimate_usd')]
        lines.append(f'| {s["provider"]} | {s["condition"]} | {values[0]} | {values[1]} | {values[2]} |')
    lines += ['', '## Détail', '']
    for provider in sorted({r['provider'] for r in rows}):
        items = [p for p in pairs if p['provider']==provider and p['usable']]
        if items:
            lines.append(f'Paires notées {provider} : {len(items)}; différence moyenne de score procédure − référence : {100*sum(p["score_delta"] for p in items)/len(items):+.1f} points.')
    for row in rows:
        failed = ', '.join(k for k,v in (row['grading'] or {}).get('checks',{}).items() if not v)
        lines.append(f'- `{row["id"]}` : {row["status"]}, {row["seconds"]:.1f} s; contrôles échoués : {failed or "aucun"}.')
    lines += ['', '## Limites', '',
        'Les scores portent sur les critères mécaniques. La prose et les figures exigent une revue indépendante. '
        'Une seule répétition et des cas conçus pour le pilote ne permettent aucune généralisation statistique. '
        'Les coûts rapportés sont des estimations fournisseur, pas des débits d’abonnement. '
        'Les entrées de comparaison sont appariées; les résultats des deux fournisseurs ne sont pas directement comparables.', '']
    (root/'REPORT.md').write_text('\n'.join(lines))
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--providers', nargs='+', choices=['codex','claude'], default=['codex','claude'])
    parser.add_argument('--codex-model', default='gpt-6-astra')
    parser.add_argument('--claude-model', default='opus')
    parser.add_argument('--timeout', type=int, default=150)
    parser.add_argument('--case', action='append')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--report-only', action='store_true')
    args = parser.parse_args()
    root = args.output.resolve()
    if args.report_only:
        print(json.dumps(report(root),ensure_ascii=False,indent=2)); return
    if root.exists():
        raise SystemExit('Output already exists: use a new campaign directory; never overwrite trials.')
    checkout = Path(__file__).resolve().parents[3]
    if root == checkout or checkout in root.parents:
        raise SystemExit('Results must stay outside the Atelier checkout.')
    if not 10 <= args.timeout <= 300:
        raise SystemExit('timeout must be between 10 and 300 seconds')
    suite = cases()
    if args.case:
        suite = [c for c in suite if c['id'] in args.case]
        if len(suite) != len(set(args.case)):
            raise SystemExit('unknown case')
    root.mkdir(parents=True)
    definition = {'version':VERSION,'cases':suite,'common':COMMON,'procedure':PROCEDURE}
    write_json(root/'suite.lock.json', definition)
    models = {'codex':args.codex_model,'claude':args.claude_model}
    versions = {p:subprocess.run([p,'--version'],capture_output=True,text=True,timeout=15).stdout.strip() for p in args.providers}
    manifest = {'version':VERSION,'created_at':datetime.now(timezone.utc).isoformat(),
                'suite_sha256':fingerprint(definition),'models':models,'versions':versions,
                'timeout_seconds':args.timeout,'effort':'high','providers':args.providers,
                'source_sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in Path(__file__).parent.glob('*.py')},
                'interpretation':'synthetic exploratory procedure ablation; not a full Atelier or OpenScience benchmark'}
    write_json(root/'manifest.json', manifest)
    if args.prepare_only:
        print(json.dumps(manifest,ensure_ascii=False,indent=2)); return
    with ThreadPoolExecutor(max_workers=len(args.providers)) as pool:
        futures = [pool.submit(provider_campaign,root,p,models[p],suite,args.timeout) for p in args.providers]
        for future in as_completed(futures):
            future.result()
            report(root)
    print(json.dumps(report(root),ensure_ascii=False,indent=2))


if __name__ == '__main__':
    main()
