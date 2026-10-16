from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import seed_admin_with_totp,action_code


def test_template_publication_persists_and_is_not_accessible_by_view_only_staff():
    client=TestClient(app)
    token,secret=seed_admin_with_totp('template-publisher@example.com','Super Admin',['*'],True)
    headers={'Authorization':'Bearer '+token,'X-Admin-2FA':action_code(secret)}
    templates=client.get('/api/v1/admin/templates',headers=headers).json()
    assert templates
    identity=templates[0]['id']
    assert client.post('/api/v1/admin/templates/'+identity+'/withdraw',headers=headers).status_code==200
    assert next(row for row in client.get('/api/v1/admin/templates',headers=headers).json() if row['id']==identity)['status']=='Draft'
    headers['X-Admin-2FA']=action_code(secret)
    assert client.post('/api/v1/admin/templates/'+identity+'/publish',headers=headers).status_code==200
    assert next(row for row in client.get('/api/v1/admin/templates',headers=headers).json() if row['id']==identity)['status']=='Published'
    from tests.conftest import create_test_admin_access_token
    viewer=create_test_admin_access_token('unused','template-viewer@example.com','Viewer',['templates:view'])
    assert client.post('/api/v1/admin/templates/'+identity+'/withdraw',headers={'Authorization':'Bearer '+viewer}).status_code==403
