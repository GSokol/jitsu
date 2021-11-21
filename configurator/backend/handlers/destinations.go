package handlers

import (
	"encoding/json"
	"fmt"
	"github.com/gin-gonic/gin"
	"github.com/jitsucom/jitsu/configurator/destinations"
	"github.com/jitsucom/jitsu/configurator/entities"
	"github.com/jitsucom/jitsu/configurator/jitsu"
	"github.com/jitsucom/jitsu/configurator/middleware"
	"github.com/jitsucom/jitsu/configurator/storages"
	enadapters "github.com/jitsucom/jitsu/server/adapters"
	endestinations "github.com/jitsucom/jitsu/server/destinations"
	"github.com/jitsucom/jitsu/server/logging"
	enmiddleware "github.com/jitsucom/jitsu/server/middleware"
	enstorages "github.com/jitsucom/jitsu/server/storages"
	"net/http"
	"time"
)

const DestinationsGettingErrMsg = "Destinations getting error"

type DestinationsHandler struct {
	configurationsService *storages.ConfigurationsService
	defaultS3             *enadapters.S3Config

	jitsuService *jitsu.Service
}

func NewDestinationsHandler(configurationsService *storages.ConfigurationsService, defaultS3 *enadapters.S3Config,
	jitsuService *jitsu.Service) *DestinationsHandler {
	return &DestinationsHandler{
		configurationsService: configurationsService,
		defaultS3:             defaultS3,
		jitsuService:          jitsuService,
	}
}

func (dh *DestinationsHandler) GetHandler(c *gin.Context) {
	begin := time.Now()
	destinationsMap, err := dh.configurationsService.GetDestinations()
	if err != nil {
		c.JSON(http.StatusInternalServerError, enmiddleware.ErrResponse(DestinationsGettingErrMsg, err))
		return
	}

	geoResolvers, err := dh.configurationsService.GetGeoDataResolvers()
	if err != nil {
		logging.SystemErrorf("Error getting geo resolvers: %v", err)
		geoResolvers = map[string]*entities.GeoDataResolver{}
	}

	idConfig := map[string]enstorages.DestinationConfig{}
	for projectID, destinationsEntity := range destinationsMap {
		if len(destinationsEntity.Destinations) == 0 {
			continue
		}
		postHandleDestinationIds := make([]string, 0)
		for _, d := range destinationsEntity.Destinations {
			if d.Type == enstorages.DbtCloudType {
				postHandleDestinationIds = append(postHandleDestinationIds, projectID+"."+d.UID)
			}
		}
		for _, destination := range destinationsEntity.Destinations {
			destinationID := projectID + "." + destination.UID
			enDestinationConfig, err := destinations.MapConfig(destinationID, destination, dh.defaultS3, postHandleDestinationIds)
			if err != nil {
				logging.Errorf("Error mapping destination config for destination type: %s id: %s projectID: %s err: %v", destination.Type, destination.UID, projectID, err)
				continue
			}

			//connect with geo resolver
			geoResolverConfig, ok := geoResolvers[projectID]
			if ok && geoResolverConfig.MaxMind != nil && geoResolverConfig.MaxMind.Enabled {
				enDestinationConfig.GeoDataResolverID = projectID
			}

			idConfig[destinationID] = *enDestinationConfig
		}
	}

	logging.Debugf("Destinations response in [%.2f] seconds", time.Now().Sub(begin).Seconds())
	c.JSON(http.StatusOK, &endestinations.Payload{Destinations: idConfig})
}

func (dh *DestinationsHandler) TestHandler(c *gin.Context) {
	destinationEntity := &entities.Destination{}
	err := c.BindJSON(destinationEntity)
	if err != nil {
		c.JSON(http.StatusBadRequest, enmiddleware.ErrResponse("Failed to parse request body", err))
		return
	}

	enDestinationConfig, err := destinations.MapConfig("test_connection", destinationEntity, dh.defaultS3, nil)
	if err != nil {
		c.JSON(http.StatusBadRequest, enmiddleware.ErrResponse(fmt.Sprintf("Failed to map [%s] firebase config to eventnative format", destinationEntity.Type), err))
		return
	}

	b, err := json.Marshal(enDestinationConfig)
	if err != nil {
		c.JSON(http.StatusBadRequest, enmiddleware.ErrResponse("Failed to serialize destination config", err))
		return
	}

	code, content, err := dh.jitsuService.TestDestination(b)
	if err != nil {
		c.JSON(http.StatusBadRequest, enmiddleware.ErrResponse("Failed to get response from jitsu server", err))
		return
	}

	if code == http.StatusOK {
		c.JSON(http.StatusOK, middleware.OkResponse{Status: "Connection established"})
		return
	}

	c.Header("Content-Type", jsonContentType)
	c.Writer.WriteHeader(code)

	_, err = c.Writer.Write(content)
	if err != nil {
		c.JSON(http.StatusBadRequest, enmiddleware.ErrResponse("Failed to write response", err))
	}
}
