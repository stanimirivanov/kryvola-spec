FROM rust:1.98.1-bookworm@sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e
WORKDIR /src
RUN rustup component add rustfmt clippy
COPY tools/conformance/rust /src/tools/conformance/rust
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked cargo fetch --locked --manifest-path tools/conformance/rust/Cargo.toml
COPY generated/canonical /src/generated/canonical
COPY generated/fixtures/canonical-*.json /src/generated/fixtures/
# Remove only this crate's cached executables: dependency/feature changes can leave
# multiple hashed filenames, and the final image must contain the current test binary.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/src/tools/conformance/rust/target,sharing=locked \
    mkdir -p tools/conformance/rust/target/debug/deps && \
    find tools/conformance/rust/target/debug/deps -maxdepth 1 -type f -name 'kryvola_canonical_conformance-*' -executable -delete && \
    cargo fmt --manifest-path tools/conformance/rust/Cargo.toml -- --check && \
    cargo clippy --locked --manifest-path tools/conformance/rust/Cargo.toml --all-targets -- -D warnings && \
    cargo test --locked --manifest-path tools/conformance/rust/Cargo.toml --no-run && \
    find tools/conformance/rust/target/debug/deps -maxdepth 1 -type f -name 'kryvola_canonical_conformance-*' -executable -exec cp '{}' /usr/local/bin/canonical-tests ';'
ENTRYPOINT ["timeout", "120", "canonical-tests", "--nocapture", "--test-threads=1"]
