FROM ghcr.io/astral-sh/uv:0.12.5@sha256:e85be844203885286c60ffad8a858d48afb6c5a5c237ca0e67f12e74b8f174b1 AS uv
FROM rust:1.98.1-bookworm@sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e AS toolchain
COPY --from=uv /uv /usr/local/bin/uv
RUN apt-get update && apt-get install -y --no-install-recommends cmake ninja-build git ca-certificates libssl-dev libc-ares-dev zlib1g-dev pkg-config && rm -rf /var/lib/apt/lists/*
RUN git clone --branch v1.85.0 --depth 1 https://github.com/grpc/grpc /opt/grpc && test "$(git -C /opt/grpc rev-parse HEAD)" = a83eb274517ef49e95d5529dac071f4b74abae0d && git -C /opt/grpc submodule update --init --depth 1 third_party/abseil-cpp third_party/protobuf third_party/re2 && test "$(git -C /opt/grpc/third_party/protobuf rev-parse HEAD)" = 35cd01f9fe9afbeea38cc7b979a3b6bfcde82c03
RUN git -C /opt/grpc submodule update --init --depth 1 third_party/grpc-proto
RUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* && curl -fL --retry 3 https://github.com/protocolbuffers/protobuf/releases/download/v35.1/protoc-35.1-linux-x86_64.zip -o /tmp/protoc.zip && echo "6930ebf62bd4ea607b98fff052596c6ee564b9835b4ce172c75a3f53ae9d91b7  /tmp/protoc.zip" | sha256sum --check && unzip -q /tmp/protoc.zip -d /opt/protoc
COPY native/compiler.cmake /opt/compiler.cmake
RUN --mount=type=cache,target=/opt/grpc-build,sharing=locked cmake -S /opt/grpc -B /opt/grpc-build -G Ninja -DCMAKE_SKIP_RPATH=ON -DCMAKE_PROJECT_INCLUDE=/opt/compiler.cmake -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS_RELEASE="-O0 -DNDEBUG" -DCMAKE_C_FLAGS_RELEASE="-O0 -DNDEBUG" -DgRPC_INSTALL=ON -DgRPC_BUILD_TESTS=OFF -DgRPC_SSL_PROVIDER=package -DgRPC_CARES_PROVIDER=package -DgRPC_ZLIB_PROVIDER=package -DgRPC_BUILD_GRPC_CSHARP_PLUGIN=OFF -DgRPC_BUILD_GRPC_NODE_PLUGIN=OFF -DgRPC_BUILD_GRPC_OBJECTIVE_C_PLUGIN=OFF -DgRPC_BUILD_GRPC_PHP_PLUGIN=OFF -DgRPC_BUILD_GRPC_RUBY_PLUGIN=OFF && cmake --build /opt/grpc-build --target grpc_cpp_plugin grpc_python_plugin protoc-gen-upb protoc-gen-upbdefs protoc-gen-upb_minitable libprotobuf-lite third_party/abseil-cpp/all --parallel 4 && cp /opt/protoc/bin/protoc /opt/grpc-build/third_party/protobuf/protoc-35.1.0 && cp /opt/protoc/bin/protoc /opt/grpc-build/third_party/protobuf/protoc && cmake --install /opt/grpc-build/third_party/abseil-cpp && cmake --install /opt/grpc-build/third_party/protobuf && cp /opt/grpc-build/grpc_cpp_plugin /opt/grpc-build/grpc_python_plugin /usr/local/bin/
RUN git clone --branch v1.10.0 --depth 1 https://github.com/danielaparker/jsoncons /opt/jsoncons && test "$(git -C /opt/jsoncons rev-parse HEAD)" = 9e57e421285422d7aeeb5aa7dc839f6a19121ee6
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_PROJECT_ENVIRONMENT=/opt/venv PYTHONDONTWRITEBYTECODE=1
RUN uv python install 3.14.7
WORKDIR /src

FROM toolchain AS dependencies
COPY native /src/native
RUN cargo fetch --locked --manifest-path native/Cargo.toml && uv sync --frozen --project native/python

FROM dependencies AS generate
COPY generated/proto /src/generated/proto
COPY .cache/native-input /src/bindings
RUN mkdir -p bindings/cpp bindings/python bindings/rust && protoc -I generated/proto --include_imports --descriptor_set_out=bindings/descriptor.bin --cpp_out=bindings/cpp --python_out=bindings/python --grpc_out=bindings/cpp --plugin=protoc-gen-grpc=/usr/local/bin/grpc_cpp_plugin --grpc_python_out=bindings/python --plugin=protoc-gen-grpc_python=/usr/local/bin/grpc_python_plugin generated/proto/kryvola/spec/v1/*.proto && cargo run --locked --manifest-path native/Cargo.toml -p kryvola-wire-codegen
RUN PYTHONPATH=/src/bindings/python:/src/native/python uv run --frozen --project native/python python native/python/conformance.py --generate

FROM generate AS conformance
RUN cmake -S native -B /opt/wire-build -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS_RELEASE="-O0 -DNDEBUG" && cmake --build /opt/wire-build --parallel 2 && cargo build --locked --manifest-path native/Cargo.toml -p kryvola-wire-conformance
ENV PYTHONPATH=/src/bindings/python:/src/native/python
CMD ["uv", "run", "--frozen", "--project", "native/python", "python", "native/python/conformance.py"]

FROM scratch AS exported
COPY --from=generate /src/bindings /bindings
