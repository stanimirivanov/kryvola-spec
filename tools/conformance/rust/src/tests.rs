use super::*;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
fn corpus(name: &str) -> Value {
    serde_json::from_slice(
        &fs::read(root().join(format!("generated/fixtures/canonical-{name}.json"))).unwrap(),
    )
    .unwrap()
}
fn golden(name: &str, kind: &str) -> Value {
    corpus(name)["objects"]
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["kind"] == kind)
        .unwrap()
        .clone()
}
#[test]
fn normative_objects_commitments_and_public_signatures() -> Result<()> {
    for (name, version) in [("corpus", "1"), ("modular-v2", "2")] {
        let c = corpus(name);
        let key = VerifyingKey::from_bytes(
            &hex::decode(string(&c["public_key_hex"]))?
                .try_into()
                .unwrap(),
        )?;
        for vector in array(&c["objects"]) {
            let kind = string(&vector["kind"]);
            let bytes = hex::decode(string(&vector["canonical_hex"]))?;
            assert_eq!(jcs(&vector["value"]), bytes);
            assert_eq!(decode(kind, &bytes, version)?, vector["value"]);
            assert_eq!(commitment(kind, &bytes, version)?, vector["digest"]);
            let transcript_preimage = if let Some(envelope) = vector.get("envelope") {
                hex::encode(preimage(envelope, &bytes, version)?)
            } else {
                String::new()
            };
            println!(
                "KRYVOLA_RESULT {}",
                serde_json::json!([
                    version,
                    kind,
                    hex::encode(jcs(&vector["value"])),
                    commitment(kind, &bytes, version)?,
                    transcript_preimage
                ])
            );
            let mut missing = vector["value"].clone();
            missing.as_object_mut().unwrap().remove("tenant_scope");
            assert!(decode(kind, &jcs(&missing), version).is_err());
            let mut unknown = vector["value"].clone();
            unknown["unknown"] = "x".into();
            assert!(decode(kind, &jcs(&unknown), version).is_err());
            assert_ne!(
                hash(&[&domain("wrong-domain", version), &bytes]),
                vector["digest"]
            );
            if let Some(envelope) = vector.get("envelope") {
                let message = preimage(envelope, &bytes, version)?;
                assert_eq!(hex::encode(&message), vector["preimage_hex"]);
                let signature = Signature::from_slice(
                    &URL_SAFE_NO_PAD.decode(string(&envelope["signature"]))?,
                )?;
                key.verify_strict(&message, &signature)?;
                let mut tampered = message.clone();
                tampered[0] ^= 1;
                assert!(key.verify_strict(&tampered, &signature).is_err());
                let mut changed = envelope.clone();
                changed["signer"] = "other".into();
                assert!(
                    key.verify_strict(&preimage(&changed, &bytes, version)?, &signature)
                        .is_err()
                );
                changed["payload_digest"] = "00".repeat(32).into();
                assert!(preimage(&changed, &bytes, version).is_err());
                assert!(
                    preimage(envelope, &bytes, if version == "1" { "2" } else { "1" }).is_err()
                );
            }
        }
    }
    Ok(())
}
#[test]
fn framing_known_answers_and_chunk_boundaries() -> Result<()> {
    assert_eq!(
        hash(&[b""]),
        "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
    );
    let c = corpus("corpus");
    let bytes = hex::decode(string(&c["chunk"]["bytes_hex"]))?;
    assert_eq!(
        chunk(number(&c["chunk"]["index"]), &bytes)?,
        c["chunk"]["digest"]
    );
    assert_eq!(blob(&bytes)?, c["chunk"]["blob_digest"]);
    assert_ne!(chunk(u64::MAX, &bytes)?, c["chunk"]["digest"]);
    assert_eq!(u64::MAX.to_le_bytes(), [255; 8]);
    assert!(chunk(0, &[]).is_err());
    assert!(blob(&[]).is_err());
    assert!(chunk(0, &vec![0; CHUNK]).is_ok());
    assert!(chunk(0, &vec![0; CHUNK + 1]).is_err());
    Ok(())
}
#[test]
fn normative_negative_bytes() {
    for (vectors, version) in [
        (corpus("negative"), "1"),
        (corpus("modular-v2")["negative"].clone(), "2"),
    ] {
        for vector in array(&vectors) {
            assert!(
                decode(
                    string(&vector["kind"]),
                    &hex::decode(string(&vector["bytes_hex"])).unwrap(),
                    version
                )
                .is_err(),
                "{}",
                vector["name"]
            );
        }
    }
}
#[test]
fn parser_rejects_before_lossy_maps_or_unbounded_recursion() {
    for bytes in [
        b"{\"a\":\"x\",\"a\":\"y\"}".as_slice(),
        br#"{"a":"x","\u0061":"y"}"#,
        br#"{"x":{"a":"x","a":"y"}}"#,
        br#""\ud800""#,
        br#""\udfff""#,
        &[255],
        b"0",
        b"1e3",
        b"-0",
        b"true",
        b"false",
        b"null",
        b"{} {}",
    ] {
        assert!(parse(bytes).is_err());
    }
    assert!(parse(format!("\"{}\"", "x".repeat(DOCUMENT - 2)).as_bytes()).is_ok());
    assert!(parse(format!("\"{}\"", "x".repeat(DOCUMENT - 1)).as_bytes()).is_err());
    assert!(parse(format!("{}\"x\"{}", "[".repeat(17), "]".repeat(17)).as_bytes()).is_err());
    assert!(parse(format!("{}\"x\"{}", "[".repeat(16), "]".repeat(16)).as_bytes()).is_ok());
    let unicode = parse("{\"😀\":\"é\",\"\":\"é\"}".as_bytes()).unwrap();
    assert_eq!(jcs(&unicode), "{\"😀\":\"é\",\"\":\"é\"}".as_bytes());
}
#[test]
fn schema_and_semantic_mutations_remain_rejected() {
    let plan = golden("modular-v2", "plan")["value"].clone();
    for (pointer, replacement) in [
        ("/input_shape/0", "0"),
        ("/input_shape/0", "18446744073709551615"),
        ("/parameters/radix_bits", "16"),
        ("/parameters/message_modulus", "0"),
        ("/precision/fractional_bits", "1"),
        ("/parameters/carry_modulus", "18446744073709551616"),
    ] {
        let mut v = plan.clone();
        *v.pointer_mut(pointer).unwrap() = replacement.into();
        assert!(decode("plan", &jcs(&v), "2").is_err(), "{pointer}");
    }
    let mut duplicate = plan.clone();
    duplicate["operators"] = serde_json::json!(["ADD", "ADD"]);
    assert!(decode("plan", &jcs(&duplicate), "2").is_err());
    let mut unknown = plan.clone();
    unknown["parameters"]["unknown"] = "x".into();
    assert!(decode("plan", &jcs(&unknown), "2").is_err());
    let valid = jcs(&plan);
    assert!(decode("plan", &[valid.clone(), b"\n".to_vec()].concat(), "2").is_err());
    assert!(decode("receipt", &valid, "2").is_err());
    assert!(decode("plan", &valid, "3").is_err());
    for (kind, pointer, replacement) in [
        ("manifest", "/ordered_chunk_entries/0/byte_offset", "1"),
        ("manifest", "/serialized_bytes", "5"),
        ("manifest", "/max_expanded_bytes", "1073741825"),
        ("approval", "/expires_unix_ms", "0"),
        ("receipt", "/started_unix_ms", "18446744073709551615"),
    ] {
        let mut value = golden("corpus", kind)["value"].clone();
        *value.pointer_mut(pointer).unwrap() = replacement.into();
        if kind == "receipt" {
            value["completed_unix_ms"] = "0".into();
        }
        assert!(decode(kind, &jcs(&value), "1").is_err(), "{kind}/{pointer}");
    }
}
