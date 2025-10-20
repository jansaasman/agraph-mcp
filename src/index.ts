#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

interface RepositoryConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  catalog: string;
  repository: string;
  protocol?: 'http' | 'https';
}

interface MultiRepositoryConfig {
  repositories: { [key: string]: RepositoryConfig };
  defaultRepository: string;
}

class AllegroGraphMCPServer {
  private server: Server;
  private config: MultiRepositoryConfig;
  private axiosClients: { [key: string]: AxiosInstance } = {};
  private currentRepository: string;

  constructor(config: MultiRepositoryConfig) {
    this.config = config;
    this.currentRepository = config.defaultRepository;

    // Create axios clients for each repository
    for (const [repoName, repoConfig] of Object.entries(config.repositories)) {
      const baseUrl = `${repoConfig.protocol || 'https'}://${repoConfig.host}:${repoConfig.port}`;
      
      this.axiosClients[repoName] = axios.create({
        baseURL: baseUrl,
        auth: {
          username: repoConfig.username,
          password: repoConfig.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });
    }

    this.server = new Server(
      {
        name: 'allegro-graph-multi-server',
        version: '0.4.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupResourceHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'sparql_query',
            description: 'Execute a SPARQL SELECT, CONSTRUCT, ASK, or DESCRIBE query against AllegroGraph',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The SPARQL query to execute',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
                limit: {
                  type: 'number',
                  description: 'Optional limit for results (default: 100)',
                  default: 100,
                },
                format: {
                  type: 'string',
                  enum: ['json', 'xml', 'csv', 'tsv'],
                  description: 'Result format (default: json)',
                  default: 'json',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'list_repositories',
            description: 'List all available repositories',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'set_repository',
            description: 'Set the current active repository',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Repository name to set as current',
                },
              },
              required: ['repository'],
            },
          },
          {
            name: 'get_current_repository',
            description: 'Get the currently active repository',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_repository_info',
            description: 'Get information about a repository',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
              },
            },
          },
          {
            name: 'federated_query',
            description: 'Execute a query across multiple repositories',
            inputSchema: {
              type: 'object',
              properties: {
                queries: {
                  type: 'object',
                  description: 'Object with repository names as keys and queries as values',
                },
                combineResults: {
                  type: 'boolean',
                  description: 'Whether to combine results from all repositories',
                  default: true,
                },
              },
              required: ['queries'],
            },
          },
          {
            name: 'sparql_update',
            description: 'Execute a SPARQL UPDATE query',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'The SPARQL UPDATE query to execute',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'add_triples',
            description: 'Add RDF triples to a repository',
            inputSchema: {
              type: 'object',
              properties: {
                triples: {
                  type: 'string',
                  description: 'RDF data in N-Triples, Turtle, or RDF/XML format',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
                format: {
                  type: 'string',
                  enum: ['ntriples', 'turtle', 'rdfxml', 'jsonld'],
                  description: 'Format of the RDF data',
                  default: 'turtle',
                },
                context: {
                  type: 'string',
                  description: 'Optional named graph context URI',
                },
              },
              required: ['triples'],
            },
          },
          {
            name: 'get_shacl',
            description: 'IMPORTANT: Call this FIRST before writing SPARQL queries. Returns SHACL shapes that describe all available classes, predicates, and their constraints in the repository. This eliminates guessing and prevents errors by providing the exact schema.',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
              },
            },
          },
          {
            name: 'search_queries',
            description: 'Search the query library for previously successful queries by natural language description. Use this BEFORE writing complex queries to see if a similar query pattern already exists. If no matches found or results are not helpful, use list_all_queries to see ALL patterns.',
            inputSchema: {
              type: 'object',
              properties: {
                search: {
                  type: 'string',
                  description: 'Natural language description of what you want to query',
                },
                repository: {
                  type: 'string',
                  description: 'Filter by repository name (optional)',
                },
              },
              required: ['search'],
            },
          },
          {
            name: 'store_query',
            description: 'Store a successful SPARQL query in the query library with its natural language description. Always ASK the user for confirmation before storing.',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'Short title for the query',
                },
                description: {
                  type: 'string',
                  description: 'Natural language description of what the query does',
                },
                sparqlQuery: {
                  type: 'string',
                  description: 'The SPARQL query text',
                },
                repository: {
                  type: 'string',
                  description: 'Repository the query was run against',
                },
              },
              required: ['title', 'description', 'sparqlQuery', 'repository'],
            },
          },
          {
            name: 'store_query_visualization',
            description: 'Store a visualization configuration for a query in the library. Links the visualization to an existing stored query by finding its URI. This allows Claude to quickly recreate visualizations without regenerating them. IMPORTANT: The summary parameter should contain the markdown-formatted narrative text you showed to the user explaining what the visualization reveals (key insights, trends, statistics, data points). Always ASK the user for confirmation before storing.',
            inputSchema: {
              type: 'object',
              properties: {
                queryTitle: {
                  type: 'string',
                  description: 'Title of the query this visualization belongs to (must match an existing stored query)',
                },
                visualizationType: {
                  type: 'string',
                  enum: ['bar_chart', 'line_chart', 'pie_chart', 'scatter_plot', 'table', 'network_graph', 'timeline', 'heatmap', 'treemap', 'sankey', 'other'],
                  description: 'Type of visualization',
                },
                visualizationConfig: {
                  type: 'string',
                  description: 'JSON string containing the visualization configuration (chart.js config, mermaid diagram, D3 config, or other format)',
                },
                description: {
                  type: 'string',
                  description: 'Description of what the visualization shows and why it is useful',
                },
                summary: {
                  type: 'string',
                  description: 'Markdown-formatted narrative summary explaining what the visualization shows, key insights, trends, and important data points. This is the text you would normally show to the user when presenting the chart.',
                },
                repository: {
                  type: 'string',
                  description: 'Repository the query was run against',
                },
              },
              required: ['queryTitle', 'visualizationType', 'visualizationConfig', 'description', 'summary', 'repository'],
            },
          },
          {
            name: 'get_query_visualizations',
            description: 'Get all stored visualizations for a specific query by its title. Use this to quickly recreate visualizations without regenerating them.',
            inputSchema: {
              type: 'object',
              properties: {
                queryTitle: {
                  type: 'string',
                  description: 'Title of the query to get visualizations for',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional)',
                },
              },
              required: ['queryTitle'],
            },
          },
          {
            name: 'list_all_queries',
            description: 'CRITICAL: Use this tool IMMEDIATELY when: (1) A SPARQL query fails or returns unexpected results, (2) You are unsure about URI meanings or predicate usage, (3) Working with cryptic Wikidata properties (e.g., wdt:P19), or (4) Before writing complex queries. Returns ALL successful queries with their natural language descriptions for the specified repository. This shows you working patterns where rdfs:label/skos:label reveal URI meanings, proper predicate usage, and proven query structures. Essential for learning vocabulary through examples rather than guessing.',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Repository name to get queries for (required)',
                },
              },
              required: ['repository'],
            },
          },
          {
            name: 'list_fti_indices',
            description: 'List all freetext indices in a repository. Essential for knowing which indices are available for text search queries.',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
              },
            },
          },
          {
            name: 'get_fti_index_config',
            description: 'Get configuration details of a specific freetext index, including which predicates are indexed and index settings. Use this to understand what can be searched in an index.',
            inputSchema: {
              type: 'object',
              properties: {
                index: {
                  type: 'string',
                  description: 'Name of the freetext index',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
              },
              required: ['index'],
            },
          },
          {
            name: 'read_fti_tutorial',
            description: 'IMPORTANT: Read this FIRST when working with freetext indexing or text search. Returns the complete freetext indexing tutorial with SPARQL examples, syntax patterns, wildcards, performance tips, and REST API documentation. Essential for understanding how to use fti:match and fti:matchExpression correctly.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'read_vector_tutorial',
            description: 'CRITICAL: Read this FIRST before using vector_nearest_neighbor or vector_ask_documents tools. Returns the complete vector store tutorial with llm:nearestNeighbor and llm:askMyDocuments SPARQL examples, selector syntax for GraphRAG, and detailed Q&A about vector store operations.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'read_visualization_guidelines',
            description: 'CRITICAL: Read this FIRST before creating ANY visualizations or charts. Returns complete guidelines explaining why you MUST use Chart.js (NOT React components) for all charts. React-based visualizations DO NOT render in browsers. Includes Chart.js implementation patterns, examples, and common mistakes to avoid.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'vector_nearest_neighbor',
            description: 'IMPORTANT: Before using this tool, READ the resource allegro://docs/vector-store to understand llm:nearestNeighbor syntax and examples. Execute a nearest neighbor search using AllegroGraph vector embeddings. Returns embeddings similar to the input text based on cosine similarity. Use this for semantic search and retrieval. For RAG (combining search with LLM response), use vector_ask_documents instead.',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'The text to search for similar embeddings',
                },
                vectorStore: {
                  type: 'string',
                  description: 'Name of the vector store to search. Use repository name (e.g., "chomsky47") for embedded vector stores, or "catalog:repository" format (e.g., "demos:chomsky47") for explicit specification.',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
                topN: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
                minScore: {
                  type: 'number',
                  description: 'Minimum cosine similarity score threshold (0.0-1.0, default: 0.0)',
                  default: 0.0,
                },
                selector: {
                  type: 'string',
                  description: 'Optional SPARQL selector to pre-filter embeddings. Must start with "?id vdbprop:id ?link". Enables GraphRAG by restricting search to specific subgraphs.',
                },
                useClustering: {
                  type: 'boolean',
                  description: 'Use clustering approximation for faster search on large vector stores (default: false)',
                  default: false,
                },
                linkToSource: {
                  type: 'boolean',
                  description: 'Include source triple information via vdbprop:id link (default: false)',
                  default: false,
                },
              },
              required: ['text', 'vectorStore'],
            },
          },
          {
            name: 'vector_ask_documents',
            description: 'IMPORTANT: Before using this tool, READ the resource allegro://docs/vector-store to understand llm:askMyDocuments syntax and examples. Execute RAG (Retrieval Augmented Generation) using AllegroGraph vector embeddings. First finds nearest neighbors, then sends them with your question to an LLM for a response. Returns the LLM response along with citations. Use this for question-answering over your document embeddings.',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The question to ask about your documents',
                },
                vectorStore: {
                  type: 'string',
                  description: 'Name of the vector store to search. Use repository name (e.g., "chomsky47") for embedded vector stores, or "catalog:repository" format (e.g., "demos:chomsky47") for explicit specification.',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
                topN: {
                  type: 'number',
                  description: 'Number of document chunks to retrieve for context (default: 5)',
                  default: 5,
                },
                minScore: {
                  type: 'number',
                  description: 'Minimum similarity score threshold (0.0-1.0, default: 0.8)',
                  default: 0.8,
                },
                selector: {
                  type: 'string',
                  description: 'Optional SPARQL selector to pre-filter which documents to search. Must start with "?id vdbprop:id ?link". Enables GraphRAG.',
                },
                useClustering: {
                  type: 'boolean',
                  description: 'Use clustering approximation for faster search (default: false)',
                  default: false,
                },
              },
              required: ['question', 'vectorStore'],
            },
          },
          {
            name: 'check_vector_store',
            description: 'Check if a repository is configured as a vector store. Returns true if embeddings have been created, false otherwise.',
            inputSchema: {
              type: 'object',
              properties: {
                repository: {
                  type: 'string',
                  description: 'Repository name to check (optional, uses current if not specified)',
                },
              },
            },
          },
          {
            name: 'generate_sparql_only',
            description: 'IMPORTANT: Use this tool when the user starts their request with "sparql:" or explicitly asks for ONLY the SPARQL query without execution. This tool analyzes the user question, checks the SHACL schema, searches the query library for patterns, and returns ONLY the SPARQL query text - nothing else. Does NOT execute the query.',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The natural language question to convert to SPARQL (e.g., "how many chapters are in a book")',
                },
                repository: {
                  type: 'string',
                  description: 'Repository name (optional, uses current if not specified)',
                },
                includeComments: {
                  type: 'boolean',
                  description: 'Include helpful comments in the SPARQL query explaining each part (default: false)',
                  default: false,
                },
              },
              required: ['question'],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'sparql_query':
            return await this.handleSparqlQuery(args);
          case 'list_repositories':
            return await this.handleListRepositories();
          case 'set_repository':
            return await this.handleSetRepository(args);
          case 'get_current_repository':
            return await this.handleGetCurrentRepository();
          case 'get_repository_info':
            return await this.handleGetRepositoryInfo(args);
          case 'federated_query':
            return await this.handleFederatedQuery(args);
          case 'sparql_update':
            return await this.handleSparqlUpdate(args);
          case 'add_triples':
            return await this.handleAddTriples(args);
          case 'get_shacl':
            return await this.handleGetShacl(args);
          case 'search_queries':
            return await this.handleSearchQueries(args);
          case 'store_query':
            return await this.handleStoreQuery(args);
          case 'store_query_visualization':
            return await this.handleStoreQueryVisualization(args);
          case 'get_query_visualizations':
            return await this.handleGetQueryVisualizations(args);
          case 'list_all_queries':
            return await this.handleListAllQueries(args);
          case 'list_fti_indices':
            return await this.handleListFtiIndices(args);
          case 'get_fti_index_config':
            return await this.handleGetFtiIndexConfig(args);
          case 'read_fti_tutorial':
            return await this.handleReadFtiTutorial();
          case 'read_vector_tutorial':
            return await this.handleReadVectorTutorial();
          case 'read_visualization_guidelines':
            return await this.handleReadVisualizationGuidelines();
          case 'vector_nearest_neighbor':
            return await this.handleVectorNearestNeighbor(args);
          case 'vector_ask_documents':
            return await this.handleVectorAskDocuments(args);
          case 'check_vector_store':
            return await this.handleCheckVectorStore(args);
          case 'generate_sparql_only':
            return await this.handleGenerateSparqlOnly(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [];

      // Add documentation resources
      resources.push({
        uri: 'allegro://docs/query-workflow',
        name: 'SPARQL Query Workflow Best Practices',
        description: 'CRITICAL: Read this to understand the recommended workflow for writing SPARQL queries. Covers schema discovery, query library usage, freetext indexing, and when to use each tool.',
        mimeType: 'text/markdown',
      });

      resources.push({
        uri: 'allegro://docs/freetext-indexing',
        name: 'Freetext Indexing Tutorial',
        description: 'Tutorial on using AllegroGraph freetext indexing (FTI) for fast text search in literals. Essential for working with unstructured text.',
        mimeType: 'text/plain',
      });

      resources.push({
        uri: 'allegro://docs/vector-store',
        name: 'Vector Store and RAG Tutorial',
        description: 'IMPORTANT: Read this when working with vector embeddings, nearest neighbor search, or RAG (Retrieval Augmented Generation). Covers llm:nearestNeighbor and llm:askMyDocuments magic predicates with examples.',
        mimeType: 'text/plain',
      });

      resources.push({
        uri: 'allegro://docs/visualization-guidelines',
        name: 'Visualization Guidelines',
        description: 'CRITICAL: Read this BEFORE creating any visualizations. Explains why you MUST use Chart.js (not React) for all charts. React components do not render in browsers. Chart.js works perfectly in Claude Desktop artifacts.',
        mimeType: 'text/plain',
      });

      for (const repoName of Object.keys(this.config.repositories)) {
        resources.push(
          {
            uri: `allegro://${repoName}/shacl`,
            name: `${repoName} SHACL Schema`,
            description: `SHACL shapes defining all classes, predicates, and constraints in ${repoName}. READ THIS FIRST before writing SPARQL queries to understand the data structure.`,
            mimeType: 'application/json',
          },
          {
            uri: `allegro://${repoName}/info`,
            name: `${repoName} Repository Information`,
            description: `Basic information about the ${repoName} repository`,
            mimeType: 'application/json',
          },
          {
            uri: `allegro://${repoName}/namespaces`,
            name: `${repoName} Namespace Prefixes`,
            description: `Namespace prefixes defined in the ${repoName} repository`,
            mimeType: 'application/json',
          }
        );
      }

      return { resources };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      // Handle documentation resources
      if (uri === 'allegro://docs/query-workflow') {
        const workflowDoc = `# SPARQL Query Workflow Best Practices

## Overview
This guide describes the recommended workflow for writing SPARQL queries against AllegroGraph repositories using this MCP server.

---

## 1. Understanding the Schema (ALWAYS START HERE)

Before writing any query, understand what data is available:

### Step 1.1: Read the SHACL Schema
- **Tool**: Read the resource \`allegro://<repository-name>/shacl\`
- **Purpose**: Discover all classes, predicates, datatypes, and constraints
- **Why**: Prevents guessing about URIs and predicates

### Step 1.2: Check Namespace Prefixes
- **Tool**: Read the resource \`allegro://<repository-name>/namespaces\`
- **Purpose**: Learn what namespace prefixes are defined
- **Why**: Makes queries more readable and correct

---

## 2. Writing Standard SPARQL Queries

### Step 2.1: Search the Query Library FIRST
- **Tool**: \`search_queries\`
- **When**: Before writing any new query
- **Why**: Someone may have already solved a similar problem
- **Input**: Natural language description of what you want to query
- **Example**: "find all athletes born in France"

### Step 2.2: If Search Returns No Results → List ALL Queries
- **Tool**: \`list_all_queries\` (CRITICAL)
- **When**:
  - \`search_queries\` found nothing helpful
  - You're unsure about URI meanings or predicate usage
  - Working with cryptic Wikidata properties (e.g., wdt:P19)
  - A query failed or returned unexpected results
- **Why**:
  - See ALL successful patterns for the repository
  - Discover URI meanings through rdfs:label/skos:label in working queries
  - Learn predicate usage by example
  - Understand vocabulary through proven patterns
- **Input**: Repository name (required)
- **Note**: Returns ALL queries (possibly 500+) - this is intentional!

### Step 2.3: Write and Execute Your Query
- **Tool**: \`sparql_query\`
- **Input**: Your SPARQL query text
- **Options**: Set format (json, xml, csv, tsv) and limit

### Step 2.4: If Query Fails → IMMEDIATELY Use list_all_queries
- **Don't guess or iterate blindly**
- Look at working examples to understand patterns
- Check how others used similar predicates or URIs

---

## 3. Writing Freetext Search Queries

For queries involving text search (e.g., "find documents containing 'olympic'"):

### Step 3.1: Read the Freetext Indexing Tutorial
- **Tool**: \`read_fti_tutorial\`
- **When**: FIRST time working with text search, or when syntax is unclear
- **Why**: Learn fti:match, fti:matchExpression, wildcards, performance tips

### Step 3.2: List Available Indices
- **Tool**: \`list_fti_indices\`
- **Input**: Repository name
- **Why**: Know which freetext indices exist

### Step 3.3: Get Index Configuration
- **Tool**: \`get_fti_index_config\`
- **Input**: Index name
- **Why**: Understand which predicates are indexed and what can be searched

### Step 3.4: Check Query Library for FTI Examples
- **Tool**: \`search_queries\` or \`list_all_queries\`
- **Search for**: "fti:match" or "text search" or "freetext"
- **Why**: See working examples of fti:match usage

### Step 3.5: Write Your FTI Query
- **Tool**: \`sparql_query\`
- **Include**: fti:match or fti:matchExpression in your query
- **Example pattern**: \`?subject ?predicate ?literal . ?literal fti:match "search term*" .\`

---

## 4. Working with Vector Embeddings and RAG

For semantic search and RAG (Retrieval Augmented Generation):

### Step 4.1: Check if Repository is a Vector Store
- **Tool**: \`check_vector_store\`
- **Input**: Repository name (optional)
- **Why**: Verify that embeddings have been created

### Step 4.2: Read the Vector Store Tutorial (First Time)
- **Tool**: Read resource \`allegro://docs/vector-store\`
- **When**: FIRST time using vector embeddings or RAG
- **Why**: Learn llm:nearestNeighbor and llm:askMyDocuments syntax, selectors, GraphRAG patterns

### Step 4.3: Choose Your Approach

#### For Semantic Search Only (Nearest Neighbor):
- **Tool**: \`vector_nearest_neighbor\`
- **Input**:
  - text: What to search for
  - vectorStore: Name of the vector store
  - topN: Number of results (default: 10)
  - minScore: Similarity threshold (0.0-1.0, default: 0.0)
  - selector: Optional GraphRAG filter
  - linkToSource: true to get source triple info
- **Returns**: Embedding IDs, similarity scores, matched text, optional source links
- **When to use**: You need semantic search results for further processing

#### For Question Answering (RAG):
- **Tool**: \`vector_ask_documents\`
- **Input**:
  - question: Your question
  - vectorStore: Name of the vector store
  - topN: Number of chunks for context (default: 5)
  - minScore: Similarity threshold (default: 0.8)
  - selector: Optional GraphRAG filter
- **Returns**: LLM-generated answer with citations
- **When to use**: You want a direct answer to a question based on your documents

### Step 4.4: Using Selectors for GraphRAG
- **Purpose**: Pre-filter embeddings to specific subgraphs before search
- **Syntax**: Must start with \`?id vdbprop:id ?link\`
- **Example**: \`"{ ?id vdbprop:id ?link . ?link a myonto:Chapter . }"\`
- **Why**: Restricts search to specific types/contexts, reduces search space, enables graph-aware RAG

### Step 4.5: Link Embeddings to Source Triples
- Use \`linkToSource: true\` in \`vector_nearest_neighbor\`
- Or write custom SPARQL with \`?id vdbprop:id ?link\`
- The \`?link\` variable points to the subject of the original embedded triple
- Combine with graph patterns to understand context

---

## 5. Working with Multiple Repositories

### Option A: Switch Repository Context
- **Tool**: \`set_repository\`
- **Input**: Repository name
- **Effect**: All subsequent queries use this repository

### Option B: Specify Repository Per Query
- **Tool**: Any query tool with \`repository\` parameter
- **Effect**: One-time override without changing context

### Option C: Federated Query
- **Tool**: \`federated_query\`
- **Input**: Object mapping repository names to queries
- **When**: Need to query multiple repositories and combine results

---

## 6. After Success: Store Your Query

When you've written a successful query that solves a problem:

### Step 6.1: Ask User for Permission
- **ALWAYS ask** before storing
- Explain what will be stored (title, description, SPARQL text, repository)

### Step 6.2: Store the Query
- **Tool**: \`store_query\`
- **Input**:
  - title: Short descriptive title
  - description: Natural language explanation of what it does and why
  - sparqlQuery: The SPARQL query text
  - repository: Which repository it was tested on
- **Why**: Help future users (including yourself) find this pattern

---

## 7. Troubleshooting Failed Queries

If a query fails or returns unexpected results:

1. ✅ **FIRST**: Use \`list_all_queries\` to see working patterns
2. ✅ Check SHACL schema - did you use correct predicate URIs?
3. ✅ Check namespaces - are your prefixes defined?
4. ✅ Look at successful queries - how do they structure similar patterns?
5. ✅ For text search - verify fti:match syntax from tutorial and examples

**DO NOT** repeatedly guess and iterate without consulting the query library.

---

## Quick Reference

| Task | First Tool to Use |
|------|------------------|
| Starting fresh | Read SHACL schema resource |
| Writing new query | \`search_queries\` |
| Query failed | \`list_all_queries\` (CRITICAL) |
| Text search needed | \`read_fti_tutorial\` |
| Vector/RAG needed | \`read_vector_tutorial\` |
| Semantic search | \`vector_nearest_neighbor\` |
| Question answering | \`vector_ask_documents\` |
| Unsure about URIs | \`list_all_queries\` |
| Wikidata properties | \`list_all_queries\` |
| Query succeeded | \`store_query\` (with permission) |
| Creating visualization | \`read_visualization_guidelines\` (CRITICAL) |

---

## Remember

- 🔴 **Query library is your friend** - Use it liberally, especially \`list_all_queries\`
- 🔴 **Don't guess** - Look at working examples instead
- 🔴 **SHACL first** - Always understand the schema before querying
- 🔴 **Store successes** - Help build the knowledge base
`;

        return {
          contents: [{
            uri,
            mimeType: 'text/markdown',
            text: workflowDoc,
          }],
        };
      }

      if (uri === 'allegro://docs/freetext-indexing') {
        const fs = await import('fs/promises');
        const path = await import('path');
        const { fileURLToPath } = await import('url');

        // Get the directory where the compiled JS file is located
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Go up one level from dist/ to the project root
        const projectRoot = path.dirname(__dirname);
        const docPath = path.join(projectRoot, 'freetext-index-tutorial.txt');

        try {
          const content = await fs.readFile(docPath, 'utf-8');
          return {
            contents: [{
              uri,
              mimeType: 'text/plain',
              text: content,
            }],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read documentation from ${docPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (uri === 'allegro://docs/vector-store') {
        const fs = await import('fs/promises');
        const path = await import('path');
        const { fileURLToPath } = await import('url');

        // Get the directory where the compiled JS file is located
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Go up one level from dist/ to the project root
        const projectRoot = path.dirname(__dirname);
        const docPath = path.join(projectRoot, 'nearest-neighbor-and-askMyDocuments.txt');

        try {
          const content = await fs.readFile(docPath, 'utf-8');
          return {
            contents: [{
              uri,
              mimeType: 'text/plain',
              text: content,
            }],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read documentation from ${docPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (uri === 'allegro://docs/visualization-guidelines') {
        const fs = await import('fs/promises');
        const path = await import('path');
        const { fileURLToPath } = await import('url');

        // Get the directory where the compiled JS file is located
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        // Go up one level from dist/ to the project root
        const projectRoot = path.dirname(__dirname);
        const docPath = path.join(projectRoot, 'visualization-guidelines.txt');

        try {
          const content = await fs.readFile(docPath, 'utf-8');
          return {
            contents: [{
              uri,
              mimeType: 'text/plain',
              text: content,
            }],
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read documentation from ${docPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // Handle repository resources
      const match = uri.match(/^allegro:\/\/([^\/]+)\/(info|namespaces|shacl)$/);

      if (!match) {
        throw new McpError(ErrorCode.InvalidRequest, `Invalid resource URI: ${uri}`);
      }

      const [, repoName, resourceType] = match;

      if (!this.config.repositories[repoName]) {
        throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
      }

      try {
        if (resourceType === 'info') {
          const info = await this.getRepositoryInfo(repoName);
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(info, null, 2),
            }],
          };
        } else if (resourceType === 'namespaces') {
          const namespaces = await this.getNamespaces(repoName);
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(namespaces, null, 2),
            }],
          };
        } else if (resourceType === 'shacl') {
          const shacl = await this.getShacl(repoName);
          return {
            contents: [{
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(shacl, null, 2),
            }],
          };
        } else {
          throw new McpError(ErrorCode.InvalidRequest, `Unknown resource type: ${resourceType}`);
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private getRepositoryUrl(repoName: string): string {
    const config = this.config.repositories[repoName];
    return `/catalogs/${config.catalog}/repositories/${config.repository}`;
  }

  private async handleSparqlQuery(args: any) {
    const { query, repository, limit = 100, format = 'json' } = args;
    const repoName = repository || this.currentRepository;
    
    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    const url = this.getRepositoryUrl(repoName);
    const params = {
      query: query,
      limit: limit.toString(),
    };

    let acceptHeader = 'application/sparql-results+json';
    if (format === 'xml') acceptHeader = 'application/sparql-results+xml';
    else if (format === 'csv') acceptHeader = 'text/csv';
    else if (format === 'tsv') acceptHeader = 'text/tab-separated-values';

    const response = await this.axiosClients[repoName].get(url, {
      params,
      headers: { Accept: acceptHeader },
    });

    return {
      content: [
        {
          type: 'text',
          text: `SPARQL Query Results from '${repoName}':\n${JSON.stringify(response.data, null, 2)}`,
        },
      ],
    };
  }

  private async handleListRepositories() {
    const repositories = Object.keys(this.config.repositories).map(name => ({
      name,
      current: name === this.currentRepository,
      config: this.config.repositories[name]
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Available repositories:\n${JSON.stringify(repositories, null, 2)}`,
        },
      ],
    };
  }

  private async handleSetRepository(args: any) {
    const { repository } = args;
    
    if (!this.config.repositories[repository]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repository}' not found`);
    }

    const oldRepo = this.currentRepository;
    this.currentRepository = repository;

    return {
      content: [
        {
          type: 'text',
          text: `Current repository changed from '${oldRepo}' to '${repository}'`,
        },
      ],
    };
  }

  private async handleGetCurrentRepository() {
    return {
      content: [
        {
          type: 'text',
          text: `Current repository: ${this.currentRepository}`,
        },
      ],
    };
  }

  private async handleGetRepositoryInfo(args: any) {
    const { repository } = args;
    const repoName = repository || this.currentRepository;
    
    const info = await this.getRepositoryInfo(repoName);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(info, null, 2),
        },
      ],
    };
  }

  private async handleFederatedQuery(args: any) {
    const { queries, combineResults = true } = args;
    const results: any = {};

    for (const [repoName, query] of Object.entries(queries)) {
      if (!this.config.repositories[repoName]) {
        results[repoName] = { error: `Repository '${repoName}' not found` };
        continue;
      }

      try {
        const response = await this.handleSparqlQuery({ 
          query, 
          repository: repoName 
        });
        results[repoName] = JSON.parse(response.content[0].text.split(':\n')[1]);
      } catch (error) {
        results[repoName] = { 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `Federated Query Results:\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    };
  }

  private async handleSparqlUpdate(args: any) {
    const { query, repository } = args;
    const repoName = repository || this.currentRepository;
    
    const url = this.getRepositoryUrl(repoName);
    const response = await this.axiosClients[repoName].post(url, null, {
      params: { update: query },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return {
      content: [
        {
          type: 'text',
          text: `SPARQL Update executed successfully on '${repoName}'. Status: ${response.status}`,
        },
      ],
    };
  }

  private async handleAddTriples(args: any) {
    const { triples, repository, format = 'turtle', context } = args;
    const repoName = repository || this.currentRepository;

    const url = `${this.getRepositoryUrl(repoName)}/statements`;

    let contentType = 'text/turtle';
    if (format === 'ntriples') contentType = 'text/plain';
    else if (format === 'rdfxml') contentType = 'application/rdf+xml';
    else if (format === 'jsonld') contentType = 'application/ld+json';

    const params: any = {};
    if (context) params.context = context;

    const response = await this.axiosClients[repoName].post(url, triples, {
      params,
      headers: { 'Content-Type': contentType },
    });

    return {
      content: [
        {
          type: 'text',
          text: `Triples added successfully to '${repoName}'. Status: ${response.status}`,
        },
      ],
    };
  }

  private async handleGetShacl(args: any) {
    const { repository } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    const url = `${this.getRepositoryUrl(repoName)}/data-generator/shacl`;

    const response = await this.axiosClients[repoName].get(url, {
      headers: { 'Accept': 'application/json' },
    });

    return {
      content: [
        {
          type: 'text',
          text: `SHACL shapes from '${repoName}':\n${JSON.stringify(response.data, null, 2)}`,
        },
      ],
    };
  }

  private async handleSearchQueries(args: any) {
    const { search, repository } = args;

    // Build SPARQL query to search the query library
    let sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?queryUri ?title ?description ?sparql ?repo ?created WHERE {
        ?queryUri a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository ?repo .
        OPTIONAL { ?queryUri dc:created ?created }
        FILTER(
          CONTAINS(LCASE(?title), LCASE("${search}")) ||
          CONTAINS(LCASE(?description), LCASE("${search}"))
        )
    `;

    if (repository) {
      sparqlQuery += `\n        FILTER(?repo = "${repository}")`;
    }

    sparqlQuery += `\n      }\n      ORDER BY DESC(?created)\n      LIMIT 10`;

    // Query the query-library repository
    const queryLibraryConfig = this.config.repositories['query-library'];
    if (!queryLibraryConfig) {
      throw new McpError(ErrorCode.InvalidRequest, 'Query library repository not found');
    }

    // Ensure axios client exists for query-library
    if (!this.axiosClients['query-library']) {
      const baseUrl = `${queryLibraryConfig.protocol || 'https'}://${queryLibraryConfig.host}:${queryLibraryConfig.port}`;
      this.axiosClients['query-library'] = axios.create({
        baseURL: baseUrl,
        auth: {
          username: queryLibraryConfig.username,
          password: queryLibraryConfig.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    }

    const url = this.getRepositoryUrl('query-library');
    const response = await this.axiosClients['query-library'].get(url, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No queries found matching "${search}"`,
          },
        ],
      };
    }

    const formattedResults = results.map((r: any) => ({
      queryUri: r.queryUri.value,
      title: r.title.value,
      description: r.description.value,
      repository: r.repo.value,
      sparql: r.sparql.value,
      created: r.created?.value
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.length} matching queries:\n${JSON.stringify(formattedResults, null, 2)}`,
        },
      ],
    };
  }

  private async handleStoreQuery(args: any) {
    const { title, description, sparqlQuery, repository } = args;

    // Check if query-library repository exists
    const queryLibraryConfig = this.config.repositories['query-library'];
    if (!queryLibraryConfig) {
      throw new McpError(ErrorCode.InvalidRequest, 'Query library repository not found. Cannot store queries without a query-library repository configured.');
    }

    // Ensure axios client exists for query-library (create on-demand if needed)
    if (!this.axiosClients['query-library']) {
      const baseUrl = `${queryLibraryConfig.protocol || 'https'}://${queryLibraryConfig.host}:${queryLibraryConfig.port}`;
      this.axiosClients['query-library'] = axios.create({
        baseURL: baseUrl,
        auth: {
          username: queryLibraryConfig.username,
          password: queryLibraryConfig.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      });
    }

    // Generate a unique ID for the query
    const queryId = `query-${Date.now()}`;

    // Create turtle format data
    const turtle = `@prefix query: <http://franz.com/ns/query-library#> .
@prefix dc: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

query:${queryId} a query:StoredQuery ;
    dc:title """${title.replace(/"/g, '\\"')}""" ;
    dc:description """${description.replace(/"/g, '\\"')}""" ;
    query:sparqlText """${sparqlQuery.replace(/"/g, '\\"')}""" ;
    query:repository "${repository}" ;
    dc:created "${new Date().toISOString()}"^^xsd:dateTime ;
    query:successful true .
`;

    const url = `${this.getRepositoryUrl('query-library')}/statements`;
    const response = await this.axiosClients['query-library'].post(url, turtle, {
      headers: { 'Content-Type': 'text/turtle' },
    });

    return {
      content: [
        {
          type: 'text',
          text: `Query stored successfully in query library with ID: ${queryId}\nTitle: ${title}\nRepository: ${repository}`,
        },
      ],
    };
  }

  private async handleStoreQueryVisualization(args: any) {
    const { queryTitle, visualizationType, visualizationConfig, description, summary, repository } = args;

    // Check if query-library repository exists
    const queryLibraryConfig = this.config.repositories['query-library'];
    if (!queryLibraryConfig) {
      throw new McpError(ErrorCode.InvalidRequest, 'Query library repository not found. Cannot store visualizations without a query-library repository configured.');
    }

    // Ensure axios client exists for query-library
    if (!this.axiosClients['query-library']) {
      const baseUrl = `${queryLibraryConfig.protocol || 'https'}://${queryLibraryConfig.host}:${queryLibraryConfig.port}`;
      this.axiosClients['query-library'] = axios.create({
        baseURL: baseUrl,
        auth: {
          username: queryLibraryConfig.username,
          password: queryLibraryConfig.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    }

    // Step 1: Find the query URI by searching for the title
    const findQuerySparql = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?queryUri WHERE {
        ?queryUri a query:StoredQuery ;
                  dc:title """${queryTitle.replace(/"/g, '\\"')}""" ;
                  query:repository "${repository}" .
      }
      LIMIT 1
    `;

    const url = this.getRepositoryUrl('query-library');
    const findResponse = await this.axiosClients['query-library'].get(url, {
      params: { query: findQuerySparql },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = findResponse.data.results.bindings;
    if (results.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `No stored query found with title "${queryTitle}" for repository "${repository}". Please store the query first using store_query.`
      );
    }

    const queryUri = results[0].queryUri.value;

    // Step 2: Generate a unique ID for the visualization
    const vizId = `viz-${Date.now()}`;

    // Step 3: Store the visualization linked to the query URI
    const turtle = `@prefix query: <http://franz.com/ns/query-library#> .
@prefix dc: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix viz: <http://franz.com/ns/visualization#> .

viz:${vizId} a viz:Visualization ;
    viz:forQuery <${queryUri}> ;
    viz:type "${visualizationType}" ;
    viz:config """${visualizationConfig.replace(/"/g, '\\"')}""" ;
    dc:description """${description.replace(/"/g, '\\"')}""" ;
    viz:summary """${summary.replace(/"/g, '\\"')}""" ;
    dc:created "${new Date().toISOString()}"^^xsd:dateTime .
`;

    const storeUrl = `${this.getRepositoryUrl('query-library')}/statements`;
    await this.axiosClients['query-library'].post(storeUrl, turtle, {
      headers: { 'Content-Type': 'text/turtle' },
    });

    return {
      content: [
        {
          type: 'text',
          text: `Visualization stored successfully!\nVisualization ID: ${vizId}\nLinked to query: ${queryUri}\nType: ${visualizationType}\nQuery Title: ${queryTitle}`,
        },
      ],
    };
  }

  private async handleGetQueryVisualizations(args: any) {
    const { queryTitle, repository } = args;

    // Check if query-library repository exists
    const queryLibraryConfig = this.config.repositories['query-library'];
    if (!queryLibraryConfig) {
      throw new McpError(ErrorCode.InvalidRequest, 'Query library repository not found.');
    }

    // Ensure axios client exists for query-library
    if (!this.axiosClients['query-library']) {
      const baseUrl = `${queryLibraryConfig.protocol || 'https'}://${queryLibraryConfig.host}:${queryLibraryConfig.port}`;
      this.axiosClients['query-library'] = axios.create({
        baseURL: baseUrl,
        auth: {
          username: queryLibraryConfig.username,
          password: queryLibraryConfig.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    }

    // Build SPARQL query to find visualizations for the query
    let sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      PREFIX viz: <http://franz.com/ns/visualization#>
      SELECT ?vizId ?type ?config ?description ?summary ?created WHERE {
        ?queryUri a query:StoredQuery ;
                  dc:title """${queryTitle.replace(/"/g, '\\"')}""" `;

    if (repository) {
      sparqlQuery += `;
                  query:repository "${repository}" `;
    }

    sparqlQuery += `.
        ?vizId a viz:Visualization ;
               viz:forQuery ?queryUri ;
               viz:type ?type ;
               viz:config ?config ;
               dc:description ?description .
        OPTIONAL { ?vizId dc:created ?created }
        OPTIONAL { ?vizId viz:summary ?summary }
      }
      ORDER BY DESC(?created)
    `;

    const url = this.getRepositoryUrl('query-library');
    const response = await this.axiosClients['query-library'].get(url, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No visualizations found for query "${queryTitle}"${repository ? ` in repository "${repository}"` : ''}`,
          },
        ],
      };
    }

    const formattedResults = results.map((r: any) => ({
      vizId: r.vizId.value,
      type: r.type.value,
      config: r.config.value,
      description: r.description.value,
      summary: r.summary?.value,
      created: r.created?.value
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.length} visualization(s) for query "${queryTitle}":\n${JSON.stringify(formattedResults, null, 2)}`,
        },
      ],
    };
  }

  private async handleListAllQueries(args: any) {
    const { repository } = args;

    // Build SPARQL query to get ALL queries for the specified repository
    const sparqlQuery = `
      PREFIX query: <http://franz.com/ns/query-library#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?q ?title ?description ?sparql ?repo ?created WHERE {
        ?q a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository ?repo .
        OPTIONAL { ?q dc:created ?created }
        FILTER(?repo = "${repository}")
      }
      ORDER BY DESC(?created)
    `;

    // Query the query-library repository
    const queryLibraryConfig = this.config.repositories['query-library'];
    if (!queryLibraryConfig) {
      throw new McpError(ErrorCode.InvalidRequest, 'Query library repository not found');
    }

    // Ensure axios client exists for query-library
    if (!this.axiosClients['query-library']) {
      const baseUrl = `${queryLibraryConfig.protocol || 'https'}://${queryLibraryConfig.host}:${queryLibraryConfig.port}`;
      this.axiosClients['query-library'] = axios.create({
        baseURL: baseUrl,
        auth: {
          username: queryLibraryConfig.username,
          password: queryLibraryConfig.password,
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        timeout: 10000,
      });
    }

    const url = this.getRepositoryUrl('query-library');
    const response = await this.axiosClients['query-library'].get(url, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No queries found for repository "${repository}"`,
          },
        ],
      };
    }

    const formattedResults = results.map((r: any) => ({
      queryUri: r.q.value,
      title: r.title.value,
      description: r.description.value,
      repository: r.repo.value,
      sparql: r.sparql.value,
      created: r.created?.value
    }));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.length} queries for repository "${repository}":\n${JSON.stringify(formattedResults, null, 2)}`,
        },
      ],
    };
  }

  private async handleListFtiIndices(args: any) {
    const { repository } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    const url = `${this.getRepositoryUrl(repoName)}/freetext/indices`;
    const response = await this.axiosClients[repoName].get(url, {
      headers: { Accept: 'application/json' },
    });

    const indices = response.data;
    if (indices.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No freetext indices found in repository '${repoName}'`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `Freetext indices in '${repoName}':\n${JSON.stringify(indices, null, 2)}`,
        },
      ],
    };
  }

  private async handleGetFtiIndexConfig(args: any) {
    const { index, repository } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    const url = `${this.getRepositoryUrl(repoName)}/freetext/indices/${index}`;
    const response = await this.axiosClients[repoName].get(url, {
      headers: { Accept: 'application/json' },
    });

    const config = response.data;

    return {
      content: [
        {
          type: 'text',
          text: `Configuration for freetext index '${index}' in '${repoName}':\n${JSON.stringify(config, null, 2)}`,
        },
      ],
    };
  }

  private async handleReadFtiTutorial() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    // Get the directory where the compiled JS file is located
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Go up one level from dist/ to the project root
    const projectRoot = path.dirname(__dirname);
    const docPath = path.join(projectRoot, 'freetext-index-tutorial.txt');

    try {
      const content = await fs.readFile(docPath, 'utf-8');
      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read freetext indexing tutorial from ${docPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleReadVectorTutorial() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    // Get the directory where the compiled JS file is located
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Go up one level from dist/ to the project root
    const projectRoot = path.dirname(__dirname);
    const docPath = path.join(projectRoot, 'nearest-neighbor-and-askMyDocuments.txt');

    try {
      const content = await fs.readFile(docPath, 'utf-8');
      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read vector store tutorial from ${docPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleReadVisualizationGuidelines() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    // Get the directory where the compiled JS file is located
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Go up one level from dist/ to the project root
    const projectRoot = path.dirname(__dirname);
    const docPath = path.join(projectRoot, 'visualization-guidelines.txt');

    try {
      const content = await fs.readFile(docPath, 'utf-8');
      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to read visualization guidelines from ${docPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleVectorNearestNeighbor(args: any) {
    const {
      text,
      vectorStore,
      repository,
      topN = 10,
      minScore = 0.0,
      selector,
      useClustering = false,
      linkToSource = false
    } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    // Prepare vector store specification
    // If vectorStore doesn't contain ':', prepend catalog:
    const config = this.config.repositories[repoName];
    const vectorStoreSpec = vectorStore.includes(':') ? vectorStore : `${config.catalog}:${vectorStore}`;

    // Build the SPARQL query using llm:nearestNeighbor
    let sparqlQuery = `PREFIX llm: <http://franz.com/ns/allegrograph/8.0.0/llm/>
PREFIX kw: <http://franz.com/ns/keyword#>
PREFIX vdbprop: <http://franz.com/vdb/prop/>

SELECT ?id ?score ?text `;

    if (linkToSource) {
      sparqlQuery += `?link ?linkType `;
    }

    sparqlQuery += `WHERE {
  (?id ?score ?text) llm:nearestNeighbor ('${text.replace(/'/g, "\\'")}' '${vectorStoreSpec}' kw:topN ${topN} kw:minScore ${minScore}`;

    if (selector) {
      sparqlQuery += ` kw:selector "${selector.replace(/"/g, '\\"')}"`;
    }

    if (useClustering) {
      sparqlQuery += ` kw:useClustering true`;
    }

    sparqlQuery += `) .`;

    if (linkToSource) {
      sparqlQuery += `
  ?id vdbprop:id ?link .
  OPTIONAL { ?link a ?linkType }`;
    }

    sparqlQuery += `
}`;

    // Execute the query
    const url = this.getRepositoryUrl(repoName);
    const response = await this.axiosClients[repoName].get(url, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No results found for nearest neighbor search on vector store '${vectorStore}' with minScore ${minScore}`,
          },
        ],
      };
    }

    const formattedResults = results.map((r: any) => {
      const result: any = {
        id: r.id?.value,
        score: parseFloat(r.score?.value || '0'),
        text: r.text?.value,
      };
      if (linkToSource) {
        result.sourceLink = r.link?.value;
        result.sourceType = r.linkType?.value;
      }
      return result;
    });

    return {
      content: [
        {
          type: 'text',
          text: `Nearest Neighbor Results from vector store '${vectorStore}' (${results.length} results):\n${JSON.stringify(formattedResults, null, 2)}`,
        },
      ],
    };
  }

  private async handleVectorAskDocuments(args: any) {
    const {
      question,
      vectorStore,
      repository,
      topN = 5,
      minScore = 0.8,
      selector,
      useClustering = false
    } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    // Prepare vector store specification
    // If vectorStore doesn't contain ':', prepend catalog:
    const config = this.config.repositories[repoName];
    const vectorStoreSpec = vectorStore.includes(':') ? vectorStore : `${config.catalog}:${vectorStore}`;

    // Build the SPARQL query using llm:askMyDocuments
    let sparqlQuery = `PREFIX llm: <http://franz.com/ns/allegrograph/8.0.0/llm/>
PREFIX kw: <http://franz.com/ns/keyword#>

SELECT ?response ?score ?citationId ?citedText WHERE {
  (?response ?score ?citationId ?citedText) llm:askMyDocuments ('${question.replace(/'/g, "\\'")}' '${vectorStoreSpec}' kw:topN ${topN} kw:minScore ${minScore}`;

    if (selector) {
      sparqlQuery += ` kw:selector "${selector.replace(/"/g, '\\"')}"`;
    }

    if (useClustering) {
      sparqlQuery += ` kw:useClustering true`;
    }

    sparqlQuery += `)
}`;

    // Execute the query
    const url = this.getRepositoryUrl(repoName);
    const response = await this.axiosClients[repoName].get(url, {
      params: { query: sparqlQuery },
      headers: { Accept: 'application/sparql-results+json' },
    });

    const results = response.data.results.bindings;
    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No results found for RAG query on vector store '${vectorStore}' with minScore ${minScore}`,
          },
        ],
      };
    }

    // Extract the response (same across all rows) and citations
    const ragResponse = results[0].response?.value || '';
    const citations = results.map((r: any) => ({
      citationId: r.citationId?.value,
      score: parseFloat(r.score?.value || '0'),
      citedText: r.citedText?.value,
    }));

    return {
      content: [
        {
          type: 'text',
          text: `RAG Response from vector store '${vectorStore}':\n\nResponse: ${ragResponse}\n\nCitations (${citations.length}):\n${JSON.stringify(citations, null, 2)}`,
        },
      ],
    };
  }

  private async handleCheckVectorStore(args: any) {
    const { repository } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    const config = this.config.repositories[repoName];
    const url = `${this.getRepositoryUrl(repoName)}/vector-store-p`;

    // Compute vector store name format
    const vectorStoreName = config.catalog === 'root' ? repoName : `${config.catalog}:${repoName}`;

    try {
      const response = await this.axiosClients[repoName].get(url, {
        headers: { Accept: 'text/plain' },
      });

      const isVectorStore = response.data === true || response.data === 'true';

      if (isVectorStore) {
        return {
          content: [
            {
              type: 'text',
              text: `Repository '${repoName}' is a vector store.\n\nIMPORTANT: For vector queries (llm:nearestNeighbor, llm:askMyDocuments), use the vector store name: "${vectorStoreName}"`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Repository '${repoName}' is NOT a vector store`,
            },
          ],
        };
      }
    } catch (error) {
      // If endpoint doesn't exist or returns error, assume not a vector store
      return {
        content: [
          {
            type: 'text',
            text: `Repository '${repoName}' is NOT a vector store (or vector-store-p endpoint unavailable)`,
          },
        ],
      };
    }
  }

  private async handleGenerateSparqlOnly(args: any) {
    const { question, repository, includeComments = false } = args;
    const repoName = repository || this.currentRepository;

    if (!this.config.repositories[repoName]) {
      throw new McpError(ErrorCode.InvalidRequest, `Repository '${repoName}' not found`);
    }

    // This tool returns instructions for Claude to generate SPARQL without executing it
    // The actual SPARQL generation happens in Claude's reasoning, not here
    const instructions = `IMPORTANT: Generate ONLY the SPARQL query for this question. Do NOT execute it.

Question: "${question}"
Repository: ${repoName}

Steps to follow:
1. Read the SHACL schema: allegro://${repoName}/shacl
2. Search the query library using search_queries or list_all_queries for similar patterns
3. Read namespace prefixes: allegro://${repoName}/namespaces
4. Generate the SPARQL query based on the schema and patterns found
5. Return ONLY the SPARQL query text - no explanations, no execution, no results${includeComments ? '\n6. Include helpful comments in the query using # to explain each part' : ''}

Output format: Return ONLY the SPARQL query as plain text, nothing else.`;

    return {
      content: [
        {
          type: 'text',
          text: instructions,
        },
      ],
    };
  }

  private async getRepositoryInfo(repoName: string) {
    const config = this.config.repositories[repoName];
    const url = `${this.getRepositoryUrl(repoName)}/size`;
    const response = await this.axiosClients[repoName].get(url);

    // Compute vector store name format
    const vectorStoreName = config.catalog === 'root' ? repoName : `${config.catalog}:${repoName}`;

    return {
      repository: repoName,
      catalog: config.catalog,
      tripleCount: response.data,
      endpoint: `${config.protocol || 'https'}://${config.host}:${config.port}${this.getRepositoryUrl(repoName)}`,
      current: repoName === this.currentRepository,
      vectorStoreName: vectorStoreName,
      vectorStoreNameNote: `For vector operations (llm:nearestNeighbor, llm:askMyDocuments), use: "${vectorStoreName}"`,
    };
  }

  private async getNamespaces(repoName: string) {
    const url = `${this.getRepositoryUrl(repoName)}/namespaces`;
    const response = await this.axiosClients[repoName].get(url, {
      headers: { Accept: 'application/sparql-results+json' },
    });

    return response.data;
  }

  private async getShacl(repoName: string) {
    const url = `${this.getRepositoryUrl(repoName)}/data-generator/shacl`;
    const response = await this.axiosClients[repoName].get(url, {
      headers: { Accept: 'application/json' },
    });

    return response.data;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AllegroGraph Multi-Repository MCP server running on stdio');
  }
}

// Dynamic repository discovery
async function discoverRepositories(): Promise<MultiRepositoryConfig> {
  const host = process.env.AGRAPH_HOST || 'flux.franz.com';
  const port = parseInt(process.env.AGRAPH_PORT || '10000');
  const username = process.env.AGRAPH_USERNAME || 'demos';
  const password = process.env.AGRAPH_PASSWORD || 'demos';
  const catalog = process.env.AGRAPH_CATALOG || 'demos';
  const protocol = (process.env.AGRAPH_PROTOCOL as 'http' | 'https') || 'https';

  const baseUrl = `${protocol}://${host}:${port}`;
  const url = catalog === 'root'
    ? `${baseUrl}/repositories`
    : `${baseUrl}/catalogs/${catalog}/repositories`;

  try {
    const response = await axios.get(url, {
      auth: { username, password },
      headers: { Accept: 'application/json' }
    });

    const repositories: { [key: string]: RepositoryConfig } = {};
    let defaultRepo = process.env.DEFAULT_REPOSITORY;

    // Parse repository list
    const repoList = response.data;
    for (const repo of repoList) {
      const repoId = repo.id.replace(/"/g, ''); // Remove quotes from ID
      repositories[repoId] = {
        host,
        port,
        username,
        password,
        catalog,
        repository: repoId,
        protocol
      };
    }

    // Set default repository
    if (!defaultRepo && repoList.length > 0) {
      defaultRepo = repoList[0].id.replace(/"/g, '');
    }

    console.error(`Discovered ${Object.keys(repositories).length} repositories in catalog '${catalog}'`);

    return {
      defaultRepository: defaultRepo || 'olympics',
      repositories
    };
  } catch (error) {
    console.error(`Failed to discover repositories: ${error instanceof Error ? error.message : String(error)}`);
    console.error('Falling back to default configuration');

    // Fallback to default configuration
    return {
      defaultRepository: 'olympics',
      repositories: {
        olympics: { host, port, username, password, catalog, repository: 'olympics', protocol }
      }
    };
  }
}

// Initialize and run server
discoverRepositories().then(config => {
  const server = new AllegroGraphMCPServer(config);
  server.run().catch(console.error);
}).catch(console.error);
