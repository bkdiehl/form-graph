import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { boolOf, enumOf, slider } from '$lib/defs/index.js';

// Demo ladder, rung 3: the hardest mechanisms together, each field ONE
// definition. Scoped memory per preset, a catalog gated by tier AND fleet
// capacity, a ceiling that projects a DIFFERENT field down, and external
// context driving all of it.

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

// What the SERVER knows about this account and the fleet — not a field, an
// input to every resolve. The page's context panel drives setExt with it.
export interface VmExt {
  tier: 'free' | 'pro';
  gpuAvailable: boolean;
}

export const defaultVmExt: VmExt = { tier: 'pro', gpuAvailable: true };

export const vmForm = defineGraph<VmExt>()
  .field('preset', enumOf({
    options: [
      { value: 'general', label: 'General' },
      { value: 'compute', label: 'Compute' },
      { value: 'gpu', label: 'GPU' },
      { value: 'memory', label: 'Memory' },
    ],
    default: 'general',
  }))
  .field('region', enumOf({
    options: [
      { value: 'us-east', label: 'us-east' },
      { value: 'eu-west', label: 'eu-west' },
      { value: 'ap-south', label: 'ap-south' },
    ],
    default: 'us-east',
  }))
  .field('instanceType', (c) => {
    const forPreset = INSTANCE_TYPES.filter((t) => t.preset === c.preset);
    // Context gates the catalog itself: free tier never sees bare metal, and
    // a GPU capacity crunch empties the gpu preset's list entirely.
    const offered = forPreset.filter(
      (t) =>
        (c._ext.tier === 'pro' || t.id !== 'c2.metal') && (c._ext.gpuAvailable || t.preset !== 'gpu')
    );
    const available = offered.filter((t) => t.regions.includes(c.region));
    const fallback = (available[0] ?? offered[0] ?? forPreset[0])!.id;
    return {
      input: z.string().optional(),
      output: z.string(),
      default: () => fallback,
      // Remembered per preset: your GPU pick survives a detour through compute.
      scope: c.preset,
      meta: { options: available.map((t) => ({ value: t.id, label: t.id })) },
      correct: (value: string) => {
        if (available.some((t) => t.id === value)) return undefined;
        const inRegion = forPreset.some((t) => t.id === value && t.regions.includes(c.region));
        return {
          value: fallback,
          reason: inRegion
            ? c._ext.gpuAvailable
              ? 'tier_unavailable'
              : 'gpu_capacity'
            : 'region_unavailable',
          detail: inRegion ? { tier: c._ext.tier } : { region: c.region },
        };
      },
    };
  })
  .field('vcpus', (c) => {
    // Free tier caps compute at 16 vCPUs. A pro spec remembered above the cap
    // projects DOWN with a note — and comes back when the tier rises.
    const maxVcpus = c._ext.tier === 'pro' ? 64 : 16;
    return {
      ...slider({ min: 2, max: 64, step: 2, default: 8 }),
      scope: c.preset,
      meta: { min: 2, max: maxVcpus, step: 2 },
      correct: (value: number) =>
        value > maxVcpus ? { value: maxVcpus, reason: 'tier_limit', detail: { tier: c._ext.tier } } : undefined,
    };
  })
  .field('ramGb', (c) => {
    // The ceiling: RAM can't exceed 4 GB per vCPU. Lowering vCPUs projects an
    // already-chosen RAM value DOWN — one field's projection driven by another.
    const maxRam = Math.min(256, c.vcpus * 4);
    return {
      ...slider({ min: 4, max: 256, step: 4, default: 32 }),
      scope: c.preset,
      meta: { min: 4, max: maxRam, step: 4 },
      correct: (value: number) =>
        value > maxRam
          ? { value: maxRam, reason: 'ram_ceiling', detail: { maxRam, vcpus: c.vcpus } }
          : undefined,
    };
  })
  .field('gpuCount', (c) => (c.preset === 'gpu' ? slider({ min: 1, max: 8, default: 1 }) : null))
  .field('os', enumOf({
    options: [
      { value: 'linux', label: 'Linux' },
      { value: 'windows', label: 'Windows' },
    ],
    default: 'linux',
  }))
  .field('windowsLicense', (c) =>
    c.os === 'windows'
      ? enumOf({
          options: [
            { value: 'included', label: 'License included' },
            { value: 'byol', label: 'Bring your own' },
          ],
          default: 'included',
        })
      : null
  )
  .field('spot', boolOf())
  .field('sla', (c) =>
    // Spot capacity can be reclaimed at any time — no SLA to offer. And
    // 99.99% is a pro contract: gated for free tier.
    c.spot
      ? null
      : enumOf({
          options: [
            { value: '99.9', label: '99.9%' },
            { value: '99.99', label: '99.99%' },
          ],
          default: '99.9',
          gate: { '99.99': c._ext.tier !== 'pro' && 'tier_limit' },
        })
  )
  .field('backups', boolOf())
  .field('backupFrequency', (c) =>
    // Hourly backups of an interruptible machine snapshot nothing — gated on
    // spot, with the note the page surfaces inline.
    c.backups
      ? enumOf({
          options: [
            { value: 'hourly', label: 'Hourly' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
          ],
          default: 'daily',
          gate: { hourly: c.spot === true && 'spot_hourly_pointless' },
        })
      : null
  )
  .computed('maxRam', (c) => Math.min(256, c.vcpus * 4))
  .computed('hourly', (c) => {
    const typeConfig = INSTANCE_TYPES.find((t) => t.id === c.instanceType);
    const backupHourly = c.backups
      ? (c.ramGb * 0.0002 + c.vcpus * 0.001) *
        (c.backupFrequency === 'hourly' ? 3 : c.backupFrequency === 'weekly' ? 0.4 : 1)
      : 0;
    const hourlyRaw =
      (typeConfig?.baseHourly ?? 0) +
      c.vcpus * 0.02 +
      c.ramGb * 0.005 +
      (c.gpuCount ?? 0) * 0.9 +
      (c.os === 'windows' && c.windowsLicense === 'included' ? c.vcpus * 0.01 : 0);
    return Math.round((hourlyRaw + backupHourly) * (c.spot ? 0.35 : 1) * 1000) / 1000;
  })
  .computed('monthly', (c) => Math.round(c.hourly * 730 * 100) / 100)
  .computed('bandwidth', (c) =>
    c.vcpus >= 32 ? '25 Gbps' : c.vcpus >= 16 ? '10 Gbps' : '5 Gbps'
  );

