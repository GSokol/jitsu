package config

import (
	"bytes"
	"fmt"
	"github.com/jitsucom/jitsu/server/jsonutils"
	"github.com/jitsucom/jitsu/server/logging"
	"github.com/jitsucom/jitsu/server/resources"
	"github.com/spf13/viper"
	"os"
	"regexp"
	"strings"
)

const notsetDefaultValue = "__NOTSET_DEFAULT_VALUE__"
var templateVariablePattern = regexp.MustCompile(`\$\{env\.[\w_]+(?:\|[^\}]*)?\}`)

//Read reads config from configSourceStr that might be (HTTP URL or path to YAML/JSON file or plain JSON string)
//replaces all ${env.VAR} placeholders with OS variables
//configSourceStr might be overridden by "config_location" ENV variable
//returns err if occurred
func Read(configSourceStr string, containerizedRun bool, configNotFoundErrMsg string, appName string) error {
	viper.AutomaticEnv()

	//support OS env variables as lower case and dot divided variables e.g. SERVER_PORT as server.port
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	//overridden configuration from ENV
	overriddenConfigLocation := viper.GetString("config_location")
	if overriddenConfigLocation != "" {
		configSourceStr = overriddenConfigLocation
	}
	logging.Infof("%s config location: %s", appName, configSourceStr)
	var payload *resources.ResponsePayload
	var err error
	if strings.HasPrefix(configSourceStr, "http://") || strings.HasPrefix(configSourceStr, "https://") {
		payload, err = resources.LoadFromHTTP(configSourceStr, "")
	} else if strings.HasPrefix(configSourceStr, "{") && strings.HasSuffix(configSourceStr, "}") {
		jsonContentType := resources.JSONContentType
		payload = &resources.ResponsePayload{Content: []byte(configSourceStr), ContentType: &jsonContentType}
	} else if configSourceStr != "" {
		payload, err = resources.LoadFromFile(configSourceStr, "")
	} else {
		//run without config from sources
		logging.ConfigWarn = configNotFoundErrMsg
	}

	if err != nil {
		return handleConfigErr(err, containerizedRun, configNotFoundErrMsg)
	}

	if payload != nil && payload.ContentType != nil {
		viper.SetConfigType(string(*payload.ContentType))
	} else {
		//default content type
		viper.SetConfigType("json")
	}

	if payload != nil {
		err = viper.ReadConfig(bytes.NewBuffer(payload.Content))
		if err != nil {
			errWithContext := fmt.Errorf("Error reading/parsing config from %s: %v", configSourceStr, err)
			return handleConfigErr(errWithContext, containerizedRun, configNotFoundErrMsg)
		}
	}

	//resolve ${env.VAR} placeholders from config values
	envPlaceholderValues := map[string]interface{}{}
	for _, k := range viper.AllKeys() {
		value := viper.GetString(k)
		if templateVariablePattern.MatchString(value) {
			res := templateVariablePattern.ReplaceAllStringFunc(value, func(value string) string {
				envExpression := strings.TrimSuffix(strings.TrimPrefix(value, "${env."), "}")
				defaultValue := notsetDefaultValue
				envName := envExpression
				//check if default value provided
				if strings.Contains(envName, "|") {
					envNameParts := strings.Split(envName, "|")
					if len(envNameParts) != 2 {
						logging.Fatalf("Malformed ${env.VAR|default_value} placeholder in config value: %s = %s", k, value)
					}
					envName = envNameParts[0]
					defaultValue = envNameParts[1]
				}
				res := os.Getenv(envName)
				if res == "" {
					if defaultValue == notsetDefaultValue {
						logging.Fatalf("Mandatory env variable was not found: %s", envName)
					}
					res = defaultValue
				}
				return res
			})
			valuePath := jsonutils.NewJSONPath(strings.ReplaceAll(k, ".", "/"))
			err := valuePath.Set(envPlaceholderValues, res)
			if err != nil {
				logging.Fatalf("Unable to set value in %s config path", k)
			}
		}
	}

	//merge back into viper
	if len(envPlaceholderValues) > 0 {
		if err := viper.MergeConfigMap(envPlaceholderValues); err != nil {
			logging.Fatalf("Error merging env values into viper config: %v", err)
		}
	}

	return nil
}

//handleConfigErr returns err only if application can't start without config
//otherwise log error and return nil
func handleConfigErr(err error, containerizedRun bool, configNotFoundErrMsg string) error {
	//failfast for running service from source (not containerised) and with wrong config
	if !containerizedRun {
		return err
	}

	logging.ConfigErr = err.Error()
	logging.ConfigWarn = configNotFoundErrMsg
	return nil
}
