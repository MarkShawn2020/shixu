Pod::Spec.new do |s|
  s.name           = 'DocumentVision'
  s.version        = '1.0.0'
  s.summary        = 'Local Apple Vision document rectangle detection for 拾序'
  s.description    = 'Detects document quadrilaterals on device for perspective correction.'
  s.author         = 'Lovstudio'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
