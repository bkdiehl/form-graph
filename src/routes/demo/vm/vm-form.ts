import { z } from 'zod';
import { codec, defineForm, type Fields } from '$lib/index.js';
import { enumCodec, sliderCodec } from '$lib/codecs/index.js';

// Demo ladder, rung 3: the hardest mechanisms together. Scoped memory (the
// instance type is remembered PER workload preset), an availability matrix
// that projects the type when the region can't offer it, a computed ceiling
// that projects a DIFFERENT field (RAM follows the vCPU count down), and a
// field whose existence toggles on another (spot removes the SLA).

export type Preset = 'general' | 'compute' | 'gpu' | 'memory';
export type Region = 'us-east' | 'eu-west' | 'ap-south';

interface InstanceType {
  id: string;
  preset: Preset;
  regions: Region[];
  baseHourly: number;
}

export const INSTANCE_TYPES: InstanceType[] = [
  { id: 'g1.medium', preset: 'general', regions: ['us-east', 'eu-west', 'ap-south'], baseHourly: 0.05 },
  { id: 'g1.large', preset: 'general', regions: ['us-east', 'eu-west', 'ap-south'], baseHourly: 0.09 },
  { id: 'c2.xlarge', preset: 'compute', regions: ['us-east', 'eu-west'], baseHourly: 0.17 },
  { id: 'c2.metal', preset: 'compute', regions: ['us-east'], baseHourly: 0.62 },
  { id: 'gpu.a100', preset: 'gpu', regions: ['us-east', 'eu-west'], baseHourly: 2.4 },
  { id: 'gpu.t4', preset: 'gpu', regions: ['us-east', 'eu-west', 'ap-south'], baseHourly: 0.53 },
  { id: 'm3.xlarge', preset: 'memory', regions: ['us-east', 'ap-south'], baseHourly: 0.27 },
];

const PRESET = enumCodec({
  options: [
    { value: 'general', label: 'General' },
    { value: 'compute', label: 'Compute' },
    { value: 'gpu', label: 'GPU' },
    { value: 'memory', label: 'Memory' },
  ],
  default: 'general',
});

const REGION = enumCodec({
  options: [
    { value: 'us-east', label: 'us-east' },
    { value: 'eu-west', label: 'eu-west' },
    { value: 'ap-south', label: 'ap-south' },
  ],
  default: 'us-east',
});

const TYPE = codec<string, { options: { value: string; label: string }[] }>({
  input: z.string().optional(),
  output: z.string(),
  default: 'g1.medium',
});

const VCPUS = sliderCodec({ min: 2, max: 64, step: 2, default: 8 });
const RAM = sliderCodec({ min: 4, max: 256, step: 4, default: 32 });
const GPUS = sliderCodec({ min: 1, max: 8, default: 1 });

const OS = enumCodec({
  options: [
    { value: 'linux', label: 'Linux' },
    { value: 'windows', label: 'Windows' },
  ],
  default: 'linux',
});

const LICENSE = enumCodec({
  options: [
    { value: 'included', label: 'License included' },
    { value: 'byol', label: 'Bring your own' },
  ],
  default: 'included',
});

const SLA = enumCodec({
  options: [
    { value: '99.9', label: '99.9%' },
    { value: '99.99', label: '99.99%' },
  ],
  default: '99.9',
});

const BOOL = codec({
  input: z.boolean().optional(),
  output: z.boolean(),
  default: false,
});

export const vmForm = defineForm()({
  codecs: {
    preset: PRESET,
    region: REGION,
    instanceType: TYPE,
    vcpus: VCPUS,
    ramGb: RAM,
    gpuCount: GPUS,
    os: OS,
    windowsLicense: LICENSE,
    spot: BOOL,
    sla: SLA,
  },
  resolve: (f: Fields) => {
    const preset = f.field('preset', PRESET);
    const region = f.field('region', REGION);

    const forPreset = INSTANCE_TYPES.filter((t) => t.preset === preset);
    const available = forPreset.filter((t) => t.regions.includes(region));
    let instanceType = f.field('instanceType', TYPE, {
      // Remembered per preset: your GPU pick survives a detour through compute.
      scope: preset,
      // A region can offer NOTHING for a preset (compute in ap-south) — fall
      // back to the preset's first type so the form stays resolvable.
      default: () => (available[0] ?? forPreset[0])!.id,
      meta: { options: available.map((t) => ({ value: t.id, label: t.id })) },
    });
    if (!available.some((t) => t.id === instanceType)) {
      instanceType = f.correct(
        'instanceType',
        (available[0] ?? forPreset[0])!.id,
        'region_unavailable',
        { region }
      );
    }
    const typeConfig = INSTANCE_TYPES.find((t) => t.id === instanceType) ?? forPreset[0]!;

    const vcpus = f.field('vcpus', VCPUS, { scope: preset });
    // The ceiling: RAM can't exceed 4 GB per vCPU. Lowering vCPUs projects an
    // already-chosen RAM value DOWN — one field's projection driven by another.
    const maxRam = vcpus * 4;
    let ramGb = f.field('ramGb', RAM, {
      scope: preset,
      meta: { min: 4, max: Math.min(256, maxRam), step: 4 },
    });
    if (ramGb > maxRam) ramGb = f.correct('ramGb', maxRam, 'ram_ceiling', { maxRam, vcpus });

    const os = f.field('os', OS);
    const spot = f.field('spot', BOOL);

    const branch = {
      ...(preset === 'gpu' ? { gpuCount: f.field('gpuCount', GPUS) } : {}),
      ...(os === 'windows' ? { windowsLicense: f.field('windowsLicense', LICENSE) } : {}),
      // Spot capacity can be reclaimed at any time — no SLA to offer.
      ...(spot ? {} : { sla: f.field('sla', SLA) }),
    };

    const gpuCount = 'gpuCount' in branch ? (branch.gpuCount ?? 0) : 0;
    const hourlyRaw =
      typeConfig.baseHourly +
      vcpus * 0.02 +
      ramGb * 0.005 +
      gpuCount * 0.9 +
      (os === 'windows' && ('windowsLicense' in branch ? branch.windowsLicense : '') === 'included'
        ? vcpus * 0.01
        : 0);
    const hourly = Math.round(hourlyRaw * (spot ? 0.35 : 1) * 1000) / 1000;
    const bandwidth = vcpus >= 32 ? '25 Gbps' : vcpus >= 16 ? '10 Gbps' : '5 Gbps';

    return {
      preset,
      region,
      instanceType,
      vcpus,
      ramGb,
      os,
      spot,
      ...branch,
      maxRam: f.computed('maxRam', maxRam),
      hourly: f.computed('hourly', hourly),
      monthly: f.computed('monthly', Math.round(hourly * 730 * 100) / 100),
      bandwidth: f.computed('bandwidth', bandwidth),
    };
  },
});
