Pod::Spec.new do |s|
  s.name           = 'ReelRender'
  s.version        = '0.1.0'
  s.summary        = 'Composes the beat-synced reel into a 1080x1920 30fps silent MP4.'
  s.description    = 'Local Expo module. AVMutableComposition on iOS, Media3 Transformer on Android.'
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
