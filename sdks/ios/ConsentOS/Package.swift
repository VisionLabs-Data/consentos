// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "ConsentOS",
    platforms: [
        .iOS(.v15),
        .macOS(.v12)  // macOS target for running tests via `swift test`
    ],
    products: [
        .library(
            name: "ConsentOSCore",
            targets: ["ConsentOSCore"]
        ),
        .library(
            name: "ConsentOSUI",
            targets: ["ConsentOSUI"]
        )
    ],
    targets: [
        .target(
            name: "ConsentOSCore",
            path: "Sources/ConsentOSCore"
        ),
        .target(
            name: "ConsentOSUI",
            dependencies: ["ConsentOSCore"],
            path: "Sources/ConsentOSUI"
        ),
        .testTarget(
            name: "ConsentOSCoreTests",
            dependencies: ["ConsentOSCore"],
            path: "Tests/ConsentOSCoreTests"
        )
    ]
)
