import { fromFile, fromUrl, fromArrayBuffer } from 'geotiff';

export class DataManager {
  constructor() {
    this.dataCache = new Map();
    this.fileMap = new Map();
    
    // Map variable/scenario combinations to files
    // Format: "variable_scenario_period" -> file path
    this.initializeFileMap();
  }

  initializeFileMap() {
    // Update these paths to match your actual file locations
    const baseDir = '/data'; // This will be relative to where files are served
    
    // Sea Surface Temperature
    this.fileMap.set('sst_SSP1-2.6_near-term', 
      `${baseDir}/map_sst_ssp126.tif`);
    this.fileMap.set('sst_SSP5-8.5_near-term', 
      `${baseDir}/map_sst_ssp585.tif`);
    
    // Mean Temperature
    this.fileMap.set('temp_SSP1-2.6_near-term', 
      `${baseDir}/map_temp_ssp126.tif`);
    this.fileMap.set('temp_SSP5-8.5_near-term', 
      `${baseDir}/map_temp_ssp585.tif`);
    
    // Sea Level Rise
    this.fileMap.set('slr_SSP1-2.6_near-term', 
      `${baseDir}/map_slr_ssp126.tif`);
    this.fileMap.set('slr_SSP5-8.5_near-term', 
      `${baseDir}/map_slr_ssp585.tif`);
    
    // Ocean pH
    this.fileMap.set('ph_SSP1-2.6_near-term', 
      `${baseDir}/map_ph_ssp126.tif`);
    this.fileMap.set('ph_SSP5-8.5_near-term', 
      `${baseDir}/map_ph_ssp585.tif`);
  }

  async loadGeoTIFF(variable, scenario, period = 'near-term') {
    const key = `${variable}_${scenario}_${period}`;
    
    // Check cache
    if (this.dataCache.has(key)) {
      return this.dataCache.get(key);
    }

    try {
      const filePath = this.fileMap.get(key);
      if (!filePath) {
        throw new Error(`No file found for ${key}`);
      }

      // Load TIFF file
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const tiff = await fromArrayBuffer(arrayBuffer);

      // Get first image
      const image = await tiff.getImage();
      
      // Extract data
      const data = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();

      // Handle different raster configurations
      let rasterData;
      if (Array.isArray(data) && data.length > 0) {
        rasterData = Array.from(data[0]); // Get first band
      } else if (data instanceof Uint8Array || data instanceof Float32Array) {
        rasterData = Array.from(data);
      } else {
        throw new Error('Unsupported raster data format');
      }

      const result = {
        data: rasterData,
        width,
        height,
        metadata: {
          variable,
          scenario,
          period,
          bounds: {
            west: image.getBoundingBox()[0],
            south: image.getBoundingBox()[1],
            east: image.getBoundingBox()[2],
            north: image.getBoundingBox()[3],
          },
        },
      };

      // Cache result
      this.dataCache.set(key, result);
      return result;
    } catch (error) {
      console.error(`Error loading GeoTIFF for ${key}:`, error);
      throw error;
    }
  }

  clearCache() {
    this.dataCache.clear();
  }

  async loadAllData(variables, scenarios) {
    const promises = [];
    for (const variable of variables) {
      for (const scenario of scenarios) {
        promises.push(this.loadGeoTIFF(variable, scenario));
      }
    }
    return Promise.all(promises);
  }

  // Utility to downsample data for faster processing
  downsampleData(data, width, height, factor = 2) {
    const newWidth = Math.floor(width / factor);
    const newHeight = Math.floor(height / factor);
    const downsampled = [];

    for (let i = 0; i < newHeight; i++) {
      for (let j = 0; j < newWidth; j++) {
        const idx = (i * factor) * width + (j * factor);
        downsampled.push(data[idx]);
      }
    }

    return {
      data: downsampled,
      width: newWidth,
      height: newHeight,
    };
  }

  // Normalize data to 0-1 range
  normalizeData(data) {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    return data.map(v => (v - min) / range);
  }

  // Get statistics
  getStats(data) {
    const filtered = data.filter(v => !isNaN(v) && isFinite(v));
    if (filtered.length === 0) return { min: 0, max: 0, mean: 0, std: 0 };

    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    
    const variance = filtered.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / filtered.length;
    const std = Math.sqrt(variance);

    return { min, max, mean, std };
  }
}