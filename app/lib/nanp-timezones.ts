/**
 * NANP area code → IANA timezone, for recipient-local calling-window
 * enforcement (TCPA/CRTC style 8am–9pm windows are defined in the
 * *recipient's* local time).
 *
 * Granularity: one zone per area code, chosen as the zone covering the large
 * majority of the code's geography. A handful of codes straddle a boundary
 * (e.g. 850 FL panhandle, 219 NW Indiana, 915 El Paso are mapped to their
 * dominant non-state-default zone; slivers inside 250/306/605/701/906 are
 * accepted as ±1h approximations — the same trade-off every commercial
 * dialer makes for area-code-based windows).
 *
 * Codes deliberately absent (toll-free 8xx, premium 900, unlisted Caribbean
 * members, and any future overlays not yet added) resolve to null, and the
 * caller must fall back to the conservative all-zones window — unknown
 * degrades SAFE, never permissive. When adding overlays, add them to the
 * zone group of their parent code.
 */

const ZONE_GROUPS: Record<string, readonly string[]> = {
  // ————— Canada —————
  "America/St_Johns": ["709", "879"],
  "America/Halifax": ["902", "782", "506", "428"],
  "America/Winnipeg": ["204", "431", "584"],
  // Saskatchewan observes no DST.
  "America/Regina": ["306", "639", "474"],
  // 867 spans YT/NWT/NU; Mountain (Yellowknife/Whitehorse) dominates.
  "America/Edmonton": ["403", "587", "780", "825", "368", "867"],
  "America/Vancouver": ["604", "778", "236", "672", "250", "257"],

  // ————— US Eastern + Eastern Canada (ON/QC) —————
  "America/Toronto": [
    // Ontario
    "416", "647", "437", "365", "905", "289", "613", "343", "753", "705",
    "249", "683", "807", "519", "226", "548", "382", "742",
    // Quebec
    "514", "438", "263", "450", "579", "354", "418", "581", "367", "819", "873",
  ],
  "America/New_York": [
    // CT / DC / DE
    "203", "475", "860", "959", "202", "771", "302",
    // Florida (peninsula)
    "239", "305", "321", "324", "352", "386", "407", "561", "645", "656",
    "689", "727", "728", "754", "772", "786", "813", "863", "904", "941", "954",
    // Georgia
    "229", "404", "470", "478", "678", "706", "762", "770", "912", "943",
    // Indiana (Eastern-time majority)
    "260", "317", "463", "574", "765", "812", "930",
    // Kentucky (Eastern)
    "502", "606", "859",
    // Massachusetts / Maryland / Maine
    "339", "351", "413", "508", "617", "774", "781", "857", "978",
    "240", "301", "410", "443", "667", "207",
    // Michigan
    "231", "248", "269", "313", "517", "586", "616", "679", "734", "810",
    "906", "947", "989",
    // North Carolina / New Hampshire
    "252", "336", "472", "704", "743", "828", "910", "919", "980", "984", "603",
    // New Jersey
    "201", "551", "609", "640", "732", "848", "856", "862", "908", "973",
    // New York
    "212", "315", "329", "332", "347", "363", "516", "518", "585", "607",
    "631", "646", "680", "716", "718", "838", "845", "914", "917", "929", "934",
    // Ohio
    "216", "220", "234", "283", "326", "330", "380", "419", "440", "513",
    "567", "614", "740", "937",
    // Pennsylvania
    "215", "223", "267", "272", "412", "445", "484", "570", "582", "610",
    "717", "724", "814", "835", "878",
    // RI / SC
    "401", "803", "821", "839", "843", "854", "864",
    // Tennessee (Eastern)
    "423", "865",
    // Virginia / Vermont / West Virginia
    "276", "434", "540", "571", "686", "703", "757", "804", "826", "948",
    "802", "304", "681",
  ],

  // ————— US Central —————
  "America/Chicago": [
    // Alabama / Arkansas
    "205", "251", "256", "334", "659", "938", "327", "479", "501", "870",
    // Florida panhandle
    "448", "850",
    // Iowa / Illinois
    "319", "515", "563", "641", "712",
    "217", "224", "309", "312", "331", "447", "464", "618", "630", "708",
    "730", "773", "779", "815", "847", "861", "872",
    // Indiana (NW) / Kansas / Kentucky (Western)
    "219", "316", "620", "785", "913", "270", "364",
    // Louisiana / Minnesota
    "225", "318", "337", "457", "504", "985",
    "218", "320", "507", "612", "651", "763", "924", "952",
    // Missouri / Mississippi
    "235", "314", "417", "557", "573", "636", "660", "816", "975",
    "228", "601", "662", "769",
    // ND / NE / OK / SD
    "701", "308", "402", "531", "405", "539", "572", "580", "918", "605",
    // Tennessee (Central)
    "615", "629", "731", "901", "931",
    // Texas (all but El Paso)
    "210", "214", "254", "281", "325", "346", "361", "409", "430", "432",
    "469", "512", "621", "682", "713", "726", "737", "806", "817", "830",
    "832", "903", "936", "940", "945", "956", "972", "979",
    // Wisconsin
    "262", "274", "353", "414", "534", "608", "715", "920",
  ],

  // ————— US Mountain —————
  "America/Denver": [
    "303", "719", "720", "748", "970", "983", // Colorado
    "208", "986", // Idaho
    "406", // Montana
    "505", "575", // New Mexico
    "915", // El Paso TX
    "385", "435", "801", // Utah
    "307", // Wyoming
  ],
  // Arizona observes no DST (outside the Navajo Nation).
  "America/Phoenix": ["480", "520", "602", "623", "928"],

  // ————— US Pacific —————
  "America/Los_Angeles": [
    // California
    "209", "213", "279", "310", "323", "341", "350", "408", "415", "424",
    "442", "510", "530", "559", "562", "619", "626", "628", "650", "657",
    "661", "669", "707", "714", "738", "747", "760", "805", "818", "820",
    "831", "840", "858", "909", "916", "925", "949", "951",
    // Nevada / Oregon / Washington
    "702", "725", "775",
    "458", "503", "541", "971",
    "206", "253", "360", "425", "509", "564",
  ],

  // ————— Alaska / Hawaii / territories / Caribbean NANP members —————
  "America/Anchorage": ["907"],
  "Pacific/Honolulu": ["808"],
  "America/Puerto_Rico": ["787", "939", "340"],
  "America/Santo_Domingo": ["809", "829", "849"],
  "America/Jamaica": ["658", "876"],
  "America/Nassau": ["242"],
  "America/Port_of_Spain": ["868"],
  "Atlantic/Bermuda": ["441"],
  "Pacific/Guam": ["671", "670"],
  "Pacific/Pago_Pago": ["684"],
};

function buildAreaCodeIndex(): Record<string, string> {
  const index: Record<string, string> = {};
  for (const [zone, codes] of Object.entries(ZONE_GROUPS)) {
    for (const code of codes) {
      if (index[code]) {
        throw new Error(
          `NANP area code ${code} mapped to both ${index[code]} and ${zone}`,
        );
      }
      index[code] = zone;
    }
  }
  return index;
}

/** Area code (3 digits, as a string) → IANA timezone. */
export const NANP_AREA_CODE_TIMEZONES: Readonly<Record<string, string>> =
  buildAreaCodeIndex();
