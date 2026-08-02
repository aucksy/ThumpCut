Pod::Spec.new do |s|
  s.name           = 'AudioDecode'
  s.version        = '0.1.0'
  s.summary        = 'Decodes a song into mono float samples for the on-device beat engine.'
  s.description    = 'Local Expo module. AVAssetReader on iOS, MediaCodec on Android.'
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
