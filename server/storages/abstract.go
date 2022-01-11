package storages

import (
	"fmt"
	"github.com/jitsucom/jitsu/server/config"
	"github.com/jitsucom/jitsu/server/logging"
	"math/rand"

	"github.com/jitsucom/jitsu/server/identifiers"

	"github.com/hashicorp/go-multierror"
	"github.com/jitsucom/jitsu/server/adapters"
	"github.com/jitsucom/jitsu/server/caching"
	"github.com/jitsucom/jitsu/server/counters"
	"github.com/jitsucom/jitsu/server/events"
	"github.com/jitsucom/jitsu/server/metrics"
	"github.com/jitsucom/jitsu/server/schema"
	"github.com/jitsucom/jitsu/server/telemetry"
)

//Abstract is an Abstract destination storage
//contains common destination funcs
//aka abstract class
type Abstract struct {
	destinationID  string
	fallbackLogger logging.ObjectLogger
	eventsCache    *caching.EventsCache
	processor      *schema.Processor

	tableHelpers []*TableHelper
	sqlAdapters  []adapters.SQLAdapter

	uniqueIDField        *identifiers.UniqueID
	staged               bool
	cachingConfiguration *config.CachingConfiguration

	archiveLogger logging.ObjectLogger
}

//ID returns destination ID
func (a *Abstract) ID() string {
	return a.destinationID
}

// Processor returns processor
func (a *Abstract) Processor() *schema.Processor {
	return a.processor
}

func (a *Abstract) IsStaging() bool {
	return a.staged
}

//GetUniqueIDField returns unique ID field configuration
func (a *Abstract) GetUniqueIDField() *identifiers.UniqueID {
	return a.uniqueIDField
}

//IsCachingDisabled returns true if caching is disabled in destination configuration
func (a *Abstract) IsCachingDisabled() bool {
	return a.cachingConfiguration != nil && a.cachingConfiguration.Disabled
}

func (a *Abstract) DryRun(payload events.Event) ([][]adapters.TableField, error) {
	_, tableHelper := a.getAdapters()
	return dryRun(payload, a.processor, tableHelper)
}

//ErrorEvent writes error to metrics/counters/telemetry/events cache
func (a *Abstract) ErrorEvent(fallback bool, eventCtx *adapters.EventContext, err error) {
	metrics.ErrorTokenEvent(eventCtx.TokenID, a.destinationID)
	counters.ErrorPushDestinationEvents(a.destinationID, 1)
	telemetry.Error(eventCtx.TokenID, a.destinationID, eventCtx.Src, "", 1)

	//cache
	a.eventsCache.Error(eventCtx.CacheDisabled, a.destinationID, eventCtx.EventID, err.Error())

	if fallback {
		a.Fallback(&events.FailedEvent{
			Event:   []byte(eventCtx.RawEvent.Serialize()),
			Error:   err.Error(),
			EventID: eventCtx.EventID,
		})
	}
}

//SuccessEvent writes success to metrics/counters/telemetry/events cache
func (a *Abstract) SuccessEvent(eventCtx *adapters.EventContext) {
	counters.SuccessPushDestinationEvents(a.destinationID, 1)
	telemetry.Event(eventCtx.TokenID, a.destinationID, eventCtx.Src, "", 1)
	metrics.SuccessTokenEvent(eventCtx.TokenID, a.destinationID)

	//cache
	a.eventsCache.Succeed(eventCtx)
}

//SkipEvent writes skip to metrics/counters/telemetry and error to events cache
func (a *Abstract) SkipEvent(eventCtx *adapters.EventContext, err error) {
	counters.SkipPushDestinationEvents(a.destinationID, 1)
	metrics.SkipTokenEvent(eventCtx.TokenID, a.destinationID)

	//cache
	a.eventsCache.Skip(eventCtx.CacheDisabled, a.destinationID, eventCtx.EventID, err.Error())
}

//Fallback logs event with error to fallback logger
func (a *Abstract) Fallback(failedEvents ...*events.FailedEvent) {
	for _, failedEvent := range failedEvents {
		a.fallbackLogger.ConsumeAny(failedEvent)
	}
}

//Insert ensures table and sends input event to Destination (with 1 retry if error)
func (a *Abstract) Insert(eventContext *adapters.EventContext) (insertErr error) {
	defer func() {
		//metrics/counters/cache/fallback
		a.AccountResult(eventContext, insertErr)

		//archive
		if insertErr == nil {
			a.archiveLogger.Consume(eventContext.RawEvent, eventContext.TokenID)
		}
	}()

	sqlAdapter, tableHelper := a.getAdapters()

	dbSchemaFromObject := eventContext.Table

	dbTable, err := tableHelper.EnsureTableWithCaching(a.ID(), eventContext.Table)
	if err != nil {
		//renew current db schema and retry
		return a.retryInsert(sqlAdapter, tableHelper, eventContext, dbSchemaFromObject)
	}

	eventContext.Table = dbTable

	err = sqlAdapter.Insert(eventContext)
	if err != nil {
		//renew current db schema and retry
		return a.retryInsert(sqlAdapter, tableHelper, eventContext, dbSchemaFromObject)
	}

	return nil
}

//retryInsert does retry if ensuring table or insert is failed
func (a *Abstract) retryInsert(sqlAdapter adapters.SQLAdapter, tableHelper *TableHelper, eventContext *adapters.EventContext,
	dbSchemaFromObject *adapters.Table) error {
	dbTable, err := tableHelper.RefreshTableSchema(a.ID(), dbSchemaFromObject)
	if err != nil {
		return err
	}

	dbTable, err = tableHelper.EnsureTableWithCaching(a.ID(), dbSchemaFromObject)
	if err != nil {
		return err
	}

	eventContext.Table = dbTable

	err = sqlAdapter.Insert(eventContext)
	if err != nil {
		return err
	}

	return nil
}

//AccountResult checks input error and calls ErrorEvent or SuccessEvent
func (a *Abstract) AccountResult(eventContext *adapters.EventContext, err error) {
	if err != nil {
		if IsConnectionError(err) {
			a.ErrorEvent(false, eventContext, err)
		} else {
			a.ErrorEvent(true, eventContext, err)
		}
	} else {
		a.SuccessEvent(eventContext)
	}
}

//Clean removes all records from storage
func (a *Abstract) Clean(tableName string) error {
	return nil
}

func (a *Abstract) close() (multiErr error) {
	if a.fallbackLogger != nil {
		if err := a.fallbackLogger.Close(); err != nil {
			multiErr = multierror.Append(multiErr, fmt.Errorf("[%s] Error closing fallback logger: %v", a.ID(), err))
		}
	}
	if a.archiveLogger != nil {
		if err := a.archiveLogger.Close(); err != nil {
			multiErr = multierror.Append(multiErr, fmt.Errorf("[%s] Error closing archive logger: %v", a.ID(), err))
		}
	}
	if a.processor != nil {
		a.processor.Close()
	}

	return nil
}

//assume that adapters quantity == tableHelpers quantity
func (a *Abstract) getAdapters() (adapters.SQLAdapter, *TableHelper) {
	num := rand.Intn(len(a.sqlAdapters))
	return a.sqlAdapters[num], a.tableHelpers[num]
}
