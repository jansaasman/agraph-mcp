#!/usr/bin/env node

/**
 * AllegroGraph Query Browser Web Server
 *
 * A simple web interface to browse stored queries and visualizations
 * from the AllegroGraph query library.
 *
 * Usage: node dist/web-server.js
 * Then open: http://localhost:3000
 */

import express from 'express';
import axios, { AxiosInstance } from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Load configuration from web-config.json in project root
let config: {
  host: string;
  port: string;
  username: string;
  password: string;
  catalog: string;
  protocol: string;
  webPort?: number;
};

try {
  const configPath = path.join(path.dirname(__dirname), 'web-config.json');
  const configFile = fs.readFileSync(configPath, 'utf-8');
  config = JSON.parse(configFile);
  console.log(`✓ Loaded configuration from ${configPath}`);
} catch (error) {
  console.warn('⚠ Could not load web-config.json, using defaults');
  config = {
    host: 'localhost',
    port: '10035',
    username: 'test',
    password: 'xyzzy',
    catalog: '/',
    protocol: 'http',
  };
}

const PORT = config.webPort || 3000;

// Create axios instance for query-library
const queryLibraryClient: AxiosInstance = axios.create({
  baseURL: `${config.protocol}://${config.host}:${config.port}`,
  auth: {
    username: config.username,
    password: config.password,
  },
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  timeout: 10000,
  validateStatus: function (status) {
    // Don't throw on any status code - we'll handle errors ourselves
    return status < 600;
  },
  transformResponse: [(data) => {
    // Don't auto-parse JSON - we'll handle it ourselves to deal with HTML error pages
    if (typeof data === 'string') {
      const trimmed = data.trim();
      // Check if it's HTML (common error response from AllegroGraph)
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        return data; // Return as-is, we'll handle it in our code
      }
      // Try to parse as JSON
      try {
        return JSON.parse(data);
      } catch (e) {
        // If parse fails, return the raw string with error indicator
        console.warn('Failed to parse response as JSON:', (e as Error).message);
        return { __raw: data, __parseError: (e as Error).message };
      }
    }
    return data;
  }],
});

// Add response interceptor to handle HTML error pages
queryLibraryClient.interceptors.response.use(
  response => response,
  error => {
    if (error.response && typeof error.response.data === 'string' && error.response.data.startsWith('<!DOCTYPE')) {
      // HTML error page - extract meaningful error
      const match = error.response.data.match(/<title>(.*?)<\/title>/i);
      const title = match ? match[1] : 'Unknown error';
      error.message = `AllegroGraph error (${error.response.status}): ${title}`;
    }
    return Promise.reject(error);
  }
);

// Serve static files from public directory
const publicPath = path.join(path.dirname(__dirname), 'public');
app.use(express.static(publicPath));

