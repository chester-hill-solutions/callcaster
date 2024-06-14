import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
export async function loader({ request, params }: LoaderFunctionArgs) {
  return redirect("/signin", 301);
}

export default function Login() {
  return (
    <div className="flex h-full w-full items-center justify-center font-Zilla-Slab text-3xl font-bold text-black dark:text-white">
      Redirecting you to the Sign In page...
    </div>
  );
}
