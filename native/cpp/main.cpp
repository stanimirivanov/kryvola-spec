#include <fstream>
#include <cctype>
#include <chrono>
#include <iostream>
#include <memory>
#include <sstream>
#include <google/protobuf/util/json_util.h>
#include <google/protobuf/dynamic_message.h>
#include <jsoncons/json.hpp>
#include <jsoncons_ext/jsonschema/jsonschema.hpp>
#include "kryvola/spec/v1/engine.pb.h"
using json = jsoncons::json;
using google::protobuf::Message;
void known(const Message& message) {
  const auto* reflection = message.GetReflection();
  if (reflection->GetUnknownFields(message).field_count()) throw std::runtime_error("unknown");
  std::vector<const google::protobuf::FieldDescriptor*> fields;
  reflection->ListFields(message, &fields);
  for (const auto* field : fields) if (field->cpp_type() == google::protobuf::FieldDescriptor::CPPTYPE_MESSAGE) {
    if (field->is_repeated()) for (int i=0; i<reflection->FieldSize(message,field); ++i) known(reflection->GetRepeatedMessage(message,field,i));
    else known(reflection->GetMessage(message,field));
  }
}
json codec(const json& input) {
  std::ifstream stream("bindings/schemas.json");
  const auto schemas = json::parse(stream);
  const auto name = input.at("type").as<std::string>();
  const auto schema = jsoncons::jsonschema::make_json_schema<json>(schemas.at(name));
  const auto* descriptor = google::protobuf::DescriptorPool::generated_pool()->FindMessageTypeByName("kryvola.spec.v1."+name);
  if (!descriptor) throw std::runtime_error("type");
  std::unique_ptr<Message> message(google::protobuf::MessageFactory::generated_factory()->GetPrototype(descriptor)->New());
  if (input.contains("wire")) {
    const auto hex = input.at("wire").as<std::string>();
    if (hex.size()>131072 || hex.size()%2) throw std::runtime_error("oversize");
    std::string bytes;
    for (std::size_t i=0; i<hex.size(); i+=2) {
      if (!std::isxdigit(static_cast<unsigned char>(hex[i])) || !std::isxdigit(static_cast<unsigned char>(hex[i+1]))) throw std::runtime_error("hex");
      bytes.push_back(static_cast<char>(std::stoul(hex.substr(i,2), nullptr,16)));
    }
    if (!message->ParseFromString(bytes)) throw std::runtime_error("wire");
  } else {
    if (!schema.is_valid(input.at("value")) || !google::protobuf::util::JsonStringToMessage(input.at("value").to_string(), message.get()).ok()) throw std::runtime_error("json");
  }
  known(*message);
  const auto bytes = message->SerializeAsString();
  if (bytes.size()>65536) throw std::runtime_error("oversize");
  google::protobuf::util::JsonPrintOptions options;
  options.preserve_proto_field_names = true;
  options.always_print_fields_with_no_presence = true;
  std::string text;
  if (!google::protobuf::util::MessageToJsonString(*message,&text,options).ok()) throw std::runtime_error("json");
  const auto value = json::parse(text);
  if (!schema.is_valid(value)) throw std::runtime_error("schema");
  const char* digits="0123456789abcdef";
  std::string hex;
  for (unsigned char byte : bytes) { hex+=digits[byte>>4]; hex+=digits[byte&15]; }
  auto result = json::parse("{}");
  result["wire"] = hex;
  result["value"] = value;
  return result;
}
int main() {
  std::string line;
  while (std::getline(std::cin,line)) {
    try { std::cout<<codec(json::parse(line))<<'\n'; }
    catch (...) { std::cout<<"{\"error\":\"invalid\"}\n"; }
  }
}
