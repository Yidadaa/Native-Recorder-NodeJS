#include "../../native/AudioEngine.h"
#include <catch2/catch_test_macros.hpp>
#include <memory>


// Forward declaration
std::unique_ptr<AudioEngine> CreatePlatformAudioEngine();

TEST_CASE("Factory Creates Engine", "[factory]") {
  auto engine = CreatePlatformAudioEngine();
  REQUIRE(engine != nullptr);
}
