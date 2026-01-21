import { OceanViz3D } from './visualizations/OceanViz3D.js';
import { D3Charts } from './visualizations/D3Charts.js';
import { DataManager } from './utils/DataManager.js';

class OceanDashboard {
  constructor() {
    this.dataManager = new DataManager();
    this.charts = new D3Charts();
    this.viz3d = null;
    this.currentData = null;
    this.allData = new Map();
    

    this.state = {
      scenario: 'SSP1-2.6',
      variable: 'sst',
      period: 'near-term', // fixed
    };


    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadInitialData();
    this.setupViz3D();
    this.updateAllVisualizations();
    this.setupWindowResize();
  }

  showTooltip(info, x, y) {
    if (!Number.isFinite(info.value)) {
      return;
    }
  
    // Display in the panel instead of on the globe
    const pointInfoContainer = document.getElementById('pointInfoContainer');
    if (!pointInfoContainer) return;
  
    pointInfoContainer.innerHTML = `
      <h6 class="alert-heading">Clicked Point</h6>
      <p><strong>${this.state.variable.toUpperCase()}</strong></p>
      <p>Value: <code>${info.value.toFixed(3)}</code></p>
      <p>Latitude: <code>${info.lat.toFixed(2)}°</code></p>
      <p>Longitude: <code>${info.lon.toFixed(2)}°</code></p>
    `;
  }
  
  
  setupEventListeners() {
    document.getElementById('scenarioSelect').addEventListener('change', (e) => {
      this.state.scenario = e.target.value;
      this.updateAllVisualizations();
    });

    document.getElementById('variableSelect').addEventListener('change', (e) => {
      this.state.variable = e.target.value;
      this.updateAllVisualizations();
    });

    
    document.getElementById('colormapSelect').addEventListener('change', (e) => {
      this.state.colormap = e.target.value;
      if (this.viz3d && this.currentData) {
        this.viz3d.updateSurface(
          this.currentData.data,
          this.currentData.width,
          this.currentData.height,
          this.currentData.metadata.bounds, // from GeoTIFF
          this.state.colormap
        );
      }
    });

    document.getElementById('opacitySlider').addEventListener('input', (e) => {
      const opacity = parseFloat(e.target.value);
      this.state.opacity = opacity;
      document.getElementById('opacityValue').textContent = opacity.toFixed(1);
      if (this.viz3d) {
        this.viz3d.setOpacity(opacity);
      }
    });

  }

  async loadInitialData() {
    try {
      const loadingMsg = document.createElement('div');
      loadingMsg.className = 'alert alert-info';
      loadingMsg.textContent = 'Loading ocean data...';
      document.body.insertBefore(loadingMsg, document.body.firstChild);

      // Load primary data
      const key = `${this.state.variable}_${this.state.scenario}`;
      const data = await this.dataManager.loadGeoTIFF(
        this.state.variable,
        this.state.scenario,
        this.state.period
      );
      
      this.allData.set(key, data);
      this.currentData = data;

      // Pre-load other common combinations for smooth switching
      const variables = ['sst', 'temp'];
      const scenarios = ['SSP1-2.6', 'SSP5-8.5'];
      
      for (const v of variables) {
        for (const s of scenarios) {
          const cacheKey = `${v}_${s}`;
          if (!this.allData.has(cacheKey)) {
            try {
              const preData = await this.dataManager.loadGeoTIFF(v, s, this.state.period);
              this.allData.set(cacheKey, preData);
            } catch (err) {
              console.warn(`Could not preload ${cacheKey}:`, err.message);
            }
          }
        }
      }

      loadingMsg.remove();
    } catch (error) {
      console.error('Failed to load initial data:', error);
      const errorMsg = document.createElement('div');
      errorMsg.className = 'alert alert-danger';
      errorMsg.textContent = `Error loading data: ${error.message}. Make sure TIFF files are in the /data directory.`;
      document.body.insertBefore(errorMsg, document.body.firstChild);
    }
  }