// API: Get all repositories
app.get('/api/repositories', async (req, res) => {
  try {
    // Construct URL based on catalog (root catalog uses /repositories, named catalog uses /catalogs/{name}/repositories)
    const repoListUrl = config.catalog === '/'
      ? `${config.protocol}://${config.host}:${config.port}/repositories`
      : `${config.protocol}://${config.host}:${config.port}/catalogs/${config.catalog}/repositories`;

    const response = await axios.get(repoListUrl, {
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: { Accept: 'application/json' },
    });

    // Filter to get repository names
    const repos = response.data
      .filter((repo: any) => repo.id !== 'query-library')
      .map((repo: any) => ({
        id: repo.id,
        title: repo.title || repo.id,
      }));

    res.json(repos);
  } catch (error: any) {
    console.error('Error fetching repositories:', error.message);
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

// API: Get all queries for a repository
app.get('/api/repositories/:repo/queries', async (req, res) => {
  try {
    const { repo } = req.params;

    const sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?queryUri ?title ?description ?sparql ?created WHERE {
        ?queryUri a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository "${repo}" .
        OPTIONAL { ?queryUri dc:created ?created }
      }
      ORDER BY DESC(?created)
    `;

    // Construct query-library URL based on catalog
    const queryLibUrl = config.catalog === '/'
      ? `${config.protocol}://${config.host}:${config.port}/repositories/query-library`
      : `${config.protocol}://${config.host}:${config.port}/catalogs/${config.catalog}/repositories/query-library`;

    const response = await queryLibraryClient.get(queryLibUrl, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    // Check if response is OK
    if (response.status !== 200) {
      throw new Error(`Query failed with status ${response.status}: ${response.statusText}`);
    }

    // Check if we got HTML instead of JSON (common with auth/permission errors)
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE')) {
      const match = response.data.match(/<title>(.*?)<\/title>/i);
      const title = match ? match[1] : 'Unknown error';
      throw new Error(`AllegroGraph returned HTML error page: ${title}`);
    }

    // Check if response has expected structure
    if (!response.data || !response.data.results || !response.data.results.bindings) {
      throw new Error(`Unexpected response format: ${JSON.stringify(response.data).substring(0, 200)}`);
    }

    const results = response.data.results.bindings.map((r: any) => ({
      queryUri: r.queryUri.value,
      title: r.title.value,
      description: r.description.value,
      sparql: r.sparql.value,
      created: r.created?.value,
    }));

    res.json(results);
  } catch (error: any) {
    console.error('Error fetching queries:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    res.status(500).json({ error: 'Failed to fetch queries', details: error.message });
  }
});

// API: Get query details
app.get('/api/queries/:queryUri', async (req, res) => {
  try {
    const queryUri = decodeURIComponent(req.params.queryUri);

    const sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?title ?description ?sparql ?repo ?created WHERE {
        <${queryUri}> a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository ?repo .
        OPTIONAL { <${queryUri}> dc:created ?created }
      }
    `;

    // Construct query-library URL based on catalog
    const queryLibUrl = config.catalog === '/'
      ? `${config.protocol}://${config.host}:${config.port}/repositories/query-library`
      : `${config.protocol}://${config.host}:${config.port}/catalogs/${config.catalog}/repositories/query-library`;

    const response = await queryLibraryClient.get(queryLibUrl, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return res.status(404).json({ error: 'Query not found' });
    }

    const query = {
      queryUri,
      title: results[0].title.value,
      description: results[0].description.value,
      sparql: results[0].sparql.value,
      repository: results[0].repo.value,
      created: results[0].created?.value,
    };

    res.json(query);
  } catch (error: any) {
    console.error('Error fetching query details:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    res.status(500).json({ error: 'Failed to fetch query details', details: error.message });
  }
});

// API: Get visualizations for a query
app.get('/api/queries/:queryUri/visualizations', async (req, res) => {
  try {
    const queryUri = decodeURIComponent(req.params.queryUri);
    console.log('=== Fetching visualizations for query:', queryUri);

    const sparqlQuery = `
      PREFIX viz: <http://franz.com/ns/visualization#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?vizUri ?type ?config ?description ?summary ?created WHERE {
        ?vizUri a viz:Visualization ;
               viz:forQuery <${queryUri}> ;
               viz:type ?type ;
               viz:config ?config ;
               dc:description ?description .
        OPTIONAL { ?vizUri dc:created ?created }
        OPTIONAL { ?vizUri viz:summary ?summary }
      }
      ORDER BY DESC(?created)
    `;

    // Construct query-library URL based on catalog
    const queryLibUrl = config.catalog === '/'
      ? `${config.protocol}://${config.host}:${config.port}/repositories/query-library`
      : `${config.protocol}://${config.host}:${config.port}/catalogs/${config.catalog}/repositories/query-library`;

    console.log('Query URL:', queryLibUrl);
    console.log('SPARQL Query:', sparqlQuery.substring(0, 200) + '...');

    const response = await queryLibraryClient.get(queryLibUrl, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    console.log('Response status:', response.status);
    console.log('Response data type:', typeof response.data);
    console.log('Response data preview:',
      typeof response.data === 'string'
        ? response.data.substring(0, 300)
        : JSON.stringify(response.data).substring(0, 300)
    );

    // Check if response is OK
    if (response.status !== 200) {
      throw new Error(`Query failed with status ${response.status}: ${response.statusText}`);
    }

    // Check if we got HTML instead of JSON (common with auth/permission errors)
    if (typeof response.data === 'string' && response.data.trim().startsWith('<!DOCTYPE')) {
      const match = response.data.match(/<title>(.*?)<\/title>/i);
      const title = match ? match[1] : 'Unknown error';
      throw new Error(`AllegroGraph returned HTML error page: ${title}`);
    }

    // Check if response has expected structure
    if (!response.data || !response.data.results || !response.data.results.bindings) {
      throw new Error(`Unexpected response format: ${JSON.stringify(response.data).substring(0, 200)}`);
    }

    const results = response.data.results.bindings.map((r: any) => {
      let config;
      try {
        config = JSON.parse(r.config.value);
      } catch (e) {
        // Config is not valid JSON (might be HTML or other format)
        console.warn(`Visualization ${r.vizUri.value} has invalid JSON config, storing as raw string`);
        config = { __raw: r.config.value, __error: 'Not valid JSON' };
      }

      return {
        vizUri: r.vizUri.value,
        type: r.type.value,
        config: config,
        description: r.description.value,
        summary: r.summary?.value,
        created: r.created?.value,
      };
    });

    res.json(results);
  } catch (error: any) {
    console.error('Error fetching visualizations:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data (first 500 chars):',
        typeof error.response.data === 'string'
          ? error.response.data.substring(0, 500)
          : JSON.stringify(error.response.data).substring(0, 500)
      );
    }
    res.status(500).json({ error: 'Failed to fetch visualizations', details: error.message });
  }
});

// API: Render visualization as HTML
app.get('/api/visualizations/:vizUri/render', async (req, res) => {
  try {
    const vizUri = decodeURIComponent(req.params.vizUri);

    const sparqlQuery = `
      PREFIX viz: <http://franz.com/ns/visualization#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?type ?config ?description WHERE {
        <${vizUri}> a viz:Visualization ;
               viz:type ?type ;
               viz:config ?config ;
               dc:description ?description .
      }
    `;

    // Construct query-library URL based on catalog
    const queryLibUrl = config.catalog === '/'
      ? `${config.protocol}://${config.host}:${config.port}/repositories/query-library`
      : `${config.protocol}://${config.host}:${config.port}/catalogs/${config.catalog}/repositories/query-library`;

    const response = await queryLibraryClient.get(queryLibUrl, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return res.status(404).send('Visualization not found');
    }

    const viz = results[0];
    const type = viz.type.value;
    const configValue = viz.config.value;
    const description = viz.description.value;

    console.log('=== Rendering Visualization ===');
    console.log('Type:', type);
    console.log('Config length:', configValue.length);
    console.log('Config start:', configValue.substring(0, 200));

    // Check if config is already HTML (legacy format, multi-chart dashboards, or D3 network graphs)
    const trimmedConfig = configValue.trim();
    const looksLikeHTML = trimmedConfig.startsWith('<!DOCTYPE') ||
                          trimmedConfig.startsWith('<html') ||
                          trimmedConfig.startsWith('<HTML') ||
                          trimmedConfig.match(/^<!--/) ||  // HTML comment
                          trimmedConfig.includes('</html>') ||  // Has closing html tag
                          trimmedConfig.includes('</body>') ||  // Has closing body tag
                          (trimmedConfig.startsWith('<') && (
                            trimmedConfig.includes('<canvas') ||  // Multi-chart dashboard
                            trimmedConfig.includes('<svg') ||     // D3 visualizations
                            trimmedConfig.includes('d3.select') ||   // D3 code
                            trimmedConfig.includes('<script')    // Has script tags
                          ));

    console.log('Looks like HTML?', looksLikeHTML);

    if (looksLikeHTML) {
      console.log('✓ Config is HTML (rendering directly)');

      // Check if HTML appears complete
      const hasClosingHtml = configValue.includes('</html>');
      const hasClosingBody = configValue.includes('</body>');
      console.log('Has closing </html> tag?', hasClosingHtml);
      console.log('Has closing </body> tag?', hasClosingBody);

      if (!hasClosingHtml || !hasClosingBody) {
        console.log('⚠️ WARNING: HTML appears incomplete/truncated!');
      }

      // Fix font size if it's too large
      let htmlContent = configValue;
      if (htmlContent.includes('font-size: 28px') || htmlContent.includes('font-size:28px')) {
        htmlContent = htmlContent.replace(/font-size:\s*28px/g, 'font-size: 16px');
      }
      if (htmlContent.includes('font-size: 24px') || htmlContent.includes('font-size:24px')) {
        htmlContent = htmlContent.replace(/font-size:\s*24px/g, 'font-size: 14px');
      }

      console.log('HTML config last 200 chars:', configValue.substring(configValue.length - 200));

      return res.send(htmlContent);
    }

    // Parse config as JSON for Chart.js
    let vizConfig;
    try {
      console.log('Attempting to parse config as JSON...');
      vizConfig = JSON.parse(configValue);
      console.log('✓ Successfully parsed as JSON');
    } catch (e) {
      console.log('✗ JSON parse failed:', (e as Error).message);
      // If it's not valid JSON and not detected as HTML, but contains HTML-like content, try sending as-is
      if (configValue.includes('<') && configValue.includes('>')) {
        console.log('Config contains HTML tags but wasn\'t detected initially, sending as HTML');
        return res.send(configValue);
      }
      console.log('✗ Returning 400 error - not valid JSON or HTML');
      return res.status(400).send(`Invalid visualization config: not valid JSON or HTML. Error: ${(e as Error).message}`);
    }

    // Generate HTML based on type
    let html = '';

    if (['bar_chart', 'line_chart', 'pie_chart', 'scatter_plot', 'bar', 'line', 'pie', 'scatter'].includes(type)) {
      // Chart.js visualization - force responsive sizing
      html = `<!DOCTYPE html>
<html>
<head>
    <title>${description}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-width: 1200px;
            margin: 0 auto;
        }
        .chart-container {
            position: relative;
            height: 500px;
            width: 100%;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="chart-container">
            <canvas id="chart"></canvas>
        </div>
    </div>
    <script>
        const ctx = document.getElementById('chart').getContext('2d');

        // Parse config and convert function strings to actual functions
        const configStr = ${JSON.stringify(JSON.stringify(vizConfig))};
        const config = JSON.parse(configStr, function(key, value) {
            // Check if value is a string that looks like a function
            if (typeof value === 'string' && value.startsWith('function(')) {
                try {
                    // Use eval to convert string to function (safe here since we control the source)
                    return eval('(' + value + ')');
                } catch (e) {
                    console.warn('Failed to parse function:', value);
                    return value;
                }
            }
            return value;
        });

        // Debug logging
        console.log('Chart type:', config.type);
        console.log('Number of datasets:', config.data?.datasets?.length);
        if (config.data?.datasets?.[0]) {
            console.log('First dataset:', config.data.datasets[0].label);
            console.log('First dataset data points:', config.data.datasets[0].data?.length || 0);
            if (config.data.datasets[0].data?.length > 0) {
                console.log('Sample data point:', config.data.datasets[0].data[0]);
            }
        }
        console.log('X-axis config:', config.options?.scales?.x);
        console.log('Y-axis config:', config.options?.scales?.y);

        // Force responsive settings
        if (!config.options) config.options = {};
        config.options.responsive = true;
        config.options.maintainAspectRatio = false;

        new Chart(ctx, config);
    </script>
</body>
</html>`;
    } else if (type === 'network_graph' || (type === 'other' && vizConfig.type === 'd3-force-network')) {
      // D3 force-directed network graph
      console.log('Rendering D3 network graph, config keys:', Object.keys(vizConfig));

      // Safety check: if vizConfig is a string, it's HTML
      if (typeof vizConfig === 'string') {
        console.log('Network graph config is a string (HTML), sending directly');
        if (vizConfig.includes('<')) {
          return res.send(vizConfig);
        }
        return res.status(400).send('Invalid network graph configuration: config is string but not HTML');
      }

      // Check if nodes/links exist - log warning but continue
      if (!vizConfig.nodes || !vizConfig.links) {
        console.log('⚠️ WARNING: Config missing nodes or links arrays');
        console.log('Full config:', JSON.stringify(vizConfig, null, 2).substring(0, 500));
      }

      html = `<!DOCTYPE html>
<html>
<head>
    <title>${description}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            margin-top: 0;
            font-size: 16px;
            color: #333;
        }
        .error {
            color: red;
            padding: 20px;
            background: #fee;
            border-radius: 4px;
            margin: 20px 0;
        }
        #network {
            width: 100%;
            height: 600px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .tooltip {
            position: absolute;
            padding: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 4px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s;
            font-size: 12px;
            max-width: 200px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${description}</h1>
        <div id="error"></div>
        <div id="network"></div>
    </div>
    <div class="tooltip" id="tooltip"></div>
    <script>
        try {
            const config = ${JSON.stringify(vizConfig)};
            console.log('Network graph config:', config);

            // Validate config
            if (!config.nodes || !Array.isArray(config.nodes)) {
                throw new Error('Invalid config: nodes array is missing or invalid');
            }
            if (!config.links || !Array.isArray(config.links)) {
                throw new Error('Invalid config: links array is missing or invalid');
            }

            console.log('Nodes:', config.nodes.length, 'Links:', config.links.length);

            // Extract configuration
            const width = window.innerWidth - 80;
            const height = 600;

            // Create SVG
            const svg = d3.select("#network")
                .append("svg")
                .attr("width", width)
                .attr("height", height);

            // Create tooltip
            const tooltip = d3.select("#tooltip");

            // Create force simulation
            const simulation = d3.forceSimulation(config.nodes)
                .force("link", d3.forceLink(config.links).id(d => d.id))
                .force("charge", d3.forceManyBody().strength(-200))
                .force("center", d3.forceCenter(width / 2, height / 2));

            // Create links
            const link = svg.append("g")
                .selectAll("line")
                .data(config.links)
                .enter().append("line")
                .attr("stroke", "#999")
                .attr("stroke-opacity", 0.6)
                .attr("stroke-width", d => Math.sqrt(d.value || 1));

            // Create nodes
            const node = svg.append("g")
                .selectAll("circle")
                .data(config.nodes)
                .enter().append("circle")
                .attr("r", d => d.size || 5)
                .attr("fill", d => d.color || "#69b3a2")
                .call(d3.drag()
                    .on("start", dragstarted)
                    .on("drag", dragged)
                    .on("end", dragended));

            // Add labels
            const labels = svg.append("g")
                .selectAll("text")
                .data(config.nodes)
                .enter().append("text")
                .text(d => d.label || d.id)
                .attr("font-size", 10)
                .attr("dx", 12)
                .attr("dy", 4);

            // Add hover tooltips
            node.on("mouseover", function(event, d) {
                    tooltip.style("opacity", 1)
                        .html(\`<strong>\${d.label || d.id}</strong><br/>\${d.description || ''}\`)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", function() {
                    tooltip.style("opacity", 0);
                });

            // Update positions on simulation tick
            simulation.on("tick", () => {
                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                node
                    .attr("cx", d => d.x)
                    .attr("cy", d => d.y);

                labels
                    .attr("x", d => d.x)
                    .attr("y", d => d.y);
            });

            // Drag functions
            function dragstarted(event, d) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x;
                d.fy = d.y;
            }

            function dragged(event, d) {
                d.fx = event.x;
                d.fy = event.y;
            }

            function dragended(event, d) {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null;
                d.fy = null;
            }

            console.log('Network graph initialized successfully');
        } catch (error) {
            console.error('Error rendering network graph:', error);
            document.getElementById('error').innerHTML = '<div class="error"><strong>Error:</strong> ' + error.message + '</div>';
        }
    </script>
</body>
</html>`;
    } else if (type === 'other' && vizConfig.type === 'multi-chart') {
      // Multi-chart dashboard
      const charts = vizConfig.charts || [];

      // Generate canvas elements for each chart
      const canvasElements = charts.map((chart: any) =>
        `<div class="chart-container">
          <canvas id="${chart.chartId}"></canvas>
        </div>`
      ).join('\n        ');

      // Generate Chart.js initialization code for each chart
      const chartScripts = charts.map((chart: any) => {
        const chartConfigJson = JSON.stringify(chart);
        return `
        {
          const ctx = document.getElementById('${chart.chartId}').getContext('2d');
          const chartConfig = ${chartConfigJson};

          // Parse and convert function strings
          const parsedConfig = JSON.parse(JSON.stringify(chartConfig), function(key, value) {
            if (typeof value === 'string' && value.startsWith('function(')) {
              try {
                return eval('(' + value + ')');
              } catch (e) {
                console.warn('Failed to parse function:', value);
                return value;
              }
            }
            return value;
          });

          if (!parsedConfig.options) parsedConfig.options = {};
          parsedConfig.options.responsive = true;
          parsedConfig.options.maintainAspectRatio = false;

          new Chart(ctx, parsedConfig);
        }`;
      }).join('\n');

      html = `<!DOCTYPE html>
<html>
<head>
    <title>${description}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-width: 1400px;
            margin: 0 auto;
        }
        .chart-container {
            position: relative;
            height: 400px;
            width: 100%;
            margin-bottom: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        ${canvasElements}
    </div>
    <script>
        ${chartScripts}
    </script>
</body>
</html>`;
    } else {
      // Other types
      html = `<!DOCTYPE html>
<html>
<head>
    <title>${description}</title>
</head>
<body>
    <h1>${description}</h1>
    <p>Visualization type: ${type}</p>
    <pre>${JSON.stringify(vizConfig, null, 2)}</pre>
</body>
</html>`;
    }

    res.send(html);
  } catch (error: any) {
    console.error('Error rendering visualization:', error.message);
    res.status(500).send('Failed to render visualization');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 AllegroGraph Query Browser running at http://localhost:${PORT}`);
  console.log(`\nConfiguration:`);
  console.log(`  AllegroGraph: ${config.protocol}://${config.host}:${config.port}`);
  console.log(`  Catalog: ${config.catalog}`);
  console.log(`\nOpen your browser to start browsing queries and visualizations!\n`);
});
