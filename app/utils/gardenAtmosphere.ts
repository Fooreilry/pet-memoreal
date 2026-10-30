import { Container, Filter, GlProgram, Graphics, Rectangle } from 'pixi.js'
import type { WebGLRenderer } from 'pixi.js'
import type { GardenId } from '../data/demoGardens'
import { getGardenLayout } from '../data/gardenLayout'

const themes: Record<GardenId, number> = { meadow: 0, lake: 1, grove: 2, hill: 3 }
type ProgramData = ReturnType<WebGLRenderer['shader']['_getProgramData']>
type PreparedProgram = { renderer: WebGLRenderer, gl: WebGLRenderer['gl'], data: ProgramData, supported: boolean }
type FocusRect = { left: number, top: number, width: number, height: number }
// Pixi 8.21 exposes compilation but not per-program removal. Keep its internal
// cache access confined here; this filter owns its unique named program/key.
type ShaderProgramCache = {
  _programDataHash?: Record<number, ProgramData> | null
  _shaderSyncFunctions?: Record<number, unknown> | null
}
type UniformProgramCache = { _uniformGroupSyncHash?: Record<string, Record<number, unknown>> | null }

// Only the translucent overlay is filtered, never the world or its cached chunks.
// Half CSS resolution is enough for broad light; large screens are capped at 768px.
export function gardenAtmosphereResolution(width: number, height: number) {
  return Math.min(0.5, 768 / Math.max(1, width, height))
}

