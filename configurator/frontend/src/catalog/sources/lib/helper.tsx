import { snakeCaseToWords, toTitleCase } from '../../../utils/strings';
import {
  assertIsArray,
  assertIsArrayOfTypes,
  assertIsObject
} from '../../../utils/typeCheck';
import {
  SingerTap,
  jsonType,
  Parameter,
  SourceConnector,
  stringType,
  AirbyteSource,
  makeStringType,
  passwordType,
  makeIntType,
  booleanType,
  singleSelectionType
} from '../types';

export const singerConfigParams: Record<string, (tap: string) => Parameter> = {
  catalogJson: (tap: string): Parameter => {
    return {
      displayName: 'Singer Catalog JSON',
      id: 'catalog',
      type: jsonType,
      required: true,
      documentation: (
        <>
          Singer{' '}
          <a href="https://github.com/singer-io/getting-started/blob/master/docs/SPEC.md#catalog">
            catalog
          </a>{' '}
          that defines data layout.{' '}
          <a href={`https://github.com/singer-io/${tap}`}>
            Read catalog documentation for {tap}
          </a>
        </>
      ),
      defaultValue: {}
    };
  },
  stateJson: (tap: string): Parameter => {
    return {
      displayName: 'Singer Initial State JSON',
      id: 'state',
      type: jsonType,
      documentation: (
        <>
          Singer initial{' '}
          <a href="https://github.com/singer-io/getting-started/blob/master/docs/SPEC.md#state">
            state
          </a>
          . For most cases should be empty
          <a href={`https://github.com/singer-io/${tap}`}>
            Read documentation for {tap}
          </a>
        </>
      ),
      defaultValue: {}
    };
  },
  propertiesJson: (tap: string): Parameter => {
    return {
      displayName: 'Singer Properties JSON',
      id: 'properties',
      type: jsonType,
      documentation: (
        <>
          Singer properties that defines resulting schema.{' '}
          <a href={`https://github.com/singer-io/${tap}`}>
            Read documentation for {tap}
          </a>
        </>
      ),
      defaultValue: {}
    };
  },
  configJson: (tap: string): Parameter => {
    return {
      displayName: 'Singer Config JSON',
      id: 'config',
      type: jsonType,
      required: true,
      documentation: (
        <>
          Singer{' '}
          <a
            href={
              'https://github.com/singer-io/getting-started/blob/master/docs/SPEC.md#state'
            }
          >
            configuration
          </a>
          .{' '}
          <a href={`https://github.com/singer-io/${tap}`}>
            Read documentation for {tap}
          </a>
        </>
      ),
      defaultValue: {}
    };
  }
};

export type ParametersCustomization = {
  /**
   * Replacement for singerConfigParams.customConfig
   */
  customConfig?: Parameter[];
  legacyProperties?: boolean;
};

/**
 * Prefix each parameter id with given prefix
 */
export function prefixParameters(prefix: string, parameters: Parameter[]) {
  return parameters.map((p) => {
    return {
      ...p,
      id: prefix + p.id
    };
  });
}

/**
 * Customizes parameters for singer tap.
 */
export function customParameters(tap: string, params: ParametersCustomization) {
  return [
    ...(params.customConfig
      ? prefixParameters('config.', params.customConfig)
      : [singerConfigParams.customConfig(tap)])
  ];
}

/**
 * Update Parameter.id field to make its pattern similar to destination Parameters
 * */
const fixConfigParamsPath = (params: Parameter[]) =>
  params.map((p: Parameter) => ({
    ...p,
    id: `config.${p.id}`
  }));

/**
 * Not a common Source connector.
 */
export const makeSingerSource = (singerTap: SingerTap): SourceConnector => {
  return {
    protoType: 'singer',
    expertMode: !singerTap.parameters,
    pic: singerTap.pic,
    displayName: singerTap.displayName,
    id: `singer-${singerTap.tap}` as const,
    collectionTypes: [],
    documentation: singerTap.documentation,
    collectionParameters: [],
    deprecated: singerTap.deprecated,
    configParameters: [
      {
        displayName: 'Singer Tap',
        id: 'config.tap',
        type: stringType,
        required: true,
        documentation: <>Id of Singer Tap</>,
        constant: singerTap.tap
      },
      ...fixConfigParamsPath(
        singerTap.parameters ?? [singerConfigParams.configJson(singerTap.tap)]
      )
    ]
  };
};

