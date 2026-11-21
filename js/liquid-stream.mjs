// The comparison runner can compile the cumulative stages independently.
export const LIQUID_STAGE = 6;
export const STREAM_WIDTH = 9;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function pointAt(curve, t) {
  const u = 1 - t, p = curve;
  return {
    x: u*u*u*p.p0.x + 3*u*u*t*p.p1.x + 3*u*t*t*p.p2.x + t*t*t*p.p3.x,
    y: u*u*u*p.p0.y + 3*u*u*t*p.p1.y + 3*u*t*t*p.p2.y + t*t*t*p.p3.y,
  };
}

export function frameAt(curve, t) {
  const u = 1 - t, p = curve;
  const dx = 3*u*u*(p.p1.x-p.p0.x) + 6*u*t*(p.p2.x-p.p1.x) + 3*t*t*(p.p3.x-p.p2.x);
  const dy = 3*u*u*(p.p1.y-p.p0.y) + 6*u*t*(p.p2.y-p.p1.y) + 3*t*t*(p.p3.y-p.p2.y);
  const length = Math.max(1e-6, Math.hypot(dx, dy));
  return { point: pointAt(curve, t), nx: -dy / length, ny: dx / length };
}

export function writeMeshPositions(curve, positions, width, reveal) {
  const sections = positions.length / 4 - 1;
  const end = clamp(reveal, .015, 1);
  for (let i = 0; i <= sections; i++) {
    const t = end * i / sections, { point, nx, ny } = frameAt(curve, t);
    const radius = width * 0.5 * (0.96 + 0.06 * Math.sin(Math.PI * t));
    const k = i * 4;
    positions[k] = point.x + nx * radius;
    positions[k+1] = point.y + ny * radius;
    positions[k+2] = point.x - nx * radius;
    positions[k+3] = point.y - ny * radius;
  }
}

export function buildMeshData(curve, width = STREAM_WIDTH, sections = 56) {
  if (!Number.isInteger(sections) || sections < 2) throw new RangeError('sections must be >= 2');
  const positions = new Float32Array((sections + 1) * 4);
  const uvs = new Float32Array((sections + 1) * 4);
  const indices = new Uint32Array(sections * 6);
  writeMeshPositions(curve, positions, width, 1);
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const k = i * 4;
    uvs[k] = t; uvs[k+1] = -1; uvs[k+2] = t; uvs[k+3] = 1;
    if (i < sections) {
      const a = i * 2, j = i * 6;
      indices[j] = a; indices[j+1] = a+1; indices[j+2] = a+2;
      indices[j+3] = a+1; indices[j+4] = a+3; indices[j+5] = a+2;
    }
  }
  return { positions, uvs, indices, vertexCount: positions.length / 2, triangleCount: indices.length / 3 };
}

const flowNoise = `
float flowHash(float cell) {
  float seed = fract(cell * 0.1031 + 0.173);
  return fract(seed * (1.8 + seed) * (7.3 + seed));
}
float flowNoise(float position) {
  float cell = floor(position);
  float t = fract(position);
  return mix(flowHash(cell), flowHash(cell + 1.0), t * t * (3.0 - 2.0 * t));
}
`;

export const liquidVertex = `
precision highp float;
#define POUR_STAGE ${LIQUID_STAGE}
attribute vec2 aPosition;
attribute vec2 aUV;
attribute vec2 aPourCenter;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform mediump float uPourTime;
uniform float uPourTension;
uniform mediump float uPourReveal;
uniform mediump float uPourLength;
varying mediump vec2 vPourUV;
${flowNoise}
void main(void) {
  vec2 position = aPosition;
#if POUR_STAGE >= 5
  float along = aUV.x * uPourReveal;
  // Both cross sections at the ends keep their original positions and width.
  float envelope = 4.0 * aUV.x * (1.0 - aUV.x);
  float material = along * uPourLength - uPourTime * 54.0;
  float swell = flowNoise(material * 0.024 + 3.7) - 0.5;
  float drift = flowNoise(material * 0.019 + 17.6) - 0.5;
  float taper = 0.012 + 0.024 * along + 0.065 * uPourTension * aUV.x;
  float widthChange = 0.065 * swell - taper;
  float sideShift = 0.11 * drift + 0.05 * uPourTension * along;
  vec2 radial = aPosition - aPourCenter;
  position += radial * envelope * (widthChange + aUV.y * sideShift);
#endif
  vec3 clip = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(position, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vPourUV = aUV;
}`;

export const liquidFragment = `
precision mediump float;
#define POUR_STAGE ${LIQUID_STAGE}
uniform vec4 uColor;
uniform vec3 uPourTint;
uniform mediump float uPourTime;
uniform mediump float uPourReveal;
uniform mediump float uPourLength;
varying mediump vec2 vPourUV;
${flowNoise}
void main(void) {
  float across = vPourUV.y;
  float side = abs(across);
  float alpha = uColor.a;
  vec3 color = uPourTint;
#if POUR_STAGE >= 2
  float roundness = sqrt(max(0.0, 1.0 - across * across));
  float light = clamp(0.25 + 0.62 * roundness - 0.31 * across, 0.0, 1.0);
  color = mix(uPourTint * 0.46, uPourTint, light);
  float shoulder = (across + 0.34) * 3.8;
  color = mix(color, vec3(1.0), 0.13 * exp(-shoulder * shoulder));
  float rim = (across - 0.75) * 8.0;
  color += 0.07 * uPourTint * exp(-rim * rim);
#endif
#if POUR_STAGE >= 3
  // Fall off across the ribbon only. The entire center remains opaque.
  alpha *= 1.0 - smoothstep(0.70, 1.0, side);
#endif
#if POUR_STAGE >= 4
  // Two scales of continuous irregular patches share one advected coordinate.
  float material = vPourUV.x * uPourReveal * uPourLength - uPourTime * 72.0;
  float broad = flowNoise(material * 0.027 + 6.4);
  float detail = flowNoise(material * 0.068 + 14.2);
  float mottle = mix(broad, detail, 0.29);
  color *= 0.93 + 0.14 * broad;
  float streak = (across + 0.36 + 0.15 * (detail - 0.5)) * mix(4.5, 8.1, detail);
  float reflection = (0.045 + 0.39 * mottle) * exp(-streak * streak);
  color = mix(color, vec3(1.0), reflection);
  float caustic = (across - 0.44) * 7.5;
  color = mix(color, vec3(1.0), 0.085 * detail * exp(-caustic * caustic));
#endif
  gl_FragColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}`;

