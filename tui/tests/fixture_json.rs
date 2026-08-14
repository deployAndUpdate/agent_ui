//! Integration-style checks compiled with `cargo test`.
//! Fixture path is relative to crate root.

#[test]
fn deserializes_canonical_backend_fixture() {
    let raw = include_str!("../../backend/tests/fixtures/tui-manifest.valid.json");
    let v: serde_json::Value = serde_json::from_str(raw).expect("json");
    assert_eq!(v["taskId"], "task_7749");
    assert_eq!(v["layout"]["chunks"].as_array().unwrap().len(), 2);
    assert_eq!(v["layout"]["chunks"][0]["type"], "Paragraph");
    assert_eq!(v["layout"]["chunks"][1]["type"], "Table");
}