export const makeAirbyteSource = (
  airbyteSource: AirbyteSource
): SourceConnector => {
  const dockerImageNameWithoutPrefix = airbyteSource.docker_image_name.replace(
    'airbyte/',
    ''
  ) as `source-${string}`;
  return {
    protoType: 'airbyte',
    expertMode: false,
    pic: airbyteSource.pic,
    displayName: airbyteSource.displayName,
    id: `airbyte-${dockerImageNameWithoutPrefix}` as const,
    collectionTypes: [],
    documentation: airbyteSource.documentation,
    collectionParameters: [],
    configParameters: [
      {
        displayName: 'Airbyte Connector',
        id: 'config.docker_image',
        type: stringType,
        required: true,
        documentation: <>Id of Connector Source</>,
        constant: dockerImageNameWithoutPrefix
      }
    ],
    hasLoadableParameters: true
  };
};

type EnrichedAirbyteSpecNode = UnknownObject & {
  id: string;
  parentNode?: EnrichedAirbyteSpecNode;
};

type AirbyteSpecNodeMappingParameters = {
  nodeName?: string;
  requiredFields?: string[];
  parentNode?: EnrichedAirbyteSpecNode;
  setChildrenParameters?: Partial<Parameter>;
  omitFieldRule?: (config: unknown) => boolean;
};

/**
 * Maps the spec of the Airbyte connector to the Jitsu `Parameter` schema of the `SourceConnector`.
 * @param specNode `connectionSpecification` field which is the root node of the airbyte source spec.
 */
export const mapAirbyteSpecToSourceConnectorConfig = function mapAirbyteNode(
  specNode: unknown,
  sourceName: string,
  options?: AirbyteSpecNodeMappingParameters
): Parameter[] {
  const result: Parameter[] = [];

  const {
    nodeName,
    parentNode,
    requiredFields,
    setChildrenParameters,
    omitFieldRule
  } = options || {};

  const id = `${parentNode.id}.${nodeName}`;
  const required = !!requiredFields?.includes(nodeName || '');
  const documentation = specNode['description'] ? (
    <span dangerouslySetInnerHTML={{ __html: specNode['description'] }} />
  ) : undefined;

  switch (specNode['type']) {
    case 'string': {
      const pattern = specNode['pattern'];
      const multiline = specNode['multiline'];
      const fieldType = multiline
        ? makeStringType({multiline})
        : specNode['airbyte_secret']
        ? passwordType
        : specNode['enum']
        ? singleSelectionType(specNode['enum'])
        : makeStringType(pattern ? {pattern} : {});
      const mappedStringField: Parameter = {
        displayName: specNode['title']
          ? toTitleCase(specNode['title'])
          : toTitleCase(snakeCaseToWords(nodeName)),
        id,
        type: fieldType,
        required,
        documentation,
        omitFieldRule,
        ...setChildrenParameters
      };
      if (specNode['default'] !== undefined)
        mappedStringField.defaultValue = specNode['default'];
      return [mappedStringField];
    }

    case 'integer': {
      const mappedIntegerField: Parameter = {
        displayName: specNode['title']
          ? toTitleCase(specNode['title'])
          : toTitleCase(snakeCaseToWords(nodeName)),
        id,
        type: makeIntType({
          minimum: specNode['minimum'],
          maximum: specNode['maximum']
        }),
        required,
        documentation,
        omitFieldRule
      };
      if (specNode['default'] !== undefined)
        mappedIntegerField.defaultValue = specNode['default'];
      return [mappedIntegerField];
    }

    case 'boolean': {
      const mappedBooleanField: Parameter = {
        displayName: specNode['title']
          ? toTitleCase(specNode['title'])
          : toTitleCase(snakeCaseToWords(nodeName)),
        id,
        type: booleanType,
        required,
        documentation,
        omitFieldRule
      };
      if (specNode['default'] !== undefined)
        mappedBooleanField.defaultValue = specNode['default'];
      return [mappedBooleanField];
    }

    case 'object': {
      let optionsEntries: [string, unknown][] = [];
      let listOfRequiredFields: string[] = [];

      if (specNode['properties']) {
        optionsEntries = getEntriesFromPropertiesField(specNode);
        const _listOfRequiredFields: unknown = specNode['required'] || [];
        assertIsArrayOfTypes(_listOfRequiredFields, 'string');
        listOfRequiredFields = _listOfRequiredFields;

      } else if (specNode['oneOf']) {
        // this is a rare case, see the Postgres source spec for an example
        optionsEntries = getEntriesFromOneOfField(specNode, nodeName);
        const optionsFieldName = Object.keys(
          optionsEntries[0][1]['properties']
        )[0];
        const options = optionsEntries.map(
          ([_, childNode]) =>
            childNode['properties']?.[optionsFieldName]?.['const']
        );
        const mappedSelectionField: Parameter = {
          displayName: specNode['title']
            ? toTitleCase(specNode['title'])
            : toTitleCase(snakeCaseToWords(nodeName)),
          id: `${parentNode.id}.${nodeName}.${optionsFieldName}`,
          type: singleSelectionType(options),
          required,
          documentation,
          omitFieldRule
        };

        mappedSelectionField.defaultValue = specNode?.['default'] || options[0];
        result.push(mappedSelectionField);
      } else {
        throw new Error(
          'Failed to parse Airbyte source spec -- unknown field of `object` type'
        );
      }

      assertIsObject(specNode);

      const parentId = id;
      optionsEntries.forEach(([nodeName, node]) =>
        result.push(
          ...mapAirbyteNode(node, sourceName, {
            nodeName,
            requiredFields: listOfRequiredFields,
            parentNode: {
              ...specNode,
              id: parentId,
              parentNode
            }
          })
        )
      );
      break;
    }
    case undefined: {
      if (specNode['allOf']) {
        // Case for the nodes that have the 'allOf' property
        const nodes = specNode['allOf'];
        assertIsArray(nodes);
        nodes.forEach((node) => {
          assertIsObject(node);
          result.push(
            ...mapAirbyteNode(node, sourceName, {
              nodeName,
              requiredFields,
              parentNode: {
                ...node,
                id: parentNode.id,
                parentNode
              },
              setChildrenParameters: {
                documentation,
                required
              }
            })
          );
        });
      } else if (specNode['$ref']) {
        const refNode = getAirbyteSpecNodeByRef(parentNode, specNode['$ref']);
        result.push(
          ...mapAirbyteNode(refNode, sourceName, {
            nodeName,
            parentNode,
            setChildrenParameters
          })
        );
      } else {
        // Special case for the nodes from the `oneOf` list in the `object` node
        const childrenNodesEntries: unknown = Object.entries(
          specNode['properties']
        ).sort(([_, nodeA], [__, nodeB]) => nodeA?.['order'] - nodeB?.['order']);

        const parentNodeValueProperty = childrenNodesEntries[0][0];
        const parentNodeValueKey = `${parentNode.id}.${parentNodeValueProperty}`;
        const _listOfRequiredFields: unknown = specNode['required'] || [];
        assertIsObject(specNode);
        assertIsArray(childrenNodesEntries);
        assertIsArrayOfTypes(_listOfRequiredFields, 'string');
        childrenNodesEntries
          .slice(1) // Ecludes the first entry as it is a duplicate definition of the parent node
          .forEach(([nodeName, node]) =>
            result.push(
              ...mapAirbyteNode(node, sourceName, {
                nodeName,
                requiredFields: _listOfRequiredFields,
                parentNode: { ...specNode, id: parentNode.id, parentNode },
                omitFieldRule: (config) => {
                  const parentSelectionNodeValue = parentNodeValueKey
                    .split('.')
                    .reduce((obj, key) => obj[key] || {}, config);
                  const showChildFieldIfThisParentValueSelected =
                    childrenNodesEntries[0][1]?.['const'];
                  return (
                    parentSelectionNodeValue !==
                    showChildFieldIfThisParentValueSelected
                  );
                }
              })
            )
          );
      }
      break;
    }
  }
  return result;
};

