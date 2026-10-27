FROM rust:1.98.1-bookworm@sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e
RUN apt-get update && apt-get install -y --no-install-recommends cmake libssl-dev && rm -rf /var/lib/apt/lists/*
RUN git clone --branch v1.10.0 --depth 1 https://github.com/danielaparker/jsoncons /opt/jsoncons && test "$(git -C /opt/jsoncons rev-parse HEAD)" = 9e57e421285422d7aeeb5aa7dc839f6a19121ee6
RUN git clone --branch 1.8.7 --depth 1 https://github.com/BLAKE3-team/BLAKE3 /opt/blake3 && test "$(git -C /opt/blake3 rev-parse HEAD)" = f3149ec5bb5449af877ba20377a11008ff499fa2
WORKDIR /src
COPY tools/conformance/cpp /src/tools/conformance/cpp
RUN cmake -S tools/conformance/cpp -B /opt/canonical-build -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS_RELEASE="-O0 -DNDEBUG" && cmake --build /opt/canonical-build --parallel 2
COPY generated/canonical /src/generated/canonical
COPY generated/fixtures/canonical-*.json /src/generated/fixtures/
ENTRYPOINT ["timeout", "120", "/opt/canonical-build/canonical-cpp"]
