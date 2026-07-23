//@realizes: [contracts/graph#GraphSchema]
// DDL per spec §3 + lint views for the §20.8 invariants implementable from the graph alone.

export const GRAPH_SCHEMA_VERSION = '1.0.2';
export const LYNXCONTRACT_SPEC_VERSION = '1.3-jvm';

export const DDL = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE nodes (
  id    TEXT PRIMARY KEY,
  kind  TEXT NOT NULL,
  name  TEXT,
  file  TEXT,
  line  INTEGER,
  attrs TEXT NOT NULL DEFAULT '{}'
) WITHOUT ROWID;

CREATE TABLE edges (
  src   TEXT NOT NULL,
  dst   TEXT NOT NULL,
  kind  TEXT NOT NULL,
  attrs TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (src, dst, kind)
) WITHOUT ROWID;

CREATE VIRTUAL TABLE fts USING fts5(node_id UNINDEXED, body);
`;

// Indexes are created AFTER bulk insert (DeterministicBuild rule).
export const INDEX_DDL = `
CREATE INDEX idx_nodes_kind ON nodes(kind);
CREATE INDEX idx_nodes_file ON nodes(file);
CREATE INDEX idx_edges_dst_kind ON edges(dst, kind);
CREATE INDEX idx_edges_src_kind ON edges(src, kind);
CREATE INDEX idx_edges_kind ON edges(kind);
`;

export const VIEW_DDL = `
CREATE VIEW targets AS
  SELECT id, name, file, json_extract(attrs,'$.exists') AS exists_on_disk,
         json_extract(attrs,'$.blocked_reason') AS blocked_reason
  FROM nodes WHERE kind='target';

CREATE VIEW clauses AS
  SELECT id, name, file, line, json_extract(attrs,'$.clause_kind') AS clause_kind
  FROM nodes WHERE kind='clause';

CREATE VIEW markers AS
  SELECT id, json_extract(attrs,'$.marker_kind') AS marker_kind, file, line, name AS text
  FROM nodes WHERE kind='marker';

-- §20.8-5 realization completeness: every stub has TARGET + REALIZATION
CREATE VIEW lint_missing_realization AS
  SELECT 'realization-completeness' AS invariant, id AS node_id,
         'stub lacks ' ||
           CASE WHEN json_extract(attrs,'$.target') IS NULL THEN 'TARGET' ELSE 'REALIZATION' END
           || ' header (§20.1, §20.8-5)' AS message
  FROM nodes
  WHERE kind='stub'
    AND json_extract(attrs,'$.realization') IS NOT 'n/a'
    AND (json_extract(attrs,'$.target') IS NULL OR json_extract(attrs,'$.realization') IS NULL);

-- §20.8-2 token closure: every used fill has a registry row
CREATE VIEW lint_unregistered_fills AS
  SELECT 'token-closure' AS invariant, id AS node_id,
         'fill {{' || name || '}} has no Fill Registry row (§20.2, §20.8-2)' AS message
  FROM nodes WHERE kind='fill_token' AND json_extract(attrs,'$.registered')=0;

-- §20.8-3 anchor resolution
CREATE VIEW lint_dangling_anchors AS
  SELECT 'anchor-resolution' AS invariant, src AS node_id,
         'unresolved reference ' || json_extract(attrs,'$.ref') || ' (§7.1, §20.8-3)' AS message
  FROM edges WHERE json_extract(attrs,'$.resolved')=0;

-- §20.8-8 output-target completion: planned target exists or carries a blocked reason
CREATE VIEW lint_missing_targets AS
  SELECT 'output-target-completion' AS invariant, id AS node_id,
         'planned target missing on disk with no blocked reason (§20.8-8)' AS message
  FROM nodes WHERE kind='target'
    AND json_extract(attrs,'$.exists')=0
    AND json_extract(attrs,'$.blocked_reason') IS NULL;

-- §20.8-9 test-case completion: every clause is covered or carries a logged scope reduction
CREATE VIEW lint_uncovered_clauses AS
  SELECT 'test-case-completion' AS invariant, n.id AS node_id,
         'clause ' || n.name || ' has no covering test case (§20.8-9)' AS message
  FROM nodes n
  WHERE n.kind='clause'
    AND json_extract(n.attrs,'$.scope_reduced') IS NULL
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.dst=n.id AND e.kind='covers');

CREATE VIEW lint_violations AS
  SELECT * FROM lint_missing_realization
  UNION ALL SELECT * FROM lint_unregistered_fills
  UNION ALL SELECT * FROM lint_dangling_anchors
  UNION ALL SELECT * FROM lint_missing_targets
  UNION ALL SELECT * FROM lint_uncovered_clauses;

-- ==== contract↔code drift (fidelity surface — deliberately NOT part of lint_violations) ====

