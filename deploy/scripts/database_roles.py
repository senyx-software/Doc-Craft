"""Refresh existing permission grants without rotating a single password."""
import json,os,sys
from pathlib import Path
import psycopg2
sys.path.insert(0,'/app')
from scripts.staging_database_roles import provision
credentials=json.loads(Path('/run/secrets/runtime_roles').read_text())
with psycopg2.connect(os.environ['STAGING_MIGRATION_DATABASE_URL']) as connection:
 provision(connection,'doccraft',expected_database=os.environ['EXPECTED_DATABASE'],credentials=credentials)
print('Scoped runtime grants refreshed; existing passwords preserved')
