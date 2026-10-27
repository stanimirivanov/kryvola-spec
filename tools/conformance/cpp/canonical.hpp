// Test-only restricted adapter. No production codec, signing or trust API.
#pragma once
#include <algorithm>
#include <charconv>
#include <fstream>
#include <sstream>
#include <cstdint>
#include <stdexcept>
#include <string_view>
#include <initializer_list>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>
#include <jsoncons/json.hpp>
#include <jsoncons/json_cursor.hpp>
#include "schema.hpp"
#include <openssl/evp.h>
#include "blake3.h"
namespace canonical {
using json = jsoncons::json;
using bytes = std::string;
constexpr std::size_t DOCUMENT = 1048576, CHUNK = 4194304, ARTIFACT = 1073741824;
inline void require(bool ok) { if (!ok) throw std::runtime_error("invalid canonical input"); }
inline json load(const std::string& path) { std::ifstream f(path); require(f.good()); return json::parse(f); }
inline std::string text(const json& v) { return v.as<std::string>(); }
inline uint64_t number(const json& v) {
    const auto s = text(v); uint64_t n = 0;
    const auto [end, ec] = std::from_chars(s.data(), s.data()+s.size(), n);
    require(ec == std::errc{} && end == s.data()+s.size()); return n;
}
// Strict scalar decoding also supplies RFC 8785's UTF-16 property ordering.
inline std::u16string utf16(const std::string& s) {
    std::u16string out;
    for (std::size_t i=0; i<s.size();) {
        uint32_t c = static_cast<unsigned char>(s[i++]); unsigned more = 0; uint32_t minimum = 0;
        if (c >= 0xc2 && c <= 0xdf) { c &= 31; more=1; minimum=0x80; }
        else if (c >= 0xe0 && c <= 0xef) { c &= 15; more=2; minimum=0x800; }
        else if (c >= 0xf0 && c <= 0xf4) { c &= 7; more=3; minimum=0x10000; }
        else require(c < 0x80);
        require(i+more <= s.size());
        for (unsigned j=0; j<more; ++j) {
            const auto b = static_cast<unsigned char>(s[i++]); require((b & 0xc0) == 0x80); c=(c<<6)|(b&63);
        }
        require(c >= minimum && c <= 0x10ffff && !(c >= 0xd800 && c <= 0xdfff));
        if (c <= 0xffff) out.push_back(static_cast<char16_t>(c));
        else { c-=0x10000; out.push_back(static_cast<char16_t>(0xd800+(c>>10))); out.push_back(static_cast<char16_t>(0xdc00+(c&1023))); }
    }
    return out;
}
inline json restricted(jsoncons::json_string_cursor& cursor, unsigned depth) {
    using event = jsoncons::staj_event_type;
    require(!cursor.done()); const auto type = cursor.current().event_type();
    if (type == event::string_value) {
        const auto s = cursor.current().get<std::string>(); (void)utf16(s); cursor.next(); return json(s);
    }
    require(depth < 16 && (type == event::begin_object || type == event::begin_array));
    const bool object = type == event::begin_object;
    auto v = json::parse(object ? "{}" : "[]"); cursor.next();
    const auto end = object ? event::end_object : event::end_array;
    while (!cursor.done() && cursor.current().event_type() != end) {
        if (object) {
            require(cursor.current().event_type() == event::key);
            const auto key = cursor.current().get<std::string>(); (void)utf16(key);
            require(!v.contains(key)); // Reject decoded aliases before parsing/inserting the second value.
            cursor.next(); v[key] = restricted(cursor, depth+1);
        } else v.push_back(restricted(cursor, depth+1));
    }
    require(!cursor.done()); cursor.next(); return v;
}
// Check escaped UTF-16 before the cursor can discard an invalid low surrogate in a key.
inline void escaped_scalars(const bytes& raw) {
    bool quoted=false;
    const auto unit = [&](std::size_t& i) {
        require(i+4 < raw.size()); unsigned n=0;
        const auto [p,e]=std::from_chars(raw.data()+i+1,raw.data()+i+5,n,16);
        require(e==std::errc{} && p==raw.data()+i+5); i+=4; return n;
    };
    for (std::size_t i=0; i<raw.size(); ++i) {
        if (raw[i]=='"') quoted=!quoted;
        else if (quoted && raw[i]=='\\') {
            require(++i < raw.size()); if (raw[i]!='u') continue;
            const auto n=unit(i);
            if (n>=0xd800 && n<=0xdbff) {
                require(i+2<raw.size() && raw[i+1]=='\\' && raw[i+2]=='u'); i+=2;
                const auto low=unit(i); require(low>=0xdc00 && low<=0xdfff);
            } else require(n<0xdc00 || n>0xdfff);
        }
    }
}
inline json parse(const bytes& raw) {
    require(raw.size() <= DOCUMENT); (void)utf16(raw); escaped_scalars(raw);
    jsoncons::json_string_cursor cursor(raw, jsoncons::json_options().max_nesting_depth(16));
    auto value = restricted(cursor, 0); cursor.check_done(); require(cursor.done()); return value;
}
// Number-free RFC 8785 quoting: jsoncons' default control escapes use uppercase hex.
inline bytes quote(const std::string& raw) {
    (void)utf16(raw); bytes out="\""; const char* digits="0123456789abcdef";
    for (unsigned char c : raw) {
        switch (c) {
            case '"': out+="\\\""; break; case '\\': out+="\\\\"; break;
            case 8: out+="\\b"; break; case 9: out+="\\t"; break; case 10: out+="\\n"; break;
            case 12: out+="\\f"; break; case 13: out+="\\r"; break;
            default:
                if (c<0x20) { out+="\\u00"; out+=digits[c>>4]; out+=digits[c&15]; }
                else out+=static_cast<char>(c);
        }
    }
    return out+'"';
}
inline bytes jcs(const json& v) {
    if (v.is_string()) return quote(text(v));
    if (v.is_array()) {
        bytes out="["; for (const auto& x : v.array_range()) { if (out.size()>1) out+=','; out+=jcs(x); } return out+"]";
    }
    require(v.is_object()); std::vector<std::pair<std::u16string,std::string>> keys;
    for (const auto& x : v.object_range()) keys.emplace_back(utf16(std::string(x.key())), std::string(x.key()));
    std::sort(keys.begin(),keys.end()); bytes out="{";
    for (const auto& [order,key] : keys) { (void)order; if (out.size()>1) out+=','; out+=quote(key)+":"+jcs(v.at(key)); }
    return out+"}";
}
inline void semantics(const std::string& kind, const json& v, const std::string& version) {
    if (version == "2" && (kind == "plan" || kind == "manifest")) {
        require(text(v.at("parameters").at("radix_bits")) == text(v.at("precision").at("dtype")).substr(4));
        if (kind == "plan") { std::set<std::string> seen; for (const auto& op : v.at("operators").array_range()) require(seen.insert(text(op)).second); }
    }
    for (const auto* field : {"shape", "input_shape", "output_shape"}) if (v.contains(field)) {
        uint64_t product=1; for (const auto& d : v.at(field).array_range()) { const auto n=number(d); require(n>0 && n<=1048576/product); product*=n; }
    }
    if (v.contains("precision")) require(number(v.at("precision").at("fractional_bits")) == 0);
    if (v.contains("parameters")) for (const auto* field : {"radix_bits", "message_modulus", "carry_modulus"}) require(number(v.at("parameters").at(field)) > 0);
    if (v.contains("expires_unix_ms")) require(number(v.at("expires_unix_ms")) > number(v.at("valid_from_unix_ms")));
    if (kind == "receipt") require(number(v.at("completed_unix_ms")) >= number(v.at("started_unix_ms")));
    if (kind == "manifest") {
        uint64_t index=0, offset=0;
        for (const auto& entry : v.at("ordered_chunk_entries").array_range()) {
            const auto size=number(entry.at("byte_length"));
            require(number(entry.at("index")) == index++ && number(entry.at("byte_offset")) == offset && size>0 && size<=CHUNK); offset+=size;
        }
        require(offset == number(v.at("serialized_bytes")) && offset<=ARTIFACT && number(v.at("max_expanded_bytes"))>=offset && number(v.at("max_expanded_bytes"))<=ARTIFACT);
    }
}
inline json decode(const std::string& kind, const bytes& raw, const std::string& version) {
    auto value=parse(raw); require(schema_valid(kind,value,version));
    semantics(kind,value,version); require(jcs(value)==raw); return value;
}
inline bytes domain(const std::string& kind, const std::string& version) { return "kryvola/"+kind+"/v"+version+'\0'; }
inline bytes le(uint64_t n) { bytes out; for (unsigned i=0; i<8; ++i) out.push_back(static_cast<char>(n>>(8*i))); return out; }
inline std::string hex(const bytes& raw) { const char* digits="0123456789abcdef"; bytes out; for (unsigned char c : raw) { out+=digits[c>>4]; out+=digits[c&15]; } return out; }
inline bytes unhex(const std::string& s) {
    require(s.size()%2==0); bytes out;
    for (std::size_t i=0; i<s.size(); i+=2) { unsigned n=0; const auto [p,e]=std::from_chars(s.data()+i,s.data()+i+2,n,16); require(e==std::errc{} && p==s.data()+i+2); out+=static_cast<char>(n); } return out;
}
inline std::string hash(std::initializer_list<std::string_view> parts) {
    blake3_hasher state; blake3_hasher_init(&state); for (const auto part : parts) blake3_hasher_update(&state,part.data(),part.size());
    bytes out(32,'\0'); blake3_hasher_finalize(&state,reinterpret_cast<uint8_t*>(out.data()),out.size()); return hex(out);
}
inline std::string commitment(const std::string& kind, const bytes& raw, const std::string& version) {
    require(kind!="signature"); decode(kind,raw,version); return hash({domain(kind,version),raw});
}
inline std::string chunk(uint64_t index, const bytes& raw) { require(!raw.empty() && raw.size()<=CHUNK); return hash({domain("chunk","1"),le(index),le(raw.size()),raw}); }
inline std::string blob(const bytes& raw) { require(!raw.empty() && raw.size()<=ARTIFACT); return hash({domain("blob","1"),raw}); }
inline bytes preimage(const json& envelope, const bytes& raw, const std::string& version) {
    decode("signature",jcs(envelope),version); const auto kind=text(envelope.at("payload_kind"));
    require(commitment(kind,raw,version)==text(envelope.at("payload_digest")));
    auto header=envelope; header.erase("signature"); const auto h=jcs(header);
    return domain("signature/"+kind,version)+le(h.size())+h+le(raw.size())+raw;
}
inline bool verify(const std::string& key_hex, std::string signature, const bytes& message) {
    const auto raw=unhex(key_hex); std::replace(signature.begin(),signature.end(),'-','+'); std::replace(signature.begin(),signature.end(),'_','/');
    require(signature.size()==86); signature+="=="; unsigned char decoded[66];
    require(EVP_DecodeBlock(decoded,reinterpret_cast<const unsigned char*>(signature.data()),signature.size())==66);
    std::unique_ptr<EVP_PKEY,decltype(&EVP_PKEY_free)> key(EVP_PKEY_new_raw_public_key(EVP_PKEY_ED25519,nullptr,reinterpret_cast<const unsigned char*>(raw.data()),raw.size()),EVP_PKEY_free);
    std::unique_ptr<EVP_MD_CTX,decltype(&EVP_MD_CTX_free)> ctx(EVP_MD_CTX_new(),EVP_MD_CTX_free);
    require(key && ctx && EVP_DigestVerifyInit(ctx.get(),nullptr,nullptr,nullptr,key.get())==1);
    return EVP_DigestVerify(ctx.get(),decoded,64,reinterpret_cast<const unsigned char*>(message.data()),message.size())==1;
}
} // namespace canonical
