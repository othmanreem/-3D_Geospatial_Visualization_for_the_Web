import * as THREE from 'three';
import chroma from 'chroma-js';
import * as topojson from 'topojson-client';
import world from 'world-atlas/countries-50m.json';
import { geoCentroid, geoArea } from 'd3';

const MARINE_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_geography_marine_polys.geojson';

export class OceanViz3D {

  constructor(canvas, width, height) {
    console.log('[OceanViz3D] initialized');
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.mesh = null;
    this.surfaceMeta = null;
    this.textureData = null;
    this.colorMap = 'viridis';

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.onPointSelected = null; // callback to main.js

    // Overlay state. This MUST be created before setupScene(), because
    // setupScene() starts the animation loop, which calls updateLabels()
    // immediately. Creating it afterwards caused the
    // "Cannot read properties of undefined (reading 'visible')" error.
    this.bordersLine = null;
    this.labelsGroup = new THREE.Group();
    this.labelSprites = [];
    this._v = new THREE.Vector3();
    this._cam = new THREE.Vector3();

    this.setupScene();
    this.setupControls();
    this.initLabels();
  }

  setupScene() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xccddee);
    this.scene.fog = new THREE.Fog(0xccddee, 1000, 5000);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.width / this.height,
      0.1,
      5000
    );
    this.camera.position.set(0, 150, 150);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    this.setupLighting();

    // Optional: faint Earth outline
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(100, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0xdddddd, wireframe: true, opacity: 0.1, transparent: true })
    );
    this.scene.add(globe);

    // Animation loop
    this.animate();
  }

  setupLighting() {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Directional light for shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    this.scene.add(directionalLight);

    // Hemisphere light for better ambient
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x0a472f, 0.4);
    this.scene.add(hemiLight);
  }

  // ---------------------------------------------------------------------
  // Country borders
  // ---------------------------------------------------------------------

  addCountryBorders(radius = 105.5, color = 0x111111) {
    if (this.bordersLine) return;

    const borders = topojson.mesh(world, world.objects.countries); // MultiLineString
    const positions = [];

    for (const line of borders.coordinates) {
      for (let k = 0; k < line.length - 1; k++) {
        const [lon1, lat1] = line[k];
        const [lon2, lat2] = line[k + 1];

        // skip artificial cuts along the antimeridian
        if (Math.abs(lon2 - lon1) > 180) continue;
        if (Math.abs(lon1) > 179.99 && Math.abs(lon2) > 179.99) continue;

        // densify so long segments follow the sphere instead of cutting through it
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lon2 - lon1), Math.abs(lat2 - lat1))));
        for (let s = 0; s < steps; s++) {
          const a = this.latLonToCartesian(
            lat1 + ((lat2 - lat1) * s) / steps,
            lon1 + ((lon2 - lon1) * s) / steps,
            radius
          );
          const b = this.latLonToCartesian(
            lat1 + ((lat2 - lat1) * (s + 1)) / steps,
            lon1 + ((lon2 - lon1) * (s + 1)) / steps,
            radius
          );
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.bordersLine = new THREE.LineSegments(
      geom,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 })
    );

    if (this.mesh) this.mesh.add(this.bordersLine);
  }

  setBordersVisible(visible) {
    if (this.bordersLine) this.bordersLine.visible = visible;
  }

  // ---------------------------------------------------------------------
  // Country / ocean labels
  // ---------------------------------------------------------------------

  async initLabels() {
    const items = [];

    // Countries: names come with world-atlas
    const countries = topojson.feature(world, world.objects.countries).features;
    for (const f of countries) {
      if (!f.properties?.name) continue;
      const [lon, lat] = geoCentroid(f);
      const a = geoArea(f); // steradians
      const tier = a > 0.02 ? 0 : a > 0.005 ? 1 : a > 0.001 ? 2 : 3;
      items.push({ name: f.properties.name, lat, lon, tier, water: false });
    }

    // Oceans and seas: Natural Earth marine polygons
    try {
      const res = await fetch(MARINE_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const gj = await res.json();
      for (const f of gj.features) {
        const name = f.properties?.name;
        if (!name) continue;
        const [lon, lat] = geoCentroid(f);
        const cls = (f.properties.featurecla || '').toLowerCase();
        const tier = cls === 'ocean' ? 0 : cls === 'sea' ? 1 : 2;
        items.push({ name, lat, lon, tier, water: true });
      }
    } catch (e) {
      console.warn('Could not load marine names', e);
    }

    for (const it of items) {
      const sprite = this.makeLabelSprite(it.name, it.water);
      sprite.position.copy(this.latLonToCartesian(it.lat, it.lon, 108));
      sprite.userData = { tier: it.tier, aspect: sprite.scale.x / sprite.scale.y };
      this.labelsGroup.add(sprite);
      this.labelSprites.push(sprite);
    }

    // Labels load asynchronously, so the mesh may already exist
    if (this.mesh) this.mesh.add(this.labelsGroup);
  }

  makeLabelSprite(text, water) {
    const scale = 2; // retina-sharp text
    const fontPx = 22 * scale;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const font = `${water ? 'italic ' : ''}600 ${fontPx}px sans-serif`;

    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 16 * scale;
    const h = fontPx + 12 * scale;
    canvas.width = w;
    canvas.height = h;

    // Resizing a canvas resets its state, so set the font again
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5 * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; // halo for readability on any color
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = water ? '#0b3d91' : '#111';
    ctx.fillText(text, w / 2, h / 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    sprite.scale.set((w / h) * 4, 4, 1);
    return sprite;
  }

  setLabelsVisible(visible) {
    this.labelsGroup.visible = visible;
  }

  updateLabels() {
    if (!this.labelsGroup || !this.labelsGroup.visible || !this.mesh) return;
    if (this.labelSprites.length === 0) return;

    const dist = this.camera.position.length();
    const maxTier = dist > 250 ? 0 : dist > 180 ? 1 : dist > 130 ? 2 : 3;
    const sizeK = dist / 300; // keep labels a similar screen size when zooming
    this._cam.copy(this.camera.position).normalize();

    this.mesh.updateWorldMatrix(true, false);

    for (const s of this.labelSprites) {
      s.getWorldPosition(this._v).normalize();
      const facing = this._v.dot(this._cam) > 0.35; // hide labels on the far side / limb
      s.visible = facing && s.userData.tier <= maxTier;
      if (s.visible) s.scale.set(4 * sizeK * s.userData.aspect, 4 * sizeK, 1);
    }
  }

  // ---------------------------------------------------------------------
  // Picking
  // ---------------------------------------------------------------------

  getPointInfo(intersection) {
    const { bounds, data, width, height } = this.surfaceMeta;

    // Convert the world-space hit to the mesh's local space so picking
    // stays correct after the globe has been rotated.
    const local = this.mesh.worldToLocal(intersection.point.clone());
    const { lat, lon } = this.cartesianToLatLon(local);

    // Map lat/lon -> raster indices
    const j = Math.round(
      ((lon - bounds.west) / (bounds.east - bounds.west)) * (width - 1)
    );
    const i = Math.round(
      ((bounds.north - lat) / (bounds.north - bounds.south)) * (height - 1)
    );

    const index = i * width + j;
    const value = data[index];

    return {
      lat,
      lon,
      value,
      index,
    };
  }

  handlePick(event) {
    if (!this.mesh || !this.surfaceMeta) return;

    const rect = this.canvas.getBoundingClientRect();

    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // recursive = false: only test the surface itself, not the border
    // lines or label sprites that are children of the mesh.
    const intersects = this.raycaster.intersectObject(this.mesh, false);
    if (intersects.length === 0) return;

    const info = this.getPointInfo(intersects[0]);

    if (this.onPointSelected) {
      // Canvas-relative coordinates, not page coordinates
      this.onPointSelected(info, event.clientX - rect.left, event.clientY - rect.top);
    }
  }

  // Kept for backwards compatibility with code that calls handleClick
  handleClick(event) {
    this.handlePick(event);
  }

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------

  rotate(dx, dy) {
    if (!this.mesh) return;

    const ROTATION_SPEED = 0.005;

    this.mesh.rotation.y += dx * ROTATION_SPEED;
    this.mesh.rotation.x += dy * ROTATION_SPEED;

    // Prevent flipping upside down
    this.mesh.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, this.mesh.rotation.x)
    );
  }

  setupControls() {
    this.isDragging = false;
    this.dragDistance = 0;
    this.previousMousePosition = { x: 0, y: 0 };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragDistance = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;

      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;

      this.dragDistance += Math.abs(dx) + Math.abs(dy);

      this.rotate(dx, dy);

      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });

    this.canvas.addEventListener('mouseup', (e) => {
      this.isDragging = false;
      // A click without dragging selects a point
      if (this.dragDistance < 5) {
        this.handlePick(e);
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 10;
      const direction = e.deltaY > 0 ? 1 : -1;
      this.camera.position.multiplyScalar(1 + direction * 0.1 * zoomSpeed / 100);

      // Keep the camera outside the globe (surface reaches radius ~105)
      // and within a sensible maximum distance.
      const len = this.camera.position.length();
      const clamped = Math.min(600, Math.max(125, len));
      if (clamped !== len) this.camera.position.multiplyScalar(clamped / len);
    }, { passive: false });
  }

  // Convert Cartesian -> lat/lon helper
  cartesianToLatLon(vec) {
    const r = vec.length();
    const lat = 90 - THREE.MathUtils.radToDeg(Math.acos(vec.y / r));
    const lon = THREE.MathUtils.radToDeg(Math.atan2(vec.z, vec.x)) - 180;
    return { lat, lon };
  }

  // ---------------------------------------------------------------------
  // Surface
  // ---------------------------------------------------------------------

  updateSurface(data, width, height, bounds, colormap = 'viridis') {
    // Validate before touching the existing mesh, so a bad dataset
    // doesn't leave the viewer pointing at a removed mesh.
    const validData = data.filter(v => Number.isFinite(v));
    if (validData.length === 0) {
      console.error('No valid data values');
      return;
    }

    this.surfaceMeta = {
      data,
      width,
      height,
      bounds,
    };

    // Clean up old mesh (children - borders and labels - are re-attached below)
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }

    const { west, south, east, north } = bounds;

    // Prepare geometry
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const colors = [];
    const indices = [];

    // Loop instead of Math.min(...array): spreading a large raster
    // can overflow the call stack.
    let min = Infinity;
    let max = -Infinity;
    for (const v of validData) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    const colorScale = this.getColorMap(colormap);

    const EARTH_RADIUS = 100;           // visual scale
    const HEIGHT_SCALE = 5;             // subtle displacement

    // --- Create vertices ---
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {

        const value = data[i * width + j];

        // Pixel -> lat/lon
        const lon = west + (j / (width - 1)) * (east - west);
        const lat = north - (i / (height - 1)) * (north - south);

        let radius = EARTH_RADIUS;

        if (Number.isFinite(value)) {
          const normalized = (value - min) / range;
          radius += normalized * HEIGHT_SCALE;

          const c = colorScale(normalized);
          colors.push(c.r / 255, c.g / 255, c.b / 255);
        } else {
          colors.push(0.5, 0.5, 0.5);
        }

        const pos = this.latLonToCartesian(lat, lon, radius);

        vertices.push(pos.x, pos.y, pos.z);
      }
    }

    // --- Indices ---
    for (let i = 0; i < height - 1; i++) {
      for (let j = 0; j < width - 1; j++) {
        const a = i * width + j;
        const b = i * width + (j + 1);
        const c = (i + 1) * width + (j + 1);
        const d = (i + 1) * width + j;

        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(colors, 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      shininess: 80,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);

    // Borders are built once, then re-attached to each new mesh.
    // Adding an object to a new parent removes it from the old one.
    this.addCountryBorders();
    if (this.bordersLine) this.mesh.add(this.bordersLine);
    this.mesh.add(this.labelsGroup);

    // Camera framing
    this.camera.position.set(0, 0, 300);
    this.camera.lookAt(0, 0, 0);
  }

  getColorMap(name) {
    const maps = {
      viridis: chroma.scale('viridis'),
      reds: chroma.scale('Reds'),
      blues: chroma.scale('Blues'),
    };

    const scale = maps[name] || maps.viridis;

    // Return a function mapping [0,1] -> RGB object
    return (t) => {
      const c = scale(t).rgb();
      return { r: c[0], g: c[1], b: c[2] };
    };
  }

  latLonToCartesian(lat, lon, radius) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon + 180);

    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  setOpacity(opacity) {
    if (this.mesh && this.mesh.material) {
      this.mesh.material.opacity = opacity;
      this.mesh.material.transparent = opacity < 1;
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.updateLabels(); // update first so the frame shows current visibility
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize(width, height) {
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  getStats(data) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    for (const v of data) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
      n++;
    }
    return { min, max, mean: n ? sum / n : 0 };
  }
}