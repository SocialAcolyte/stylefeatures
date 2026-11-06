#!/usr/bin/env python3
"""Ask a real MCP server what it can do, and run real tool calls, for the mcp page. Standard library only.

  # a server you start yourself (stdio): the command from its README
  python3 mcp/harvest_mcp.py --stdio "npx -y yourserver-mcp" --list
  python3 mcp/harvest_mcp.py --stdio "node build/index.js" --env API_KEY=demo --list --json mcp/harvest/tools.json

  # a remote server (Streamable HTTP)
  python3 mcp/harvest_mcp.py --http https://mcp.yourserver.dev/mcp --list
  python3 mcp/harvest_mcp.py --http https://mcp.yourserver.dev/mcp --header "Authorization: Bearer $TOKEN" --list

  # real calls: the arguments are the JSON the agent would send. Prints the result and how long it took.
  python3 mcp/harvest_mcp.py --stdio "npx -y yourserver-mcp" \\
      --call search '{"query": "onboarding checklist", "limit": 3}' --out mcp/harvest/search.json

It speaks plain JSON-RPC: initialize, notifications/initialized, then tools/list (every page) and tools/call.
--list prints each tool's name, the first line of its description and its arguments. --out writes the call
(tool, arguments, result, seconds) as JSON so the page can be filled from it verbatim. Use a demo account or
seed data: what you capture goes on a public page.
"""
import argparse, json, os, shlex, subprocess, sys, threading, time, urllib.request, urllib.error

PROTOCOL = '2025-06-18'
ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
src = ap.add_mutually_exclusive_group(required=True)
src.add_argument('--stdio', help='the command that starts the server (quoted)')
src.add_argument('--http', help='the server URL (Streamable HTTP)')
ap.add_argument('--env', action='append', default=[], help='KEY=VALUE for a stdio server (repeatable)')
ap.add_argument('--header', action='append', default=[], help='"Name: value" for an HTTP server (repeatable)')
ap.add_argument('--list', action='store_true', help='print tools/list')
ap.add_argument('--json', help='write the full tools/list result here')
ap.add_argument('--call', nargs=2, action='append', default=[], metavar=('TOOL', 'ARGS_JSON'), help='call a tool (repeatable)')
ap.add_argument('--out', help='write the call(s) here as JSON')
ap.add_argument('--timeout', type=float, default=60)
a = ap.parse_args()


class Stdio:
    def __init__(self, cmd, env):
        e = dict(os.environ); e.update(dict(kv.split('=', 1) for kv in env))
        self.p = subprocess.Popen(shlex.split(cmd), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr, env=e, text=True, bufsize=1)
        self.inbox, self.lock = {}, threading.Condition()
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        for line in self.p.stdout:
            line = line.strip()
            if not line.startswith('{'): continue          # a log line on stdout: not ours
            try: m = json.loads(line)
            except ValueError: continue
            if 'id' in m and ('result' in m or 'error' in m):
                with self.lock: self.inbox[m['id']] = m; self.lock.notify_all()

    def send(self, m):
        self.p.stdin.write(json.dumps(m) + '\n'); self.p.stdin.flush()

    def ask(self, m):
        self.send(m); end = time.time() + a.timeout
        with self.lock:
            while m['id'] not in self.inbox:
                if self.p.poll() is not None: sys.exit(f'the server exited ({self.p.returncode}) before answering {m["method"]}')
                if not self.lock.wait(timeout=max(0, end - time.time())): sys.exit(f'no answer to {m["method"]} in {a.timeout}s')
            return self.inbox.pop(m['id'])

    def close(self):
        try: self.p.stdin.close(); self.p.terminate(); self.p.wait(3)
        except Exception: self.p.kill()


