#!/usr/bin/env python3
"""Read-only A1 migration preflight. Capacity reports never reserve or launch VMs."""
import argparse
import configparser
from datetime import datetime, timezone
import json
from pathlib import Path
import os
import shutil
import stat

from oracle_cloud_audit import Audit, REGION

SHAPE, OCPUS, MEMORY_GB, BOOT_GB = 'VM.Standard.A1.Flex', 2, 12, 50


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oci', default=shutil.which('oci') or str(Path.home() / '.local/bin/oci'))
    parser.add_argument('--config-file', type=Path, default=Path.home() / '.oci/config')
    parser.add_argument('--profile', default='DEFAULT')
    parser.add_argument('--output', type=Path, default=Path('docs/oracle-deployment/evidence/always-free-capacity-review.json'))
    args = parser.parse_args()
    audit = Audit(args)
    result = {'observed_at_utc': datetime.now(timezone.utc).isoformat(), 'region': REGION,
              'scope': 'Planning-only API inventory and non-reserving capacity reports',
              'target': {'shape': SHAPE, 'ocpus': OCPUS, 'memory_gb': MEMORY_GB, 'boot_gb': BOOT_GB},
              'month_31_day_requirements': {'ocpu_hours': OCPUS * 24 * 31, 'gb_hours': MEMORY_GB * 24 * 31},
              'published_monthly_free_limits': {'ocpu_hours': 1500, 'gb_hours': 9000, 'aggregate_block_storage_gb': 200},
              'instances_launched': 0, 'capacity_reserved': False, 'infrastructure_mutations': 0,
              'operator_approved_creation': False, 'blockers': []}
    try:
        p = args.config_file
        meta = p.lstat()
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or stat.S_IMODE(meta.st_mode) & 0o077:
            raise ValueError('Unsafe OCI configuration permissions')
        config = configparser.ConfigParser(interpolation=None)
        config.read(p)
        profile = config[args.profile]
        if profile.get('region') != REGION:
            raise ValueError('OCI profile must use the verified Mumbai region')
        tenant = profile['tenancy']
        c = ['--compartment-id', tenant]
        identity = audit.call('tenancy', ['iam', 'tenancy', 'get', '--tenancy-id', tenant], ['id', 'name', 'home-region-key'])
        if not identity or identity.get('name') != 'erandasathsara' or identity.get('home-region-key') != 'BOM':
            raise ValueError('Expected tenancy/home region not verified')
        compartments = audit.call('compartments', ['iam', 'compartment', 'list', *c, '--compartment-id-in-subtree', 'true', '--access-level', 'ANY', '--all'], ['id', 'name', 'lifecycle-state'])
        if compartments is None or any(row.get('lifecycle-state') == 'ACTIVE' for row in compartments):
            result['blockers'].append('Full multi-compartment aggregation needs review; this preflight expects the verified root-only tenancy')
        instances = audit.call('instances', ['compute', 'instance', 'list', *c, '--all'], ['id', 'display-name', 'shape', 'shape-config', 'lifecycle-state'])
        if instances is None:
            raise ValueError('Current allocated A1 resources could not be inspected')
        allocated = [v for v in instances if v.get('shape') == SHAPE and v.get('lifecycle-state') != 'TERMINATED']
        total_cpu = OCPUS + sum(v.get('shape-config', {}).get('ocpus', 0) for v in allocated)
        total_ram = MEMORY_GB + sum(v.get('shape-config', {}).get('memory-in-gbs', 0) for v in allocated)
        result['a1_existing_instances'] = len(allocated)
        result['projected_a1_allocation'] = {'ocpus': total_cpu, 'memory_gb': total_ram}
        if total_cpu * 744 > 1500 or total_ram * 744 > 9000:
            result['blockers'].append('Proposed aggregate A1 allocation exceeds the conservative published monthly free pool')
        ads = audit.call('availability_domains', ['iam', 'availability-domain', 'list', *c, '--all'], ['name'])
        if not ads:
            raise ValueError('No availability domain verified')
        boot_sizes, capacities = [], []
        for index, domain in enumerate(ads):
            name = domain['name']
            boots = audit.call('boot_volumes_' + str(index), ['bv', 'boot-volume', 'list', *c, '--availability-domain', name, '--all'], ['id', 'size-in-gbs', 'lifecycle-state'])
            if boots is None:
                raise ValueError('Boot storage total could not be inspected')
            boot_sizes += [b['size-in-gbs'] for b in boots if b.get('lifecycle-state') != 'TERMINATED']
            faults = audit.call('fault_domains_' + str(index), ['iam', 'fault-domain', 'list', *c, '--availability-domain', name, '--all'], ['name'])
            if not faults:
                raise ValueError('Fault domains could not be inspected')
            request = [{'faultDomain': fd['name'], 'instanceShape': SHAPE,
                        'instanceShapeConfig': {'ocpus': OCPUS, 'memoryInGBs': MEMORY_GB}} for fd in faults]
            capacity = audit.call('capacity_' + str(index), ['compute', 'compute-capacity-report', 'create', *c,
                                  '--availability-domain', name, '--shape-availabilities', json.dumps(request)],
                                 ['availability-domain', 'shape-availabilities', 'time-created'])
            if capacity:
                capacities += capacity.get('shape-availabilities', [])
        result['fault_domain_capacity'] = capacities
        if not capacities or not any(row.get('availability-status') == 'AVAILABLE' for row in capacities):
            result['blockers'].append('No AVAILABLE host capacity reported for A1 2 OCPU / 12 GB in Mumbai')
        blocks = audit.call('block_volumes', ['bv', 'volume', 'list', *c, '--all'], ['id', 'size-in-gbs', 'lifecycle-state'])
        if blocks is None:
            raise ValueError('Block storage total could not be inspected')
        projected = sum(boot_sizes) + sum(v['size-in-gbs'] for v in blocks if v.get('lifecycle-state') != 'TERMINATED') + BOOT_GB
        result['projected_boot_plus_block_storage_gb'] = projected
        if projected > 200:
            result['blockers'].append('Retained boot/block storage plus new boot disk exceeds 200 GB')
        images = audit.call('arm64_platform_images', ['compute', 'image', 'list', *c, '--shape', SHAPE,
                            '--operating-system', 'Canonical Ubuntu', '--operating-system-version', '24.04', '--all'],
                           ['id', 'display-name', 'compartment-id', 'size-in-mbs', 'lifecycle-state', 'time-created'])
        eligible = [v for v in images or [] if v.get('compartment-id') is None and 'aarch64' in v.get('display-name', '')
                    and 'Minimal' not in v.get('display-name', '') and v.get('lifecycle-state') == 'AVAILABLE']
        eligible.sort(key=lambda v: v.get('time-created', ''), reverse=True)
        image_fields = ('id', 'display-name', 'compartment-id', 'size-in-mbs', 'lifecycle-state', 'time-created')
        result['selected_platform_image'] = {k: eligible[0].get(k) for k in image_fields} if eligible else None
        if not eligible:
            result['blockers'].append('No compatible Ubuntu 24.04 ARM64 platform image verified')
        failed = [name for name, row in audit.evidence['operations'].items() if row['status'] != 'OBSERVED']
        if failed:
            result['blockers'].append('Some API checks failed; inspect operations before provisioning')
    except (OSError, ValueError, KeyError, TypeError, configparser.Error):
        result['blockers'].append('Preflight incomplete: verify protected OCI profile and API access; raw configuration/errors withheld')
    result['operations'] = audit.evidence['operations']
    result['preflight_ready'] = not result['blockers']
    result['launch_authorized'] = False
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({k: result.get(k) for k in ('preflight_ready', 'launch_authorized', 'projected_boot_plus_block_storage_gb', 'blockers', 'infrastructure_mutations')}))
    return 0 if result['preflight_ready'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
