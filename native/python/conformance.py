"""Shared byte vectors, negative boundaries and loopback-only RPC conformance."""

import copy
import json
import subprocess
import sys
from concurrent import futures
from pathlib import Path

import grpc
from codec import codec
from google.protobuf import json_format, message_factory
from kryvola.spec.v1 import engine_pb2, engine_pb2_grpc

fixtures = json.loads(Path("bindings/fixtures.json").read_text())
pool = engine_pb2.DESCRIPTOR.pool


def raw(name, value):
    message = message_factory.GetMessageClass(
        pool.FindMessageTypeByName("kryvola.spec.v1." + name)
    )()
    return json_format.ParseDict(value, message)


def vectors():
    good = [{"type": name, "value": value} for name, value in fixtures.items()]
    maximum = copy.deepcopy(fixtures["Attempt"])
    maximum["fence"] = "18446744073709551615"
    good.append({"type": "Attempt", "value": maximum})
    good.append(
        {
            "type": "ArtifactRef",
            "value": {**fixtures["ArtifactRef"], "byte_length": "1073741824"},
        }
    )
    large = copy.deepcopy(fixtures["ExecuteRequest"])
    large["input_refs"] = [copy.deepcopy(fixtures["ArtifactRef"]) for _ in range(128)]

    def tenants(value):
        if isinstance(value, dict):
            if "tenant_scope" in value:
                value["tenant_scope"] = "t" * 128
            for child in value.values():
                tenants(child)
        elif isinstance(value, list):
            for child in value:
                tenants(child)

    tenants(large)
    size = lambda: len(raw("ExecuteRequest", large).SerializeToString())
    assert size() < 65536
    for ref in large["input_refs"]:
        for field in ["opaque_artifact_id", "immutable_version"]:
            low, high = len(ref[field]), 128
            while low < high:
                middle = (low + high + 1) // 2
                ref[field] = "x" * middle
                if size() <= 65536:
                    low = middle
                else:
                    high = middle - 1
            ref[field] = "x" * low
    assert size() == 65536
    good.append({"type": "ExecuteRequest", "value": large})
    golden = [{"type": case["type"], **codec(case)} for case in good]
    bad = []
    over = copy.deepcopy(large)
    for ref in over["input_refs"]:
        if len(ref["opaque_artifact_id"]) < 126:
            ref["opaque_artifact_id"] += "x"
            break
    encoded = raw("ExecuteRequest", over).SerializeToString()
    assert len(encoded) == 65537
    bad.append({"type": "ExecuteRequest", "wire": encoded.hex()})
    for case in good:
        name, value = case["type"], case["value"]
        bad.extend(
            [
                {"type": name, "wire": codec(case)["wire"] + "f81f01"},
                {
                    "type": name,
                    "wire": raw(name, {**value, "schema_version": "2"})
                    .SerializeToString()
                    .hex(),
                },
                {
                    "type": name,
                    "wire": raw(
                        name, {k: v for k, v in value.items() if k != "schema_version"}
                    )
                    .SerializeToString()
                    .hex(),
                },
                {"type": name, "value": {**value, "private_key": "forbidden"}},
            ]
        )
    for value in ["18446744073709551616", "01", "-1", "1\n"]:
        bad.append(
            {
                "type": "Attempt",
                "wire": raw("Attempt", {**fixtures["Attempt"], "fence": value})
                .SerializeToString()
                .hex(),
            }
        )
    bad.append(
        {
            "type": "ArtifactRef",
            "wire": raw(
                "ArtifactRef", {**fixtures["ArtifactRef"], "byte_length": "1073741825"}
            )
            .SerializeToString()
            .hex(),
        }
    )
    bad.append(
        {
            "type": "Capabilities",
            "wire": raw(
                "Capabilities", {**fixtures["Capabilities"], "operators": ["ADD"] * 3}
            )
            .SerializeToString()
            .hex(),
        }
    )
    nested = raw("ExecuteRequest", fixtures["ExecuteRequest"])
    nested.execution.attempt.MergeFromString(bytes.fromhex("f81f01"))
    bad.extend(
        [
            {"type": "ExecuteRequest", "wire": nested.SerializeToString().hex()},
            {"type": "ArtifactRef", "wire": "0a7f00"},
            {"type": "ArtifactRef", "wire": "00" * 65537},
        ]
    )
    return golden, bad


