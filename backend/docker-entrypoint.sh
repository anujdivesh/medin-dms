#!/usr/bin/env bash
# Applies migrations and collects static files on every container start
# (idempotent - migrate/collectstatic are safe to re-run), then serves with
# gunicorn instead of the dev server manage.py runserver uses locally.
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

exec gunicorn dms.wsgi:application --bind 0.0.0.0:8000 --workers 3
