import os
from flask import request, g
from flask_cors import CORS

base_dir = os.path.dirname(__file__)  # directory where main.py is located

# Absolute paths to your config and openapi files
config_path = os.path.join(base_dir, 'pygeoapi-generate-config', 'pygeoapi-config.yml')
openapi_path = os.path.join(base_dir, 'pygeoapi-generate-config', 'openapi.yml')

# Set environment variables for pygeoapi
os.environ['PYGEOAPI_CONFIG'] = config_path
os.environ['PYGEOAPI_OPENAPI'] = openapi_path

# run with Flask and CORS - `app` is module-level (not gated behind
# `if __name__ == '__main__'`) so gunicorn can import it as `main:app` in
# Docker; `python main.py` still works for local dev via the block below.
from pygeoapi.flask_app import APP as app

# Enable CORS for all routes
CORS(app, origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://oceandata.spc.int",
    "https://ocean-pygeoapi.spc.int",
    "https://opmdata.gem.spc.int",
    "https://opmthredds.gem.spc.int"
], supports_credentials=True)

# Add custom headers for tile requests to comply with OSM usage policy
@app.before_request
def add_headers():
    if request.endpoint and 'tile' in str(request.endpoint):
        g.user_agent = 'DMS-PyGeoAPI/1.0 (Data Management System)'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
