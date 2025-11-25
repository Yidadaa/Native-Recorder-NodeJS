cmake_minimum_required(VERSION 3.15)
project(NativeAudioSDK)

# --- Configuration ---
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# --- Dependencies ---
include_directories(${CMAKE_JS_INC})

# node-addon-api
# execute_process(COMMAND node -p "require('node-addon-api').include"
#        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
#        OUTPUT_VARIABLE NODE_ADDON_API_DIR
#        OUTPUT_STRIP_TRAILING_WHITESPACE)

set(NODE_ADDON_API_DIR "${CMAKE_SOURCE_DIR}/node_modules/node-addon-api")
include_directories(${NODE_ADDON_API_DIR})

# --- Source Files ---
set(ENGINE_SOURCES
    native/Factory.cpp
)

# Platform specific sources
if(WIN32)
    list(APPEND ENGINE_SOURCES 
        native/win/WASAPIEngine.cpp
    )
    add_definitions(-DNAPI_CPP_EXCEPTIONS -DWIN32_LEAN_AND_MEAN)
elseif(APPLE)
    list(APPEND ENGINE_SOURCES 
        # native/mac/AVFEngine.mm
        # native/mac/SCKEngine.mm
    )
    add_definitions(-DNAPI_CPP_EXCEPTIONS)
endif()

set(SOURCE_FILES
    native/main.cpp
    native/AudioController.cpp
    ${ENGINE_SOURCES}
)

# --- Main Target (Node Addon) ---
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB})

if(WIN32)
    target_link_libraries(${PROJECT_NAME} PRIVATE Ole32) # Example for Windows
elseif(APPLE)
    find_library(AVFOUNDATION_FRAMEWORK AVFoundation)
    find_library(COREAUDIO_FRAMEWORK CoreAudio)
    target_link_libraries(${PROJECT_NAME} PRIVATE ${AVFOUNDATION_FRAMEWORK} ${COREAUDIO_FRAMEWORK})
endif()

# --- Testing (Catch2) ---
option(BUILD_TESTS "Build unit tests" OFF)

if(BUILD_TESTS)
    include(FetchContent)
    FetchContent_Declare(
        Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG        v3.4.0
    )
    FetchContent_MakeAvailable(Catch2)

    # Define test sources (exclude main.cpp which has N-API exports)
    set(TEST_SOURCES
        test/native/test_wasapi.cpp
        test/native/test_factory.cpp
        ${ENGINE_SOURCES}
    )

    add_executable(NativeTests ${TEST_SOURCES})
    target_link_libraries(NativeTests PRIVATE Catch2::Catch2WithMain)
    
    # Link platform libs to tests as well
    if(WIN32)
        target_link_libraries(NativeTests PRIVATE Ole32)
    elseif(APPLE)
        target_link_libraries(NativeTests PRIVATE ${AVFOUNDATION_FRAMEWORK} ${COREAUDIO_FRAMEWORK})
    endif()

    enable_testing()
    include(CTest)
    include(Catch)
    catch_discover_tests(NativeTests)
endif()
