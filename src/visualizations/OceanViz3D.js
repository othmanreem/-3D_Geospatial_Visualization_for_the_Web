import * as THREE from 'three';
import { PCFSoftShadowMap } from 'three';
import chroma from 'chroma-js';

export class OceanViz3D {
  constructor(canvas, width, height) {
    this.canvas = canvas;
    this.width = width;
    this.height = height;
    this.mesh = null;
    this.textureData = null;
    this.colorMap = 'viridis';
    
    this.setupScene();
    this.setupControls();
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


    // // Grid helper for reference
    // const gridHelper = new THREE.GridHelper(500, 10, 0x444444, 0x888888);
    // this.scene.add(gridHelper);

    // // Axes helper
    // const axesHelper = new THREE.AxesHelper(200);
    // this.scene.add(axesHelper);

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

  setupControls() {
    // Simple orbit-like controls with mouse
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const deltaX = e.clientX - this.previousMousePosition.x;
        const deltaY = e.clientY - this.previousMousePosition.y;

        if (this.mesh) {
          this.mesh.rotation.y += deltaX * 0.01;
          this.mesh.rotation.x += deltaY * 0.01;
        }
      }
      this.previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomSpeed = 10;
      const direction = e.deltaY > 0 ? 1 : -1;
      this.camera.position.multiplyScalar(1 + direction * 0.1 * zoomSpeed / 100);
    });
  }

  updateSurface(data, width, height, bounds, colormap = 'viridis') {
    // Clean up old mesh
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
  
    // Data stats
    const validData = data.filter(v => Number.isFinite(v));
    if (validData.length === 0) {
      console.error('No valid data values');
      return;
    }
  
    const min = Math.min(...validData);
    const max = Math.max(...validData);
    const range = max - min || 1;
  
    const colorScale = this.getColorMap(colormap);
  
    const EARTH_RADIUS = 100;           // visual scale
    const HEIGHT_SCALE = 5;             // subtle displacement
  
    // --- Create vertices ---
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
  
        const value = data[i * width + j];
  
        // Pixel → lat/lon
        const lon = west + (j / (width - 1)) * (east - west);
        const lat = north - (i / (height - 1)) * (north - south);
  
        // Optional: focus on Northern Europe only
        // if (lat < 35 || lat > 75 || lon < -15 || lon > 40) continue;
  
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
  
    // --- Indices (same grid logic as before) ---
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
  
    // Camera framing
    this.camera.position.set(0, 0, 300);
    this.camera.lookAt(0, 0, 0);
  }
  

  // updateSurface(data, width, height, bounds, colormap = 'viridis') {
  //   // Remove old mesh
  //   if (this.mesh) {
  //     this.scene.remove(this.mesh);
  //     this.mesh.geometry.dispose();
  //     this.mesh.material.dispose();
  //   }

  //   this.colorMap = colormap;
  //   this.textureData = data;

  //   // Create geometry
  //   const geometry = new THREE.BufferGeometry();

  //   // Create vertices from data
  //   const vertices = [];
  //   const colors = [];
  //   const indices = [];

  //   // Find min/max for normalization

  //   const validData = data.filter(v => Number.isFinite(v));

  //   if (validData.length === 0) {
  //     console.error('No valid data values found');
  //     return;
  //   }

  //   const min = Math.min(...validData);
  //   const max = Math.max(...validData);
  //   const range = max - min || 1;

  //   // const min = Math.min(...data);
  //   // const max = Math.max(...data);
  //   // const range = max - min || 1;

  //   // const scaleX = 200 / width;
  //   // const scaleZ = 200 / height;
  //   // const scaleY = 100 / range;

  //   // Get colormap
  //   const color = this.getColorMap(colormap);

  //   // Create vertices
  //   for (let i = 0; i < height; i++) {
  //     for (let j = 0; j < width; j++) {

  //       const value = data[i * width + j];
  //       const x = j * scaleX - 100;
  //       const z = i * scaleZ - 100;


  //       if (!Number.isFinite(value)) {
  //         // Flat vertex at sea level (or any baseline)
  //         vertices.push(x, 0, z);

  //         // Neutral gray color for missing data
  //         colors.push(0.5, 0.5, 0.5);

  //         continue;
  //       }

  //       const y = (value - min) * scaleY;
  //       vertices.push(x, y, z);


  //       const normalized = Math.min(
  //         1,
  //         Math.max(0, (value - min) / range)
  //       );

  //       const c = color(normalized);
  //       colors.push(c.r / 255, c.g / 255, c.b / 255);

  //       // const value = data[i * width + j];
  //       // const x = j * scaleX - 100;
  //       // const z = i * scaleZ - 100;
  //       // const y = (value - min) * scaleY;

  //       // vertices.push(x, y, z);

  //       // // Color based on value
  //       // const normalized = (value - min) / range;
  //       // const c = color(normalized);
  //       // colors.push(c.r / 255, c.g / 255, c.b / 255);
  //     }
  //   }

  //   // Create indices for faces
  //   for (let i = 0; i < height - 1; i++) {
  //     for (let j = 0; j < width - 1; j++) {
  //       const a = i * width + j;
  //       const b = i * width + (j + 1);
  //       const c = (i + 1) * width + (j + 1);
  //       const d = (i + 1) * width + j;

  //       indices.push(a, b, d);
  //       indices.push(b, c, d);
  //     }
  //   }

  //   geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  //   geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  //   geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  //   geometry.computeVertexNormals();

  //   // Create material with vertex colors
  //   const material = new THREE.MeshPhongMaterial({
  //     vertexColors: true,
  //     side: THREE.DoubleSide,
  //     wireframe: false,
  //     shininess: 100,
  //   });

  //   // Create mesh
  //   this.mesh = new THREE.Mesh(geometry, material);
  //   this.mesh.castShadow = true;
  //   this.mesh.receiveShadow = true;
  //   this.scene.add(this.mesh);

  //   // Center camera on mesh
  //   this.camera.position.set(0, 150, 150);
  //   this.camera.lookAt(0, 50, 0);
  // }

  // getColorMap(name) {
  //   const maps = {
  //     viridis: (t) => chroma('viridis')(t),
  //     rdylbu_r: (t) => chroma.scale('RdYlBu_r')(t),
  //     reds: (t) => chroma.scale('Reds')(t),
  //     blues: (t) => chroma.scale('Blues')(t),
  //   };
  //   return maps[name] || maps.viridis;
  // }

  getColorMap(name) {
    const maps = {
      viridis: chroma.scale('viridis'),
      rdylbu_r: chroma.scale('RdYlBu').mode('lab'),
      reds: chroma.scale('Reds'),
      blues: chroma.scale('Blues'),
    };
  

    const scale = maps[name] || maps.viridis;
  
    // Return a function mapping [0,1] → RGB object
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
    const min = Math.min(...data);
    const max = Math.max(...data);
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    return { min, max, mean };
  }
}
