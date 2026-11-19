import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const BASE = import.meta.env.BASE_URL + 'assets/';
// 已轉成 WebP 的劇情圖片（由 scripts/perf-images.py 從同名 PNG 產生，體積約為十分之一）。
// children-1998：文件視窗的 <img>（campaign.js 的 image 欄位）也讀同一個 .webp，共用一次下載。
const IMAGE_EXT = { apparition: 'webp', 'children-1998': 'webp' };

/** 素材載入與快取（Poly Haven CC0 材質 / 模型 / HDRI） */
export class Assets {
  constructor(renderer) {
    this.renderer = renderer;
    this.texLoader = new THREE.TextureLoader();
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder); // 允許 EXT_meshopt_compression 壓縮過的 GLB
    this.hdrLoader = new HDRLoader();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.pbr = {};
    this.models = {};
    this.animations = {};
    this.env = {};
    this.images = {};
  }

  async _tex(url, srgb) {
    const t = await this.texLoader.loadAsync(BASE + url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.aniso;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  }

  /** 預先載入一張地圖需要的全部素材 */
  async preload({ textures = [], models = [], hdr = [], images = [], scans = [] }, onProgress) {
    const jobs = [];
    let done = 0;
    const tick = () => { done++; onProgress?.(done / jobs.length); };
    for (const id of images) {
      if (this.images[id]) continue;
      jobs.push(this.texLoader.loadAsync(`${BASE}story/${id}.${IMAGE_EXT[id] || 'png'}`).then(t => {
        t.colorSpace = THREE.SRGBColorSpace; this.images[id] = t; tick();
      }));
    }
    for (const id of scans) {
      if (this.models[id]) continue;
      jobs.push(this.gltfLoader.loadAsync(`${BASE}models/${id}/${id}.glb`).then(gltf => {
        gltf.scene.traverse(o => { if(o.isMesh) { o.castShadow=true; o.receiveShadow=true; if(o.material.map)o.material.map.anisotropy=this.aniso; } });
        this.models[id]=gltf.scene;this.animations[id]=gltf.animations;tick();
      }));
    }
    for (const id of textures) {
      if (this.pbr[id]) continue;
      jobs.push((async () => {
        const [map, normalMap, arm] = await Promise.all([
          this._tex(`textures/${id}/diff.jpg`, true),
          this._tex(`textures/${id}/nor.jpg`, false),
          this._tex(`textures/${id}/arm.jpg`, false),
        ]);
        this.pbr[id] = { map, normalMap, arm };
        tick();
      })());
    }
    for (const id of models) {
      if (this.models[id]) continue;
      jobs.push((async () => {
        const gltf = await this.gltfLoader.loadAsync(`${BASE}models/${id}/${id}.gltf`);
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const m = o.material;
          // Poly Haven 的 BLEND 材質多半其實不需要半透明，改成 alphaTest 以避免排序問題
          if (m.transparent) { m.transparent = false; m.alphaTest = m.map?.format === THREE.RGBAFormat ? 0.4 : 0; m.depthWrite = true; }
          for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
            if (m[key]) m[key].anisotropy = this.aniso;
          }
        });
        this.models[id] = gltf.scene;
        tick();
      })());
    }
    for (const id of hdr) {
      if (this.env[id]) continue;
      jobs.push((async () => {
        const tex = await this.hdrLoader.loadAsync(`${BASE}hdri/${id}.hdr`);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.env[id] = pmrem.fromEquirectangular(tex).texture;
        tex.dispose();
        pmrem.dispose();
        tick();
      })());
    }
    await Promise.all(jobs);
  }

  /** 快取持有的所有貼圖（卸載地圖時保留，不隨場景釋放） */
  cachedTextures() {
    const out = new Set();
    const add = (t) => { if (t && t.isTexture) out.add(t); };
    for (const p of Object.values(this.pbr)) for (const t of Object.values(p)) add(t);
    for (const t of Object.values(this.images)) add(t);
    for (const t of Object.values(this.env)) add(t);
    for (const m of Object.values(this.models)) {
      m.traverse((o) => {
        if (!o.material) return;
        for (const mat of Array.isArray(o.material) ? o.material : [o.material]) for (const k in mat) add(mat[k]);
      });
    }
    return out;
  }

  /** 以 PBR 貼圖組建立材質 */
  mat(id, opts = {}) {
    const t = this.pbr[id];
    if (!t) throw new Error(`材質尚未載入: ${id}`);
    return new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap, roughnessMap: t.arm, aoMap: t.arm, metalness: 0, ...opts,
    });
  }
  /** 取得模型（每次回傳共用幾何的複本） */
  model(id) {
    const m = this.models[id];
    if (!m) throw new Error(`模型尚未載入: ${id}`);
    return cloneSkeleton(m);
  }
}
