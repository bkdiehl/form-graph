import { describe, expect, it } from 'vitest';
import * as core from '../index.js';
import * as react from '../../react/index.js';

/**
 * The public surface, pinned. Every export is a forever-contract (semver),
 * so growth must be a DECISION, not a side effect: adding or removing an
 * export fails here until the list is updated in the same commit — alongside
 * the DEVLOG entry and docs section the repo conventions already require.
 * Type-only exports don't appear at runtime; this pins the value surface.
 */
describe('public surface', () => {
  it('form-graph (core)', () => {
    expect(Object.keys(core).sort()).toEqual([
      'allPossibleKeys',
      'boolOf',
      'branch',
      'cachedFactory',
      'debouncedStorage',
      'defFamily',
      'defineDef',
      'defineGraph',
      'enumOf',
      'enumerateBranches',
      'fieldKeys',
      'fieldMeta',
      'hasField',
      'optionsFor',
      'persistedStorage',
      'readIntentBuckets',
      'readIntentValue',
      'rootScope',
      'scopedAddress',
      'slider',
      'textOf',
      'whereFieldExists',
    ]);
  });

  it('form-graph/react', () => {
    expect(Object.keys(react).sort()).toEqual([
      'Controller',
      'FormProvider',
      'MultiController',
      'createTypedController',
      'useField',
      'useForm',
      'useFormState',
      'useFormStore',
      'useOptionalFormStore',
      'useTypedField',
    ]);
  });
});