const vertex = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vUv = aPosition;
}`

const fragment = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 finalColor;
uniform float uTime;
uniform float uTheme;
uniform float uAspect;
uniform float uFocus;
uniform highp vec4 uFocusRect;
uniform highp float uWeatherTime;
uniform vec2 uViewport;
uniform vec4 uView;
uniform vec4 uPond0;
uniform vec4 uPond1;

float weatherHash(vec2 cell) {
  vec3 h = fract(vec3(cell.xyx) * 0.1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}

float rainStreaks(vec2 p, vec2 grid, float speed, float seed) {
  // Two tiled layers replace hundreds of individual sprites. The 16-cell
  // vertical period and speeds return to the same phase after 128 seconds.
  highp vec2 q = vec2(p.x + p.y * 0.18, p.y - uWeatherTime * speed) * grid;
  vec2 cell = floor(q);
  float hash = weatherHash(vec2(cell.x + seed, mod(cell.y, 16.0)));
  vec2 local = fract(q);
  float center = 0.15 + hash * 0.7;
  float aa = max(fwidth(local.x) * 0.7, 0.018);
  float line = 1.0 - smoothstep(0.012, 0.012 + aa, abs(local.x - center));
  float start = 0.04 + fract(hash * 9.73) * 0.34;
  float tail = smoothstep(start, start + 0.10, local.y) * (1.0 - smoothstep(start + 0.30, start + 0.43, local.y));
  return line * tail * smoothstep(0.48, 0.76, hash) * (0.55 + hash * 0.45);
}

float waterRipples(vec2 world, vec4 pond) {
  vec2 water = (world - pond.xy) / max(pond.zw, vec2(1.0));
  // The inner ellipse stays within the lake's indented lower-left bank.
  float shore = 1.0 - smoothstep(0.66, 0.72, length(water));
  if (shore <= 0.0) return 0.0;
  vec2 grid = world / vec2(48.0, 32.0);
  vec2 cell = floor(grid);
  float hash = weatherHash(cell);
  // Keep the complete expanding ellipse inside its cell, without clipped arcs.
  vec2 center = cell + vec2(0.35 + hash * 0.3, 0.28 + weatherHash(cell.yx + 3.0) * 0.44);
  vec2 delta = (grid - center) * vec2(2.0, 2.7);
  float distance = length(delta);
  float phase = fract(uWeatherTime * 0.5 + hash);
  float radius = 0.05 + phase * 0.59;
  float width = max(fwidth(distance) * 0.8, 0.045);
  float ring = 1.0 - smoothstep(0.018, 0.018 + width, abs(distance - radius));
  float life = smoothstep(0.0, 0.12, phase) * (1.0 - phase);
  return ring * life * shore * smoothstep(0.24, 0.5, hash);
}

void main() {
  // Focus light belongs to the illustrated window, including on portrait phones.
  vec2 sceneUv = vUv;
  float sceneAspect = uAspect;
  if (uFocus > 0.5) {
    sceneUv = (vUv - uFocusRect.xy) / max(uFocusRect.zw, vec2(0.0001));
    if (uFocusRect.z <= 0.0 || uFocusRect.w <= 0.0
      || any(lessThan(sceneUv, vec2(0.0))) || any(greaterThan(sceneUv, vec2(1.0)))) {
      finalColor = vec4(0.0);
      return;
    }
    sceneAspect = uAspect * uFocusRect.z / max(uFocusRect.w, 0.0001);
  }
  vec2 p = vec2(sceneUv.x * sceneAspect, sceneUv.y);
  float edge = smoothstep(0.24, 0.76, length((sceneUv - 0.5) * vec2(0.9, 1.0)));
  float shade = edge * 0.035;
  float light = 0.0;
  float detail = 0.0;
  vec3 detailColor = vec3(0.85, 0.95, 0.97);
  vec3 lightColor = vec3(1.0, 0.88, 0.59);
  vec3 shadeColor = vec3(0.10, 0.20, 0.17);

  if (uTheme < 0.5) {
    // Meadow: sunlight fans from just above the garden, leaving clear breaks
    // between the shafts instead of applying a uniform yellow wash.
    float direction = (p.x - 0.12) / (p.y + 0.34);
    float ray = smoothstep(0.25, 0.96, sin(direction * 8.0 + sin(uTime * 0.6) * 0.2));
    float fineRay = smoothstep(0.68, 0.99, sin(direction * 19.0 - uTime * 0.3));
    float reach = 1.0 - smoothstep(0.15, 1.35, sceneUv.y);
    float halo = 1.0 - smoothstep(0.02, 0.72, length((p - vec2(0.12, -0.06)) * vec2(0.85, 1.0)));
    light = (ray * 0.17 + fineRay * 0.055) * reach + halo * 0.105;
    lightColor = vec3(1.0, 0.87, 0.50);
    if (uFocus > 0.5) {
      // Broad shafts come from the close-up's sun rather than starting behind
      // the paper panel as the overhead map's lighting would.
      vec2 sunDelta = p - vec2(sceneAspect * 0.72, 0.23);
      float angle = atan(sunDelta.x, sunDelta.y + 0.0001);
      float focusRay = smoothstep(0.28, 0.96, sin(angle * 7.0 + sin(uTime * 0.7) * 0.12));
      float fineFocusRay = smoothstep(0.78, 1.0, sin(angle * 13.0 - uTime * 0.25));
      float cone = 1.0 - smoothstep(1.05, 1.48, abs(angle));
      float focusReach = smoothstep(0.015, 0.095, sunDelta.y) * cone
        * (1.0 - smoothstep(0.32, 1.35, length(sunDelta)));
      float sunHalo = 1.0 - smoothstep(0.04, 0.55, length((sceneUv - vec2(0.72, 0.23)) * vec2(sceneAspect, 1.0)));
      light = (focusRay * 0.24 + fineFocusRay * 0.025) * focusReach + sunHalo * 0.13;
      lightColor = vec3(1.0, 0.91, 0.64);
    }
  } else if (uTheme < 1.5) {
    // Lake: soft slanted rain and water-local expanding rings, with a little
    // cool weather depth. Ground and names remain visible through the rain.
    float haze = sin(p.x * 2.5 + sin(p.y * 2.8 + uTime * 0.5) * 0.8 + uTime * 0.2);
    light = smoothstep(-0.8, 1.0, haze) * 0.034;
    shade += 0.028;
    float rain = rainStreaks(p, vec2(26.0, 14.0), 0.3125, 0.0)
      + rainStreaks(p + vec2(0.37, 0.11), vec2(19.0, 12.0), 0.25, 7.0) * 0.4;
    vec2 world = (vUv * uViewport - uView.xy) / max(uView.z, 0.001);
    float ripples = max(waterRipples(world, uPond0), waterRipples(world, uPond1));
    detail = min(0.31, rain * 0.29 + ripples * 0.26);
    lightColor = vec3(0.65, 0.85, 0.92);
    shadeColor = vec3(0.09, 0.22, 0.25);
    if (uFocus > 0.5) {
      detail = min(0.36, rain * 0.34 + ripples * 0.30);
      light *= 1.3;
      shade += 0.012;
    }
  } else if (uTheme < 2.5) {
    // Grove: dappled shadows with warm beams breaking through the canopy.
    float canopy = sin(p.x * 6.0 + sin(p.y * 4.5 + uTime * 0.5) * 0.65)
      * cos(p.y * 5.0 - uTime * 0.25);
    float beam = smoothstep(0.55, 0.98, sin(p.x * 10.0 - p.y * 4.0 + sin(uTime * 0.5) * 0.2));
    light = smoothstep(0.12, 0.85, canopy) * (1.0 - sceneUv.y * 0.4) * 0.16;
    light += beam * (1.0 - smoothstep(0.15, 1.0, sceneUv.y)) * 0.11;
    shade += smoothstep(0.05, 0.95, -canopy) * 0.105;
    lightColor = vec3(0.98, 0.94, 0.64);
    shadeColor = vec3(0.07, 0.19, 0.14);
    if (uFocus > 0.5) {
      float dapple = sin(p.x * 9.0 + sin(p.y * 7.0 + uTime * 0.65) * 0.9)
        * cos(p.y * 7.0 - p.x * 2.0 - uTime * 0.35);
      float focusBeam = smoothstep(0.38, 0.94, sin(p.x * 7.0 - p.y * 3.8 + sin(uTime * 0.6) * 0.25));
      light = smoothstep(0.22, 0.85, dapple) * 0.22
        + focusBeam * (1.0 - smoothstep(0.35, 1.15, sceneUv.y)) * 0.20;
      shade += smoothstep(0.03, 0.85, -dapple) * 0.20;
    }
  } else {
    // Hill: larger cloud banks travel over the slopes with light at their edges.
    float cloud = sin(p.x * 2.1 + p.y * 1.3 + uTime * 0.8)
      + cos(p.y * 3.8 - p.x * 1.3 - uTime * 0.4) * 0.55;
    shade += smoothstep(-0.4, 1.1, cloud) * 0.16;
    light = (1.0 - smoothstep(-0.8, 0.2, cloud)) * 0.10;
    lightColor = vec3(0.87, 0.94, 0.99);
    shadeColor = vec3(0.16, 0.25, 0.26);
    if (uFocus > 0.5) {
      float focusCloud = sin(p.x * 2.6 + p.y * 1.9 + uTime * 1.8)
        + cos(p.y * 4.3 - p.x * 1.2 - uTime * 0.8) * 0.62;
      float cloudShade = smoothstep(-0.25, 0.90, focusCloud);
      float cloudEdge = smoothstep(-0.50, 0.0, focusCloud)
        * (1.0 - smoothstep(0.05, 0.55, focusCloud));
      shade = edge * 0.035 + cloudShade * 0.27;
      light = cloudEdge * 0.15 + (1.0 - cloudShade) * 0.10;
    }
  }

  // Premultiplied alpha: retain the original artwork and names beneath the light.
  float alpha = light + shade * (1.0 - light);
  vec3 color = lightColor * light + shadeColor * shade * (1.0 - light);
  color = detailColor * detail + color * (1.0 - detail);
  alpha = detail + alpha * (1.0 - detail);
  float strength = min(1.0, mix(0.34, 0.42, uFocus) / max(alpha, 0.0001));
  finalColor = vec4(color * strength, alpha * strength);
}`

