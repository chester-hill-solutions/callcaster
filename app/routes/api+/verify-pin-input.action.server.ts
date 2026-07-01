import { data as routeData } from "react-router";

export const action = async () => {
  return routeData(
    { error: "Audio PIN verification has been retired. Use call-in verification instead." },
    { status: 410 },
  );
};
