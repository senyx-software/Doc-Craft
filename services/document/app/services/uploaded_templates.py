import os
from urllib.parse import quote
from fastapi import HTTPException
from shared.service_auth import service_request

def fetch_uploaded(user_id,identity=None):
    path='/api/v1/internal/uploaded-templates'+('/'+quote(identity,safe='') if identity else '')
    try:
        response=service_request('admin-api','GET',os.getenv('ADMIN_API_SERVICE_URL','http://localhost:3018')+path+'?user_id='+quote(user_id,safe=''),timeout=5)
        if response.status_code==404:raise HTTPException(404,'Template unavailable')
        response.raise_for_status()
        return response.json()
    except HTTPException:raise
    except Exception as error:raise HTTPException(503,'Uploaded template availability cannot be verified') from error
