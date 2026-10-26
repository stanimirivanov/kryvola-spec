"""Test-only format adapter; no signing, key custody or production trust API."""
import json
from pathlib import Path

import rfc8785
from blake3 import blake3
from jsonschema import Draft202012Validator
from referencing import Registry

ROOT = Path(__file__).resolve().parents[3]
DOCUMENT, CHUNK, ARTIFACT = 1_048_576, 4_194_304, 1_073_741_824


def require(condition):
    if not condition:
        raise ValueError("invalid canonical input")


def reject_number(_):
    raise ValueError("JSON numbers forbidden")


def pairs(entries):
    result = {}
    for key, value in entries:
        require(key not in result)
        result[key] = value
    return result


def parse(raw):
    require(len(raw) <= DOCUMENT)
    text = raw.decode("utf-8", errors="strict")
    # Bound containers before the standard parser allocates a recursive tree.
    depth, quoted, escaped = 0, False, False
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "[{":
            depth += 1
            require(depth <= 16)
        elif char in "]}":
            depth -= 1
    value = json.loads(text, object_pairs_hook=pairs, parse_int=reject_number,
                       parse_float=reject_number, parse_constant=reject_number)

    def restricted(v):
        if isinstance(v, str):
            v.encode("utf-8", errors="strict")  # Reject escaped lone surrogates, including keys.
        elif isinstance(v, list):
            for entry in v:
                restricted(entry)
        elif isinstance(v, dict):
            for key, entry in v.items():
                restricted(key)
                restricted(entry)
        else:
            raise ValueError("only strings, arrays and objects")

    restricted(value)
    return value


SCHEMAS = {}
for version, kinds in [("1", "manifest plan approval key-context journal receipt operation-identity signature"),
                       ("2", "manifest plan signature")]:
    for kind in kinds.split():
        directory = ROOT / "generated/canonical" / ("v2" if version == "2" else "")
        schema = json.loads((directory / f"{kind}.schema.json").read_bytes())
        Draft202012Validator.check_schema(schema)
        # An empty explicit registry has no network retriever. Schemas are trusted local inputs.
        SCHEMAS[version, kind] = Draft202012Validator(schema, registry=Registry())


def semantics(kind, v, version):
    if version == "2" and kind in ("plan", "manifest"):
        require(v["parameters"]["radix_bits"] == v["precision"]["dtype"][4:])
        if kind == "plan":
            require(len(set(v["operators"])) == len(v["operators"]))
    shapes = [v["shape"]] if kind == "manifest" else (
        [v["input_shape"], v["output_shape"]] if kind == "plan" else [])
    for shape in shapes:
        product = 1
        for dimension in shape:
            n = int(dimension)
            require(0 < n <= 1_048_576 // product)
            product *= n
    if "precision" in v:
        require(int(v["precision"]["fractional_bits"]) == 0)
    if "parameters" in v:
        require(all(int(v["parameters"][key]) > 0 for key in
                    ("radix_bits", "message_modulus", "carry_modulus")))
    if "expires_unix_ms" in v:
        require(int(v["expires_unix_ms"]) > int(v["valid_from_unix_ms"]))
    if kind == "receipt":
        require(int(v["completed_unix_ms"]) >= int(v["started_unix_ms"]))
    if kind == "manifest":
        offset = 0
        for index, entry in enumerate(v["ordered_chunk_entries"]):
            size = int(entry["byte_length"])
            require(int(entry["index"]) == index and int(entry["byte_offset"]) == offset
                    and 0 < size <= CHUNK)
            offset += size
        require(offset == int(v["serialized_bytes"]) and offset <= ARTIFACT
                and offset <= int(v["max_expanded_bytes"]) <= ARTIFACT)


def decode(kind, raw, version):
    require((version, kind) in SCHEMAS)
    value = parse(raw)
    SCHEMAS[version, kind].validate(value)
    semantics(kind, value, version)
    require(rfc8785.dumps(value) == raw)
    return value


def domain(kind, version):
    return f"kryvola/{kind}/v{version}\0".encode()


def digest(*parts):
    hasher = blake3()
    for part in parts:
        hasher.update(part)
    return hasher.hexdigest()


def commitment(kind, raw, version):
    require(kind != "signature")
    decode(kind, raw, version)
    return digest(domain(kind, version), raw)


def u64(n):
    require(type(n) is int and 0 <= n < 2**64)
    return n.to_bytes(8, "little")


def chunk(index, raw):
    require(0 < len(raw) <= CHUNK)
    return digest(domain("chunk", "1"), u64(index), u64(len(raw)), raw)


def blob(raw):
    require(0 < len(raw) <= ARTIFACT)
    return digest(domain("blob", "1"), raw)


def preimage(envelope, raw, version):
    decode("signature", rfc8785.dumps(envelope), version)
    kind = envelope["payload_kind"]
    require(commitment(kind, raw, version) == envelope["payload_digest"])
    header = rfc8785.dumps({k: v for k, v in envelope.items() if k != "signature"})
    return domain(f"signature/{kind}", version) + u64(len(header)) + header + u64(len(raw)) + raw
