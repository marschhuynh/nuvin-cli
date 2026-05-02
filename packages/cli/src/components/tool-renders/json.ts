import type { JsonObject, JsonValue } from "@nuvin/nuvin-core/shared";

export function jsonObject(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}

export function stringProp(input: JsonObject | undefined, key: string): string | undefined {
  const value = input?.[key];
  return typeof value === "string" ? value : undefined;
}

export function numberProp(input: JsonObject | undefined, key: string): number | undefined {
  const value = input?.[key];
  return typeof value === "number" ? value : undefined;
}

export function booleanProp(input: JsonObject | undefined, key: string): boolean | undefined {
  const value = input?.[key];
  return typeof value === "boolean" ? value : undefined;
}
