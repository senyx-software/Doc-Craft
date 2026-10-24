#!/usr/bin/env python3
"""Read-only OCI discovery. Never emits keys, instance metadata, tags or raw errors."""
import argparse
import configparser
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess

REGION = 'ap-mumbai-1'
INSTANCE = 'instance-20261021-1441'
VCN = 'vcn-20261021-1443'
SUBNET = 'subnet-20261021-1443'


def select(data, fields):
    if isinstance(data, list):
        return [select(row, fields) for row in data]
    if isinstance(data, dict):
        # OCI collection endpoints sometimes wrap their list in items.
        if 'items' in data and not set(fields) & data.keys():
            return select(data['items'], fields)
        return {key: data[key] for key in fields if key in data}
    return data


class Audit:
    def __init__(self, args):
        self.args = args
        self.evidence = {'observed_at_utc': datetime.now(timezone.utc).isoformat(),
                         'region_requested': REGION, 'operations': {}, 'cloud_mutations': 0,
                         'authenticated': False, 'discovery_complete': False}

    def call(self, label, command, fields):
        cmd = [self.args.oci, '--config-file', str(self.args.config_file),
               '--profile', self.args.profile, '--region', REGION, '--no-retry',
               '--connection-timeout', '10', '--read-timeout', '20', '--output', 'json', *command]
        try:
            result = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=90)
            if result.returncode:
                # Authentication failures can contain URLs and request details. Keep only an error code.
                code = 'CLI_OR_API_ERROR'
                error = result.stderr[result.stderr.find('{'):]
                try:
                    detail = json.loads(error)
                    code = str(detail.get('code', code))[:80]
                except (ValueError, TypeError):
                    pass
                self.evidence['operations'][label] = {'status': 'FAILED', 'code': code,
                                                      'exit_code': result.returncode}
                return None
            # OCI CLI emits no JSON for some successful --all lists with zero
            # results. Do not misreport those as an API/permission failure.
            if not result.stdout.strip() and '--all' in command and any(part == 'list' or part.startswith('list-') for part in command):
                self.evidence['operations'][label] = {'status': 'OBSERVED', 'data': [],
                                                     'empty_cli_list_output': True}
                return []
            data = json.loads(result.stdout)['data']
            self.evidence['operations'][label] = {'status': 'OBSERVED', 'data': select(data, fields)}
            return data
        except (OSError, ValueError, KeyError, subprocess.SubprocessError):
            self.evidence['operations'][label] = {'status': 'FAILED', 'code': 'LOCAL_ERROR_OR_TIMEOUT'}
            return None

    def run(self):
        if not self.args.oci or not Path(self.args.oci).is_file():
            self.evidence['blocker'] = 'OCI_CLI_MISSING'
            return
        version = subprocess.run([self.args.oci, '--version'], capture_output=True, text=True, timeout=15)
        self.evidence['cli_version'] = version.stdout.strip() if version.returncode == 0 else 'unverified'
        config = self.args.config_file
        if not config.is_file() or config.is_symlink():
            self.evidence['blocker'] = 'OCI_CONFIG_MISSING_OR_SYMLINK'
            return
        if config.stat().st_uid != os.getuid() or stat.S_IMODE(config.stat().st_mode) & 0o077:
            self.evidence['blocker'] = 'OCI_CONFIG_MUST_BE_OPERATOR_OWNED_MODE_0600'
            return
        parser = configparser.ConfigParser(interpolation=None)
        try:
            parser.read(config)
        except configparser.Error:
            self.evidence['blocker'] = 'OCI_CONFIG_PARSE_FAILED_CONTENTS_WITHHELD'
            return
        try:
            profile = parser[self.args.profile]
            tenancy, user = profile['tenancy'], profile['user']
            self.evidence['configured_region_matches'] = profile.get('region') == REGION
            if not self.evidence['configured_region_matches']:
                self.evidence['blocker'] = 'CONFIGURED_REGION_MISMATCH'
                return
        except KeyError:
            self.evidence['blocker'] = 'INCOMPLETE_OCI_PROFILE'
            return
        if profile.get('security_token_file'):
            # Token profiles require explicit CLI auth selection; no fallback to an API signing key.
            self.evidence['blocker'] = 'SESSION_TOKEN_PROFILE_REQUIRES_REVIEW_USE_API_KEY_PROFILE'
            return
        identity = self.call('identity', ['iam', 'user', 'get', '--user-id', user], ['id', 'name', 'lifecycle-state'])
        tenant = self.call('tenancy', ['iam', 'tenancy', 'get', '--tenancy-id', tenancy], ['id', 'name', 'home-region-key'])
        self.evidence['authenticated'] = identity is not None or tenant is not None
        if not self.evidence['authenticated']:
            self.evidence['blocker'] = 'OCI_AUTHENTICATION_OR_IDENTITY_PERMISSIONS_UNVERIFIED'
            return
        if not identity or not tenant or tenant.get('name') != 'erandasathsara':
            self.evidence['blocker'] = 'EXPECTED_TENANCY_AND_IDENTITY_NOT_CONFIRMED'
            return
        c = ['--compartment-id', tenancy]
        self.call('regions', ['iam', 'region-subscription', 'list', '--tenancy-id', tenancy, '--all'],
                  ['region-name', 'region-key', 'is-home-region', 'status'])
        self.call('compartments', ['iam', 'compartment', 'list', *c, '--access-level', 'ACCESSIBLE', '--all'],
                  ['id', 'name', 'lifecycle-state', 'compartment-id'])
        instances = self.call('instances', ['compute', 'instance', 'list', *c, '--display-name', INSTANCE, '--all'],
                              ['id', 'display-name', 'lifecycle-state', 'shape', 'shape-config', 'availability-domain', 'image-id'])
        matches = [row for row in instances or [] if row.get('lifecycle-state') != 'TERMINATED']
        if len(matches) != 1:
            self.evidence['blocker'] = 'INSTANCE_NAME_MISSING_OR_AMBIGUOUS_IN_EXPECTED_ROOT_COMPARTMENT'
            return
        vm = matches[0]
        ad = vm['availability-domain']
        vm = self.call('instance', ['compute', 'instance', 'get', '--instance-id', vm['id']],
                       ['id', 'display-name', 'compartment-id', 'region', 'lifecycle-state', 'shape', 'shape-config',
                        'availability-domain', 'image-id', 'launch-options', 'agent-config']) or vm
        self.evidence['cost_review'] = {'shape': vm.get('shape'), 'always_free_candidate': vm.get('shape') in
                                      ('VM.Standard.E2.1.Micro', 'VM.Standard.A1.Flex'),
                                      'billing_verified': False,
                                      'note': 'Shape eligibility alone does not prove free usage; review home region, allocation, storage and billing.'}
        if vm.get('image-id'):
            self.call('image', ['compute', 'image', 'get', '--image-id', vm['image-id']],
                      ['id', 'display-name', 'operating-system', 'operating-system-version', 'size-in-mbs', 'launch-mode'])
        self.call('shape', ['compute', 'shape', 'list', *c, '--availability-domain', ad, '--all'],
                  ['shape', 'processor-description', 'ocpus', 'memory-in-gbs', 'max-vnic-attachments', 'is-flexible'])
        vnics = self.call('vnic_attachments', ['compute', 'vnic-attachment', 'list', *c, '--instance-id', vm['id'], '--all'],
                          ['id', 'vnic-id', 'subnet-id', 'lifecycle-state'])
        attached_nsgs = set()
        subnets = set()
        for index, attachment in enumerate(vnics or []):
            if attachment.get('lifecycle-state') != 'ATTACHED':
                continue
            vnic_id = attachment['vnic-id']
            vnic = self.call('vnic_' + str(index), ['network', 'vnic', 'get', '--vnic-id', vnic_id],
                             ['id', 'subnet-id', 'private-ip', 'public-ip', 'is-primary', 'nsg-ids', 'lifecycle-state', 'security-attributes'])
            self.call('private_ips_' + str(index), ['network', 'private-ip', 'list', '--vnic-id', vnic_id, '--all'],
                      ['id', 'ip-address', 'is-primary', 'subnet-id', 'vnic-id'])
            if vnic:
                attached_nsgs.update(vnic.get('nsg-ids', []))
                if vnic.get('subnet-id'):
                    subnets.add(vnic['subnet-id'])
        vcns = self.call('vcns', ['network', 'vcn', 'list', *c, '--display-name', VCN, '--all'],
                         ['id', 'display-name', 'cidr-blocks', 'lifecycle-state'])
        self.call('named_subnet', ['network', 'subnet', 'list', *c, '--display-name', SUBNET, '--all'],
                  ['id', 'display-name', 'vcn-id', 'cidr-block', 'prohibit-public-ip-on-vnic', 'route-table-id', 'security-list-ids'])
        for index, subnet_id in enumerate(sorted(subnets)):
            self.call('attached_subnet_' + str(index), ['network', 'subnet', 'get', '--subnet-id', subnet_id],
                      ['id', 'display-name', 'vcn-id', 'cidr-block', 'prohibit-public-ip-on-vnic', 'route-table-id', 'security-list-ids'])
        for index, vcn in enumerate(vcns or []):
            v = ['--vcn-id', vcn['id']]
            for label, command, fields in [
                ('internet_gateways', 'internet-gateway', ['id', 'display-name', 'is-enabled', 'lifecycle-state']),
                ('nat_gateways', 'nat-gateway', ['id', 'display-name', 'block-traffic', 'lifecycle-state']),
                ('service_gateways', 'service-gateway', ['id', 'display-name', 'services', 'block-traffic']),
                ('routes', 'route-table', ['id', 'display-name', 'route-rules']),
                ('security_lists', 'security-list', ['id', 'display-name', 'ingress-security-rules', 'egress-security-rules']),
                ('nsgs', 'nsg', ['id', 'display-name', 'lifecycle-state']),
            ]:
                self.call(label + '_' + str(index), ['network', command, 'list', *c, *v, '--all'], fields)
        for index, nsg_id in enumerate(sorted(attached_nsgs)):
            self.call('attached_nsg_rules_' + str(index), ['network', 'nsg', 'rules', 'list', '--nsg-id', nsg_id, '--all'],
                      ['id', 'direction', 'source', 'source-type', 'destination', 'destination-type', 'protocol', 'tcp-options', 'udp-options', 'is-stateless'])
        public_fields = ['id', 'ip-address', 'assigned-entity-id', 'assigned-entity-type', 'private-ip-id', 'lifetime', 'lifecycle-state', 'scope']
        self.call('regional_public_ips', ['network', 'public-ip', 'list', *c, '--scope', 'REGION', '--all'], public_fields)
        self.call('ad_public_ips', ['network', 'public-ip', 'list', *c, '--scope', 'AVAILABILITY_DOMAIN', '--availability-domain', ad, '--all'], public_fields)
        self.call('bastions', ['bastion', 'bastion', 'list', *c, '--all'],
                  ['id', 'name', 'lifecycle-state', 'target-subnet-id', 'target-vcn-id', 'private-endpoint-ip-address',
                   'client-cidr-block-allow-list', 'max-session-ttl-in-seconds'])
        self.call('security_zones', ['cloud-guard', 'security-zone-collection', 'list-security-zones', *c, '--all'],
                  ['id', 'display-name', 'compartment-id', 'security-recipe-id', 'lifecycle-state'])
        boots = self.call('boot_attachments', ['compute', 'boot-volume-attachment', 'list', *c, '--availability-domain', ad, '--instance-id', vm['id'], '--all'],
                          ['id', 'boot-volume-id', 'lifecycle-state', 'is-read-only'])
        for index, boot in enumerate(boots or []):
            self.call('boot_volume_' + str(index), ['bv', 'boot-volume', 'get', '--boot-volume-id', boot['boot-volume-id']],
                      ['id', 'display-name', 'size-in-gbs', 'vpus-per-gb', 'lifecycle-state', 'is-auto-tune-enabled'])
        self.call('block_attachments', ['compute', 'volume-attachment', 'list', *c, '--instance-id', vm['id'], '--all'],
                  ['id', 'volume-id', 'lifecycle-state', 'is-read-only', 'attachment-type'])
        self.call('block_volumes', ['bv', 'volume', 'list', *c, '--all'],
                  ['id', 'display-name', 'size-in-gbs', 'vpus-per-gb', 'lifecycle-state'])
        # Include other boot disks in the root compartment when assessing the storage allowance.
        self.call('boot_volumes_in_ad', ['bv', 'boot-volume', 'list', *c, '--availability-domain', ad, '--all'],
                  ['id', 'display-name', 'size-in-gbs', 'vpus-per-gb', 'lifecycle-state'])
        self.call('quotas', ['limits', 'quota', 'list', *c, '--all'], ['id', 'name', 'statements', 'lifecycle-state'])
        for service in ('compute', 'vcn', 'block-storage', 'oci-bastion'):
            self.call('limits_' + service, ['limits', 'value', 'list', *c, '--service-name', service, '--all'],
                      ['name', 'value', 'scope-type', 'availability-domain', 'is-resource-availability-supported'])
        failed = [key for key, row in self.evidence['operations'].items() if row['status'] != 'OBSERVED']
        self.evidence['discovery_complete'] = not failed
        self.evidence['permission_failures_or_other_errors'] = failed
        self.evidence['mutation_permissions_verified'] = False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oci', default=shutil.which('oci') or str(Path.home() / '.local/bin/oci'))
    parser.add_argument('--config-file', type=Path, default=Path(os.environ.get('OCI_CLI_CONFIG_FILE', str(Path.home() / '.oci/config'))))
    parser.add_argument('--profile', default=os.environ.get('OCI_CLI_PROFILE', 'DEFAULT'))
    parser.add_argument('--output', type=Path, default=Path('docs/oracle-deployment/evidence/oci-discovery.json'))
    args = parser.parse_args()
    audit = Audit(args)
    audit.run()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(audit.evidence, indent=2) + '\n')
    print(json.dumps({key: audit.evidence.get(key) for key in ('cli_version', 'authenticated', 'discovery_complete', 'blocker', 'cloud_mutations')}))
    return 0 if audit.evidence['discovery_complete'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
