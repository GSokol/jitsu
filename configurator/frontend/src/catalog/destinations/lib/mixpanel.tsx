import { filteringExpressionDocumentation, modeParameter, tableName } from "./common"
import {
  arrayOf,
  booleanType,
  descriptionType,
  jsType,
  passwordType,
  selectionType,
  stringType,
} from "../../sources/types"

const icon = (
  <svg width="100%" height="100%" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="28" height="28" rx="4" fill="#4F44E0" />
    <circle cx="8" cy="14" r="3" fill="white" />
    <circle cx="16" cy="14" r="2" fill="white" />
    <circle cx="22" cy="14" r="1" fill="white" />
  </svg>
)

const mixpanelDestination = {
  description: (
    <>
      Jitsu can send events from JS SDK or Events API to Google Analytics API to any HTTP(s) endpoint. Data format is
      fully configurable with an easy template language
    </>
  ),
  syncFromSourcesStatus: "not_supported",
  id: "mixpanel",
  type: "other",
  displayName: "Mixpanel",
  defaultTransform: "return toMixpanel($, {userProfileUpdates: {}, additionalProperties: {}, overriddenEventName: ''})",
  hidden: false,
  parameters: [
    {
      id: "_super_type",
      constant: "webhook",
    },
    modeParameter("stream"),
    {
      id: "_formData.description",
      displayName: "Description",
      required: false,
      type: descriptionType,
      defaultValue: (
        <span>
          Jitsu sends events to Mixpanel Ingestion API filling as much Mixpanel Events Properties as possible from
          original event data.
          <br />
          Mixpanel destination may also send User Profiles data to Mixpanel accounts that have User Profiles enabled.
          <br />
          <br />
          For more on Mixpanel destination customization check{" "}
          <a target="_blank" href="https://jitsu.com/docs/destinations-configuration/mixpanel">
            Documentation
          </a>
        </span>
      ),
    },
    {
      id: "_formData._token",
      displayName: "Project Token",
      required: true,
      type: stringType,
      documentation: (
        <>
          <a href="https://developer.mixpanel.com/reference/project-token">Project Token</a>. A project's token can be
          found in the Access Keys section of a project's settings overview page:{" "}
          <a href="https://mixpanel.com/settings/project/">https://mixpanel.com/settings/project/</a>
        </>
      ),
    },
    {
      id: "_formData._users_enabled",
      displayName: "Enable User Profiles",
      required: false,
      type: booleanType,
      documentation: (
        <>
          Enables Mixpanel destination to work with User Profiles. <br /> See{" "}
          <a href="https://jitsu.com/docs/destinations-configuration/mixpanel#user-profiles">User Profiles</a> section
          of Documentation
        </>
      ),
    },
    {
      id: "_formData._anonymous_users_enabled",
      displayName: "User Profiles for anonymous users",
      required: false,
      type: booleanType,
      documentation: (
        <>
          Enables updating User Profiles for anonymous users. Requires <b>Enable User Profiles</b> enabled.
        </>
      ),
    },
  ],
  ui: {
    icon,
    connectCmd: null,
    title: cfg => cfg["_formData"]["_projectId"],
  },
} as const

export default mixpanelDestination
