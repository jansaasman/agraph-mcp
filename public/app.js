// AllegroGraph Query Browser - Frontend JavaScript

let currentRepository = null;
let allQueries = [];
let filteredQueries = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadRepositories();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('repository-select').addEventListener('change', onRepositoryChange);
    document.getElementById('search-input').addEventListener('input', onSearchInput);
}

// Load all repositories
async function loadRepositories() {
    try {
        const response = await fetch('/api/repositories');
        const repos = await response.json();

        const select = document.getElementById('repository-select');
        select.innerHTML = '<option value="">Select a repository...</option>';

        repos.forEach(repo => {
            const option = document.createElement('option');
            option.value = repo.id;
            option.textContent = repo.title;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading repositories:', error);
        showError('Failed to load repositories');
    }
}

// Repository selection changed
async function onRepositoryChange(event) {
    const repoId = event.target.value;
    if (!repoId) {
        currentRepository = null;
        allQueries = [];
        filteredQueries = [];
        renderQueriesList();
        return;
    }

    currentRepository = repoId;
    await loadQueries(repoId);
}

// Load queries for a repository
async function loadQueries(repoId) {
    try {
        showLoading();
        const response = await fetch(`/api/repositories/${repoId}/queries`);
        allQueries = await response.json();
        filteredQueries = allQueries;

        renderQueriesList();
        updateQueryCount();
    } catch (error) {
        console.error('Error loading queries:', error);
        showError('Failed to load queries');
    }
}

// Search input changed
function onSearchInput(event) {
    const searchTerm = event.target.value.toLowerCase();

    if (!searchTerm) {
        filteredQueries = allQueries;
    } else {
        filteredQueries = allQueries.filter(query =>
            query.title.toLowerCase().includes(searchTerm) ||
            query.description.toLowerCase().includes(searchTerm)
        );
    }

    renderQueriesList();
    updateQueryCount();
}

// Render queries list
function renderQueriesList() {
    const container = document.getElementById('queries-list');

    if (filteredQueries.length === 0) {
        if (allQueries.length === 0) {
            container.innerHTML = '<div class="empty-message">No queries found in this repository</div>';
        } else {
            container.innerHTML = '<div class="empty-message">No queries match your search</div>';
        }
        return;
    }

    container.innerHTML = '';
    filteredQueries.forEach(query => {
        const card = createQueryCard(query);
        container.appendChild(card);
    });
}

// Create a query card element
function createQueryCard(query) {
    const card = document.createElement('div');
    card.className = 'query-card';
    card.onclick = () => loadQueryDetails(query.queryUri);

    const title = document.createElement('h3');
    title.textContent = query.title;

    const description = document.createElement('p');
    description.textContent = query.description;

    const date = document.createElement('div');
    date.className = 'query-date';
    if (query.created) {
        const dateObj = new Date(query.created);
        date.textContent = dateObj.toLocaleDateString();
    }

    card.appendChild(title);
    card.appendChild(description);
    card.appendChild(date);

    return card;
}

// Update query count display
function updateQueryCount() {
    const countEl = document.getElementById('query-count');
    if (filteredQueries.length === allQueries.length) {
        countEl.textContent = `${allQueries.length} ${allQueries.length === 1 ? 'query' : 'queries'}`;
    } else {
        countEl.textContent = `${filteredQueries.length} of ${allQueries.length} ${allQueries.length === 1 ? 'query' : 'queries'}`;
    }
}

// Load query details
async function loadQueryDetails(queryUri) {
    try {
        const encodedUri = encodeURIComponent(queryUri);

        // Load query details
        const queryResponse = await fetch(`/api/queries/${encodedUri}`);
        if (!queryResponse.ok) {
            const errorData = await queryResponse.json();
            throw new Error(errorData.details || errorData.error || 'Unknown error');
        }
        const query = await queryResponse.json();

        // Load visualizations
        const vizResponse = await fetch(`/api/queries/${encodedUri}/visualizations`);
        if (!vizResponse.ok) {
            const errorData = await vizResponse.json();
            throw new Error(errorData.details || errorData.error || 'Unknown error');
        }
        const visualizations = await vizResponse.json();

        displayQueryDetails(query, visualizations);
    } catch (error) {
        console.error('Error loading query details:', error);
        showError(`Failed to load query details: ${error.message}`);
    }
}

// Display query details
function displayQueryDetails(query, visualizations) {
    // Hide empty state, show details
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('query-details').style.display = 'block';

    // Populate fields
    document.getElementById('query-title').textContent = query.title;
    document.getElementById('query-description').textContent = query.description;
    document.getElementById('query-sparql').textContent = query.sparql;
    document.getElementById('query-repo').textContent = query.repository;

    if (query.created) {
        const dateObj = new Date(query.created);
        document.getElementById('query-created').textContent = dateObj.toLocaleString();
    } else {
        document.getElementById('query-created').textContent = '';
    }

    // Display visualizations
    const vizSection = document.getElementById('visualizations-section');
    const vizList = document.getElementById('visualizations-list');

    if (visualizations.length === 0) {
        vizSection.style.display = 'none';
    } else {
        vizSection.style.display = 'block';
        vizList.innerHTML = '';

        visualizations.forEach(viz => {
            const vizCard = createVisualizationCard(viz);
            vizList.appendChild(vizCard);
        });
    }
}

// Create visualization card
function createVisualizationCard(viz) {
    const card = document.createElement('div');
    card.className = 'viz-card';
    card.onclick = () => showVisualization(viz);

    const type = document.createElement('div');
    type.className = 'viz-type';
    type.textContent = viz.type.replace(/_/g, ' ').toUpperCase();

    const description = document.createElement('p');
    description.textContent = viz.description;

    const summary = document.createElement('div');
    summary.className = 'viz-summary';
    if (viz.summary) {
        summary.textContent = viz.summary.substring(0, 100) + (viz.summary.length > 100 ? '...' : '');
    }

    const viewBtn = document.createElement('button');
    viewBtn.className = 'view-btn';
    viewBtn.textContent = 'View Visualization';
    viewBtn.onclick = (e) => {
        e.stopPropagation();
        showVisualization(viz);
    };

    card.appendChild(type);
    card.appendChild(description);
    if (viz.summary) {
        card.appendChild(summary);
    }
    card.appendChild(viewBtn);

    return card;
}

// Show visualization in modal
function showVisualization(viz) {
    const modal = document.getElementById('viz-modal');
    const title = document.getElementById('modal-title');
    const summary = document.getElementById('modal-summary');
    const frame = document.getElementById('viz-frame');

    // For HTML-based visualizations (D3, network graphs, etc.), hide title/summary
    // since they're self-contained. Only show for Chart.js visualizations.
    const isChartJs = ['bar_chart', 'line_chart', 'pie_chart', 'scatter_plot', 'bar', 'line', 'pie', 'scatter'].includes(viz.type);

    if (isChartJs) {
        title.textContent = viz.description;
        title.style.display = 'block';

        if (viz.summary) {
            summary.style.display = 'block';
            // Convert markdown to HTML (simple version)
            const htmlSummary = viz.summary
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            summary.innerHTML = htmlSummary;
        } else {
            summary.style.display = 'none';
        }
    } else {
        // HTML-based visualization - hide modal header
        title.style.display = 'none';
        summary.style.display = 'none';
    }

    const encodedUri = encodeURIComponent(viz.vizUri);
    frame.src = `/api/visualizations/${encodedUri}/render`;

    modal.style.display = 'block';
}

// Close modal
function closeModal() {
    const modal = document.getElementById('viz-modal');
    const frame = document.getElementById('viz-frame');
    modal.style.display = 'none';
    frame.src = '';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('viz-modal');
    if (event.target === modal) {
        closeModal();
    }
}

// Utility functions
function showLoading() {
    const container = document.getElementById('queries-list');
    container.innerHTML = '<div class="loading">Loading queries...</div>';
}

function showError(message) {
    const container = document.getElementById('queries-list');
    container.innerHTML = `<div class="error-message">${message}</div>`;
}
