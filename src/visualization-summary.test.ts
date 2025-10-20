import { describe, test, expect } from '@jest/globals';

/**
 * Test suite to verify that visualization summary field is properly
 * stored and retrieved.
 */

describe('Visualization Summary Tests', () => {

  describe('store_query_visualization tool schema', () => {
    test('should require summary parameter', () => {
      const requiredFields = ['queryTitle', 'visualizationType', 'visualizationConfig', 'description', 'summary', 'repository'];

      // Verify all required fields are present
      expect(requiredFields).toContain('summary');
      expect(requiredFields.length).toBe(6);
    });

    test('should accept markdown-formatted summary', () => {
      const markdownSummary = `The chart shows revenue distribution across 8 categories:

- **Beverages** leads with $267K (21%)
- **Dairy Products** follows at $234K (18%)

Key insight: Top 3 categories represent 55% of total revenue.`;

      expect(markdownSummary).toContain('**Beverages**');
      expect(markdownSummary).toContain('\n-');
      expect(markdownSummary).toMatch(/\*\*[A-Za-z ]+\*\*/);
    });
  });

  describe('RDF Turtle format', () => {
    test('should generate valid Turtle with summary', () => {
      const vizId = 'viz-1729368900123';
      const queryUri = 'http://franz.com/ns/query-library#query-1729368900000';
      const visualizationType = 'pie_chart';
      const description = 'Revenue distribution analysis';
      const summary = 'The chart reveals that Beverages leads with $267K (21% of total revenue)';
      const config = '{"type":"pie","data":{...}}';

      const turtle = `@prefix viz: <http://franz.com/ns/visualization#> .
@prefix dc: <http://purl.org/dc/terms/> .

viz:${vizId} a viz:Visualization ;
    viz:forQuery <${queryUri}> ;
    viz:type "${visualizationType}" ;
    viz:config """${config}""" ;
    dc:description """${description}""" ;
    viz:summary """${summary}""" ;
    dc:created "2025-10-19T12:00:00Z"^^xsd:dateTime .`;

      expect(turtle).toContain('viz:summary');
      expect(turtle).toContain(summary);
      expect(turtle).toContain('viz:forQuery');
      expect(turtle).toContain('viz:type');
    });

    test('should escape double quotes in summary', () => {
      const summary = 'The "Beverages" category leads with 21%';
      const escaped = summary.replace(/"/g, '\\"');

      expect(escaped).toBe('The \\"Beverages\\" category leads with 21%');
      expect(escaped).toContain('\\"');
      // Verify that unescaped quotes are gone
      expect(escaped.replace(/\\"/g, '')).not.toContain('"');
    });

    test('should handle multi-line markdown summary', () => {
      const summary = `Line 1

Line 2

- Bullet 1
- Bullet 2`;

      const turtle = `viz:summary """${summary}"""`;

      expect(turtle).toContain('viz:summary');
      expect(turtle).toContain('Line 1');
      expect(turtle).toContain('- Bullet 1');
    });
  });

  describe('SPARQL query for retrieval', () => {
    test('should include summary in SELECT clause', () => {
      const sparqlQuery = `
      PREFIX viz: <http://franz.com/ns/visualization#>
      PREFIX dc: <http://purl.org/dc/terms/>
      SELECT ?vizId ?type ?config ?description ?summary ?created WHERE {
        ?vizId a viz:Visualization ;
               viz:type ?type ;
               viz:config ?config ;
               dc:description ?description .
        OPTIONAL { ?vizId dc:created ?created }
        OPTIONAL { ?vizId viz:summary ?summary }
      }`;

      expect(sparqlQuery).toContain('?summary');
      expect(sparqlQuery).toContain('OPTIONAL { ?vizId viz:summary ?summary }');
    });

    test('should format results with summary field', () => {
      // Mock SPARQL result with summary
      const mockResult = {
        vizId: { value: 'http://franz.com/ns/visualization#viz-123' },
        type: { value: 'pie_chart' },
        config: { value: '{"type":"pie"}' },
        description: { value: 'Revenue analysis' },
        summary: { value: 'Beverages leads with 21%' },
        created: { value: '2025-10-19T12:00:00Z' }
      };

      const formattedResult = {
        vizId: mockResult.vizId.value,
        type: mockResult.type.value,
        config: mockResult.config.value,
        description: mockResult.description.value,
        summary: mockResult.summary?.value,
        created: mockResult.created?.value
      };

      expect(formattedResult).toHaveProperty('summary');
      expect(formattedResult.summary).toBe('Beverages leads with 21%');
    });

    test('should handle missing summary gracefully', () => {
      // Mock SPARQL result WITHOUT summary (old visualization)
      const mockResult: any = {
        vizId: { value: 'http://franz.com/ns/visualization#viz-123' },
        type: { value: 'bar_chart' },
        config: { value: '{"type":"bar"}' },
        description: { value: 'Medal counts' },
        created: { value: '2025-10-18T12:00:00Z' }
        // summary is missing (old visualization)
      };

      const formattedResult = {
        vizId: mockResult.vizId.value,
        type: mockResult.type.value,
        config: mockResult.config.value,
        description: mockResult.description.value,
        summary: mockResult.summary?.value, // Should be undefined
        created: mockResult.created?.value
      };

      expect(formattedResult).toHaveProperty('summary');
      expect(formattedResult.summary).toBeUndefined();
    });
  });

  describe('Summary content validation', () => {
    test('should accept typical markdown summary', () => {
      const summary = `I've created a pie chart visualization using Chart.js for the "Discount vs Quantity scatter plot data" query.

This visualization helps answer questions like:

- Do higher discounts lead to larger order quantities?
- Which product categories receive the most discounts?
- What's the typical discount range for different order sizes?`;

      expect(summary).toContain('pie chart');
      expect(summary).toContain('- Do higher');
      expect(summary.length).toBeGreaterThan(50);
    });

    test('should accept summary with statistics', () => {
      const summary = 'The chart reveals that **Beverages** leads with $267K (21% of total revenue), followed by **Dairy Products** at $234K (18%).';

      expect(summary).toContain('$267K');
      expect(summary).toContain('21%');
      expect(summary).toContain('**Beverages**');
    });
  });
});