CREATE VIEW drift_unrealized_signature AS
  SELECT 'signature-unrealized' AS class, c.id AS node_id,
         'contract declares "' || json_extract(c.attrs,'$.signature') || '" but no method in ' || t.name || ' realizes it' AS message
  FROM nodes c
  JOIN edges rb ON rb.src=c.id AND rb.kind='realized_by' AND json_extract(rb.attrs,'$.resolved')=1
  JOIN nodes t ON t.id=rb.dst AND json_extract(t.attrs,'$.exists')=1
  WHERE c.kind='contract' AND json_extract(c.attrs,'$.signature') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM edges m WHERE m.dst=c.id AND m.kind='realizes' AND instr(m.src,'method:')>0);

CREATE VIEW drift_orphan_methods AS
  SELECT 'undeclared-method' AS class, n.id AS node_id,
         'method ' || n.name || ' in ' || n.file || ' realizes no contract — code the contract layer does not know' AS message
  FROM nodes n WHERE n.kind='method'
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.src=n.id AND e.kind='realizes');

CREATE VIEW drift_unexplained_markers AS
  SELECT 'unexplained-marker' AS class, n.id AS node_id,
         json_extract(n.attrs,'$.marker_kind') || ' marker at ' || n.file || ':' || (n.line+1) || ' has no gap-ledger entry explaining it' AS message
  FROM nodes n WHERE n.kind='marker'
    AND json_extract(n.attrs,'$.marker_kind') IN ('template-gap','reconstructed','waiver')
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.dst=n.id AND e.kind='explains');

CREATE VIEW drift_unrealized_contracts AS
  SELECT 'contract-without-code' AS class, c.id AS node_id,
         'realizedBy target ' || t.name || ' does not exist on disk' AS message
  FROM nodes c JOIN edges rb ON rb.src=c.id AND rb.kind='realized_by'
  JOIN nodes t ON t.id=rb.dst
  WHERE c.kind='contract' AND json_extract(t.attrs,'$.exists')=0;

CREATE VIEW contract_drift AS
  SELECT * FROM drift_unrealized_signature
  UNION ALL SELECT * FROM drift_orphan_methods
  UNION ALL SELECT * FROM drift_unexplained_markers
  UNION ALL SELECT * FROM drift_unrealized_contracts;

-- ============ §6.3 hologram views (org scale; empty on single-module indexes) ============

CREATE VIEW org_event_mesh AS
  SELECT t.name AS topic,
         p.src AS producer, json_extract(pn.attrs,'$.module') AS producer_module,
         c.src AS consumer, json_extract(cn.attrs,'$.module') AS consumer_module
  FROM nodes t
  LEFT JOIN edges p ON p.dst=t.id AND p.kind='produces'
  LEFT JOIN nodes pn ON pn.id=p.src
  LEFT JOIN edges c ON c.dst=t.id AND c.kind='consumes'
  LEFT JOIN nodes cn ON cn.id=c.src
  WHERE t.kind='topic';

CREATE VIEW org_orphan_topics AS
  SELECT * FROM (
    SELECT t.id AS node_id, t.name AS topic,
      (SELECT count(*) FROM edges p WHERE p.dst=t.id AND p.kind='produces') AS producers,
      (SELECT count(*) FROM edges c WHERE c.dst=t.id AND c.kind='consumes') AS consumers
    FROM nodes t WHERE t.kind='topic')
  WHERE producers=0 OR consumers=0;

CREATE VIEW org_privacy_taint AS
  SELECT t.name AS topic, p.src AS producer, json_extract(pn.attrs,'$.privacy') AS produced_privacy,
         c.src AS consumer, coalesce(json_extract(cn.attrs,'$.privacy'),'undeclared') AS consumer_privacy
  FROM nodes t
  JOIN edges p ON p.dst=t.id AND p.kind='produces' JOIN nodes pn ON pn.id=p.src
  JOIN edges c ON c.dst=t.id AND c.kind='consumes' JOIN nodes cn ON cn.id=c.src
  WHERE t.kind='topic'
    AND json_extract(pn.attrs,'$.privacy') IN ('pii','phi')
    AND coalesce(json_extract(cn.attrs,'$.privacy'),'undeclared') NOT IN ('pii','phi')
    AND json_extract(pn.attrs,'$.module') IS NOT json_extract(cn.attrs,'$.module');

CREATE VIEW org_layer_violations AS
  SELECT d.src AS module, d.dst AS depends_on, 'restricted-dependency' AS violation
  FROM edges d JOIN edges r ON r.kind='restricts' AND d.kind='depends' AND r.src=d.dst AND r.dst=d.src
  WHERE d.src LIKE 'module:%'
  UNION ALL
  SELECT a.src, a.dst, 'dependency-2cycle'
  FROM edges a JOIN edges b ON a.kind='depends' AND b.kind='depends' AND a.dst=b.src AND b.dst=a.src AND a.src < b.src
  WHERE a.src LIKE 'module:%';

