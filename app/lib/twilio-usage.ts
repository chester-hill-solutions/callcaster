export type TwilioUsageRecord = {
  category: string;
  description: string;
  usage: string;
  usageUnit: string;
  price: string;
  startDate?: string;
  endDate?: string;
};

export type TwilioUsageGroupDetail = {
  description: string;
  usage: string;
  usageUnit: string;
  price: string;
};

export type TwilioUsageGroup = {
  usage: number;
  price: number;
  details: TwilioUsageGroupDetail[];
};

const SUPPRESSED_CATEGORY_DESCENDANTS: Record<string, string[]> = {
  sms: ["sms-inbound", "sms-outbound"],
  "sms-inbound": ["sms-inbound-"],
  "sms-outbound": ["sms-outbound-"],
  mms: ["mms-inbound", "mms-outbound"],
  "mms-inbound": ["mms-inbound-"],
  "mms-outbound": ["mms-outbound-"],
  calls: ["calls-inbound", "calls-outbound"],
  "calls-inbound": ["calls-inbound-"],
  "calls-outbound": ["calls-outbound-"],
  phonenumbers: ["phonenumbers-local", "phonenumbers-mobile", "phonenumbers-tollfree"],
  channels: ["channels-"],
};

function formatTwilioUsageDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function shouldSuppressSummaryCategory(category: string, categories: Set<string>): boolean {
  const childPrefixes = SUPPRESSED_CATEGORY_DESCENDANTS[category];
  if (!childPrefixes) {
    return false;
  }

  return childPrefixes.some((prefix) =>
    Array.from(categories).some((candidate) => candidate !== category && candidate.startsWith(prefix)),
  );
}

function getUsageGroupCategory(category: string): string {
  if (
    category === "sms-messages-carrierfees" ||
    category === "mms-messages-carrierfees"
  ) {
    return "Carrier Fees";
  }

  if (category === "failed-message-processing-fee") {
    return "Failed Messages";
  }

  if (
    category === "sms" ||
    category.startsWith("bundle-sms") ||
    category.startsWith("sms-inbound") ||
    category.startsWith("sms-outbound")
  ) {
    return "SMS";
  }

  if (
    category === "mms" ||
    category.startsWith("mms-inbound") ||
    category.startsWith("mms-outbound")
  ) {
    return "MMS";
  }

  if (
    category === "calls" ||
    category.startsWith("calls-inbound") ||
    category.startsWith("calls-outbound")
  ) {
    return "Voice";
  }

  if (
    category === "phonenumbers" ||
    category.startsWith("phonenumbers-")
  ) {
    return "Phone Numbers";
  }

  if (category === "channels" || category.startsWith("channels-")) {
    return "Channels";
  }

  return "Other";
}

export function getTwilioUsageDateRange(referenceDate = new Date()) {
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  startDate.setUTCDate(startDate.getUTCDate() - 30);

  return {
    startDate: formatTwilioUsageDate(startDate),
    endDate: formatTwilioUsageDate(endDate),
  };
}

export function groupTwilioUsageData(usageData: TwilioUsageRecord[]) {
  const nonZeroRecords = usageData.filter(
    (record) => !(record.usage === "0" && record.price === "0"),
  );
  const categories = new Set(nonZeroRecords.map((record) => record.category));

  const groupedUsage = nonZeroRecords.reduce<Record<string, TwilioUsageGroup>>((acc, record) => {
    if (record.category === "totalprice") {
      return acc;
    }

    if (shouldSuppressSummaryCategory(record.category, categories)) {
      return acc;
    }

    const mainCategory = getUsageGroupCategory(record.category);
    if (!acc[mainCategory]) {
      acc[mainCategory] = {
        usage: 0,
        price: 0,
        details: [],
      };
    }

    const categoryBucket = acc[mainCategory];
    const usage = Number.parseFloat(record.usage) || 0;
    const price = Number.parseFloat(record.price) || 0;

    categoryBucket.usage += usage;
    categoryBucket.price = roundCurrency(categoryBucket.price + price);

    if (usage > 0 || price > 0) {
      categoryBucket.details.push({
        description: record.description,
        usage: record.usage,
        usageUnit: record.usageUnit,
        price: record.price,
      });
    }

    return acc;
  }, {});

  const totalPrice = roundCurrency(
    Object.values(groupedUsage).reduce((sum, group) => sum + group.price, 0),
  );

  return {
    groupedUsage,
    totalPrice,
  };
}
