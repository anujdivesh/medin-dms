#!/usr/bin/env bash
# Restarts the local pygeoapi dev server (Flask app in main.py) after its
# config has been regenerated - invoked by backend/api/pygeoapi_sync.py
# whenever an ElasticsearchIndex is created/edited/deleted in the Django
# admin, so a new pygeoapi collection appears without a manual restart.
#
# Not part of the docker-compose stack - that path restarts the dms-pygeoapi
# container instead (see PYGEOAPI_RESTART_COMMAND in backend/dms/settings.py).
set -e
cd "$(dirname "$0")"

PORT="${PYGEOAPI_PORT:-5000}"

# Free the port however this system knows how to - only one of these needs
# to exist. Best-effort: a stale/missing process here isn't fatal, the
# `python main.py` below will just fail to bind if the port is still held.
if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" 2>/dev/null || true
elif command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"${PORT}" 2>/dev/null | xargs -r kill -9 || true
fi
sleep 1

source .venv/bin/activate
nohup python main.py > pygeoapi.log 2>&1 &
disown
echo "pygeoapi restarted (pid $!), logging to pygeoapi/pygeoapi.log"
