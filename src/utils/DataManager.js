import { fromArrayBuffer } from 'geotiff';

export class DataManager {
  constructor() {
    this.dataCache = new Map();
    this.fileMap = new Map();
    
    // Map variable/scenario combinations to files
    // Format: "variable_scenario_period" -> file path
    this.initializeFileMap();
  }

  initializeFileMap() {
    // Base directory where TIFF files are served from
    const baseDir = '/data';
    
    // Sea Level Rise (SLR)
    this.fileMap.set('slr_SSP1-2.6_near-term', 
      `${baseDir}/1_slr_ssp126/map.tif`);
    this.fileMap.set('slr_SSP5-8.5_near-term', 
      `${baseDir}/5_slr_ssp585/map.tif`);
    
    // Sea Surface Temperature (SST)
    this.fileMap.set('sst_SSP1-2.6_near-term', 
      `${baseDir}/2_sst_ssp126/map.tif`);
    this.fileMap.set('sst_SSP5-8.5_near-term', 
      `${baseDir}/6_sst_ssp585/map.tif`);
    
    // Mean Temperature (temp)
    this.fileMap.set('temp_SSP1-2.6_near-term', 
      `${baseDir}/3_temp_ssp126/map.tif`);
    this.fileMap.set('temp_SSP5-8.5_near-term', 
      `${baseDir}/7_temp_ssp585/map.tif`);
    
    // Ocean pH (ph)
    this.fileMap.set('ph_SSP1-2.6_near-term', 
      `${baseDir}/4_ph_ssp126/map.tif`);
    this.fileMap.set('ph_SSP5-8.5_near-term', 
      `${baseDir}/8_ph_ssp585/map.tif`);
  }

  async loadGeoTIFF(variable, scenario, period = 'near-term') {
    const key = `${variable}_${scenario}_${period}`;
    
    // Check cache first
    if (this.dataCache.has(key)) {
      console.log(`Loading ${key} from cache`);
      return this.dataCache.get(key);
    }

    try {
      const filePath = this.fileMap.get(key);
      if (!filePath) {
        throw new Error(`No file mapping found for: ${key}`);
      }

      console.log(`Fetching ${key} from: ${filePath}`);

      // Fetch the TIFF file
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to load ${filePath}: ${response.statusText}`);
      }
      
      // Read as array buffer
      const arrayBuffer = await response.arrayBuffer();
      console.log(`Loaded ${filePath}, size: ${arrayBuffer.byteLength} bytes`);

      // Parse TIFF
      const tiff = await fromArrayBuffer(arrayBuffer);
      const image = await tiff.getImage();
      
      // Extract raster data
      const data = await image.readRasters();
      const width = image.getWidth();
      const height = image.getHeight();

      console.log(`Parsed TIFF: ${width}x${height} pixels`);

      // Handle different raster data formats
      let rasterData;
      if (Array.isArray(data) && data.length > 0) {
        // Multi-band TIFF - take first band
        rasterData = Array.from(data[0]);
      } else if (data instanceof Uint8Array || 
                 data instanceof Float32Array ||
                 data instanceof Float64Array) {
        // Single-band TIFF
        rasterData = Array.from(data);
      } else {
        throw new Error(`Unsupported raster data format: ${typeof data}`);
      }

      // Create result object with metadata
      const result = {
        data: rasterData,
        width,
        height,
        metadata: {
          variable,
          scenario,
          period,
          bounds: image.getBoundingBox ? {
            west: image.getBoundingBox()[0],
            south: image.getBoundingBox()[1],
            east: image.getBoundingBox()[2],
            north: image.getBoundingBox()[3],
          } : null,
        },
      };

      // Cache the result for future use
      this.dataCache.set(key, result);
      console.log(`Cached ${key}`);
      
      return result;
    } catch (error) {
      console.error(`Error loading GeoTIFF for ${key}:`, error);
      throw error;
    }
  }

  clearCache() {
    this.dataCache.clear();
    console.log('Data cache cleared');
  }

  // Utility to downsample data for faster processing
  // Useful for large rasters to speed up visualization
  downsampleData(data, width, height, factor = 2) {
    const newWidth = Math.floor(width / factor);
    const newHeight = Math.floor(height / factor);
    const downsampled = [];

    for (let i = 0; i < newHeight; i++) {
      for (let j = 0; j < newWidth; j++) {
        const idx = (i * factor) * width + (j * factor);
        if (idx < data.length) {
          downsampled.push(data[idx]);
        }
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
    const filtered = data.filter(v => !isNaN(v) && isFinite(v));
    if (filtered.length === 0) return [];
    
    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    const range = max - min || 1;
    
    return data.map(v => (v - min) / range);
  }

  // Get statistics about the data
  getStats(data) {
    // Filter out invalid values (NaN, Infinity, etc)
    const filtered = data.filter(v => !isNaN(v) && isFinite(v));
    
    if (filtered.length === 0) {
      return { min: 0, max: 0, mean: 0, std: 0, count: 0 };
    }

    // Calculate min and max
    const min = Math.min(...filtered);
    const max = Math.max(...filtered);
    
    // Calculate mean
    const sum = filtered.reduce((a, b) => a + b, 0);
    const mean = sum / filtered.length;
    
    // Calculate standard deviation
    const variance = filtered.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / filtered.length;
    const std = Math.sqrt(variance);

    return { 
      min, 
      max, 
      mean, 
      std, 
      count: filtered.length,
      range: max - min 
    };
  }
}