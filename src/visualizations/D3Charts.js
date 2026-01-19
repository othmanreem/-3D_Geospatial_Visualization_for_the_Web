import * as d3 from 'd3';
import chroma from 'chroma-js';

export class D3Charts {
  constructor() {
    this.margin = { top: 10, right: 15, bottom: 25, left: 50 };
  }

  drawHistogram(svgSelector, data, stats, colormap = 'viridis') {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();

    const container = document.querySelector(svgSelector);
    const width = container.clientWidth - this.margin.left - this.margin.right;
    const height = container.clientHeight - this.margin.top - this.margin.bottom;

    if (width <= 0 || height <= 0) return;

    // Create SVG
    const g = svg
      .attr('width', width + this.margin.left + this.margin.right)
      .attr('height', height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Filter valid data
    const filtered = data.filter(v => !isNaN(v) && isFinite(v));
    if (filtered.length === 0) return;

    // Create histogram bins
    const histogram = d3.histogram()
      .domain([stats.min, stats.max])
      .thresholds(30);
    const bins = histogram(filtered);

    // Scales
    const xScale = d3.scaleLinear()
      .domain([stats.min, stats.max])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(bins, d => d.length)])
      .range([height, 0]);

    // Color scale
    const colorScale = (value) => {
      const normalized = (value - stats.min) / (stats.max - stats.min);
      return chroma.scale(colormap)(normalized).hex();
    };

    // Draw bars
    g.selectAll('.bar')
      .data(bins)
      .join('rect')
      .attr('class', 'bar')
      .attr('x', d => xScale(d.x0))
      .attr('y', d => yScale(d.length))
      .attr('width', d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
      .attr('height', d => height - yScale(d.length))
      .attr('fill', d => colorScale((d.x0 + d.x1) / 2))
      .attr('opacity', 0.8)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('opacity', 1);
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.8);
      });

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).ticks(5))
      .append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('fill', 'black')
      .style('font-size', '11px')
      .text('Value');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -35)
      .attr('fill', 'black')
      .style('font-size', '11px')
      .attr('text-anchor', 'middle')
      .text('Count');

    // Statistics line
    g.append('line')
      .attr('x1', xScale(stats.mean))
      .attr('y1', 0)
      .attr('x2', xScale(stats.mean))
      .attr('y2', height)
      .attr('stroke', 'red')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .attr('opacity', 0.7);

    // Mean label
    g.append('text')
    .attr('x', xScale(stats.mean))
    .attr('y', Math.max(10, yScale(stats.mean) - 8))
    .attr('fill', 'red')
    .style('font-size', '10px')
    .attr('text-anchor', 'middle')
    .text(`μ=${stats.mean.toFixed(2)}`);
  }

  drawComparison(svgSelector, datasets) {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();

    const container = document.querySelector(svgSelector);
    const width = container.clientWidth - this.margin.left - this.margin.right;
    const height = container.clientHeight - this.margin.top - this.margin.bottom;

    if (width <= 0 || height <= 0) return;

    const g = svg
      .attr('width', width + this.margin.left + this.margin.right)
      .attr('height', height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    // Prepare comparison data (min, max, mean for each scenario)
    const comparisonData = datasets.map(d => ({
      label: d.label,
      min: d.stats.min,
      max: d.stats.max,
      mean: d.stats.mean,
    }));

    // Scales
    const xScale = d3.scaleBand()
      .domain(comparisonData.map(d => d.label))
      .range([0, width])
      .padding(0.2);

    const allValues = comparisonData.flatMap(d => [d.min, d.max, d.mean]);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);

    const yScale = d3.scaleLinear()
      .domain([minVal, maxVal])
      .range([height, 0]);

    // Draw mean bars
    g.selectAll('.mean-bar')
      .data(comparisonData)
      .join('rect')
      .attr('class', 'mean-bar')
      .attr('x', d => xScale(d.label))
      .attr('y', d => yScale(d.mean))
      .attr('width', xScale.bandwidth())
      .attr('height', d => height - yScale(d.mean))
      .attr('fill', '#ff7f0e')
      .attr('opacity', 0.8);

    // Draw min/max range
    g.selectAll('.range-line')
      .data(comparisonData)
      .join('line')
      .attr('class', 'range-line')
      .attr('x1', d => xScale(d.label) + xScale.bandwidth() / 2)
      .attr('y1', d => yScale(d.max))
      .attr('x2', d => xScale(d.label) + xScale.bandwidth() / 2)
      .attr('y2', d => yScale(d.min))
      .attr('stroke', '#1f77b4')
      .attr('stroke-width', 3);

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .style('font-size', '10px');

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5))
      .style('font-size', '10px');

    // Legend
    const legendData = [
      { label: 'Mean', color: '#ff7f0e' },
      { label: 'Min-Max', color: '#1f77b4' },
    ];

    const legend = g.selectAll('.legend')
      .data(legendData)
      .join('g')
      .attr('class', 'legend')
      .attr('transform', (d, i) => `translate(${width - 100}, ${i * 20})`);

    legend.append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', d => d.color);

    legend.append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('font-size', '11px')
      .text(d => d.label);
  }

  drawScenarioComparison(svgSelector, scenarios) {
    const svg = d3.select(svgSelector);
    svg.selectAll('*').remove();

    const container = document.querySelector(svgSelector);
    const width = container.clientWidth - this.margin.left - this.margin.right;
    const height = container.clientHeight - this.margin.top - this.margin.bottom;

    if (width <= 0 || height <= 0) return;

    const g = svg
      .attr('width', width + this.margin.left + this.margin.right)
      .attr('height', height + this.margin.top + this.margin.bottom)
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    const comparisonData = scenarios.map(s => ({
      scenario: s.label,
      value: s.stats.mean,
      color: s.color || '#1f77b4',
    }));

    const xScale = d3.scaleBand()
      .domain(comparisonData.map(d => d.scenario))
      .range([0, width])
      .padding(0.3);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(comparisonData, d => d.value)])
      .range([height, 0]);

    g.selectAll('.bar')
      .data(comparisonData)
      .join('rect')
      .attr('x', d => xScale(d.scenario))
      .attr('y', d => yScale(d.value))
      .attr('width', xScale.bandwidth())
      .attr('height', d => height - yScale(d.value))
      .attr('fill', d => d.color)
      .attr('opacity', 0.8)
      .on('mouseover', function() {
        d3.select(this).attr('opacity', 1);
      })
      .on('mouseout', function() {
        d3.select(this).attr('opacity', 0.8);
      });

    // Value labels on bars
    g.selectAll('.value-label')
    .data(comparisonData)
    .join('text')
    .attr('class', 'value-label')
    .attr('x', d => xScale(d.scenario) + xScale.bandwidth() / 2)
    .attr('y', d => Math.max(12, yScale(d.value) - 6))
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .text(d => d.value.toFixed(2));
  

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale));

    g.append('g')
      .call(d3.axisLeft(yScale).ticks(5));
  }
}