  setupViz3D() {
    const canvas = document.getElementById('canvas3d');
    const rect = canvas.parentElement.getBoundingClientRect();
    
    this.viz3d = new OceanViz3D(canvas, rect.width, rect.height);
  
    // CONNECT 3D PICKING → DASHBOARD
    this.viz3d.onPointSelected = (info, x, y) => {
      this.showTooltip(info, x, y);
    };
    
    if (this.currentData) {
      this.viz3d.updateSurface(
        this.currentData.data,
        this.currentData.width,
        this.currentData.height,
        this.currentData.metadata.bounds,
        this.state.colormap
      );
      
      this.viz3d.setOpacity(this.state.opacity);
    }

    this.viz3d.onPointSelected = (info, x, y) => {
      this.showTooltip(info, x, y);
    };
  }
  

  async updateAllVisualizations() {
    try {
      // Fetch current data
      const key = `${this.state.variable}_${this.state.scenario}`;
      
      if (this.allData.has(key)) {
        this.currentData = this.allData.get(key);
      } else {
        this.currentData = await this.dataManager.loadGeoTIFF(
          this.state.variable,
          this.state.scenario,
          this.state.period
        );
        this.allData.set(key, this.currentData);
      }

      // Update 3D visualization
      if (this.viz3d && this.currentData) {
        this.viz3d.updateSurface(
          this.currentData.data,
          this.currentData.width,
          this.currentData.height,
          this.currentData.metadata.bounds, // from GeoTIFF
          this.state.colormap
        );
      }

      // Update statistics
      const stats = this.dataManager.getStats(this.currentData.data);
      this.updateStatistics(stats);

      // Update 2D visualizations
      this.updateCharts(stats);
    } catch (error) {
      console.error('Error updating visualizations:', error);
    }
  }

  updateStatistics(stats) {
    document.getElementById('minStat').textContent = `Min: ${stats.min.toFixed(2)}`;
    document.getElementById('maxStat').textContent = `Max: ${stats.max.toFixed(2)}`;
    document.getElementById('meanStat').textContent = `Mean: ${stats.mean.toFixed(2)}`;
  }

  updateCharts(stats) {
    // Histogram of current data
    this.charts.drawHistogram(
      '#histogram',
      this.currentData.data,
      stats,
      this.state.colormap
    );

    // Scenario comparison
    const comparisonDatasets = [];
    
    // Get SSP1-2.6 data
    const key126 = `${this.state.variable}_SSP1-2.6`;
    if (this.allData.has(key126)) {
      const data126 = this.allData.get(key126);
      const stats126 = this.dataManager.getStats(data126.data);
      comparisonDatasets.push({
        label: 'SSP1-2.6',
        stats: stats126,
        color: '#2ca02c',
      });
    }

    // Get SSP5-8.5 data
    const key585 = `${this.state.variable}_SSP5-8.5`;
    if (this.allData.has(key585)) {
      const data585 = this.allData.get(key585);
      const stats585 = this.dataManager.getStats(data585.data);
      comparisonDatasets.push({
        label: 'SSP5-8.5',
        stats: stats585,
        color: '#d62728',
      });
    }

    if (comparisonDatasets.length > 0) {
      this.charts.drawScenarioComparison('#comparison', comparisonDatasets);
    }
  }

  setupWindowResize() {
    window.addEventListener('resize', () => {

      const canvas = document.getElementById('canvas3d');
      const rect = canvas.parentElement.getBoundingClientRect();
      
      if (this.viz3d) {
        this.viz3d.onWindowResize(rect.width, rect.height);
      }
      
      // Redraw charts
      if (this.currentData) {
        const stats = this.dataManager.getStats(this.currentData.data);
        this.updateCharts(stats);
      }
    });
  }
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new OceanDashboard();
  });
} else {
  new OceanDashboard();
}