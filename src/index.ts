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
        version: '0.2.0',
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
            description: 'Search the query library for previously successful queries by natural language description. Use this BEFORE writing complex queries to see if a similar query pattern already exists.',
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
      SELECT ?title ?description ?sparql ?repo ?created WHERE {
        ?q a query:StoredQuery ;
           dc:title ?title ;
           dc:description ?description ;
           query:sparqlText ?sparql ;
           query:repository ?repo .
        OPTIONAL { ?q dc:created ?created }
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

    // Store in query-library repository
    const queryLibraryConfig = this.config.repositories['query-library'];
    if (!queryLibraryConfig) {
      throw new McpError(ErrorCode.InvalidRequest, 'Query library repository not found');
    }

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

  private async getRepositoryInfo(repoName: string) {
    const config = this.config.repositories[repoName];
    const url = `${this.getRepositoryUrl(repoName)}/size`;
    const response = await this.axiosClients[repoName].get(url);
    
    return {
      repository: repoName,
      catalog: config.catalog,
      tripleCount: response.data,
      endpoint: `${config.protocol || 'https'}://${config.host}:${config.port}${this.getRepositoryUrl(repoName)}`,
      current: repoName === this.currentRepository,
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
