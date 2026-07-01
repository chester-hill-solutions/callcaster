import { data as routeData } from "react-router";

export const loader = async () => {
  return routeData(
    { error: "Audio PIN verification has been retired. Use call-in verification instead." },
    { status: 410 },
  );
};
