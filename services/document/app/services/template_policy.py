import os
from fastapi import HTTPException
from shared.service_auth import service_request
from app.services.document_contract import TEMPLATES


def publication_policy():
    try:
        response=service_request("admin-api","GET",os.getenv("ADMIN_API_SERVICE_URL","http://localhost:3018")+"/api/v1/internal/config/template_catalog",timeout=3)
        response.raise_for_status()
        data=response.json()["data"]
        if not isinstance(data,dict): raise ValueError("Invalid template policy")
        return data
    except Exception as error:
        raise HTTPException(503,"Template availability cannot be verified") from error


def published(template_id, policy, document_type=None):
    template=TEMPLATES.get(template_id) or TEMPLATES.get(str(document_type)+"-"+str(template_id))
    return bool(template) and policy.get(template["type"]+":"+template["variant"],{}).get("published",True) is not False
