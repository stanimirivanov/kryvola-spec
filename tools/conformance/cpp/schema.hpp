#pragma once
#include <string>
#include <jsoncons/json.hpp>
namespace canonical {
bool schema_valid(const std::string& kind, const jsoncons::json& value, const std::string& version);
}
