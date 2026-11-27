#!/usr/bin/env bash
# Applies migrations and collects static files on every container start
# (idempotent - migrate/collectstatic are safe to re-run), then serves with
# gunicorn instead of the dev server manage.py runserver uses locally.
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

# gthread: a slow file-share chunk upload or a long download (shares app)
# holds one thread, not a whole worker; --timeout is the worker heartbeat,
# raised so a busy worker is not killed mid-chunk.
exec gunicorn dms.wsgi:application --bind 0.0.0.0:8000 --workers 3 \
    --worker-class gthread --threads 8 --timeout 300
