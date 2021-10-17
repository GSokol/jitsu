package airbyte

import (
	"bufio"
	"encoding/json"
	"fmt"
	"github.com/jitsucom/jitsu/server/airbyte"
	"github.com/jitsucom/jitsu/server/drivers/base"
	"github.com/jitsucom/jitsu/server/logging"
	"github.com/jitsucom/jitsu/server/schema"
	"io"
)

const (
	batchSize     = 10_000
	airbyteSystem = "Airbyte"

	syncModeIncremental = "incremental"
	syncModeFullRefresh = "full_refresh"
)

//dbDockerImages db sources doesn't support increment sync mode yet
var dbDockerImages = map[string]bool{
	"source-postgres": true,
	"source-mssql":    true,
	"source-oracle":   true,
	"source-mysql":    true,
}

//streamOutputParser is an Airbyte output parser
type streamOutputParser struct {
	dataConsumer          base.CLIDataConsumer
	streamsRepresentation map[string]*base.StreamRepresentation
	logger                logging.TaskLogger
}

//Parse reads from stdout and:
//  parses airbyte output
//  applies input schemas
//  passes data as batches to dataConsumer
func (sop *streamOutputParser) Parse(stdout io.ReadCloser) error {
	sop.logger.INFO("Airbyte sync will store data as batches >= [%d] elements size", batchSize)

	output := &base.CLIOutputRepresentation{
		Streams: map[string]*base.StreamRepresentation{},
	}

	for streamName, representation := range sop.streamsRepresentation {
		output.Streams[streamName] = &base.StreamRepresentation{
			BatchHeader: &schema.BatchHeader{TableName: representation.BatchHeader.TableName, Fields: representation.BatchHeader.Fields.Clone()},
			KeyFields:   representation.KeyFields,
			Objects:     []map[string]interface{}{},
			NeedClean:   representation.NeedClean,
		}
	}

	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)

	records := 0
	for scanner.Scan() {
		lineBytes := scanner.Bytes()

		row := &airbyte.Row{}
		err := json.Unmarshal(lineBytes, row)
		if err != nil {
			sop.logger.LOG(string(lineBytes), airbyteSystem, logging.DEBUG)
			continue
		}

		if row.Type != airbyte.RecordType || row.Record == nil {
			sop.logger.LOG(string(lineBytes), airbyteSystem, logging.DEBUG)
			continue
		}

		switch row.Type {
		case airbyte.LogType:
			if row.Log == nil {
				return fmt.Errorf("Error parsing airbyte log line %s: 'log' doesn't exist", string(lineBytes))
			}
			switch row.Log.Level {
			case "ERROR":
				sop.logger.LOG(row.Log.Message, airbyteSystem, logging.ERROR)
			case "INFO":
				sop.logger.LOG(row.Log.Message, airbyteSystem, logging.INFO)
			case "WARN":
				sop.logger.LOG(row.Log.Message, airbyteSystem, logging.WARN)
			default:
				logging.SystemErrorf("Unknown airbyte log message level: %s", row.Log.Level)
			}
		case airbyte.StateType:
			if row.State == nil || row.State.Data == nil {
				return fmt.Errorf("Error parsing airbyte state line %s: malformed state line 'data' doesn't exist", string(lineBytes))
			}

			output.State = row.State.Data
		case airbyte.RecordType:
			records++
			if row.Record == nil || row.Record.Data == nil {
				return fmt.Errorf("Error parsing airbyte record line %s: %v", string(lineBytes), err)
			}

			output.Streams[row.Record.Stream].Objects = append(output.Streams[row.Record.Stream].Objects, row.Record.Data)
		default:
			msg := fmt.Sprintf("Unknown airbyte output line type: %s [%s]", row.Type, string(lineBytes))
			logging.Error(msg)
			sop.logger.ERROR(msg)
		}

		//persist batch and recreate variables
		if records >= batchSize {
			err := sop.dataConsumer.Consume(output)
			if err != nil {
				return err
			}

			//remove already persisted objects
			//sets needClean = false because clean should be executed only 1 time
			for _, stream := range output.Streams {
				stream.Objects = []map[string]interface{}{}
				stream.NeedClean = false
			}
			records = 0
		}
	}

	//persist last batch
	if records > 0 {
		err := sop.dataConsumer.Consume(output)
		if err != nil {
			return err
		}
	}

	err := scanner.Err()
	if err != nil {
		return err
	}

	return nil
}