export function createGardenAtmosphere(width: number, height: number, gardenId: GardenId) {
  const view = new Float32Array([0, 0, 1, 0])
  const viewport = new Float32Array([width, height])
  const pond0 = new Float32Array([0, 0, 1, 1])
  const pond1 = new Float32Array([0, 0, 1, 1])
  const focusRect = new Float32Array([0, 0, 1, 1])
  const focusBounds: FocusRect = { left: 0, top: 0, width, height }
  const root = new Container({ label: 'garden-atmosphere' })
  root.eventMode = 'none'
  root.interactiveChildren = false
  const surface = root.addChild(new Graphics())
  surface.eventMode = 'none'
  // Own the program rather than destroying a shared GlProgram.from() entry.
  const program = new GlProgram({ vertex, fragment, name: 'garden-atmosphere', preferredFragmentPrecision: 'mediump' })
  const filter = new Filter({
    glProgram: program,
    resolution: gardenAtmosphereResolution(width, height),
    antialias: false,
    padding: 0,
    blendRequired: false,
    clipToViewport: true,
    resources: {
      atmosphereUniforms: {
        uTime: { value: 0, type: 'f32' },
        uWeatherTime: { value: 0, type: 'f32' },
        uTheme: { value: themes[gardenId], type: 'f32' },
        uAspect: { value: 1, type: 'f32' },
        uFocus: { value: 0, type: 'f32' },
        uFocusRect: { value: focusRect, type: 'vec4<f32>' },
        uViewport: { value: viewport, type: 'vec2<f32>' },
        uView: { value: view, type: 'vec4<f32>' },
        uPond0: { value: pond0, type: 'vec4<f32>' },
        uPond1: { value: pond1, type: 'vec4<f32>' }
      }
    }
  })
  surface.filters = [filter]
  const uniforms = filter.resources.atmosphereUniforms.uniforms
  const preparedPrograms = new Map<WebGLRenderer, PreparedProgram>()
  let currentWidth = 0, currentHeight = 0
  let waterLoaded = false

  function updateFocusRect() {
    if (!uniforms.uFocus) {
      focusRect[0] = 0
      focusRect[1] = 0
      focusRect[2] = 1
      focusRect[3] = 1
      return
    }
    const left = Math.max(0, Math.min(currentWidth, focusBounds.left))
    const top = Math.max(0, Math.min(currentHeight, focusBounds.top))
    const right = Math.max(left, Math.min(currentWidth, focusBounds.left + focusBounds.width))
    const bottom = Math.max(top, Math.min(currentHeight, focusBounds.top + focusBounds.height))
    focusRect[0] = left / currentWidth
    focusRect[1] = top / currentHeight
    focusRect[2] = (right - left) / currentWidth
    focusRect[3] = (bottom - top) / currentHeight
  }

  function releaseProgram({ renderer, gl, data }: PreparedProgram) {
    const shader = renderer.shader
    const shaderCache = shader as unknown as ShaderProgramCache | undefined
    const uniformCache = renderer.uniformGroup as unknown as UniformProgramCache | undefined
    // GlProgramData.destroy() only clears CPU fields in Pixi 8.21. Delete the
    // owned GPU handle and remove its cache aliases before destroying metadata.
    if (data.program) gl.deleteProgram(data.program)
    if (shaderCache?._programDataHash?.[program._key] === data) Reflect.deleteProperty(shaderCache._programDataHash, program._key)
    if (shaderCache?._shaderSyncFunctions) Reflect.deleteProperty(shaderCache._shaderSyncFunctions, program._key)
    for (const cache of Object.values(uniformCache?._uniformGroupSyncHash ?? {})) Reflect.deleteProperty(cache, program._key)
    if (shader?._activeProgram === program) shader.resetState()
    data.destroy()
  }

  function prepare(renderer: WebGLRenderer) {
    if (root.destroyed) return false
    const previous = preparedPrograms.get(renderer)
    if (previous?.gl === renderer.gl) return previous.supported
    if (previous) { releaseProgram(previous); preparedPrograms.delete(renderer) }
    try {
      // Pixi logs failed shader links without throwing. Compile through its own
      // cache, then check the result before a filter framebuffer is entered.
      const data = renderer.shader._getProgramData(program)
      const prepared = { renderer, gl: renderer.gl, data, supported: false }
      preparedPrograms.set(renderer, prepared)
      prepared.supported = !!renderer.gl.getProgramParameter(data.program, renderer.gl.LINK_STATUS)
      return prepared.supported
    } catch { return false }
  }

  function resize(nextWidth: number, nextHeight: number) {
    if (root.destroyed) return
    const w = Math.max(1, Number.isFinite(nextWidth) ? nextWidth : 1)
    const h = Math.max(1, Number.isFinite(nextHeight) ? nextHeight : 1)
    if (currentWidth === w && currentHeight === h) return
    currentWidth = w
    currentHeight = h
    surface.clear().rect(0, 0, w, h).fill(0xffffff)
    surface.filterArea = new Rectangle(0, 0, w, h)
    filter.resolution = gardenAtmosphereResolution(w, h)
    uniforms.uAspect = w / h
    viewport[0] = w
    viewport[1] = h
    updateFocusRect()
  }

  function update(seconds: number) {
    if (root.destroyed || !root.visible) return
    // A common period keeps the mediump phase small without a visible wrap jump.
    uniforms.uTime = (Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 0.025) % (40 * Math.PI)
    uniforms.uWeatherTime = Math.max(0, Number.isFinite(seconds) ? seconds : 0) % 128
  }

  function setGarden(id: GardenId) {
    if (root.destroyed) return
    uniforms.uTheme = themes[id]
    if (id === 'lake' && !waterLoaded) {
      const ponds = getGardenLayout(1200, 1000, 'lake').features.ponds
      for (const [index, pond] of ponds.slice(0, 2).entries()) (index === 0 ? pond0 : pond1).set([pond.x, pond.y, pond.rx, pond.ry])
      waterLoaded = true
    }
  }

  function setView(next: { x: number, y: number, scale: number }) {
    if (root.destroyed) return
    view[0] = Number.isFinite(next.x) ? next.x : 0
    view[1] = Number.isFinite(next.y) ? next.y : 0
    view[2] = Math.max(0.001, Number.isFinite(next.scale) ? next.scale : 1)
  }

  // Coordinates are CSS pixels in the current canvas, not the garden world.
  // This mutates one existing uniform vector; returning to the map is exact.
  function setFocus(enabled: boolean, bounds?: FocusRect) {
    if (root.destroyed) return
    uniforms.uFocus = enabled ? 1 : 0
    if (enabled) {
      focusBounds.left = Number.isFinite(bounds?.left) ? bounds!.left : 0
      focusBounds.top = Number.isFinite(bounds?.top) ? bounds!.top : 0
      focusBounds.width = Math.max(0, Number.isFinite(bounds?.width) ? bounds!.width : bounds ? 0 : currentWidth)
      focusBounds.height = Math.max(0, Number.isFinite(bounds?.height) ? bounds!.height : bounds ? 0 : currentHeight)
    }
    updateFocusRect()
  }

  function setEnabled(enabled: boolean) {
    if (!root.destroyed) root.visible = enabled
  }

  // Container disposal does not own attached filters; release this one explicitly.
  root.once('destroyed', () => {
    for (const prepared of preparedPrograms.values()) releaseProgram(prepared)
    preparedPrograms.clear()
    filter.destroy(true)
  })
  resize(width, height)
  setGarden(gardenId)
  return { root, prepare, resize, update, setGarden, setView, setFocus, setEnabled, destroy: () => root.destroy({ children: true, context: true }) }
}
