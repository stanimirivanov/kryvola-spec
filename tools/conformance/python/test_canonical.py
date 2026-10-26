"""Independent golden, adversarial and differential conformance tests."""
import base64
import copy
import json
import unittest

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from jsonschema.exceptions import ValidationError

import canonical as c


def corpus(name):
    return json.loads((c.ROOT / f"generated/fixtures/canonical-{name}.json").read_bytes())


def golden(kind, name="corpus"):
    return next(v for v in corpus(name)["objects"] if v["kind"] == kind)["value"]


class Conformance(unittest.TestCase):
    def test_golden_and_public_signatures(self):
        for name, version in [("corpus", "1"), ("modular-v2", "2")]:
            vectors = corpus(name)
            key = Ed25519PublicKey.from_public_bytes(bytes.fromhex(vectors["public_key_hex"]))
            for v in vectors["objects"]:
                with self.subTest(version=version, kind=v["kind"]):
                    kind, raw = v["kind"], bytes.fromhex(v["canonical_hex"])
                    self.assertEqual(c.rfc8785.dumps(v["value"]), raw)
                    self.assertEqual(c.decode(kind, raw, version), v["value"])
                    digest = c.commitment(kind, raw, version)
                    self.assertEqual(digest, v["digest"])
                    message = c.preimage(v["envelope"], raw, version) if "envelope" in v else b""
                    # Machine-readable actual outputs, compared by the Node gate with Rust.
                    print("KRYVOLA_RESULT " + json.dumps([version, kind, raw.hex(), digest, message.hex()]), flush=True)
                    for change in ("missing", "unknown", "newline", "version"):
                        bad = copy.deepcopy(v["value"])
                        if change == "missing":
                            del bad["tenant_scope"]
                        elif change == "unknown":
                            bad["unknown"] = "x"
                        with self.assertRaises((ValueError, ValidationError)):
                            c.decode(kind, c.rfc8785.dumps(bad) + (b"\n" if change == "newline" else b""),
                                     "3" if change == "version" else version)
                    self.assertNotEqual(c.digest(c.domain("wrong", version), raw), digest)
                    if "envelope" not in v:
                        continue
                    self.assertEqual(message.hex(), v["preimage_hex"])
                    envelope = v["envelope"]
                    signature = base64.urlsafe_b64decode(envelope["signature"] + "==")
                    key.verify(signature, message)
                    with self.assertRaises(InvalidSignature):
                        key.verify(signature, bytes([message[0] ^ 1]) + message[1:])
                    changed = dict(envelope, signer="other")
                    with self.assertRaises(InvalidSignature):
                        key.verify(signature, c.preimage(changed, raw, version))
                    with self.assertRaises(ValueError):
                        c.preimage(dict(envelope, payload_digest="00" * 32), raw, version)

    def test_normative_negatives(self):
        for vectors, version in [(corpus("negative"), "1"), (corpus("modular-v2")["negative"], "2")]:
            for v in vectors:
                with self.subTest(name=v["name"]), self.assertRaises((ValueError, ValidationError)):
                    c.decode(v["kind"], bytes.fromhex(v["bytes_hex"]), version)

    def test_parser_boundaries(self):
        for raw in [b'{"a":"x","a":"y"}', br'{"a":"x","\u0061":"y"}',
                    b'{"x":{"a":"x","a":"y"}}', br'"\ud800"', br'{"\udfff":"x"}',
                    b'\xff', b'0', b'1e3', b'-0', b'NaN', b'Infinity', b'true', b'false',
                    b'null', b'{} {}', b'"' + b'x' * (c.DOCUMENT - 1) + b'"',
                    b'[' * 17 + b'"x"' + b']' * 17]:
            with self.subTest(raw=raw[:60]), self.assertRaises(ValueError):
                c.parse(raw)
        self.assertEqual(c.parse(b'"' + b'x' * (c.DOCUMENT - 2) + b'"'), "x" * (c.DOCUMENT - 2))
        c.parse(b'[' * 16 + b'"x"' + b']' * 16)
        unicode = '{"😀":"é","\ue000":"é"}'.encode()
        self.assertEqual(c.rfc8785.dumps(c.parse(unicode)), unicode)
        self.assertEqual(c.parse(br'"[\"{]"'), '["{]')

    def test_framing(self):
        self.assertEqual(c.digest(b""), "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262")
        v = corpus("corpus")["chunk"]
        raw = bytes.fromhex(v["bytes_hex"])
        self.assertEqual(c.chunk(int(v["index"]), raw), v["digest"])
        self.assertEqual(c.blob(raw), v["blob_digest"])
        self.assertEqual(c.u64(2**64 - 1), b'\xff' * 8)
        self.assertNotEqual(c.chunk(2**64 - 1, raw), v["digest"])
        c.chunk(0, bytes(c.CHUNK))
        for index, data in [(-1, raw), (2**64, raw), (0, b""), (0, bytes(c.CHUNK + 1))]:
            with self.assertRaises(ValueError):
                c.chunk(index, data)
        with self.assertRaises(ValueError):
            c.blob(b"")

    def test_schema_and_semantics(self):
        for kind, path, replacement, name, version in [
            ("plan", "input_shape/0", "0", "modular-v2", "2"),
            ("plan", "input_shape/0", "18446744073709551615", "modular-v2", "2"),
            ("plan", "parameters/radix_bits", "16", "modular-v2", "2"),
            ("plan", "parameters/carry_modulus", "18446744073709551616", "modular-v2", "2"),
            ("plan", "parameters/message_modulus", "0", "modular-v2", "2"),
            ("plan", "precision/fractional_bits", "1", "modular-v2", "2"),
            ("plan", "parameters/unknown", "x", "modular-v2", "2"),
            ("plan", "operators", ["ADD", "ADD"], "modular-v2", "2"),
            ("manifest", "ordered_chunk_entries/0/byte_offset", "1", "corpus", "1"),
            ("manifest", "serialized_bytes", "5", "corpus", "1"),
            ("manifest", "max_expanded_bytes", "1073741825", "corpus", "1"),
            ("approval", "expires_unix_ms", "0", "corpus", "1"),
            ("receipt", "started_unix_ms", "18446744073709551615", "corpus", "1"),
        ]:
            value = copy.deepcopy(golden(kind, name))
            if kind == "receipt":
                value["completed_unix_ms"] = "0"
            parts, target = path.split("/"), value
            for part in parts[:-1]:
                target = target[int(part)] if isinstance(target, list) else target[part]
            target[int(parts[-1]) if isinstance(target, list) else parts[-1]] = replacement
            with self.subTest(path=path), self.assertRaises((ValueError, ValidationError)):
                c.decode(kind, c.rfc8785.dumps(value), version)
        receipt = golden("receipt")
        receipt["started_unix_ms"] = receipt["completed_unix_ms"] = "18446744073709551615"
        c.decode("receipt", c.rfc8785.dumps(receipt), "1")


if __name__ == "__main__":
    unittest.main(verbosity=2)
