//! Test-only restricted canonical adapter. No production signing or trust API.
#![cfg(test)]
use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Value};
use std::{collections::BTreeMap, error::Error, fmt, fs, path::PathBuf, sync::OnceLock};
type Result<T> = std::result::Result<T, Box<dyn Error>>;
const DOCUMENT: usize = 1_048_576;
const CHUNK: usize = 4_194_304;
const ARTIFACT: u64 = 1_073_741_824;
fn require(valid: bool) -> Result<()> {
    if valid {
        Ok(())
    } else {
        Err("invalid canonical input".into())
    }
}
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..")
}
fn string(v: &Value) -> &str {
    v.as_str().expect("schema-validated string")
}
fn number(v: &Value) -> u64 {
    string(v).parse().expect("schema-validated uint64")
}
fn array(v: &Value) -> &[Value] {
    v.as_array().expect("schema-validated array")
}

// A seed bounds recursion during parsing; duplicate decoded keys never enter a map.
struct Restricted(usize);
impl<'de> DeserializeSeed<'de> for Restricted {
    type Value = Value;
    fn deserialize<D: de::Deserializer<'de>>(self, d: D) -> std::result::Result<Value, D::Error> {
        d.deserialize_any(self)
    }
}
impl<'de> Visitor<'de> for Restricted {
    type Value = Value;
    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("bounded strings/arrays/objects")
    }
    fn visit_str<E: de::Error>(self, v: &str) -> std::result::Result<Value, E> {
        Ok(Value::String(v.into()))
    }
    fn visit_string<E: de::Error>(self, v: String) -> std::result::Result<Value, E> {
        Ok(Value::String(v))
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> std::result::Result<Value, A::Error> {
        if self.0 >= 16 {
            return Err(de::Error::custom("depth"));
        }
        let mut values = Vec::new();
        while let Some(v) = a.next_element_seed(Restricted(self.0 + 1))? {
            values.push(v);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> std::result::Result<Value, A::Error> {
        if self.0 >= 16 {
            return Err(de::Error::custom("depth"));
        }
        let mut values = Map::new();
        while let Some(key) = a.next_key::<String>()? {
            if values.contains_key(&key) {
                return Err(de::Error::custom("duplicate"));
            }
            values.insert(key, a.next_value_seed(Restricted(self.0 + 1))?);
        }
        Ok(Value::Object(values))
    }
}
fn parse(bytes: &[u8]) -> Result<Value> {
    require(bytes.len() <= DOCUMENT)?;
    let mut d = serde_json::Deserializer::from_str(std::str::from_utf8(bytes)?);
    let value = Restricted(0).deserialize(&mut d)?;
    d.end()?;
    Ok(value)
}
fn schemas() -> &'static BTreeMap<String, jsonschema::Validator> {
    static SCHEMAS: OnceLock<BTreeMap<String, jsonschema::Validator>> = OnceLock::new();
    SCHEMAS.get_or_init(|| {
        let mut result = BTreeMap::new();
        for (version, kinds) in [
            (
                "1",
                "manifest plan approval key-context journal receipt operation-identity signature",
            ),
            ("2", "manifest plan signature"),
        ] {
            for kind in kinds.split_whitespace() {
                let directory = if version == "1" { "" } else { "v2/" };
                let schema: Value = serde_json::from_slice(
                    &fs::read(
                        root().join(format!("generated/canonical/{directory}{kind}.schema.json")),
                    )
                    .unwrap(),
                )
                .unwrap();
                // No network/file resolver features; only checked-in closed schemas are used.
                result.insert(
                    format!("{version}/{kind}"),
                    jsonschema::validator_for(&schema).unwrap(),
                );
            }
        }
        result
    })
}
fn semantics(kind: &str, v: &Value, version: &str) -> Result<()> {
    if version == "2" && matches!(kind, "plan" | "manifest") {
        require(string(&v["parameters"]["radix_bits"]) == &string(&v["precision"]["dtype"])[4..])?;
        if kind == "plan" {
            let ops = array(&v["operators"]);
            require(ops.iter().enumerate().all(|(i, x)| !ops[..i].contains(x)))?;
        }
    }
    let shapes = match kind {
        "manifest" => vec![&v["shape"]],
        "plan" => vec![&v["input_shape"], &v["output_shape"]],
        _ => vec![],
    };
    for shape in shapes {
        let mut product = 1u64;
        for dimension in array(shape) {
            let n = number(dimension);
            require(n > 0 && n <= 1_048_576 / product)?;
            product *= n;
        }
    }
    if let Some(p) = v.get("precision") {
        require(number(&p["fractional_bits"]) == 0)?;
    }
    if let Some(p) = v.get("parameters") {
        for field in ["radix_bits", "message_modulus", "carry_modulus"] {
            require(number(&p[field]) > 0)?;
        }
    }
    if v.get("expires_unix_ms").is_some() {
        require(number(&v["expires_unix_ms"]) > number(&v["valid_from_unix_ms"]))?;
    }
    if kind == "receipt" {
        require(number(&v["completed_unix_ms"]) >= number(&v["started_unix_ms"]))?;
    }
    if kind == "manifest" {
        let mut offset = 0;
        for (i, entry) in array(&v["ordered_chunk_entries"]).iter().enumerate() {
            let size = number(&entry["byte_length"]);
            require(
                number(&entry["index"]) == i as u64
                    && number(&entry["byte_offset"]) == offset
                    && size > 0
                    && size <= CHUNK as u64,
            )?;
            offset += size; // At most 1024 schema-validated chunks, each bounded above.
        }
        require(
            offset == number(&v["serialized_bytes"])
                && offset <= ARTIFACT
                && number(&v["max_expanded_bytes"]) >= offset
                && number(&v["max_expanded_bytes"]) <= ARTIFACT,
        )?;
    }
    Ok(())
}
fn jcs(value: &Value) -> Vec<u8> {
    serde_json_canonicalizer::to_vec(value).unwrap()
}
fn decode(kind: &str, bytes: &[u8], version: &str) -> Result<Value> {
    let schema = schemas()
        .get(&format!("{version}/{kind}"))
        .ok_or("kind/version")?;
    let value = parse(bytes)?;
    require(schema.is_valid(&value))?;
    semantics(kind, &value, version)?;
    require(jcs(&value) == bytes)?;
    Ok(value)
}
fn domain(kind: &str, version: &str) -> Vec<u8> {
    format!("kryvola/{kind}/v{version}\0").into_bytes()
}
fn hash(parts: &[&[u8]]) -> String {
    let mut h = blake3::Hasher::new();
    for part in parts {
        h.update(part);
    }
    h.finalize().to_hex().to_string()
}
fn commitment(kind: &str, bytes: &[u8], version: &str) -> Result<String> {
    require(kind != "signature")?;
    decode(kind, bytes, version)?;
    Ok(hash(&[&domain(kind, version), bytes]))
}
fn chunk(index: u64, bytes: &[u8]) -> Result<String> {
    require(!bytes.is_empty() && bytes.len() <= CHUNK)?;
    Ok(hash(&[
        &domain("chunk", "1"),
        &index.to_le_bytes(),
        &(bytes.len() as u64).to_le_bytes(),
        bytes,
    ]))
}
fn blob(bytes: &[u8]) -> Result<String> {
    require(!bytes.is_empty() && bytes.len() as u64 <= ARTIFACT)?;
    Ok(hash(&[&domain("blob", "1"), bytes]))
}
fn preimage(envelope: &Value, bytes: &[u8], version: &str) -> Result<Vec<u8>> {
    decode("signature", &jcs(envelope), version)?;
    let kind = string(&envelope["payload_kind"]);
    require(commitment(kind, bytes, version)? == string(&envelope["payload_digest"]))?;
    let mut header = envelope.clone();
    header.as_object_mut().unwrap().remove("signature");
    let metadata = jcs(&header);
    Ok([
        domain(&format!("signature/{kind}"), version),
        (metadata.len() as u64).to_le_bytes().to_vec(),
        metadata,
        (bytes.len() as u64).to_le_bytes().to_vec(),
        bytes.to_vec(),
    ]
    .concat())
}
mod tests;
