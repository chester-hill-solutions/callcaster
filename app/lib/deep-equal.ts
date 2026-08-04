/**
 * Deep equality check with cycle detection via a WeakMap of seen object pairs.
 */
export function deepEqual(
  obj1: unknown,
  obj2: unknown,
  path: string = "root",
  seen = new WeakMap<object, object>(),
): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) {
    return false;
  }
  if (typeof obj1 !== "object" && typeof obj2 !== "object") {
    return obj1 === obj2;
  }

  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  }
  if (obj1 instanceof RegExp && obj2 instanceof RegExp) {
    return obj1.toString() === obj2.toString();
  }

  const type1 = Object.prototype.toString.call(obj1);
  const type2 = Object.prototype.toString.call(obj2);
  if (type1 !== type2) {
    return false;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      return false;
    }
    return obj1.every((item, index) =>
      deepEqual(item, obj2[index], `${path}[${index}]`, seen),
    );
  }

  const object1 = obj1 as Record<string, unknown>;
  const object2 = obj2 as Record<string, unknown>;

  if (seen.get(object1) === object2) return true;
  seen.set(object1, object2);

  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);

  if (keys1.length !== keys2.length) {
    return false;
  }

  return keys1.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(object2, key)) {
      return false;
    }
    return deepEqual(object1[key], object2[key], `${path}.${key}`, seen);
  });
}