export function createLiquidUniforms(PIXI, color, length) {
  return new PIXI.UniformGroup({
    uPourTint: {
      value: new Float32Array([color >> 16 & 255, color >> 8 & 255, color & 255]).map(channel => channel / 255),
      type: 'vec3<f32>',
    },
    uPourTime: { value: 0, type: 'f32' },
    uPourReveal: { value: 1, type: 'f32' },
    uPourTension: { value: 0, type: 'f32' },
    uPourLength: { value: length, type: 'f32' },
  });
}

export function writeMeshCenters(positions, centers) {
  for (let i = 0; i < positions.length; i += 4) {
    const x = (positions[i] + positions[i + 2]) * .5;
    const y = (positions[i + 1] + positions[i + 3]) * .5;
    centers[i] = centers[i + 2] = x;
    centers[i + 1] = centers[i + 3] = y;
  }
}

export function smoothUnit(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function createLiquidStream(PIXI, curve, color) {
  const data = buildMeshData(curve);
  const geometry = new PIXI.MeshGeometry({ positions: data.positions, uvs: data.uvs, indices: data.indices });
  const centers = new Float32Array(data.positions.length);
  writeMeshCenters(data.positions, centers);
  const centerBuffer = new PIXI.Buffer({
    data: centers, usage: PIXI.BufferUsage.VERTEX | PIXI.BufferUsage.COPY_DST,
  });
  geometry.addAttribute('aPourCenter', { buffer: centerBuffer, format: 'float32x2', stride: 8 });
  const length = Math.hypot(curve.p3.x - curve.p0.x, curve.p3.y - curve.p0.y);
  const liquidUniforms = createLiquidUniforms(PIXI, color, length);
  const shader = PIXI.Shader.from({
    gl: { vertex: liquidVertex, fragment: liquidFragment },
    resources: { liquidUniforms },
  });
  const mesh = new PIXI.Mesh({ geometry, shader });
  const shadow = [16, 8, 0].reduce((value, shift) => value * 256 + Math.round((color >> shift & 255) * .82), 0);
  const drop = new PIXI.Graphics()
    .ellipse(0, 0, 3.25, 4.35).fill(shadow)
    .ellipse(-.45, -.35, 2.65, 3.55).fill(color)
    .ellipse(-1.05, -1.2, .85, 1.55).fill({ color: 0xffffff, alpha: .45 });
  const impact = new PIXI.Graphics()
    .ellipse(0, 0, 8, 2.25).fill({ color, alpha: .23 })
    .ellipse(0, 0, 8, 2.25).stroke({ color, width: 1.05, alpha: .82 })
    .moveTo(-6, -.5).quadraticCurveTo(-3, -2.15, 2.5, -1.7)
    .stroke({ color: 0xffffff, width: .9, alpha: .6 });
  mesh.visible = drop.visible = impact.visible = false;
  let destroyed = false;
  return {
    mesh, drop, impact, geometry, curve, data, reveal: 1, liquidUniforms,
    update({ curve: next = this.curve, reveal, alpha, elapsed, tension, contactAge, release }) {
      if (this.curve !== next || this.reveal !== reveal) {
        writeMeshPositions(next, data.positions, STREAM_WIDTH, reveal);
        writeMeshCenters(data.positions, centers);
        geometry.getBuffer('aPosition').update();
        centerBuffer.update();
        liquidUniforms.uniforms.uPourLength = Math.hypot(next.p3.x - next.p0.x, next.p3.y - next.p0.y);
        this.curve = next;
        this.reveal = reveal;
      }
      const uniforms = liquidUniforms.uniforms;
      uniforms.uPourReveal = reveal;
      uniforms.uPourTime = elapsed;
      uniforms.uPourTension = tension;
      mesh.alpha = alpha;
      mesh.visible = alpha > 0;

      const ripple = contactAge / .36;
      impact.visible = LIQUID_STAGE >= 6 && ripple > 0 && ripple < 1;
      if (impact.visible) {
        const spread = 1 - (1 - ripple) ** 2;
        impact.position.set(next.p3.x, next.p3.y + .7);
        impact.scale.set(.34 + .95 * spread, .54 + .63 * spread);
        impact.alpha = .85 * smoothUnit(ripple / .18) * (1 - smoothUnit((ripple - .2) / .8));
      }
      drop.visible = LIQUID_STAGE >= 6 && release > 0 && release < 1;
      if (drop.visible) {
        const detach = smoothUnit(release / .4);
        const fall = Math.max(0, (release - .34) / .66) ** 2;
        drop.position.set(next.p3.x, next.p3.y - 1.5 + detach * 3 + fall * 10);
        drop.scale.set(.38 + .62 * detach, .75 + .33 * Math.sin(detach * Math.PI) + .14 * fall);
        drop.alpha = smoothUnit(release / .18) * (1 - smoothUnit((release - .54) / .46));
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      mesh.destroy();
      drop.destroy();
      impact.destroy();
      geometry.destroy(true);
      shader.destroy();
    },
  };
}
