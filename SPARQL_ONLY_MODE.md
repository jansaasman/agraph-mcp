# SPARQL-Only Mode - Usage Guide

## Overview

The new `generate_sparql_only` tool forces Claude Desktop to return ONLY the SPARQL query without executing it or providing explanations. This is perfect when you want to copy/paste queries or learn SPARQL syntax.

## How to Use

### Method 1: Use the "sparql:" prefix
Simply start your prompt with `sparql:` and Claude will automatically use the `generate_sparql_only` tool.

**Examples:**
```
sparql: how many chapters are in a book
```

```
sparql: find all athletes born in France
```

```
sparql: count triples in the repository
```

### Method 2: Explicitly request it
Ask Claude to use the tool directly:

```
Use generate_sparql_only to create a query that finds all books with more than 5 chapters
```

## What Happens

When you use this tool, Claude will:
1. ✅ Read the SHACL schema to understand available classes and predicates
2. ✅ Search the query library for similar query patterns
3. ✅ Read namespace prefixes
4. ✅ Generate the SPARQL query
5. ✅ Return ONLY the query text - nothing else
6. ❌ NOT execute the query
7. ❌ NOT show results
8. ❌ NOT provide explanations (unless you ask for comments)

## Options

### Include Comments in Query
If you want the SPARQL query to include helpful comments:

```
sparql: how many chapters are in a book (with comments)
```

Or explicitly:
```
Use generate_sparql_only with includeComments=true to find all athletes born in France
```

This will generate something like:
```sparql
PREFIX ex: <http://example.org/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT (COUNT(?chapter) AS ?chapterCount)
WHERE {
  # Find all books
  ?book a ex:Book .

  # Count their chapters
  ?book ex:hasChapter ?chapter .
}
```

### Specify Repository
```
sparql: find all people in the wikidata repository
```

Or:
```
Use generate_sparql_only for repository "olympics" to count all athletes
```

## Comparison: Normal vs SPARQL-Only Mode

### Normal Mode (Default Behavior)
**User:** "How many chapters are in a book?"

**Claude Response:**
- Reads schema
- Generates SPARQL query
- **Executes** the query using `sparql_query` tool
- Shows the results
- Explains what was found
- May store the query in the library

### SPARQL-Only Mode (New Feature)
**User:** "sparql: how many chapters are in a book"

**Claude Response:**
```sparql
PREFIX ex: <http://example.org/>

SELECT (COUNT(?chapter) AS ?chapterCount)
WHERE {
  ?book a ex:Book ;
        ex:hasChapter ?chapter .
}
```

That's it! Just the query.

## Use Cases

### 1. Learning SPARQL
```
sparql: find all books with their titles and authors
```
Get the query to study SPARQL syntax.

### 2. Copy/Paste to Other Tools
```
sparql: complex aggregation query for athlete statistics
```
Copy the generated query to use in WebProtégé, GraphDB, or other SPARQL editors.

### 3. Query Development
```
sparql: find all subjects that have more than 10 predicates (with comments)
```
Get a well-commented query you can modify and test.

### 4. Documentation
```
sparql: show me the query for finding orphaned nodes
```
Generate example queries for documentation.

### 5. Query Library Building
```
sparql: find all entities with missing required properties
```
Get queries to manually review before adding to the query library.

## Tips

### Tip 1: Be Specific
**Bad:** `sparql: find books`
**Good:** `sparql: find all books with their titles, authors, and publication years`

### Tip 2: Use Comments for Complex Queries
```
sparql: complex federated query across multiple graphs (with comments)
```

### Tip 3: Specify Format Preferences
```
sparql: find all athletes born after 1990, use prefixes to make it readable
```

### Tip 4: Ask for Optimizations
```
sparql: find books with chapters, optimize for performance
```

### Tip 5: Request Specific SPARQL Features
```
sparql: use OPTIONAL to find books with or without ISBNs
```

## Advanced Examples

### Example 1: WITH vs WITHOUT Comments

**Without comments:**
```
sparql: find athletes with their medals and countries
```

Output:
```sparql
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

SELECT ?athlete ?medal ?country
WHERE {
  ?athlete wdt:P31 wd:Q5 ;
           wdt:P106 wd:Q2066131 ;
           wdt:P166 ?medal ;
           wdt:P27 ?country .
}
```

**With comments:**
```
sparql: find athletes with their medals and countries (with comments)
```

Output:
```sparql
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>

SELECT ?athlete ?medal ?country
WHERE {
  # Find humans (Q5)
  ?athlete wdt:P31 wd:Q5 ;

  # Who are athletes (Q2066131)
           wdt:P106 wd:Q2066131 ;

  # Get their awards/medals
           wdt:P166 ?medal ;

  # And their country of citizenship
           wdt:P27 ?country .
}
```

### Example 2: Repository-Specific Query
```
sparql: in the chomsky47 repository, find all documents about neoliberalism
```

### Example 3: Complex Aggregation
```
sparql: count how many books each author has written, order by book count descending, limit to top 10 authors
```

## Troubleshooting

### Problem: Claude still executes the query
**Solution:** Make sure you're using the `sparql:` prefix or explicitly mentioning `generate_sparql_only` tool.

### Problem: Too much explanation
**Solution:** After getting the response, say: "Just show me the query, nothing else"

### Problem: Query doesn't match my schema
**Solution:** The tool reads SHACL schema automatically, but if it's outdated, run:
```
Check the SHACL schema for the current repository first
```

Then retry:
```
sparql: [your question]
```

## Integration with Normal Workflow

You can mix both modes:

1. **Generate query only:**
   ```
   sparql: find all books published after 2000
   ```

2. **Review the query**

3. **Execute it:**
   ```
   Now execute that query
   ```

4. **Modify and re-execute:**
   ```
   Change the year to 1990 and execute again
   ```

## Version Information

- **Added in:** v0.3.0
- **Tool name:** `generate_sparql_only`
- **Trigger keywords:** `sparql:` prefix or explicit tool call

---

## Quick Reference Card

| What you want | How to ask |
|---------------|------------|
| Just the query | `sparql: [question]` |
| Query with comments | `sparql: [question] (with comments)` |
| Specific repository | `sparql: in [repo] find [...]` |
| Then execute | First get query, then say "execute it" |
| Learn by example | `sparql: [complex scenario]` |

---

**Remember:** The tool generates the query based on:
- SHACL schema (knows your data structure)
- Query library (learns from successful patterns)
- Namespaces (uses proper prefixes)

So the queries should be accurate and ready to use!
