/**
 * SHACL Compression Module
 *
 * Compresses SHACL JSON-LD schemas to reduce token usage by 60-70%.
 * Ported from claude-mcp-in-lisp/compress-shacl.cl
 *
 * Compression strategy:
 * 1. Extract namespace prefixes from @context
 * 2. Convert full URIs to prefix:localName format
 * 3. Remove JSON-LD overhead (@id, @type, sh:NodeShape, etc.)
 * 4. Filter out OWL classes and rdf:type predicates
 * 5. Cache compressed results to filesystem
 */

import * as fs from 'fs';
import * as path from 'path';

// Cache directory for compressed SHACL
const SHACL_CACHE_DIR = '.shacl-cache';

export interface CompressedShacl {
  prefixes: { [prefix: string]: string };
  classes: {
    [className: string]: {
      [property: string]: { type: string };
    };
  };
}

interface CacheEntry {
  repositorySize: number;
  compressedShacl: CompressedShacl;
  timestamp: number;
}

/**
 * Extract namespace mappings from SHACL @context
 * Returns Map<uri, prefix> for reverse lookup
 */
function extractNamespacesFromContext(context: any): Map<string, string> {
  const prefixMap = new Map<string, string>();

  if (!context || typeof context !== 'object') {
    return prefixMap;
  }

  for (const [prefix, uri] of Object.entries(context)) {
    if (typeof uri === 'string') {
      prefixMap.set(uri, prefix);
    }
  }

  return prefixMap;
}

/**
 * Split a URI into namespace and local name
 */
function extractNamespaceAndLocal(uri: string): { namespace: string; localName: string } {
  // Try hash separator first
  const hashPos = uri.lastIndexOf('#');
  if (hashPos !== -1) {
    return {
      namespace: uri.substring(0, hashPos + 1),
      localName: uri.substring(hashPos + 1)
    };
  }

  // Try slash separator
  const slashPos = uri.lastIndexOf('/');
  if (slashPos !== -1) {
    return {
      namespace: uri.substring(0, slashPos + 1),
      localName: uri.substring(slashPos + 1)
    };
  }

  return { namespace: '', localName: uri };
}

/**
 * Get or assign a prefix for a namespace
 * If namespace not in map, assigns a new prefix like ns0, ns1, etc.
 */
function assignPrefix(namespace: string, prefixMap: Map<string, string>): string {
  const existing = prefixMap.get(namespace);
  if (existing) {
    return existing;
  }

  // Assign new prefix as fallback
  const newPrefix = `ns${prefixMap.size}`;
  prefixMap.set(namespace, newPrefix);
  return newPrefix;
}

/**
 * Convert a full URI to prefix:localName notation
 */
function uriToPrefixed(uri: string, prefixMap: Map<string, string>): string {
  if (!uri || uri === '') {
    return uri;
  }

  const { namespace, localName } = extractNamespaceAndLocal(uri);

  if (namespace === '') {
    return localName;
  }

  const prefix = assignPrefix(namespace, prefixMap);
  return `${prefix}:${localName}`;
}

/**
 * Check if a class should be skipped (OWL classes)
 */
function shouldSkipClass(targetClass: string): boolean {
  return targetClass.includes('owl:') ||
         targetClass.includes('http://www.w3.org/2002/07/owl#');
}

/**
 * Check if a property path should be skipped (rdf:type)
 */
function shouldSkipProperty(path: string): boolean {
  return path === 'rdf:type' ||
         path.includes('rdf-syntax-ns#type');
}

/**
 * Main compression function
 * Transforms SHACL JSON-LD into compact format for SPARQL generation
 */
