FROM ghcr.io/astral-sh/uv:0.12.5@sha256:e85be844203885286c60ffad8a858d48afb6c5a5c237ca0e67f12e74b8f174b1 AS uv
FROM rust:1.98.1-bookworm@sha256:93ce27a88655056a51dbdd8f5f2d7ddc071c7b0070fb288a37b5a285fc83971e
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_PYTHON_INSTALL_DIR=/opt/python UV_PROJECT_ENVIRONMENT=/opt/venv PYTHONDONTWRITEBYTECODE=1
RUN uv python install 3.14.7
WORKDIR /src
COPY tools/conformance/python/pyproject.toml tools/conformance/python/uv.lock /src/tools/conformance/python/
RUN uv sync --locked --python 3.14.7 --project tools/conformance/python --no-build
COPY tools/conformance/python /src/tools/conformance/python
COPY generated/canonical /src/generated/canonical
COPY generated/fixtures/canonical-*.json /src/generated/fixtures/
ENTRYPOINT ["timeout", "120", "/opt/venv/bin/python", "tools/conformance/python/test_canonical.py"]
