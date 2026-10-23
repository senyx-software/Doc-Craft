"""Optional operator-configured external heartbeat/alerts; no user data or secrets in payloads."""
import json
import os
from pathlib import Path
import urllib.request
from urllib.parse import urlsplit


def notify(home, snapshot, *, send=urllib.request.urlopen):
    path=Path(home)/'monitoring.json'
    if not path.exists():
        return {'configured':False,'delivered':False}
    st=path.lstat()
    if path.is_symlink() or st.st_uid!=0 or st.st_mode&0o077:
        raise ValueError('Monitoring configuration must be root owned and private')
    settings=json.loads(path.read_text())
    if set(settings)!={'heartbeat_url','alert_url'}:
        raise ValueError('Unexpected monitoring settings')
    for value in settings.values():
        u=urlsplit(value)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.fragment:
            raise ValueError('Monitoring requires operator-approved HTTPS endpoints')
    # Failure/ping rules at the remote service must alert when the whole host disappears.
    urls=[settings['heartbeat_url']]
    if snapshot.get('alerts'):
        urls.append(settings['alert_url'])
    body=json.dumps({'service':'doccraft','time':snapshot['time'],'alerts':snapshot.get('alerts',[])}).encode()
    for url in urls:
        request=urllib.request.Request(url,data=body,headers={'Content-Type':'application/json'},method='POST')
        with send(request,timeout=5) as response:
            if not 200<=response.status<300:
                raise RuntimeError('Monitoring delivery rejected')
    return {'configured':True,'delivered':True}
