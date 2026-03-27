export function isOtherDataArray(
  value: unknown,
): value is Array<{ key: string; value: unknown }> {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "key" in item &&
        "value" in item,
    )
  );
}

export const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomStr}`;
};
