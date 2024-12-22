export const defaultDeviceProfile = {
  DeviceProfile: {
    MaxStreamingBitrate: 120000000, // 120mbps
    MaxStaticBitrate: 0,
    MusicStreamingTranscodingBitrate: 192000,
    DirectPlayProfiles: [
      {
        Container: "webm",
        Type: "Video",
        VideoCodec: "vp8,vp9", // av1
        AudioCodec: "vorbis,opus",
      },
      {
        Container: "mp4,m4v",
        Type: "Video",
        VideoCodec: "h264,hevc,vp8,vp9", // ,av1
        AudioCodec: "aac,mp3,opus,flac,vorbis",
      },
      {
        Container: "opus",
        Type: "Audio",
      },
      {
        Container: "webm",
        Type: "Audio",
        AudioCodec: "opus",
      },
      {
        Container: "mp3",
        Type: "Audio",
      },
      {
        Container: "mp2",
        Type: "Audio",
      },
      {
        Container: "aac",
        Type: "Audio",
      },
      {
        Container: "m4a",
        AudioCodec: "aac",
        Type: "Audio",
      },
      {
        Container: "m4b",
        AudioCodec: "aac",
        Type: "Audio",
      },
      {
        Container: "flac",
        Type: "Audio",
      },
      {
        Container: "webma",
        Type: "Audio",
      },
      {
        Container: "webm",
        Type: "Audio",
        AudioCodec: "webma",
      },
      {
        Container: "wav",
        Type: "Audio",
      },
      {
        Container: "ogg",
        Type: "Audio",
      },
    ],
    TranscodingProfiles: [
      {
        Container: "ts",
        Type: "Audio",
        AudioCodec: "aac",
        Context: "Streaming",
        Protocol: "hls",
        MaxAudioChannels: "2",
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: "aac",
        Type: "Audio",
        AudioCodec: "aac",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "mp3",
        Type: "Audio",
        AudioCodec: "mp3",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "opus",
        Type: "Audio",
        AudioCodec: "opus",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "wav",
        Type: "Audio",
        AudioCodec: "wav",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
      {
        Container: "ts",
        Type: "Video",
        AudioCodec: "aac,mp3",
        VideoCodec: "h264",
        Context: "Streaming",
        Protocol: "hls",
        MaxAudioChannels: "2",
        MinSegments: 1,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: "webm",
        Type: "Video",
        AudioCodec: "vorbis",
        VideoCodec: "vpx",
        Context: "Streaming",
        Protocol: "http",
        MaxAudioChannels: "2",
      },
    ],
    ContainerProfiles: [],
    CodecProfiles: [
      {
        Type: "VideoAudio",
        Codec: "aac",
        Conditions: [
          {
            Condition: "Equals",
            Property: "IsSecondaryAudio",
            Value: "false",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "VideoAudio",
        Conditions: [
          {
            Condition: "Equals",
            Property: "IsSecondaryAudio",
            Value: "false",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "Video",
        Codec: "h264",
        Conditions: [
          {
            Condition: "NotEquals",
            Property: "IsAnamorphic",
            Value: "true",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoProfile",
            Value: "high|main|baseline|constrained baseline|high 10",
            IsRequired: false,
          },
          {
            Condition: "LessThanEqual",
            Property: "VideoLevel",
            Value: "52",
            IsRequired: false,
          },
          {
            Condition: "NotEquals",
            Property: "IsInterlaced",
            Value: "true",
            IsRequired: false,
          },
        ],
      },
      {
        Type: "Video",
        Codec: "hevc",
        Conditions: [
          {
            Condition: "NotEquals",
            Property: "IsAnamorphic",
            Value: "true",
            IsRequired: false,
          },
          {
            Condition: "EqualsAny",
            Property: "VideoProfile",
            Value: "main|main 10",
            IsRequired: false,
          },
          {
            Condition: "LessThanEqual",
            Property: "VideoLevel",
            Value: "183",
            IsRequired: false,
          },
          {
            Condition: "NotEquals",
            Property: "IsInterlaced",
            Value: "true",
            IsRequired: false,
          },
        ],
      },
    ],
    SubtitleProfiles: [
      {
        Format: "vtt",
        Method: "External",
      },
      {
        Format: "ass",
        Method: "External",
      },
      {
        Format: "ssa",
        Method: "External",
      },
      {
        Format: "pgssub",
        Method: "External",
      },
    ],
  },
};


export interface Profile {
    maxWidth?: number;
    maxFramerate?: number;
    maxAudioChannels?: number;
    audioChannels?: number;
    videoBitRate?: number;   
    audioCodec?: string;
    audioBitRate?: number;
    name?: string;
}
