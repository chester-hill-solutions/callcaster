import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Welcome!</h1>
      <ul>
        <li>
          <Link to={"/signin"}>
            Sign In
          </Link>
        </li>
        <li>
          <Link to={"/signup"}>
            Sign Up
          </Link>
        </li>

      </ul>
    </div>
  );
}
