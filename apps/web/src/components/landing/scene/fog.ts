import * as THREE from "three";

/*
 * Exponential height fog for the standard materials. three.js ships FogExp2 (distance only); this
 * patches the fog chunk so the density falls off with world height, which is what makes the
 * benches recede into dawn haze while the sky and the machine stay clear. One shared uniform.
 */
export const fogUniforms = { uFogFall: { value: 0.028 } };

export function heightFog<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFogFall = fogUniforms.uFogFall;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vHY;")
      .replace(
        "#include <fog_vertex>",
        `#include <fog_vertex>
        vec4 hfw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          hfw = instanceMatrix * hfw;
        #endif
        vHY = (modelMatrix * hfw).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vHY;\nuniform float uFogFall;")
      .replace(
        "#include <fog_fragment>",
        `#ifdef USE_FOG
          float hfDens = fogDensity * (0.3 + 0.7 * exp(-max(vHY, 0.0) * uFogFall));
          float hfF = 1.0 - exp(-hfDens * hfDens * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(hfF, 0.0, 1.0));
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => "hfog";
  return mat;
}
