// Sombras de contacto: oscurecimiento suave del piso bajo vehículos y personas.
// Reemplazan a la SSAO para los objetos dinámicos (que se dibujan después de ella) y los "apoyan"
// en el suelo con cualquier luz: de día, de noche, nublado o bajo techo.
import * as THREE from 'three';

const MAX = 160;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class ContactShadows {
  constructor(engine) {
    this.engine = engine;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = geo.index;
    g.attributes.position = geo.attributes.position;
    g.attributes.uv = geo.attributes.uv;
    // x: opacidad, y: forma (0 rectángulo redondeado, 1 elipse), z/w: medio ancho y medio largo (m)
    this.params = new Float32Array(MAX * 4);
    this.aParams = new THREE.InstancedBufferAttribute(this.params, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aParams', this.aParams);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        attribute vec4 aParams;
        varying vec2 vUv; varying vec4 vP; varying float vDist;
        void main() {
          vUv = uv * 2.0 - 1.0;
          vP = aParams;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vDist = distance(wp.xyz, cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec4 vP; varying float vDist;
        void main() {
          float a;
          if (vP.y < 0.5) {
            // rectángulo redondeado en metros, con penumbra amplia: núcleo oscuro bajo la carrocería
            vec2 hs = vP.zw;
            vec2 p = vUv * hs;
            float pen = min(hs.x, hs.y) * 0.62;
            vec2 q = abs(p) - (hs - pen);
            float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
            a = 1.0 - smoothstep(-pen * 0.55, pen, d);
            a *= a;
          } else {
            float d = length(vUv);
            a = 1.0 - smoothstep(0.15, 1.0, d);
            a = a * a * (3.0 - 2.0 * a);
          }
          a *= vP.x * (1.0 - smoothstep(90.0, 160.0, vDist));
          if (a < 0.004) discard;
          gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        }`,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'sombras-contacto';
    // capa 0: se dibuja con el mundo, antes de los objetos que la proyectan
    engine.scene.add(this.mesh);
    this.n = 0;
  }

  begin() {
    this.n = 0;
  }

  /**
   * Agrega una sombra. shape 0: rectángulo redondeado (vehículo), 1: elipse (persona).
   * w, l: tamaño en metros; height: altura sobre el piso (la sombra se desvanece al elevarse).
   */
  add(x, groundY, z, yaw, w, l, opacity, shape = 0, height = 0) {
    if (this.n >= MAX) return;
    const fade = Math.max(0, 1 - height / (shape ? 1.6 : 2.4));
    if (fade <= 0.01) return;
    const grow = 1 + height * 0.35;
    _q.setFromAxisAngle(UP, yaw);
    _m.compose(_p.set(x, groundY + 0.025, z), _q, _s.set(w * grow, 1, l * grow));
    const i = this.n++;
    this.mesh.setMatrixAt(i, _m);
    this.params[i * 4] = opacity * fade;
    this.params[i * 4 + 1] = shape;
    this.params[i * 4 + 2] = (w * grow) / 2;
    this.params[i * 4 + 3] = (l * grow) / 2;
  }

  end() {
    this.mesh.count = this.n;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aParams.needsUpdate = true;
    }
  }
}
