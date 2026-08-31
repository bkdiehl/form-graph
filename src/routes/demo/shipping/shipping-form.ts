import { z } from 'zod';
import { defineGraph } from '$lib/index.js';
import { boolOf, enumOf, slider, textOf } from '$lib/defs/index.js';
import type { ZodType } from 'zod';

// Demo ladder, rung 2: a real-world shape. Chained computed fields
// (dimensional weight → billable weight → price), a gated service (disabled
// AND corrected, one declaration), a refusal in zod's own vocabulary, and a
// field that corrects ITSELF (forced insurance) — every condition computed in
// the field's own definition.

export type ShipmentType = 'parcel' | 'freight' | 'hazmat';
export type Service = 'ground' | 'air' | 'ocean';

const RATE: Record<Service, number> = { ground: 1.1, air: 4.2, ocean: 0.4 };

const HAZMAT = enumOf({
  options: [
    { value: '3', label: 'Class 3 — Flammable liquid' },
    { value: '8', label: 'Class 8 — Corrosive' },
    { value: '1.4', label: 'Class 1.4 — Explosives' },
  ],
  default: '3',
});
const hazmatOutput = HAZMAT.output as ZodType<'3' | '8' | '1.4'>;

const cm = (max: number, dflt: number) => slider({ min: 1, max, default: dflt });

export const shippingForm = defineGraph()
  .field('shipmentType', enumOf({
    options: [
      { value: 'parcel', label: 'Parcel' },
      { value: 'freight', label: 'Freight' },
      { value: 'hazmat', label: 'Hazmat' },
    ],
    default: 'parcel',
  }))
  .field('service', (c) =>
    // Ocean is freight-only: gated — disabled in the options AND corrected
    // (with the note the page shows) when the type changes under you.
    enumOf<Service>({
      options: [
        { value: 'ground', label: 'ground' },
        { value: 'air', label: 'air' },
        { value: 'ocean', label: 'ocean' },
      ],
      default: 'ground',
      gate: { ocean: c.shipmentType !== 'freight' && 'service_unavailable_for_type' },
    })
  )
  .field('destination', enumOf({
    options: [
      { value: 'domestic', label: 'Domestic' },
      { value: 'international', label: 'International' },
    ],
    default: 'domestic',
  }))
  .field('emergencyContact', (c) =>
    c.shipmentType === 'hazmat'
      ? {
          input: z.string().optional(),
          output: z
            .string()
            .regex(/^\+?[\d\s()-]{7,}$/, 'Hazmat requires a 24h emergency phone number'),
          default: '',
        }
      : null
  )
  .field('hazmatClass', (c) =>
    c.shipmentType === 'hazmat'
      ? {
          ...HAZMAT,
          // Explosives exist as a legal choice — but not on a plane. REFUSES
          // (live error + failed submit): the output contract, narrowed
          // inline in zod's own vocabulary.
          output: hazmatOutput.refine((value) => !(value === '1.4' && c.service === 'air'), {
            message: 'Class 1.4 explosives cannot ship by air',
            params: { kind: 'hazmat_air_forbidden' },
          }),
        }
      : null
  )
  .field('residential', (c) =>
    c.shipmentType === 'freight' && c.service === 'ground' ? boolOf() : null
  )
  .field('lengthCm', cm(200, 40))
  .field('widthCm', cm(200, 30))
  .field('heightCm', cm(200, 20))
  .field('actualKg', slider({ min: 1, max: 500, default: 10 }))
  .field('contents', (c) =>
    c.destination === 'international'
      ? {
          input: z.string().optional(),
          output: z.string().min(1, 'Customs needs a contents description'),
          default: '',
        }
      : null
  )
  .field('declaredValue', (c) =>
    c.destination === 'international' ? slider({ min: 0, max: 10000, step: 50, default: 100 }) : null
  )
  .field('incoterms', (c) =>
    c.destination === 'international'
      ? enumOf({
          options: [
            { value: 'DAP', label: 'DAP — Delivered at place' },
            { value: 'DDP', label: 'DDP — Duty paid' },
            { value: 'EXW', label: 'EXW — Ex works' },
          ],
          default: 'DAP',
        })
      : null
  )
  .field('insurance', (c) =>
    c.destination === 'international'
      ? {
          ...boolOf(),
          // High-value shipments MUST be insured: the field corrects ITSELF,
          // with the note telling the page why the box flipped on.
          correct: (value: boolean) =>
            (c.declaredValue ?? 0) >= 5000 && !value
              ? {
                  value: true,
                  reason: 'high_value_requires_insurance',
                  detail: { declaredValue: c.declaredValue },
                }
              : undefined,
        }
      : null
  )
  .field('signatureRequired', (c) =>
    c.destination === 'international' && c.insurance === true ? boolOf() : null
  )
  .computed('dimKg', (c) =>
    Math.round(((c.lengthCm * c.widthCm * c.heightCm) / 5000) * 10) / 10
  )
  .computed('billableKg', (c) => Math.max(c.actualKg, c.dimKg))
  .computed('surcharges', (c) =>
    (c.shipmentType === 'hazmat' ? 45 : 0) +
    (c.residential === true ? 28 : 0) +
    (c.destination === 'international' ? 15 : 0) +
    (c.insurance === true ? Math.max(5, Math.round((c.declaredValue ?? 0) * 0.01)) : 0) +
    (c.signatureRequired === true ? 6 : 0)
  )
  .computed('price', (c) =>
    Math.round((c.billableKg * RATE[c.service] + c.surcharges) * 100) / 100
  )
  .computed('transitDays', (c) =>
    c.service === 'air'
      ? c.destination === 'international'
        ? 3
        : 1
      : c.service === 'ocean'
        ? 28
        : 5
  );

