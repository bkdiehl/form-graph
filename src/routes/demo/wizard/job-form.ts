import { z } from 'zod';
import { boolOf, branch, defineGraph, enumOf, list, slider, textOf } from '$lib/core/index.js';

/**
 * The wizard demo — one graph, zero wizard awareness.
 *
 * Nothing here knows about steps: no step registry, no per-step schemas, no
 * "page 2 fields". The WIZARD is a UI concern — each step is a key list
 * declared next to its component, and a step's "Next" is
 * `store.validate(STEP_KEYS)`: it judges only those fields, so a later
 * step's requireds can't scold early, and a step whose fields left the
 * active branch gates nothing (list every arm's keys; inactive ones are
 * vacuously valid).
 *
 * The same graph would serve the whole form on one page unchanged — that is
 * the point.
 */

const fullTime = defineGraph()
  .field('salary', slider({ min: 40_000, max: 400_000, step: 5_000, default: 120_000 }))
  .field('equity', boolOf({ default: false }));

const contract = defineGraph()
  .field('hourlyRate', slider({ min: 20, max: 400, step: 5, default: 95 }))
  .field('maxHours', slider({ min: 5, max: 40, step: 5, default: 20 }));

const question = defineGraph()
  .field('prompt', {
    input: z.string().optional(),
    output: z.string().min(1, 'Question text is required'),
    default: '',
  })
  .field(
    'kind',
    enumOf({
      options: [
        { value: 'text', label: 'Free text' },
        { value: 'yesno', label: 'Yes / no' },
      ],
      default: 'text',
    })
  );

export const jobForm = defineGraph()
  // step 1 — basics
  .field('title', {
    input: z.string().optional(),
    output: z.string().min(1, 'Job title is required'),
    default: '',
  })
  .field('company', {
    input: z.string().optional(),
    output: z.string().min(1, 'Company is required'),
    default: '',
  })
  .field('remote', boolOf({ default: true }))
  // step 2 — compensation branches on the employment type
  .field(
    'employmentType',
    enumOf({
      options: [
        { value: 'fullTime', label: 'Full-time' },
        { value: 'contract', label: 'Contract' },
      ],
      default: 'fullTime',
    })
  )
  .use(
    branch('employmentType', [
      [['fullTime'], fullTime],
      [['contract'], contract],
    ] as const)
  )
  // step 3 — screening questions: the step gate is a whole LIST
  .use(list('questions', question, { min: 1, max: 5 }));

/**
 * The steps, OUTSIDE the graph — a key list per step, beside the UI that
 * renders it. Step 2 lists BOTH arms' keys: whichever arm is inactive is
 * vacuously valid, so one list serves every branch.
 */
export const STEPS = [
  { label: 'Basics', keys: ['title', 'company', 'remote'] },
  {
    label: 'Compensation',
    keys: ['employmentType', 'salary', 'equity', 'hourlyRate', 'maxHours'],
  },
  { label: 'Screening', keys: ['questions'] },
  { label: 'Review', keys: [] },
] as const;
