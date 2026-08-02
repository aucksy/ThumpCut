Pod::Spec.new do |s|
  s.name           = 'InstagramShare'
  s.version        = '0.1.0'
  s.summary        = 'Hands a finished reel to Instagram’s Reels composer.'
  s.description    = 'Local Expo module. Opens Instagram with the exported reel loaded.'
  s.author         = 'ThumpCut'
  s.homepage       = 'https://github.com/aucksy/ThumpCut'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
