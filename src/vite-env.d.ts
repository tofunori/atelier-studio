/// <reference types="vite/client" />

declare module "@fontsource-variable/inter";

/** Identité de build injectée par `define` dans vite.config.ts
 * (scripts/build-identity.mts) ; absente sous vitest. */
declare const __ATELIER_BUILD__: { commit: string; date: string } | undefined;
