#!/bin/bash
# Run from project root: bash scripts/generate-players.sh
set -e
curl -s "https://fantasy.premierleague.com/api/bootstrap-static/" -H "User-Agent: Mozilla/5.0" -o /tmp/fpl_bootstrap.json
python3 - << 'EOF'
import json
with open('/tmp/fpl_bootstrap.json') as f:
    data = json.load(f)
team_map = {t['id']: t['short_name'] for t in data['teams']}
events = data['events']
gw = next((e['id'] for e in events if e['is_current']), None) \
  or next((e['id'] for e in events if e['is_next']), None) \
  or max((e['id'] for e in events if e['finished']), default=38)
players = [
    {'n': p['web_name'], 't': team_map.get(p['team'], ''), 'p': p['element_type'], 'c': p['now_cost'], 'x': float(p['ep_this'] or 0)}
    for p in data['elements'] if p['status'] != 'u'
]
players.sort(key=lambda p: p['x'], reverse=True)
out = json.dumps({'gw': gw, 'players': players}, separators=(',', ':'))
with open('players.json', 'w') as f:
    f.write(out)
print(f"Done. GW: {gw}, Players: {len(players)}, Size: {len(out)/1024:.1f}KB")
EOF
