//! Contract fixtures shared with @visual-engine/tui-shared (schema-first drift guard).

const FIXTURES: &[(&str, &str)] = &[
    (
        "backend canonical",
        include_str!("../../backend/tests/fixtures/tui-manifest.valid.json"),
    ),
    (
        "hello.tui.json",
        include_str!("../../packages/tui-shared/tests/fixtures/hello.tui.json"),
    ),
    (
        "charts.tui.json",
        include_str!("../../packages/tui-shared/tests/fixtures/charts.tui.json"),
    ),
    (
        "detail_w_table_0.json",
        include_str!("../../packages/tui-shared/tests/fixtures/detail_w_table_0.json"),
    ),
];

fn assert_manifest_shape(name: &str, v: &serde_json::Value) {
    assert!(
        v.get("taskId").and_then(|t| t.as_str()).is_some_and(|s| !s.is_empty()),
        "{name}: taskId required"
    );
    assert_eq!(v.get("operation").and_then(|o| o.as_str()), Some("SYNC_DASHBOARD"));
    let chunks = v
        .pointer("/layout/chunks")
        .and_then(|c| c.as_array())
        .unwrap_or_else(|| panic!("{name}: layout.chunks array required"));
    assert!(!chunks.is_empty(), "{name}: layout.chunks must not be empty");
    for (i, chunk) in chunks.iter().enumerate() {
        assert!(
            chunk.get("widgetId").and_then(|w| w.as_str()).is_some_and(|s| !s.is_empty()),
            "{name}: chunks[{i}].widgetId required"
        );
        assert!(
            chunk.get("type").and_then(|t| t.as_str()).is_some(),
            "{name}: chunks[{i}].type required"
        );
        let size = chunk
            .get("size")
            .and_then(|s| s.as_u64())
            .unwrap_or_else(|| panic!("{name}: chunks[{i}].size must be unsigned integer"));
        assert!(size >= 1, "{name}: chunks[{i}].size must be >= 1");
        assert!(chunk.get("props").is_some(), "{name}: chunks[{i}].props required");
    }
}

#[test]
fn deserializes_all_contract_fixtures() {
    for (name, raw) in FIXTURES {
        let v: serde_json::Value =
            serde_json::from_str(raw).unwrap_or_else(|e| panic!("{name}: json parse failed: {e}"));
        assert_manifest_shape(name, &v);
    }
}

#[test]
fn deserializes_canonical_backend_fixture() {
    let raw = include_str!("../../backend/tests/fixtures/tui-manifest.valid.json");
    let v: serde_json::Value = serde_json::from_str(raw).expect("json");
    assert_eq!(v["taskId"], "task_7749");
    assert_eq!(v["layout"]["chunks"].as_array().unwrap().len(), 2);
    assert_eq!(v["layout"]["chunks"][0]["type"], "Paragraph");
    assert_eq!(v["layout"]["chunks"][1]["type"], "Table");
}
