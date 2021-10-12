declare interface CollectionSource {
  name: string;
  type: string;
  parameters: Array<{
    [key: string]: string[];
  }>;
  schedule: string;
}

declare type StreamWithRawData = CollectionSource & {
  rawStreamData: UnknownObject;
};

declare type SourceData = NativeSourceData & AirbyteSourceData;
declare interface NativeSourceData {
  collections: CollectionSource[];
  config: {
    [key: string]: string;
  };
  schedule?: string;
  destinations: string[];
  sourceId: string;
  sourceProtoType: string;
  connected: boolean;
  connectedErrorMessage?: string;
  sourceType: string;
}

declare interface AirbyteSourceData {
  sourceType: 'airbyte';
  /**
   * @deprecated
   * The new path for streams is config.config.catalog.streams
   */
  catalog?: {
    streams: Array<AirbyteStreamData>;
  };
  config: {
    [key: string]: string;
    catalog?: {
      streams: Array<AirbyteStreamData>;
    };
  };
}

declare type AirbyteStreamData = {
  sync_mode: string;
  destination_sync_mode: string;
  stream: {
    name: string;
    namespace?: string;
    json_schema: UnknownObject;
    supported_sync_modes: string[];
    [key: string]: unknown;
  };
};

