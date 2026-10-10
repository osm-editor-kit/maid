#!/bin/bash
# Runs Maid variants on one scene and prints one line each. Usage: tools/bench/variants.sh dense "name:query" ...
scene=$1; shift
for v in "$@"; do n=${v%%:*}; q=${v#*:}
  bun run bench --editor maid --scene $scene --repeat ${REPEAT:-1} --label x-$n --variant $n --maid-query "$q" >/dev/null 2>&1
  python3 - "$n" <<'PY'
import json,glob,sys,statistics as st
f=sorted(glob.glob(f'reports/*x-{sys.argv[1]}/results.json'))[-1]
rs=[r for r in json.load(open(f))['results']]
bad=[r.get('error') for r in rs if not r['ok']]
rs=[r for r in rs if r['ok']]
m=lambda fn: st.median([fn(r) for r in rs]) if rs else float('nan')
hov=[v for r in rs for v in r['hoverLatencyMs']]
print(f"{sys.argv[1]:12} load {m(lambda r:r['load']['settledMs']):5.0f} cpu {m(lambda r:r['load']['cpuMs']):5.0f} | panCold cpu/s {m(lambda r:r['panCold']['cpuMs']/3):4.0f} max {m(lambda r:r['panCold']['maxMs']):5.1f} settle {m(lambda r:r['panCold']['settleMs']):4.0f} | panWarm cpu/s {m(lambda r:r['panWarm']['cpuMs']/3):4.0f} max {m(lambda r:r['panWarm']['maxMs']):5.1f} | zoomIn cpu/s {m(lambda r:r['zoomIn']['cpuMs']/2):4.0f} max {m(lambda r:r['zoomIn']['maxMs']):5.1f} settle {m(lambda r:r['zoomIn']['settleMs']):4.0f} | sweep cpu/s {m(lambda r:r['hoverSweep']['cpuMs']/2.4):4.0f} | hover med {st.median([v for v in hov if v>=0] or [-1]):5.1f} miss {sum(v<0 for v in hov)} | sel {m(lambda r:st.median(r['selectMs'])):4.0f} heap {m(lambda r:r['heapMb']):5.1f}", bad or '')
PY
done
