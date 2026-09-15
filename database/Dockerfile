FROM postgis/postgis:15-3.4-alpine

# Set environment variables for default user/db (can be overridden by docker-compose)
ENV POSTGRES_USER=dms_user
ENV POSTGRES_PASSWORD=dms_password
ENV POSTGRES_DB=dms

# # Copy the SQL dump into the image (for initialization on first run only)
# COPY dump-dms.sql /docker-entrypoint-initdb.d/dump-dms.sql

# Copy initialization scripts
COPY init.sql /docker-entrypoint-initdb.d/00_init.sql
COPY init_new_dms.sql /docker-entrypoint-initdb.d/01_init_new_dms.sql
# One-time initial data for new_dms (see the comment in init_new_dms.sql) -
# runs against the empty database 01_ just created. Only fires on a brand
# new /var/lib/postgresql/data volume, same as the scripts above.
COPY backup/new_dms_seed_2026-08-12.sql /docker-entrypoint-initdb.d/02_seed_new_dms.sql

# Expose PostgreSQL port
EXPOSE 5432

# The base image automatically runs any *.sql in /docker-entrypoint-initdb.d
