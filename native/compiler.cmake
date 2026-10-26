# The plugin host needs generic, C++ and Python helpers. The full protoc executable
# is the hash-verified upstream release; other compiler-language backends are unused.
function(kryvola_plugin_backends)
  get_target_property(sources libprotoc SOURCES)
  list(FILTER sources EXCLUDE REGEX "/compiler/(csharp|java|objectivec|php|ruby|rust)/")
  set_property(TARGET libprotoc PROPERTY SOURCES "${sources}")
endfunction()
if(CMAKE_CURRENT_SOURCE_DIR STREQUAL CMAKE_SOURCE_DIR)
  cmake_language(DEFER CALL kryvola_plugin_backends)
endif()
