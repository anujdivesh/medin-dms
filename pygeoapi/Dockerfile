FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYGEOAPI_CONFIG=/app/pygeoapi-generate-config/pygeoapi-config.yml
ENV PYGEOAPI_OPENAPI=/app/pygeoapi-generate-config/openapi.yml

# Set work directory
WORKDIR /app

# Install system dependencies required for GDAL and geospatial packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gdal-bin \
        libgdal-dev \
        libproj-dev \
        proj-data \
        proj-bin \
        libgeos-dev \
        libgeos-c1v5 \
        gcc \
        g++ \
        libpq-dev \
        git \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install GDAL Python binding and pygeoapi
RUN pip install --no-cache-dir GDAL==$(gdal-config --version) pygeoapi

# Copy requirements and install additional dependencies
COPY pygeoapi-generate-config/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . /app/

# Set config environment variables
ENV PYGEOAPI_CONFIG=/app/pygeoapi-generate-config/pygeoapi-config.yml
ENV PYGEOAPI_OPENAPI=/app/pygeoapi-generate-config/openapi.yml
ENV DJANGO_ALLOWED_HOSTS=pygeoapi,localhost,127.0.0.1

# Expose port
EXPOSE 5000

# Run the application via gunicorn - --reload-extra-file watches the
# ElasticsearchIndex-driven config that the backend's api.pygeoapi_sync
# regenerates onto the shared volume, so editing an index in the admin
# reloads workers automatically instead of needing a manual container
# restart. Shell form (not exec/JSON form) so ${PYGEOAPI_CONFIG} expands.
CMD gunicorn main:app --bind 0.0.0.0:5000 --workers 2 --reload --reload-extra-file ${PYGEOAPI_CONFIG}
