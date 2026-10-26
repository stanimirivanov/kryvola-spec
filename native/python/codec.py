"""Conformance boundary: real codecs plus the exported structural contracts; no authorization."""

import json
import sys

import jsonschema
from google.protobuf import json_format, message_factory, unknown_fields
from google.protobuf.message import DecodeError
from kryvola.spec.v1 import engine_pb2

with open("bindings/schemas.json", encoding="utf-8") as source:
    SCHEMAS = json.load(source)
POOL = engine_pb2.DESCRIPTOR.pool


def known(message):
    if list(unknown_fields.UnknownFieldSet(message)):
        raise ValueError("unknown field")
    for field, value in message.ListFields():
        if field.message_type:
            for child in value if field.is_repeated else [value]:
                known(child)


def codec(request):
    name = request["type"]
    validator = jsonschema.Draft202012Validator(SCHEMAS[name])
    message = message_factory.GetMessageClass(
        POOL.FindMessageTypeByName("kryvola.spec.v1." + name)
    )()
    if "wire" in request:
        if len(request["wire"]) > 131072:
            raise ValueError("oversize")
        message.ParseFromString(bytes.fromhex(request["wire"]))
    else:
        validator.validate(request["value"])
        json_format.ParseDict(request["value"], message)
    known(message)
    wire = message.SerializeToString(deterministic=True)
    if len(wire) > 65536:
        raise ValueError("oversize")
    value = json_format.MessageToDict(
        message,
        preserving_proto_field_name=True,
        always_print_fields_with_no_presence=True,
    )
    validator.validate(value)
    return {"wire": wire.hex(), "value": value}


if __name__ == "__main__":
    for line in sys.stdin:
        try:
            print(json.dumps(codec(json.loads(line))))
        except (
            ValueError,
            KeyError,
            TypeError,
            DecodeError,
            json_format.ParseError,
            jsonschema.ValidationError,
        ):
            print('{"error":"invalid"}')
