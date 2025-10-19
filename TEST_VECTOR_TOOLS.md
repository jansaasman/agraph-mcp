# Testing Vector Tools in Claude Desktop

## Prerequisites
- Claude Desktop restarted with the updated MCP server
- Repository `chomsky47` has vector embeddings created
- You're connected to the `demos` catalog

## Test 1: vector_nearest_neighbor

This tool finds semantically similar text chunks without generating an answer.

### Test Query 1a: Basic Nearest Neighbor Search
Ask Claude Desktop:
```
Use the vector_nearest_neighbor tool to search for "causes of poverty" in the chomsky47 vector store. Show me the top 10 results with a minimum score of 0.0.
```

**Expected behavior:**
- Tool should be called with:
  - `text`: "causes of poverty"
  - `vectorStore`: "chomsky47" (will become 'demos:chomsky47')
  - `topN`: 10
  - `minScore`: 0.0
- Returns: List of embedding IDs, similarity scores, and matched text chunks

### Test Query 1b: With Higher Threshold
Ask Claude Desktop:
```
Use vector_nearest_neighbor to find text about "neoliberalism" in chomsky47, but only return results with similarity score above 0.7.
```

**Expected behavior:**
- Tool called with `minScore`: 0.7
- Returns: Only high-quality matches

### Test Query 1c: With Link to Source
Ask Claude Desktop:
```
Use vector_nearest_neighbor to search for "imperialism" in chomsky47 with linkToSource set to true so I can see what triples the embeddings came from.
```

**Expected behavior:**
- Tool called with `linkToSource`: true
- Returns: Embeddings with `vdbprop:id` links to source triples

---

## Test 2: vector_ask_documents (RAG)

This tool finds relevant chunks AND generates an LLM answer with citations.

### Test Query 2a: Simple Question
Ask Claude Desktop:
```
Use vector_ask_documents to ask: "What does Chomsky say about the causes of poverty?" Search the chomsky47 vector store.
```

**Expected behavior:**
- Tool called with:
  - `question`: "What does Chomsky say about the causes of poverty?"
  - `vectorStore`: "chomsky47"
  - Default `topN`: 5, `minScore`: 0.8
- Returns: LLM-generated response with citations showing which text chunks were used

### Test Query 2b: With Custom Parameters
Ask Claude Desktop:
```
Use vector_ask_documents to ask "What is Chomsky's view on US foreign policy?" in the chomsky47 vector store. Use topN of 10 and minScore of 0.85 to get high-quality results.
```

**Expected behavior:**
- Tool called with custom parameters
- Returns: More comprehensive answer using 10 chunks instead of 5

### Test Query 2c: Complex Question
Ask Claude Desktop:
```
Use vector_ask_documents to ask: "How does Chomsky connect neoliberal economic policies to increased poverty and inequality?" Search chomsky47.
```

**Expected behavior:**
- RAG system finds relevant passages about neoliberalism, poverty, and inequality
- LLM synthesizes an answer connecting these concepts
- Citations show which passages were used

---

## Test 3: Comparison Between Tools

### Direct Comparison Test
Ask Claude Desktop:
```
First, use vector_nearest_neighbor to find text about "democracy" in chomsky47 with topN of 5.

Then, use vector_ask_documents to ask "What does Chomsky say about democracy?" in chomsky47.

Compare the results and explain the difference between the two tools.
```

**Expected behavior:**
- `vector_nearest_neighbor`: Returns raw embedding matches (IDs, scores, text chunks)
- `vector_ask_documents`: Returns synthesized answer with citations
- Claude should explain that one is for retrieval, the other is for question-answering

---

## Test 4: Verify Single Quote Fix

### Natural Language Test
Ask Claude Desktop:
```
What are the main causes of poverty according to Chomsky in the chomsky47 repository?
```

**Expected behavior:**
- Claude should automatically use `vector_ask_documents` (since you're asking a question)
- Tool should succeed (previously would have failed due to double quote bug)
- You should get a comprehensive answer about Chomsky's views on poverty

### Verify Generated Query (Advanced)
If you want to see the actual SPARQL query being generated, you could:
1. Check the MCP server logs
2. Or ask Claude to describe what query it's generating

The query should look like:
```sparql
SELECT ?response ?score ?citationId ?citedText WHERE {
  (?response ?score ?citationId ?citedText) llm:askMyDocuments (
    'What are the main causes of poverty according to Chomsky?'  # ← SINGLE QUOTES
    'demos:chomsky47'                                            # ← SINGLE QUOTES
    kw:topN 5
    kw:minScore 0.8
  )
}
```

---

## Test 5: Error Cases

### Test with Non-existent Vector Store
Ask Claude Desktop:
```
Use vector_nearest_neighbor to search for "test" in the vector store "nonexistent".
```

**Expected behavior:**
- Should fail gracefully with an error message
- Error might indicate vector store doesn't exist or no embeddings found

### Test with Empty Query
Ask Claude Desktop:
```
Use vector_ask_documents with an empty question "" in chomsky47.
```

**Expected behavior:**
- Should handle empty input gracefully
- May return error or no meaningful results

---

## Quick Test Checklist

Copy and paste these one at a time into Claude Desktop:

- [ ] `Use vector_nearest_neighbor to find "poverty" in chomsky47`
- [ ] `Use vector_ask_documents to ask "What causes poverty?" in chomsky47`
- [ ] `What does Chomsky say about neoliberalism?` (should auto-use vector tools)
- [ ] `Compare vector_nearest_neighbor and vector_ask_documents results for "democracy" in chomsky47`

---

## Success Criteria

✅ Both tools execute without errors
✅ `vector_nearest_neighbor` returns embedding IDs, scores, and text
✅ `vector_ask_documents` returns LLM-generated answer with citations
✅ Generated SPARQL uses single quotes (not double quotes)
✅ Vector store name is correctly formatted as `'demos:chomsky47'`

---

## Troubleshooting

If tools fail:
1. Check that Claude Desktop was restarted after the build
2. Verify the API key issue is resolved
3. Use `check_vector_store` tool to confirm chomsky47 has embeddings
4. Check MCP server logs for detailed error messages
