#!/bin/sh
# PROTOTYPE, throwaway: progress tracker for run-lxc.sh
cd /opt/prototypes/parsing-experiment
N=$(grep -c '"id"' sample.json)
echo "Dues parsing experiment on $(hostname)   $(date -u +%FT%TZ)   ($N files x 2 runs per variant)"
echo; echo "Stages:"; grep '^==' run.log 2>/dev/null | sed 's/^== /  /'
[ -f build-py.log ] && ! grep -q '^== ts ' run.log && { echo "  py build: $(grep -o '#[0-9]* [A-Z].*' build-py.log | tail -1 | cut -c1-90)"; }
echo; printf "%-22s %8s %8s  %s\n" VARIANT RUN1 RUN2 LAST
for v in ts-text ts-tesseract ts-tesseract-hin ts-paddle py-text py-rapidocr py-rapidocr-ocronly py-docling; do
  r1=$(grep -c "^$v 1 " run.log 2>/dev/null); r2=$(grep -c "^$v 2 " run.log 2>/dev/null)
  last=$(grep "^$v " run.log 2>/dev/null | tail -1 | cut -d' ' -f3-5)
  printf "%-22s %5s/%-2s %5s/%-2s  %s\n" "$v" "$r1" "$N" "$r2" "$N" "$last"
done
echo; echo "Errors: $(grep -cE 'Error|FAILED|skipped' run.log 2>/dev/null)"
echo "Load: $(cut -d' ' -f1-3 /proc/loadavg)   Mem: $(free -m | awk '/Mem/{print $3"/"$2" MB"}')   Disk: $(df -h / | awk 'NR==2{print $3"/"$2}')"
pgrep -f "[r]un-lxc.sh" >/dev/null && echo "State: RUNNING" || echo "State: STOPPED"