CREATE VIEW org_frozen_surface AS
  SELECT n.id AS node_id, n.name, json_extract(n.attrs,'$.module') AS module,
         json_extract(n.attrs,'$.frozen') AS frozen, json_extract(n.attrs,'$.closed') AS closed,
         json_extract(n.attrs,'$.values') AS surface_values
  FROM nodes n WHERE n.kind='enum_surface';

CREATE VIEW org_ownership AS
  SELECT o.name AS owner, e.dst AS module
  FROM nodes o JOIN edges e ON e.src=o.id AND e.kind='owns'
  WHERE o.kind='owner';

CREATE VIEW org_health AS
  SELECT m.id AS module, json_extract(m.attrs,'$.layer') AS layer,
    coalesce(agg.contracts, 0) AS contracts,
    coalesce(agg.stubs, 0) AS stubs,
    coalesce(agg.targets, 0) AS targets,
    coalesce(agg.targets_missing, 0) AS targets_missing,
    coalesce(lv.n, 0) AS lint_violations
  FROM nodes m
  LEFT JOIN (
    SELECT json_extract(attrs,'$.module') AS mod,
      sum(kind='contract') AS contracts,
      sum(kind='stub') AS stubs,
      sum(kind='target') AS targets,
      sum(kind='target' AND json_extract(attrs,'$.exists')=0) AS targets_missing
    FROM nodes WHERE json_extract(attrs,'$.module') IS NOT NULL GROUP BY mod
  ) agg ON agg.mod = substr(m.id, 8)
  LEFT JOIN (
    SELECT substr(node_id, 1, instr(node_id,'/')-1) AS mod, count(*) AS n
    FROM lint_violations WHERE instr(node_id,'/') > 0 GROUP BY mod
  ) lv ON lv.mod = substr(m.id, 8)
  WHERE m.kind='module';

CREATE VIEW org_lint_violations AS
  SELECT 'orphan-topic' AS invariant, node_id,
         'topic ' || topic || ' has ' || producers || ' producer(s) / ' || consumers || ' consumer(s) — dead wiring (§6.3)' AS message
  FROM org_orphan_topics
  UNION ALL
  SELECT 'privacy-taint', consumer,
         'pii flow into ' || topic || ' consumed at privacy=' || consumer_privacy || ' across a module boundary (§6.3, §17)'
  FROM org_privacy_taint
  UNION ALL
  SELECT 'layer-violation', module, violation || ' → ' || depends_on || ' (§12, §17)'
  FROM org_layer_violations;
`;

/** Worked example queries served by lynx_schema (spec §5: an agent bootstraps from these). */
export const EXAMPLE_QUERIES: { q: string; sql: string }[] = [
  { q: 'All lint violations', sql: 'SELECT * FROM lint_violations' },
  { q: 'Every contract in a file', sql: "SELECT id, name, line FROM nodes WHERE kind='contract' AND file='template/StartCaptureRoute.lynx.kt'" },
  { q: 'What realizes a contract', sql: "SELECT e.dst FROM edges e WHERE e.kind='realized_by' AND e.src LIKE 'contract:%StartCaptureRoute%'" },
  { q: 'Topics and their producers/consumers', sql: "SELECT n.name topic, e.kind, e.src FROM nodes n JOIN edges e ON e.dst=n.id WHERE n.kind='topic' ORDER BY n.name" },
  { q: 'Targets missing on disk', sql: 'SELECT id, blocked_reason FROM targets WHERE exists_on_disk=0' },
  { q: 'Full-text search contract text', sql: "SELECT node_id FROM fts WHERE fts MATCH 'idempotent'" },
  { q: 'All markers in the generated tree', sql: 'SELECT marker_kind, file, line, text FROM markers' },
  { q: 'Fill tokens with values in force', sql: "SELECT t.name token, v.name value FROM nodes t JOIN edges e ON e.src=t.id AND e.kind='instantiates' JOIN nodes v ON v.id=e.dst WHERE t.kind='fill_token'" },
  { q: 'Transitive impact of a fill token (2 hops)', sql: "WITH RECURSIVE reach(id) AS (SELECT 'fill_token:template/fill-registry.md#Command' UNION SELECT e.dst FROM edges e JOIN reach ON e.src=reach.id) SELECT id FROM reach" },
  { q: 'Uncovered raises clauses', sql: 'SELECT * FROM lint_uncovered_clauses' },
  { q: 'Gap ledger with explaining markers', sql: "SELECT g.name gap, e.dst marker FROM nodes g LEFT JOIN edges e ON e.src=g.id AND e.kind='explains' WHERE g.kind='gap'" },
];
