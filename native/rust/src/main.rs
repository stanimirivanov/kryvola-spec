use prost::Message;
use prost_reflect::{DescriptorPool, DynamicMessage, SerializeOptions, Value};
use serde_json::{Value as Json, json};
use std::{
    fs,
    io::{self, BufRead},
};
mod wire {
    include!("../../../bindings/rust/kryvola.spec.v1.rs");
    include!("../../../bindings/rust/dispatch.rs");
}
fn known(message: &DynamicMessage) -> Result<(), Box<dyn std::error::Error>> {
    if message.unknown_fields().next().is_some() {
        return Err("unknown field".into());
    }
    for (_, value) in message.fields() {
        match value {
            Value::Message(child) => known(child)?,
            Value::List(items) => {
                for item in items {
                    if let Value::Message(child) = item {
                        known(child)?;
                    }
                }
            }
            _ => (),
        }
    }
    Ok(())
}
fn codec(input: &Json) -> Result<Json, Box<dyn std::error::Error>> {
    let name = input["type"].as_str().ok_or("type")?;
    let schemas: Json = serde_json::from_slice(&fs::read("bindings/schemas.json")?)?;
    let validator = jsonschema::validator_for(schemas.get(name).ok_or("unknown type")?)
        .map_err(|_| "schema definition")?;
    let pool = DescriptorPool::decode(fs::read("bindings/descriptor.bin")?.as_slice())?;
    let descriptor = pool
        .get_message_by_name(&format!("kryvola.spec.v1.{name}"))
        .ok_or("type")?;
    let bytes = if let Some(hex) = input["wire"].as_str() {
        if hex.len() > 131072 {
            return Err("oversize".into());
        }
        hex::decode(hex)?
    } else {
        validator.validate(&input["value"]).map_err(|_| "schema")?;
        DynamicMessage::deserialize(descriptor.clone(), input["value"].clone())?.encode_to_vec()
    };
    if bytes.len() > 65536 {
        return Err("oversize".into());
    }
    let message = DynamicMessage::decode(descriptor, bytes.as_slice())?;
    known(&message)?;
    let value = message.serialize_with_options(
        serde_json::value::Serializer,
        &SerializeOptions::new()
            .use_proto_field_name(true)
            .skip_default_fields(false),
    )?;
    validator.validate(&value).map_err(|_| "schema")?;
    let encoded = wire::typed_roundtrip(name, &message.encode_to_vec())?;
    Ok(json!({"wire": hex::encode(encoded), "value": value}))
}
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if let Some(endpoint) = std::env::args().nth(1) {
        let mut client = wire::engine_service_client::EngineServiceClient::connect(endpoint)
            .await?
            .max_decoding_message_size(65536)
            .max_encoding_message_size(65536);
        let response = client
            .get_capabilities(wire::GetCapabilitiesRequest {
                schema_version: Some("1".into()),
            })
            .await?
            .into_inner();
        println!(
            "{}",
            codec(
                &json!({"type":"GetCapabilitiesResponse", "wire":hex::encode(response.encode_to_vec())})
            )?
        );
        return Ok(());
    }
    for line in io::stdin().lock().lines() {
        let result = serde_json::from_str(&line?)
            .map_err(Into::into)
            .and_then(|input| codec(&input));
        println!("{}", result.unwrap_or_else(|_| json!({"error":"invalid"})));
    }
    Ok(())
}
