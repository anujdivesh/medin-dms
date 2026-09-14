-- Creates the second database the backend (Django) uses, kept separate from
-- POSTGRES_DB (the retired FastAPI backend's "dms") since the two backends'
-- schemas are unrelated - Django's own migrations own every table in this
-- database. Runs automatically by the postgis base image only on a brand
-- new /var/lib/postgresql/data volume (docker-entrypoint-initdb.d scripts
-- never re-run against an already-initialized volume) - it does NOT create
-- this database on the existing production volume. See
-- database/backups/new_dms_seed_*.sql for the one-time data to restore into
-- it there, and Docs/ for the exact commands.
CREATE DATABASE new_dms OWNER dms_user;
