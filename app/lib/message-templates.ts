import type { Contact } from "@/lib/types";

/**
 * Process template tags in message text by replacing them with contact data.
 */
export function processTemplateTags(text: string, contact: Contact): string {
  if (!text || !contact) return text;

  const processBraces = (input: string): string => {
    return input.replace(/\{\s*([a-zA-Z0-9_]+)(?:\|([^}]+))?\s*\}/g, (_match, field, fallback) => {
      let value = "";
      switch (field) {
        case "firstname":
          value = contact.firstname || "";
          break;
        case "surname":
          value = contact.surname || "";
          break;
        case "fullname":
          value = contact.fullname || `${contact.firstname || ""} ${contact.surname || ""}`.trim();
          break;
        case "phone":
          value = contact.phone || "";
          break;
        case "email":
          value = contact.email || "";
          break;
        case "address":
          value = contact.address || "";
          break;
        case "city":
          value = contact.city || "";
          break;
        case "province":
          value = contact.province || "";
          break;
        case "postal":
          value = contact.postal || "";
          break;
        case "country":
          value = contact.country || "";
          break;
        case "external_id":
          value = contact.external_id || "";
          break;
        default:
          value = "";
      }
      if (!value && typeof fallback === "string") {
        return fallback.trim();
      }
      return value || "";
    });
  };

  const processFunctions = (input: string): string => {
    return input.replace(/btoa\(([^)]*)\)/g, (_match, inner) => {
      const processed = processBraces(inner);
      try {
        return typeof window !== "undefined" && window.btoa
          ? window.btoa(processed)
          : Buffer.from(processed, "utf-8").toString("base64");
      } catch {
        return "";
      }
    });
  };

  let result = processFunctions(text);
  result = processBraces(result);
  return result;
}
