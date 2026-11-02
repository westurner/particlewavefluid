import { createContext, useContext, useEffect, useState } from 'react';

const ParameterDescriptionsContext = createContext(null);
let parameterSchemaPromise;

export function ParameterDescriptionsProvider({ simulationId, children }) {
  const [schema, setSchema] = useState(null);
  useEffect(() => {
    let active = true;
    parameterSchemaPromise ??= import('../../docs/schemas/simulators.parameters.schema.json')
      .then(({ default: registry }) => registry)
      .catch(() => null);
    parameterSchemaPromise.then((registry) => {
      if (active) setSchema(registry?.$defs?.[simulationId] ?? null);
    });
    return () => { active = false; };
  }, [simulationId]);
  return <ParameterDescriptionsContext.Provider value={schema}>{children}</ParameterDescriptionsContext.Provider>;
}

export function useParameterSchema() {
  return useContext(ParameterDescriptionsContext);
}