const getAirbyteSpecNodeByRef = (
  parentNode: EnrichedAirbyteSpecNode,
  ref: string
): UnknownObject | null => {
  const rootNode = getAirbyteSpecRootNode(parentNode);
  const nodesNames = ref.replace('#/', '').split('/');

  return nodesNames.reduce<UnknownObject | null>(
    (parentNode, childNodeName) => {
      if (parentNode === null) return null;
      const childNode = parentNode[childNodeName];
      try {
        assertIsObject(childNode);
        return childNode;
      } catch {
        return null;
      }
    },
    rootNode
  );
};

const getAirbyteSpecRootNode = (
  node: EnrichedAirbyteSpecNode
): EnrichedAirbyteSpecNode => {
  const grandparent = node?.parentNode?.parentNode;
  if (!grandparent) return node;

  return getAirbyteSpecRootNode(node.parentNode);
};

const getEntriesFromPropertiesField = (node: unknown): [string, unknown][] => {
  const subNodes = node['properties'] as unknown;
  assertIsObject(subNodes);
  let entries = Object.entries(subNodes) as [string, unknown][];
  const isOrdered = entries[0][1]?.['order'];
  if (isOrdered)
    entries = entries.sort((a, b) => +a[1]?.['order'] - +b[1]?.['order']);
  return entries;
};

const getEntriesFromOneOfField = (
  node: unknown,
  nodeName: string
): [string, object][] => {
  const subNodes = node['oneOf'] as unknown;

  // array assertion must fail here
  assertIsArrayOfTypes(subNodes, new Object());

  return Object.entries(subNodes).map(([idx, subNode]) => [
    `${nodeName}-option-${idx}`,
    subNode
  ]);
};