//parseUnformattedCatalog parses raw catalog which was taken from Airbyte discover
func parseUnformattedCatalog(dockerImage string, outWriter *logging.StringWriter) ([]byte, map[string]*base.StreamRepresentation, error) {
	parsedRow, err := airbyte.Instance.ParseCatalogRow(outWriter)
	if err != nil {
		return nil, nil, err
	}

	formattedCatalog := &airbyte.Catalog{}
	streamsRepresentation := map[string]*base.StreamRepresentation{}
	for _, stream := range parsedRow.Catalog.Streams {
		syncMode := getSyncMode(dockerImage, stream.SupportedSyncModes)

		//formatted catalog
		formattedCatalog.Streams = append(formattedCatalog.Streams, &airbyte.WrappedStream{
			SyncMode: syncMode,
			//isn't used because Jitsu doesn't use airbyte destinations. Just should be a valid option.
			DestinationSyncMode: "overwrite",
			Stream:              stream,
		})

		//streams schema representation
		streamSchema := schema.Fields{}
		base.ParseProperties(base.AirbyteType, "", stream.JsonSchema.Properties, streamSchema)

		var keyFields []string
		for _, sourceDefinedPrimaryKeys := range stream.SourceDefinedPrimaryKey {
			if len(sourceDefinedPrimaryKeys) > 0 {
				keyFields = sourceDefinedPrimaryKeys
			}
		}

		streamsRepresentation[stream.Name] = &base.StreamRepresentation{
			Namespace:  stream.Namespace,
			StreamName: stream.Name,
			BatchHeader: &schema.BatchHeader{
				TableName: stream.Name,
				Fields:    streamSchema,
			},
			KeyFields: keyFields,
			Objects:   []map[string]interface{}{},
			//Set need clean only if full refresh => table will be truncated before data storing
			NeedClean: syncMode == syncModeFullRefresh,
		}
	}

	b, _ := json.MarshalIndent(formattedCatalog, "", "    ")

	return b, streamsRepresentation, nil
}

//parseFormattedCatalog parses formatted catalog from (UI/input)
func parseFormattedCatalog(catalogIface interface{}) (map[string]*base.StreamRepresentation, error) {
	b, _ := json.Marshal(catalogIface)
	catalog := &airbyte.Catalog{}
	if err := json.Unmarshal(b, catalog); err != nil {
		return nil, fmt.Errorf("can't unmarshal into airbyte.Catalog{}: %v", err)
	}

	streamsRepresentation := map[string]*base.StreamRepresentation{}
	for _, stream := range catalog.Streams {
		var keyFields []string
		for _, sourceDefinedPrimaryKeys := range stream.Stream.SourceDefinedPrimaryKey {
			if len(sourceDefinedPrimaryKeys) > 0 {
				keyFields = sourceDefinedPrimaryKeys
			}
		}

		//streams schema representation
		streamSchema := schema.Fields{}
		base.ParseProperties(base.AirbyteType, "", stream.Stream.JsonSchema.Properties, streamSchema)

		streamsRepresentation[stream.Stream.Name] = &base.StreamRepresentation{
			Namespace:  stream.Stream.Namespace,
			StreamName: stream.Stream.Name,
			BatchHeader: &schema.BatchHeader{
				TableName: stream.Stream.Name,
				Fields:    streamSchema,
			},
			KeyFields: keyFields,
			Objects:   []map[string]interface{}{},
			//Set need clean only if full refresh => table will be truncated before data storing
			NeedClean: stream.SyncMode == syncModeFullRefresh,
		}
	}

	return streamsRepresentation, nil
}

//getSyncMode returns incremental if supported
//otherwise returns first
//for DB source returns not incremental
func getSyncMode(dockerImage string, supportedSyncModes []string) string {
	if _, ok := dbDockerImages[dockerImage]; ok {
		return syncModeFullRefresh
	}

	if len(supportedSyncModes) == 0 {
		return syncModeIncremental
	}

	for _, supportedSyncMode := range supportedSyncModes {
		if supportedSyncMode == syncModeIncremental {
			return syncModeIncremental
		}
	}

	return supportedSyncModes[0]
}
