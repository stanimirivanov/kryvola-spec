// Trusted local schema wrapper; separate from the sanitizer-instrumented adapter.
#include "schema.hpp"
#include <fstream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <jsoncons_ext/jsonschema/jsonschema.hpp>
namespace canonical {
using json = jsoncons::json;
bool schema_valid(const std::string& kind, const json& value, const std::string& version) {
    static const auto schemas = [] {
        const auto read_schema = [](const std::string& path) {
            std::ifstream stream(path);
            if (!stream.good()) throw std::runtime_error("missing canonical schema");
            return json::parse(stream);
        };
        using schema = decltype(jsoncons::jsonschema::make_json_schema<json>(json::parse("{}")));
        std::map<std::string,schema> result;
        for (const auto& version : {"1", "2"}) {
            std::istringstream kinds(std::string(version)=="1" ? "manifest plan approval key-context journal receipt operation-identity signature" : "manifest plan signature");
            std::string k; while (kinds>>k) result.emplace(std::string(version)+"/"+k, jsoncons::jsonschema::make_json_schema<json>(read_schema("generated/canonical/"+std::string(std::string(version)=="1" ? "" : "v2/")+k+".schema.json")));
        }
        return result;
    }();
    const auto found=schemas.find(version+"/"+kind);
    return found!=schemas.end() && found->second.is_valid(value);
}
} // namespace canonical
