import contextlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from backup_remote import repository_location,private_file
from operations_alerts import notify

class Operations(unittest.TestCase):
 def test_backup_rejects_local_destinations(self):
  for location in ('/tmp/backup','file:/backup','s3:http://storage.example/bucket','s3:https://127.0.0.1/bucket'):
   with self.assertRaises(ValueError):repository_location(location)
  self.assertEqual(repository_location('s3:https://storage.example/bucket'),'s3:https://storage.example/bucket')
 def test_backup_rejects_non_private_and_symlink_config(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'policy';p.write_text('{}');p.chmod(0o644)
   with self.assertRaises(ValueError):private_file(p)
   link=Path(folder)/'link';link.symlink_to(p)
   with self.assertRaises(ValueError):private_file(link)
 def test_alerts_are_optional_without_sending_network_requests(self):
  with tempfile.TemporaryDirectory() as folder:
   def reject(*a,**k):raise AssertionError('No request expected')
   self.assertEqual(notify(folder,{'time':1},send=reject),{'configured':False,'delivered':False})
 def test_heartbeat_and_alert_are_separate_and_sanitized(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder)/'monitoring.json';p.write_text(json.dumps({'heartbeat_url':'https://monitor.example/ping','alert_url':'https://monitor.example/alert'}));p.chmod(0o600)
   requests=[]
   class Response:
    status=204
    def __enter__(self):return self
    def __exit__(self,*a):pass
   def send(request,timeout):requests.append(request);return Response()
   with patch('operations_alerts.Path.lstat') as stat:
    stat.return_value.st_uid=0;stat.return_value.st_mode=0o600
    result=notify(folder,{'time':1,'alerts':['disk_low'],'private':'must not be sent'},send=send)
   self.assertTrue(result['delivered']);self.assertEqual(len(requests),2)
   self.assertNotIn(b'private',requests[0].data)
