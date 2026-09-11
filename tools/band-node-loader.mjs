// Resolve the browser import map's single bare import to our vendored THREE.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('../public/vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
