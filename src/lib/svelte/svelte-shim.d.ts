// For plain tsc (pnpm typecheck) only — svelte-check and svelte-package
// resolve .svelte modules natively and generate real types.
declare module '*.svelte' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: any;
  export default component;
}
