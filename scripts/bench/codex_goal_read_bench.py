#!/usr/bin/env python3
"""Compare passive Codex goal reads with resume+read, using isolated fixtures only."""
import argparse
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import tempfile
import time

IDS = [f'aaaaaaaa-bbbb-4ccc-8ddd-{i:012d}' for i in range(1, 4)]
SENTINEL = r'''
import json,sys
from pathlib import Path
with Path(sys.argv[1]).open('a') as f: f.write('start\n')
for line in sys.stdin:
 try: req=json.loads(line)
 except ValueError: continue
 if 'id' not in req: continue
 method=req.get('method')
 if method=='initialize': result={'protocolVersion':'2024-11-05','capabilities':{'tools':{}},'serverInfo':{'name':'fixture','version':'1'}}
 elif method=='tools/list': result={'tools':[]}
 else: result={}
 print(json.dumps({'jsonrpc':'2.0','id':req['id'],'result':result}),flush=True)
'''

class Server:
    def __init__(self, binary, home):
        env = dict(os.environ, CODEX_HOME=str(home))
        self.proc = subprocess.Popen([binary, 'app-server'], env=env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            start_new_session=True)
        self.buffer = b''
        self.seq = 0
        try:
            self.call('initialize', {'clientInfo': {'name': 'atelier-goal-bench', 'version': '1'},
                                   'capabilities': {'experimentalApi': True}})
            self.proc.stdin.write(b'{"method":"initialized"}\n')
            self.proc.stdin.flush()
        except BaseException:
            self.close()
            raise

    def call(self, method, params):
        self.seq += 1
        self.proc.stdin.write((json.dumps({'id': self.seq, 'method': method, 'params': params})+'\n').encode())
        self.proc.stdin.flush()
        deadline = time.monotonic()+30
        while time.monotonic() < deadline:
            if b'\n' not in self.buffer:
                if not select.select([self.proc.stdout], [], [], 0.2)[0]:
                    continue
                chunk = os.read(self.proc.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError(f'{method}: app-server exited')
                self.buffer += chunk
                continue
            line, self.buffer = self.buffer.split(b'\n', 1)
            message = json.loads(line)
            if message.get('id') != self.seq:
                continue
            if 'error' in message:
                raise RuntimeError(f'{method}: RPC error {message["error"].get("code")}')
            return message['result']
        raise TimeoutError(method)

    def close(self):
        # Only our newly created process group; never a user's app-server.
        try:
            os.killpg(self.proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(self.proc.pid, signal.SIGKILL)
            self.proc.wait(timeout=3)


def fixture(home, python):
    home.mkdir()
    sentinel = home/'sentinel.py'
    sentinel.write_text(SENTINEL)
    starts = home/'starts.log'
    # JSON quoted strings are valid TOML basic strings for these local paths.
    (home/'config.toml').write_text('[mcp_servers.fixture]\ncommand = '+json.dumps(python)+
        '\nargs = '+json.dumps([str(sentinel), str(starts)])+'\n')
    folder = home/'sessions/2026/09/15'
    folder.mkdir(parents=True)
    for sid in IDS:
        event = {'timestamp': '2026-09-15T09:00:00Z', 'type': 'session_meta', 'payload': {
            'id': sid, 'timestamp': '2026-09-15T09:00:00Z', 'cwd': str(home),
            'originator': 'codex_cli_rs', 'cli_version': '0.154.0', 'source': 'cli',
            'model_provider': 'openai'}}
        (folder/f'rollout-2026-09-15T09-00-00-{sid}.jsonl').write_text(json.dumps(event)+'\n')
    return starts


def count(path):
    return len(path.read_text().splitlines()) if path.exists() else 0


def run(binary, home, python, resume):
    starts = fixture(home, python)
    server = None
    try:
        server = Server(binary, home)
        for sid in IDS:
            server.call('thread/goal/set', {'threadId': sid, 'objective': 'Synthetic goal '+sid[-1]})
        assert server.call('thread/loaded/list', {})['data'] == []
        assert count(starts) == 0
        for sid in IDS:
            if resume:
                server.call('thread/resume', {'threadId': sid, 'cwd': str(home),
                    'approvalPolicy': 'never', 'sandbox': 'read-only'})
            goal = server.call('thread/goal/get', {'threadId': sid})['goal']
            assert goal['objective'] == 'Synthetic goal '+sid[-1]
        time.sleep(0.5)
        result = {'loaded_after_reads': len(server.call('thread/loaded/list', {})['data']),
                  'mcp_starts_after_reads': count(starts), 'goals_verified': 3}
        if not resume:
            server.call('thread/resume', {'threadId': IDS[0], 'cwd': str(home),
                'approvalPolicy': 'never', 'sandbox': 'read-only'})
            deadline = time.monotonic()+5
            while count(starts) == 0 and time.monotonic() < deadline:
                time.sleep(0.05)
            result['mcp_starts_after_first_resume'] = count(starts)
        return result
    finally:
        if server is not None:
            server.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, help='Absolute path of the real Codex executable')
    args = parser.parse_args()
    binary = str(Path(args.binary).resolve(strict=True))
    import sys
    with tempfile.TemporaryDirectory(prefix='atelier-goal-bench-') as temp:
        base = Path(temp)
        before = run(binary, base/'before', sys.executable, True)
        after = run(binary, base/'after', sys.executable, False)
        assert before['loaded_after_reads'] == 3 and before['mcp_starts_after_reads'] == 3, before
        assert after['loaded_after_reads'] == 0 and after['mcp_starts_after_reads'] == 0, after
        assert after['mcp_starts_after_first_resume'] == 1, after
        print(json.dumps({'before_resume_then_get': before, 'after_direct_get': after}, indent=2))

if __name__ == '__main__':
    main()
