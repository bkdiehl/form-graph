import { fail } from '@sveltejs/kit';
import { generationForm } from '$lib/generation/hub.js';
import { defaultExt } from '$lib/generation/config.js';
import type { Actions } from './$types.js';

// The isomorphic claim, in SvelteKit's native idiom: the SAME definition the
// page drives client-side parses the submission here. No second schema.
export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData();
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(String(form.get('state') ?? '{}'));
    } catch {
      return fail(400, { message: 'Malformed submission' });
    }

    const result = generationForm.parse(raw, defaultExt);
    if (!result.success) {
      return fail(400, { errors: result.errors, notes: result.notes ?? [] });
    }
    return {
      data: result.data,
      computedKeys: result.computedKeys,
      notes: result.notes ?? [],
    };
  },
};