def exchange(command, requests):
    output = subprocess.run(
        command,
        input="".join(json.dumps(case) + "\n" for case in requests),
        text=True,
        capture_output=True,
        check=True,
        timeout=120,
    )
    results = [json.loads(line) for line in output.stdout.splitlines()]
    assert len(results) == len(requests), output.stderr
    return results


class FakeEngine(engine_pb2_grpc.EngineServiceServicer):
    def GetCapabilities(self, request, context):
        return raw("GetCapabilitiesResponse", fixtures["GetCapabilitiesResponse"])

    def Execute(self, request, context):
        if request.operation.deadline_unix_ms == "0":
            context.abort(grpc.StatusCode.DEADLINE_EXCEEDED, "expired")
        if request.security_profile != "FHE-Q1":
            context.abort(grpc.StatusCode.FAILED_PRECONDITION, "unsupported profile")
        return raw("ExecuteResponse", fixtures["ExecuteResponse"])

    def GetExecutionStatus(self, request, context):
        return raw("GetExecutionStatusResponse", fixtures["GetExecutionStatusResponse"])

    def CancelExecution(self, request, context):
        return raw("CancelExecutionResponse", fixtures["CancelExecutionResponse"])


golden, negative = vectors()
path = Path("bindings/vectors.json")
if "--generate" in sys.argv:
    path.write_text(json.dumps(golden, indent=2) + "\n")
    raise SystemExit(0)
assert json.loads(path.read_text()) == golden, "wire vectors drifted"
commands = [
    ["native/target/debug/kryvola-wire-conformance"],
    ["/opt/wire-build/wire-cpp"],
    [sys.executable, "native/python/codec.py"],
]
requests = [{"type": case["type"], "value": case["value"]} for case in golden]
requests += [{"type": case["type"], "wire": case["wire"]} for case in golden]
for command in commands:
    results = exchange(command, requests + negative)
    for actual, expected in zip(results[: len(requests)], golden * 2, strict=True):
        assert actual == {"wire": expected["wire"], "value": expected["value"]}, (
            command,
            expected["type"],
            actual,
        )
    assert all(result == {"error": "invalid"} for result in results[len(requests) :]), (
        command
    )

server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=2),
    options=[
        ("grpc.max_receive_message_length", 65536),
        ("grpc.max_send_message_length", 65536),
    ],
)
engine_pb2_grpc.add_EngineServiceServicer_to_server(FakeEngine(), server)
port = server.add_insecure_port("127.0.0.1:0")
assert port
server.start()
try:
    for command, address in [(commands[0], f"http://127.0.0.1:{port}")]:
        response = subprocess.run(
            command + [address], text=True, capture_output=True, check=True, timeout=30
        )
        assert (
            json.loads(response.stdout)["value"] == fixtures["GetCapabilitiesResponse"]
        )
    with grpc.insecure_channel(
        f"127.0.0.1:{port}",
        options=[
            ("grpc.max_receive_message_length", 65536),
            ("grpc.max_send_message_length", 65536),
        ],
    ) as channel:
        stub = engine_pb2_grpc.EngineServiceStub(channel)
        for method in [
            "GetCapabilities",
            "Execute",
            "GetExecutionStatus",
            "CancelExecution",
        ]:
            reply = getattr(stub, method)(
                raw(method + "Request", fixtures[method + "Request"]), timeout=10
            )
            assert (
                codec(
                    {
                        "type": method + "Response",
                        "wire": reply.SerializeToString().hex(),
                    }
                )["value"]
                == fixtures[method + "Response"]
            )
        for change, status in [
            ({"security_profile": "FHE-A1"}, grpc.StatusCode.FAILED_PRECONDITION),
            (
                {
                    "operation": {
                        **fixtures["ExecuteRequest"]["operation"],
                        "deadline_unix_ms": "0",
                    },
                    "execution": {
                        **fixtures["ExecuteRequest"]["execution"],
                        "deadline_unix_ms": "0",
                    },
                },
                grpc.StatusCode.DEADLINE_EXCEEDED,
            ),
        ]:
            try:
                stub.Execute(
                    raw("ExecuteRequest", {**fixtures["ExecuteRequest"], **change}),
                    timeout=10,
                )
                raise AssertionError("invalid execution accepted")
            except grpc.RpcError as error:
                assert error.code() == status
finally:
    server.stop(0).wait()
print(
    f"Native conformance passed: {len(golden)} golden messages, {len(negative)} negatives x 3 languages; loopback gRPC passed."
)