class Http:
    def __init__(self, url, headers):
        self.url, self.session = url, None
        self.h = {'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'}
        for h in headers: k, v = h.split(':', 1); self.h[k.strip()] = v.strip()

    def post(self, m):
        h = dict(self.h)
        if self.session: h['Mcp-Session-Id'] = self.session; h['MCP-Protocol-Version'] = PROTOCOL
        req = urllib.request.Request(self.url, data=json.dumps(m).encode(), headers=h, method='POST')
        try: r = urllib.request.urlopen(req, timeout=a.timeout)
        except urllib.error.HTTPError as e: sys.exit(f'{m.get("method")}: HTTP {e.code} {e.read()[:400].decode(errors="replace")}')
        self.session = r.headers.get('Mcp-Session-Id') or self.session
        return r

    def send(self, m): self.post(m).read()

    def ask(self, m):
        r = self.post(m); ctype = r.headers.get('Content-Type', '')
        if 'text/event-stream' in ctype:                    # read events until our answer arrives
            data = []
            for raw in r:
                line = raw.decode('utf-8', 'replace').rstrip('\r\n')
                if line.startswith('data:'): data.append(line[5:].lstrip())
                elif not line and data:
                    try: msg = json.loads('\n'.join(data))
                    except ValueError: msg = None
                    data = []
                    if isinstance(msg, dict) and msg.get('id') == m['id']: return msg
            sys.exit(f'{m["method"]}: the event stream ended without an answer')
        return json.loads(r.read() or b'{}')

    def close(self):
        if self.session:
            try: urllib.request.urlopen(urllib.request.Request(self.url, headers={**self.h, 'Mcp-Session-Id': self.session}, method='DELETE'), timeout=5)
            except Exception: pass


def ok(m, what):
    if 'error' in m: sys.exit(f'{what}: {m["error"].get("message")} ({m["error"].get("code")})')
    return m['result']


c = Stdio(a.stdio, a.env) if a.stdio else Http(a.http, a.header)
n = 0
def rid():
    global n; n += 1; return n
try:
    init = ok(c.ask({'jsonrpc': '2.0', 'id': rid(), 'method': 'initialize', 'params': {
        'protocolVersion': PROTOCOL, 'capabilities': {}, 'clientInfo': {'name': 'stylefeatures-harvest', 'version': '1.0'}}}), 'initialize')
    c.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
    info = init.get('serverInfo', {})
    print(f'# {info.get("name", "?")} {info.get("version", "")} · protocol {init.get("protocolVersion")}')
    if init.get('instructions'): print('# instructions:', init['instructions'].strip().splitlines()[0])

    if a.list or a.json:
        tools, cursor = [], None
        while True:
            r = ok(c.ask({'jsonrpc': '2.0', 'id': rid(), 'method': 'tools/list', 'params': {'cursor': cursor} if cursor else {}}), 'tools/list')
            tools += r.get('tools', []); cursor = r.get('nextCursor')
            if not cursor: break
        for t in tools:
            props = (t.get('inputSchema') or {}).get('properties', {}); req = set((t.get('inputSchema') or {}).get('required', []))
            args = ', '.join(f'{k}{"" if k in req else "?"}: {v.get("type", "any")}' for k, v in props.items())
            desc = (t.get('description') or '').strip().splitlines()[0:1]
            print(f'\n{t["name"]}({args})\n  {desc[0] if desc else "(no description)"}')
        print(f'\n{len(tools)} tools')
        if a.json:
            os.makedirs(os.path.dirname(os.path.abspath(a.json)), exist_ok=True)
            json.dump({'server': info, 'tools': tools}, open(a.json, 'w'), indent=2); print('wrote', a.json)

    calls = []
    for name, raw in a.call:
        args = json.loads(raw); t0 = time.time()
        r = ok(c.ask({'jsonrpc': '2.0', 'id': rid(), 'method': 'tools/call', 'params': {'name': name, 'arguments': args}}), f'tools/call {name}')
        dt = round(time.time() - t0, 2)
        print(f'\n── {info.get("name", "server")} · {name}  {json.dumps(args)}  ({dt} s{", error" if r.get("isError") else ""})')
        for part in r.get('content', []):
            print(part.get('text') if part.get('type') == 'text' else f'[{part.get("type")}]')
        if r.get('structuredContent') is not None: print(json.dumps(r['structuredContent'], indent=2)[:4000])
        calls.append({'tool': name, 'arguments': args, 'result': r, 'seconds': dt})
    if a.out and calls:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        json.dump(calls if len(calls) > 1 else calls[0], open(a.out, 'w'), indent=2); print('wrote', a.out)
finally:
    c.close()
