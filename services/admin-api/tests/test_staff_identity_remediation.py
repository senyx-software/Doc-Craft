"""Actual repository/SQLite transactions, no service identity or database mocks."""
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
import pytest
from app.repositories.admin_user_repository import admin_user_repository as repository
from app.db.admin_db import admin_db
from app.core.exceptions import AppException


def test_concurrent_staff_creates_preserve_every_identity():
    prefix = uuid4().hex
    with ThreadPoolExecutor(max_workers=8) as executor:
        users = list(executor.map(lambda i: repository.create(f'{prefix}-{i}@example.com', 'unused-test-hash', 'role_support'), range(16)))
    assert len({u.id for u in users}) == 16
    assert all(repository.get_by_id(u.id).email == u.email for u in users)


def test_duplicate_normalized_email_conflicts_without_overwriting():
    email = uuid4().hex + '@example.com'
    original = repository.create(email, 'unused-original-hash', 'role_super_admin')
    with ThreadPoolExecutor(max_workers=2) as executor:
        def create(_):
            try:
                repository.create(email.upper(), 'unused-other-hash', 'role_support')
            except AppException as exc:
                return exc.status_code
        assert list(executor.map(create, range(2))) == [409, 409]
    assert repository.get_by_id(original.id).role_id == 'role_super_admin'
    assert repository.get_by_id(original.id).password_hash == 'unused-original-hash'


def test_save_is_update_only_and_preserves_creation_timestamp():
    user = repository.create(uuid4().hex+'@example.com','unused-test-hash','role_support')
    before = admin_db.fetch_one('SELECT created_at FROM admin_users WHERE id=?', (user.id,))
    user.name = 'Updated'
    repository.save(user)
    assert admin_db.fetch_one('SELECT created_at FROM admin_users WHERE id=?', (user.id,)) == before
    user.id = 'absent-'+uuid4().hex
    with pytest.raises(AppException) as error:
        repository.save(user)
    assert error.value.status_code == 404

def test_database_itself_rejects_case_variant_email_even_without_repository_normalization():
    user=repository.create(uuid4().hex+'@example.com','unused-test-hash','role_support')
    with pytest.raises(Exception) as error:
        admin_db.execute('''INSERT INTO admin_users(id,email,password_hash,role_id,role_name,created_at,updated_at)
            SELECT ?,UPPER(email),password_hash,role_id,role_name,created_at,updated_at
            FROM admin_users WHERE id=?''', ('adm_'+uuid4().hex,user.id))
    assert 'UNIQUE' in str(error.value).upper()
    assert repository.get_by_id(user.id).email==user.email