export function compressShaclForSparql(shaclJsonLd: any): CompressedShacl {
  const result: CompressedShacl = {
    prefixes: {},
    classes: {}
  };

  // Extract @context and @graph
  const context = shaclJsonLd['@context'] || {};
  const graph = shaclJsonLd['@graph'] || [];

  // Build prefix map from @context (uri -> prefix)
  const prefixMap = extractNamespacesFromContext(context);

  // Process each shape in the graph
  for (const shape of graph) {
    const targetClass = shape['sh:targetClass'];
    const properties = shape['sh:property'] || [];

    if (!targetClass) {
      continue;
    }

    // Convert target class to prefixed form
    const classQName = uriToPrefixed(targetClass, prefixMap);

    // Skip OWL classes
    if (shouldSkipClass(classQName) || shouldSkipClass(targetClass)) {
      continue;
    }

    // Initialize class entry
    const classProps: { [property: string]: { type: string } } = {};

    // Process each property
    const propsArray = Array.isArray(properties) ? properties : [properties];
    for (const prop of propsArray) {
      const propPath = prop['sh:path'];
      const datatype = prop['sh:datatype'];
      const classRef = prop['sh:class'];

      if (!propPath) {
        continue;
      }

      // Skip rdf:type
      if (shouldSkipProperty(propPath)) {
        continue;
      }

      // Convert property path to prefixed form
      const propQName = uriToPrefixed(propPath, prefixMap);

      // Get type (datatype or class reference)
      let typeValue: string | null = null;
      if (datatype) {
        typeValue = uriToPrefixed(datatype, prefixMap);
      } else if (classRef) {
        typeValue = uriToPrefixed(classRef, prefixMap);
      }

      // Only add property if it has type information
      if (typeValue) {
        classProps[propQName] = { type: typeValue };
      }
    }

    // Only add class if it has properties
    if (Object.keys(classProps).length > 0) {
      result.classes[classQName] = classProps;
    }
  }

  // Convert prefix map to output format (prefix -> uri)
  for (const [uri, prefix] of prefixMap) {
    result.prefixes[prefix] = uri;
  }

  return result;
}

/**
 * Sanitize string for use in filename
 */
function sanitizeForFilename(str: string): string {
  return str
    .replace(/\//g, '-')
    .replace(/:/g, '-')
    .replace(/[\\*?"<>|]/g, '');
}

/**
 * Get cache filename for a catalog/repository combination
 */
function getCacheFilename(catalog: string, repository: string): string {
  const catalogStr = (!catalog || catalog === '/' || catalog === '') ? 'root' : catalog;
  const sanitizedCatalog = sanitizeForFilename(catalogStr);
  const sanitizedRepo = sanitizeForFilename(repository);
  return path.join(SHACL_CACHE_DIR, `${sanitizedCatalog}-${sanitizedRepo}.json`);
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDirectory(): void {
  if (!fs.existsSync(SHACL_CACHE_DIR)) {
    fs.mkdirSync(SHACL_CACHE_DIR, { recursive: true });
  }
}

/**
 * Read compressed SHACL from cache if available and valid
 * Cache is valid if repository size hasn't changed
 */
export function readShaclCache(
  catalog: string,
  repository: string,
  currentSize: number
): CompressedShacl | null {
  try {
    const cacheFile = getCacheFilename(catalog, repository);

    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const cacheContent = fs.readFileSync(cacheFile, 'utf-8');
    const cacheEntry: CacheEntry = JSON.parse(cacheContent);

    // Check if repository size matches (cache invalidation)
    if (cacheEntry.repositorySize !== currentSize) {
      console.error(`SHACL cache invalid for ${catalog}:${repository} (size changed: ${cacheEntry.repositorySize} -> ${currentSize})`);
      return null;
    }

    console.error(`SHACL cache hit for ${catalog}:${repository} (size=${currentSize})`);
    return cacheEntry.compressedShacl;
  } catch (error) {
    console.error(`Warning: Could not read SHACL cache: ${error}`);
    return null;
  }
}

/**
 * Write compressed SHACL to cache
 */
export function writeShaclCache(
  catalog: string,
  repository: string,
  repoSize: number,
  compressed: CompressedShacl
): void {
  try {
    ensureCacheDirectory();

    const cacheFile = getCacheFilename(catalog, repository);
    const cacheEntry: CacheEntry = {
      repositorySize: repoSize,
      compressedShacl: compressed,
      timestamp: Date.now()
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cacheEntry, null, 2), 'utf-8');
    console.error(`SHACL cached to ${cacheFile}`);
  } catch (error) {
    console.error(`Warning: Could not write SHACL cache: ${error}`);
  }
}

/**
 * Clear the SHACL cache for a specific repository or all repositories
 */
export function clearShaclCache(catalog?: string, repository?: string): void {
  try {
    if (catalog && repository) {
      const cacheFile = getCacheFilename(catalog, repository);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        console.error(`Cleared SHACL cache for ${catalog}:${repository}`);
      }
    } else {
      // Clear all cache files
      if (fs.existsSync(SHACL_CACHE_DIR)) {
        const files = fs.readdirSync(SHACL_CACHE_DIR);
        for (const file of files) {
          fs.unlinkSync(path.join(SHACL_CACHE_DIR, file));
        }
        console.error(`Cleared all SHACL cache files`);
      }
    }
  } catch (error) {
    console.error(`Warning: Could not clear SHACL cache: ${error}`);
  }
}
