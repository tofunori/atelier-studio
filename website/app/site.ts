export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/atelier-studio';
export const siteUrl = `https://tofunori.github.io${basePath}/`;
export const assetPath = (path: string) => `${basePath}${path}`;
