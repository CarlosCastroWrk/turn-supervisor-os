import { existsSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code !== 'ERR_MODULE_NOT_FOUND' ||
      (!specifier.startsWith('.') && !specifier.startsWith('/')) ||
      specifier.endsWith('.ts') ||
      specifier.endsWith('.tsx')
    ) {
      throw error;
    }

    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const sourceSpecifier = specifier.endsWith('.js') ? specifier.slice(0, -3) : specifier;
    const basePath = sourceSpecifier.startsWith('/') ? sourceSpecifier : resolvePath(dirname(parentPath), sourceSpecifier);

    for (const extension of ['.ts', '.tsx']) {
      const candidate = `${basePath}${extension}`;
      if (existsSync(candidate)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidate).href,
        };
      }
    }

    throw error;
  }
}
