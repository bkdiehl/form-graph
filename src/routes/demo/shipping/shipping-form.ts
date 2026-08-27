import { z } from 'zod';
import { codec, corrected, defineForm, type Fields } from '$lib/index.js';
import { enumCodec, sliderCodec } from '$lib/codecs/index.js';

// Demo ladder, rung 2: a real-world shape. Chained computed fields
// (dimensional weight → billable weight → price), service options that depend
// on the shipment type (with projection when the type changes under you), and
// the projection-vs-validation distinction: an unavailable service is
// silently corrected, while explosives on an air service REFUSE at submit.

export type ShipmentType = 'parcel' | 'freight' | 'hazmat';
export type Service = 'ground' | 'air' | 'ocean';

const SERVICES_BY_TYPE: Record<ShipmentType, Service[]> = {
  parcel: ['ground', 'air'],
  freight: ['ground', 'air', 'ocean'],
  hazmat: ['ground', 'air'],
};

const RATE: Record<Service, number> = { ground: 1.1, air: 4.2, ocean: 0.4 };

const TYPE = enumCodec({
  options: [
    { value: 'parcel', label: 'Parcel' },
    { value: 'freight', label: 'Freight' },
    { value: 'hazmat', label: 'Hazmat' },
  ],
  default: 'parcel',
});

const SERVICE = codec<Service, { options: Service[] }>({
  input: z.enum(['ground', 'air', 'ocean']).optional(),
  output: z.enum(['ground', 'air', 'ocean']),
  default: 'ground',
});

const DESTINATION = enumCodec({
  options: [
    { value: 'domestic', label: 'Domestic' },
    { value: 'international', label: 'International' },
  ],
  default: 'domestic',
});

const HAZMAT_CLASS = enumCodec({
  options: [
    { value: '3', label: 'Class 3 — Flammable liquid' },
    { value: '8', label: 'Class 8 — Corrosive' },
    { value: '1.4', label: 'Class 1.4 — Explosives' },
  ],
  default: '3',
});

const INCOTERMS = enumCodec({
  options: [
    { value: 'DAP', label: 'DAP — Delivered at place' },
    { value: 'DDP', label: 'DDP — Duty paid' },
    { value: 'EXW', label: 'EXW — Ex works' },
  ],
  default: 'DAP',
});

const CM = (max: number, dflt: number) => sliderCodec({ min: 1, max, default: dflt });
const LENGTH = CM(200, 40);
const WIDTH = CM(200, 30);
const HEIGHT = CM(200, 20);
const WEIGHT_KG = sliderCodec({ min: 1, max: 500, default: 10 });

const CONTENTS = codec<string>({
  input: z.string().optional(),
  output: z.string().min(1, 'Customs needs a contents description'),
  default: '',
});

const DECLARED_VALUE = sliderCodec({ min: 0, max: 10000, step: 50, default: 100 });

const BOOL = codec<boolean>({
  input: z.boolean().optional(),
  output: z.boolean(),
  default: false,
});

export const shippingForm = defineForm()({
  codecs: {
    shipmentType: TYPE,
    service: SERVICE,
    destination: DESTINATION,
    hazmatClass: HAZMAT_CLASS,
    incoterms: INCOTERMS,
    lengthCm: LENGTH,
    widthCm: WIDTH,
    heightCm: HEIGHT,
    actualKg: WEIGHT_KG,
    residential: BOOL,
    contents: CONTENTS,
    declaredValue: DECLARED_VALUE,
  },
  resolve: (f: Fields) => {
    const shipmentType = f.field('shipmentType', TYPE);
    const available = SERVICES_BY_TYPE[shipmentType];
    const service = f.field('service', SERVICE, {
      // Ocean freight downgraded to parcel? The service silently corrects —
      // the SYSTEM invalidated the choice, so don't punish the user for it.
      correct: (value) =>
        available.includes(value)
          ? value
          : corrected(available[0]!, 'service_unavailable_for_type', { shipmentType }),
      meta: { options: available },
    });
    const destination = f.field('destination', DESTINATION);

    const lengthCm = f.field('lengthCm', LENGTH);
    const widthCm = f.field('widthCm', WIDTH);
    const heightCm = f.field('heightCm', HEIGHT);
    const actualKg = f.field('actualKg', WEIGHT_KG);

    // The chain: dims → dimensional weight → billable weight → price.
    const dimKg = Math.round(((lengthCm * widthCm * heightCm) / 5000) * 10) / 10;
    const billableKg = Math.max(actualKg, dimKg);

    const base = { shipmentType, service, destination, lengthCm, widthCm, heightCm, actualKg };

    const branch = {
      ...(shipmentType === 'hazmat'
        ? {
            hazmatClass: f.field('hazmatClass', HAZMAT_CLASS, {
              // Explosives exist as a legal choice — but not on a plane. This
              // REFUSES (live error + failed submit) rather than silently
              // rewriting a safety field: the output contract, narrowed in
              // zod's own vocabulary.
              refine: (s) =>
                s.refine((value) => !(value === '1.4' && service === 'air'), {
                  message: 'Class 1.4 explosives cannot ship by air',
                  params: { kind: 'hazmat_air_forbidden' },
                }),
              refineDeps: [service],
            }),
          }
        : {}),
      ...(shipmentType === 'freight' && service === 'ground'
        ? { residential: f.field('residential', BOOL) }
        : {}),
      ...(destination === 'international'
        ? {
            contents: f.field('contents', CONTENTS),
            declaredValue: f.field('declaredValue', DECLARED_VALUE),
            incoterms: f.field('incoterms', INCOTERMS),
          }
        : {}),
    };

    const surcharges =
      (shipmentType === 'hazmat' ? 45 : 0) +
      ('residential' in branch && branch.residential ? 28 : 0) +
      (destination === 'international' ? 15 : 0);
    const price = Math.round((billableKg * RATE[service] + surcharges) * 100) / 100;
    const transitDays =
      service === 'air' ? (destination === 'international' ? 3 : 1) : service === 'ocean' ? 28 : 5;

    return {
      ...base,
      ...branch,
      dimKg: f.computed('dimKg', dimKg),
      billableKg: f.computed('billableKg', billableKg),
      surcharges: f.computed('surcharges', surcharges),
      price: f.computed('price', price),
      transitDays: f.computed('transitDays', transitDays),
    };
  },
});
