#include "canonical.hpp"
#include <functional>
#include <iostream>
#include <limits>
#include <sstream>
#include <source_location>
using namespace canonical;
void rejects(const std::function<void()>& fn, const std::source_location where=std::source_location::current()) {
    bool failed=false; try { fn(); } catch (const std::exception&) { failed=true; } if (!failed) throw std::runtime_error("expected rejection at test line "+std::to_string(where.line()));
}
json corpus(const std::string& name) { return load("generated/fixtures/canonical-"+name+".json"); }
json golden(const std::string& name, const std::string& kind) {
    const auto c=corpus(name);
    for (const auto& v : c.at("objects").array_range()) if (text(v.at("kind"))==kind) return v.at("value");
    throw std::runtime_error("missing fixture");
}
void objects() {
    for (const auto& [name,version] : {std::pair{"corpus","1"},std::pair{"modular-v2","2"}}) {
        const auto c=corpus(name);
        for (const auto& v : c.at("objects").array_range()) {
            const auto kind=text(v.at("kind")), raw=unhex(text(v.at("canonical_hex")));
            require(jcs(v.at("value"))==raw && decode(kind,raw,version)==v.at("value"));
            const auto digest=commitment(kind,raw,version); require(digest==text(v.at("digest")));
            const auto message=v.contains("envelope") ? preimage(v.at("envelope"),raw,version) : bytes{};
            auto record=json::parse("[]"); record.push_back(version); record.push_back(kind); record.push_back(hex(jcs(v.at("value")))); record.push_back(digest); record.push_back(hex(message));
            std::cout<<"KRYVOLA_RESULT "<<record<<'\n';
            auto changed=v.at("value"); changed.erase("tenant_scope"); rejects([&]{decode(kind,jcs(changed),version);});
            changed=v.at("value"); changed["unknown"]="x"; rejects([&]{decode(kind,jcs(changed),version);});
            rejects([&]{decode(kind,raw+"\n",version);}); rejects([&]{decode(kind,raw,"3");});
            require(hash({domain("wrong",version),raw})!=digest);
            if (!v.contains("envelope")) continue;
            const auto envelope=v.at("envelope"); const auto key=text(c.at("public_key_hex")), sig=text(envelope.at("signature"));
            require(hex(message)==text(v.at("preimage_hex")) && verify(key,sig,message));
            auto tampered=message; tampered[0]^=1; require(!verify(key,sig,tampered));
            changed=envelope; changed["signer"]="other"; require(!verify(key,sig,preimage(changed,raw,version)));
            changed["payload_digest"]=std::string(64,'0'); rejects([&]{preimage(changed,raw,version);});
            rejects([&]{preimage(envelope,raw,std::string(version)=="1" ? "2" : "1");});
        }
    }
}
void negatives() {
    for (const auto& [vectors,version] : {std::pair{corpus("negative"),"1"},std::pair{corpus("modular-v2").at("negative"),"2"}}) {
        require(vectors.size()==(std::string(version)=="1" ? 24u : 8u));
        for (const auto& v : vectors.array_range()) rejects([&]{decode(text(v.at("kind")),unhex(text(v.at("bytes_hex"))),version);});
    }
}
void parser() {
    for (const auto& raw : {bytes(R"({"a":"x","a":"y"})"),bytes(R"({"a":"x","\u0061":"y"})"),
        bytes(R"({"x":{"a":"x","a":"y"}})"),bytes(R"("\ud800")"),bytes(R"({"\udfff":"x"})"),bytes(R"("\udfff")"),bytes(R"({"\ud800":"x"})"),
        bytes("\xff"),bytes("\xc0\xaf"),bytes("\xe0\x80\x80"),bytes("\xf0\x80\x80\x80"),bytes("\xe2\x28\xa1"),bytes("\x80"),bytes("\xf0\x9f"),bytes("\xed\xa0\x80"),bytes("\xf4\x90\x80\x80"),
        bytes("0"),bytes("1e3"),bytes("-0"),bytes("NaN"),bytes("true"),bytes("false"),bytes("null"),bytes("{} {}")}) rejects([&]{parse(raw);});
    require(text(parse("\""+std::string(DOCUMENT-2,'x')+"\""))==std::string(DOCUMENT-2,'x'));
    rejects([&]{parse("\""+std::string(DOCUMENT-1,'x')+"\"");});
    parse(std::string(16,'[')+"\"x\""+std::string(16,']'));
    rejects([&]{parse(std::string(17,'[')+"\"x\""+std::string(17,']'));});
    require(text(parse(R"("\ud83d\ude00")"))=="😀");
    require(utf16("\xf4\x8f\xbf\xbf")==std::u16string{0xdbff,0xdfff});
    require(utf16("\xf0\x90\x80\x80")==std::u16string{0xd800,0xdc00});
    require(text(parse(R"("\\udfff")"))==R"(\udfff)");
    const bytes unicode="{\"😀\":\"é\",\"\":\"é\"}"; require(jcs(parse(unicode))==unicode);
    require(text(parse(R"("[\"{]")"))=="[\"{]");
    const bytes separators="\xe2\x80\xa8\xe2\x80\xa9/</script>"; require(jcs(json(separators))=="\""+separators+"\"");
    // All JSON control escapes, plus ordinary Unicode, must use the shortest JCS representation.
    bytes controls, expected="\"";
    for (unsigned i=0; i<32; ++i) {
        controls+=static_cast<char>(i);
        switch (i) { case 8: expected+="\\b"; break; case 9: expected+="\\t"; break; case 10: expected+="\\n"; break;
        case 12: expected+="\\f"; break; case 13: expected+="\\r"; break; default: expected+="\\u00"+hex(bytes(1,static_cast<char>(i))); }
    }
    require(jcs(json(controls))==expected+"\"");
}
void framing() {
    require(hash({""})=="af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262");
    const auto v=corpus("corpus").at("chunk"); const auto raw=unhex(text(v.at("bytes_hex")));
    require(chunk(number(v.at("index")),raw)==text(v.at("digest")) && blob(raw)==text(v.at("blob_digest")));
    const auto maximum=std::numeric_limits<uint64_t>::max(); require(le(maximum)==bytes(8,static_cast<char>(255)));
    require(chunk(maximum,raw)!=text(v.at("digest"))); chunk(0,bytes(CHUNK,'\0'));
    rejects([]{chunk(0,{});}); rejects([]{blob({});}); rejects([]{chunk(0,bytes(CHUNK+1,'\0'));});
}
void semantics_tests() {
    for (const auto& [pointer,replacement] : {std::pair{"input_shape","0"},std::pair{"input_shape","18446744073709551615"},
        std::pair{"radix_bits","16"},std::pair{"message_modulus","0"},std::pair{"carry_modulus","18446744073709551616"},std::pair{"fractional_bits","1"}}) {
        auto v=golden("modular-v2","plan"); const std::string field=pointer;
        if (field=="input_shape") v["input_shape"][0]=replacement;
        else if (field=="fractional_bits") v["precision"][field]=replacement;
        else v["parameters"][field]=replacement;
        rejects([&]{decode("plan",jcs(v),"2");});
    }
    auto plan=golden("modular-v2","plan"); plan["operators"].push_back(plan["operators"][0]); rejects([&]{decode("plan",jcs(plan),"2");});
    plan=golden("modular-v2","plan"); plan["parameters"]["unknown"]="x"; rejects([&]{decode("plan",jcs(plan),"2");});
    rejects([&]{decode("receipt",jcs(plan),"2");});
    for (const auto* field : {"byte_offset","byte_length","index","serialized_bytes","max_expanded_bytes"}) {
        auto v=golden("corpus","manifest"); const std::string f=field;
        if (f=="serialized_bytes") v[f]="5";
        else if (f=="max_expanded_bytes") v[f]="1073741825";
        else v["ordered_chunk_entries"][0][f]=(f=="byte_length" ? "0" : "1");
        rejects([&]{decode("manifest",jcs(v),"1");});
    }
    auto approval=golden("corpus","approval"); approval["expires_unix_ms"]=approval.at("valid_from_unix_ms"); rejects([&]{decode("approval",jcs(approval),"1");});
    auto receipt=golden("corpus","receipt"); receipt["started_unix_ms"]="1"; receipt["completed_unix_ms"]="0"; rejects([&]{decode("receipt",jcs(receipt),"1");});
    receipt["started_unix_ms"]="18446744073709551615"; receipt["completed_unix_ms"]=receipt.at("started_unix_ms"); decode("receipt",jcs(receipt),"1");
    for (const auto* invalid : {"18446744073709551616","01","+1"}) { receipt["completed_unix_ms"]=invalid; rejects([&]{decode("receipt",jcs(receipt),"1");}); }
}
int main() {
    std::string group;
    try {
        for (const auto& [name,run] : {std::pair{"objects",&objects},std::pair{"negatives",&negatives},
            std::pair{"parser",&parser},std::pair{"framing",&framing},std::pair{"semantics",&semantics_tests}}) {
            group=name; run(); std::cout<<"C++ "<<group<<" passed.\n";
        }
        std::cout<<"C++ canonical conformance passed: five groups, nine objects, eight signatures, 32 negatives.\n";
    } catch (const std::exception& e) { std::cerr<<"C++ canonical conformance failed ["<<group<<"]: "<<e.what()<<'\n'; return 1; }
}
