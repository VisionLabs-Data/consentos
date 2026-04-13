Pod::Spec.new do |s|
  s.name             = 'ConsentOS'
  s.version          = '0.1.0'
  s.summary          = 'iOS consent management SDK for ConsentOS.'
  s.description      = <<~DESC
    ConsentOS provides cookie and tracking consent management for iOS apps.
    It handles consent collection, persistence, server synchronisation,
    IAB TCF v2.2 string generation, and Google Consent Mode v2 signalling.
  DESC

  s.homepage         = 'https://consentos.dev'
  s.license          = { :type => 'Elastic-2.0', :file => 'LICENSE' }
  s.author           = { 'ConsentOS' => 'hello@consentos.dev' }

  s.ios.deployment_target = '15.0'
  s.swift_version         = '5.9'

  s.source = {
    :git  => 'https://github.com/consentos/consentos.git',
    :tag  => "ios-sdk/#{s.version}"
  }

  # Core module — no external dependencies
  s.subspec 'Core' do |core|
    core.source_files = 'sdks/ios/ConsentOS/Sources/ConsentOSCore/**/*.swift'
  end

  # UI module — depends on Core, SwiftUI built-in
  s.subspec 'UI' do |ui|
    ui.source_files = 'sdks/ios/ConsentOS/Sources/ConsentOSUI/**/*.swift'
    ui.dependency 'ConsentOS/Core'
    ui.frameworks = 'SwiftUI', 'UIKit'
  end

  # Default subspecs
  s.default_subspec = 'UI'

  s.frameworks = 'Foundation'
end
