fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_prost_build::configure()
        .out_dir("bindings/rust")
        .compile_protos(
            &[
                "generated/proto/kryvola/spec/v1/artifact_ref.proto",
                "generated/proto/kryvola/spec/v1/control.proto",
                "generated/proto/kryvola/spec/v1/engine.proto",
            ],
            &["generated/proto"],
        )?;
    Ok(())
}
