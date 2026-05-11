import type { z } from "zod";
import type { NodeType } from "../types";
import leadSchema from "./lead";
import contactSchema from "./contact";
import dealSchema from "./deal";
import projectSchema from "./project";
import towerSchema from "./tower";
import propertySchema from "./property";
import unitSchema from "./unit";
import siteVisitSchema from "./site_visit";
import callSchema from "./call";
import activitySchema from "./activity";
import documentSchema from "./document";
import noteSchema from "./note";

const SCHEMAS: Record<NodeType, z.ZodTypeAny> = {
  lead: leadSchema,
  contact: contactSchema,
  deal: dealSchema,
  project: projectSchema,
  tower: towerSchema,
  property: propertySchema,
  unit: unitSchema,
  site_visit: siteVisitSchema,
  call: callSchema,
  activity: activitySchema,
  document: documentSchema,
  note: noteSchema,
};

/**
 * Returns the Zod schema for a given node_type. Throws on unknown type —
 * call sites pass values that come from the NodeType literal union, so an
 * unknown type at runtime indicates a bug, not a user error.
 */
export function nodeSchemaFor(type: NodeType): z.ZodTypeAny {
  const schema = SCHEMAS[type];
  if (!schema) throw new Error(`Unknown node_type: ${type}`);
  return schema;
}

export {
  leadSchema,
  contactSchema,
  dealSchema,
  projectSchema,
  towerSchema,
  propertySchema,
  unitSchema,
  siteVisitSchema,
  callSchema,
  activitySchema,
  documentSchema,
  noteSchema,
};
